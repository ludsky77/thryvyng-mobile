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
  Share,
  Linking,
  Switch,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import PlayerAvatar from '../components/PlayerAvatar';
import { mapJoinError } from '../lib/joinErrors';

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

/** Exactly the column set get_team_roster returns — nothing else is available. */
interface Player {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  photo_url: string | null;
  status: string | null;
}

export default function RosterScreen({ route, navigation }: any) {
  const team_id = route.params?.team_id ?? route.params?.teamId;
  const { user } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#5B7BB5');
  const [isSavingColor, setIsSavingColor] = useState(false);
  const [isStaffInTeam, setIsStaffInTeam] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const [contactPlayer, setContactPlayer] = useState<Player | null>(null);
  const [contactData, setContactData] = useState<any>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState('');
  const [shareContact, setShareContact] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareError, setShareError] = useState('');

  useEffect(() => {
    const checkStaffPermission = async () => {
      if (!team_id || !user?.id) {
        setIsStaffInTeam(false);
        return;
      }
      const { data } = await supabase
        .from('team_staff')
        .select('id')
        .eq('team_id', team_id)
        .eq('user_id', user.id)
        .maybeSingle();
      setIsStaffInTeam(!!data);
    };
    checkStaffPermission();
  }, [team_id, user?.id]);

  const canManage = isStaffInTeam;

  const fetchData = useCallback(async () => {
    if (!team_id) {
      setLoading(false);
      return;
    }

    setRosterError('');

    try {
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('id, name, club_id, color, invitation_code')
        .eq('id', team_id)
        .single();

      if (teamError) throw teamError;
      const teamObj = teamData as Team;
      setTeam(teamObj);
      setSelectedColor(teamObj?.color || '#5B7BB5');

      // SECURITY DEFINER RPC: RLS on `players` hides teammates from parents and
      // players, so a direct select renders an empty roster for them.
      const { data: playersData, error: playersError } = await supabase.rpc(
        'get_team_roster',
        { p_team_id: team_id }
      );

      if (playersError) {
        console.error('Error fetching roster:', playersError);
        const hint =
          typeof (playersError as any)?.hint === 'string'
            ? (playersError as any).hint.trim()
            : '';
        // 'not_team_member' has no token in the shared mapper; the mapper stays untouched.
        setRosterError(
          hint === 'not_team_member'
            ? "You don't have access to this team's roster."
            : mapJoinError(playersError)
        );
        setPlayers([]);
        return;
      }

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

  /** tel:/sms: want digits only, keeping a leading + when the number carries one. */
  const toDialTarget = (raw: string): string => {
    const trimmed = raw.trim();
    const plus = trimmed.startsWith('+') ? '+' : '';
    return plus + trimmed.replace(/\D/g, '');
  };

  const openUrl = (url: string) => {
    Linking.openURL(url).catch((err) => {
      console.error('Error opening link:', err);
      Alert.alert('Error', 'Could not open that link');
    });
  };

  const openPlayerDrawer = async (player: Player) => {
    setContactPlayer(player);
    setContactData(null);
    setContactError('');
    setShareContact(false);
    setShareError('');
    setShareSaving(false);
    setContactLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_player_contact', {
        p_player_id: player.id,
      });

      if (error) {
        console.error('Error fetching player contact:', error);
        const hint =
          typeof (error as any)?.hint === 'string' ? (error as any).hint.trim() : '';
        setContactError(
          hint === 'not_team_member'
            ? "You don't have access to this team's roster."
            : mapJoinError(error)
        );
        return;
      }

      // The RPC returns json, which reaches the client as an object or as a raw
      // string depending on serialization. Accept both; anything else stays null.
      let parsed: any = null;
      if (typeof data === 'string') {
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = null;
        }
      } else if (data && typeof data === 'object') {
        parsed = data;
      }
      setContactData(parsed);
      setShareContact(!!parsed?.share_contact_with_team);
    } catch (err) {
      console.error('Error fetching player contact:', err);
      setContactError(mapJoinError(err));
    } finally {
      setContactLoading(false);
    }
  };

  const closePlayerDrawer = () => {
    setContactPlayer(null);
    setContactData(null);
    setContactError('');
    setContactLoading(false);
    setShareContact(false);
    setShareError('');
    setShareSaving(false);
  };

  /**
   * Optimistic flip, then persist. The server is still the authority — a rejected
   * call reverts the switch and surfaces the reason under the row.
   */
  const handleToggleShareContact = async (next: boolean) => {
    const target = contactPlayer;
    if (!target) return;
    const previous = shareContact;
    setShareContact(next);
    setShareError('');
    setShareSaving(true);
    try {
      const { error } = await supabase.rpc('set_contact_sharing', {
        p_player_id: target.id,
        p_share: next,
      });

      if (error) {
        console.error('Error updating contact sharing:', error);
        const hint =
          typeof (error as any)?.hint === 'string' ? (error as any).hint.trim() : '';
        setShareError(
          hint === 'not_player_family'
            ? "Only this player's family can change this."
            : mapJoinError(error)
        );
        setShareContact(previous);
        return;
      }

      // Keep the cached payload in step so a re-render agrees with the switch.
      setContactData((prev: any) =>
        prev ? { ...prev, share_contact_with_team: next } : prev
      );
    } catch (err) {
      console.error('Error updating contact sharing:', err);
      setShareError(mapJoinError(err));
      setShareContact(previous);
    } finally {
      setShareSaving(false);
    }
  };

  /**
   * True when the server shared contact but every contact field came back null —
   * e.g. a self-registered 16+ player who has no parent record.
   */
  const hasNoContactData = (c: any): boolean =>
    !c?.parent_first_name &&
    !c?.parent_last_name &&
    !c?.parent_email &&
    !c?.parent_phone &&
    !c?.secondary_parent_name &&
    !c?.secondary_parent_email &&
    !c?.secondary_parent_phone;

  /** One contact block. Every button appears only when its datum is non-null. */
  const renderContactSection = (
    title: string,
    name: string | null,
    email: string | null,
    phone: string | null
  ) => {
    if (!name && !email && !phone) return null;
    return (
      <View style={styles.contactSection}>
        <Text style={styles.contactSectionTitle}>{title}</Text>
        {name ? <Text style={styles.contactName}>{name}</Text> : null}
        <View style={styles.contactActionRow}>
          {phone ? (
            <TouchableOpacity
              style={styles.contactAction}
              onPress={() => openUrl(`tel:${toDialTarget(phone)}`)}
            >
              <Text style={styles.contactActionText}>📞 Call</Text>
            </TouchableOpacity>
          ) : null}
          {phone ? (
            <TouchableOpacity
              style={styles.contactAction}
              onPress={() => openUrl(`sms:${toDialTarget(phone)}`)}
            >
              <Text style={styles.contactActionText}>💬 Text</Text>
            </TouchableOpacity>
          ) : null}
          {email ? (
            <TouchableOpacity
              style={styles.contactAction}
              onPress={() => openUrl(`mailto:${encodeURIComponent(email)}`)}
            >
              <Text style={styles.contactActionText}>✉️ Email</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
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
          onPress={async () => {
            const code = (team as any)?.invitation_code || team_id;
            const url = `https://thryvyng.com/join-team/${code}`;
            try {
              await Share.share({
                message: `Hey! Join ${(team as any)?.name || 'our team'} on Thryvyng — the app our club uses for communication, scheduling, and player development.\n\nYour team code is: ${code}\n\nTap to join: ${url}`,
                title: 'Invite Members',
              });
            } catch { /* share dismissed */ }
          }}
        >
          <Text style={styles.actionButtonText}>➕ Invite Members</Text>
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
        {rosterError ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔒</Text>
            <Text style={styles.emptyTitle}>Roster unavailable</Text>
            <Text style={styles.emptyText}>{rosterError}</Text>
          </View>
        ) : players.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No players yet</Text>
            <Text style={styles.emptyText}>
              Add players to build your roster
            </Text>
          </View>
        ) : (
          players.map((player) => {
            return (
              <View key={player.id} style={styles.playerCard}>
                <TouchableOpacity
                  style={styles.playerCardTouchable}
                  onPress={() => openPlayerDrawer(player)}
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

      {/* Player contact drawer */}
      <Modal
        visible={!!contactPlayer}
        animationType="slide"
        transparent
        onRequestClose={closePlayerDrawer}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closePlayerDrawer}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Player</Text>
              <TouchableOpacity onPress={closePlayerDrawer}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.drawerBody}>
              {contactPlayer ? (
                <View style={styles.drawerPlayerHeader}>
                  <PlayerAvatar
                    photoUrl={contactData?.photo_url ?? contactPlayer.photo_url}
                    jerseyNumber={
                      contactData?.jersey_number ?? contactPlayer.jersey_number
                    }
                    firstName={contactPlayer.first_name}
                    lastName={contactPlayer.last_name}
                    size={64}
                    teamColor={team?.color || '#8B6BAD'}
                  />
                  <View style={styles.drawerPlayerInfo}>
                    <Text style={styles.playerName}>
                      {contactPlayer.first_name} {contactPlayer.last_name}
                    </Text>
                    <View style={styles.drawerMetaRow}>
                      {(contactData?.jersey_number ??
                        contactPlayer.jersey_number) != null ? (
                        <Text style={styles.drawerMetaText}>
                          #
                          {contactData?.jersey_number ??
                            contactPlayer.jersey_number}
                        </Text>
                      ) : null}
                      {contactData?.position ? (
                        <Text style={styles.drawerMetaText}>
                          {contactData.position}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              ) : null}

              {contactLoading ? (
                <View style={styles.drawerLoading}>
                  <ActivityIndicator color="#8b5cf6" />
                </View>
              ) : contactError ? (
                <Text style={styles.drawerMuted}>{contactError}</Text>
              ) : contactData?.contact_shared ? (
                hasNoContactData(contactData) ? (
                  <Text style={styles.drawerMuted}>
                    No contact info on file for this player.
                  </Text>
                ) : (
                  <>
                    {renderContactSection(
                      'Parent contact',
                      `${contactData.parent_first_name || ''} ${
                        contactData.parent_last_name || ''
                      }`.trim() || null,
                      contactData.parent_email ?? null,
                      contactData.parent_phone ?? null
                    )}
                    {renderContactSection(
                      'Second parent',
                      contactData.secondary_parent_name ?? null,
                      contactData.secondary_parent_email ?? null,
                      contactData.secondary_parent_phone ?? null
                    )}
                  </>
                )
              ) : contactData ? (
                <Text style={styles.drawerMuted}>
                  This family keeps their contact info private.
                </Text>
              ) : null}

              {contactData?.is_own_player ? (
                <View style={styles.shareSection}>
                  <View style={styles.shareRow}>
                    <Text style={styles.shareLabel}>
                      Share our contact info with the team
                    </Text>
                    <Switch
                      value={shareContact}
                      onValueChange={handleToggleShareContact}
                      disabled={shareSaving}
                      trackColor={{ false: '#4B5563', true: '#8b5cf6' }}
                      thumbColor="#fff"
                      ios_backgroundColor="#4B5563"
                    />
                  </View>
                  {shareError ? (
                    <Text style={styles.shareError}>{shareError}</Text>
                  ) : null}
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.drawerProfileRow}
                onPress={() => {
                  const target = contactPlayer;
                  closePlayerDrawer();
                  if (target) {
                    navigation.navigate('PlayerProfile', {
                      playerId: target.id,
                      playerName: `${target.first_name} ${target.last_name}`,
                    });
                  }
                }}
              >
                <Text style={styles.drawerProfileText}>View full profile</Text>
                <Text style={styles.playerArrow}>›</Text>
              </TouchableOpacity>
            </ScrollView>
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
  drawerBody: {
    padding: 16,
  },
  drawerPlayerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  drawerPlayerInfo: {
    flex: 1,
    marginLeft: 14,
  },
  drawerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  drawerMetaText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  drawerLoading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  drawerMuted: {
    color: '#888',
    fontSize: 15,
    paddingVertical: 12,
  },
  contactSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
    marginBottom: 16,
  },
  contactSectionTitle: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  contactName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  contactActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  contactAction: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  contactActionText: {
    color: '#C4B5FD',
    fontSize: 14,
    fontWeight: '600',
  },
  shareSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
    marginBottom: 16,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  shareLabel: {
    flex: 1,
    color: '#D1D5DB',
    fontSize: 15,
  },
  shareError: {
    color: '#ef4444',
    fontSize: 13,
    marginTop: 8,
  },
  drawerProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
  },
  drawerProfileText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
