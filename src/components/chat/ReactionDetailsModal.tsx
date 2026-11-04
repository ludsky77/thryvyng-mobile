import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  FlatList,
  StyleSheet,
  Image,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CHAT_FALLBACK_NAME } from '../../lib/memberNames';

export interface ReactionDetailItem {
  emoji?: string;
  reaction?: string;
  user_id: string;
  profile?: {
    full_name?: string | null;
    avatar_url?: string | null;
  };
  profiles?: {
    full_name?: string | null;
    avatar_url?: string | null;
  };
}

interface ReactionDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  reactions: ReactionDetailItem[];
  /**
   * Resolves a reactor's auth uid through the parent's `memberNames`. Each
   * item already carries `user_id`, and the only render site holds the map, so
   * without this the list showed 'Unknown' beside a correctly named bubble.
   */
  nameFor?: (userId: string) => string | null | undefined;
}

export function ReactionDetailsModal({
  visible,
  onClose,
  reactions,
  nameFor,
}: ReactionDetailsModalProps) {
  const grouped = reactions.reduce((acc, r) => {
    const emoji = r.emoji ?? r.reaction ?? '';
    if (!emoji) return acc;
    if (!acc[emoji]) acc[emoji] = [];
    acc[emoji].push(r);
    return acc;
  }, {} as Record<string, ReactionDetailItem[]>);

  const entries = Object.entries(grouped);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* RELEASE-1.0.20-FIXES (2026-11-04): the dismiss backdrop is now a
          SIBLING of the sheet, not its parent. It used to be a full-screen
          TouchableOpacity wrapping the sheet, and the sheet blocked taps from
          reaching it with `onStartShouldSetResponder={() => true}` -- which
          also claimed the touch responder before the list's scroll view could,
          so a drag inside the list went nowhere. Round 1 found it with 14
          reactors and no way to reach past the first few. */}
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="Close reactions"
        />
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Reactions</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Feather name="x" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={entries}
            /* `flexShrink: 1` is the other half of the fix: inside a box that
               is only `maxHeight`-bounded, a list with no flex lays itself out
               at its full content height and the parent simply clips it, so it
               never believes it has anything to scroll. */
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyExtractor={([emoji]) => emoji}
            renderItem={({ item: [emoji, users] }) => (
              <View style={styles.emojiSection}>
                <View style={styles.emojiHeader}>
                  <Text style={styles.emoji}>{emoji}</Text>
                  <Text style={styles.emojiCount}>{users.length}</Text>
                </View>
                {users.map((user, index) => {
                  const userName =
                    nameFor?.(user.user_id) ||
                    user.profiles?.full_name ||
                    user.profile?.full_name ||
                    CHAT_FALLBACK_NAME;
                  const avatarUrl =
                    user.profiles?.avatar_url ?? user.profile?.avatar_url;
                  const initial = userName.charAt(0).toUpperCase();
                  return (
                    <View key={`${user.user_id}-${index}`} style={styles.userRow}>
                      {avatarUrl ? (
                        <Image
                          source={{ uri: avatarUrl }}
                          style={styles.avatar}
                        />
                      ) : (
                        <View style={styles.avatarPlaceholder}>
                          <Text style={styles.avatarInitial}>
                            {initial || '?'}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.userName}>{userName}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: {
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    padding: 20,
  },
  list: {
    flexShrink: 1,
  },
  listContent: {
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  emojiSection: {
    marginBottom: 16,
  },
  emojiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  emoji: {
    fontSize: 24,
  },
  emojiCount: {
    color: '#9CA3AF',
    fontSize: 14,
    marginLeft: 8,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 16,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4B5563',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  userName: {
    color: '#F3F4F6',
    fontSize: 15,
  },
});
