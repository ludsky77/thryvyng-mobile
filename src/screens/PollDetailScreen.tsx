import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const STAFF_ROLES = [
  'head_coach',
  'assistant_coach',
  'team_manager',
  'club_admin',
  'club_director',
  'platform_admin',
];

function getInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AvatarProps {
  url: string | null;
  name: string | null;
  size?: number;
}
function Avatar({ url, name, size = 32 }: AvatarProps) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (url) {
    return <Image source={{ uri: url }} style={[styles.avatarImg, style]} />;
  }
  return (
    <View style={[styles.avatarInitials, style]}>
      <Text style={[styles.initialsText, { fontSize: size * 0.36 }]}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

interface SmallAvatar {
  url: string | null;
  name: string | null;
}

function AvatarStack({
  avatars,
  max = 5,
}: {
  avatars: SmallAvatar[];
  max?: number;
}) {
  const shown = avatars.slice(0, max);
  const extra = avatars.length - max;
  return (
    <View style={styles.avatarStack}>
      {shown.map((a, i) => (
        <View
          key={i}
          style={[styles.stackItem, i > 0 && styles.stackItemOverlap]}
        >
          <Avatar url={a.url} name={a.name} size={28} />
        </View>
      ))}
      {extra > 0 && (
        <View style={[styles.stackItem, styles.stackItemOverlap, styles.extraCircle]}>
          <Text style={styles.extraText}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

interface RawOption {
  id: string;
  option_text: string;
  sort_order: number;
}

interface RawVote {
  id: string;
  option_id: string;
  user_id: string;
  rank: number | null;
  profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
}

interface RawPoll {
  id: string;
  question: string;
  poll_type: string;
  is_anonymous: boolean;
  is_active: boolean;
  ends_at: string | null;
  created_by: string;
  channel_id: string | null;
  comm_poll_options: RawOption | RawOption[];
  comm_poll_votes: RawVote | RawVote[];
}

function toArray<T>(val: T | T[] | null | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

export default function PollDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { pollId } = route.params || {};
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [poll, setPoll] = useState<RawPoll | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [activeTab, setActiveTab] = useState<'byOption' | 'byVoter'>('byOption');

  const loadData = useCallback(async () => {
    if (!pollId) {
      setError('No poll ID provided');
      setLoading(false);
      return;
    }
    try {
      const { data, error: err } = await supabase
        .from('comm_polls')
        .select(`
          id, question, poll_type, is_anonymous, is_active, ends_at, created_by, channel_id,
          comm_poll_options(id, option_text, sort_order),
          comm_poll_votes(id, option_id, user_id, rank, profiles:profiles!user_id(id, full_name, avatar_url))
        `)
        .eq('id', pollId)
        .single();

      if (err || !data) throw new Error('Poll not found');
      setPoll(data as unknown as RawPoll);

      if (user?.id) {
        const channelId = (data as any).channel_id;
        let staffFound = false;

        if (channelId) {
          const { data: chan } = await supabase
            .from('comm_channels')
            .select('team_id')
            .eq('id', channelId)
            .maybeSingle();

          if (chan?.team_id) {
            const { data: staffRow } = await supabase
              .from('team_staff')
              .select('id')
              .eq('team_id', chan.team_id)
              .eq('user_id', user.id)
              .maybeSingle();
            if (staffRow) staffFound = true;
          }
        }

        if (!staffFound) {
          const { data: roles } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .in('role', STAFF_ROLES)
            .limit(1);
          if (roles && roles.length > 0) staffFound = true;
        }

        setIsStaff(staffFound);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load poll');
    } finally {
      setLoading(false);
    }
  }, [pollId, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isCreator = poll?.created_by === user?.id;
  const canSeeVoters = isCreator || isStaff;
  const showVoterDetails = canSeeVoters || !poll?.is_anonymous;
  const isClosed =
    poll != null &&
    (!poll.is_active ||
      (poll.ends_at != null && new Date(poll.ends_at) < new Date()));

  const totalVotes = useMemo(() => {
    if (!poll) return 0;
    return toArray(poll.comm_poll_votes).length;
  }, [poll]);

  // Options sorted by vote count desc, with per-option voter list
  const processedOptions = useMemo(() => {
    if (!poll) return [];
    const options = toArray(poll.comm_poll_options);
    const votes = toArray(poll.comm_poll_votes);
    return options
      .map((opt) => {
        const optVotes = votes.filter((v) => v.option_id === opt.id);
        const voters = optVotes
          .map((v) => v.profiles)
          .filter(Boolean) as { id: string; full_name: string | null; avatar_url: string | null }[];
        const pct = totalVotes > 0 ? Math.round((optVotes.length / totalVotes) * 100) : 0;
        return { ...opt, vote_count: optVotes.length, pct, voters };
      })
      .sort((a, b) => b.vote_count - a.vote_count);
  }, [poll, totalVotes]);

  // Voters grouped by user, sorted alphabetically
  const voterEntries = useMemo(() => {
    if (!poll || !showVoterDetails) return [];
    const votes = toArray(poll.comm_poll_votes);
    const options = toArray(poll.comm_poll_options);
    const optMap = new Map(options.map((o) => [o.id, o.option_text]));

    const byUser = new Map<
      string,
      {
        profile: { id: string; full_name: string | null; avatar_url: string | null };
        votes: { option_id: string; rank: number | null }[];
      }
    >();

    votes.forEach((v) => {
      if (!v.user_id) return;
      if (!byUser.has(v.user_id)) {
        byUser.set(v.user_id, {
          profile: v.profiles ?? { id: v.user_id, full_name: null, avatar_url: null },
          votes: [],
        });
      }
      byUser.get(v.user_id)!.votes.push({ option_id: v.option_id, rank: v.rank });
    });

    return Array.from(byUser.entries())
      .map(([, entry]) => {
        let voteLabel: string;
        if (poll.poll_type === 'ranked') {
          const sorted = [...entry.votes].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
          voteLabel = sorted
            .map((v, i) => `${i + 1}. ${optMap.get(v.option_id) ?? '?'}`)
            .join(', ');
        } else {
          voteLabel = entry.votes.map((v) => optMap.get(v.option_id) ?? '?').join(', ');
        }
        return { profile: entry.profile, voteLabel };
      })
      .sort((a, b) =>
        (a.profile.full_name ?? '').localeCompare(b.profile.full_name ?? '')
      );
  }, [poll, showVoterDetails]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Poll Results</Text>
        </View>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !poll) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Poll Results</Text>
        </View>
        <View style={styles.centerState}>
          <Feather name="alert-circle" size={36} color="#ef4444" />
          <Text style={styles.errorText}>{error ?? 'Poll not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pollTypeLabel =
    poll.poll_type === 'multiple'
      ? 'Multi-select'
      : poll.poll_type === 'ranked'
      ? 'Ranked'
      : poll.poll_type === 'board_room'
      ? 'Board Vote'
      : 'Single choice';

  const renderOptionRow = ({
    item,
  }: {
    item: (typeof processedOptions)[number];
  }) => (
    <View style={styles.optionCard}>
      <View style={styles.optionTop}>
        <Text style={styles.optionText}>{item.option_text}</Text>
        <Text style={styles.optionMeta}>
          {item.vote_count} vote{item.vote_count !== 1 ? 's' : ''} · {item.pct}%
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${item.pct}%` as any }]} />
      </View>
      {showVoterDetails && item.voters.length > 0 && (
        <AvatarStack
          avatars={item.voters.map((v) => ({ url: v.avatar_url, name: v.full_name }))}
        />
      )}
      {!showVoterDetails && poll.is_anonymous && item.voters.length > 0 && null}
    </View>
  );

  const renderVoterRow = ({
    item,
  }: {
    item: (typeof voterEntries)[number];
  }) => (
    <View style={styles.voterCard}>
      <Avatar url={item.profile.avatar_url} name={item.profile.full_name} size={40} />
      <View style={styles.voterInfo}>
        <Text style={styles.voterName}>{item.profile.full_name ?? 'Anonymous'}</Text>
        <Text style={styles.voterVote} numberOfLines={2}>
          {item.voteLabel}
        </Text>
      </View>
    </View>
  );

  const showByVoterTab = showVoterDetails;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Poll Results
        </Text>
      </View>

      {/* Poll question + meta */}
      <View style={styles.questionSection}>
        <Text style={styles.questionText}>{poll.question}</Text>
        <View style={styles.metaRow}>
          <View style={styles.badge}>
            <Feather name="bar-chart-2" size={12} color="#8b5cf6" />
            <Text style={styles.badgeText}>{pollTypeLabel}</Text>
          </View>
          <View style={styles.badge}>
            <Feather name="users" size={12} color="#94a3b8" />
            <Text style={[styles.badgeText, { color: '#94a3b8' }]}>
              {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
            </Text>
          </View>
          <View style={[styles.badge, isClosed ? styles.badgeClosed : styles.badgeOpen]}>
            <Text style={[styles.badgeText, isClosed ? styles.badgeClosedText : styles.badgeOpenText]}>
              {isClosed ? 'Closed' : 'Open'}
            </Text>
          </View>
          {poll.is_anonymous && (
            <View style={styles.badge}>
              <Ionicons name="lock-closed-outline" size={12} color="#64748b" />
              <Text style={[styles.badgeText, { color: '#64748b' }]}>Anonymous</Text>
            </View>
          )}
        </View>
        {canSeeVoters && poll.is_anonymous && (
          <View style={styles.staffBanner}>
            <Ionicons name="eye-outline" size={13} color="#f59e0b" />
            <Text style={styles.staffBannerText}>Voter details visible to staff only</Text>
          </View>
        )}
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'byOption' && styles.tabActive]}
          onPress={() => setActiveTab('byOption')}
        >
          <Text style={[styles.tabText, activeTab === 'byOption' && styles.tabTextActive]}>
            By Option
          </Text>
        </TouchableOpacity>
        {showByVoterTab && (
          <TouchableOpacity
            style={[styles.tab, activeTab === 'byVoter' && styles.tabActive]}
            onPress={() => setActiveTab('byVoter')}
          >
            <Text style={[styles.tabText, activeTab === 'byVoter' && styles.tabTextActive]}>
              By Voter
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {activeTab === 'byOption' ? (
        processedOptions.length === 0 ? (
          <View style={styles.centerState}>
            <Feather name="bar-chart-2" size={36} color="#334155" />
            <Text style={styles.emptyText}>No votes yet</Text>
          </View>
        ) : (
          <FlatList
            data={processedOptions}
            keyExtractor={(item) => item.id}
            renderItem={renderOptionRow}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              !showVoterDetails && poll.is_anonymous ? (
                <View style={styles.anonFooter}>
                  <Ionicons name="lock-closed-outline" size={16} color="#64748b" />
                  <Text style={styles.anonFooterText}>Votes are anonymous</Text>
                </View>
              ) : null
            }
          />
        )
      ) : (
        <>
          {voterEntries.length === 0 ? (
            <View style={styles.centerState}>
              <Feather name="users" size={36} color="#334155" />
              <Text style={styles.emptyText}>No votes yet</Text>
            </View>
          ) : (
            <FlatList
              data={voterEntries}
              keyExtractor={(_, i) => String(i)}
              renderItem={renderVoterRow}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backBtn: {
    padding: 2,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  questionSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  questionText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
    lineHeight: 24,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  badgeText: {
    color: '#8b5cf6',
    fontSize: 11,
    fontWeight: '600',
  },
  badgeOpen: {
    borderColor: '#10b981',
  },
  badgeOpenText: {
    color: '#10b981',
  },
  badgeClosed: {
    borderColor: '#64748b',
  },
  badgeClosedText: {
    color: '#64748b',
  },
  staffBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: 'rgba(245,158,11,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    alignSelf: 'flex-start',
  },
  staffBannerText: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '500',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginRight: 24,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#8b5cf6',
  },
  tabText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#8b5cf6',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  optionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  optionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  optionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    lineHeight: 20,
  },
  optionMeta: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right',
  },
  barTrack: {
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#8b5cf6',
    borderRadius: 3,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  stackItem: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#1e293b',
    overflow: 'hidden',
  },
  stackItemOverlap: {
    marginLeft: -6,
  },
  extraCircle: {
    width: 28,
    height: 28,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraText: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '700',
  },
  voterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 12,
  },
  voterInfo: {
    flex: 1,
    gap: 2,
  },
  voterName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  voterVote: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  avatarImg: {
    resizeMode: 'cover',
  },
  avatarInitials: {
    backgroundColor: '#7c3aed33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: '#c4b5fd',
    fontWeight: '700',
  },
  anonFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  anonFooterText: {
    color: '#64748b',
    fontSize: 13,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 15,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 15,
  },
});
