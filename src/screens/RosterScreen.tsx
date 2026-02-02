import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { supabase } from '../lib/supabase';

interface Team {
  id: string;
  name: string;
  club_id?: string | null;
}

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  team_id: string;
  birth_date?: string | null;
  date_of_birth?: string | null;
  position: string | null;
  parent_email: string | null;
}

export default function RosterScreen({ route, navigation }: any) {
  const team_id = route.params?.team_id ?? route.params?.teamId;
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!team_id) {
      setLoading(false);
      return;
    }

    try {
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('id, name, club_id')
        .eq('id', team_id)
        .single();

      if (teamError) throw teamError;
      setTeam(teamData as Team);

      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('*')
        .eq('team_id', team_id)
        .order('jersey_number', { ascending: true, nullsFirst: false })
        .order('last_name', { ascending: true });

      if (playersError) throw playersError;

      const sorted = (playersData || []).sort((a: any, b: any) => {
        const aNum = a.jersey_number;
        const bNum = b.jersey_number;
        if (aNum != null && bNum != null) return aNum - bNum;
        if (aNum != null) return -1;
        if (bNum != null) return 1;
        return (a.last_name || '').localeCompare(b.last_name || '');
      });

      setPlayers(sorted);
    } catch (error) {
      console.error('Error fetching roster:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [team_id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const calculateAge = (birthDate: string | null) => {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const teamColor = '#8b5cf6';

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading roster...</Text>
      </View>
    );
  }

  if (!team) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Team not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {team?.name || 'Team Roster'}
        </Text>
        <View style={styles.headerRight} />
      </View>
      {/* Team Info */}
      <View style={styles.teamHeader}>
        <Text style={styles.teamName}>{team.name}</Text>
        <Text style={styles.playerCount}>
          {players.length} {players.length === 1 ? 'player' : 'players'}
        </Text>
      </View>

      {/* Action Buttons Row - centered like Calendar */}
      <View style={styles.actionButtonsRow}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() =>
            navigation.navigate('TeamStaff', {
              team_id,
              teamId: team_id,
            })
          }
        >
          <Text style={styles.actionButtonText}>👥 Staff</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() =>
            navigation.navigate('InvitePlayer', {
              team_id,
              teamId: team_id,
            })
          }
        >
          <Text style={styles.actionButtonText}>➕ Invite Player</Text>
        </TouchableOpacity>
      </View>

      {/* Player List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#8b5cf6"
          />
        }
      >
        {players.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No players yet</Text>
            <Text style={styles.emptyText}>
              Add players to build your roster
            </Text>
          </View>
        ) : (
          players.map((player) => {
            const age = calculateAge(player.birth_date ?? player.date_of_birth);
            return (
              <View key={player.id} style={styles.playerCard}>
                <TouchableOpacity
                  style={styles.playerCardTouchable}
                  onPress={() =>
                    navigation.navigate('PlayerProfile', {
                      playerId: player.id,
                      playerName: `${player.first_name} ${player.last_name}`,
                    })
                  }
                  activeOpacity={0.7}
                >
                  <View style={[styles.jerseyBadge, { backgroundColor: teamColor }]}>
                    <Text style={styles.jerseyNumber}>
                      {player.jersey_number ?? '—'}
                    </Text>
                  </View>
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>
                      {player.first_name} {player.last_name}
                    </Text>
                    <View style={styles.playerMeta}>
                      {player.position && (
                        <View style={styles.positionBadge}>
                          <Text style={styles.positionText}>{player.position}</Text>
                        </View>
                      )}
                      {age != null && (
                        <Text style={styles.ageText}>{age} yrs</Text>
                      )}
                    </View>
                  </View>
                  <Text style={styles.playerArrow}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.evaluateButton}
                  onPress={() =>
                    navigation.navigate('CreateEvaluation', {
                      player_id: player.id,
                      playerId: player.id,
                      team_id,
                      teamId: team_id,
                      playerName: `${player.first_name} ${player.last_name}`,
                    })
                  }
                >
                  <Text style={styles.evaluateButtonText}>📝</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
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
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 16,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  teamHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  teamName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  playerCount: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  actionButton: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  actionButtonText: {
    color: '#a78bfa',
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  playerCardTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  jerseyBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  jerseyNumber: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  playerInfo: {
    flex: 1,
    minWidth: 0,
  },
  playerName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  playerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  positionBadge: {
    backgroundColor: '#3a3a6e',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  positionText: {
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  ageText: {
    color: '#888',
    fontSize: 13,
  },
  playerArrow: {
    color: '#666',
    fontSize: 22,
    marginLeft: 8,
  },
  evaluateButton: {
    padding: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  evaluateButtonText: {
    fontSize: 18,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
  },
});
