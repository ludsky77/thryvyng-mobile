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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

export default function PlayerDashboard({ playerId, navigation }: PlayerDashboardProps) {
  const { user } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [enrolledCourses, setEnrolledCourses] = useState<EnrolledCourse[]>([]);
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

      {/* Action Buttons Row */}
      <View style={styles.actionButtonsRow}>
        <TouchableOpacity
          style={styles.actionButtonCard}
          onPress={() => navigation.navigate('Courses' as never)}
          activeOpacity={0.7}
        >
          <View style={[styles.actionButtonIcon, { backgroundColor: '#3B82F6' }]}>
            <Ionicons name="library-outline" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.actionButtonLabel}>Courses</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButtonCard}
          onPress={() => navigation.navigate('GamesHub' as never)}
          activeOpacity={0.7}
        >
          <View style={[styles.actionButtonIcon, { backgroundColor: '#8B5CF6' }]}>
            <Ionicons name="game-controller-outline" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.actionButtonLabel}>Games</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButtonCard}
          onPress={() => navigation.navigate('ProductStore' as never)}
          activeOpacity={0.7}
        >
          <View style={[styles.actionButtonIcon, { backgroundColor: '#10B981' }]}>
            <Ionicons name="cart-outline" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.actionButtonLabel}>Store</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButtonCard}
          onPress={() => navigation.navigate('Evaluations' as never)}
          activeOpacity={0.7}
        >
          <View style={[styles.actionButtonIcon, { backgroundColor: '#F59E0B' }]}>
            <Ionicons name="clipboard-outline" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.actionButtonLabel}>Evals</Text>
        </TouchableOpacity>
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
