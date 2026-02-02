import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Image,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { formatDistanceToNow } from 'date-fns';

interface CoachDashboardProps {
  teamId: string | null;
}

interface Team {
  id: string;
  name: string;
  status: string | null;
  club_id: string | null;
  clubs?: { id: string; name: string; logo_url?: string | null } | null;
  photo_url?: string | null;
  team_photo?: string | null;
  image_url?: string | null;
  logo_url?: string | null;
  photo?: string | null;
  image?: string | null;
}

interface TopPlayer {
  id: string;
  first_name: string;
  last_name: string;
  total_xp: number;
}

interface TopFundraiser {
  id: string;
  first_name: string;
  last_name: string;
  amount: number;
}

interface RecentActivity {
  id: string;
  icon: string;
  description: string;
  timeAgo: string;
  created_at: string;
}

export default function CoachDashboard({ teamId }: CoachDashboardProps) {
  const navigation = useNavigation<any>();
  const [team, setTeam] = useState<Team | null>(null);
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);
  const [topFundraisers, setTopFundraisers] = useState<TopFundraiser[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [teamTotalXP, setTeamTotalXP] = useState(0);
  const [coursesPurchased, setCoursesPurchased] = useState(0);
  const [productsSold, setProductsSold] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!teamId || typeof teamId !== 'string' || !teamId.trim()) {
      setError('No team selected');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch team data
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*, clubs(id, name, logo_url)')
        .eq('id', teamId)
        .single();

      if (teamError) {
        console.warn('CoachDashboard team fetch error:', teamError.message);
        setError(teamError.message || 'Failed to load team');
        setTeam(null);
        setLoading(false);
        return;
      }

      if (!teamData) {
        setError('Team not found');
        setTeam(null);
        setLoading(false);
        return;
      }

      setTeam(teamData as Team);

      // Fetch player count
      const { count } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);
      setPlayerCount(count || 0);

      // Fetch players with XP for stats and leaderboard
      const { data: playersData } = await supabase
        .from('players')
        .select('id, first_name, last_name, total_xp')
        .eq('team_id', teamId)
        .order('total_xp', { ascending: false });

      if (playersData) {
        setTopPlayers(playersData.slice(0, 5) as TopPlayer[]);
        const totalXP = playersData.reduce((sum, p) => sum + (p.total_xp || 0), 0);
        setTeamTotalXP(totalXP);
      }

      // Fetch revenue stats (from orders table if it exists)
      try {
        const { data: ordersData } = await supabase
          .from('orders')
          .select('total_amount')
          .eq('team_id', teamId);
        const revenue = ordersData?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
        setTotalRevenue(revenue);
      } catch {
        setTotalRevenue(0);
      }

      // Fetch course enrollments count
      try {
        const { count: coursesCount } = await supabase
          .from('course_enrollments')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', teamId);
        setCoursesPurchased(coursesCount || 0);
      } catch {
        setCoursesPurchased(0);
      }

      // Fetch top fundraisers (this month)
      try {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { data: fundraisingData } = await supabase
          .from('referral_transactions')
          .select('player_id, amount, players!player_id(first_name, last_name)')
          .eq('team_id', teamId)
          .gte('created_at', startOfMonth.toISOString());

        if (fundraisingData && fundraisingData.length > 0) {
          // Aggregate by player
          const playerTotals: Record<string, TopFundraiser> = {};
          fundraisingData.forEach((txn: any) => {
            const playerId = txn.player_id;
            if (!playerTotals[playerId]) {
              playerTotals[playerId] = {
                id: playerId,
                first_name: txn.players?.first_name || '',
                last_name: txn.players?.last_name || '',
                amount: 0,
              };
            }
            playerTotals[playerId].amount += txn.amount || 0;
          });
          const sorted = Object.values(playerTotals).sort((a, b) => b.amount - a.amount);
          setTopFundraisers(sorted.slice(0, 5));
        }
      } catch {
        setTopFundraisers([]);
      }

      // Fetch recent activity
      try {
        const activities: RecentActivity[] = [];

        // Get recent events
        const { data: recentEvents } = await supabase
          .from('cal_events')
          .select('id, title, created_at')
          .eq('team_id', teamId)
          .order('created_at', { ascending: false })
          .limit(3);

        recentEvents?.forEach((event: any) => {
          activities.push({
            id: `event-${event.id}`,
            icon: '📅',
            description: `New event created: ${event.title}`,
            timeAgo: formatDistanceToNow(new Date(event.created_at), { addSuffix: true }),
            created_at: event.created_at,
          });
        });

        // Get recent evaluations
        const { data: recentEvals } = await supabase
          .from('player_evaluations')
          .select('id, created_at, player:players!player_id(first_name, last_name)')
          .eq('team_id', teamId)
          .order('created_at', { ascending: false })
          .limit(3);

        recentEvals?.forEach((eval_: any) => {
          activities.push({
            id: `eval-${eval_.id}`,
            icon: '📝',
            description: `Evaluation created for ${eval_.player?.first_name || 'player'}`,
            timeAgo: formatDistanceToNow(new Date(eval_.created_at), { addSuffix: true }),
            created_at: eval_.created_at,
          });
        });

        // Sort by date and take top 5
        activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRecentActivity(activities.slice(0, 5));
      } catch {
        setRecentActivity([]);
      }
    } catch (err: any) {
      console.error('Error fetching coach dashboard:', err);
      setError(err?.message || 'Something went wrong');
      setTeam(null);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const inviteUrl = team?.id
    ? `https://thryvyng.com/join-team/${team.id}`
    : 'https://thryvyng.com/join';

  const handleShareInvite = async () => {
    try {
      await Share.share({
        message: `Join ${team?.name || 'our team'} on Thryvyng: ${inviteUrl}`,
        url: inviteUrl,
        title: 'Join Team',
      });
    } catch (err: any) {
      if (err.message !== 'User did not share') {
        console.error('Share error:', err);
      }
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  if (!team) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>👥</Text>
        <Text style={styles.errorText}>
          {error || 'Unable to load team'}
        </Text>
        <Text style={styles.errorHint}>
          Try switching your role or check your connection.
        </Text>
      </View>
    );
  }

  const clubName = (team.clubs as any)?.name;

  // Check all possible team photo columns (console.log above shows which exists)
  const teamPhotoUrl =
    (team as any).photo_url ??
    (team as any).team_photo ??
    (team as any).image_url ??
    (team as any).logo_url ??
    (team as any).photo ??
    (team as any).image;

  const navigateToScreen = (screenName: string, params?: any) => {
    console.log('Navigating to:', screenName, 'with params:', params);
    try {
      // For tab switches (Chat and Calendar)
      if (screenName === 'ChatTab' || screenName === 'CalendarTab') {
        const parent = navigation.getParent();
        if (parent) {
          parent.navigate(screenName);
        }
        return;
      }

      // For screens in the same stack (HomeStack), use direct navigation
      navigation.navigate(screenName, params);
    } catch (err) {
      console.warn('Navigation error:', err);
      Alert.alert('Navigation Error', 'Unable to navigate to the requested screen.');
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* 1. Team Header */}
      <View style={styles.header}>
        <View style={styles.teamHeader}>
          {/* Left - Club Emblem */}
          {team.clubs?.logo_url ? (
            <Image
              source={{ uri: team.clubs.logo_url }}
              style={styles.clubEmblem}
            />
          ) : (
            <View style={styles.clubEmblemPlaceholder}>
              <Text style={styles.clubEmblemText}>
                {team.name?.substring(0, 2).toUpperCase() ?? '??'}
              </Text>
            </View>
          )}

          {/* Center - Team Info */}
          <View style={styles.teamInfo}>
            <Text style={styles.teamName}>{team.name}</Text>
            {clubName && (
              <Text style={styles.clubName}>🏆 {clubName}</Text>
            )}
            {team.status === 'approved' && (
              <View style={styles.approvedBadge}>
                <Text style={styles.approvedText}>Approved</Text>
              </View>
            )}
          </View>

          {/* Right - Team Photo */}
          {teamPhotoUrl ? (
            <Image source={{ uri: teamPhotoUrl }} style={styles.teamPhoto} />
          ) : (
            <View style={styles.teamPhotoPlaceholder}>
              <Text style={styles.teamPhotoText}>
                {team.name?.substring(0, 2).toUpperCase() ?? '??'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* 2. Finance Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>$0</Text>
          <Text style={styles.statLabel}>Available</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>$0</Text>
          <Text style={styles.statLabel}>Lifetime</Text>
        </View>
        <TouchableOpacity
          style={styles.statBox}
          onPress={() => navigateToScreen('Roster', { teamId, team_id: teamId, teamName: team.name })}
        >
          <Text style={styles.statValue}>{playerCount}</Text>
          <Text style={styles.statLabel}>Players</Text>
          <Text style={styles.viewLink}>View →</Text>
        </TouchableOpacity>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>0</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>

      {/* 3. Invite Players Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔗 Invite Players</Text>
        <TouchableOpacity
          style={styles.inviteButton}
          onPress={handleShareInvite}
        >
          <Text style={styles.inviteButtonText}>📤 Share Join Link</Text>
        </TouchableOpacity>
        <Text style={styles.inviteHint} numberOfLines={1}>{inviteUrl}</Text>
      </View>

      {/* 4. Quick Actions Grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚡ QUICK ACTIONS</Text>
        <View style={styles.quickActionsGrid}>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => {
              console.log('View Roster pressed, teamId:', teamId, 'teamName:', team?.name);
              navigateToScreen('Roster', { teamId: teamId, team_id: teamId, teamName: team?.name || '' });
            }}
          >
            <Text style={styles.quickActionIcon}>👥</Text>
            <Text style={styles.quickActionText}>View Roster</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => {
              console.log('Team Staff pressed, teamId:', teamId);
              navigateToScreen('TeamStaff', { teamId: teamId, team_id: teamId });
            }}
          >
            <Text style={styles.quickActionIcon}>🏷️</Text>
            <Text style={styles.quickActionText}>Team Staff</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => {
              console.log('Evaluations pressed, teamId:', teamId);
              navigateToScreen('PlayerEvaluations', { teamId: teamId });
            }}
          >
            <Text style={styles.quickActionIcon}>📝</Text>
            <Text style={styles.quickActionText}>Evaluations</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => {
              console.log('Messages pressed');
              navigateToScreen('ChatTab');
            }}
          >
            <Text style={styles.quickActionIcon}>💬</Text>
            <Text style={styles.quickActionText}>Messages</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => {
              console.log('Calendar pressed');
              navigateToScreen('CalendarTab');
            }}
          >
            <Text style={styles.quickActionIcon}>📅</Text>
            <Text style={styles.quickActionText}>Calendar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => {
              console.log('Certificates pressed, teamId:', teamId);
              navigateToScreen('TeamCertificates', { teamId: teamId });
            }}
          >
            <Text style={styles.quickActionIcon}>🏆</Text>
            <Text style={styles.quickActionText}>Certificates</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 5. Team Performance Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📊 TEAM PERFORMANCE</Text>
        <View style={styles.performanceRow}>
          <View style={styles.performanceBox}>
            <Text style={styles.performanceValue}>${totalRevenue.toFixed(2)}</Text>
            <Text style={styles.performanceLabel}>Total Revenue</Text>
          </View>
          <View style={styles.performanceBox}>
            <Text style={styles.performanceValue}>{teamTotalXP}</Text>
            <Text style={styles.performanceLabel}>Team XP</Text>
          </View>
          <View style={styles.performanceBox}>
            <Text style={styles.performanceValue}>{coursesPurchased}</Text>
            <Text style={styles.performanceLabel}>Courses</Text>
          </View>
          <View style={styles.performanceBox}>
            <Text style={styles.performanceValue}>{productsSold}</Text>
            <Text style={styles.performanceLabel}>Products</Text>
          </View>
        </View>
      </View>

      {/* 6. Top Fundraising Players */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💰 TOP FUNDRAISERS (This Month)</Text>
        <View style={styles.card}>
          {topFundraisers.length > 0 ? (
            topFundraisers.map((player, index) => (
              <View key={player.id} style={styles.fundraiserRow}>
                <Text style={styles.rank}>#{index + 1}</Text>
                <Text style={styles.fundraiserName}>{player.first_name} {player.last_name}</Text>
                <Text style={styles.fundraiserAmount}>${player.amount.toFixed(2)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No fundraising activity this month</Text>
          )}
        </View>
      </View>

      {/* 7. Top XP Earners */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🏅 TOP XP EARNERS</Text>
        {topPlayers.length === 0 ? (
          <Text style={styles.emptyText}>No players yet</Text>
        ) : (
          topPlayers.map((p, i) => (
            <View key={p.id} style={styles.leaderRow}>
              <Text style={styles.rank}>#{i + 1}</Text>
              <Text style={styles.leaderName}>
                {p.first_name} {p.last_name}
              </Text>
              <Text style={styles.leaderXp}>{p.total_xp} XP</Text>
            </View>
          ))
        )}
      </View>

      {/* 8. Recent Activity */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🕐 RECENT ACTIVITY</Text>
        <View style={styles.card}>
          {recentActivity.length > 0 ? (
            recentActivity.map((activity) => (
              <View key={activity.id} style={styles.activityRow}>
                <Text style={styles.activityIcon}>{activity.icon}</Text>
                <View style={styles.activityContent}>
                  <Text style={styles.activityText} numberOfLines={2}>{activity.description}</Text>
                  <Text style={styles.activityTime}>{activity.timeAgo}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No recent activity</Text>
          )}
        </View>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorHint: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
  header: {
    padding: 16,
    backgroundColor: '#2a2a4e',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clubEmblem: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  clubEmblemPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clubEmblemText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  teamInfo: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: 'flex-start',
  },
  teamName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  clubName: {
    fontSize: 14,
    color: '#a78bfa',
    marginTop: 4,
  },
  approvedBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  teamPhoto: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  teamPhotoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamPhotoText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  approvedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: -20,
    backgroundColor: '#2a2a4e',
    borderRadius: 16,
    padding: 16,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    color: '#888',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  viewLink: {
    color: '#a78bfa',
    fontSize: 11,
    marginTop: 4,
  },
  section: {
    padding: 16,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#a78bfa',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  inviteButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  inviteButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  inviteHint: {
    color: '#666',
    fontSize: 11,
  },
  // Quick Actions Grid
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickAction: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    width: '31%',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  quickActionIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  quickActionText: {
    color: '#fff',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '500',
  },
  // Team Performance
  performanceRow: {
    flexDirection: 'row',
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 14,
  },
  performanceBox: {
    flex: 1,
    alignItems: 'center',
  },
  performanceValue: {
    color: '#10b981',
    fontSize: 16,
    fontWeight: '700',
  },
  performanceLabel: {
    color: '#888',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  // Card container
  card: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 14,
  },
  // Fundraiser rows
  fundraiserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a5e',
  },
  fundraiserName: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  fundraiserAmount: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '600',
  },
  // Leaderboard rows
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a4e',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  rank: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '700',
    width: 32,
  },
  leaderName: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  leaderXp: {
    color: '#a78bfa',
    fontSize: 14,
    fontWeight: '600',
  },
  // Activity rows
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a5e',
  },
  activityIcon: {
    fontSize: 18,
    marginRight: 12,
    marginTop: 2,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  activityTime: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 10,
  },
  bottomPadding: {
    height: 40,
  },
});
