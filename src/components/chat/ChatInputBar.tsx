import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  Text,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  sendFailureCopy,
  shouldAlertForResult,
  type SendResult,
} from '../../utils/sendResult';

export interface AttachmentData {
  uri: string;
  type: 'image' | 'video' | 'document';
  name: string;
  mimeType?: string;
  size?: number;
}

export interface ReplyingToInfo {
  senderName: string;
  content: string;
}

/** The message being edited, when the bar is in edit mode. */
export interface EditingInfo {
  id: string;
  content: string;
}

interface ChatInputBarProps {
  onSendMessage: (
    content: string,
    attachment?: AttachmentData
  ) => void | SendResult | Promise<void | SendResult>;
  onPollPress?: () => void;
  placeholder?: string;
  replyingTo?: ReplyingToInfo | null;
  onCancelReply?: () => void;
  onTypingChange?: (isTyping: boolean) => void;
  /** Non-null puts the bar in edit mode: prefilled text, banner, no attachments. */
  editing?: EditingInfo | null;
  onCancelEdit?: () => void;
  onSaveEdit?: (
    messageId: string,
    content: string
  ) => void | SendResult | Promise<void | SendResult>;
}

const TYPING_DEBOUNCE_MS = 2000;

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

// Anything outside this list is refused before it reaches storage. An unknown
// MIME type is allowed through -- the pickers omit it for camera captures, and
// the server enforces the real rule.
const ALLOWED_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

function isAllowedMime(mimeType?: string): boolean {
  if (!mimeType) return true; // unknown -> let the server decide
  if (mimeType.startsWith('image/')) return true;
  return ALLOWED_MIME_TYPES.has(mimeType);
}

/** Returns an error message when the asset must be refused, else null. */
function validateAttachment(candidate: {
  size?: number;
  mimeType?: string;
}): string | null {
  if (typeof candidate.size === 'number' && candidate.size > MAX_ATTACHMENT_BYTES) {
    return 'Files must be under 25 MB';
  }
  if (!isAllowedMime(candidate.mimeType)) {
    return 'That file type is not supported. Try an image, video, PDF, Word, Excel, or text file.';
  }
  return null;
}

export function ChatInputBar({
  onSendMessage,
  onPollPress,
  placeholder = 'Type a message...',
  replyingTo,
  onCancelReply,
  onTypingChange,
  editing = null,
  onCancelEdit,
  onSaveEdit,
}: ChatInputBarProps) {
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<AttachmentData | null>(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [sending, setSending] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notifyTyping = useCallback(
    (isTyping: boolean) => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (isTyping) {
        onTypingChange?.(true);
      } else {
        typingTimeoutRef.current = setTimeout(() => {
          typingTimeoutRef.current = null;
          onTypingChange?.(false);
        }, TYPING_DEBOUNCE_MS);
      }
    },
    [onTypingChange]
  );

  // Entering edit mode prefills the draft; leaving it clears the box. Keyed on
  // the message id so switching directly from one edit to another reloads.
  const editingIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = editing?.id ?? null;
    if (id === editingIdRef.current) return;
    editingIdRef.current = id;
    setMessage(editing ? editing.content : '');
    if (editing) {
      // An attachment cannot be added to an existing message; drop any pending
      // one rather than silently carrying it into the edit.
      setAttachment(null);
      setShowAttachmentMenu(false);
    }
  }, [editing]);

  const handleSend = async () => {
    if (sending) return;
    const draft = message.trim();

    // EDIT MODE: save the edit instead of sending a new message. An emptied
    // box is not a delete -- deleting has its own action -- so it is a no-op.
    if (editing) {
      if (!draft) return;
      onTypingChange?.(false);
      setSending(true);
      try {
        const result = await onSaveEdit?.(editing.id, draft);
        if (shouldAlertForResult(result)) {
          const copy = sendFailureCopy((result as { reason: any }).reason);
          Alert.alert(copy.title, copy.body);
          return; // keep the draft so the edit is not lost
        }
        onCancelEdit?.();
      } finally {
        setSending(false);
      }
      return;
    }

    if (!draft && !attachment) return;
    onTypingChange?.(false);

    const pending = attachment || undefined;
    setSending(true);
    try {
      // The result carries a REASON now, so the copy matches what actually
      // failed. This used to blame the attachment for every failure, including
      // a text-only reply whose insert was refused.
      const result = await onSendMessage(draft, pending);
      if (shouldAlertForResult(result)) {
        const copy = sendFailureCopy((result as { reason: any }).reason);
        Alert.alert(copy.title, copy.body);
        return; // keep the draft and the attachment so nothing is lost
      }
      setMessage('');
      setAttachment(null);
    } finally {
      setSending(false);
    }
  };

  const pickImage = async () => {
    setShowAttachmentMenu(false);

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission Required',
        'Please allow photo access in Settings to attach images.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const isVideo = 'type' in asset && asset.type === 'video';
      // ImagePicker calls it fileSize; DocumentPicker calls it size.
      const size = 'fileSize' in asset ? (asset.fileSize as number | undefined) : undefined;
      const mimeType = 'mimeType' in asset ? asset.mimeType : undefined;
      const problem = validateAttachment({ size, mimeType });
      if (problem) {
        Alert.alert('Cannot attach', problem);
        return;
      }
      setAttachment({
        uri: asset.uri,
        type: isVideo ? 'video' : 'image',
        name: 'fileName' in asset && asset.fileName ? asset.fileName : 'image.jpg',
        mimeType,
        size,
      });
    }
  };

  const takePhoto = async () => {
    setShowAttachmentMenu(false);

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission Required',
        'Please allow camera access in Settings to take photos.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const size = 'fileSize' in asset ? (asset.fileSize as number | undefined) : undefined;
      const mimeType = 'mimeType' in asset ? asset.mimeType : undefined;
      const problem = validateAttachment({ size, mimeType });
      if (problem) {
        Alert.alert('Cannot attach', problem);
        return;
      }
      setAttachment({
        uri: asset.uri,
        type: 'image',
        name: 'photo.jpg',
        mimeType,
        size,
      });
    }
  };

  const pickDocument = async () => {
    setShowAttachmentMenu(false);

    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const problem = validateAttachment({
        size: asset.size ?? undefined,
        mimeType: asset.mimeType ?? undefined,
      });
      if (problem) {
        Alert.alert('Cannot attach', problem);
        return;
      }
      setAttachment({
        uri: asset.uri,
        type: 'document',
        name: asset.name ?? 'document',
        mimeType: asset.mimeType ?? undefined,
        size: asset.size ?? undefined,
      });
    }
  };

  const removeAttachment = () => {
    setAttachment(null);
  };

  return (
    <View style={styles.container}>
      {editing && (
        <View style={styles.editBanner}>
          <View style={styles.replyInfo}>
            <Text style={styles.editLabel}>Editing message</Text>
            <Text style={styles.replyPreviewText} numberOfLines={1}>
              {editing.content}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onCancelEdit}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="x" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      )}

      {!editing && replyingTo && (
        <View style={styles.replyBanner}>
          <View style={styles.replyInfo}>
            <Text style={styles.replyLabel}>
              Replying to {replyingTo.senderName}
            </Text>
            <Text
              style={styles.replyPreviewText}
              numberOfLines={1}
            >
              {replyingTo.content}
            </Text>
          </View>
          <TouchableOpacity onPress={onCancelReply} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Feather name="x" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      )}

      {!editing && attachment && (
        <View style={styles.attachmentPreview}>
          {attachment.type === 'image' ? (
            <Image
              source={{ uri: attachment.uri }}
              style={styles.previewImage}
            />
          ) : attachment.type === 'video' ? (
            <View style={styles.previewVideo}>
              <Feather name="video" size={24} color="#8B5CF6" />
            </View>
          ) : (
            <View style={styles.previewDocument}>
              <Feather name="file-text" size={24} color="#8B5CF6" />
              <Text
                style={styles.previewDocName}
                numberOfLines={1}
              >
                {attachment.name}
              </Text>
            </View>
          )}
          {sending ? (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color="#8B5CF6" />
              <Text style={styles.uploadingText}>Uploading…</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.removeAttachmentButton}
              onPress={removeAttachment}
            >
              <Feather name="x" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {!editing && showAttachmentMenu && (
        <View style={styles.attachmentMenu}>
          <TouchableOpacity
            style={styles.attachmentOption}
            onPress={takePhoto}
          >
            <Feather name="camera" size={22} color="#8B5CF6" />
            <Text style={styles.attachmentOptionText}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.attachmentOption}
            onPress={pickImage}
          >
            <Feather name="image" size={22} color="#8B5CF6" />
            <Text style={styles.attachmentOptionText}>Photo/Video</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.attachmentOption}
            onPress={pickDocument}
          >
            <Feather name="file" size={22} color="#8B5CF6" />
            <Text style={styles.attachmentOptionText}>Document</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputRow}>
        {!editing && (
          <TouchableOpacity
            style={styles.attachButton}
            onPress={() => setShowAttachmentMenu(!showAttachmentMenu)}
          >
            <Feather
              name="paperclip"
              size={22}
              color={showAttachmentMenu ? '#8B5CF6' : '#9CA3AF'}
            />
          </TouchableOpacity>
        )}

        <TextInput
          style={styles.input}
          value={message}
          onChangeText={(text) => {
            setMessage(text);
            notifyTyping(text.length > 0);
          }}
          onFocus={() => message.length > 0 && onTypingChange?.(true)}
          onBlur={() => {
            if (typingTimeoutRef.current) {
              clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = null;
            }
            onTypingChange?.(false);
          }}
          placeholder={editing ? 'Edit your message…' : placeholder}
          placeholderTextColor="#6B7280"
          multiline
          maxLength={2000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />

        {!editing && onPollPress && (
          <TouchableOpacity style={styles.pollButton} onPress={onPollPress}>
            <Feather name="bar-chart-2" size={22} color="#9CA3AF" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.sendButton,
            // In edit mode an attachment can never satisfy the button -- only
            // text can -- so the two conditions differ.
            ((editing ? !message.trim() : !message.trim() && !attachment) ||
              sending) &&
              styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={
            (editing ? !message.trim() : !message.trim() && !attachment) ||
            sending
          }
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Feather name={editing ? 'check' : 'send'} size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  uploadingText: {
    color: '#8B5CF6',
    fontSize: 12,
  },
  container: {
    backgroundColor: '#1F2937',
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#374151',
    borderBottomWidth: 1,
    borderBottomColor: '#4B5563',
  },
  replyInfo: {
    flex: 1,
    marginRight: 12,
  },
  replyLabel: {
    color: '#8B5CF6',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  // Amber rather than the reply banner's violet: editing changes history, and
  // it should not look like the routine reply affordance.
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#3F3522',
    borderBottomWidth: 1,
    borderBottomColor: '#78350F',
  },
  editLabel: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  replyPreviewText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#374151',
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  previewVideo: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewDocument: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  previewDocName: {
    color: '#F3F4F6',
    fontSize: 14,
    flex: 1,
  },
  removeAttachmentButton: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    padding: 4,
    marginLeft: 12,
  },
  attachmentMenu: {
    flexDirection: 'row',
    padding: 12,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  attachmentOption: {
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#374151',
    borderRadius: 12,
    minWidth: 80,
  },
  attachmentOptionText: {
    color: '#F3F4F6',
    fontSize: 12,
    marginTop: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    gap: 8,
  },
  attachButton: {
    padding: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#374151',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 15,
    maxHeight: 100,
  },
  pollButton: {
    padding: 8,
  },
  sendButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 20,
    padding: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#4B5563',
  },
});
