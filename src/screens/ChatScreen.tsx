import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SectionList,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
  Animated,
  PanResponder,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useSharedUserTeams } from '../contexts/TeamsContext';
import { supabase } from '../lib/supabase';
import { SAME_CLUB_MESSAGE, isSameClubRefusal } from '../lib/clubRule';
import {
  CHANNEL_NAME_MAX,
  formatRoleLabel,
  getTimeAgo,
  showsClubCrest,
} from '../lib/chatHelpers';
import { CHAT_FALLBACK_NAME } from '../lib/memberNames';
import {
  canHideChannelType,
  setChannelHidden,
  HIDE_FAILED_MESSAGE,
} from '../lib/hiddenChats';
import {
  CONTACT_ROLE_GROUP_LABELS,
  contactRoleGroup,
  fetchContactRoles,
  presentRoleGroups,
  type ContactRoleGroup,
} from '../lib/contactRoles';
import { NotificationBell } from '../components/NotificationBell';
import { useFocusEffect } from '@react-navigation/native';
import { useChatUnread } from '../contexts/ChatUnreadContext';
import type { ConversationRow } from '../utils/unreadRule';
import { logError } from '../utils/logError';
import { resolveTeamColor } from '../constants/teamColors';

interface EnrichedConversation {
  id: string;
  displayType: 'dm' | 'group' | 'team';
  displayName: string;
  displaySubtitle: string;
  /**
   * What the conversation CARD shows, which is not the same as `displayName` /
   * `displaySubtitle`. Those two stay as they were because the by-team section
   * grouping, the section search and the TeamChatRoom nav params all read them.
   * The card used to lead with the channel name, which is literally "Team Chat"
   * on every team channel; it now leads with who/what the conversation is with.
   */
  cardTitle: string;
  cardMeta: string;
  /**
   * `comm_channel_members.hidden_at` for this chat. THREE states, and the
   * third is the one that broke item A on device (Oct 21):
   *   * a timestamp -- hidden at that moment;
   *   * `null`      -- the server returned the column and it is not set;
   *   * `undefined` -- the column did not come back AT ALL.
   * The first version collapsed the last two with `?? null`, so "the server
   * says no" and "the server never said" were the same value and the clear
   * could never fire. Carried ONLY for the open path; it must never reach
   * styling -- see the `dimmed` prop on ConversationItem (P4).
   */
  hiddenAt: string | null | undefined;
  displayAvatar: string | null;
  displayInitial: string;
  lastMessage: string | null;
  /**
   * Who sent the last message, for the group-chat preview ("Ana: see you at
   * 6"). Read BY NAME and optional on purpose: `get_my_conversations` does not
   * return a sender column today, so this is normally null and line 2 shows the
   * bare preview. If the server adds one, the prefix starts working with no
   * client change.
   */
  lastMessageSender?: string | null;
  lastMessageTime: string | null;
  unreadCount: number;
  /** Channel is muted for this user. Shown as a bell-off icon; still counted everywhere. */
  isMuted?: boolean;
  /** How many people are in this chat. Line 1, after the title (ruling 3). */
  memberCount?: number | null;
  /**
   * The chat's club, resolved server-side through its team, read BY NAME from
   * `get_my_conversations` (never by column position). `clubLogoUrl` null means
   * NO crest and no placeholder -- ruling 1 is explicit that an absent logo
   * shows nothing rather than a grey circle.
   */
  clubId?: string | null;
  clubName?: string | null;
  clubLogoUrl?: string | null;
  channel_type?: string;
  team_id?: string | null;
  team?: { id: string; name: string; color?: string } | null;
  name?: string;
}

/**
 * Ruling R-M (Lu, 2026-10-26): a TEAM channel wears its team's assigned colour
 * -- the same `resolveTeamColor` the calendar uses, so a team's card here and
 * its event cards there are the same hue. `team_id` is the seed when the embed
 * has no colour, which is what the hardcoded `#5B7BB5` used to paper over.
 * DMs, group DMs, club and announcement channels keep the colours below
 * untouched: R-M changed team channels only.
 */
function getChannelColor(conversation: EnrichedConversation): string {
  if (conversation.team || conversation.team_id) {
    return resolveTeamColor(
      conversation.team ?? { id: conversation.team_id }
    );
  }
  if (conversation.displayType === 'dm' || conversation.channel_type === 'dm') {
    return '#8B6BAD';
  }
  if (conversation.channel_type === 'group_dm') {
    return '#9B7BB5';
  }
  const name = (conversation.name || conversation.displayName || '').toLowerCase();
  if (
    name.includes('announcement') ||
    name.includes('club') ||
    conversation.channel_type === 'club' ||
    conversation.channel_type === 'broadcast'
  ) {
    return '#C4976D';
  }
  if (name.includes('coach') || name.includes('lounge')) {
    return '#7B6BAD';
  }
  if (name.includes('manager')) {
    return '#8B6BAD';
  }
  return '#8B6BAD';
}

/** Most recent message first; rows with no message sink to the bottom. */
function sortByRecent(list: EnrichedConversation[]): EnrichedConversation[] {
  return [...list].sort((a, b) => {
    const tA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
    const tB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
    return tB - tA;
  });
}

/** One revealed swipe action. `icon` is a Feather glyph name. */
interface SwipeAction {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  color: string;
  onPress: () => void;
}

/** How wide the revealed action strip is. */
const SWIPE_ACTION_WIDTH = 160;
const SWIPE_ACTION_WIDTH_SINGLE = 80;

/**
 * How far the row must travel before the actions latch open (fix 4).
 *
 * TRAVEL, not a fraction of the strip width. The old test was
 * `base + dx < -width / 2`, which asked 80px of a DM/group row (Mute + Hide,
 * 160 wide) but only 40px of a team row (Mute alone, 80 wide) -- so team rows
 * latched while DM rows sprang back, which is exactly the split that was
 * reported. One distance for every row now, plus a velocity escape so a fast
 * flick latches without having to cover the distance.
 */
const SWIPE_LATCH_TRAVEL = 40;
const SWIPE_LATCH_VELOCITY = 0.3;

/**
 * Is a row being dragged right now? (fix 5)
 *
 * ONE ref, owned by the screen (`swipeDragActiveRef` below) and handed to every
 * row. It is shared rather than per-row on purpose: the responder system grants
 * ONE responder at a time, so at most one row can be mid-drag, and the LISTS
 * are what need to read it. They do so in `onScrollBeginDrag`, to tell "the
 * user started scrolling" (which must close an open row) apart from "the scroll
 * view twitched inside a swipe already in progress" (which must not -- that
 * closed the row under the finger opening it). Cleared on BOTH terminal paths,
 * Release and Terminate, so it cannot stick true and wedge the close trigger
 * shut.
 *
 * A module-level object would have been simpler and is what this started as;
 * `react-hooks/immutability` rejects writing to one from inside a component,
 * and it is right to -- a ref is the sanctioned way to hold mutable state that
 * must not trigger a render.
 */
type DragActiveRef = { current: boolean };

/**
 * Swipe-left actions on a chat row (ruling 4).
 *
 * PanResponder, not react-native-gesture-handler: RNGH is NOT installed and
 * adding it is a dependency change. This follows the precedent already in the
 * app at NotificationsScreen.tsx:19-64, with one difference -- that row swipes
 * to COMMIT a delete, whereas a chat row swipes to REVEAL buttons, because
 * Hide and Mute are two actions on one row and a blind fling cannot choose
 * between them.
 *
 * A team chat still swipes; it just reveals Mute alone (ruling 4).
 */
function SwipeableChatRow({
  children,
  actions,
  rowKey,
  openKey,
  onOpen,
  dragActiveRef,
}: {
  children: React.ReactNode;
  actions: SwipeAction[];
  rowKey: string;
  /** Which row is currently open; only one at a time. */
  openKey: string | null;
  onOpen: (key: string | null) => void;
  /** Shared drag flag the lists consult before closing on scroll (fix 5). */
  dragActiveRef: DragActiveRef;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const width =
    actions.length > 1 ? SWIPE_ACTION_WIDTH : SWIPE_ACTION_WIDTH_SINGLE;
  const isOpen = openKey === rowKey;

  /**
   * The action strip is MOUNTED only while this row is open or under a drag
   * (fixes 2 and 3, Oct 20). It used to be mounted always, absolutely
   * positioned behind a card that carries marginHorizontal 12 / marginBottom
   * 10 -- so its grey and purple showed in those gutters on every row at rest,
   * and tap-and-hold (the card's activeOpacity 0.7) made the card translucent
   * enough to read "Mute" straight through it. Unmounted, there is nothing to
   * leak and nothing to show through.
   */
  const [revealed, setRevealed] = useState(false);

  // The PanResponder is built once, so it reads the moving values through refs.
  // Reading them from the closure meant it saw the FIRST render's values
  // forever: an already-open row dragged from base 0 and jumped shut.
  const isOpenRef = useRef(isOpen);
  const widthRef = useRef(width);
  const rowKeyRef = useRef(rowKey);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    isOpenRef.current = isOpen;
    widthRef.current = width;
    rowKeyRef.current = rowKey;
    onOpenRef.current = onOpen;
  }, [isOpen, width, rowKey, onOpen]);

  /** Spring to open or closed; unmount the strip once it has settled shut. */
  const settle = useCallback(
    (toOpen: boolean) => {
      Animated.spring(translateX, {
        toValue: toOpen ? -widthRef.current : 0,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !toOpen) setRevealed(false);
      });
    },
    [translateX]
  );

  /**
   * CLOSE TRIGGERS (item 5, Lu 2026-10-20 -- iPhone Messages behaviour).
   * `openSwipeKey` is the single source of truth, so every trigger is one
   * `setOpenSwipeKey(null)` and lands here:
   *   1. the next tap ANYWHERE outside the action buttons -- consumed, so it
   *      does not also open a chat (the capture handler in the row below, and
   *      the one on the screen header)
   *   2. the list starts scrolling (onScrollBeginDrag on both lists)
   *   3. a chat is opened (handleConversationPress)
   *   4. the screen regains focus (useFocusEffect)
   * An open row otherwise STAYS open: there is NO timer. The 3.5s auto-close
   * this replaces closed the row under a finger already on its way to Mute.
   */
  useEffect(() => {
    if (isOpen) {
      setRevealed(true);
      /**
       * Fix 3: state drives the pixels. This used to `return` here, so the
       * ONLY thing that could move a row open was its own
       * onPanResponderRelease -- and a row that remounted (virtualization
       * recycles it once it leaves the render window) came back at
       * translateX 0 while `openSwipeKey` still named it: visibly shut, yet
       * swallowing the next tap through consumeOutsideTap. Settling open here
       * is idempotent -- after a release the spring is already headed to this
       * same toValue, so the common path is unchanged.
       */
      settle(true);
      return;
    }
    settle(false);
  }, [isOpen, settle]);

  const panResponder = useRef(
    PanResponder.create({
      /**
       * Fix 2: claim on the CAPTURE phase, and claim EARLY.
       *
       * Capture runs before the descendants and before the native scroll view
       * has settled on taking the touch, so a clearly horizontal drag is ours
       * from the 4th pixel. The RATIO is stricter than the bubble test below
       * (1.5x, not 1x) precisely because it fires so early: an ambiguous
       * diagonal is left to the list, and the bubble handler still picks the
       * drag up later if it turns out horizontal after all.
       */
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      // Horizontal intent only, so the FlatList keeps its vertical scroll.
      // A press that never travels horizontally is never claimed, which is
      // why tap-and-hold alone can no longer start a reveal (fix 3).
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      /**
       * Fix 1: once this row has the gesture, it keeps it until the finger
       * lifts.
       *
       * This is the one line that addresses BOTH reported symptoms. RN
       * defaults this to true when it is absent
       * (react-native/Libraries/Interaction/PanResponder.js:550-553), which
       * let the list's scroll view take the drag away mid-swipe -- that is
       * the vertical scrolling during a horizontal swipe AND the snap-back,
       * because a stolen gesture never reaches onPanResponderRelease and
       * Release is the only path that can latch a row open.
       */
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragActiveRef.current = true;
        setRevealed(true);
      },
      onPanResponderMove: (_, g) => {
        const w = widthRef.current;
        const base = isOpenRef.current ? -w : 0;
        translateX.setValue(Math.min(0, Math.max(-w, base + g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        dragActiveRef.current = false;
        /**
         * Fix 4: one travel distance for every row, in both directions.
         *
         * A CLOSED row latches open on SWIPE_LATCH_TRAVEL of leftward travel
         * or a fast leftward flick. An OPEN row STAYS open unless it is
         * dragged back by that same distance or flicked right. The asymmetry
         * is the point: an open row released after a 2px jiggle must not read
         * as "close me", which a bare `dx < -TRAVEL` test would have made it.
         */
        const shouldOpen = isOpenRef.current
          ? !(g.dx > SWIPE_LATCH_TRAVEL || g.vx > SWIPE_LATCH_VELOCITY)
          : g.dx < -SWIPE_LATCH_TRAVEL || g.vx < -SWIPE_LATCH_VELOCITY;
        settle(shouldOpen);
        // Same value = no state change = the effect above will not re-run,
        // and `settle` has already put the row where it belongs.
        if (shouldOpen !== isOpenRef.current) {
          onOpenRef.current(shouldOpen ? rowKeyRef.current : null);
        }
      },
      // Termination is no longer something the list can ASK for (fix 1), but
      // it can still arrive unasked -- an unmount, or Android blocking the
      // native responder -- so the recovery stays.
      onPanResponderTerminate: () => {
        dragActiveRef.current = false;
        settle(isOpenRef.current);
      },
    })
  ).current;

  /**
   * THE OUTSIDE TAP (item 5). While ANY row is open, the next touch that lands
   * on a card -- this row's own or another's -- closes that row and is
   * SWALLOWED: no chat opens, no second action fires.
   *
   * It is a CAPTURE handler, and it sits on a wrapper INSIDE the dragged view,
   * for two reasons:
   *   * capture phase runs before the descendants, so the card's
   *     TouchableOpacity never sees the touch -- that is what "consumed"
   *     means here;
   *   * inside the Animated.View, so claiming the touch does NOT hand it to
   *     that view's PanResponder. Claiming it there would fire
   *     onPanResponderGrant -> setRevealed(true) and flash this row's own
   *     action strip for a frame.
   * The strip is a SIBLING of the dragged view, so it is never under this
   * handler and its buttons stay live.
   */
  const consumeOutsideTap = () => {
    if (!openKey) return false;
    onOpen(null);
    return true;
  };

  return (
    <View style={styles.swipeContainer}>
      {revealed && (
        <View style={[styles.swipeActions, { width }]}>
          {actions.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={[styles.swipeAction, { backgroundColor: action.color }]}
              onPress={() => {
                onOpen(null);
                action.onPress();
              }}
            >
              <Feather name={action.icon} size={18} color="#fff" />
              <Text style={styles.swipeActionText}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <View onStartShouldSetResponderCapture={consumeOutsideTap}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

function ConversationItem({
  conversation,
  onPress,
  pastTeam = false,
  dimmed = false,
  showClubName = false,
}: {
  conversation: EnrichedConversation;
  onPress: () => void;
  /**
   * Put the club name on line 3. True only when the person belongs to 2+ clubs
   * (ruling 3) -- with one club it is the same word on every row and says
   * nothing.
   */
  showClubName?: boolean;
  /**
   * This row belongs to a PAST team. It was called `muted`, which is a
   * different thing the card also needs to show (see conversation.isMuted),
   * and it rendered the label "Archived", which is a third thing again --
   * archived channels never reach this list at all.
   */
  pastTeam?: boolean;
  /**
   * P4 (ruling, Lu 2026-10-21): render this card dimmed. It is keyed on WHERE
   * the row is being rendered -- the "Hidden (n)" section passes it, the Past
   * tab gets the same treatment through `pastTeam` -- and NEVER on the data.
   * A card in the main list always uses normal styling, which is now
   * structural: Recent and By Team pass neither flag, so no value of
   * `hidden_at` can reach the dim. A chat that popped back into the main list
   * on a new message still has `hidden_at` set, and must look like any other
   * card.
   */
  dimmed?: boolean;
}) {
  const borderColor = getChannelColor(conversation);
  /**
   * R-M: a team channel, and only a team channel, carries the team dot before
   * its name. `team_id` is the test -- a DM and a club or announcement channel
   * have none, so they are untouched, while a team's coach lounge or staff
   * thread does hang off a team and is one of its channels.
   */
  const isTeamChannel = !!(conversation.team_id || conversation.team);

  /**
   * The crest belongs to a CLUB's own chats, and only to those (Lu, Oct 20
   * follow-up). A DM is a person -- their photo or their initials -- and a
   * group chat is its people, so neither carries a crest anywhere on the card:
   * not filling the circle, not as the corner ring (which is why `ClubCrest`
   * is gone; this was its last call site).
   *
   * Where it IS shown, the crest fills the whole avatar circle, with no soccer
   * ball or initials left behind it. No `club_logo_url` => today's avatar,
   * untouched -- a club that never uploaded a crest gets no placeholder.
   *
   * `displayType === 'team'` is the first half because `toConversation` sets it
   * only on the branch that is neither a DM nor a group chat. `channel_type` is
   * the second half and the authoritative one. `'default'` is in the list
   * because the default TEAM chat must keep its crest and this screen cannot
   * prove which of the two values it carries -- and a 'default' chat is never a
   * DM or a group, so including it cannot put a crest where one is now barred.
   */
  const crestedType =
    conversation.displayType === 'team' &&
    showsClubCrest(conversation.channel_type);
  const crestUrl = crestedType ? conversation.clubLogoUrl || null : null;
  const crestFillsAvatar = !!crestUrl;

  // Determine badge content based on type
  const renderBadge = () => {
    // DM: Show avatar or initials
    if (conversation.displayType === 'dm' || conversation.channel_type === 'dm') {
      if (conversation.displayAvatar) {
        return (
          <Image
            source={{ uri: conversation.displayAvatar }}
            style={styles.badgeAvatar}
          />
        );
      }
      // Generate initials from name (e.g., "Manuel Vega" → "MV")
      const nameParts = (conversation.displayName || '').split(' ');
      const initials = nameParts.length >= 2
        ? `${nameParts[0].charAt(0)}${nameParts[nameParts.length - 1].charAt(0)}`.toUpperCase()
        : (conversation.displayName || '?').charAt(0).toUpperCase();

      return (
        <View style={[styles.badgeCircle, { backgroundColor: borderColor }]}>
          <Text style={styles.badgeInitials}>{initials}</Text>
        </View>
      );
    }

    // Group: Show people icon
    if (conversation.channel_type === 'group_dm') {
      return (
        <View style={[styles.badgeCircle, { backgroundColor: '#9B7BB5' }]}>
          <Text style={styles.badgeEmoji}>👥</Text>
        </View>
      );
    }

    // Team: Show colored circle with team icon or first letter
    return (
      <View style={[styles.badgeCircle, { backgroundColor: borderColor }]}>
        <Text style={styles.badgeTeamIcon}>⚽</Text>
      </View>
    );
  };

  return (
    <TouchableOpacity
      style={[
        styles.conversationCard,
        { borderLeftColor: borderColor },
        // P4: one dim, two render sites, no data path to it.
        (pastTeam || dimmed) && styles.conversationCardDimmed,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {pastTeam && (
        <Feather
          name="clock"
          size={16}
          color="#888"
          style={styles.pastChannelPrefixIcon}
        />
      )}
      <View style={styles.conversationIcon}>
        {crestFillsAvatar ? (
          <Image
            source={{ uri: crestUrl as string }}
            style={styles.badgeAvatar}
            resizeMode="cover"
          />
        ) : (
          renderBadge()
        )}
      </View>

      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          {/* LINE 1 -- title, then the time hard right, ALWAYS the time and
              never a bare number (fix 5, Oct 20): the member count moved to
              line 3 where it reads as "2 members". A row with no messages has
              no time, and getTimeAgo returns '' for that. */}
          {isTeamChannel ? (
            <View
              style={[styles.chatTeamDot, { backgroundColor: borderColor }]}
            />
          ) : null}
          <Text
            style={[
              styles.conversationName,
              pastTeam && styles.conversationNamePast,
              conversation.unreadCount > 0 && styles.conversationNameUnread,
            ]}
            numberOfLines={1}
          >
            {conversation.cardTitle || conversation.displayName}
          </Text>
          <Text style={styles.conversationTime}>
            {getTimeAgo(conversation.lastMessageTime)}
          </Text>
        </View>

        {/* LINE 2 -- the last message, and nothing else (fix 5, Oct 20). A
            group names its sender when the server supplies one. With no
            messages the line reads "No messages yet"; it used to fall back to
            the card's meta, which put the team channel name or "2 members"
            where a preview belongs. The member count now lives on line 3. */}
        {pastTeam ? (
          /* The channel name has to survive here. Dropping it for the bare
             words "Past team" made two channels of the same retired team
             render identically ("PAC Boys 2015" twice) with no way to tell
             them apart. */
          <Text style={styles.pastTeamSubtitle} numberOfLines={1}>
            {conversation.cardMeta
              ? `${conversation.cardMeta} · Past team`
              : 'Past team'}
          </Text>
        ) : conversation.lastMessage ? (
          <Text
            style={[
              styles.lastMessage,
              conversation.unreadCount > 0 && styles.lastMessageUnread,
            ]}
            numberOfLines={1}
          >
            {conversation.displayType === 'group' &&
            conversation.lastMessageSender
              ? `${conversation.lastMessageSender}: ${conversation.lastMessage}`
              : conversation.lastMessage}
          </Text>
        ) : (
          <Text style={styles.lastMessage} numberOfLines={1}>
            No messages yet
          </Text>
        )}

        {/* LINE 3 -- unread badge, mute icon, member count, club name
            (fix 5, Oct 20). Rendered only when it has something to say, so a
            quiet single-club 1:1 keeps a 2-line card rather than a blank third
            row. */}
        {(() => {
          const showUnread = !pastTeam && conversation.unreadCount > 0;
          const showPastDot = pastTeam && conversation.unreadCount > 0;
          const clubLabel = showClubName ? conversation.clubName : null;
          const members =
            typeof conversation.memberCount === 'number' &&
            conversation.memberCount > 0
              ? conversation.memberCount
              : null;
          if (
            !showUnread &&
            !showPastDot &&
            !conversation.isMuted &&
            !members &&
            !clubLabel
          ) {
            return null;
          }
          return (
            <View style={styles.cardMetaRow}>
              {/* Past-team rows carry no number: their unread is excluded from
                  the chat total (countsTowardUnread), so a count here would be
                  a number the tab badge does not agree with. A neutral dot
                  still says "something is in here". */}
              {showPastDot && <View style={styles.pastUnreadDot} />}
              {showUnread && (
                <View
                  style={[styles.unreadBadge, { backgroundColor: borderColor }]}
                >
                  <Text style={styles.unreadText}>
                    {conversation.unreadCount > 99
                      ? '99+'
                      : conversation.unreadCount}
                  </Text>
                </View>
              )}
              {conversation.isMuted && (
                <Feather name="bell-off" size={13} color="#6B7280" />
              )}
              {members ? (
                <Text style={styles.memberCount}>
                  {members === 1 ? '1 member' : `${members} members`}
                </Text>
              ) : null}
              {clubLabel ? (
                <Text style={styles.cardClubName} numberOfLines={1}>
                  {clubLabel}
                </Text>
              ) : null}
            </View>
          );
        })()}
      </View>

      <View style={styles.conversationRight}>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

type NewChatStep = 'choose' | 'dm' | 'group' | 'team' | 'club';

interface ProfileResult {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role?: string;
  /** Which add-people filter chip this candidate belongs under, if any. */
  roleGroup?: ContactRoleGroup | null;
  existingChannelId?: string;
}

interface TeamChannelOption {
  id: string;
  name: string;
  channel_type?: string;
  team_id?: string | null;
  team?: { id: string; name: string } | null;
}

export default function ChatScreen({ navigation, route }: any) {
  const { user } = useAuth();
  const { teams, activeTeams, pastTeams, loading: teamsLoading } =
    useSharedUserTeams();
  const allTeams = useMemo(() => [...activeTeams, ...pastTeams], [activeTeams, pastTeams]);

  // The rows, the load flags and the total all come from the one shared fetch,
  // so the tab badge is the sum of exactly the rows rendered below.
  const {
    mainRows,
    pastRows,
    hiddenRows,
    loading,
    hasLoadedOnce,
    refresh,
    refreshNow,
  } = useChatUnread();
  /** Which swiped row is open. One at a time, across every tab. */
  const [openSwipeKey, setOpenSwipeKey] = useState<string | null>(null);
  /**
   * Is a row mid-drag? (fix 5) Read by both lists' `onScrollBeginDrag` so the
   * scroll that happens INSIDE a swipe does not close the row being swiped.
   * A ref, not state: it changes during a gesture and must not render.
   */
  const swipeDragActiveRef = useRef(false);

  /**
   * The chrome's half of the outside tap (item 5): while a row is open, a tap
   * on the header, the tab bar, the club chips or the "Hidden (n)" header
   * closes it and goes NO further -- it does not switch tabs, does not open
   * the New-chat modal and does not expand Hidden. None of those views
   * contains an action strip, so nothing tappable is shadowed. Declared here,
   * above every render helper that uses it.
   */
  const consumeChromeTap = () => {
    if (!openSwipeKey) return false;
    setOpenSwipeKey(null);
    return true;
  };
  /**
   * Team channels PROVEN not to be their team's default chat (A4, Lu
   * 2026-10-20). Only these get "Team name · channel name" as their card
   * title; everything else keeps today's title.
   *
   * A default channel is identified by the ROW -- `comm_channels.is_default`
   * -- never by its name, because default channels have been renamed before
   * (`lib/channelLeave.ts:110-122`: the default team chat went from
   * "announcements" to "Team Chat"). `get_my_conversations` is not known to
   * return that column, and prod cannot be queried from here, so the ids come
   * from one extra read below. The set holds only `is_default === false`, so
   * an unanswered or failed read leaves every title exactly as it is.
   */
  const [customChannelIds, setCustomChannelIds] = useState<Set<string>>(
    () => new Set()
  );
  /** Club chip filter (ruling 2). null = All. */
  const [clubFilter, setClubFilter] = useState<string | null>(null);
  /** Is the "Hidden (n)" section expanded? (ruling 8) */
  const [hiddenExpanded, setHiddenExpanded] = useState(false);
  /**
   * Clubs this person is in via STAFF/ADMIN rather than via a team. The three
   * sources are the same ones the new-chat flow already consults below
   * (club_staff, user_roles.club_admin, clubs.admin_id) -- read here as a SET
   * because a club admin with no team must still be counted among their clubs
   * (ruling 2), which the single-club `clubId` state cannot express.
   */
  const [staffClubIds, setStaffClubIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // ensure_team_channel_membership is a one-time repair, not a per-fetch step.
  const membershipEnsuredRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'recent' | 'byTeam' | 'past'>('recent');
  const [teamSearchQuery, setTeamSearchQuery] = useState('');

  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatStep, setNewChatStep] = useState<NewChatStep>('choose');
  const [isClubAdmin, setIsClubAdmin] = useState(false);
  const [clubId, setClubId] = useState<string | null>(null);

  const [dmSearchQuery, setDmSearchQuery] = useState('');
  const [dmSearchResults, setDmSearchResults] = useState<ProfileResult[]>([]);
  const [isSearchingDm, setIsSearchingDm] = useState(false);
  const dmSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [existingDMs, setExistingDMs] = useState<Map<string, string>>(new Map());

  const [groupName, setGroupName] = useState('');
  const [selectedGroupUsers, setSelectedGroupUsers] = useState<ProfileResult[]>([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [groupSearchResults, setGroupSearchResults] = useState<ProfileResult[]>([]);
  // 'all' is the default and the only chip that is always offered.
  const [groupRoleFilter, setGroupRoleFilter] = useState<ContactRoleGroup | 'all'>('all');
  const [isSearchingGroup, setIsSearchingGroup] = useState(false);
  const groupSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest-wins: clearing the debounce timer does not cancel an RPC already
  // in flight, so a slower earlier keystroke must not overwrite a newer
  // result. Two awaits now run per search (contacts, then role tags).
  const groupSearchSeqRef = useRef(0);
  const [existingGroupMatch, setExistingGroupMatch] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [teamChannels, setTeamChannels] = useState<TeamChannelOption[]>([]);
  const [teamChannelSearch, setTeamChannelSearch] = useState('');

  const [clubWideMode, setClubWideMode] = useState<'all' | 'filter'>('all');
  const [filterType, setFilterType] = useState<'age' | 'gender' | 'team' | null>(null);
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [clubTeams, setClubTeams] = useState<any[]>([]);

  /**
   * Row -> card. Hoisted to component level: it is pure given `allTeams`, and
   * the rows themselves now arrive from the shared provider rather than from a
   * fetch this screen owns.
   */
  const toConversation = useCallback((row: any): EnrichedConversation => {
    const lastMessageTime = row.last_message_at ?? null;
    const unreadCount = row.unread_count ?? 0;
    const isMuted = row.is_muted === true;
    /*
     * The three club columns, read BY NAME and never by position -- the RPC
     * grew from 20 to 23 columns and positional reads are exactly what breaks
     * when it grows again. `channel_club_id` is the chat's club resolved
     * server-side through its team, so it is present for DMs and group chats
     * too, which is what makes the club chips able to filter them (ruling 2).
     */
    const clubId = row.channel_club_id ?? null;
    const clubName = row.club_name ?? null;
    const clubLogoUrl = row.club_logo_url ?? null;
    const memberCount = row.member_count ?? null;
    const lastMessageSender = row.last_message_sender_name ?? null;
    /**
     * A (Lu, 2026-10-21): `hidden_at` is `get_my_conversations` column 20,
     * read BY NAME like the rest. A row can be in the MAIN list and still
     * carry it -- that is exactly a popped-back chat (H7: a newer message
     * beats the timestamp) -- and opening one is what clears it.
     *
     * NO `?? null` HERE. That is the Oct 21 root cause: it turned a missing
     * column into "not hidden", which is indistinguishable from the server
     * saying so, and the clear then skipped silently with nothing to see in
     * Metro. `undefined` now stays `undefined` and the open path treats it as
     * UNKNOWN.
     */
    const hiddenAt: string | null | undefined = row.hidden_at;
    const rowFields = { clubId, clubName, clubLogoUrl, memberCount, hiddenAt };

    if (row.is_direct_message) {
      // other_user_name is get_my_conversations column 17, which S1 pointed at
      // the shared name ladder -- so this fallback fires only when that column
      // came back null, and says the one ruled thing rather than 'Unknown User'.
      const otherName = row.other_user_name || CHAT_FALLBACK_NAME;
      return {
        id: row.channel_id,
        displayType: 'dm',
        displayName: otherName,
        displaySubtitle: '',
        // DM card: the other person's name, no type label.
        cardTitle: otherName,
        cardMeta: '',
        displayAvatar: row.other_user_avatar || null,
        displayInitial: otherName.charAt(0)?.toUpperCase() || '?',
        lastMessage: row.last_message_content || null,
        lastMessageTime,
        unreadCount,
        isMuted,
        ...rowFields,
        channel_type: row.channel_type,
        name: row.name,
      };
    }
    if (row.channel_type === 'group_dm') {
      return {
        id: row.channel_id,
        displayType: 'group',
        displayName: row.name || 'Group Chat',
        displaySubtitle: `${row.member_count || 0} members`,
        // Group card: the group's own name, member count stays secondary.
        cardTitle: row.name || 'Group Chat',
        cardMeta: `${row.member_count || 0} members`,
        displayAvatar: null,
        displayInitial: '👥',
        lastMessage: row.last_message_content || null,
        // Only a GROUP preview names its sender: a DM's sender is the person
        // whose name is already the card title, and a team chat's line 2 is
        // the channel name.
        lastMessageSender,
        lastMessageTime,
        unreadCount,
        isMuted,
        ...rowFields,
        channel_type: row.channel_type,
        name: row.name,
      };
    }
    const team = allTeams.find((t) => t.id === row.team_id);
    const teamLabel = row.team_name || team?.name || '';
    const channelLabel = row.name || '';
    /**
     * A4: a team's EXTRA channels now say which one they are, because the team
     * name alone made two channels of one team render identically (the FOUND
     * from the Oct 20 card pass). `is_default === false` from the row is the
     * proof; anything else -- the default chat, an unanswered read -- keeps
     * the team-only title.
     */
    const isCustomChannel =
      row.is_default === false || customChannelIds.has(row.channel_id);
    const cardTitle =
      teamLabel && isCustomChannel && channelLabel && channelLabel !== teamLabel
        ? `${teamLabel} · ${channelLabel}`
        : teamLabel || channelLabel || 'Team Chat';
    return {
      id: row.channel_id,
      displayType: 'team',
      displayName: row.name || 'Team Chat',
      displaySubtitle: row.team_name || team?.name || '',
      // Team card: the TEAM is the headline, plus the channel name when this
      // is not the team's default chat (A4).
      cardTitle,
      cardMeta:
        row.team_name || team?.name
          ? row.name || 'Team Chat'
          : '',
      displayAvatar: null,
      displayInitial: '#',
      lastMessage: row.last_message_content || null,
      lastMessageTime,
      unreadCount,
      isMuted,
      ...rowFields,
      channel_type: row.channel_type,
      team_id: row.team_id,
      team: row.team_id
        ? { id: row.team_id, name: row.team_name || team?.name || '', color: team?.color }
        : null,
      name: row.name,
    };
  }, [allTeams, customChannelIds]);

  /**
   * The ids of every TEAM channel on screen, as a stable string key -- the
   * effect below must fire when the SET changes, not on every refetch that
   * hands back new row objects.
   */
  const teamChannelIdKey = useMemo(() => {
    // `ConversationRow` already declares both columns (channel_id, and team_id
    // via ChannelLifecycleFacts), so no cast and no `any` is needed here --
    // `mainRows` is typed `any[]` in the context, which would otherwise spread
    // into one.
    const rows: ConversationRow[] = [...mainRows, ...pastRows, ...hiddenRows];
    const ids = rows
      .filter((row) => row?.channel_id && row?.team_id)
      .map((row) => row.channel_id as string);
    return Array.from(new Set(ids)).sort().join(',');
  }, [mainRows, pastRows, hiddenRows]);

  useEffect(() => {
    const ids = teamChannelIdKey ? teamChannelIdKey.split(',') : [];
    if (ids.length === 0) {
      setCustomChannelIds(new Set());
      return;
    }
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('comm_channels')
        .select('id, is_default')
        .in('id', ids);
      if (!alive) return;
      if (error) {
        // A failed read is not "every channel is custom": leave the titles be.
        logError('ChatScreen.fetchChannelDefaults', error, {
          channelCount: ids.length,
        });
        return;
      }
      setCustomChannelIds(
        new Set(
          (data ?? [])
            .filter((row) => row.is_default === false)
            .map((row) => row.id as string)
        )
      );
    })();
    return () => {
      alive = false;
    };
  }, [teamChannelIdKey]);

  const allConversations = useMemo(
    () => sortByRecent(mainRows.map(toConversation)),
    [mainRows, toConversation]
  );
  const pastConversations = useMemo(
    () => sortByRecent(pastRows.map(toConversation)),
    [pastRows, toConversation]
  );
  const hiddenConversations = useMemo(
    () => sortByRecent(hiddenRows.map(toConversation)),
    [hiddenRows, toConversation]
  );

  /**
   * The person's clubs (ruling 2): clubs where they have a TEAM, plus clubs
   * where they are staff/admin. Both halves matter -- a parent's clubs come
   * only from teams, a club admin's may come only from staff rows.
   */
  const userClubs = useMemo(() => {
    const byId = new Map<string, string>();
    for (const team of allTeams) {
      if (team.club_id) byId.set(team.club_id, team.club_name || 'Club');
    }
    // A staffed club with no team of ours still counts; its name is filled in
    // from any conversation that carries it, else left generic.
    for (const id of staffClubIds) {
      if (!byId.has(id)) byId.set(id, 'Club');
    }
    for (const convo of allConversations) {
      if (convo.clubId && convo.clubName && byId.get(convo.clubId) === 'Club') {
        byId.set(convo.clubId, convo.clubName);
      }
    }
    return Array.from(byId, ([id, name]) => ({ id, name }));
  }, [allTeams, staffClubIds, allConversations]);

  /** Chips, and the club name on line 3, appear only at 2+ clubs (rulings 2,3). */
  const isMultiClub = userClubs.length >= 2;

  /**
   * A chip filters by `channel_club_id`. A chat with no club (a cross-club DM,
   * say) is shown under "All" and under no chip -- it belongs to no club, so
   * claiming it for one would be a lie.
   */
  const conversations = useMemo(() => {
    if (!clubFilter) return allConversations;
    return allConversations.filter((c) => c.clubId === clubFilter);
  }, [allConversations, clubFilter]);

  /**
   * One-time membership repair. It has to finish before its channels can show
   * up, so the provider is asked to refetch once it has. Not part of the fetch
   * path any more -- it used to run inside it.
   */
  useEffect(() => {
    if (!user?.id || teamsLoading) return;
    if (membershipEnsuredRef.current) return;
    if (activeTeams.length === 0) return;
    membershipEnsuredRef.current = true;
    void (async () => {
      await Promise.all(
        activeTeams.map(async (team) => {
          try {
            await supabase.rpc('ensure_team_channel_membership', { p_team_id: team.id });
          } catch (err) {
            logError('ChatScreen.ensureTeamChannelMembership', err, { teamId: team.id });
          }
        })
      );
      refresh();
    })();
  }, [user?.id, teamsLoading, activeTeams, refresh]);

  // Returning to the list: re-read, in case something was read elsewhere, and
  // close any row left open when we navigated away (close trigger 4, fix 4).
  useFocusEffect(
    useCallback(() => {
      setOpenSwipeKey(null);
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    if (route.params?.openNewModal) {
      setShowNewChatModal(true);
      setNewChatStep('choose');
      navigation.setParams({ openNewModal: undefined });
    }
  }, [route.params?.openNewModal, navigation]);

  useEffect(() => {
    const checkClubAdmin = async () => {
      if (!user?.id) return;
      try {
        const { data: clubStaff } = await supabase
          .from('club_staff')
          .select('id, club_id')
          .eq('user_id', user.id);
        if (clubStaff && clubStaff.length > 0) {
          setIsClubAdmin(true);
          setClubId(clubStaff[0].club_id);
          return;
        }
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('id, entity_id')
          .eq('user_id', user.id)
          .eq('role', 'club_admin')
          .limit(1);
        if (userRoles && userRoles.length > 0 && userRoles[0].entity_id) {
          setIsClubAdmin(true);
          setClubId(userRoles[0].entity_id);
          return;
        }
        const { data: clubAdmin } = await supabase
          .from('clubs')
          .select('id')
          .eq('admin_id', user.id)
          .limit(1);
        if (clubAdmin && clubAdmin.length > 0) {
          setIsClubAdmin(true);
          setClubId(clubAdmin[0].id);
          return;
        }
      } catch (_) {
        // Tables may not exist
      }
      setIsClubAdmin(false);
      setClubId(null);
    };
    checkClubAdmin();
  }, [user?.id]);

  /**
   * EVERY club this person staffs, for the chip rule (ruling 2).
   *
   * Deliberately separate from `checkClubAdmin` above rather than folded into
   * it: that effect returns at the FIRST source that answers, because all it
   * needs is "are you a club admin, and of which one" for the new-chat flow.
   * The chip rule needs the UNION -- someone can staff two clubs through two
   * different tables -- and rewriting the early returns would change behaviour
   * the chip rule has no business touching.
   */
  useEffect(() => {
    if (!user?.id) {
      setStaffClubIds([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const ids = new Set<string>();
      try {
        const [staffRows, roleRows, ownedRows] = await Promise.all([
          supabase.from('club_staff').select('club_id').eq('user_id', user.id),
          supabase
            .from('user_roles')
            .select('entity_id')
            .eq('user_id', user.id)
            .eq('role', 'club_admin'),
          supabase.from('clubs').select('id').eq('admin_id', user.id),
        ]);
        (staffRows.data as { club_id?: string | null }[] | null)?.forEach(
          (r) => r?.club_id && ids.add(r.club_id)
        );
        (roleRows.data as { entity_id?: string | null }[] | null)?.forEach(
          (r) => r?.entity_id && ids.add(r.entity_id)
        );
        (ownedRows.data as { id?: string | null }[] | null)?.forEach(
          (r) => r?.id && ids.add(r.id)
        );
      } catch (err) {
        // Not fatal: with no staffed clubs the chips simply fall back to the
        // clubs this person has a team in.
        logError('ChatScreen.staffClubIds', err, { userId: user.id });
      }
      if (!cancelled) setStaffClubIds(Array.from(ids));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const fetchExistingDMs = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('comm_channels')
      .select('id, dm_participant_1, dm_participant_2')
      .eq('is_direct_message', true)
      .eq('is_archived', false)
      .or(`dm_participant_1.eq.${user.id},dm_participant_2.eq.${user.id}`);
    const map = new Map<string, string>();
    (data || []).forEach((dm: any) => {
      const other =
        dm.dm_participant_1 === user.id
          ? dm.dm_participant_2
          : dm.dm_participant_1;
      map.set(other, dm.id);
    });
    setExistingDMs(map);
  }, [user?.id]);

  const searchUsersForDM = useCallback(
    async (query: string) => {
      if (!query.trim() || !user?.id) {
        setDmSearchResults([]);
        return;
      }
      // Membership-gated RPC: caps at 20, drops self, and only returns people
      // who share a team with the caller. Under 2 characters it returns nothing,
      // which lands here as an empty list -- the same as "no matches".
      const { data: contacts, error } = await supabase.rpc('search_chat_contacts', {
        p_query: query,
      });
      if (error) {
        if (__DEV__) {
          console.error('[ChatScreen] search_chat_contacts (DM) failed:', error);
        }
        setDmSearchResults([]);
        return;
      }
      const profiles = (contacts || []).map((c: any) => ({
        id: c.user_id,
        full_name: c.display_name ?? null,
        avatar_url: c.avatar_url ?? null,
      }));
      const userIds = profiles.map((p: any) => p.id);
      // One resolver for the whole app (chatHelpers.fetchContactRoles ->
      // buildRoleMap). This used to be a hand-rolled copy of the same merge,
      // one of four that could disagree with each other.
      const roleMap =
        userIds.length > 0
          ? await fetchContactRoles(userIds)
          : new Map<string, string>();
      const enriched = profiles.map((p: any) => ({
        ...p,
        role: roleMap.get(p.id),
        existingChannelId: existingDMs.get(p.id),
      }));
      setDmSearchResults(enriched);
    },
    [user?.id, existingDMs]
  );

  const handleSelectDMUser = useCallback(
    async (selectedUser: ProfileResult) => {
      if (!user?.id) return;

      // p_club_id: null is DELIBERATE, not a gap. Since Phase D slice BF the
      // server resolves the DM's club itself when the caller sends null, using
      // ruling BF-1: the FIRST club the two people shared -- per shared club,
      // the later of their two earliest membership dates; earliest of those
      // wins. Sending a club from here would mean guessing, because this screen
      // only knows a clubId for a CLUB ADMIN (checkClubAdmin, below). An
      // explicit club still wins if a caller has a real one; the web club tab
      // does that. Do not "fix" this to a value.
      //   WEB: supabase/migrations/20261016120000_bf_club_id_on_every_chat.sql
      //   recon: docs/recon/phaseD-BF.md -- ruling: docs/recon/phaseD-rulings.md
      const { data: channelId, error } = await supabase.rpc(
        'get_or_create_dm_channel',
        {
          user1_id: user.id,
          user2_id: selectedUser.id,
          p_team_id: null,
          p_club_id: null,
        }
      );

      if (error || !channelId) {
        // BF-8: two people who share no club cannot open a DM.
        if (isSameClubRefusal(error)) {
          Alert.alert('Different clubs', SAME_CLUB_MESSAGE);
          return;
        }
        console.error('get_or_create_dm_channel failed:', error);
        Alert.alert('Error', 'Could not open conversation');
        return;
      }

      setShowNewChatModal(false);
      setNewChatStep('choose');
      navigation.navigate('DMChat', { channelId });
    },
    [user?.id, navigation]
  );

  const searchUsersForGroup = useCallback(
    async (query: string) => {
      if (!query.trim() || !user?.id) {
        setGroupSearchResults([]);
        return;
      }
      const seq = ++groupSearchSeqRef.current;

      // Same membership-gated RPC as the DM picker -- see searchUsersForDM.
      const { data: contacts, error } = await supabase.rpc('search_chat_contacts', {
        p_query: query,
      });

      // A response that is no longer the newest request is dropped outright.
      if (seq !== groupSearchSeqRef.current) return;

      if (error) {
        if (__DEV__) {
          console.error('[ChatScreen] search_chat_contacts (group) failed:', error);
        }
        setGroupSearchResults([]);
        return;
      }
      const filtered = (contacts || [])
        .map((c: any) => ({
          id: c.user_id,
          full_name: c.display_name ?? null,
          avatar_url: c.avatar_url ?? null,
        }))
        .filter(
          (p: any) => !selectedGroupUsers.some((s) => s.id === p.id)
        ) as ProfileResult[];

      // Role tag resolved here, from role COLUMNS: the search RPC returns no
      // role, and the display string must never be pattern-matched for one.
      const roleMap = await fetchContactRoles(filtered.map((p) => p.id));
      if (seq !== groupSearchSeqRef.current) return;

      setGroupSearchResults(
        filtered.map((p) => {
          const role = roleMap.get(p.id);
          return { ...p, role, roleGroup: contactRoleGroup(role) };
        })
      );
    },
    [user?.id, selectedGroupUsers]
  );

  // 300 ms debounce: the pickers fire on every keystroke, and each keystroke is
  // an RPC round trip. isSearching drives the spinner between keystroke and result.
  const DEBOUNCE_MS = 300;

  const queueDmSearch = useCallback(
    (text: string) => {
      if (dmSearchTimerRef.current) clearTimeout(dmSearchTimerRef.current);
      if (!text.trim()) {
        setIsSearchingDm(false);
        setDmSearchResults([]);
        return;
      }
      setIsSearchingDm(true);
      dmSearchTimerRef.current = setTimeout(async () => {
        try {
          await searchUsersForDM(text);
        } finally {
          setIsSearchingDm(false);
        }
      }, DEBOUNCE_MS);
    },
    [searchUsersForDM]
  );

  const queueGroupSearch = useCallback(
    (text: string) => {
      if (groupSearchTimerRef.current) clearTimeout(groupSearchTimerRef.current);
      if (!text.trim()) {
        setIsSearchingGroup(false);
        setGroupSearchResults([]);
        return;
      }
      setIsSearchingGroup(true);
      groupSearchTimerRef.current = setTimeout(async () => {
        try {
          await searchUsersForGroup(text);
        } finally {
          setIsSearchingGroup(false);
        }
      }, DEBOUNCE_MS);
    },
    [searchUsersForGroup]
  );

  useEffect(() => {
    return () => {
      if (dmSearchTimerRef.current) clearTimeout(dmSearchTimerRef.current);
      if (groupSearchTimerRef.current) clearTimeout(groupSearchTimerRef.current);
    };
  }, []);

  const checkForExistingGroup = useCallback(
    async (users: ProfileResult[]) => {
      if (users.length < 2 || !user?.id) {
        setExistingGroupMatch(null);
        return;
      }
      const memberIds = [user.id, ...users.map((u) => u.id)].sort();
      const { data: memberships, error: membershipsError } = await supabase
        .from('comm_channel_members')
        .select('channel_id')
        .eq('user_id', user.id);
      if (membershipsError && __DEV__) {
        console.warn('[ChatScreen] dup-check memberships read failed:', membershipsError);
      }
      const channelIds = (memberships || []).map((m: any) => m.channel_id);
      if (channelIds.length === 0) {
        setExistingGroupMatch(null);
        return;
      }
      const { data: groups, error: groupsError } = await supabase
        .from('comm_channels')
        .select('id, name')
        .in('id', channelIds)
        .eq('channel_type', 'group_dm');
      if (groupsError && __DEV__) {
        console.warn('[ChatScreen] dup-check groups read failed:', groupsError);
      }
      for (const g of groups || []) {
        const { data: members, error: membersError } = await supabase
          .from('comm_channel_members')
          .select('user_id')
          .eq('channel_id', g.id);
        if (membersError && __DEV__) {
          console.warn('[ChatScreen] dup-check members read failed:', membersError);
        }
        const groupIds = (members || []).map((m: any) => m.user_id).sort();
        if (
          groupIds.length === memberIds.length &&
          groupIds.every((id, i) => id === memberIds[i])
        ) {
          setExistingGroupMatch({ id: g.id, name: g.name || 'Group' });
          return;
        }
      }
      setExistingGroupMatch(null);
    },
    [user?.id]
  );

  const addUserToGroup = useCallback((selectedUser: ProfileResult) => {
    setSelectedGroupUsers((prev) => {
      const next = [...prev, selectedUser];
      return next;
    });
    setGroupSearchQuery('');
    setGroupSearchResults([]);
  }, []);

  useEffect(() => {
    checkForExistingGroup(selectedGroupUsers);
  }, [selectedGroupUsers, checkForExistingGroup]);

  const removeUserFromGroup = useCallback((userId: string) => {
    setSelectedGroupUsers((prev) => prev.filter((u) => u.id !== userId));
  }, []);

  const createGroup = useCallback(async () => {
    if (!groupName.trim() || selectedGroupUsers.length < 1 || !user?.id) {
      Alert.alert('Error', 'Enter a group name and add at least one person');
      return;
    }
    // Created SERVER-SIDE since ruling BF-2 (Oct 16 2026). One RPC is one
    // transaction: the channel row, every member row and the chat's club_id land
    // together or not at all.
    //
    // Why the server owns this. Ruling 9 asks every chat to record its club, and
    // this screen has no club to send: clubId (state, see checkClubAdmin) is set
    // ONLY for a club admin, so a parent or coach had nothing, and a multi-club
    // director would have stamped whichever club_staff row came back first -- a
    // race, not a rule. The server works the club out from the members instead:
    // the first club ALL of them shared (BF-1 generalised), or NULL.
    //
    // THE ORPHAN ROLLBACK IS GONE WITH IT. This used to insert the channel, then
    // the members in a second round trip, and DELETE the channel by hand if that
    // second call failed. A function body cannot half-succeed, so there is no
    // orphan to clean up and no delete here any more.
    //   WEB: supabase/migrations/20261016120000_bf_club_id_on_every_chat.sql
    //   recon: docs/recon/phaseD-BF.md -- rulings: docs/recon/phaseD-rulings.md
    const { data: channelId, error } = await supabase.rpc('create_group_channel', {
      p_name: groupName.trim(),
      // The creator is NOT in this list: the server adds them as admin itself.
      p_user_ids: selectedGroupUsers
        .filter((u) => u.id !== user.id)
        .map((u) => u.id),
    });
    if (error || !channelId) {
      // BF-8: the server refuses a group whose members do not all share a club.
      // That is a rule, not a fault, so it gets its own sentence.
      if (isSameClubRefusal(error)) {
        Alert.alert('Different clubs', SAME_CLUB_MESSAGE);
        return;
      }
      if (__DEV__) {
        console.warn('[ChatScreen] create_group_channel failed:', error);
      }
      Alert.alert('Error', 'Could not create group');
      return;
    }
    const createdName = groupName.trim();
    setShowNewChatModal(false);
    setNewChatStep('choose');
    setGroupName('');
    setSelectedGroupUsers([]);
    setExistingGroupMatch(null);
    navigation.navigate('TeamChatRoom', {
      channelId,
      channelName: createdName,
      teamName: undefined,
      channelType: 'group_dm',
    });
  }, [user?.id, groupName, selectedGroupUsers, navigation]);

  const fetchTeamChannels = useCallback(async () => {
    if (!user?.id) return;
    const { data: memberships } = await supabase
      .from('comm_channel_members')
      .select('channel_id')
      .eq('user_id', user.id);
    const channelIds = (memberships || []).map((m: any) => m.channel_id);
    if (channelIds.length === 0) {
      setTeamChannels([]);
      return;
    }
    const { data } = await supabase
      .from('comm_channels')
      .select('id, name, channel_type, team_id')
      .in('id', channelIds)
      .in('channel_type', ['team', 'broadcast', 'club'])
      .order('name');
    const withTeams: TeamChannelOption[] = (data || []).map((c: any) => ({
      ...c,
      team: null,
    }));
    const teamIds = [
      ...new Set(
        (data || []).map((c: any) => c.team_id).filter(Boolean)
      ),
    ] as string[];
    if (teamIds.length > 0) {
      const { data: teamsData } = await supabase
        .from('teams')
        .select('id, name')
        .in('id', teamIds);
      const teamMap = new Map(
        (teamsData || []).map((t: any) => [t.id, t])
      );
      withTeams.forEach((ch) => {
        if (ch.team_id) ch.team = teamMap.get(ch.team_id) || null;
      });
    }
    setTeamChannels(withTeams);
  }, [user?.id]);

  // No message subscription here: ChatUnreadProvider owns the one that feeds
  // both this list and the tab badge. This screen having its own was what let
  // the row update while the tab badge sat behind a separate 3 s debounce.

  const closeModal = useCallback(() => {
    setShowNewChatModal(false);
    setNewChatStep('choose');
    setDmSearchQuery('');
    setDmSearchResults([]);
    setGroupName('');
    setSelectedGroupUsers([]);
    setGroupSearchQuery('');
    setGroupSearchResults([]);
    setGroupRoleFilter('all');
    setExistingGroupMatch(null);
    setTeamChannelSearch('');
    setClubWideMode('all');
    setFilterType(null);
    setSelectedAgeGroups([]);
    setSelectedGenders([]);
    setSelectedTeamIds([]);
    Keyboard.dismiss();
  }, []);

  useEffect(() => {
    if (showNewChatModal) {
      fetchExistingDMs();
    }
  }, [showNewChatModal, fetchExistingDMs]);

  useEffect(() => {
    if (showNewChatModal && newChatStep === 'team') {
      fetchTeamChannels();
    }
  }, [showNewChatModal, newChatStep, fetchTeamChannels]);

  const fetchClubTeams = useCallback(async () => {
    if (!user?.id) return;
    // limit(1), not maybeSingle(): a user can hold club_staff rows at more than
    // one club, and maybeSingle() errored on 2+ rows -- which silently stripped
    // club broadcast from exactly the multi-club staff.
    const { data: clubStaffRows, error: clubStaffError } = await supabase
      .from('club_staff')
      .select('club_id')
      .eq('user_id', user.id)
      .limit(1);
    if (clubStaffError) {
      if (__DEV__) console.warn('[Chat] club_staff lookup failed:', clubStaffError);
      setClubTeams([]);
      return;
    }
    const clubStaff = clubStaffRows?.[0];
    if (!clubStaff?.club_id) {
      setClubTeams([]);
      return;
    }
    const { data: teams } = await supabase
      .from('teams')
      .select('id, name, age_group, gender')
      .eq('club_id', clubStaff.club_id)
      .order('name');
    setClubTeams(teams || []);
  }, [user?.id]);

  useEffect(() => {
    if (showNewChatModal && newChatStep === 'club') {
      fetchClubTeams();
    }
  }, [showNewChatModal, newChatStep, fetchClubTeams]);

  const filteredTeamChannels = teamChannels.filter(
    (ch) =>
      (ch.name || '')
        .toLowerCase()
        .includes(teamChannelSearch.toLowerCase()) ||
      (ch.team?.name || '')
        .toLowerCase()
        .includes(teamChannelSearch.toLowerCase())
  );

  const normalizeGender = (gender: string | null): string | null => {
    if (!gender) return null;
    const lower = gender.toLowerCase().trim();
    if (['male', 'boys', 'boy', 'm'].includes(lower)) return 'male';
    if (['female', 'girls', 'girl', 'f'].includes(lower)) return 'female';
    if (['coed', 'co-ed', 'mixed'].includes(lower)) return 'coed';
    return null;
  };

  const getGenderLabel = (normalized: string): string => {
    if (normalized === 'male') return 'Boys';
    if (normalized === 'female') return 'Girls';
    if (normalized === 'coed') return 'Coed';
    return normalized;
  };

  const ageGroups = [...new Set(clubTeams.map((t: any) => t.age_group).filter(Boolean))].sort();
  const genders = [
    ...new Set(
      clubTeams
        .map((t: any) => normalizeGender(t.gender))
        .filter((g): g is string => g != null)
    ),
  ] as string[];

  const matchingTeams =
    selectedAgeGroups.length > 0 || selectedGenders.length > 0
      ? clubTeams.filter(
          (t: any) =>
            (selectedAgeGroups.length === 0 || selectedAgeGroups.includes(t.age_group)) &&
            (selectedGenders.length === 0 ||
              selectedGenders.includes(normalizeGender(t.gender) ?? ''))
        )
      : clubTeams;

  const canSendClubWide = () => {
    if (clubWideMode === 'all') return clubTeams.length > 0;
    return selectedTeamIds.length > 0;
  };

  const getSelectedTeamCount = () => {
    if (clubWideMode === 'all') return clubTeams.length;
    return selectedTeamIds.length;
  };

  const sendClubWideMessage = async () => {
    const targetTeamIds =
      clubWideMode === 'all'
        ? clubTeams.map((t: any) => t.id)
        : selectedTeamIds;
    const { data: clubChannel } = await supabase
      .from('comm_channels')
      .select('id')
      .eq('channel_type', 'broadcast')
      .limit(1)
      .maybeSingle();
    if (clubChannel) {
      closeModal();
      navigation.navigate('TeamChatRoom', {
        channelId: clubChannel.id,
        channelName: 'Club-Wide',
        teamName: undefined,
        channelType: 'broadcast',
        broadcastToTeams: targetTeamIds,
      });
    } else {
      Alert.alert('Info', 'Club broadcast channel not found. Contact admin.');
    }
  };

  const conversationsByTeam = conversations
    .filter((c) => c.displayType === 'team' || c.channel_type === 'group_dm')
    .reduce<Record<string, EnrichedConversation[]>>((acc, c) => {
      const key =
        c.channel_type === 'group_dm' ? 'Groups' : (c.displaySubtitle || 'Other');
      if (!acc[key]) acc[key] = [];
      acc[key].push(c);
      return acc;
    }, {});
  const teamSections = Object.entries(conversationsByTeam)
    .filter(([teamName]) =>
      teamName.toLowerCase().includes(teamSearchQuery.toLowerCase())
    )
    .map(([title, data]) => ({ title, data }));

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshNow();
    } finally {
      setRefreshing(false);
    }
  };

  /**
   * Mute / unmute (ruling 6). Same write the Chat Info switch uses
   * (ChatInfoScreen.tsx:362-369) -- `comm_channel_members.is_muted`, scoped to
   * this channel and this user. Mute changes PUSH DELIVERY only: the chat
   * keeps its place in the list and its unread keeps counting in the tab
   * badge, which is PARITY SPEC v2's "a muted channel counts".
   *
   * The error is checked, unlike the Chat Info switch: an UPDATE that matches
   * no row is not a Postgres error, so an unchecked write is how a toggle
   * appears to work while nothing happens.
   */
  const handleToggleMute = useCallback(
    async (conversation: EnrichedConversation) => {
      if (!user?.id) return;
      const next = !conversation.isMuted;
      const { error } = await supabase
        .from('comm_channel_members')
        .update({ is_muted: next })
        .eq('channel_id', conversation.id)
        .eq('user_id', user.id);
      if (error) {
        logError('ChatScreen.toggleMute', error, { channelId: conversation.id });
        Alert.alert('Not updated', 'Could not change notifications for this chat.');
        return;
      }
      refresh();
    },
    [user?.id, refresh]
  );

  /**
   * Hide / unhide (rulings 5 and 8). One door: `setChannelHidden`, which is
   * the only hide write in this app. Nothing is marked read, and push is
   * untouched.
   *
   * A refusal is SAID OUT LOUD rather than swallowed -- the server refuses
   * team/club/default chats, and the UI already declines to offer Hide on
   * them, so reaching a refusal means the two disagree and that is worth
   * seeing.
   */
  const handleSetHidden = useCallback(
    async (conversation: EnrichedConversation, hidden: boolean) => {
      const result = await setChannelHidden(conversation.id, hidden);
      if (result.status === 'ok') {
        refresh();
        return;
      }
      if (result.status === 'refused') {
        Alert.alert('Chat not hidden', result.message);
        return;
      }
      logError('ChatScreen.setChannelHidden', result.error, {
        channelId: conversation.id,
      });
      Alert.alert('Chat not hidden', HIDE_FAILED_MESSAGE);
    },
    [refresh]
  );

  /**
   * The swipe actions for one row (ruling 4): Mute on every chat, Hide only
   * where `canHideChannelType` allows it -- DMs and group chats. A team, club
   * or default chat still swipes, and reveals Mute alone.
   */
  const swipeActionsFor = useCallback(
    (conversation: EnrichedConversation) => {
      const actions: SwipeAction[] = [
        {
          key: 'mute',
          label: conversation.isMuted ? 'Unmute' : 'Mute',
          icon: conversation.isMuted ? 'bell' : 'bell-off',
          color: '#4B5563',
          onPress: () => void handleToggleMute(conversation),
        },
      ];
      if (canHideChannelType(conversation.channel_type)) {
        actions.push({
          key: 'hide',
          label: 'Hide',
          icon: 'eye-off',
          color: '#6D28D9',
          onPress: () => void handleSetHidden(conversation, true),
        });
      }
      return actions;
    },
    [handleToggleMute, handleSetHidden]
  );

  /**
   * Club filter chips (ruling 2). Rendered ONLY at 2+ clubs -- with one club
   * every chip would select the whole list and say nothing.
   */
  const renderClubChips = () => {
    if (!isMultiClub) return null;
    return (
      <View
        style={styles.clubChipsRow}
        onStartShouldSetResponderCapture={consumeChromeTap}
      >
        <TouchableOpacity
          style={[styles.clubChip, !clubFilter && styles.clubChipActive]}
          onPress={() => setClubFilter(null)}
        >
          <Text
            style={[
              styles.clubChipText,
              !clubFilter && styles.clubChipTextActive,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        {userClubs.map((club) => (
          <TouchableOpacity
            key={club.id}
            style={[
              styles.clubChip,
              clubFilter === club.id && styles.clubChipActive,
            ]}
            onPress={() =>
              setClubFilter(clubFilter === club.id ? null : club.id)
            }
          >
            <Text
              style={[
                styles.clubChipText,
                clubFilter === club.id && styles.clubChipTextActive,
              ]}
              numberOfLines={1}
            >
              {club.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  /**
   * "Hidden (n)" at the bottom of Recent (ruling 8). Shown only when n > 0,
   * collapsed by default, and each expanded row swipes to Unhide.
   *
   * The count is `hiddenRows.length` straight from the one classification
   * pass, so it cannot disagree with what expanding actually shows.
   */
  const renderHiddenSection = () => {
    if (hiddenConversations.length === 0) return null;
    return (
      <View style={styles.hiddenSection}>
        <View onStartShouldSetResponderCapture={consumeChromeTap}>
        <TouchableOpacity
          style={styles.hiddenHeader}
          onPress={() => setHiddenExpanded((open) => !open)}
          activeOpacity={0.7}
        >
          <Feather
            name={hiddenExpanded ? 'chevron-down' : 'chevron-right'}
            size={16}
            color="#9CA3AF"
          />
          <Text style={styles.hiddenHeaderText}>
            Hidden ({hiddenConversations.length})
          </Text>
        </TouchableOpacity>
        </View>
        {hiddenExpanded &&
          hiddenConversations.map((item) => (
            <SwipeableChatRow
              key={item.id}
              rowKey={`hidden-${item.id}`}
              openKey={openSwipeKey}
              onOpen={setOpenSwipeKey}
              dragActiveRef={swipeDragActiveRef}
              actions={[
                {
                  key: 'unhide',
                  label: 'Unhide',
                  icon: 'eye',
                  color: '#6D28D9',
                  onPress: () => void handleSetHidden(item, false),
                },
              ]}
            >
              <ConversationItem
                conversation={item}
                onPress={() => handleConversationPress(item)}
                showClubName={isMultiClub}
                /* P4: dim lives HERE -- on the section, not on hidden_at. */
                dimmed
              />
            </SwipeableChatRow>
          ))}
      </View>
    );
  };

  /**
   * A (Lu, 2026-10-21): opening a chat whose member row still has `hidden_at`
   * set clears it, through the SAME server function Hide and Unhide use --
   * `set_channel_hidden(p_channel_id, p_hidden)`, wrapped by
   * `setChannelHidden` in lib/hiddenChats.ts:110-126, which is the app's only
   * hide write (grep-proven: one rpc call, zero direct `hidden_at` UPDATEs).
   * No new function, no new argument.
   *
   * FIRE AND FORGET. It is started AFTER the navigation call, it is never
   * awaited, and a failure is logged and nothing else -- opening a chat must
   * not wait on it and must not fail with it. A refusal cannot happen in
   * practice: only a dm/group_dm can be hidden in the first place
   * (`canHideChannelType`), so the row being cleared is always one the server
   * accepts.
   *
   * `refresh()` afterwards is what makes the row normal and "Hidden (n)"
   * right; it is the same refetch Mute already triggers, and it now costs no
   * layout shift (P1).
   */
  const clearStaleHidden = useCallback(
    (conversation: EnrichedConversation) => {
      const hiddenAt = conversation.hiddenAt;
      /*
       * Fire when the row IS hidden, and also when the row cannot say --
       * `undefined` means `get_my_conversations` did not return the column, so
       * the only honest answer is "unknown". In that case the clear is still
       * safe and still idempotent: `set_channel_hidden` always ALLOWS
       * unhiding (the hideable check is `IF p_hidden AND NOT ...`), and
       * `SET hidden_at = NULL` on a row that is already NULL writes the same
       * value. Restricted to chats that can be hidden at all, so a team or
       * club chat never triggers a pointless write.
       */
      const unknown = hiddenAt === undefined;
      const shouldClear =
        !!hiddenAt ||
        (unknown && canHideChannelType(conversation.channel_type));
      if (!shouldClear) {
        // The skip prints too, or a tap that does nothing would again leave
        // nothing to read -- which is the whole reason Oct 21 was a mystery.
        // `hiddenAt=null` means the server answered "not hidden for this
        // member"; `hiddenAt=undefined` would mean the column never arrived.
        if (__DEV__) {
          // eslint-disable-next-line no-console -- dev-only hide diagnostic
          console.log(
            `[hide] clear-on-open ${conversation.id} hiddenAt=${String(
              hiddenAt
            )} → skipped (not hidden)`
          );
        }
        return;
      }
      void (async () => {
        const result = await setChannelHidden(conversation.id, false);
        if (__DEV__) {
          // One line, on purpose: the next device tap prints its own proof.
          // eslint-disable-next-line no-console -- dev-only hide diagnostic
          console.log(
            `[hide] clear-on-open ${conversation.id} hiddenAt=${String(hiddenAt)} → ` +
              (result.status === 'ok'
                ? 'rpc ok'
                : `rpc error ${
                    result.status === 'refused'
                      ? result.message
                      : (result.error as { message?: string } | null)?.message ??
                        'unknown'
                  }`)
          );
        }
        if (result.status === 'error') {
          logError('ChatScreen.clearStaleHiddenOnOpen', result.error, {
            channelId: conversation.id,
          });
          return;
        }
        if (result.status === 'refused') {
          logError(
            'ChatScreen.clearStaleHiddenOnOpen',
            new Error(result.message),
            { channelId: conversation.id }
          );
          return;
        }
        refresh();
      })();
    },
    [refresh]
  );

  const handleConversationPress = (conversation: EnrichedConversation) => {
    // Close trigger 3 (fix 4): no row stays open behind an opened chat.
    setOpenSwipeKey(null);
    if (conversation.displayType === 'dm') {
      navigation.navigate('DMChat', { channelId: conversation.id });
    } else {
      navigation.navigate('TeamChatRoom', {
        channelId: conversation.id,
        channelName: conversation.displayName,
        teamName: conversation.displaySubtitle || undefined,
        channelType: conversation.channel_type,
      });
    }
    // After the navigate, never before it (A).
    clearStaleHidden(conversation);
  };

  // Block the screen only before the first fetch resolves. Refetches (focus,
  // realtime, pull-to-refresh) keep the existing rows on screen and show a thin
  // top bar instead of blanking the list.
  const hasRows = conversations.length > 0 || pastConversations.length > 0;
  const teamsLoaded = !teamsLoading;
  if ((loading || teamsLoading) && !hasRows && !hasLoadedOnce) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading conversations...</Text>
      </View>
    );
  }

  const renderModalContent = () => {
    if (newChatStep === 'choose') {
      return (
        <View style={styles.modalInner}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choose Message Type</Text>
            <TouchableOpacity onPress={closeModal}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={true}
          >
            <TouchableOpacity
              style={styles.typeOption}
              onPress={() => {
                setNewChatStep('dm');
                setDmSearchQuery('');
                setDmSearchResults([]);
              }}
            >
              <View style={[styles.typeIconContainer, { backgroundColor: '#3B82F620' }]}>
                <Text style={styles.typeIcon}>👤</Text>
              </View>
              <View style={styles.typeContent}>
                <Text style={styles.typeTitle}>Direct Message</Text>
                <Text style={styles.typeDescription}>Message one person privately</Text>
              </View>
              <Text style={styles.typeArrow}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.typeOption}
              onPress={() => {
                setNewChatStep('group');
                setGroupName('');
                setSelectedGroupUsers([]);
                setExistingGroupMatch(null);
              }}
            >
              <View style={[styles.typeIconContainer, { backgroundColor: '#8B5CF620' }]}>
                <Text style={styles.typeIcon}>👥</Text>
              </View>
              <View style={styles.typeContent}>
                <Text style={styles.typeTitle}>Group Message</Text>
                <Text style={styles.typeDescription}>Create a named group with selected people</Text>
              </View>
              <Text style={styles.typeArrow}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.typeOption}
              onPress={() => setNewChatStep('team')}
            >
              <View style={[styles.typeIconContainer, { backgroundColor: '#10B98120' }]}>
                <Text style={styles.typeIcon}>📢</Text>
              </View>
              <View style={styles.typeContent}>
                <Text style={styles.typeTitle}>Team Channel</Text>
                <Text style={styles.typeDescription}>Open an existing team channel</Text>
              </View>
              <Text style={styles.typeArrow}>→</Text>
            </TouchableOpacity>
            {isClubAdmin && (
              <>
                <View style={styles.divider} />
                <Text style={styles.adminLabel}>👑 Club Admin</Text>
                <TouchableOpacity
                  style={styles.typeOption}
                  onPress={() => {
                    fetchClubTeams();
                    setNewChatStep('club');
                    setClubWideMode('all');
                    setFilterType(null);
                    setSelectedAgeGroups([]);
                    setSelectedGenders([]);
                    setSelectedTeamIds([]);
                  }}
                >
                  <View style={[styles.typeIconContainer, { backgroundColor: '#F59E0B20' }]}>
                    <Text style={styles.typeIcon}>📣</Text>
                  </View>
                  <View style={styles.typeContent}>
                    <Text style={styles.typeTitle}>Club-Wide Message</Text>
                    <Text style={styles.typeDescription}>Send to all members of your club</Text>
                  </View>
                  <Text style={styles.typeArrow}>→</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.typeOption}
                  onPress={() => {
                    if (clubId) {
                      closeModal();
                      navigation.navigate('StaffMessage', { clubId });
                    } else {
                      Alert.alert(
                        'Unable to Load',
                        'Club information could not be loaded. Please try again.'
                      );
                    }
                  }}
                >
                  <View style={[styles.typeIconContainer, { backgroundColor: '#f59e0b' }]}>
                    <Feather name="users" size={24} color="#fff" />
                  </View>
                  <View style={styles.typeContent}>
                    <Text style={styles.typeTitle}>Staff Message</Text>
                    <Text style={styles.typeDescription}>Message coaches & managers</Text>
                  </View>
                  <Text style={styles.typeArrow}>→</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      );
    }

    if (newChatStep === 'dm') {
      return (
        <View style={styles.modalInner}>
          <View style={styles.stepHeader}>
            <TouchableOpacity onPress={() => setNewChatStep('choose')}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.stepTitle}>New Direct Message</Text>
            <View style={{ width: 50 }} />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name..."
            placeholderTextColor="#6B7280"
            value={dmSearchQuery}
            onChangeText={(text) => {
              setDmSearchQuery(text);
              queueDmSearch(text);
            }}
            autoFocus={false}
            returnKeyType="search"
          />
          <FlatList
            data={dmSearchResults}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={styles.modalFlatList}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.searchResultItem}
                onPress={() => handleSelectDMUser(item)}
              >
                <View style={[styles.resultAvatar, { backgroundColor: '#3B82F6' }]}>
                  <Text style={styles.resultInitial}>
                    {item.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </Text>
                </View>
                <View style={styles.resultContent}>
                  <Text style={styles.resultName}>{item.full_name}</Text>
                  {item.role ? (
                    <Text style={styles.resultRole}>{formatRoleLabel(item.role)}</Text>
                  ) : null}
                </View>
                {item.existingChannelId ? (
                  <Text style={styles.existingBadge}>Open Chat →</Text>
                ) : null}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              isSearchingDm ? (
                <View style={styles.searchSpinner}>
                  <ActivityIndicator size="small" color="#8b5cf6" />
                </View>
              ) : dmSearchQuery.trim().length >= 2 ? (
                <Text style={styles.emptyText}>No users found</Text>
              ) : (
                <Text style={styles.hintText}>Type a name to search</Text>
              )
            }
          />
        </View>
      );
    }

    if (newChatStep === 'group') {
      // Chips describe the list in front of the user: a group with nobody in
      // it gets no chip, and a chip that vanishes mid-search cannot leave the
      // list filtered to an empty set -- the filter falls back to All.
      const availableRoleGroups = presentRoleGroups(groupSearchResults);
      const activeRoleFilter =
        groupRoleFilter !== 'all' && availableRoleGroups.includes(groupRoleFilter)
          ? groupRoleFilter
          : 'all';
      const visibleGroupResults =
        activeRoleFilter === 'all'
          ? groupSearchResults
          : groupSearchResults.filter((p) => p.roleGroup === activeRoleFilter);

      return (
        <View style={styles.modalInner}>
          <View style={styles.stepHeader}>
            <TouchableOpacity onPress={() => setNewChatStep('choose')}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.stepTitle}>New Group</Text>
            <View style={{ width: 50 }} />
          </View>
          <Text style={styles.inputLabel}>Group Name</Text>
          <TextInput
            style={[styles.searchInput, { borderColor: '#8B5CF6', borderWidth: 1 }]}
            placeholder="e.g., Defenders, Parents, Coaches"
            placeholderTextColor="#6B7280"
            value={groupName}
            onChangeText={setGroupName}
            maxLength={CHANNEL_NAME_MAX}
          />
          {selectedGroupUsers.length > 0 && (
            <View style={styles.chipsSection}>
              <Text style={styles.chipsLabel}>
                Selected ({selectedGroupUsers.length}):
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipsScrollView}
                contentContainerStyle={styles.chipsScrollContent}
              >
                {selectedGroupUsers.map((u) => (
                  <View key={u.id} style={styles.chipCompact}>
                    <Text style={styles.chipTextCompact} numberOfLines={1}>
                      {u.full_name?.split(' ')[0]}
                    </Text>
                    <TouchableOpacity onPress={() => removeUserFromGroup(u.id)}>
                      <Text style={styles.chipRemoveCompact}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
          {existingGroupMatch && (
            <View style={styles.existingGroupWarning}>
              <Text style={styles.warningText}>
                ℹ️ A group with these members exists: "{existingGroupMatch.name}"
              </Text>
              <View style={styles.warningButtons}>
                <TouchableOpacity
                  style={styles.warningButtonPrimary}
                  onPress={() => {
                    closeModal();
                    navigation.navigate('TeamChatRoom', {
                      channelId: existingGroupMatch.id,
                      channelName: existingGroupMatch.name,
                      teamName: undefined,
                      channelType: 'group_dm',
                    });
                  }}
                >
                  <Text style={styles.warningButtonText}>Open Existing</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.warningButtonSecondary}
                  onPress={() => setExistingGroupMatch(null)}
                >
                  <Text style={styles.warningButtonTextSecondary}>Create New Anyway</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <Text style={styles.inputLabel}>Add People</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name..."
            placeholderTextColor="#6B7280"
            value={groupSearchQuery}
            onChangeText={(text) => {
              setGroupSearchQuery(text);
              queueGroupSearch(text);
            }}
          />
          {/* Client-side only: these chips filter the rows already loaded,
              they never re-query. "All" shows whenever any group does. */}
          {availableRoleGroups.length > 0 ? (
            <View style={styles.roleChipRow}>
              <TouchableOpacity
                style={[
                  styles.roleChip,
                  activeRoleFilter === 'all' && styles.roleChipActive,
                ]}
                onPress={() => setGroupRoleFilter('all')}
                accessibilityRole="button"
                accessibilityState={{ selected: activeRoleFilter === 'all' }}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    activeRoleFilter === 'all' && styles.roleChipTextActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>

              {availableRoleGroups.map((group) => (
                <TouchableOpacity
                  key={group}
                  style={[
                    styles.roleChip,
                    activeRoleFilter === group && styles.roleChipActive,
                  ]}
                  onPress={() => setGroupRoleFilter(group)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activeRoleFilter === group }}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      activeRoleFilter === group && styles.roleChipTextActive,
                    ]}
                  >
                    {CONTACT_ROLE_GROUP_LABELS[group]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <FlatList
            data={visibleGroupResults}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            // Dragging the member list dismisses the keyboard. Tapping the
            // overlay is NOT an option here -- it closes the whole modal and
            // discards the half-filled group.
            keyboardDismissMode="on-drag"
            // No minHeight: with the keyboard up the modal has ~55% of the
            // screen for header + name field + chips + this list + the Create
            // button. A floor of 120 here kept the list at full size and pushed
            // "Create Group" off the bottom of the fixed-height container.
            // The role chip row takes ~38px when it is shown, so the list
            // gives exactly that back and the total height does not move.
            style={{ maxHeight: availableRoleGroups.length > 0 ? 142 : 180 }}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              isSearchingGroup ? (
                <View style={styles.searchSpinner}>
                  <ActivityIndicator size="small" color="#8b5cf6" />
                </View>
              ) : groupSearchQuery.trim().length >= 2 ? (
                <Text style={styles.emptyText}>No results</Text>
              ) : (
                <Text style={styles.hintText}>Search to add people</Text>
              )
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.searchResultItem}
                onPress={() => addUserToGroup(item)}
              >
                <View style={[styles.resultAvatar, { backgroundColor: '#8B5CF6' }]}>
                  <Text style={styles.resultInitial}>
                    {item.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </Text>
                </View>
                <Text style={styles.resultName}>{item.full_name}</Text>
                <Text style={styles.addIcon}>+</Text>
              </TouchableOpacity>
            )}
          />
          {selectedGroupUsers.length >= 1 && groupName.trim() && !existingGroupMatch && (
            <TouchableOpacity style={styles.createButton} onPress={createGroup}>
              <Text style={styles.createButtonText}>
                Create Group ({selectedGroupUsers.length + 1} members)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (newChatStep === 'club') {
      const toggleGender = (g: string) => {
        setSelectedGenders((prev) =>
          prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
        );
      };
      const toggleAge = (age: string) => {
        setSelectedAgeGroups((prev) =>
          prev.includes(age) ? prev.filter((a) => a !== age) : [...prev, age]
        );
      };
      const selectAllTeams = () => {
        const matchingIds = matchingTeams.map((t: any) => t.id);
        const allSelected = matchingIds.every((id: string) =>
          selectedTeamIds.includes(id)
        );
        if (allSelected) {
          setSelectedTeamIds((prev) =>
            prev.filter((id) => !matchingIds.includes(id))
          );
        } else {
          setSelectedTeamIds((prev) => [
            ...new Set([...prev, ...matchingIds]),
          ]);
        }
      };
      const toggleTeam = (id: string) => {
        setSelectedTeamIds((prev) =>
          prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
        );
      };

      return (
        <View style={styles.fullScreenContainer}>
          <View style={styles.clubHeader}>
            <TouchableOpacity
              onPress={() => setNewChatStep('choose')}
              style={styles.backButton}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.clubTitle}>Club-Wide Message</Text>
          </View>

          <FlatList
            data={clubWideMode === 'filter' ? matchingTeams : []}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={styles.clubListContent}
            ListHeaderComponent={() => (
              <View>
                <Text style={styles.sectionLabel}>Send to:</Text>

                <TouchableOpacity
                  style={[
                    styles.optionCard,
                    clubWideMode === 'all' && styles.optionCardSelected,
                  ]}
                  onPress={() => {
                    setClubWideMode('all');
                    setSelectedTeamIds(clubTeams.map((t: any) => t.id));
                  }}
                >
                  <View style={styles.optionContent}>
                    <Text style={styles.optionTitle}>All Club Members</Text>
                    <Text style={styles.optionSubtitle}>
                      {clubTeams.length} teams, all members
                    </Text>
                  </View>
                  {clubWideMode === 'all' && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.optionCard,
                    clubWideMode === 'filter' && styles.optionCardSelected,
                  ]}
                  onPress={() => {
                    setClubWideMode('filter');
                    setSelectedTeamIds([]);
                  }}
                >
                  <View style={styles.optionContent}>
                    <Text style={styles.optionTitle}>Filter Recipients</Text>
                    <Text style={styles.optionSubtitle}>
                      By age group, gender, or specific teams
                    </Text>
                  </View>
                  {clubWideMode === 'filter' && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>

                {clubWideMode === 'filter' && (
                  <View style={styles.filtersContainer}>
                    <Text style={styles.filterTitle}>GENDER</Text>
                    <View style={styles.chipRow}>
                      {['male', 'female', 'coed'].map((g) => (
                        <TouchableOpacity
                          key={g}
                          style={[
                            styles.chip,
                            selectedGenders.includes(g) && styles.chipSelected,
                          ]}
                          onPress={() => toggleGender(g)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              selectedGenders.includes(g) && styles.chipTextSelected,
                            ]}
                          >
                            {g === 'male' ? 'Boys' : g === 'female' ? 'Girls' : 'Coed'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.filterTitle}>AGE GROUP</Text>
                    <View style={styles.chipRow}>
                      {ageGroups.map((age: string) => (
                        <TouchableOpacity
                          key={age}
                          style={[
                            styles.chip,
                            selectedAgeGroups.includes(age) && styles.chipSelected,
                          ]}
                          onPress={() => toggleAge(age)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              selectedAgeGroups.includes(age) && styles.chipTextSelected,
                            ]}
                          >
                            {age}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={styles.teamsHeader}>
                      <Text style={styles.filterTitle}>
                        TEAMS ({matchingTeams.length})
                      </Text>
                      <TouchableOpacity onPress={selectAllTeams}>
                        <Text style={styles.clubSelectAllText}>
                          {matchingTeams.every((t: any) =>
                            selectedTeamIds.includes(t.id)
                          )
                            ? 'Deselect All'
                            : 'Select All'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
            renderItem={({ item: team }: { item: any }) => (
              <TouchableOpacity
                style={styles.teamRow}
                onPress={() => toggleTeam(team.id)}
              >
                <View
                  style={[
                    styles.clubCheckbox,
                    selectedTeamIds.includes(team.id) && styles.clubCheckboxSelected,
                  ]}
                >
                  {selectedTeamIds.includes(team.id) && (
                    <Text style={styles.clubCheckmark}>✓</Text>
                  )}
                </View>
                <View style={styles.teamInfo}>
                  <Text style={styles.teamName}>{team.name}</Text>
                  <Text style={styles.teamMeta}>
                    {team.age_group} •{' '}
                    {getGenderLabel(normalizeGender(team.gender) ?? '')}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={() =>
              clubWideMode === 'filter' ? (
                <Text style={styles.emptyText}>No teams match your filters</Text>
              ) : null
            }
          />

          <View style={styles.fixedBottom}>
            <TouchableOpacity
              style={[
                styles.sendButton,
                !canSendClubWide() && styles.sendButtonDisabled,
              ]}
              onPress={sendClubWideMessage}
              disabled={!canSendClubWide()}
            >
              <Text style={styles.sendButtonText}>
                {clubWideMode === 'all'
                  ? `Send to All (${clubTeams.length} teams)`
                  : `Send to ${getSelectedTeamCount()} teams`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (newChatStep === 'team') {
      return (
        <View style={styles.modalInner}>
          <View style={styles.stepHeader}>
            <TouchableOpacity onPress={() => setNewChatStep('choose')}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.stepTitle}>Select Team Channel</Text>
            <View style={{ width: 50 }} />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search teams..."
            placeholderTextColor="#6B7280"
            value={teamChannelSearch}
            onChangeText={setTeamChannelSearch}
          />
          <FlatList
            data={filteredTeamChannels}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={styles.modalFlatList}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.teamChannelItem}
                onPress={() => {
                  closeModal();
                  navigation.navigate('TeamChatRoom', {
                    channelId: item.id,
                    channelName: item.name,
                    teamName: item.team?.name || undefined,
                    channelType: item.channel_type,
                  });
                }}
              >
                <Text style={styles.hashIcon}>#</Text>
                <View style={styles.teamChannelContent}>
                  {/* Its container is flex:1, so an unbroken 100-char name
                      char-wrapped into a very tall row instead of running off
                      screen. One line, same as every other chat list row. */}
                  <Text style={styles.teamChannelName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.teamChannelTeam}>
                    {item.team?.name || 'Club Channel'}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No channels found</Text>
            }
          />
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      <View
        style={styles.header}
        onStartShouldSetResponderCapture={consumeChromeTap}
      >
        <Text style={styles.headerTitle}>Conversations</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <NotificationBell />
          <TouchableOpacity
            style={styles.newButton}
            onPress={() => setShowNewChatModal(true)}
          >
            <Text style={styles.newButtonText}>+ New</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={styles.tabContainer}
        onStartShouldSetResponderCapture={consumeChromeTap}
      >
        <TouchableOpacity
          style={[styles.tab, activeTab === 'recent' && styles.tabActive]}
          onPress={() => setActiveTab('recent')}
        >
          <Text style={[styles.tabText, activeTab === 'recent' && styles.tabTextActive]}>
            Recent
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'byTeam' && styles.tabActive]}
          onPress={() => setActiveTab('byTeam')}
        >
          <Text style={[styles.tabText, activeTab === 'byTeam' && styles.tabTextActive]}>
            By Team
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, styles.tabPast, activeTab === 'past' && styles.tabActive]}
          onPress={() => setActiveTab('past')}
        >
          <Text style={[styles.tabText, activeTab === 'past' && styles.tabTextActive]}>
            Past
          </Text>
        </TouchableOpacity>
      </View>

      {/* P1 (Lu, Oct 21): the busy state for a REFETCH floats over the list,
          it is never inserted into it. This used to be a plain sibling --
          `styles.refreshBar`, paddingVertical 6 -- between the tab bar and the
          list, so every Mute/Unmute (which calls refresh()) pushed every card
          down by the bar's height for about a second and then pulled them
          back up. A refetch must never change layout. The wrapper below is
          what the overlay positions against; the list keeps flex: 1, so no
          card moves. */}
      <View style={styles.listArea}>
        {loading && hasRows && !refreshing ? (
          <View style={styles.refreshOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color="#8b5cf6" />
          </View>
        ) : null}

      {teamsLoaded && hasLoadedOnce && !hasRows ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyTitle}>No Conversations</Text>
          <Text style={styles.emptyText}>
            Tap "+ New" to start a direct message, group chat, or open a team channel.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => setShowNewChatModal(true)}
          >
            <Text style={styles.emptyButtonText}>Start a conversation</Text>
          </TouchableOpacity>
        </View>
      ) : activeTab === 'recent' ? (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SwipeableChatRow
              rowKey={item.id}
              openKey={openSwipeKey}
              onOpen={setOpenSwipeKey}
              dragActiveRef={swipeDragActiveRef}
              actions={swipeActionsFor(item)}
            >
              <ConversationItem
                conversation={item}
                onPress={() => handleConversationPress(item)}
                showClubName={isMultiClub}
              />
            </SwipeableChatRow>
          )}
          ListHeaderComponent={renderClubChips()}
          ListFooterComponent={renderHiddenSection()}
          /* Close trigger 2 (fix 4): scrolling closes any open row -- UNLESS
             the "scroll" is the scroll view twitching inside a swipe already
             in progress (fix 5), which used to close the row the user was in
             the middle of opening. */
          onScrollBeginDrag={() => {
            if (swipeDragActiveRef.current) return;
            setOpenSwipeKey(null);
          }}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#8b5cf6"
            />
          }
        />
      ) : activeTab === 'past' ? (
        pastConversations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📁</Text>
            <Text style={styles.emptyTitle}>No past team chats</Text>
          </View>
        ) : (
          <FlatList
            data={pastConversations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              /* No swipe on Past (ruling 4): these chats are read-only
                 history, and muting or hiding a retired team's chat is not an
                 action the rulings asked for. */
              <ConversationItem
                conversation={item}
                onPress={() => handleConversationPress(item)}
                showClubName={isMultiClub}
                pastTeam
              />
            )}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#8b5cf6"
              />
            }
          />
        )
      ) : (
        <SectionList
          sections={teamSections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search teams..."
                placeholderTextColor="#6B7280"
                value={teamSearchQuery}
                onChangeText={setTeamSearchQuery}
              />
            </View>
          }
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.teamSectionHeader}>
              <Text style={styles.teamSectionTitle}>{title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <SwipeableChatRow
              rowKey={item.id}
              openKey={openSwipeKey}
              onOpen={setOpenSwipeKey}
              dragActiveRef={swipeDragActiveRef}
              actions={swipeActionsFor(item)}
            >
              <ConversationItem
                conversation={item}
                onPress={() => handleConversationPress(item)}
                showClubName={isMultiClub}
              />
            </SwipeableChatRow>
          )}
          /* Close trigger 2 (fix 4): scrolling closes any open row -- UNLESS
             the "scroll" is the scroll view twitching inside a swipe already
             in progress (fix 5), which used to close the row the user was in
             the middle of opening. */
          onScrollBeginDrag={() => {
            if (swipeDragActiveRef.current) return;
            setOpenSwipeKey(null);
          }}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#8b5cf6"
            />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No conversations match your search</Text>
          }
        />
      )}
      </View>

      <Modal
        visible={showNewChatModal}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <TouchableWithoutFeedback onPress={closeModal}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardAvoidingView}
                keyboardVerticalOffset={0}
              >
                <View style={styles.modalContent}>
                  {renderModalContent()}
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  /* P1: the list area is the positioning parent for the refetch overlay. It
     takes the space the list already had -- the list itself is flex: 1. */
  listArea: {
    flex: 1,
  },
  /* P1: OUT of the flow. `styles.refreshBar` was `paddingVertical: 6` in the
     column, which is exactly what pushed the cards down on every refetch. */
  refreshOverlay: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  searchSpinner: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 16,
    paddingTop: 60,
    backgroundColor: '#1a1a2e',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  newButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  newButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 8,
    marginBottom: 16,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabPast: {
    flex: 0.85,
  },
  tabActive: {
    backgroundColor: '#8B5CF6',
  },
  tabText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#fff',
  },
  searchContainer: {
    marginHorizontal: 8,
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 15,
  },
  listContent: {
    paddingHorizontal: 8,
    paddingBottom: 100,
  },
  sectionHeader: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    paddingLeft: 4,
  },
  teamSectionHeader: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 10,
    marginTop: 8,
  },
  teamSectionTitle: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // R-M: the 4pt left bar was already here; what changed is the colour a team
  // channel passes into `borderLeftColor` (resolveTeamColor, see
  // getChannelColor).
  conversationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  // R-M: the team dot, before the channel name on a team card only.
  chatTeamDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 7,
    flexShrink: 0,
  },
  /* P4: the ONE dim. Applied for the Past tab (`pastTeam`) and for rows
     rendered inside the "Hidden (n)" section (`dimmed`) -- never from a row's
     own data. Was `conversationCardPast`; renamed because it is no longer only
     the Past tab's. */
  conversationCardDimmed: {
    opacity: 0.6,
  },
  pastChannelPrefixIcon: {
    marginRight: 6,
  },
  conversationNamePast: {
    fontSize: 14,
  },
  pastTeamSubtitle: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
  },
  pastUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6B7280',
    marginBottom: 4,
  },
  conversationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  /* Club filter chips (ruling 2), above the Recent list. */
  clubChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  clubChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#374151',
    maxWidth: 160,
  },
  clubChipActive: {
    backgroundColor: '#8b5cf6',
  },
  clubChipText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  clubChipTextActive: {
    color: '#fff',
  },
  /* "Hidden (n)" at the bottom of Recent (ruling 8). */
  hiddenSection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    paddingTop: 8,
  },
  hiddenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  hiddenHeaderText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  /* Swipe-left actions (ruling 4). The action strip sits UNDER the card and is
     revealed as the card slides left, so the card itself needs an opaque
     background -- conversationCard already has one. It is INSET to the card's
     own box (marginHorizontal 12, marginBottom 10, borderRadius 12) so that
     even while open it cannot paint the gutters between cards, and it is
     mounted only while the row is open or dragging (fix 2, Oct 20). */
  swipeContainer: {
    position: 'relative',
    overflow: 'hidden',
  },
  swipeActions: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 10,
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
  },
  swipeAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  swipeActionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  /* Line 3: how many people are in this chat, worded ("2 members"). It was a
     bare number on line 1, which read as an unread count (fix 5, Oct 20). */
  memberCount: {
    color: '#6B7280',
    fontSize: 12,
  },
  /* Line 3: unread badge, mute icon, member count and club name on one row. */
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  cardClubName: {
    color: '#9CA3AF',
    fontSize: 11,
    flexShrink: 1,
  },
  badgeCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  badgeInitials: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  badgeEmoji: {
    fontSize: 18,
  },
  badgeTeamIcon: {
    fontSize: 16,
  },
  chatIcon: {
    fontSize: 18,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  conversationContent: {
    flex: 1,
    minWidth: 0,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // Bold on every card, read or unread -- the unread badge is the unread
  // signal, so the title does not also have to carry it.
  conversationName: {
    color: '#cbd5e1',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  conversationNameUnread: {
    color: '#fff',
  },
  conversationTime: {
    color: '#6B7280',
    fontSize: 12,
  },
  lastMessage: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 4,
  },
  lastMessageUnread: {
    color: '#94a3b8',
    fontWeight: '500',
  },
  conversationRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  chevron: {
    color: '#6B7280',
    fontSize: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#8B5CF6',
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  keyboardAvoidingView: {
    width: '100%',
    height: '95%',
    maxHeight: '95%',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    height: '95%',
    maxHeight: '95%',
  },
  modalInner: {
    flex: 1,
    padding: 20,
    paddingBottom: 0,
  },
  // Role filter chips for the add-people list. Inactive chips sit a shade
  // darker than the sheet, like the search field above them -- on the sheet
  // colour they were invisible.
  roleChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
  },
  roleChipActive: {
    borderColor: '#8b5cf6',
    backgroundColor: '#8b5cf6',
  },
  roleChipText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  roleChipTextActive: {
    color: '#fff',
  },
  fixedBottomButton: {
    padding: 16,
    paddingBottom: 24,
    backgroundColor: '#1F2937',
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  modalClose: {
    color: '#9CA3AF',
    fontSize: 28,
    padding: 4,
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  typeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  typeIcon: {
    fontSize: 22,
  },
  typeContent: {
    flex: 1,
  },
  typeTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  typeDescription: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 2,
  },
  typeArrow: {
    color: '#6B7280',
    fontSize: 20,
  },
  divider: {
    height: 1,
    backgroundColor: '#374151',
    marginVertical: 16,
  },
  adminLabel: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backText: {
    color: '#8B5CF6',
    fontSize: 16,
  },
  stepTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  inputLabel: {
    color: '#9CA3AF',
    fontSize: 13,
    marginBottom: 8,
    marginTop: 12,
  },
  modalFlatList: {
    minHeight: 150,
    maxHeight: 250,
  },
  modalFlatListShort: {
    minHeight: 150,
    maxHeight: 200,
  },
  searchResultsList: {
    minHeight: 150,
    maxHeight: 300,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  resultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  resultInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultContent: {
    flex: 1,
  },
  resultName: {
    color: '#fff',
    fontSize: 15,
  },
  resultRole: {
    color: '#10B981',
    fontSize: 12,
    marginTop: 2,
  },
  existingBadge: {
    color: '#8B5CF6',
    fontSize: 12,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  chipsSection: {
    marginVertical: 8,
  },
  chipsLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 6,
  },
  chipsScrollView: {
    maxHeight: 40,
  },
  chipsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 20,
  },
  chipCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF620',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    maxWidth: 120,
  },
  chipTextCompact: {
    color: '#8B5CF6',
    fontSize: 13,
    maxWidth: 80,
  },
  chipRemoveCompact: {
    color: '#8B5CF6',
    marginLeft: 6,
    fontSize: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF620',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    color: '#8B5CF6',
    fontSize: 13,
    fontWeight: '500',
  },
  chipRemove: {
    color: '#8B5CF6',
    marginLeft: 8,
    fontSize: 14,
  },
  existingGroupWarning: {
    backgroundColor: '#F59E0B20',
    padding: 14,
    borderRadius: 10,
    marginVertical: 12,
  },
  warningText: {
    color: '#F59E0B',
    fontSize: 13,
    marginBottom: 10,
  },
  warningButtons: {
    flexDirection: 'row',
  },
  warningButtonPrimary: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 10,
  },
  warningButtonText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '600',
  },
  warningButtonSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  warningButtonTextSecondary: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  createButton: {
    backgroundColor: '#8B5CF6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  teamChannelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  hashIcon: {
    color: '#10B981',
    fontSize: 20,
    fontWeight: '700',
    marginRight: 12,
  },
  teamChannelContent: {
    flex: 1,
  },
  teamChannelName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  teamChannelTeam: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  hintText: {
    color: '#6B7280',
    textAlign: 'center',
    padding: 30,
  },
  addIcon: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: '600',
  },
  sectionLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 12,
    marginTop: 8,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardSelected: {
    borderColor: '#8B5CF6',
  },
  optionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  optionSubtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 2,
  },
  checkmark: {
    color: '#8B5CF6',
    fontSize: 20,
    fontWeight: '700',
  },
  filterSection: {
    flex: 1,
    marginTop: 16,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  clubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  backButton: {
    marginRight: 12,
  },
  backButtonText: {
    color: '#8B5CF6',
    fontSize: 16,
  },
  clubTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  clubListContent: {
    padding: 16,
    paddingBottom: 100,
  },
  filtersContainer: {
    marginTop: 16,
  },
  filterTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipSelected: {
    backgroundColor: '#8B5CF6',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  teamsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  clubSelectAllText: {
    color: '#8B5CF6',
    fontSize: 14,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  clubCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#6B7280',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clubCheckboxSelected: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  clubCheckmark: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  teamMeta: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  fixedBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 24,
    backgroundColor: '#1a1a2e',
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  filterLabel: {
    color: '#9CA3AF',
    fontSize: 13,
    marginBottom: 10,
  },
  filterRowLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterSectionTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 4,
    gap: 8,
  },
  ageChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  filterChipSelected: {
    backgroundColor: '#8B5CF620',
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  filterChipText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginLeft: 4,
  },
  filterChipTextSelected: {
    color: '#8B5CF6',
    fontWeight: '600',
  },
  filterDivider: {
    height: 1,
    backgroundColor: '#374151',
    marginVertical: 16,
  },
  matchingTeamsHeader: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterTabs: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  filterTabActive: {
    backgroundColor: '#8B5CF6',
  },
  filterTabText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  checkboxList: {
    marginTop: 8,
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  checkboxCheck: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  checkboxLabel: {
    color: '#fff',
    fontSize: 15,
    flex: 1,
  },
  checkboxCount: {
    color: '#6B7280',
    fontSize: 12,
  },
  selectAllButton: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  selectAllText: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '600',
  },
  sendButton: {
    backgroundColor: '#F59E0B',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  sendButtonDisabled: {
    backgroundColor: '#374151',
  },
  sendButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});
