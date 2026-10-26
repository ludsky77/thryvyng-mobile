import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Share,
  Alert,
  Linking,
  Animated,
  PanResponder,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import {
  AttachmentViewer,
  useAttachmentViewer,
  openExternally,
} from './AttachmentViewer';
import { logError } from '../../utils/logError';

/**
 * Splits message text into plain runs and URL runs. Capturing group so
 * String.split keeps the matches. Deliberately permissive on the body and
 * strict on the tail -- trailing punctuation is peeled off below, because
 * "see https://x.com/a." almost never means the full stop is part of the link.
 */
const URL_SPLIT = /((?:https?:\/\/|www\.)[^\s]+)/gi;
const URL_TEST = /^(?:https?:\/\/|www\.)/i;
const TRAILING_PUNCTUATION = /[.,!?;:'")\]}]+$/;

function openUrl(href: string) {
  Linking.openURL(href).catch(() => {
    Alert.alert('Could not open link', href);
  });
}

/**
 * Message text with tappable URLs. Returns a plain string when the text holds
 * no link, so the common case allocates nothing extra.
 */
function renderMessageText(
  text: string,
  linkStyle: object
): React.ReactNode {
  if (!URL_TEST.test(text) && !/(https?:\/\/|www\.)/i.test(text)) return text;

  const parts = text.split(URL_SPLIT);
  return parts.map((part, i) => {
    if (!part) return null;
    if (!URL_TEST.test(part)) return part;

    const trailing = part.match(TRAILING_PUNCTUATION)?.[0] ?? '';
    const url = trailing ? part.slice(0, -trailing.length) : part;
    if (!url) return part;

    // A bare www. link has no scheme, and Linking needs one.
    const href = /^www\./i.test(url) ? `https://${url}` : url;

    return (
      <Text key={`lnk-${i}`}>
        <Text
          style={linkStyle}
          onPress={() => openUrl(href)}
          suppressHighlighting={false}
        >
          {url}
        </Text>
        {trailing}
      </Text>
    );
  });
}

/**
 * How far right the bubble travels, and what it takes to fire the reply.
 *
 * TRAVEL and VELOCITY, the same pair the chat-list row latches on
 * (`ChatScreen.tsx`'s `SWIPE_LATCH_TRAVEL` / `SWIPE_LATCH_VELOCITY`), so one
 * flick feels the same in the list and in a thread. `MAX` is where the bubble
 * stops being dragged -- a message is not revealing buttons, so there is nothing
 * behind it to size the limit to; it is just enough travel to read as a gesture.
 */
const SWIPE_REPLY_MAX = 72;
const SWIPE_REPLY_TRAVEL = 44;
const SWIPE_REPLY_VELOCITY = 0.3;

/**
 * Swipe-right-to-reply (ruling R3, Lu 2026-10-23): "swipe-right on a message
 * bubble = Reply (quote fills the composer, same path as today's Reply). Must
 * not fight vertical scrolling: horizontal activation threshold, fail on
 * vertical movement. Haptic only if the app already uses one."
 *
 * NO HAPTIC. `grep -rn "Haptics|haptic" src` returns nothing and `expo-haptics`
 * is not a dependency, so the ruling's condition is not met and adding the
 * package would be a dependency change.
 *
 * PanResponder, not react-native-gesture-handler: RNGH is NOT installed (absent
 * from package.json) and adding it is a dependency plus a native rebuild. This
 * follows the pattern already proven in this app at
 * `src/screens/ChatScreen.tsx:197-430` (Stage 3's `SwipeableChatRow`) and
 * `src/screens/NotificationsScreen.tsx:19-64`, with the two lines that matter
 * carried over verbatim:
 *
 *   * the CAPTURE-phase claim, `|dx| > 4 && |dx| > |dy| * 1.5` -- it runs before
 *     the descendants and before the native scroll view settles on the touch, so
 *     a clearly horizontal drag is ours from the 4th pixel while an ambiguous
 *     diagonal is left to the list. That IS the "fail on vertical movement" R3
 *     asks for: a vertical drag is never claimed, so the FlatList keeps
 *     scrolling.
 *   * `onPanResponderTerminationRequest: () => false` -- RN defaults it to TRUE
 *     when absent (`PanResponder.js:550-553`), which is what let the list steal
 *     a swipe mid-gesture and produced both of Stage 3's reported symptoms.
 *
 * R4 is safe by construction: the responder is only ever claimed AFTER
 * horizontal travel, so a plain tap, a long-press and the link/attachment
 * presses inside the bubble all reach their own handlers untouched.
 *
 * `onReply` undefined ⇒ nothing is ever claimed ⇒ the swipe is OFF. That is how
 * R5 disables swipe-reply in a locked chat: the screen passes no handler.
 */
function SwipeToReply({
  onReply,
  children,
}: {
  onReply?: () => void;
  children: React.ReactNode;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  // The responder is built once, so the live handler is read through a ref --
  // reading it from the closure would pin the FIRST render's value forever.
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) =>
        !!onReplyRef.current &&
        g.dx > 4 &&
        Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      // Bubble-phase fallback, stricter on distance and looser on the ratio: a
      // drag that only turns out horizontal later is still picked up.
      onMoveShouldSetPanResponder: (_, g) =>
        !!onReplyRef.current && g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        // Rightward only, and clamped: a leftward drag is not a reply and must
        // not pull the bubble out of its own column.
        translateX.setValue(Math.max(0, Math.min(SWIPE_REPLY_MAX, g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        const fired =
          g.dx > SWIPE_REPLY_TRAVEL || g.vx > SWIPE_REPLY_VELOCITY;
        // Always spring back: unlike the chat-list row there is nothing to latch
        // open -- the action happens and the bubble returns.
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
        if (fired) onReplyRef.current?.();
      },
      // Termination is no longer something the list can ASK for, but it can
      // still arrive unasked (an unmount, Android blocking the native
      // responder), so the bubble is put back.
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  if (!onReply) return <>{children}</>;

  return (
    <View>
      {/* The reply arrow revealed under the travelling bubble. Fades in with
          the drag so the gesture says what it will do before it fires.
          pointerEvents none: it is a hint, never a target. */}
      <Animated.View
        style={[styles.swipeReplyHint, { opacity: translateX.interpolate({
          inputRange: [0, SWIPE_REPLY_TRAVEL],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        }) }]}
        pointerEvents="none"
      >
        <Feather name="corner-up-left" size={18} color="#A78BFA" />
      </Animated.View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

export interface ReactionSummary {
  reaction: string;
  count: number;
  userReacted: boolean;
}

interface MessageAttachmentShape {
  file_url: string;
  file_type: string;
  file_name: string;
  file_size?: number | null;
}

const MAX_DOC_NAME_CHARS = 28;

/** Keep the start and the extension visible: "quarterly_bud…report.pdf". */
function truncateMiddle(name: string, max = MAX_DOC_NAME_CHARS): string {
  if (name.length <= max) return name;
  const keep = max - 1; // room for the ellipsis
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${name.slice(0, head)}…${name.slice(name.length - tail)}`;
}

function formatFileSize(bytes?: number | null): string | null {
  if (typeof bytes !== 'number' || bytes <= 0) return null;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

interface ChatBubbleProps {
  message: {
    id: string;
    content: string;
    user_id: string;
    created_at: string;
    /** Set by useMessages.editMessage. Drives the "(edited)" marker. */
    is_edited?: boolean | null;
    edited_at?: string | null;
    comm_message_attachments?: MessageAttachmentShape[];
    attachment_url?: string | null;
    attachment_type?: 'image' | 'video' | 'document' | null;
    attachment_name?: string | null;
  };
  isOwnMessage: boolean;
  senderName?: string;
  senderAvatar?: string | null;
  senderRole?: string;
  playerLabel?: string;
  /** How to render the suffix after senderName. See useChatSenderLabels. */
  labelKind?: 'parent' | 'player' | 'staff' | null;
  showSenderInfo?: boolean;
  reactions?: ReactionSummary[];
  replyTo?: { content: string; senderName: string };
  /**
   * Long-press on the bubble. Ruling R2: this opens the ONE actions sheet, and
   * it is now the ONLY thing that does -- the ☺+ icon no longer shares it.
   */
  onLongPress?: () => void;
  /**
   * Tap on the ☺+ icon. Ruling R1 (Lu, 2026-10-23): "tapping the ☺+ icon next
   * to a message opens the emoji picker IMMEDIATELY ... No menu in between."
   * Before R1 this icon was wired to `onLongPress`, so on a team/club/group chat
   * it opened the Actions sheet and a reaction cost two taps through a menu.
   */
  onEmojiPress?: () => void;
  /**
   * Swipe-right on the bubble = Reply (ruling R3). Undefined turns the gesture
   * off entirely, which is how a locked chat disables it (R5).
   */
  onSwipeReply?: () => void;
  /**
   * Tap on the quote block: jump to the quoted message (ruling R9). The screen
   * owns the scroll, because only the screen knows the list.
   */
  onReplyPress?: () => void;
  /**
   * R9: this message is the one just jumped TO, and should flash for ~1 s. The
   * screen owns the timer; this prop is only the paint.
   */
  highlighted?: boolean;
  onReactionPress?: (reaction: string) => void;
  onShowReactionDetails?: () => void;
  readReceipts?: React.ReactNode;
}

export function ChatBubble({
  message,
  isOwnMessage,
  senderName,
  senderAvatar,
  senderRole,
  playerLabel,
  labelKind,
  showSenderInfo = true,
  reactions = [],
  replyTo,
  onLongPress,
  onEmojiPress,
  onSwipeReply,
  onReplyPress,
  highlighted = false,
  onReactionPress,
  onShowReactionDetails,
  readReceipts,
}: ChatBubbleProps) {
  const attachmentViewer = useAttachmentViewer();

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date
      .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      .toLowerCase();
  };

  const getRoleIcon = () => {
    if (!senderRole) return null;
    const role = senderRole.toLowerCase();
    if (role === 'coach' || role === 'head_coach' || role === 'assistant_coach') {
      return <Ionicons name="megaphone-outline" size={14} color="#8B5CF6" />;
    }
    if (role === 'manager' || role === 'team_manager') {
      return <Ionicons name="clipboard-outline" size={14} color="#8B5CF6" />;
    }
    if (role === 'admin' || role === 'club_admin' || role === 'platform_admin') {
      return <Feather name="shield" size={14} color="#8B5CF6" />;
    }
    return null;
  };

  // Suffix after the sender's name. Staff get the role icon above and no
  // suffix; a parent gets their child's name, a player gets a plain marker.
  // Falls back to the legacy possessive when only playerLabel is supplied.
  const renderSenderSuffix = () => {
    if (labelKind === 'staff') return null;
    if (labelKind === 'player') {
      return <Text style={styles.playerLabel}>(Player)</Text>;
    }
    if (!playerLabel) return null;
    return <Text style={styles.playerLabel}>({playerLabel}'s)</Text>;
  };

  const shareAttachment = async (url: string) => {
    try {
      await Share.share({ url, message: url });
    } catch (err) {
      logError('ChatBubble.share', err, { messageId: message.id });
      Alert.alert('Could not share', 'Sharing this file failed.');
    }
  };

  const renderAttachment = () => {
    const attachment = message.comm_message_attachments?.[0];
    const url = attachment?.file_url ?? message.attachment_url ?? null;
    const type = (attachment?.file_type ?? message.attachment_type) as
      | 'image'
      | 'video'
      | 'document'
      | undefined;
    const name = attachment?.file_name ?? message.attachment_name ?? 'Document';
    const sizeLabel = formatFileSize(attachment?.file_size);

    if (!url && !type) return null;
    const attachmentType = type ?? 'document';
    // Without a URL there is nothing to open, play or share.
    if (!url) return null;

    if (attachmentType === 'image') {
      return (
        <TouchableOpacity
          style={styles.attachmentContainer}
          onPress={() => attachmentViewer.open({ url, type: 'image', name })}
          onLongPress={() => shareAttachment(url)}
        >
          <Image
            source={{ uri: url }}
            style={styles.imageAttachment}
            resizeMode="cover"
          />
        </TouchableOpacity>
      );
    }
    if (attachmentType === 'video') {
      return (
        <TouchableOpacity
          style={styles.attachmentContainer}
          onPress={() => attachmentViewer.open({ url, type: 'video', name })}
        >
          <Video
            source={{ uri: url }}
            style={styles.imageAttachment}
            resizeMode={ResizeMode.COVER}
            shouldPlay={false}
            isMuted
            useNativeControls={false}
          />
          <View style={styles.videoOverlay} pointerEvents="none">
            <Feather name="play-circle" size={40} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        style={styles.documentAttachment}
        onPress={() => openExternally(url)}
      >
        <Feather
          name="file-text"
          size={24}
          color={isOwnMessage ? '#FFFFFF' : '#8B5CF6'}
        />
        <View style={styles.documentInfo}>
          <Text
            style={[styles.documentName, isOwnMessage && styles.ownDocumentName]}
            numberOfLines={1}
          >
            {truncateMiddle(name)}
          </Text>
          {sizeLabel ? (
            <Text
              style={[
                styles.documentSize,
                isOwnMessage && styles.ownDocumentSize,
              ]}
            >
              {sizeLabel}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => shareAttachment(url)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather
            name="download"
            size={18}
            color={isOwnMessage ? '#FFFFFF' : '#8B5CF6'}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const viewer = attachmentViewer.visible ? (
    <AttachmentViewer
      visible={attachmentViewer.visible}
      attachment={attachmentViewer.target}
      onClose={attachmentViewer.close}
    />
  ) : null;

  return (
    <View
      style={[
        styles.messageContainer,
        isOwnMessage ? styles.messageContainerOwn : styles.messageContainerOther,
      ]}
    >
      {/* Avatar - only for other's messages */}
      {!isOwnMessage && showSenderInfo && (
        <View style={styles.avatarContainer}>
          {senderAvatar ? (
            <Image source={{ uri: senderAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {senderName?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Content Column */}
      <View
        style={[
          styles.contentColumn,
          isOwnMessage ? styles.contentColumnOwn : styles.contentColumnOther,
        ]}
      >
        {/* HEADER ROW - Name + Role Icon + Time + Trigger */}
        <View
          style={[
            styles.headerRow,
            isOwnMessage ? styles.headerRowOwn : styles.headerRowOther,
          ]}
        >
          {!isOwnMessage && showSenderInfo && (
            <>
              <View style={styles.senderInfo}>
                {senderName && (
                  <Text style={styles.senderName}>{senderName}</Text>
                )}
                {renderSenderSuffix()}
              </View>
              {getRoleIcon()}
            </>
          )}
          <Text style={styles.messageTime}>
            {formatTime(message.created_at)}
          </Text>
          {/* An edit changes what the team already read, so it is disclosed --
              muted, because it is provenance and not the message. */}
          {message.is_edited ? (
            <Text style={styles.editedMarker}>(edited)</Text>
          ) : null}
          {/* R1: straight to the emoji picker. This used to be
              `onPress={onLongPress}` -- the same handler as a long-press -- which
              is why tapping it opened the Actions sheet. */}
          <TouchableOpacity
            style={styles.reactionTrigger}
            onPress={onEmojiPress}
          >
            <Feather name="smile" size={14} color="#9CA3AF" />
            <Text style={styles.triggerPlus}>+</Text>
          </TouchableOpacity>
        </View>

        {/* BUBBLE - with gap from header.

            R3 wraps the bubble, and only the bubble: the swipe target is the
            message itself, not the header row or the reaction badges. */}
        <SwipeToReply onReply={onSwipeReply}>
        <TouchableOpacity
          onLongPress={onLongPress}
          delayLongPress={500}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.bubble,
              isOwnMessage ? styles.ownBubble : styles.otherBubble,
              // R9's ~1s flash after a jump. A ring rather than a background
              // swap: the bubble's own colour carries own-vs-other and must not
              // be the thing that blinks.
              highlighted && styles.bubbleHighlighted,
            ]}
          >
            {/* THE QUOTE BLOCK (ruling R9) -- WhatsApp-exact: inside the
                bubble, above the text, a coloured left bar, the original
                sender's NAME on its own line and the first 2 lines of the
                original under it.

                WHY IT MOVED IN HERE, which is also the bug R9 reported ("renders
                'Replying to…' with no content"). It used to be a chip in the
                CONTENT COLUMN, one single `numberOfLines={1}` Text reading
                "Replying to <Name> · <content>", with `alignSelf: 'stretch'` and
                a comment claiming the column is "the row's 80%". It is not: the
                column's 80% is a **maxWidth**, so the column SHRINK-WRAPS to its
                widest child -- which is the bubble. On a short reply that is
                ~80pt (`styles.bubble.minWidth`), the words "Replying to " plus
                the sender's name consume the single line on their own, and the
                preview -- last on that line -- was clipped to the ellipsis. The
                quote was never missing from the data; it had nowhere to render.
                Inside the bubble the quote is a SIZING INPUT instead of a
                starved passenger, and name and content are on separate lines, so
                neither can eat the other. (Data proof, round 2 recon: the insert
                writes reply_to_id + reply_to_content + reply_to_sender,
                `useMessages.ts:436-438`, and the thread reads `select('*')`,
                `:121-127`.) */}
            {replyTo && (
              <TouchableOpacity
                style={[
                  styles.quote,
                  isOwnMessage ? styles.quoteOwn : styles.quoteOther,
                ]}
                onPress={onReplyPress}
                activeOpacity={0.7}
                // No handler = nothing to jump to (the original is not in the
                // loaded window). R9: do nothing, and do not look pressable.
                disabled={!onReplyPress}
              >
                <View
                  style={[
                    styles.quoteBar,
                    isOwnMessage ? styles.quoteBarOwn : styles.quoteBarOther,
                  ]}
                />
                <View style={styles.quoteBody}>
                  <Text
                    style={[
                      styles.quoteSender,
                      isOwnMessage
                        ? styles.quoteSenderOwn
                        : styles.quoteSenderOther,
                    ]}
                    numberOfLines={1}
                  >
                    {replyTo.senderName}
                  </Text>
                  <Text
                    style={[
                      styles.quoteContent,
                      isOwnMessage
                        ? styles.quoteContentOwn
                        : styles.quoteContentOther,
                    ]}
                    // R9: the first 2 lines of the original.
                    numberOfLines={2}
                  >
                    {replyTo.content}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            {renderAttachment()}
            {message.content ? (
              <Text
                style={[
                  styles.messageText,
                  isOwnMessage
                    ? styles.ownMessageText
                    : styles.otherMessageText,
                ]}
              >
                {renderMessageText(
                  message.content,
                  isOwnMessage ? styles.linkTextOwn : styles.linkTextOther
                )}
              </Text>
            ) : null}
            {isOwnMessage && readReceipts != null && readReceipts}
          </View>
        </TouchableOpacity>
        </SwipeToReply>

        {/* Reactions - OUTSIDE bubble */}
        {reactions.length > 0 && (
          <View
            style={[
              styles.reactionsContainer,
              isOwnMessage ? styles.reactionsRight : styles.reactionsLeft,
            ]}
          >
            {reactions.map((r) => (
              <TouchableOpacity
                key={r.reaction}
                style={[
                  styles.reactionBadge,
                  r.userReacted && styles.reactionBadgeActive,
                ]}
                onPress={() => onReactionPress?.(r.reaction)}
                onLongPress={onShowReactionDetails}
              >
                <Text style={styles.reactionEmoji}>{r.reaction}</Text>
                <Text style={styles.reactionCount}>{r.count}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      {viewer}
    </View>
  );
}

const styles = StyleSheet.create({
  messageContainer: {
    flexDirection: 'row',
    marginVertical: 2,
    paddingHorizontal: 12,
  },
  messageContainerOwn: {
    justifyContent: 'flex-end',
  },
  messageContainerOther: {
    justifyContent: 'flex-start',
  },

  avatarContainer: {
    marginRight: 8,
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4B5563',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  contentColumn: {
    maxWidth: '80%',
  },
  contentColumnOwn: {
    alignItems: 'flex-end',
  },
  contentColumnOther: {
    alignItems: 'flex-start',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    gap: 6,
  },
  headerRowOwn: {
    justifyContent: 'flex-end',
  },
  headerRowOther: {
    justifyContent: 'flex-start',
  },

  senderInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  senderName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  playerLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '400',
  },

  messageTime: {
    fontSize: 11,
    color: '#6B7280',
  },
  editedMarker: {
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
    marginLeft: 4,
  },

  reactionTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 2,
    marginLeft: 4,
  },

  triggerPlus: {
    fontSize: 11,
    color: '#8B5CF6',
    fontWeight: '700',
  },

  // The swipe-to-reply arrow, behind the bubble at its leading edge (R3).
  swipeReplyHint: {
    position: 'absolute',
    left: -4,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },

  bubble: {
    minWidth: 80,
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  ownBubble: {
    backgroundColor: '#8B5CF6',
    borderBottomRightRadius: 4,
  },
  // R9's flash, on screen for ~1s. Lu, Oct 25: the first cut rang this in a
  // warm tone, which was a FOURTH colour the palette does not have -- the rule
  // is purple accent, grey, red. `#A78BFA` is the accent's light variant and is
  // already this file's quote bar and swipe hint; the accent's base `#8B5CF6`
  // could not be used because it IS the own bubble's background, so the ring
  // would have vanished on half the messages.
  bubbleHighlighted: {
    borderWidth: 2,
    borderColor: '#A78BFA',
  },
  otherBubble: {
    backgroundColor: '#374151',
    borderBottomLeftRadius: 4,
  },

  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  ownMessageText: {
    color: '#FFFFFF',
  },
  otherMessageText: {
    color: '#F3F4F6',
  },
  // Underlined rather than recoloured on own messages: the bubble is already
  // purple, so a blue link on it fails contrast.
  linkTextOwn: {
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
  linkTextOther: {
    color: '#93C5FD',
    textDecorationLine: 'underline',
  },

  /**
   * THE QUOTE BLOCK (R9) -- WhatsApp's shape, inside the bubble.
   *
   * `alignSelf: 'stretch'` so the quote spans the bubble's inner width, and the
   * bubble's own `maxWidth: '100%'` against the content column's 80% is what
   * bounds it. `minWidth` is what makes a one-word reply readable: the bubble
   * grows to the quote instead of the quote shrinking to the bubble, which is
   * precisely what the old chip could not do.
   */
  quote: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    minWidth: 160,
    marginBottom: 6,
    borderRadius: 6,
    overflow: 'hidden',
  },
  // Inside a purple bubble a grey wash disappears, so each side gets its own.
  quoteOwn: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  quoteOther: {
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  quoteBar: {
    width: 3,
    alignSelf: 'stretch',
  },
  quoteBarOwn: {
    backgroundColor: '#FFFFFF',
  },
  quoteBarOther: {
    backgroundColor: '#A78BFA',
  },
  quoteBody: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  quoteSender: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 1,
  },
  quoteSenderOwn: {
    color: '#FFFFFF',
  },
  quoteSenderOther: {
    color: '#C4B5FD',
  },
  quoteContent: {
    fontSize: 12,
    lineHeight: 16,
  },
  quoteContentOwn: {
    color: 'rgba(255,255,255,0.85)',
  },
  quoteContentOther: {
    color: '#CBD5E1',
  },

  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentContainer: {
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  imageAttachment: {
    width: 200,
    height: 150,
    borderRadius: 8,
  },
  videoPlaceholder: {
    width: 200,
    height: 150,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  documentAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    gap: 8,
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    color: '#8B5CF6',
    fontSize: 13,
  },
  ownDocumentName: {
    color: '#FFFFFF',
  },
  documentSize: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 2,
  },
  ownDocumentSize: {
    color: 'rgba(255,255,255,0.7)',
  },

  reactionsContainer: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 6,
    flexWrap: 'wrap',
  },
  reactionsLeft: {
    alignSelf: 'flex-start',
    marginLeft: 4,
  },
  reactionsRight: {
    alignSelf: 'flex-end',
    marginRight: 4,
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
  reactionBadgeActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.4)',
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  reactionEmoji: {
    fontSize: 12,
  },
  reactionCount: {
    fontSize: 10,
    color: '#D1D5DB',
    fontWeight: '600',
  },
});
