import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import {
  CHAT_FALLBACK_NAME,
  fetchTeamMemberNames,
} from '../lib/memberNames';
import { useAuth } from '../contexts/AuthContext';
import { resolveTeamColor } from '../constants/teamColors';


interface Player {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  photo_url: string | null;
}

interface StaffMember {
  id: string;
  role: string;
  profiles: { full_name: string | null; email: string | null } | null;
}

const STAFF_ROLE_LABELS: Record<string, string> = {
  head_coach: 'Head Coach',
  assistant_coach: 'Assistant Coach',
  team_manager: 'Team Manager',
  coach: 'Coach',
};

function getInitials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

export default function TeamDetailScreen({ route, navigation }: any) {
  const { teamId, teamName } = route.params || {};
  const { user } = useAuth();

  const [team, setTeam] = useState<{ id: string; name: string; color: string | null } | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isStaffInTeam, setIsStaffInTeam] = useState(false);

  useEffect(() => {
    if (!teamId || !user?.id) { setIsStaffInTeam(false); return; }
    // Existence check, not a row fetch: a user can hold several team_staff rows
    // on one team (e.g. Head Coach + Team Manager), and maybeSingle() errors on
    // 2+ rows -- which silently stripped staff UI from exactly the most senior
    // staff. The error was previously not even destructured.
    const checkStaffPermission = async () => {
      const { count, error } = await supabase
        .from('team_staff')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('user_id', user.id);
      if (error) {
        if (__DEV__) console.warn('[TeamDetail] staff check failed:', error);
        setIsStaffInTeam(false);
        return;
      }
      setIsStaffInTeam((count ?? 0) > 0);
    };
    checkStaffPermission();
  }, [teamId, user?.id]);

  const fetchData = useCallback(async () => {
    if (!teamId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [teamRes, playersRes, staffRes, memberNames] = await Promise.all([
        supabase.from('teams').select('id, name, color').eq('id', teamId).single(),
        supabase
          .from('players')
          .select('id, first_name, last_name, jersey_number, photo_url')
          .eq('team_id', teamId)
          .order('last_name', { ascending: true }),
        // `full_name` used to ride along on this embed, which RLS blocked for a
        // non-staff viewer -- every staff row rendered as 'Unknown'. The name
        // now comes from the team-gated RPC; the embed is narrowed to the email
        // this screen renders as contact info beside the role.
        supabase
          .from('team_staff')
          .select('id, role, user_id, profiles(email)')
          .eq('team_id', teamId),
        fetchTeamMemberNames(teamId),
      ]);

      if (teamRes.data) {
        setTeam(teamRes.data as any);
      }

      setPlayers((playersRes.data || []) as Player[]);

      const staffRows = (staffRes.data || []).map((s: any) => {
        const contact = Array.isArray(s.profiles) ? s.profiles[0] ?? null : s.profiles;
        return {
          ...s,
          profiles: {
            full_name: memberNames.get(s.user_id)?.name ?? null,
            email: contact?.email ?? null,
          },
        };
      });
      setStaff(staffRows as StaffMember[]);
    } catch (err) {
      console.error('TeamDetailScreen fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading team…</Text>
      </View>
    );
  }

  const displayName = team?.name ?? teamName ?? 'Team';
  const teamColor = resolveTeamColor(team);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={styles.teamHeader}>
        <View style={[styles.teamColorBar, { backgroundColor: teamColor }]} />
        <Text style={styles.title}>{displayName}</Text>
        <Text style={styles.countsRow}>
          {players.length} player{players.length !== 1 ? 's' : ''}
          {staff.length > 0 ? `  ·  ${staff.length} staff` : ''}
        </Text>
      </View>

      {/* Roster Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="people" size={15} color="#8b5cf6" />{'  '}Roster
        </Text>
        {players.length === 0 ? (
          <Text style={styles.emptyText}>No players added yet</Text>
        ) : (
          players.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() =>
                navigation.navigate('PlayerProfile', {
                  playerId: p.id,
                  playerName: `${p.first_name} ${p.last_name}`,
                })
              }
            >
              {p.photo_url ? (
                <Image source={{ uri: p.photo_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitials}>
                    {getInitials(p.first_name, p.last_name)}
                  </Text>
                </View>
              )}
              <View style={styles.rowBody}>
                <Text style={styles.rowName}>
                  {p.first_name} {p.last_name}
                </Text>
                {p.jersey_number != null && (
                  <Text style={styles.rowMeta}>#{p.jersey_number}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color="#475569" />
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Staff Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="shield-checkmark" size={15} color="#8b5cf6" />{'  '}Staff
        </Text>
        {staff.length === 0 ? (
          <Text style={styles.emptyText}>No staff assigned yet</Text>
        ) : (
          staff.map((s) => (
            <View key={s.id} style={styles.row}>
              <View style={[styles.avatar, styles.avatarStaff]}>
                <Ionicons name="person" size={16} color="#a78bfa" />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowName}>
                  {s.profiles?.full_name || CHAT_FALLBACK_NAME}
                </Text>
                <Text style={styles.rowMeta}>
                  {STAFF_ROLE_LABELS[s.role] || s.role}
                  {s.profiles?.email ? `  ·  ${s.profiles.email}` : ''}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Team Color -- READ ONLY. The 32-swatch picker and the
          `teams.update({ color })` behind it are gone: a DB trigger assigns
          every team a colour from the 24-hex palette, and this screen was one
          of only two places in either app that could overwrite it. The swatch
          stays so staff can see what the team wears on the calendar. */}
      {isStaffInTeam && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="color-palette" size={15} color="#8b5cf6" />{'  '}Team Color
          </Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Team color</Text>
            <View style={styles.settingValueContainer}>
              <View style={[styles.colorPreview, { backgroundColor: teamColor }]} />
            </View>
          </View>
          <Text style={styles.colorCaption}>Color assigned by Thryvyng</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { paddingBottom: 48 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#9CA3AF', fontSize: 14, marginTop: 12 },

  teamHeader: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  teamColorBar: {
    width: 40,
    height: 5,
    borderRadius: 3,
    marginBottom: 12,
  },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  countsRow: { color: '#64748b', fontSize: 13, marginTop: 4 },

  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  emptyText: { color: '#475569', fontSize: 14, paddingVertical: 8 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 12,
  },
  avatarFallback: {
    backgroundColor: 'rgba(139,92,246,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarStaff: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { color: '#a78bfa', fontSize: 13, fontWeight: '700' },
  rowBody: { flex: 1 },
  rowName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  rowMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },

  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  settingLabel: { color: '#D1D5DB', fontSize: 15 },
  settingValueContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorCaption: { color: '#6B7280', fontSize: 12, marginTop: 10 },
  colorPreview: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'white',
  },
});
