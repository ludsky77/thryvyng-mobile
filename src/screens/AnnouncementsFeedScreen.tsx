import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { startOfWeek } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useMessages } from '../hooks/useMessages';
import { useChatSenderLabels } from '../hooks/useChatSenderLabels';
import { requestChatUnreadRefresh } from '../hooks/useTotalChatUnread';
import { logError } from '../utils/logError';
import { formatDayDivider } from '../utils/chatDays';
import { CHAT_FALLBACK_NAME, chatPersonName } from '../lib/memberNames';
import { isChannelStaff } from '../lib/channelStaff';
import { PollCard } from '../components/chat/PollCard';
import SurveyChatCard from '../components/chat/SurveyChatCard';
import { setActiveChannelId } from '../services/notifications';
import {
  CLUB_ANNOUNCEMENTS_MISSING_MESSAGE,
  CLUB_ANNOUNCEMENTS_UNREACHABLE_MESSAGE,
  announcementsChatName,
  getClubAnnouncementsChannel,
} from '../lib/clubAnnouncements';
import { MegaphoneIcon } from '../components/chat/MegaphoneIcon';
import {
  ANNOUNCEMENTS_SETUP_PENDING_DETAIL,
  ANNOUNCEMENTS_SETUP_PENDING_MESSAGE,
  checkAnnouncementContract,
  splitAnnouncement,
} from '../lib/clubAnnouncementCards';
import type { Message } from '../types';

/**
 * The club's announcements, as a FEED OF CARDS — ruling 2026-11-03 01:57.
 *
 * WHAT THIS SCREEN IS NOT: it is not a chat room. There is no composer, no
 * reply, no swipe-reply and no bubble list. The channel underneath is the
 * club's one default `club` channel and its rows are ordinary `comm_messages`
 * (recon §B6) — what changed is only how they are drawn, which is why this
 * screen reuses `useMessages` whole rather than growing a second message
 * fetch. Realtime inserts, the reaction reconcile and the edit/soft-delete
 * UPDATE stream all come with it.
 *
 * WHICH CHANNEL. `channelId` when a caller already holds one (the chat list
 * row, a push tap, the compose screen). Otherwise `clubId` and the ONE shared
 * lookup, `getClubAnnouncementsChannel` — `channel_type = 'club' AND
 * is_default AND club_id = <this club>`, never a name (recon §FC-1, and the
 * module's own header).
 *
 * THE "NEW" BADGE IS A SNAPSHOT, and it has to be. Read state in this app is
 * per CHANNEL and never per message (recon §B9: `comm_channel_members
 * .last_read_at`, and a per-message table is SACRED and bigger than the rest
 * of this feature put together). So the stamp is captured ONCE, when the
 * screen opens, BEFORE the channel is marked read — after that the stamp on
 * the server is `now()` and nothing could be told apart. Everything newer than
 * the captured value, from someone else, wears the badge for as long as this
 * screen stays mounted. Reopening the feed is a new snapshot, which means the
 * badges clear on the second visit exactly as the chat list's unread count
 * does today.
 */

interface FeedParams {
  channelId?: string;
  clubId?: string;
  channelName?: string | null;
  clubName?: string | null;
}

/**
 * The narrow slice of React Navigation this screen uses.
 *
 * Spelled out rather than `any`: `RootStackParamList`
 * (src/navigation/linking.ts) is the DEEP-LINK list and does not carry the
 * chat stack, so there is nothing app-wide to borrow — the same reason
 * `ChannelPollsScreen` declares its own route type instead of reaching for
 * `useNavigation<any>()`.
 */
interface AnnouncementNavigation {
  navigate: (name: string, params?: object) => void;
  goBack: () => void;
}


/** The three things that can be wrong before a single card can be drawn. */
type ChannelState =
  | { status: 'resolving' }
  | { status: 'ready'; channelId: string; name: string | null }
  | { status: 'missing' }
  | { status: 'unreachable' };

/** `all` is every announcement; `new` is only what this viewer has not read. */
type FeedFilter = 'all' | 'new';

/** One rendered row: a section heading, or a card. */
type FeedRow =
  | { kind: 'heading'; key: string; label: string }
  | { kind: 'card'; key: string; message: Message; isNew: boolean };

/**
 * The unread floor, in the SERVER'S own terms.
 *
 * `get_my_conversations` counts a message as unread when
 * `user_id <> me AND created_at > COALESCE(last_read_at, now() - 30 days)`
 * (recon §B9). The same two rules are applied here so the badge on a card and
 * the number on the chat list row cannot disagree about one message.
 */
function unreadFloor(lastReadAt: string | null): number {
  if (lastReadAt) {
    const parsed = new Date(lastReadAt).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now() - 30 * 24 * 60 * 60 * 1000;
}

export default function AnnouncementsFeedScreen({
  route,
  navigation,
}: {
  route: { params?: FeedParams };
  navigation: AnnouncementNavigation;
}) {
  const params: FeedParams = route?.params ?? {};
  const { user } = useAuth();

  const [channelState, setChannelState] = useState<ChannelState>(() =>
    params.channelId
      ? { status: 'ready', channelId: params.channelId, name: params.channelName ?? null }
      : { status: 'resolving' }
  );
  const channelId =
    channelState.status === 'ready' ? channelState.channelId : null;

  const [clubName, setClubName] = useState<string | null>(params.clubName ?? null);
  const [isStaffHere, setIsStaffHere] = useState<boolean | undefined>(undefined);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  /** `null` until the contract probe answers. */
  const [contractPending, setContractPending] = useState<boolean | null>(null);
  /**
   * The captured `last_read_at`, in ms. `undefined` while the read is in
   * flight: no card wears a badge until the snapshot exists, because the
   * alternative is every card flashing NEW on open.
   */
  const [newSince, setNewSince] = useState<number | undefined>(undefined);
  /** One snapshot per mount, never per focus. */
  const snapshotTakenRef = useRef(false);

  const markChannelAsRead = useCallback(() => {
    if (!channelId || !user?.id) return;
    supabase
      .from('comm_channel_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .then(({ error }) => {
        if (error) {
          logError('AnnouncementsFeed.markChannelAsRead', error, { channelId });
          return;
        }
        // Same as the chat room: re-count immediately so the tab badge and the
        // app icon drop now rather than after the hook's 3 s debounce.
        requestChatUnreadRefresh();
      });
  }, [channelId, user?.id]);

  const { messages, loading, refetch } = useMessages(channelId, markChannelAsRead);
  const { memberNames, labelKind } = useChatSenderLabels(channelId, null);

  /* ── which channel ──────────────────────────────────────────────────── */

  useEffect(() => {
    if (params.channelId || !params.clubId) return;
    let alive = true;
    setChannelState({ status: 'resolving' });
    (async () => {
      const { data, error } = await getClubAnnouncementsChannel(params.clubId as string);
      if (!alive) return;
      if (error) {
        logError('AnnouncementsFeed.resolveChannel', error, { clubId: params.clubId });
        setChannelState({ status: 'unreachable' });
        return;
      }
      if (!data) {
        setChannelState({ status: 'missing' });
        return;
      }
      setChannelState({ status: 'ready', channelId: data.id, name: data.name });
    })();
    return () => {
      alive = false;
    };
  }, [params.channelId, params.clubId]);

  /** The header's second line. Read only when a caller did not pass it. */
  useEffect(() => {
    if (clubName || !channelId) return;
    let alive = true;
    (async () => {
      const { data: channel } = await supabase
        .from('comm_channels')
        .select('club_id')
        .eq('id', channelId)
        .maybeSingle();
      const clubId = (channel as { club_id?: string | null } | null)?.club_id;
      if (!alive || !clubId) return;
      const { data: club } = await supabase
        .from('clubs')
        .select('name')
        .eq('id', clubId)
        .maybeSingle();
      // Cosmetic only: a failed read leaves the subtitle off and changes
      // nothing about which channel is shown.
      if (alive) setClubName((club as { name?: string | null } | null)?.name ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [channelId, clubName]);

  /* ── the two server questions ───────────────────────────────────────── */

  // Who may compose. The server's `is_channel_staff` and nothing else — the
  // same answer the `msg_insert` policy asks (FND-4d3). `undefined` while it
  // is in flight, and every gate reads that as NOT staff, so the button
  // appears when the answer arrives rather than flashing for someone who may
  // not have it.
  useEffect(() => {
    if (!channelId) {
      setIsStaffHere(undefined);
      return;
    }
    let cancelled = false;
    setIsStaffHere(undefined);
    isChannelStaff(channelId).then((answer) => {
      if (!cancelled) setIsStaffHere(answer);
    });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  // Is the server side applied? Until it is, the cards have nowhere to read a
  // title or a button from, so the screen says so plainly instead of drawing a
  // feed of first-lines and silently dropping every button.
  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    (async () => {
      const state = await checkAnnouncementContract(channelId);
      if (cancelled) return;
      if (state.status === 'error') {
        // NOT "being set up": we could not ask. The feed still renders from
        // the message rows, which do not need the new objects.
        logError('AnnouncementsFeed.contract', state.error, { channelId });
        setContractPending(false);
        return;
      }
      setContractPending(state.status === 'pending');
    })();
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  /* ── read state ─────────────────────────────────────────────────────── */

  // THE SNAPSHOT, then the stamp — in that order, and once per mount.
  useEffect(() => {
    if (!channelId || !user?.id || snapshotTakenRef.current) return;
    snapshotTakenRef.current = true;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('comm_channel_members')
        .select('last_read_at')
        .eq('channel_id', channelId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        // No snapshot means no badges, which is the safe way to be wrong: the
        // feed is complete and nothing is falsely marked unread.
        logError('AnnouncementsFeed.readSnapshot', error, { channelId });
      }
      if (!alive) return;
      setNewSince(
        unreadFloor(
          (data as { last_read_at?: string | null } | null)?.last_read_at ?? null
        )
      );
      markChannelAsRead();
    })();
    return () => {
      alive = false;
    };
  }, [channelId, user?.id, markChannelAsRead]);

  // A reopened feed marks read again, exactly as the chat room does, and
  // suppresses the foreground banner for the channel being read.
  useFocusEffect(
    useCallback(() => {
      markChannelAsRead();
      setActiveChannelId(channelId ?? null);
      return () => setActiveChannelId(null);
    }, [markChannelAsRead, channelId])
  );

  /* ── rows ───────────────────────────────────────────────────────────── */

  /** Newest first. `useMessages` returns ascending, for an inverted bubble list. */
  const newestFirst = useMemo(() => [...messages].reverse(), [messages]);

  const isNewMessage = useCallback(
    (message: Message) => {
      if (newSince === undefined) return false;
      if (message.user_id === user?.id) return false;
      const created = new Date(message.created_at).getTime();
      return !Number.isNaN(created) && created > newSince;
    },
    [newSince, user?.id]
  );

  const newCount = useMemo(
    () => newestFirst.filter(isNewMessage).length,
    [newestFirst, isNewMessage]
  );

  /**
   * This week / Earlier, with the headings inlined as rows.
   *
   * "This week" is the reader's own calendar week, from `startOfWeek` — not a
   * rolling seven days, because a heading that says "This week" on a Monday
   * must not still be showing last Tuesday.
   */
  const rows = useMemo<FeedRow[]>(() => {
    const visible =
      filter === 'new' ? newestFirst.filter(isNewMessage) : newestFirst;
    const weekStart = startOfWeek(new Date()).getTime();
    const out: FeedRow[] = [];
    let section: 'week' | 'earlier' | null = null;

    for (const message of visible) {
      const created = new Date(message.created_at).getTime();
      const next: 'week' | 'earlier' =
        !Number.isNaN(created) && created >= weekStart ? 'week' : 'earlier';
      if (next !== section) {
        section = next;
        out.push({
          kind: 'heading',
          key: `heading-${next}`,
          label: next === 'week' ? 'This week' : 'Earlier',
        });
      }
      out.push({
        kind: 'card',
        key: message.id,
        message,
        isNew: isNewMessage(message),
      });
    }
    return out;
  }, [filter, newestFirst, isNewMessage]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const openDetail = (message: Message) => {
    if (!channelId) return;
    navigation.navigate('AnnouncementDetail', {
      channelId,
      messageId: message.id,
    });
  };

  const openCompose = () => {
    if (!channelId) return;
    navigation.navigate('ComposeAnnouncement', {
      channelId,
      channelName: channelState.status === 'ready' ? channelState.name : null,
      clubName,
    });
  };

  /* ── render ─────────────────────────────────────────────────────────── */

  /**
   * R-01 (Lu, 2026-11-04): the title is NOT the channel's `name`. Every
   * channel this screen can open is the club's one default `club` channel —
   * that is how it finds it — and that row is named `club-announcements`, a
   * slug families were reading off the header. So the club's own name decides
   * what it says: "PAC Announcements". Display only; the row is untouched.
   */
  const headerTitle = announcementsChatName(clubName);

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => navigation.goBack()}
      >
        <Feather name="arrow-left" size={24} color="#fff" />
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        {/* R-01: the megaphone takes the round badge spot a team chat gives
            its club crest — `TeamChatRoomScreen`'s `headerCrest`, same 18pt
            circle, same place in the title row. */}
        <View style={styles.headerTitleRow}>
          <View style={styles.headerBadge}>
            <MegaphoneIcon size={12} color="#fff" />
          </View>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitle}
          </Text>
        </View>
        {clubName ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {clubName}
          </Text>
        ) : null}
      </View>
      {/* The compose door. Gated on the SERVER's answer, so it is absent while
          the question is in flight rather than offered and then withdrawn. */}
      {isStaffHere === true ? (
        <TouchableOpacity
          style={styles.headerButton}
          onPress={openCompose}
          accessibilityLabel="New announcement"
        >
          <Feather name="edit-3" size={22} color="#fff" />
        </TouchableOpacity>
      ) : (
        <View style={styles.headerButton} />
      )}
    </View>
  );

  const renderCard = (message: Message, isNew: boolean) => {
    // A poll keeps the card it already has (recon §P-5): one branch, the
    // existing component, no second renderer and no extra query.
    if (message.message_type === 'poll' && message.poll_id) {
      return (
        <View style={styles.pollWrap}>
          <PollCard pollId={message.poll_id} compact />
        </View>
      );
    }

    /*
     * A SHARED SURVEY, same treatment as a poll: the card it already has, and
     * no second renderer. Without this branch the feed drew the row through
     * the announcement card below, whose text is the message CONTENT — and a
     * share's content is now `[SURVEY:<uuid>] <title>`, so a survey in a club
     * chat would have read out its own marker as the headline.
     *
     * The card carries its own Respond CTA and resolves to nothing when the
     * share row is missing, so there is no tap-through to a detail screen and
     * nothing to show for a `'survey'` row that never got its share row.
     */
    if (message.message_type === 'survey') {
      return (
        <View style={styles.pollWrap}>
          <SurveyChatCard messageId={message.id} navigation={navigation} />
        </View>
      );
    }

    const { cardTitle } = splitAnnouncement(message);
    const senderName = chatPersonName(
      memberNames.get(message.user_id)?.name ??
        message.profile?.full_name ??
        CHAT_FALLBACK_NAME
    );
    const kind = labelKind.get(message.user_id) ?? null;
    const roleWord =
      kind === 'staff'
        ? 'Staff'
        : kind === 'parent'
          ? 'Parent'
          : kind === 'player'
            ? 'Player'
            : null;
    const reactions = summariseReactions(message);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => openDetail(message)}
      >
        <View style={styles.cardTopRow}>
          <Text style={styles.cardDate}>{formatDayDivider(message.created_at)}</Text>
          {isNew ? (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>NEW</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {cardTitle}
        </Text>
        <Text style={styles.cardSender} numberOfLines={1}>
          {roleWord ? `${senderName} · ${roleWord}` : senderName}
        </Text>
        {reactions.length > 0 ? (
          <View style={styles.cardReactions}>
            {reactions.map((r) => (
              <View key={r.emoji} style={styles.reactionBadge}>
                <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                <Text style={styles.reactionCount}>{r.count}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  if (channelState.status === 'resolving') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </SafeAreaView>
    );
  }

  if (channelState.status !== 'ready') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.centered}>
          <Feather name="inbox" size={40} color="#475569" />
          <Text style={styles.emptyTitle}>
            {channelState.status === 'missing'
              ? CLUB_ANNOUNCEMENTS_MISSING_MESSAGE
              : CLUB_ANNOUNCEMENTS_UNREACHABLE_MESSAGE}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (contractPending) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.centered}>
          <Feather name="tool" size={40} color="#475569" />
          <Text style={styles.emptyTitle}>
            {ANNOUNCEMENTS_SETUP_PENDING_MESSAGE}
          </Text>
          <Text style={styles.emptyBody}>
            {ANNOUNCEMENTS_SETUP_PENDING_DETAIL}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header}

      <View style={styles.filterRow}>
        {(['all', 'new'] as FeedFilter[]).map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.filterTab, filter === option && styles.filterTabActive]}
            onPress={() => setFilter(option)}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === option && styles.filterTabTextActive,
              ]}
            >
              {option === 'all' ? 'All' : `New${newCount > 0 ? ` (${newCount})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && messages.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#8b5cf6"
            />
          }
          renderItem={({ item }) =>
            item.kind === 'heading' ? (
              <Text style={styles.sectionHeading}>{item.label}</Text>
            ) : (
              renderCard(item.message, item.isNew)
            )
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Feather name="inbox" size={40} color="#475569" />
              <Text style={styles.emptyTitle}>
                {filter === 'new' ? 'Nothing new' : 'No announcements yet'}
              </Text>
              {filter === 'new' ? (
                <Text style={styles.emptyBody}>
                  You have read everything in this feed.
                </Text>
              ) : null}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

/**
 * The card's reaction row: one chip per emoji with its count.
 *
 * READ ONLY on the card. Tapping a chip opens the announcement rather than
 * toggling, so a scroll through the feed cannot leave a reaction behind by
 * accident; the detail screen is where reacting happens.
 */
function summariseReactions(
  message: Message
): Array<{ emoji: string; count: number }> {
  const byEmoji = new Map<string, number>();
  for (const r of message.reactions ?? []) {
    const emoji = r.reaction ?? r.emoji ?? '';
    if (!emoji) continue;
    byEmoji.set(emoji, (byEmoji.get(emoji) ?? 0) + 1);
  }
  return [...byEmoji.entries()].map(([emoji, count]) => ({ emoji, count }));
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** The title and its badge on one line (`TeamChatRoomScreen.headerTitleRow`). */
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  /**
   * The megaphone's round badge spot — R-01. An 18pt circle, which is the size
   * a team chat's club crest takes in this same place, in the channel colour
   * the chat list already gives this row (`getChannelColor`'s `club` arm).
   */
  headerBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#C4976D',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterTab: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#1e293b',
  },
  filterTabActive: {
    backgroundColor: '#8b5cf6',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94a3b8',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#64748b',
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    /* The tan the chat list already uses for club / announcement rows
       (ChatScreen.getChannelColor), so the feed and its row match. */
    borderLeftColor: '#C4976D',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardDate: {
    fontSize: 12,
    color: '#94a3b8',
  },
  newBadge: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#fff',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f1f5f9',
    lineHeight: 22,
  },
  cardSender: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 6,
  },
  cardReactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 3,
  },
  reactionEmoji: {
    fontSize: 12,
  },
  reactionCount: {
    fontSize: 10,
    color: '#D1D5DB',
    fontWeight: '600',
  },
  pollWrap: {
    marginBottom: 10,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#cbd5e1',
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 19,
  },
});
