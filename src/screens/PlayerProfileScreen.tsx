import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { supabase } from '../lib/supabase';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  jersey_number: number | null;
  total_xp: number;
  photo_url: string | null;
  referral_code: string | null;
  teams: {
    id: string;
    name: string;
    clubs: {
      id: string;
      name: string;
    } | null;
  } | null;
}

interface Evaluation {
  id: string;
  evaluation_date: string;
  season_name: string | null;
  evaluator_name: string | null;
}

export default function PlayerProfileScreen({ route, navigation }: any) {
  const { playerId, playerName } = route.params;
  const [player, setPlayer] = useState<Player | null>(null);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlayerData();
  }, [playerId]);

  const fetchPlayerData = async () => {
    try {
      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .select(
          `
          id,
          first_name,
          last_name,
          date_of_birth,
          jersey_number,
          total_xp,
          photo_url,
          referral_code,
          teams (
            id,
            name,
            clubs (
              id,
              name
            )
          )
        `
        )
        .eq('id', playerId)
        .single();

      if (playerError) throw playerError;
      setPlayer(playerData as Player);

      const { data: evalData, error: evalError } = await supabase
        .from('player_evaluations')
        .select(`
          id,
          player_name,
          jersey_number,
          season_name,
          evaluation_date,
          award_id,
          coach_personal_note,
          is_visible_to_player,
          evaluator_name,
          created_at
        `)
        .eq('player_id', playerId)
        .order('evaluation_date', { ascending: false })
        .limit(5);

      if (!evalError && evalData) {
        setEvaluations(evalData as Evaluation[]);
      }
    } catch (error) {
      console.error('Error fetching player data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateAge = (dob: string | null) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return age;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
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

  const age = calculateAge(player.date_of_birth);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          {player.photo_url ? (
            <Image source={{ uri: player.photo_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {player.first_name.charAt(0)}
                {player.last_name.charAt(0)}
              </Text>
            </View>
          )}
          {player.jersey_number != null && (
            <View style={styles.jerseyBadge}>
              <Text style={styles.jerseyText}>#{player.jersey_number}</Text>
            </View>
          )}
        </View>

        <Text style={styles.playerName}>
          {player.first_name} {player.last_name}
        </Text>

        {player.teams && (
          <Text style={styles.teamName}>⚽ {player.teams.name}</Text>
        )}

        {player.teams?.clubs && (
          <Text style={styles.clubName}>🏆 {player.teams.clubs.name}</Text>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{player.total_xp ?? 0}</Text>
          <Text style={styles.statLabel}>Total XP</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{age ?? '-'}</Text>
          <Text style={styles.statLabel}>Age</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{evaluations.length}</Text>
          <Text style={styles.statLabel}>Evaluations</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📊 Recent Evaluations</Text>
          {evaluations.length > 0 && (
            <TouchableOpacity>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          )}
        </View>

        {evaluations.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No evaluations yet</Text>
          </View>
        ) : (
          evaluations.map((evaluation) => (
            <TouchableOpacity
              key={evaluation.id}
              style={styles.evaluationCard}
              onPress={() =>
                navigation.navigate('EvaluationDetail', {
                  evaluation_id: evaluation.id,
                })
              }
              activeOpacity={0.7}
            >
              <View style={styles.evaluationInfo}>
                <Text style={styles.evaluationDate}>
                  {formatDate(evaluation.evaluation_date)}
                </Text>
                {evaluation.evaluator_name && (
                  <Text style={styles.evaluatorName}>
                    By {evaluation.evaluator_name}
                  </Text>
                )}
              </View>
              <View style={styles.evaluationScore}>
                <Text style={styles.scoreValue}>
                  {evaluation.season_name ?? '--'}
                </Text>
                <Text style={styles.scoreLabel}>Season</Text>
              </View>
              <Text style={styles.evaluationArrow}>›</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚡ Actions</Text>

        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionIcon}>📜</Text>
          <Text style={styles.actionText}>View Certificates</Text>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionIcon}>📚</Text>
          <Text style={styles.actionText}>Enrolled Courses</Text>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>

        {player.referral_code && (
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionIcon}>🔗</Text>
            <Text style={styles.actionText}>Share Referral Link</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
        )}
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
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: '#2a2a4e',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
  },
  jerseyBadge: {
    position: 'absolute',
    bottom: 0,
    right: -5,
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1a1a2e',
  },
  jerseyText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  playerName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  teamName: {
    fontSize: 16,
    color: '#8b5cf6',
    marginBottom: 4,
  },
  clubName: {
    fontSize: 14,
    color: '#888',
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: -20,
    backgroundColor: '#2a2a4e',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  section: {
    padding: 16,
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  seeAllText: {
    color: '#8b5cf6',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
  },
  evaluationCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  evaluationInfo: {
    flex: 1,
  },
  evaluationDate: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  evaluatorName: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  evaluationScore: {
    alignItems: 'center',
    marginRight: 12,
  },
  scoreValue: {
    color: '#10b981',
    fontSize: 20,
    fontWeight: '700',
  },
  scoreLabel: {
    color: '#888',
    fontSize: 11,
  },
  statusBadge: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  evaluationArrow: {
    color: '#666',
    fontSize: 22,
  },
  actionButton: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 20,
    marginRight: 14,
  },
  actionText: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  actionArrow: {
    color: '#666',
    fontSize: 20,
  },
  bottomPadding: {
    height: 40,
  },
});
