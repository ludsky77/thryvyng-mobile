import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const TEAM_COLOR_PALETTE = [
  { hex: '#5B7BB5', name: 'Soft Blue' },
  { hex: '#5BA5B5', name: 'Sky' },
  { hex: '#4A8BAD', name: 'Ocean' },
  { hex: '#6B8BA5', name: 'Steel' },
  { hex: '#7B9BC5', name: 'Periwinkle' },
  { hex: '#5B8B9B', name: 'Slate' },
  { hex: '#6BADC5', name: 'Arctic' },
  { hex: '#4B7B9B', name: 'Denim' },
  { hex: '#5BA58C', name: 'Seafoam' },
  { hex: '#8BAD6B', name: 'Sage' },
  { hex: '#6B9B7B', name: 'Forest' },
  { hex: '#4A9B8B', name: 'Teal' },
  { hex: '#7BAD8B', name: 'Mint' },
  { hex: '#5B8B6B', name: 'Moss' },
  { hex: '#8BC5A5', name: 'Jade' },
  { hex: '#6B9B6B', name: 'Fern' },
  { hex: '#C4976D', name: 'Caramel' },
  { hex: '#B57B7B', name: 'Coral' },
  { hex: '#C4A57B', name: 'Sand' },
  { hex: '#AD7B5B', name: 'Copper' },
  { hex: '#C5A58B', name: 'Tan' },
  { hex: '#B59B7B', name: 'Wheat' },
  { hex: '#D4A574', name: 'Peach' },
  { hex: '#C48B6B', name: 'Terracotta' },
  { hex: '#8B6BAD', name: 'Lavender' },
  { hex: '#AD7B94', name: 'Rose' },
  { hex: '#9B6B9B', name: 'Orchid' },
  { hex: '#7B6BAD', name: 'Grape' },
  { hex: '#B58BAD', name: 'Mauve' },
  { hex: '#9B7BB5', name: 'Violet' },
  { hex: '#AD6B8B', name: 'Berry' },
  { hex: '#8B7B9B', name: 'Plum' },
];

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
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#5B7BB5');
  const [isSavingColor, setIsSavingColor] = useState(false);
  const [isStaffInTeam, setIsStaffInTeam] = useState(false);

  useEffect(() => {
    if (!teamId || !user?.id) { setIsStaffInTeam(false); return; }
    supabase
      .from('team_staff')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setIsStaffInTeam(!!data));
  }, [teamId, user?.id]);

  const fetchData = useCallback(async () => {
    if (!teamId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [teamRes, playersRes, staffRes] = await Promise.all([
        supabase.from('teams').select('id, name, color').eq('id', teamId).single(),
        supabase
          .from('players')
          .select('id, first_name, last_name, jersey_number, photo_url')
          .eq('team_id', teamId)
          .order('last_name', { ascending: true }),
        supabase
          .from('team_staff')
          .select('id, role, profiles(full_name, email)')
          .eq('team_id', teamId),
      ]);

      if (teamRes.data) {
        setTeam(teamRes.data as any);
        setSelectedColor((teamRes.data as any).color || '#5B7BB5');
      }

      setPlayers((playersRes.data || []) as Player[]);

      const staffRows = (staffRes.data || []).map((s: any) => ({
        ...s,
        profiles: Array.isArray(s.profiles) ? s.profiles[0] ?? null : s.profiles,
      }));
      setStaff(staffRows as StaffMember[]);
    } catch (err) {
      console.error('TeamDetailScreen fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleColorSelect = async (colorHex: string) => {
    if (!team?.id) return;
    setSelectedColor(colorHex);
    setIsSavingColor(true);
    try {
      const { error } = await supabase.from('teams').update({ color: colorHex }).eq('id', team.id);
      if (error) throw error;
      setTeam((prev) => (prev ? { ...prev, color: colorHex } : null));
    } catch {
      Alert.alert('Error', 'Failed to update team color');
      setSelectedColor(team?.color || '#5B7BB5');
    } finally {
      setIsSavingColor(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading team…</Text>
      </View>
    );
  }

  const displayName = team?.name ?? teamName ?? 'Team';
  const teamColor = team?.color || '#8b5cf6';

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
                  {s.profiles?.full_name || 'Unknown'}
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

      {/* Team Color (staff only) */}
      {isStaffInTeam && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="color-palette" size={15} color="#8b5cf6" />{'  '}Team Color
          </Text>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setShowColorPicker(!showColorPicker)}
            disabled={isSavingColor}
          >
            <Text style={styles.settingLabel}>Current Color</Text>
            <View style={styles.settingValueContainer}>
              <Text style={styles.colorName}>
                {TEAM_COLOR_PALETTE.find((c) => c.hex === selectedColor)?.name || 'Custom'}
              </Text>
              <View style={[styles.colorPreview, { backgroundColor: selectedColor }]} />
              <Ionicons name={showColorPicker ? 'chevron-up' : 'chevron-down'} size={14} color="#9CA3AF" />
            </View>
          </TouchableOpacity>

          {showColorPicker && (
            <View style={styles.colorPickerContainer}>
              <View style={styles.colorGrid}>
                {TEAM_COLOR_PALETTE.map((color) => (
                  <TouchableOpacity
                    key={color.hex}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color.hex },
                      selectedColor === color.hex && styles.colorOptionSelected,
                    ]}
                    onPress={() => handleColorSelect(color.hex)}
                    disabled={isSavingColor}
                  />
                ))}
              </View>
              <View style={styles.colorPickerLabels}>
                <Text style={styles.colorPickerLabel}>Blues</Text>
                <Text style={styles.colorPickerLabel}>Greens</Text>
                <Text style={styles.colorPickerLabel}>Warm</Text>
                <Text style={styles.colorPickerLabel}>Purples</Text>
              </View>
            </View>
          )}
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
  colorName: { color: '#9CA3AF', fontSize: 13 },
  colorPreview: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'white',
  },
  colorPickerContainer: {
    backgroundColor: 'rgba(55,65,81,0.4)',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  colorOption: { width: '11.5%', aspectRatio: 1, borderRadius: 6, marginBottom: 8 },
  colorOptionSelected: { borderWidth: 2, borderColor: 'white', transform: [{ scale: 1.1 }] },
  colorPickerLabels: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 4 },
  colorPickerLabel: { color: '#6B7280', fontSize: 10 },
});
