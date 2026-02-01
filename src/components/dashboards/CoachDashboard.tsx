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
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface CoachDashboardProps {
  teamId: string | null;
  navigation: any;
}

interface Team {
  id: string;
  name: string;
  status: string | null;
  club_id: string | null;
  clubs?: { id: string; name: string; logo_url?: string | null } | null;
  // Photo columns - check console for actual column name
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

export default function CoachDashboard({ teamId, navigation }: CoachDashboardProps) {
  const [team, setTeam] = useState<Team | null>(null);
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    console.log('CoachDashboard teamId:', teamId);

    if (!teamId || typeof teamId !== 'string' || !teamId.trim()) {
      setError('No team selected');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*, clubs(id, name, logo_url)')
        .eq('id', teamId)
        .single();

      // Debug: discover team columns (remove after finding photo column)
      console.log('All team columns:', Object.keys(teamData || {}));
      console.log('Team data:', teamData);

      if (teamError) {
        console.warn('CoachDashboard team fetch error:', teamError.message, teamError.code);
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

      const { count } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);
      setPlayerCount(count || 0);

      const { data: players } = await supabase
        .from('players')
        .select('id, first_name, last_name, total_xp')
        .eq('team_id', teamId)
        .order('total_xp', { ascending: false })
        .limit(5);
      setTopPlayers((players || []) as TopPlayer[]);
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

  return (
    <ScrollView style={styles.container}>
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

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>$0</Text>
          <Text style={styles.statLabel}>Available</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>$0</Text>
          <Text style={styles.statLabel}>Lifetime Earned</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{playerCount}</Text>
          <Text style={styles.statLabel}>Players</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>0</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Invite Players</Text>
        <TouchableOpacity
          style={styles.inviteButton}
          onPress={handleShareInvite}
        >
          <Text style={styles.inviteButtonText}>🔗 Share Join Link</Text>
        </TouchableOpacity>
        <Text style={styles.inviteHint}>{inviteUrl}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📊 Top XP Earners</Text>
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

      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() =>
            navigation.getParent()?.getParent()?.navigate('TeamsTab', {
              screen: 'Roster',
              params: { team_id: teamId },
            })
          }
        >
          <Text style={styles.actionButtonText}>👥 Team Roster</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() =>
            navigation.getParent()?.getParent()?.navigate('TeamsTab', {
              screen: 'TeamStaff',
              params: { team_id: teamId },
            })
          }
        >
          <Text style={styles.actionButtonText}>👔 Team Staff</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() =>
            navigation.getParent()?.navigate('ChatTab')
          }
        >
          <Text style={styles.actionButtonText}>💬 Messages</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() =>
            navigation.getParent()?.navigate('CalendarTab')
          }
        >
          <Text style={styles.actionButtonText}>📅 Calendar</Text>
        </TouchableOpacity>
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
    fontSize: 11,
    marginTop: 4,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
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
  emptyText: {
    color: '#888',
    fontSize: 14,
  },
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
  quickActions: {
    padding: 16,
  },
  actionButton: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
  },
  bottomPadding: {
    height: 40,
  },
});
