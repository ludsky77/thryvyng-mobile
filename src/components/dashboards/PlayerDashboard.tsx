import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Share,
  Alert,
  Linking,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface PlayerDashboardProps {
  playerId: string | null;
  navigation: any;
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
  teams?: { id: string; name: string; clubs?: { id: string; name: string } | null } | null;
}

interface EnrolledCourse {
  id: string;
  course_id: string;
  progress_percentage: number;
  completed_at?: string | null;
  course?: { id: string; title: string; category?: string | null } | null;
}

interface Evaluation {
  id: string;
  evaluation_date: string;
  overall_score: number | null;
  title?: string | null;
}

export default function PlayerDashboard({ playerId, navigation }: PlayerDashboardProps) {
  const { user } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [enrolledCourses, setEnrolledCourses] = useState<EnrolledCourse[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [topPlayers, setTopPlayers] = useState<{ id: string; first_name: string; last_name: string; total_xp: number }[]>([]);
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
          teams(id, name, clubs(id, name))
        `)
        .eq('id', playerId)
        .single();

      if (playerError || !playerData) throw new Error('Player not found');
      setPlayer(playerData as Player);

      let enrollments: any[] = [];
      if (user?.id) {
        const { data } = await supabase
          .from('course_enrollments')
          .select('id, course_id, progress_percentage, completed_at, course:courses(id, title, category)')
          .eq('user_id', user.id);
        enrollments = data || [];
      }

      const courseRel = (e: any) => e.course;
      const courses = (enrollments || []).map((e: any) => ({
        ...e,
        course: Array.isArray(courseRel(e)) ? courseRel(e)[0] : courseRel(e),
      }));
      setEnrolledCourses(courses);

      const { data: evals } = await supabase
        .from('player_evaluations')
        .select('id, evaluation_date, overall_score, title')
        .eq('player_id', playerId)
        .eq('is_visible_to_player', true)
        .order('evaluation_date', { ascending: false })
        .limit(5);

      setEvaluations((evals || []) as Evaluation[]);

      const teamId = (playerData as any).team_id;
      if (teamId) {
        const { data: players } = await supabase
          .from('players')
          .select('id, first_name, last_name, total_xp')
          .eq('team_id', teamId)
          .order('total_xp', { ascending: false })
          .limit(5);
        setTopPlayers((players || []) as any);
      }
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
    ? `https://thryvyng.com/support/${player.referral_code}`
    : '';

  const handleShareReferral = async () => {
    if (!referralUrl) return;
    try {
      await Share.share({
        message: `Support our team! ${referralUrl}`,
        url: referralUrl,
        title: 'Share Thryvyng',
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
      await Share.share({
        message: referralUrl,
        title: 'Copy Link',
      });
    } catch (err: any) {
      Alert.alert('Link', referralUrl);
    }
  };

  const formatDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const formatEvalTitle = (e: Evaluation) => {
    if (e.title) return e.title;
    const d = new Date(e.evaluation_date + 'T12:00:00');
    return `Evaluation - ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
  };

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
      {/* Player Header: [Photo] Name, team • club, XP badge, jersey */}
      <View style={styles.playerHeader}>
        {player.photo_url ? (
          <Image source={{ uri: player.photo_url }} style={styles.playerPhoto} />
        ) : (
          <View style={styles.playerPhotoPlaceholder}>
            <Text style={styles.playerPhotoText}>
              {player.first_name.charAt(0)}
              {player.last_name.charAt(0)}
            </Text>
          </View>
        )}
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
            <TouchableOpacity
              style={styles.browseLibraryButton}
              onPress={() => navigation.navigate('Courses')}
            >
              <Text style={styles.browseLibraryButtonText}>
                📖 Browse Course Library
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {enrolledCourses.slice(0, 3).map((e) => (
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
            ))}
            <TouchableOpacity
              style={styles.browseLibraryButton}
              onPress={() => navigation.navigate('Courses')}
            >
              <Text style={styles.browseLibraryButtonText}>
                📖 Browse Course Library
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* 📊 MY EVALUATIONS */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>📊 MY EVALUATIONS</Text>
          {evaluations.length > 0 && (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('PlayerProfile', {
                  playerId: player.id,
                  playerName,
                })
              }
            >
              <Text style={styles.viewAll}>View All →</Text>
            </TouchableOpacity>
          )}
        </View>
        {evaluations.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No evaluations yet</Text>
          </View>
        ) : (
          evaluations.map((e) => (
            <TouchableOpacity
              key={e.id}
              style={styles.evalCard}
              onPress={() =>
                navigation.navigate('EvaluationDetail', {
                  evaluation_id: e.id,
                })
              }
            >
              <Text style={styles.evalTitle}>{formatEvalTitle(e)}</Text>
              {e.overall_score != null && (
                <Text style={styles.evalScore}>
                  {e.overall_score.toFixed(1)}/10
                </Text>
              )}
              <Text style={styles.evalArrow}>›</Text>
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

      {/* 🔍 FIND AN EVALUATOR */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔍 FIND AN EVALUATOR</Text>
        <View style={styles.card}>
          <Text style={styles.cardDescription}>
            Get professional assessments from certified evaluators
          </Text>
          <TouchableOpacity
            style={styles.outlineButton}
            onPress={() => Linking.openURL('https://thryvyng.com/evaluators')}
          >
            <Text style={styles.outlineButtonText}>Browse Evaluators</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 🎮 COGNITIVE GAMES */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>🎮 COGNITIVE GAMES</Text>
          <View style={styles.betaBadge}>
            <Text style={styles.betaBadgeText}>BETA</Text>
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardDescription}>
            Train your soccer brain with cognitive training games
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('GamesHub')}
          >
            <Text style={styles.primaryButtonText}>Play Games</Text>
          </TouchableOpacity>
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
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 1,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
    padding: 16,
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
    padding: 20,
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
  courseCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
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
  evalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  evalDate: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  evalTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  evalScore: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
  evalArrow: {
    color: '#666',
    fontSize: 18,
  },
  shareCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
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
    paddingVertical: 12,
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
    padding: 16,
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
    marginBottom: 12,
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
    padding: 16,
  },
  bottomPadding: {
    height: 40,
  },
});
