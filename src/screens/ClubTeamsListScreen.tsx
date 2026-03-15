import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface TeamRow {
  id: string;
  name: string;
  color: string | null;
  playerCount: number;
  coachName: string | null;
}

export default function ClubTeamsListScreen({ navigation }: any) {
  const { currentRole } = useAuth();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);

  const clubId: string | undefined =
    (currentRole as any)?.club_id ??
    (currentRole as any)?.club?.id ??
    undefined;

  const fetchTeams = useCallback(async () => {
    if (!clubId) {
      setTeams([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('id, name, color, players(id)')
        .eq('club_id', clubId)
        .order('name', { ascending: true });

      if (teamsError) throw teamsError;

      const rows: TeamRow[] = await Promise.all(
        (teamsData || []).map(async (t: any) => {
          const players = Array.isArray(t.players) ? t.players : [];

          // Look up head coach for this team
          let coachName: string | null = null;
          const { data: staffRows } = await supabase
            .from('team_staff')
            .select('user_id, staff_role')
            .eq('team_id', t.id)
            .eq('staff_role', 'head_coach')
            .limit(1);

          const coachUserId = staffRows?.[0]?.user_id ?? null;
          if (coachUserId) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', coachUserId)
              .single();
            coachName = profile?.full_name ?? null;
          }

          return {
            id: t.id,
            name: t.name,
            color: t.color,
            playerCount: players.length,
            coachName,
          };
        })
      );

      setTeams(rows);
    } catch (err) {
      console.error('ClubTeamsListScreen fetch error:', err);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useFocusEffect(
    useCallback(() => {
      fetchTeams();
    }, [fetchTeams])
  );

  const renderTeam = ({ item }: { item: TeamRow }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.75}
      onPress={() =>
        navigation.navigate('TeamDetail', {
          teamId: item.id,
          teamName: item.name,
        })
      }
    >
      <View
        style={[styles.colorDot, { backgroundColor: item.color || '#8b5cf6' }]}
      />
      <View style={styles.cardBody}>
        <Text style={styles.teamName}>{item.name}</Text>
        <Text style={styles.teamMeta}>
          {item.playerCount} player{item.playerCount !== 1 ? 's' : ''}
          {'  ·  '}
          {item.coachName ? `Coach: ${item.coachName}` : 'No coach assigned'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#64748b" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>All Teams</Text>
          <Text style={styles.headerSub}>
            {teams.length} team{teams.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      ) : teams.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="people-outline" size={48} color="#334155" />
          <Text style={styles.emptyTitle}>No teams yet</Text>
          <Text style={styles.emptySub}>
            Teams added to your club will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={teams}
          keyExtractor={(t) => t.id}
          renderItem={renderTeam}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSub: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
  },
  list: {
    padding: 16,
    gap: 10,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  cardBody: {
    flex: 1,
  },
  teamName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  teamMeta: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 3,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  emptySub: {
    color: '#475569',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
