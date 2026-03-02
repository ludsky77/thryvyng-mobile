import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

interface Poll {
  id: string;
  question: string;
  status: 'active' | 'closed';
  created_at: string;
  ends_at: string | null;
  created_by: string;
  creator_name: string;
  total_votes: number;
  options: { id: string; text: string; vote_count: number }[];
  user_voted: boolean;
  user_voted_option_id: string | null;
  non_voter_count: number;
}

export default function ChannelPollsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { channelId } = (route.params as { channelId: string }) || {};
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('all');
  const [votingPollId, setVotingPollId] = useState<string | null>(null);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [closingPoll, setClosingPoll] = useState<string | null>(null);
  const [isStaffInChannel, setIsStaffInChannel] = useState(false);
  const [channelTeamId, setChannelTeamId] = useState<string | null>(null);

  useEffect(() => {
    const checkStaffAndTeam = async () => {
      if (!channelId || !user?.id) return;

      const { data: channelData } = await supabase
        .from('comm_channels')
        .select('team_id')
        .eq('id', channelId)
        .single();

      if (channelData?.team_id) {
        setChannelTeamId(channelData.team_id);

        const { data: staffData } = await supabase
          .from('team_staff')
          .select('id')
          .eq('team_id', channelData.team_id)
          .eq('user_id', user.id)
          .maybeSingle();

        setIsStaffInChannel(!!staffData);
      }
    };

    checkStaffAndTeam();
  }, [channelId, user?.id]);

  useEffect(() => {
    if (channelId) {
      fetchPolls();
    } else {
      setLoading(false);
    }
  }, [channelId]);

  const fetchPolls = async () => {
    if (!channelId) return;
    setLoading(true);
    try {
      const { data: pollsData, error } = await supabase
        .from('comm_polls')
        .select(`
          id,
          question,
          is_active,
          created_at,
          ends_at,
          created_by,
          options:comm_poll_options(id, option_text)
        `)
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const pollIds = pollsData?.map((p: any) => p.id) || [];
      const creatorIds = [
        ...new Set(
          (pollsData || []).map((p: any) => p.created_by).filter(Boolean)
        ),
      ];
      let profileMap = new Map<string, string>();
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', creatorIds);
        profileMap = new Map(
          (profiles || []).map((p: any) => [p.id, p.full_name || 'Unknown'])
        );
      }
      let votedPollIds = new Set<string>();
      let votedOptionsMap = new Map<string, string>();
      let votesByPoll: Record<string, { option_id: string }[]> = {};

      if (pollIds.length > 0) {
        const { data: allVotes } = await supabase
          .from('comm_poll_votes')
          .select('poll_id, option_id, user_id')
          .in('poll_id', pollIds);

        const votes = allVotes || [];
        votes.forEach((v: any) => {
          if (!votesByPoll[v.poll_id]) votesByPoll[v.poll_id] = [];
          votesByPoll[v.poll_id].push(v);
        });
        if (user?.id) {
          const userVoteList = votes.filter((v: any) => v.user_id === user.id);
          votedPollIds = new Set(userVoteList.map((v: any) => v.poll_id));
          votedOptionsMap = new Map(
            userVoteList.map((v: any) => [v.poll_id, v.option_id])
          );
        }
      }

      const { count: memberCount } = await supabase
        .from('comm_channel_members')
        .select('id', { count: 'exact', head: true })
        .eq('channel_id', channelId);

      const formattedPolls: Poll[] = (pollsData || []).map((p: any) => {
        const isExpired = p.ends_at && new Date(p.ends_at) < new Date();
        const status: 'active' | 'closed' =
          p.is_active && !isExpired ? 'active' : 'closed';

        const pollVotes = votesByPoll[p.id] || [];
        const options = (p.options || []).map((opt: any) => {
          const vote_count = pollVotes.filter(
            (v: any) => v.option_id === opt.id
          ).length;
          return {
            id: opt.id,
            text: opt.option_text || opt.text || '',
            vote_count,
          };
        });

        const total_votes = options.reduce(
          (sum: number, opt: any) => sum + opt.vote_count,
          0
        );

        return {
          id: p.id,
          question: p.question,
          status,
          created_at: p.created_at,
          ends_at: p.ends_at,
          created_by: p.created_by,
          creator_name: profileMap.get(p.created_by) || 'Unknown',
          options,
          total_votes,
          user_voted: votedPollIds.has(p.id),
          user_voted_option_id: votedOptionsMap.get(p.id) || null,
          non_voter_count: Math.max(0, (memberCount || 0) - total_votes),
        };
      });

      setPolls(formattedPolls);
    } catch (err) {
      console.error('Error fetching polls:', err);
      setPolls([]);
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (pollId: string, optionId: string) => {
    if (!user?.id) return;

    setVotingPollId(pollId);

    try {
      const { data: existingVote } = await supabase
        .from('comm_poll_votes')
        .select('id')
        .eq('poll_id', pollId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingVote) {
        await supabase
          .from('comm_poll_votes')
          .update({ option_id: optionId })
          .eq('poll_id', pollId)
          .eq('user_id', user.id);
      } else {
        await supabase.from('comm_poll_votes').insert({
          poll_id: pollId,
          option_id: optionId,
          user_id: user.id,
        });
      }

      await fetchPolls();
    } catch (err) {
      console.error('Error voting:', err);
    } finally {
      setVotingPollId(null);
    }
  };

  const handleRemindToVote = async (poll: Poll) => {
    if (!channelId) return;

    setSendingReminder(poll.id);

    try {
      const { data: channelMembers } = await supabase
        .from('comm_channel_members')
        .select('user_id')
        .eq('channel_id', channelId);

      const { data: votes } = await supabase
        .from('comm_poll_votes')
        .select('user_id')
        .eq('poll_id', poll.id);

      const votedUserIds = new Set(votes?.map((v: any) => v.user_id) || []);
      const nonVoterIds =
        channelMembers
          ?.filter((cm: any) => !votedUserIds.has(cm.user_id))
          .map((cm: any) => cm.user_id) || [];

      if (nonVoterIds.length === 0) {
        Alert.alert('All Voted', 'Everyone has already voted on this poll!');
        return;
      }

      const { error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          user_ids: nonVoterIds,
          title: '📊 Your Vote Needed',
          body: `"${poll.question}" - Vote now!`,
          type: 'poll_reminder',
          data: {
            reference_type: 'poll',
            reference_id: poll.id,
            channel_id: channelId,
          },
        },
      });

      if (error) throw error;

      Alert.alert(
        'Reminder Sent',
        `Notified ${nonVoterIds.length} member(s) to vote`
      );
    } catch (err) {
      console.error('Error sending reminder:', err);
      Alert.alert('Error', 'Failed to send reminder');
    } finally {
      setSendingReminder(null);
    }
  };

  const handleClosePoll = async (pollId: string) => {
    Alert.alert(
      'Close Poll',
      'Are you sure you want to close this poll? No more votes will be accepted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Poll',
          style: 'destructive',
          onPress: async () => {
            setClosingPoll(pollId);
            try {
              await supabase
                .from('comm_polls')
                .update({ is_active: false })
                .eq('id', pollId);

              await fetchPolls();
            } catch (err) {
              console.error('Error closing poll:', err);
            } finally {
              setClosingPoll(null);
            }
          },
        },
      ]
    );
  };

  const filteredPolls = polls.filter((p) => {
    if (filter === 'active') return p.status === 'active';
    if (filter === 'closed') return p.status === 'closed';
    return true;
  });

  const activeCount = polls.filter((p) => p.status === 'active').length;
  const closedCount = polls.filter((p) => p.status === 'closed').length;

  const renderPoll = ({ item }: { item: Poll }) => {
    const isActive = item.status === 'active';
    const isVoting = votingPollId === item.id;
    const isCreator = item.created_by === user?.id;
    const canManagePoll = isStaffInChannel || isCreator;

    return (
      <View style={styles.pollCard}>
        <View style={styles.pollHeader}>
          <View
            style={[
              styles.statusBadge,
              isActive ? styles.statusActive : styles.statusClosed,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isActive ? styles.statusTextActive : styles.statusTextClosed,
              ]}
            >
              {isActive ? 'Active' : 'Closed'}
            </Text>
          </View>
          {item.user_voted && (
            <View style={styles.votedBadge}>
              <Feather name="check" size={12} color="#10b981" />
              <Text style={styles.votedText}>Voted</Text>
            </View>
          )}
        </View>

        <Text style={styles.pollQuestion}>{item.question}</Text>

        <View style={styles.pollMeta}>
          <Text style={styles.pollMetaText}>
            {item.total_votes} vote{item.total_votes !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.pollMetaDot}>•</Text>
          <Text style={styles.pollMetaText}>
            {format(new Date(item.created_at), 'MMM d')}
          </Text>
        </View>

        <Text style={styles.creatorText}>by {item.creator_name}</Text>

        {isVoting ? (
          <ActivityIndicator
            size="small"
            color="#8b5cf6"
            style={{ marginTop: 12 }}
          />
        ) : (
          <View style={styles.optionsContainer}>
            {item.options.map((opt) => {
              const percentage =
                item.total_votes > 0
                  ? Math.round((opt.vote_count / item.total_votes) * 100)
                  : 0;
              const isSelected = item.user_voted_option_id === opt.id;

              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.optionButton,
                    isSelected && styles.optionButtonSelected,
                    !isActive && styles.optionButtonDisabled,
                  ]}
                  onPress={() => isActive && handleVote(item.id, opt.id)}
                  disabled={!isActive}
                  activeOpacity={isActive ? 0.7 : 1}
                >
                  <View
                    style={[
                      styles.optionProgress,
                      { width: `${percentage}%` },
                      isSelected && styles.optionProgressSelected,
                    ]}
                  />
                  <View style={styles.optionContent}>
                    <View style={styles.optionLeft}>
                      {isSelected ? (
                        <Feather
                          name="check-circle"
                          size={18}
                          color="#8b5cf6"
                        />
                      ) : (
                        <View style={styles.radioOuter} />
                      )}
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextSelected,
                        ]}
                      >
                        {opt.text}
                      </Text>
                    </View>
                    <Text style={styles.optionPercent}>{percentage}%</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {canManagePoll && isActive && (
          <View style={styles.staffControls}>
            {item.non_voter_count > 0 && (
              <TouchableOpacity
                style={styles.remindButton}
                onPress={() => handleRemindToVote(item)}
                disabled={sendingReminder === item.id}
              >
                {sendingReminder === item.id ? (
                  <ActivityIndicator size="small" color="#8b5cf6" />
                ) : (
                  <>
                    <Feather name="bell" size={16} color="#8b5cf6" />
                    <Text style={styles.remindButtonText}>
                      Remind {item.non_voter_count} to Vote
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => handleClosePoll(item.id)}
              disabled={closingPoll === item.id}
            >
              {closingPoll === item.id ? (
                <ActivityIndicator size="small" color="#64748b" />
              ) : (
                <>
                  <Feather name="x-circle" size={16} color="#64748b" />
                  <Text style={styles.closeButtonText}>Close Poll</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Polls</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Polls ({polls.length})</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.filterTabs}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text
            style={[
              styles.filterTabText,
              filter === 'all' && styles.filterTabTextActive,
            ]}
          >
            All ({polls.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'active' && styles.filterTabActive,
          ]}
          onPress={() => setFilter('active')}
        >
          <Text
            style={[
              styles.filterTabText,
              filter === 'active' && styles.filterTabTextActive,
            ]}
          >
            Active ({activeCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'closed' && styles.filterTabActive,
          ]}
          onPress={() => setFilter('closed')}
        >
          <Text
            style={[
              styles.filterTabText,
              filter === 'closed' && styles.filterTabTextActive,
            ]}
          >
            Closed ({closedCount})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredPolls}
        keyExtractor={(item) => item.id}
        renderItem={renderPoll}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="stats-chart-outline" size={48} color="#475569" />
            <Text style={styles.emptyTitle}>No polls</Text>
            <Text style={styles.emptySubtitle}>
              {filter === 'active'
                ? 'No active polls right now'
                : filter === 'closed'
                  ? 'No closed polls yet'
                  : 'No polls have been created in this chat'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  filterTab: {
    paddingVertical: 8,
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
    padding: 16,
    gap: 12,
  },
  pollCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  statusActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  statusClosed: {
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statusTextActive: {
    color: '#a78bfa',
  },
  statusTextClosed: {
    color: '#64748b',
  },
  votedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  votedText: {
    fontSize: 12,
    color: '#10b981',
  },
  pollQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  pollMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pollMetaText: {
    fontSize: 12,
    color: '#64748b',
  },
  pollMetaDot: {
    fontSize: 12,
    color: '#475569',
    marginHorizontal: 6,
  },
  creatorText: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 12,
  },
  optionsContainer: {
    marginTop: 12,
    gap: 8,
  },
  optionButton: {
    position: 'relative',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  optionButtonSelected: {
    borderColor: '#8b5cf6',
  },
  optionButtonDisabled: {
    opacity: 0.8,
  },
  optionProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  optionProgressSelected: {
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#64748b',
  },
  optionText: {
    fontSize: 14,
    color: '#e2e8f0',
    flex: 1,
  },
  optionTextSelected: {
    color: '#fff',
    fontWeight: '500',
  },
  optionPercent: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
    minWidth: 40,
    textAlign: 'right',
  },
  staffControls: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  remindButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  remindButtonText: {
    fontSize: 13,
    color: '#8b5cf6',
    fontWeight: '500',
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
  },
  closeButtonText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
  },
});
