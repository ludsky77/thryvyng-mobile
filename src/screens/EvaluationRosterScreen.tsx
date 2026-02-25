import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import PlayerAvatar from '../components/PlayerAvatar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  photo_url?: string;
  has_evaluation?: boolean;
}

type EvaluationRosterParams = {
  teamId?: string;
  team_id?: string;
  teamName?: string;
};

export default function EvaluationRosterScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ params: EvaluationRosterParams }, 'params'>>();
  const { currentRole } = useAuth();

  const teamId = route.params?.teamId ?? route.params?.team_id ?? currentRole?.entity_id ?? currentRole?.team?.id;
  const teamName = route.params?.teamName ?? currentRole?.team?.name;

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (teamId) {
      fetchRoster();
    } else {
      setLoading(false);
      setError('No team selected');
    }
  }, [teamId]);

  const fetchRoster = async () => {
    if (!teamId) return;
    try {
      setLoading(true);
      setError(null);

      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('id, first_name, last_name, jersey_number, photo_url')
        .eq('team_id', teamId)
        .order('last_name', { ascending: true });

      if (playersError) throw playersError;

      const { data: evaluations, error: evalError } = await supabase
        .from('player_evaluations')
        .select('player_id')
        .eq('team_id', teamId);

      if (evalError) throw evalError;

      const evaluatedPlayerIds = new Set(evaluations?.map((e) => e.player_id) || []);

      const playersWithEvalStatus = (playersData || []).map((player) => ({
        ...player,
        has_evaluation: evaluatedPlayerIds.has(player.id),
      }));

      setPlayers(playersWithEvalStatus);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching roster:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayerPress = (player: Player) => {
    navigation.navigate('CreateEvaluation', {
      playerId: player.id,
      player_id: player.id,
      playerName: `${player.first_name} ${player.last_name}`,
      jerseyNumber: player.jersey_number,
      teamId: teamId,
      team_id: teamId,
    });
  };

  const renderPlayer = ({ item }: { item: Player }) => (
    <TouchableOpacity
      style={styles.playerCard}
      onPress={() => handlePlayerPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.playerLeft}>
        <PlayerAvatar
          photoUrl={item.photo_url}
          jerseyNumber={item.jersey_number}
          firstName={item.first_name}
          lastName={item.last_name}
          size={50}
          teamColor="#5B7BB5"
        />
        <View style={styles.playerInfo}>
          <Text style={styles.playerName}>
            {item.first_name} {item.last_name}
          </Text>
          {item.jersey_number != null && (
            <Text style={styles.jerseyNumber}>#{item.jersey_number}</Text>
          )}
        </View>
      </View>

      <View style={styles.playerRight}>
        {item.has_evaluation && (
          <View style={styles.evaluatedBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
            <Text style={styles.evaluatedText}>Evaluated</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={20} color="#6B7280" />
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading roster...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle" size={48} color="#EF4444" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchRoster}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{players.length}</Text>
          <Text style={styles.statLabel}>Players</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {players.filter((p) => p.has_evaluation).length}
          </Text>
          <Text style={styles.statLabel}>Evaluated</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {players.filter((p) => !p.has_evaluation).length}
          </Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>

      <FlatList
        data={players}
        renderItem={renderPlayer}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color="#4B5563" />
            <Text style={styles.emptyTitle}>No Players Found</Text>
            <Text style={styles.emptySubtitle}>
              Add players to your team to start evaluating
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
    padding: 20,
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    color: '#EF4444',
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 4,
  },
  listContent: {
    padding: 16,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  playerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  playerPhoto: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  playerPhotoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerInitials: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  playerInfo: {
    marginLeft: 12,
  },
  playerName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  jerseyNumber: {
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 2,
  },
  playerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  evaluatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B98120',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  evaluatedText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});
