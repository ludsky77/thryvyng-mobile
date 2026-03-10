import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { LineupFieldEditor } from '../../components/lineup/LineupFieldEditor';
import { getFormationPositions } from '../../data/formationPositions';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function LineupViewScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params as { lineupId?: string; eventTitle?: string }) || {};
  const { lineupId, eventTitle } = params;
  const { currentRole } = useAuth();

  const [lineup, setLineup] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const highlightPlayerId =
    currentRole && (currentRole?.role === 'player' || currentRole?.role === 'parent')
      ? currentRole?.entity_id ?? null
      : null;
  const isParentView = currentRole?.role === 'parent';
  const badge = isParentView ? 'YOUR CHILD' : 'YOU';

  useEffect(() => {
    async function fetchLineup() {
      if (!lineupId) return;
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from('lineup_formations')
          .select(
            '*, players:lineup_players(*, player_profile:players(id, first_name, last_name, jersey_number)), event:cal_events(id, title, event_date)'
          )
          .eq('id', lineupId)
          .single();

        if (err) throw err;
        setLineup(data);
      } catch (e: any) {
        setError(e?.message || 'Failed to load lineup');
      } finally {
        setLoading(false);
      }
    }
    fetchLineup();
  }, [lineupId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Lineup</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !lineup) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Lineup</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>{error || 'Lineup not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const formation = lineup.formation_template || '4-3-3';
  const fieldType = lineup.field_type || '11v11';
  const basePositions = getFormationPositions(formation, fieldType);
  const starters = (lineup.players || []).filter((p: any) => p.is_starter);
  const usedStarterIds = new Set<string>();

  const positions = basePositions.map((pos, i) => {
    const match = starters.find(
      (lp: any) => lp.position_code === pos.code && !usedStarterIds.has(lp.id)
    );

    if (match) {
      usedStarterIds.add(match.id);
      const profile = match.player_profile;
      const fullName = profile
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
        : match.guest_name || '';
      const lastName =
        profile?.last_name || match.guest_name?.split(' ').pop() || '';

      const useCustomX =
        match.position_x !== undefined &&
        Math.abs(match.position_x - pos.x) > 0.5;
      const useCustomY =
        match.position_y !== undefined &&
        Math.abs(match.position_y - pos.y) > 0.5;

      return {
        ...pos,
        x: useCustomX ? match.position_x : pos.x,
        y: useCustomY ? match.position_y : pos.y,
        assignedPlayer: {
          id: match.player_id || match.id,
          fullName,
          lastName,
          jerseyNumber: match.jersey_number ?? profile?.jersey_number ?? null,
          isCaptain: match.is_captain,
        },
      };
    }

    return { ...pos, assignedPlayer: undefined };
  });

  const subs = (lineup.players || []).filter((p: any) => !p.is_starter);
  const uniqueSubs = subs.filter(
    (p: any, index: number, self: any[]) =>
      index === self.findIndex((s) => (s.player_id || s.guest_name) === (p.player_id || p.guest_name))
  );

  const getPlayerName = (p: any) => {
    const profile = p.player_profile;
    return profile
      ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
      : p.guest_name || '—';
  };

  const isHighlighted = (p: any) => highlightPlayerId && p.player_id === highlightPlayerId;

  const jerseyConfig = lineup.jersey_config || {};

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{eventTitle ? `${eventTitle} — Lineup` : 'Lineup'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.pillsRow}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{formation}</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{fieldType}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.fieldWrapper}>
          <LineupFieldEditor
            fieldType={fieldType}
            positions={positions}
            jerseyConfig={jerseyConfig}
            onPositionTap={() => {}}
            selectedPositionIndex={null}
            visualConfig={
              (lineup.jersey_config as any)?.visual || {
                jerseySize: 100,
                jerseyOutline: 3,
                fieldLines: 50,
                nameSize: 100,
              }
            }
          />
        </View>

        {uniqueSubs.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, styles.subsTitle]}>
              SUBSTITUTES ({uniqueSubs.length})
            </Text>
            {uniqueSubs.map((p: any) => (
              <View key={p.id} style={styles.playerRow}>
                <Text style={[styles.playerName, isHighlighted(p) && styles.playerHighlight]}>
                  {getPlayerName(p)}
                </Text>
                <Text style={styles.jerseyNum}>#{p.jersey_number ?? '—'}</Text>
                {isHighlighted(p) && (
                  <View style={styles.youBadge}>
                    <Text style={styles.youBadgeText}>{badge}</Text>
                  </View>
                )}
              </View>
            ))}
          </>
        )}

        {lineup.notes && (
          <>
            <Text style={styles.sectionTitle}>COACH NOTES</Text>
            <Text style={styles.notesText}>{lineup.notes}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  pillsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  pill: { backgroundColor: '#334155', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  pillText: { fontSize: 12, color: '#94a3b8' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#94a3b8' },
  scroll: { flex: 1 },
  fieldWrapper: { width: SCREEN_WIDTH, alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#8b5cf6', marginHorizontal: 16, marginTop: 20, marginBottom: 8 },
  subsTitle: { color: '#f59e0b' },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  playerName: { fontSize: 15, color: '#fff', flex: 1 },
  playerHighlight: { color: '#06b6d4' },
  jerseyNum: { fontSize: 14, color: '#94a3b8', marginRight: 8 },
  youBadge: { backgroundColor: '#06b6d440', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  youBadgeText: { fontSize: 11, fontWeight: '600', color: '#06b6d4' },
  notesText: { fontSize: 14, color: '#94a3b8', marginHorizontal: 16, marginBottom: 24, lineHeight: 22 },
});
