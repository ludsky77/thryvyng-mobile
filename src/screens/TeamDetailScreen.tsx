import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useUserTeams } from '../hooks/useUserTeams';

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

export default function TeamDetailScreen({ route }: any) {
  const { teamId, teamName } = route.params || {};
  const { canManageTeam } = useUserTeams();

  const [team, setTeam] = useState<{
    id: string;
    name: string;
    color: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#5B7BB5');
  const [isSavingColor, setIsSavingColor] = useState(false);

  const canManage = teamId ? canManageTeam(teamId) : false;

  const fetchTeam = useCallback(async () => {
    if (!teamId) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name, color')
        .eq('id', teamId)
        .single();

      if (error) throw error;
      setTeam(data as any);
      setSelectedColor((data as any)?.color || '#5B7BB5');
    } catch (err) {
      console.error('Error fetching team:', err);
      setTeam(null);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const handleColorSelect = async (colorHex: string) => {
    if (!team?.id) return;
    setSelectedColor(colorHex);
    setIsSavingColor(true);

    try {
      const { error } = await supabase
        .from('teams')
        .update({ color: colorHex })
        .eq('id', team.id);

      if (error) throw error;
      setTeam((prev) => (prev ? { ...prev, color: colorHex } : null));
    } catch (err) {
      console.error('Error updating team color:', err);
      Alert.alert('Error', 'Failed to update team color');
      setSelectedColor(team?.color || '#5B7BB5');
    } finally {
      setIsSavingColor(false);
    }
  };

  if (loading && !team) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading team...</Text>
      </View>
    );
  }

  const displayName = team?.name ?? teamName ?? 'Team';
  const displayTeamId = team?.id ?? teamId;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{displayName}</Text>
      {displayTeamId && (
        <Text style={styles.subtitle}>Team ID: {displayTeamId}</Text>
      )}

      {canManage && (
        <>
          {/* Team Color Setting */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setShowColorPicker(!showColorPicker)}
            disabled={isSavingColor}
          >
            <Text style={styles.settingLabel}>Team Color</Text>
            <View style={styles.settingValueContainer}>
              <Text style={styles.colorName}>
                {TEAM_COLOR_PALETTE.find((c) => c.hex === selectedColor)
                  ?.name || 'Custom'}
              </Text>
              <View
                style={[styles.colorPreview, { backgroundColor: selectedColor }]}
              />
              <Text style={styles.settingArrow}>
                {showColorPicker ? '▲' : '▼'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Color Picker Grid - shown when expanded */}
          {showColorPicker && (
            <View style={styles.colorPickerContainer}>
              <View style={styles.colorGrid}>
                {TEAM_COLOR_PALETTE.map((color) => (
                  <TouchableOpacity
                    key={color.hex}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color.hex },
                      selectedColor === color.hex &&
                        styles.colorOptionSelected,
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
        </>
      )}

      {!canManage && (
        <Text style={styles.placeholder}>
          Team detail view – add roster, events, and more
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 12,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
    marginBottom: 24,
  },
  placeholder: {
    color: '#666',
    fontSize: 14,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  settingLabel: {
    color: '#D1D5DB',
    fontSize: 15,
  },
  settingValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorName: {
    color: '#9CA3AF',
    fontSize: 13,
    marginRight: 8,
  },
  colorPreview: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'white',
    marginRight: 8,
  },
  settingArrow: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  colorPickerContainer: {
    backgroundColor: 'rgba(55, 65, 81, 0.5)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  colorOption: {
    width: '11.5%',
    aspectRatio: 1,
    borderRadius: 6,
    marginBottom: 8,
  },
  colorOptionSelected: {
    borderWidth: 2,
    borderColor: 'white',
    transform: [{ scale: 1.1 }],
  },
  colorPickerLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 4,
  },
  colorPickerLabel: {
    color: '#6B7280',
    fontSize: 10,
  },
});
