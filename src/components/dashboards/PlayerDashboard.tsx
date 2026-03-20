import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import PlayerAvatar from '../PlayerAvatar';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { LiveGamesWidget } from '../game-stats/LiveGamesWidget';
import QuickActionsCard from '../QuickActionsCard';
import WellnessParentAlert from '../WellnessParentAlert';
import PendingSurveyBanner from '../surveys/PendingSurveyBanner';
import { slugify } from '../../utils/slugify';
import * as Clipboard from 'expo-clipboard';

interface PlayerDashboardProps {
  playerId: string | null;
  navigation: any;
  showLineupWidget?: boolean;
}

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  total_xp: number;
  jersey_number: number | null;
  referral_code: string | null;
  photo_url: string | null;
  team_id: string;
  teams?: { id: string; name: string; color?: string | null; clubs?: { id: string; name: string } | null } | null;
}

interface EnrolledCourse {
  id: string;
  course_id: string;
  progress_percentage: number;
  completed_at?: string | null;
  course?: { id: string; title: string; category?: string | null } | null;
}

interface UpcomingLineup {
  id: string;
  name: string;
  formation_template?: string | null;
  field_type?: string | null;
  opponent_name?: string | null;
  event?: { id: string; title?: string | null; event_date?: string | null; start_time?: string | null } | null;
  players?: { id: string; player_id?: string | null; position_code?: string | null; is_starter?: boolean; is_captain?: boolean }[];
}

export default function PlayerDashboard({ playerId, navigation, showLineupWidget = true }: PlayerDashboardProps) {
  const { user, currentRole } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [enrolledCourses, setEnrolledCourses] = useState<EnrolledCourse[]>([]);
  const [topPlayers, setTopPlayers] = useState<{ id: string; first_name: string; last_name: string; total_xp: number }[]>([]);
  const [upcomingLineups, setUpcomingLineups] = useState<UpcomingLineup[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!playerId) {
      setPlayer(null);
      setLoading(false);
      return;
    }

    try {
      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .select(`
          id,
          first_name,
          last_name,
          total_xp,
          jersey_number,
          referral_code,
          photo_url,
          team_id,
          teams(id, name, color, clubs(id, name))
        `)
        .eq('id', playerId)
        .single();

      if (playerError || !playerData) throw new Error('Player not found');
      setPlayer(playerData as Player);

      const teamId = (playerData as any).team_id;
      const today = new Date().toISOString().split('T')[0];

      // Run independent queries in parallel
      const [enrollmentsResult, topPlayersResult, lineupsResult] = await Promise.all([
        user?.id
          ? supabase
              .from('course_enrollments')
              .select('id, course_id, progress_percentage, completed_at, course:courses(id, title, category)')
              .eq('user_id', user.id)
          : Promise.resolve({ data: [] }),
        teamId
          ? supabase
              .from('players')
              .select('id, first_name, last_name, total_xp')
              .eq('team_id', teamId)
              .order('total_xp', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] }),
        teamId
          ? supabase
              .from('lineup_formations')
              .select(
                'id, name, formation_template, field_type, opponent_name, event_id, event:cal_events!inner(id, title, event_date, start_time), players:lineup_players(id, player_id, position_code, is_starter, is_captain)'
              )
              .eq('team_id', teamId)
              .eq('status', 'published')
              .not('event_id', 'is', null)
              .gte('cal_events.event_date', today)
              .limit(20)
          : Promise.resolve({ data: [] }),
      ]);

      // Process enrollments
      const courseRel = (e: any) => e.course;
      const courses = (enrollmentsResult.data || []).map((e: any) => ({
        ...e,
        course: Array.isArray(courseRel(e)) ? courseRel(e)[0] : courseRel(e),
      }));
      setEnrolledCourses(courses);

      // Process leaderboard
      setTopPlayers((topPlayersResult.data || []) as any);

      // Process lineups
      const lineups = (lineupsResult.data || []) as UpcomingLineup[];
      const withMyPlayer = lineups.filter((l) =>
        (l.players || []).some((p) => p.player_id === playerId)
      );
      const upcoming = withMyPlayer
        .sort((a, b) => (a.event?.event_date || '').localeCompare(b.event?.event_date || ''))
        .slice(0, 3);
      setUpcomingLineups(upcoming);
    } catch (err) {
      console.error('Error fetching player dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [playerId, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const level = player ? Math.floor((player.total_xp || 0) / 1000) + 1 : 1;
  const xpForNextLevel = level * 1000;
  const xpInCurrentLevel = (player?.total_xp || 0) % 1000;
  const progressPct = Math.min(100, (xpInCurrentLevel / 1000) * 100);

  const referralUrl = player?.referral_code
    ? `https://thryvyng.com/support/${slugify(`${player.first_name}-${player.last_name}`)}/${player.referral_code}`
    : '';

  const handleShareReferral = async () => {
    if (!referralUrl || !player) return;
    try {
      await Share.share({
        message: `Hey! Support ${player.first_name} and ${player.teams?.name || 'the team'} by shopping through Thryvyng. Every purchase helps fund our season. Thank you!\n\nTap here: ${referralUrl}`,
      });
    } catch (err: any) {
      if (err.message !== 'User did not share') {
        Alert.alert('Share', referralUrl);
      }
    }
  };

  const handleCopyLink = async () => {
    if (!referralUrl) return;
    try {
      await Clipboard.setStringAsync(referralUrl);
      Alert.alert('Copied!', 'Referral link copied to clipboard.');
    } catch {
      try {
        await Share.share({
          message: referralUrl,
        });
      } catch (err: any) {
        Alert.alert('Link', referralUrl);
      }
    }
  };

  const formatDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  if (!player) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Player not found</Text>
      </View>
    );
  }

  const playerName = `${player.first_name} ${player.last_name}`;
  const teamName = player.teams?.name || '';
  const clubName = (player.teams?.clubs as any)?.name || '';
  const coursesCompleted = enrolledCourses.filter((e) => e.completed_at).length;

  return (
    <ScrollView style={styles.container}>
      <PendingSurveyBanner navigation={navigation} />
      {/* Live Games Widget */}
      {player.team_id && <LiveGamesWidget teamId={player.team_id} />}

      {/* Player Header: [Photo] Name, team • club, XP badge, jersey */}
      <View style={styles.playerHeader}>
        <PlayerAvatar
          photoUrl={player.photo_url}
          jerseyNumber={player.jersey_number}
          firstName={player.first_name}
          lastName={player.last_name}
          size={64}
          teamColor={player.teams?.color || '#8b5cf6'}
        />
        <View style={styles.playerInfo}>
          <Text
            style={styles.playerName}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {player.first_name} {player.last_name}
          </Text>
          <Text style={styles.teamClubName} numberOfLines={2}>
            {teamName}
            {clubName ? ` • ${clubName}` : ''}
          </Text>
          <View style={styles.badgeRow}>
            <View style={styles.xpBadge}>
              <Text style={styles.badgeText}>🏆 {player.total_xp || 0} XP</Text>
            </View>
            {player.jersey_number != null && (
              <View style={styles.jerseyBadge}>
                <Text style={styles.badgeText}>🎽 #{player.jersey_number}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Quick Actions - 2 Rows */}
      <QuickActionsCard
        actions={[
          {
            id: 'courses',
            icon: 'library-outline',
            label: 'Courses',
            color: '#3b82f6',
            onPress: () => navigation.navigate('Courses' as never),
          },
          {
            id: 'games',
            icon: 'game-controller-outline',
            label: 'Games',
            color: '#8b5cf6',
            onPress: () => navigation.navigate('GamesHub' as never),
          },
          {
            id: 'store',
            icon: 'cart-outline',
            label: 'Store',
            color: '#10b981',
            onPress: () => navigation.navigate('ProductStore' as never),
          },
          {
            id: 'evals',
            icon: 'clipboard-outline',
            label: 'Evals',
            color: '#f59e0b',
            onPress: () => navigation.navigate('Evaluations' as never),
          },
          {
            id: 'team',
            icon: 'people-outline',
            label: 'Team Resources',
            color: '#06b6d4',
            onPress: () =>
              navigation.navigate('TeamResources' as never, {
                playerId,
                userId: user?.id,
              }),
          },
          {
            id: 'health',
            icon: 'fitness-outline',
            label: 'Health',
            color: '#ec4899',
            onPress: () =>
              navigation.navigate('Health' as never, {
                playerId,
                userId: user?.id,
              }),
          },
        ]}
      />

      {/* Upcoming Lineup Widget - Compact thin bars */}
      {showLineupWidget && upcomingLineups.length > 0 && (
        <View style={styles.lineupWidgetContainer}>
          {upcomingLineups.slice(0, 3).map((l) => {
            const mySlot = (l.players || []).find((p) => p.player_id === playerId);
            const eventLabel = l.opponent_name || l.event?.title || l.name;
            const eventDate = l.event?.event_date
              ? new Date(l.event.event_date + 'T12:00:00').toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })
              : '';
            const posLabel = mySlot?.position_code || 'Bench';
            const isStarter = mySlot?.is_starter ?? false;
            const isCaptain = mySlot?.is_captain ?? false;
            const starterLabel = isStarter ? 'Starting XI' : 'Substitute';

            return (
              <TouchableOpacity
                key={l.id}
                style={styles.lineupWidgetBar}
                activeOpacity={0.8}
                onPress={() => {
                  navigation.navigate('EventDetail' as never, {
                    eventId: l.event?.id,
                    onRefetch: () => {},
                  });
                }}
              >
                <Text style={styles.lineupWidgetBarEmoji}>⚽</Text>
                <Text style={styles.lineupWidgetBarText} numberOfLines={1}>
                  {eventLabel} · {eventDate} · {posLabel}
                  {isCaptain ? (
                    <Text style={styles.lineupWidgetBarCaptain}> C</Text>
                  ) : null}
                  {' · '}
                  {starterLabel}
                </Text>
                <Text style={styles.lineupWidgetBarChevron}>▸</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Wellness Section - Only shows for parents viewing a female athlete */}
      {currentRole?.role === 'parent' &&
        playerId &&
        user?.id &&
        player && (
          <View style={styles.wellnessSection}>
            <WellnessParentAlert
              playerId={playerId}
              playerName={playerName}
              userId={user.id}
            />
          </View>
        )}

      {/* YOUR PROGRESS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>YOUR PROGRESS</Text>
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLevel}>Level {level}</Text>
            <Text style={styles.progressXp}>
              {xpInCurrentLevel} / 1000 XP
            </Text>
          </View>
          <View style={styles.xpBarTrack}>
            <View style={[styles.xpBarFill, { width: `${progressPct}%` }]} />
          </View>
          <Text style={styles.xpBarHint}>Keep learning to level up!</Text>
        </View>
      </View>

      {/* 📚 MY COURSES */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>📚 MY COURSES</Text>
          <TouchableOpacity onPress={() => navigation.navigate('MyCourses')}>
            <Text style={styles.viewAll}>View All →</Text>
          </TouchableOpacity>
        </View>
        {enrolledCourses.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No courses enrolled yet</Text>
          </View>
        ) : (
          enrolledCourses.slice(0, 3).map((e) => (
            <TouchableOpacity
              key={e.id}
              style={styles.courseCard}
              onPress={() =>
                navigation.navigate('CourseDetail', { course_id: e.course_id })
              }
            >
              <Text style={styles.courseTitle} numberOfLines={1}>
                {(e.course as any)?.title || 'Course'}
              </Text>
              <Text style={styles.progressLabel}>
                Progress: {Math.round(e.progress_percentage || 0)}%
              </Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${e.progress_percentage || 0}%` },
                  ]}
                />
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* 🔗 SHARE & EARN */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔗 SHARE & EARN</Text>
        <View style={styles.shareCard}>
          <Text style={styles.shareLabel}>Your referral link:</Text>
          <Text style={styles.shareLink} numberOfLines={1}>
            {referralUrl || 'No referral code yet'}
          </Text>
          <View style={styles.shareButtons}>
            <TouchableOpacity
              style={styles.copyButton}
              onPress={handleCopyLink}
              disabled={!referralUrl}
            >
              <Text style={styles.copyButtonText}>📋 Copy Link</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShareReferral}
              disabled={!referralUrl}
            >
              <Text style={styles.shareButtonText}>📤 Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 🏅 TEAM LEADERBOARD */}
      {topPlayers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏅 TEAM LEADERBOARD</Text>
          <View style={styles.leaderboardCard}>
            {topPlayers.map((p, i) => (
              <View
                key={p.id}
                style={[
                  styles.leaderRow,
                  i === topPlayers.length - 1 && styles.leaderRowLast,
                ]}
              >
                <Text style={styles.rank}>#{i + 1}</Text>
                <Text style={styles.leaderName}>
                  {p.first_name} {p.last_name}
                </Text>
                <Text style={styles.leaderXp}>{p.total_xp} XP</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 📊 QUICK STATS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📊 QUICK STATS</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{enrolledCourses.length}</Text>
            <Text style={styles.statLabel}>Courses Enrolled</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{coursesCompleted}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{player.total_xp || 0}</Text>
            <Text style={styles.statLabel}>Total XP</Text>
          </View>
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
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  playerPhoto: {
    width: 70,
    height: 70,
    borderRadius: 35,
    marginRight: 12,
    backgroundColor: '#333',
  },
  playerPhotoPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    marginRight: 12,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerPhotoText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  playerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  playerName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  teamClubName: {
    fontSize: 13,
    color: '#a78bfa',
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 8,
  },
  xpBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  jerseyBadge: {
    backgroundColor: 'rgba(34, 211, 238, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 12,
    gap: 8,
  },
  lineupWidgetContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 6,
  },
  lineupWidgetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 12,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  lineupWidgetBarEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  lineupWidgetBarText: {
    flex: 1,
    fontSize: 14,
    color: '#e2e8f0',
  },
  lineupWidgetBarCaptain: {
    color: '#fbbf24',
    fontWeight: '700',
  },
  lineupWidgetBarChevron: {
    fontSize: 16,
    color: '#8b5cf6',
    marginLeft: 4,
  },
  wellnessSection: {
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  actionButtonCard: {
    flex: 1,
    backgroundColor: '#2a2a4e',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionButtonLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  section: {
    padding: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitleInline: {
    marginBottom: 0,
  },
  viewAll: {
    color: '#a78bfa',
    fontSize: 14,
    fontWeight: '600',
  },
  progressCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLevel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  progressXp: {
    color: '#a78bfa',
    fontSize: 14,
    fontWeight: '600',
  },
  xpBarTrack: {
    height: 8,
    backgroundColor: '#3a3a6e',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: '#8b5cf6',
    borderRadius: 4,
  },
  xpBarText: {
    color: '#888',
    fontSize: 12,
  },
  xpBarHint: {
    color: '#888',
    fontSize: 12,
    marginTop: 8,
  },
  emptyCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  browseLibraryButton: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
    width: '100%',
  },
  browseLibraryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  progressLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 6,
  },
  actionCardButton: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
  },
  courseCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  courseTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#3a3a6e',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#22c55e',
    borderRadius: 2,
  },
  progressText: {
    color: '#888',
    fontSize: 12,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
  },
  shareCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 12,
  },
  shareLabel: {
    color: '#888',
    fontSize: 13,
    marginBottom: 6,
  },
  shareLink: {
    color: '#a78bfa',
    fontSize: 12,
    marginBottom: 12,
  },
  shareButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  copyButton: {
    flex: 1,
    backgroundColor: '#3a3a6e',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  shareButton: {
    flex: 1,
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  leaderboardCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 12,
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a6e',
  },
  leaderRowLast: {
    borderBottomWidth: 0,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  cardDescription: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 12,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#8b5cf6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  outlineButtonText: {
    color: '#a78bfa',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  betaBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  betaBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
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
    padding: 12,
  },
  bottomPadding: {
    height: 24,
  },
});
