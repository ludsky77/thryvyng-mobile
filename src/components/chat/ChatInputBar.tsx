import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  Text,
  Linking,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

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

interface ChatInputBarProps {
  onSendMessage: (content: string, attachment?: AttachmentData) => void;
  onPollPress?: () => void;
  placeholder?: string;
  replyingTo?: ReplyingToInfo | null;
  onCancelReply?: () => void;
  onTypingChange?: (isTyping: boolean) => void;
}

const TYPING_DEBOUNCE_MS = 2000;

export function ChatInputBar({
  onSendMessage,
  onPollPress,
  placeholder = 'Type a message...',
  replyingTo,
  onCancelReply,
  onTypingChange,
}: ChatInputBarProps) {
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<AttachmentData | null>(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
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

  const handleSend = () => {
    if (!message.trim() && !attachment) return;
    onTypingChange?.(false);
    onSendMessage(message.trim(), attachment || undefined);
    setMessage('');
    setAttachment(null);
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
      setAttachment({
        uri: asset.uri,
        type: isVideo ? 'video' : 'image',
        name: 'fileName' in asset && asset.fileName ? asset.fileName : 'image.jpg',
        mimeType: 'mimeType' in asset ? asset.mimeType : undefined,
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
      setAttachment({
        uri: asset.uri,
        type: 'image',
        name: 'photo.jpg',
        mimeType: 'mimeType' in asset ? asset.mimeType : undefined,
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
      {replyingTo && (
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

      {attachment && (
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
          <TouchableOpacity
            style={styles.removeAttachmentButton}
            onPress={removeAttachment}
          >
            <Feather name="x" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {showAttachmentMenu && (
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
          placeholder={placeholder}
          placeholderTextColor="#6B7280"
          multiline
          maxLength={2000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />

        {onPollPress && (
          <TouchableOpacity style={styles.pollButton} onPress={onPollPress}>
            <Feather name="bar-chart-2" size={22} color="#9CA3AF" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.sendButton,
            !message.trim() && !attachment && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!message.trim() && !attachment}
        >
          <Feather name="send" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
