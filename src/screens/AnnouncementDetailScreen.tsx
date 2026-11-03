import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useMessages } from '../hooks/useMessages';
import { useChatSenderLabels } from '../hooks/useChatSenderLabels';
import { logError } from '../utils/logError';
import { formatDayDivider } from '../utils/chatDays';
import { CHAT_FALLBACK_NAME, chatPersonName } from '../lib/memberNames';
import { ReactionPicker } from '../components/chat/ReactionPicker';
import {
  ReactionDetailsModal,
  type ReactionDetailItem,
} from '../components/chat/ReactionDetailsModal';
import { PollCard } from '../components/chat/PollCard';
import SurveyChatCard from '../components/chat/SurveyChatCard';
import { playbookVisible } from '../constants/playbookLaunch';
import {
  fetchAnnouncementActions,
  splitAnnouncement,
  type AnnouncementAction,
} from '../lib/clubAnnouncementCards';
import type { Message } from '../types';

/**
 * ONE announcement, in full — ruling 2026-11-03 01:57.
 *
 * NO COMPOSER, NO REPLY, NO SWIPE-REPLY. That is the ruling, and it is also
 * what the server already does: `club-announcements` is
 * `allow_member_text = false` live, so the `msg_insert` policy refuses an
 * ordinary member's text while `comm_reactions_insert` accepts their reaction
 * on membership alone (recon §B8, §B10, both PROVEN). So "emoji reactions
 * only" needed no new rule — this screen simply does not draw the controls the
 * server would have refused.
 *
 * REACTIONS COME FROM THE EXISTING PATH, whole: `useMessages.toggleReaction`
 * (optimistic paint → persist → rollback → reconcile through the realtime
 * hub) and `ReactionPicker` (R8's six quick emoji plus the 30-emoji grid
 * behind its "+"). Nothing about reacting is re-implemented here.
 *
 * WHY THIS SCREEN LOADS THE CHANNEL AND NOT ONE ROW. `useMessages` is the only
 * reader in this app that keeps a message's reactions correct while it is on
 * screen — it refetches the shown rows on every reaction event rather than
 * trusting the event payload, which is what makes the count right under both
 * `REPLICA IDENTITY` settings (`useMessages.ts`, and recon §B8). A single-row
 * read would have to grow its own copy of that. The cost is the same 100-row
 * page the chat room already fetches, and the feed can only offer a card that
 * is inside that page, so the message asked for is always there.
 *
 * THE BUTTONS ARE NAVIGATION, NOT LINKS. Each one is an in-app
 * `navigation.navigate`, the same nested `Main → HomeTab → <screen>` shape
 * `routeNotification` uses (recon §LB-2). No `thryvyng://` URL is involved:
 * that path does not work in a store build (docs/recon/playbook-share-links.md).
 */

interface DetailParams {
  channelId?: string;
  messageId?: string;
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


export default function AnnouncementDetailScreen({
  route,
  navigation,
}: {
  route: { params?: DetailParams };
  navigation: AnnouncementNavigation;
}) {
  const { channelId, messageId }: DetailParams = route?.params ?? {};
  const { user } = useAuth();

  const { messages, loading, toggleReaction } = useMessages(channelId ?? null);
  const { memberNames, labelKind } = useChatSenderLabels(channelId ?? null, null);

  const [actions, setActions] = useState<AnnouncementAction[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(false);

  const message = useMemo<Message | null>(
    () => messages.find((m) => m.id === messageId) ?? null,
    [messages, messageId]
  );

  /**
   * The buttons on this one announcement.
   *
   * A failed read leaves the array empty and logs: a card with no buttons is a
   * complete card, so a missing actions table (the server side not applied
   * yet) costs the buttons and nothing else. An unknown `kind`, and a
   * `playbook_card` with no key-shaped target, are dropped inside
   * `fetchAnnouncementActions` — a button this build cannot navigate to must
   * not be drawn.
   */
  useEffect(() => {
    if (!messageId) return;
    let alive = true;
    (async () => {
      const { data, error } = await fetchAnnouncementActions([messageId]);
      if (!alive) return;
      if (error) {
        logError('AnnouncementDetail.actions', error, { messageId });
        setActions([]);
        return;
      }
      setActions(data.get(messageId) ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [messageId]);

  const onPickEmoji = useCallback(
    async (emoji: string) => {
      setPickerVisible(false);
      if (!message) return;
      await toggleReaction(message.id, emoji);
    },
    [message, toggleReaction]
  );

  /**
   * Where each kind goes. Nested navigate (`Main → HomeTab → <screen>`)
   * because both targets live in HomeStack and this screen is in ChatStack, so
   * the sibling cannot be resolved by name.
   *
   * `playbookVisible` is checked even though it is `true` on this branch
   * (`src/constants/playbookLaunch.ts`): the switch is the feature's kill
   * switch, and if it is ever flipped back the `Playbook` route is not
   * registered at all, so the button must be ABSENT rather than dead. It costs
   * one boolean read.
   */
  const runAction = (action: AnnouncementAction) => {
    if (action.kind === 'courses') {
      navigation.navigate('Main', {
        screen: 'HomeTab',
        params: { screen: 'Courses' },
      });
      return;
    }
    if (!playbookVisible) return;
    navigation.navigate('Main', {
      screen: 'HomeTab',
      params: {
        screen: 'Playbook',
        params: {
          // The reader opens the cover for a key its book does not hold
          // (PlaybookScreen's own fallback) — the one place that question can
          // be answered against the book this viewer was served.
          card: action.kind === 'playbook_card' ? action.target ?? undefined : undefined,
        },
      },
    });
  };

  const visibleActions = actions.filter(
    (action) => action.kind === 'courses' || playbookVisible
  );

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => navigation.goBack()}
      >
        <Feather name="arrow-left" size={24} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Announcement</Text>
      <View style={styles.headerButton} />
    </View>
  );

  if (loading && !message) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </SafeAreaView>
    );
  }

  if (!message) {
    // The row left the loaded page while this screen was open — a soft delete
    // (`useMessages` drops it on the UPDATE stream) is the only way that
    // happens from the feed.
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.centered}>
          <Feather name="inbox" size={40} color="#475569" />
          <Text style={styles.emptyTitle}>This announcement was removed</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { cardTitle, hasTitle, body } = splitAnnouncement(message);
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
  const reactions = summariseReactions(message, user?.id);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header}

      <ScrollView contentContainerStyle={styles.body}>
        {/* An untitled row's headline IS its first ~80 characters, so printing
            it above the body would repeat them. Only a row with a real `title`
            gets a headline of its own. */}
        {hasTitle ? <Text style={styles.title}>{cardTitle}</Text> : null}
        <Text style={styles.meta}>
          {roleWord ? `${senderName} · ${roleWord}` : senderName}
          {'  ·  '}
          {formatDayDivider(message.created_at)}
        </Text>

        {message.message_type === 'poll' && message.poll_id ? (
          <View style={styles.pollWrap}>
            <PollCard pollId={message.poll_id} />
          </View>
        ) : message.message_type === 'survey' ? (
          /* A shared survey's own card, not its content. The content is
             `[SURVEY:<uuid>] <title>` — the cross-app format in
             `lib/surveyShare.ts` — so printing `body` here would show the
             marker to the reader. */
          <View style={styles.pollWrap}>
            <SurveyChatCard messageId={message.id} navigation={navigation} />
          </View>
        ) : body ? (
          <Text style={styles.message}>{body}</Text>
        ) : null}

        {visibleActions.length > 0 ? (
          <View style={styles.actions}>
            {visibleActions.map((action) => (
              <TouchableOpacity
                key={`${action.kind}:${action.target ?? ''}:${action.sort_order}`}
                style={styles.actionButton}
                onPress={() => runAction(action)}
              >
                <Text style={styles.actionButtonText}>{action.label}</Text>
                <Feather name="arrow-right" size={16} color="#fff" />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* The reactions bar. A chip toggles this viewer's own reaction; a long
            press opens the who-reacted list; ☺+ opens the picker. There is no
            Reply control anywhere on this screen. */}
        <View style={styles.reactionsBar}>
          <TouchableOpacity
            style={styles.addReaction}
            onPress={() => setPickerVisible(true)}
            accessibilityLabel="Add a reaction"
          >
            <Feather name="smile" size={18} color="#cbd5e1" />
            <Text style={styles.addReactionPlus}>+</Text>
          </TouchableOpacity>
          {reactions.map((r) => (
            <TouchableOpacity
              key={r.emoji}
              style={[
                styles.reactionBadge,
                r.userReacted && styles.reactionBadgeActive,
              ]}
              onPress={() => toggleReaction(message.id, r.emoji)}
              onLongPress={() => setDetailsVisible(true)}
            >
              <Text style={styles.reactionEmoji}>{r.emoji}</Text>
              <Text style={styles.reactionCount}>{r.count}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <ReactionPicker
        visible={pickerVisible}
        onSelect={onPickEmoji}
        onClose={() => setPickerVisible(false)}
      />

      <ReactionDetailsModal
        visible={detailsVisible}
        onClose={() => setDetailsVisible(false)}
        reactions={(message.reactions ?? []) as ReactionDetailItem[]}
        nameFor={(userId) => memberNames.get(userId)?.name}
      />
    </SafeAreaView>
  );
}

/** Emoji → count, plus whether this viewer is one of them. */
function summariseReactions(
  message: Message,
  currentUserId: string | undefined
): Array<{ emoji: string; count: number; userReacted: boolean }> {
  const byEmoji = new Map<string, { count: number; userReacted: boolean }>();
  for (const r of message.reactions ?? []) {
    const emoji = r.reaction ?? r.emoji ?? '';
    if (!emoji) continue;
    const entry = byEmoji.get(emoji) ?? { count: 0, userReacted: false };
    entry.count += 1;
    if (r.user_id === currentUserId) entry.userReacted = true;
    byEmoji.set(emoji, entry);
  }
  return [...byEmoji.entries()].map(([emoji, v]) => ({ emoji, ...v }));
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  body: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f8fafc',
    lineHeight: 29,
  },
  meta: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 8,
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    color: '#e2e8f0',
    marginTop: 18,
  },
  pollWrap: {
    marginTop: 18,
  },
  actions: {
    marginTop: 22,
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  reactionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 26,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  addReaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  addReactionPlus: {
    fontSize: 14,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 4,
  },
  reactionBadgeActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.4)',
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 11,
    color: '#D1D5DB',
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#cbd5e1',
    textAlign: 'center',
  },
});
