import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useUserTeams } from '../hooks/useUserTeams';
import PlayerAvatar from '../components/PlayerAvatar';

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

interface Team {
  id: string;
  name: string;
  club_id?: string | null;
  color?: string | null;
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
  const { canManageTeam } = useUserTeams();
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#5B7BB5');
  const [isSavingColor, setIsSavingColor] = useState(false);

  const canManage = team_id ? canManageTeam(team_id) : false;

  const fetchData = useCallback(async () => {
    if (!team_id) {
      setLoading(false);
      return;
    }

    try {
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('id, name, club_id, color')
        .eq('id', team_id)
        .single();

      if (teamError) throw teamError;
      const teamObj = teamData as Team;
      setTeam(teamObj);
      setSelectedColor(teamObj?.color || '#5B7BB5');

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

  const teamColor = team?.color || '#8b5cf6';

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
        {canManage ? (
          <TouchableOpacity
            style={styles.headerSettingsButton}
            onPress={() => setShowSettings(true)}
          >
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerRight} />
        )}
      </View>

      <Text style={styles.playerCountLine}>
        {players.length} {players.length === 1 ? 'player' : 'players'}
      </Text>

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
                  <PlayerAvatar
                    photoUrl={player.photo_url}
                    jerseyNumber={player.jersey_number}
                    firstName={player.first_name}
                    lastName={player.last_name}
                    size={50}
                    teamColor={team?.color || '#8B6BAD'}
                  />
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

      {/* Team Settings Modal */}
      <Modal
        visible={showSettings}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSettings(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSettings(false)}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Team Settings</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.settingSection}>
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
                    style={[
                      styles.colorPreview,
                      { backgroundColor: selectedColor },
                    ]}
                  />
                  <Text style={styles.settingArrow}>
                    {showColorPicker ? '▲' : '▼'}
                  </Text>
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
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
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
  headerSettingsButton: {
    padding: 8,
  },
  playerCountLine: {
    fontSize: 14,
    color: '#9CA3AF',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  settingsIcon: {
    fontSize: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  modalClose: {
    fontSize: 20,
    color: '#9CA3AF',
    padding: 4,
  },
  settingSection: {
    padding: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingLabel: {
    color: '#D1D5DB',
    fontSize: 16,
  },
  settingValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorName: {
    color: '#9CA3AF',
    fontSize: 14,
    marginRight: 10,
  },
  colorPreview: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
    marginRight: 8,
  },
  settingArrow: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  colorPickerContainer: {
    backgroundColor: 'rgba(55, 65, 81, 0.5)',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 6,
    marginBottom: 8,
  },
  colorOptionSelected: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  colorPickerLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  colorPickerLabel: {
    color: '#6B7280',
    fontSize: 11,
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
