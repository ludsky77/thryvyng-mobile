import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
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
}

export default function ChannelPollsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { channelId } = (route.params as { channelId: string }) || {};
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('all');

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
          votedPollIds = new Set(
            votes.filter((v: any) => v.user_id === user.id).map((v: any) => v.poll_id)
          );
        }
      }

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

  const filteredPolls = polls.filter((p) => {
    if (filter === 'active') return p.status === 'active';
    if (filter === 'closed') return p.status === 'closed';
    return true;
  });

  const activeCount = polls.filter((p) => p.status === 'active').length;
  const closedCount = polls.filter((p) => p.status === 'closed').length;

  const renderPoll = ({ item }: { item: Poll }) => {
    const isActive = item.status === 'active';

    return (
      <TouchableOpacity
        style={styles.pollCard}
        onPress={() => navigation.goBack()}
      >
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
            {item.options.length} option{item.options.length !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.pollMetaDot}>•</Text>
          <Text style={styles.pollMetaText}>
            {format(new Date(item.created_at), 'MMM d')}
          </Text>
        </View>

        <Text style={styles.creatorText}>by {item.creator_name}</Text>

        {item.options.slice(0, 3).map((opt) => {
          const percentage =
            item.total_votes > 0
              ? Math.round((opt.vote_count / item.total_votes) * 100)
              : 0;
          return (
            <View key={opt.id} style={styles.optionRow}>
              <View style={styles.optionBarBg}>
                <View
                  style={[styles.optionBarFill, { width: `${percentage}%` }]}
                />
              </View>
              <Text style={styles.optionText} numberOfLines={1}>
                {opt.text}
              </Text>
              <Text style={styles.optionPercent}>{percentage}%</Text>
            </View>
          );
        })}
        {item.options.length > 3 && (
          <Text style={styles.moreOptions}>
            +{item.options.length - 3} more options
          </Text>
        )}
      </TouchableOpacity>
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
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  optionBarBg: {
    width: 60,
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
  },
  optionBarFill: {
    height: '100%',
    backgroundColor: '#8b5cf6',
    borderRadius: 3,
  },
  optionText: {
    flex: 1,
    fontSize: 13,
    color: '#94a3b8',
  },
  optionPercent: {
    fontSize: 12,
    color: '#64748b',
    width: 35,
    textAlign: 'right',
  },
  moreOptions: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
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
