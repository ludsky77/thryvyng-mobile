import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import {
  AttachmentViewer,
  useAttachmentViewer,
  openExternally,
} from './AttachmentViewer';

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
  onLongPress?: () => void;
  onReplyPress?: () => void;
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
  onReplyPress,
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
      if (__DEV__) console.error('[ChatBubble] share failed', err);
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
          <TouchableOpacity
            style={styles.reactionTrigger}
            onPress={onLongPress}
          >
            <Feather name="smile" size={14} color="#9CA3AF" />
            <Text style={styles.triggerPlus}>+</Text>
          </TouchableOpacity>
        </View>

        {/* BUBBLE - with gap from header */}
        <TouchableOpacity
          onLongPress={onLongPress}
          delayLongPress={500}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.bubble,
              isOwnMessage ? styles.ownBubble : styles.otherBubble,
            ]}
          >
            {replyTo && (
              <TouchableOpacity
                style={styles.replyPreview}
                onPress={onReplyPress}
                activeOpacity={0.7}
              >
                <View style={styles.replyBar} />
                <View style={styles.replyContent}>
                  <Text style={styles.replySender}>{replyTo.senderName}</Text>
                  <Text style={styles.replyText} numberOfLines={1}>
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
                {message.content}
              </Text>
            ) : null}
            {isOwnMessage && readReceipts != null && readReceipts}
          </View>
        </TouchableOpacity>

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

  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  replyBar: {
    width: 3,
    height: '100%',
    minHeight: 32,
    backgroundColor: '#8B5CF6',
    borderRadius: 2,
  },
  replyContent: {
    flex: 1,
  },
  replySender: {
    color: '#8B5CF6',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  replyText: {
    color: '#9CA3AF',
    fontSize: 13,
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
