import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const ROLE_LABELS: Record<string, string> = {
  head_coach: 'Head Coach',
  assistant_coach: 'Assistant Coach',
  team_manager: 'Team Manager',
};

interface CoachingItem {
  id: string;
  type: 'coaching';
  teamId: string;
  teamName: string;
  staffRole: string;
  playerCount: number;
}

interface MyKidsItem {
  id: string;
  type: 'mykids';
  playerId: string;
  playerName: string;
  teamName: string;
  jersey?: string | null;
}

type TeamItem = CoachingItem | MyKidsItem;

export default function TeamsScreen({ navigation }: any) {
  const { roles } = useAuth();
  const [coachingItems, setCoachingItems] = useState<CoachingItem[]>([]);
  const [myKidsItems, setMyKidsItems] = useState<MyKidsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!roles?.length) {
      setCoachingItems([]);
      setMyKidsItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const staffRoles = roles.filter((r: any) =>
        ['head_coach', 'assistant_coach', 'team_manager'].includes(r.role)
      );
      const parentRoles = roles.filter((r: any) => r.role === 'parent');

      // Dedupe coaching by team id
      const coachingMap = new Map<string, CoachingItem>();
      for (const role of staffRoles) {
        const teamId = role.entity_id || role.team?.id;
        if (!teamId || coachingMap.has(teamId)) continue;

        const { count } = await supabase
          .from('players')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', teamId);

        coachingMap.set(teamId, {
          id: teamId,
          type: 'coaching',
          teamId,
          teamName: role.team?.name || 'Unknown Team',
          staffRole: ROLE_LABELS[role.role] || role.role,
          playerCount: count || 0,
        });
      }

      // Parent roles - one per player
      const kidsList: MyKidsItem[] = [];
      for (const role of parentRoles) {
        const playerId = role.entity_id || role.player?.id;
        if (!playerId) continue;

        let jersey: string | null = null;
        const { data: player } = await supabase
          .from('players')
          .select('jersey_number')
          .eq('id', playerId)
          .single();

        if (player?.jersey_number != null) {
          jersey = `#${player.jersey_number}`;
        }

        const playerName =
          role.player?.first_name && role.player?.last_name
            ? `${role.player.first_name} ${role.player.last_name}`
            : role.entityName?.split(' ')[0] || 'Player';

        kidsList.push({
          id: playerId,
          type: 'mykids',
          playerId,
          playerName,
          teamName: role.team?.name || 'Unknown Team',
          jersey: jersey || null,
        });
      }

      setCoachingItems(Array.from(coachingMap.values()));
      setMyKidsItems(kidsList);
    } catch (err) {
      console.error('Error fetching teams:', err);
    } finally {
      setLoading(false);
    }
  }, [roles]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sections = [
    ...(coachingItems.length > 0
      ? [{ title: 'COACHING', data: coachingItems as TeamItem[] }]
      : []),
    ...(myKidsItems.length > 0
      ? [{ title: 'MY KIDS', data: myKidsItems as TeamItem[] }]
      : []),
  ];

  const renderItem = ({ item }: { item: TeamItem }) => {
    if (item.type === 'coaching') {
      const c = item as CoachingItem;
      return (
        <TouchableOpacity
          style={styles.card}
          onPress={() =>
            navigation.navigate('Roster', {
              team_id: c.teamId,
              teamId: c.teamId,
              teamName: c.teamName,
            })
          }
          activeOpacity={0.7}
        >
          <Text style={styles.cardIcon}>📋</Text>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{c.teamName}</Text>
            <Text style={styles.cardSubtitle}>
              {c.staffRole} • {c.playerCount} players
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      );
    }

    const k = item as MyKidsItem;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          navigation.navigate('PlayerProfile', {
            playerId: k.playerId,
            playerName: k.playerName,
          })
        }
        activeOpacity={0.7}
      >
        <Text style={styles.cardIcon}>👤</Text>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{k.playerName}</Text>
          <Text style={styles.cardSubtitle}>
            {k.teamName}
            {k.jersey ? ` • ${k.jersey}` : ''}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: { title: string } }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
    </View>
  );

  const totalItems = coachingItems.length + myKidsItems.length;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading teams...</Text>
      </View>
    );
  }

  if (totalItems === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🏆</Text>
        <Text style={styles.emptyTitle}>No Teams</Text>
        <Text style={styles.emptyText}>
          You'll see your teams here once you join a team or add a player
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🏆 My Teams</Text>
      </View>

      <SectionList
        sections={sections}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
      />
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
  emptyContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
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
  header: {
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#2a2a4e',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },
  sectionHeader: {
    paddingTop: 20,
    paddingBottom: 12,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(42, 42, 78, 0.8)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: '#888',
    fontSize: 14,
  },
  chevron: {
    color: '#666',
    fontSize: 22,
    marginLeft: 8,
  },
});
