import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { formatRoleLabel, getRolePriority } from '../lib/chatHelpers';

function getTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role?: string;
}

interface DMConversation {
  id: string;
  dm_participant_1: string;
  dm_participant_2: string;
  otherPerson: Profile | null;
  lastMessage: string | null;
  lastMessageTime: string | null;
}

function DMListItem({
  conversation,
  onPress,
}: {
  conversation: DMConversation;
  onPress: () => void;
}) {
  const other = conversation.otherPerson;
  return (
    <TouchableOpacity style={styles.dmItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatarContainer}>
        {other?.avatar_url ? (
          <Image source={{ uri: other.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>
              {other?.full_name?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.dmContent}>
        <Text style={styles.dmName} numberOfLines={1}>
          {other?.full_name || 'Unknown'}
        </Text>
        {other?.role ? (
          <Text style={styles.dmRole}>{formatRoleLabel(other.role)}</Text>
        ) : null}
        {conversation.lastMessage ? (
          <Text style={styles.dmLastMessage} numberOfLines={1}>
            {conversation.lastMessage}
          </Text>
        ) : null}
      </View>
      <Text style={styles.dmTime}>
        {conversation.lastMessageTime
          ? getTimeAgo(conversation.lastMessageTime)
          : ''}
      </Text>
    </TouchableOpacity>
  );
}

export default function DirectMessagesScreen({ navigation }: any) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDMConversations = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Step 1: Fetch DM channels where user is a participant
      const { data: channels, error: channelsError } = await supabase
        .from('comm_channels')
        .select('*')
        .eq('is_direct_message', true)
        .or(`dm_participant_1.eq.${user.id},dm_participant_2.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (channelsError) {
        console.error('Error fetching channels:', channelsError);
        setConversations([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!channels || channels.length === 0) {
        setConversations([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Step 2: Get all unique participant IDs (the "other" person in each DM)
      const otherUserIds = channels.map(
        (ch: any) =>
          ch.dm_participant_1 === user.id ? ch.dm_participant_2 : ch.dm_participant_1
      ).filter(Boolean);

      // Step 3: Fetch profiles for all other participants
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', otherUserIds);

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
      }

      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', otherUserIds);
      const { data: staffRoles } = await supabase
        .from('team_staff')
        .select('user_id, staff_role')
        .in('user_id', otherUserIds);
      const roleMap = new Map<string, string>();
      (userRoles || []).forEach((r: any) => {
        const existing = roleMap.get(r.user_id);
        if (!existing || getRolePriority(r.role) > getRolePriority(existing)) {
          roleMap.set(r.user_id, r.role);
        }
      });
      (staffRoles || []).forEach((r: any) => {
        const existing = roleMap.get(r.user_id);
        if (!existing || getRolePriority(r.staff_role) > getRolePriority(existing)) {
          roleMap.set(r.user_id, r.staff_role);
        }
      });

      const profileMap = new Map<string, Profile>();
      (profiles || []).forEach((p: Profile) => {
        profileMap.set(p.id, { ...p, role: roleMap.get(p.id) });
      });

      // Step 4: Fetch last message for each channel
      const channelIds = channels.map((ch: any) => ch.id);
      const { data: lastMessages, error: messagesError } = await supabase
        .from('comm_messages')
        .select('channel_id, content, created_at, user_id')
        .in('channel_id', channelIds)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      const lastMessageMap = new Map<string, { content: string; created_at: string }>();
      (lastMessages || []).forEach((msg: any) => {
        if (!lastMessageMap.has(msg.channel_id)) {
          lastMessageMap.set(msg.channel_id, {
            content: msg.content,
            created_at: msg.created_at,
          });
        }
      });

      // Step 5: Combine all data
      const enrichedConversations: DMConversation[] = channels.map((channel: any) => {
        const otherUserId =
          channel.dm_participant_1 === user.id
            ? channel.dm_participant_2
            : channel.dm_participant_1;
        const otherPerson =
          profileMap.get(otherUserId) ||
          ({ id: otherUserId, full_name: 'Unknown', avatar_url: null, role: undefined } as Profile);
        const lastMsg = lastMessageMap.get(channel.id);

        return {
          id: channel.id,
          dm_participant_1: channel.dm_participant_1,
          dm_participant_2: channel.dm_participant_2,
          otherPerson,
          lastMessage: lastMsg?.content || null,
          lastMessageTime: lastMsg?.created_at || channel.created_at,
        };
      });

      setConversations(enrichedConversations);
    } catch (err) {
      console.error('Error in fetchDMConversations:', err);
      setConversations([]);
    }

    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  useEffect(() => {
    fetchDMConversations();
  }, [fetchDMConversations]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDMConversations();
  }, [fetchDMConversations]);

  const handleConversationPress = useCallback(
    (conversation: DMConversation) => {
      navigation.navigate('DMChat', { channelId: conversation.id });
    },
    [navigation]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Direct Messages</Text>
        <TouchableOpacity
          onPress={() => {
            navigation.navigate('Conversations', { openNewModal: true });
          }}
          style={styles.newDMButton}
        >
          <Text style={styles.newDMButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Loading conversations...</Text>
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyTitle}>No Direct Messages</Text>
          <Text style={styles.emptyText}>
            Tap "+ New" to start a conversation with a team member or coach.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => navigation.navigate('Conversations', { openNewModal: true })}
          >
            <Text style={styles.emptyButtonText}>Start a conversation</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DMListItem
              conversation={item}
              onPress={() => handleConversationPress(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#10B981"
            />
          }
        />
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  mainContent: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 20,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  newDMButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#8B5CF6',
  },
  newDMButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
  },
  dmItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1e293b',
    marginBottom: 8,
    borderRadius: 12,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  dmContent: {
    flex: 1,
    minWidth: 0,
  },
  dmName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  dmRole: {
    color: '#10B981',
    fontSize: 12,
    marginBottom: 2,
  },
  dmLastMessage: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  dmTime: {
    color: '#6B7280',
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#10B981',
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
  keyboardAvoid: {
    width: '100%',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
    minHeight: 300,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  modalClose: {
    color: '#9CA3AF',
    fontSize: 24,
  },
  searchInput: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    marginBottom: 16,
    fontSize: 16,
  },
  searchList: {
    maxHeight: 320,
  },
  searchResultsList: {
    maxHeight: 300,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
  },
  searchResultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  searchResultAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  searchResultName: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  noResults: {
    color: '#6B7280',
    textAlign: 'center',
    padding: 20,
  },
  searchHint: {
    color: '#6B7280',
    textAlign: 'center',
    padding: 20,
  },
  searchLoading: {
    padding: 20,
    alignItems: 'center',
  },
  chooseTypeContainer: {
    paddingVertical: 8,
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    marginBottom: 12,
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
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
    fontSize: 18,
  },
  stepBack: {
    marginBottom: 12,
  },
  backText: {
    color: '#10B981',
    fontSize: 14,
  },
  resultContent: {
    flex: 1,
    minWidth: 0,
  },
  resultRole: {
    color: '#10B981',
    fontSize: 12,
    marginTop: 2,
  },
  groupNameInput: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    marginBottom: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  selectedChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F620',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    color: '#3B82F6',
    fontSize: 13,
    maxWidth: 120,
  },
  chipRemove: {
    color: '#3B82F6',
    marginLeft: 6,
    fontSize: 14,
  },
  createGroupButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  createGroupText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  teamChannelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
  },
  teamChannelIcon: {
    color: '#10B981',
    fontSize: 18,
    marginRight: 12,
  },
  teamChannelContent: {
    flex: 1,
    minWidth: 0,
  },
  teamChannelName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  teamChannelTeam: {
    color: '#10B981',
    fontSize: 12,
    marginTop: 2,
  },
});
