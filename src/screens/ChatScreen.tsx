import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  SectionList,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useUserTeams } from '../hooks/useUserTeams';
import { supabase } from '../lib/supabase';
import { formatDistanceToNow } from 'date-fns';

interface Channel {
  id: string;
  name: string;
  channel_type: string;
  team_id: string;
  team_name?: string;
  team_color?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count: number;
}

type ViewMode = 'recent' | 'byTeam';

export default function ChatScreen({ navigation }: any) {
  const { user } = useAuth();
  const { teams, loading: teamsLoading, canManageTeam } = useUserTeams();

  const [viewMode, setViewMode] = useState<ViewMode>('recent');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchChannels = useCallback(async () => {
    if (!user?.id) {
      setChannels([]);
      setLoading(false);
      return;
    }

    try {
      const { data: membershipData, error: membershipError } = await supabase
        .from('comm_channel_members')
        .select('channel_id')
        .eq('user_id', user.id);

      if (membershipError) throw membershipError;

      const channelIds = (membershipData || []).map((m: any) => m.channel_id);

      if (channelIds.length === 0) {
        setChannels([]);
        setLoading(false);
        return;
      }

      const { data: channelsData, error: channelsError } = await supabase
        .from('comm_channels')
        .select(
          `
          id,
          name,
          channel_type,
          team_id,
          teams (
            id,
            name
          )
        `
        )
        .in('id', channelIds)
        .eq('is_archived', false);

      if (channelsError) throw channelsError;

      const channelsWithMessages = await Promise.all(
        (channelsData || []).map(async (channel: any) => {
          const { data: lastMsg } = await supabase
            .from('comm_messages')
            .select('content, created_at')
            .eq('channel_id', channel.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const { data: memberData } = await supabase
            .from('comm_channel_members')
            .select('last_read_at')
            .eq('channel_id', channel.id)
            .eq('user_id', user.id)
            .maybeSingle();

          let unreadCount = 0;
          if (memberData?.last_read_at) {
            const { count } = await supabase
              .from('comm_messages')
              .select('*', { count: 'exact', head: true })
              .eq('channel_id', channel.id)
              .gt('created_at', memberData.last_read_at);
            unreadCount = count || 0;
          } else if (lastMsg) {
            const { count } = await supabase
              .from('comm_messages')
              .select('*', { count: 'exact', head: true })
              .eq('channel_id', channel.id);
            unreadCount = count || 0;
          }

          const team = teams.find((t) => t.id === channel.team_id);
          const teamsRel = channel.teams;
          const teamName = Array.isArray(teamsRel)
            ? teamsRel[0]?.name
            : (teamsRel as { name?: string })?.name;

          return {
            id: channel.id,
            name: channel.name,
            channel_type: channel.channel_type,
            team_id: channel.team_id,
            team_name: teamName || 'Unknown Team',
            team_color: team?.color || '#8b5cf6',
            last_message: lastMsg?.content || null,
            last_message_at: lastMsg?.created_at || null,
            unread_count: unreadCount,
          };
        })
      );

      channelsWithMessages.sort((a, b) => {
        if (!a.last_message_at) return 1;
        if (!b.last_message_at) return -1;
        return (
          new Date(b.last_message_at).getTime() -
          new Date(a.last_message_at).getTime()
        );
      });

      setChannels(channelsWithMessages);
    } catch (error) {
      console.error('Error fetching channels:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, teams]);

  useEffect(() => {
    if (!teamsLoading) {
      fetchChannels();
    }
  }, [teamsLoading, fetchChannels]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('chat-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comm_messages',
        },
        () => {
          fetchChannels();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchChannels]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchChannels();
  };

  const handleChannelPress = (channel: Channel) => {
    navigation.navigate('TeamChatRoom', {
      channelId: channel.id,
      channelName: channel.name,
      teamName: channel.team_name,
    });
  };

  const canCreateChannel = teams.some((t) => t.access_type === 'staff');

  const groupedChannels = React.useMemo(() => {
    const groups: {
      [teamId: string]: {
        teamName: string;
        teamColor: string;
        channels: Channel[];
      };
    } = {} as any;

    channels.forEach((channel) => {
      if (!groups[channel.team_id]) {
        groups[channel.team_id] = {
          teamName: channel.team_name || 'Unknown',
          teamColor: channel.team_color || '#8b5cf6',
          channels: [],
        };
      }
      groups[channel.team_id].channels.push(channel);
    });

    return Object.entries(groups).map(([teamId, data]) => ({
      title: data.teamName,
      color: data.teamColor,
      data: data.channels,
    }));
  }, [channels]);

  const renderChannelItem = ({ item }: { item: Channel }) => (
    <TouchableOpacity
      style={styles.channelItem}
      onPress={() => handleChannelPress(item)}
      activeOpacity={0.7}
    >
      <View
        style={[styles.channelColorBar, { backgroundColor: item.team_color }]}
      />

      <View style={styles.channelContent}>
        <View style={styles.channelHeader}>
          <View style={styles.channelNameRow}>
            <Text style={styles.channelIcon}>
              {item.channel_type === 'announcement' ? '📢' : '💬'}
            </Text>
            <Text style={styles.channelName} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
          {item.last_message_at && (
            <Text style={styles.channelTime}>
              {formatDistanceToNow(new Date(item.last_message_at), {
                addSuffix: false,
              })}
            </Text>
          )}
        </View>

        {viewMode === 'recent' && (
          <Text style={styles.channelTeam}>{item.team_name}</Text>
        )}

        <View style={styles.channelFooter}>
          <Text style={styles.channelPreview} numberOfLines={1}>
            {item.last_message || 'No messages yet'}
          </Text>
          {item.unread_count > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {item.unread_count > 99 ? '99+' : item.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>

      <Text style={styles.channelArrow}>›</Text>
    </TouchableOpacity>
  );

  const renderSectionHeader = ({
    section,
  }: {
    section: { title: string; color: string };
  }) => (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionDot, { backgroundColor: section.color }]} />
      <Text style={styles.sectionTitle}>{section.title}</Text>
    </View>
  );

  if (loading || teamsLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading conversations...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conversations</Text>
        {canCreateChannel && (
          <TouchableOpacity
            style={styles.newChatButton}
            onPress={() => {
              // TODO: Open create channel modal
            }}
          >
            <Text style={styles.newChatText}>+ New</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            viewMode === 'recent' && styles.toggleButtonActive,
          ]}
          onPress={() => setViewMode('recent')}
        >
          <Text
            style={[
              styles.toggleText,
              viewMode === 'recent' && styles.toggleTextActive,
            ]}
          >
            Recent
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            viewMode === 'byTeam' && styles.toggleButtonActive,
          ]}
          onPress={() => setViewMode('byTeam')}
        >
          <Text
            style={[
              styles.toggleText,
              viewMode === 'byTeam' && styles.toggleTextActive,
            ]}
          >
            By Team
          </Text>
        </TouchableOpacity>
      </View>

      {channels.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyTitle}>No Conversations</Text>
          <Text style={styles.emptyText}>
            You'll see your team chats here once you're added to a team
          </Text>
        </View>
      ) : viewMode === 'recent' ? (
        <FlatList
          data={channels}
          renderItem={renderChannelItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#8b5cf6"
            />
          }
        />
      ) : (
        <SectionList
          sections={groupedChannels}
          renderItem={renderChannelItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#8b5cf6"
            />
          }
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#2a2a4e',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  newChatButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newChatText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#2a2a4e',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 10,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#8b5cf6',
  },
  toggleText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 10,
    gap: 8,
  },
  sectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  channelColorBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  channelContent: {
    flex: 1,
    padding: 14,
  },
  channelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  channelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  channelIcon: {
    fontSize: 14,
  },
  channelName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  channelTime: {
    color: '#888',
    fontSize: 12,
  },
  channelTeam: {
    color: '#8b5cf6',
    fontSize: 12,
    marginBottom: 6,
  },
  channelFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  channelPreview: {
    color: '#888',
    fontSize: 14,
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  channelArrow: {
    color: '#666',
    fontSize: 20,
    paddingRight: 14,
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
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
  },
});
