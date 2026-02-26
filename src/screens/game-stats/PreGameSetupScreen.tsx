import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { gameStatsService } from '../../services/gameStatsService';
import {
  USYS_FORMATS,
  POSITIONS,
  type PlayerPosition,
} from '../../types/game-stats';

const colors = {
  background: '#1a1a2e',
  card: '#2a2a4e',
  text: '#ffffff',
  textMuted: '#9CA3AF',
  border: '#374151',
  primary: '#8B5CF6',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  muted: '#374151',
};

const FORMAT_PLAYER_LIMITS: Record<string, number> = {
  '4v4': 4,
  '7v7': 7,
  '9v9': 9,
  '11v11': 11,
};

type RouteParams = {
  PreGameSetup: {
    eventId: string;
    teamId: string;
  };
};

interface LineupPlayer {
  playerId: string;
  playerName: string;
  jerseyNumber: number | null;
  photoUrl: string | null;
  position: PlayerPosition | null;
  isStarter: boolean;
  isGuest?: boolean;
}

interface Team {
  id: string;
  name: string;
  age_group?: string | null;
  default_game_format?: string | null;
  default_half_length_minutes?: number | null;
}

interface RosterPlayer {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  photo_url: string | null;
}

export default function PreGameSetupScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'PreGameSetup'>>();
  const { eventId, teamId } = route.params;

  const [step, setStep] = useState<'config' | 'lineup'>('config');
  const [useCustomFormat, setUseCustomFormat] = useState(false);
  const [customHalfLength, setCustomHalfLength] = useState(35);
  const [lineup, setLineup] = useState<LineupPlayer[]>([]);
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestNumber, setGuestNumber] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const [team, setTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchTeam = useCallback(async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('id, name, age_group, default_game_format, default_half_length_minutes')
      .eq('id', teamId)
      .single();
    if (error) throw error;
    setTeam(data);
  }, [teamId]);

  const fetchRoster = useCallback(async () => {
    const { data, error } = await supabase
      .from('players')
      .select('id, first_name, last_name, jersey_number, photo_url')
      .eq('team_id', teamId)
      .order('jersey_number');
    if (error) throw error;
    setRoster(data || []);
  }, [teamId]);

  const fetchEvent = useCallback(async () => {
    const { data, error } = await supabase
      .from('cal_events')
      .select('*')
      .eq('id', eventId)
      .single();
    if (error) throw error;
    setEvent(data);
  }, [eventId]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchTeam(), fetchRoster(), fetchEvent()]);
      } catch (err) {
        console.error('PreGameSetup load error:', err);
        Alert.alert('Error', 'Failed to load teams');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [fetchTeam, fetchRoster, fetchEvent]);

  const ageGroup = team?.age_group || 'U12';
  const usysFormat = USYS_FORMATS[ageGroup] || USYS_FORMATS['U12'];
  const effectiveHalfLength = useCustomFormat
    ? customHalfLength
    : team?.default_half_length_minutes ?? usysFormat.halfLength;

  const maxStarters = FORMAT_PLAYER_LIMITS[usysFormat.format] || 11;
  const currentStarters = lineup.filter((l) => l.isStarter).length;
  const canAddMoreStarters = currentStarters < maxStarters;

  const togglePlayerPosition = (
    playerId: string,
    playerName: string,
    jerseyNumber: number | null,
    position: PlayerPosition | null
  ) => {
    const existing = lineup.find((l) => l.playerId === playerId);

    // If removing (setting to bench/null position), always allow
    if (existing && (position === null || existing.position === position)) {
      setLineup(lineup.filter((l) => l.playerId !== playerId));
      setSelectedPlayerId(null);
      return;
    }

    // If adding a new starter, check the limit
    if (!existing && position !== null && currentStarters >= maxStarters) {
      Alert.alert(
        'Lineup Full',
        `${usysFormat.format} format allows maximum ${maxStarters} starters.\n\nRemove a player first or leave them on the bench.`,
        [{ text: 'OK' }]
      );
      return;
    }

    // Add or update position
    const newLineup = lineup.filter((l) => l.playerId !== playerId);
    if (position) {
      newLineup.push({
        playerId,
        playerName,
        jerseyNumber,
        photoUrl: null,
        position,
        isStarter: true,
      });
    }
    setLineup(newLineup);
    setSelectedPlayerId(null);
  };

  const addGuestPlayer = () => {
    if (!guestName.trim() || !guestNumber.trim()) return;

    const guestId = `guest-${Date.now()}`;
    setLineup([
      ...lineup,
      {
        playerId: guestId,
        playerName: guestName.trim(),
        jerseyNumber: parseInt(guestNumber, 10),
        photoUrl: null,
        position: null,
        isStarter: false,
        isGuest: true,
      },
    ]);
    setGuestName('');
    setGuestNumber('');
    setShowAddGuest(false);
  };

  const startGameSession = async () => {
    setIsStarting(true);
    try {
      const result = await gameStatsService.getOrCreateSession(eventId);

      if (!result.success || !result.session_id) {
        throw new Error(result.error || 'Failed to create game session');
      }

      const sessionId = result.session_id;

      if (useCustomFormat) {
        await supabase
          .from('game_sessions')
          .update({
            half_length_minutes: customHalfLength,
            game_format: usysFormat.format,
            period_type: usysFormat.periodType,
          } as any)
          .eq('id', sessionId);
      }

      for (const player of lineup) {
        await gameStatsService.addToLineup({
          gameSessionId: sessionId,
          playerId: player.isGuest ? undefined : player.playerId,
          guestPlayerName: player.isGuest ? player.playerName : undefined,
          guestJerseyNumber: player.isGuest ? player.jerseyNumber || undefined : undefined,
          position: player.position || undefined,
          isStarter: player.isStarter,
        });
      }

      await gameStatsService.claimStatsKeeper(sessionId);

      navigation.navigate('StatsConsole', { sessionId });
    } catch (error) {
      console.error('Error starting game:', error);
      Alert.alert('Error', 'Failed to start game');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStartGame = () => {
    if (lineup.length === 0) {
      Alert.alert(
        'No Lineup Selected',
        "You haven't selected any players. Minutes tracking won't be accurate.",
        [
          { text: 'Go Back', style: 'cancel' },
          { text: 'Start Anyway', style: 'destructive', onPress: startGameSession },
        ]
      );
      return;
    }
    startGameSession();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  // Config Step
  if (step === 'config') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView style={styles.content}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>⚙️ Game Setup</Text>
            <View style={{ width: 24 }} />
          </View>

          <Text style={styles.subtitle}>Smart defaults based on USYS standards</Text>

          {/* Event Info Card */}
          {event && (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <View>
                  <Text style={styles.cardTitle}>
                    {team?.name} vs {event.opponent || 'TBD'}
                  </Text>
                  <Text style={styles.cardSubtitle}>
                    {new Date(event.event_date).toLocaleDateString()} •{' '}
                    {event.location_name || 'TBD'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor:
                        event.home_away === 'home' ? colors.primary : colors.muted,
                    },
                  ]}
                >
                  <Text style={styles.badgeText}>
                    {event.home_away?.toUpperCase() || 'HOME'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* USYS Format Card */}
          <View style={[styles.card, { borderColor: colors.success + '60' }]}>
            <View style={styles.formatHeader}>
              <Ionicons name="flash" size={16} color={colors.success} />
              <Text style={[styles.formatLabel, { color: colors.success }]}>
                AUTO-DETECTED USYS FORMAT ({ageGroup})
              </Text>
            </View>
            <View style={styles.formatGrid}>
              <View style={styles.formatItem}>
                <Text style={styles.formatItemLabel}>Format</Text>
                <Text style={styles.formatItemValue}>{usysFormat.format}</Text>
              </View>
              <View style={styles.formatItem}>
                <Text style={styles.formatItemLabel}>Game Length</Text>
                <Text style={styles.formatItemValue}>
                  {usysFormat.periods}×{effectiveHalfLength} min
                </Text>
              </View>
              <View style={styles.formatItem}>
                <Text style={styles.formatItemLabel}>Period Type</Text>
                <Text style={styles.formatItemValueSmall}>{usysFormat.periodType}</Text>
              </View>
              <View style={styles.formatItem}>
                <Text style={styles.formatItemLabel}>Ball Size</Text>
                <Text style={styles.formatItemValueSmall}>Size {usysFormat.ballSize}</Text>
              </View>
            </View>
          </View>

          {/* Custom Override */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View>
                <Text style={styles.cardTitle}>Use Custom Format</Text>
                <Text style={styles.cardSubtitle}>Override USYS defaults for this game</Text>
              </View>
              <TouchableOpacity
                style={[styles.toggle, useCustomFormat && styles.toggleActive]}
                onPress={() => setUseCustomFormat(!useCustomFormat)}
              >
                <View
                  style={[styles.toggleThumb, useCustomFormat && styles.toggleThumbActive]}
                />
              </TouchableOpacity>
            </View>

            {useCustomFormat && (
              <View style={styles.customFormat}>
                <Text style={styles.customFormatLabel}>
                  Half/Quarter Length (minutes)
                </Text>
                <View style={styles.customFormatControls}>
                  <TouchableOpacity
                    style={styles.controlButton}
                    onPress={() =>
                      setCustomHalfLength(Math.max(5, customHalfLength - 5))
                    }
                  >
                    <Text style={styles.controlButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.customFormatValue}>{customHalfLength}</Text>
                  <TouchableOpacity
                    style={styles.controlButton}
                    onPress={() =>
                      setCustomHalfLength(Math.min(60, customHalfLength + 5))
                    }
                  >
                    <Text style={styles.controlButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setStep('lineup')}
          >
            <Text style={styles.primaryButtonText}>Continue to Lineup</Text>
            <Ionicons name="chevron-forward" size={20} color="white" />
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Lineup Step
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('config')}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>📋 Starting Lineup</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={styles.subtitle}>Select starters and assign positions</Text>

        {/* Lineup Summary Card */}
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text
                style={[
                  styles.summaryValue,
                  {
                    color:
                      currentStarters === maxStarters ? colors.success : colors.primary,
                  },
                ]}
              >
                {currentStarters}
              </Text>
              <Text style={styles.summaryLabel}>STARTERS</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>/</Text>
              <Text style={styles.summaryLabel}></Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.warning }]}>
                {maxStarters}
              </Text>
              <Text style={styles.summaryLabel}>MAX ({usysFormat.format})</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{roster.length}</Text>
              <Text style={styles.summaryLabel}>ROSTER</Text>
            </View>
          </View>

          {/* Status message */}
          {currentStarters < maxStarters && (
            <View style={styles.lineupStatus}>
              <Text style={styles.lineupStatusText}>
                ⚠️ {maxStarters - currentStarters} more needed for full starting XI
              </Text>
            </View>
          )}
          {currentStarters === maxStarters && (
            <View style={[styles.lineupStatus, { backgroundColor: colors.success + '20' }]}>
              <Text style={[styles.lineupStatusText, { color: colors.success }]}>
                ✅ Starting lineup complete!
              </Text>
            </View>
          )}
        </View>

        {/* Add Guest Button */}
        <TouchableOpacity
          style={styles.addGuestButton}
          onPress={() => setShowAddGuest(true)}
        >
          <Ionicons name="person-add" size={18} color={colors.textMuted} />
          <Text style={styles.addGuestText}>Add Guest Player</Text>
        </TouchableOpacity>

        {/* Player List */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Team Roster</Text>
          {roster.map((player) => {
            const inLineup = lineup.find((l) => l.playerId === player.id);
            const isSelected = selectedPlayerId === player.id;

            return (
              <View key={player.id}>
                <TouchableOpacity
                  style={[styles.playerRow, inLineup && styles.playerRowActive]}
                  onPress={() =>
                    setSelectedPlayerId(isSelected ? null : player.id)
                  }
                >
                  <View style={styles.playerInfo}>
                    <View
                      style={[
                        styles.playerNumber,
                        inLineup && { backgroundColor: colors.primary },
                      ]}
                    >
                      <Text style={styles.playerNumberText}>
                        {player.jersey_number || '?'}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.playerName}>
                        {player.first_name} {player.last_name}
                      </Text>
                      {inLineup?.position && (
                        <View
                          style={[
                            styles.positionBadge,
                            {
                              borderColor:
                                POSITIONS.find((p) => p.id === inLineup.position)?.color,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.positionBadgeText,
                              {
                                color:
                                  POSITIONS.find((p) => p.id === inLineup.position)?.color,
                              },
                            ]}
                          >
                            {inLineup.position}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Ionicons
                    name={isSelected ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>

                {/* Position Selector */}
                {isSelected && (
                  <View style={styles.positionSelector}>
                    <TouchableOpacity
                      style={[
                        styles.positionOption,
                        !inLineup && styles.positionOptionActive,
                      ]}
                      onPress={() =>
                        togglePlayerPosition(
                          player.id,
                          `${player.first_name} ${player.last_name}`,
                          player.jersey_number,
                          null
                        )
                      }
                    >
                      <Text style={styles.positionOptionText}>Bench</Text>
                    </TouchableOpacity>
                    {POSITIONS.map((pos) => (
                      <TouchableOpacity
                        key={pos.id}
                        style={[
                          styles.positionOption,
                          inLineup?.position === pos.id && styles.positionOptionActive,
                          { borderColor: pos.color },
                        ]}
                        onPress={() =>
                          togglePlayerPosition(
                            player.id,
                            `${player.first_name} ${player.last_name}`,
                            player.jersey_number,
                            pos.id
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.positionOptionText,
                            { color: pos.color },
                          ]}
                        >
                          {pos.id}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.goLiveButton, isStarting && styles.buttonDisabled]}
            onPress={handleStartGame}
            disabled={isStarting}
          >
            {isStarting ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons name="play" size={20} color="white" />
                <Text style={styles.goLiveButtonText}>Go Live</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Add Guest Modal */}
      {showAddGuest && (
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Guest Player</Text>
            <TextInput
              style={styles.input}
              placeholder="Player Name"
              placeholderTextColor={colors.textMuted}
              value={guestName}
              onChangeText={setGuestName}
            />
            <TextInput
              style={styles.input}
              placeholder="Jersey Number"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              value={guestNumber}
              onChangeText={setGuestNumber}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowAddGuest(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAddButton} onPress={addGuestPlayer}>
                <Text style={styles.modalAddText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textMuted,
    marginTop: 12,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: 'white',
  },
  formatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  formatLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  formatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  formatItem: {
    width: '50%',
    marginBottom: 12,
  },
  formatItemLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  formatItemValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
  },
  formatItemValueSmall: {
    fontSize: 16,
    color: colors.text,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    justifyContent: 'center',
    padding: 2,
  },
  toggleActive: {
    backgroundColor: colors.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'white',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  customFormat: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  customFormatLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 12,
  },
  customFormatControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonText: {
    fontSize: 24,
    color: colors.text,
  },
  customFormatValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    width: 60,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  summaryLabel: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  lineupStatus: {
    marginTop: 12,
    padding: 10,
    backgroundColor: colors.warning + '20',
    borderRadius: 8,
    alignItems: 'center',
  },
  lineupStatusText: {
    fontSize: 13,
    color: colors.warning,
    fontWeight: '500',
  },
  addGuestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 12,
    marginBottom: 16,
  },
  addGuestText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: colors.muted,
    borderRadius: 10,
    marginBottom: 8,
  },
  playerRowActive: {
    backgroundColor: colors.primary + '20',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playerNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerNumberText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  playerName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  positionBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  positionBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  positionSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    marginBottom: 8,
  },
  positionOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  positionOptionActive: {
    backgroundColor: colors.primary + '30',
    borderColor: colors.primary,
  },
  positionOptionText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 32,
  },
  secondaryButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  goLiveButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.success,
  },
  goLiveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 14,
    color: colors.text,
    fontSize: 16,
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: colors.muted,
    alignItems: 'center',
  },
  modalCancelText: {
    color: colors.text,
    fontWeight: '500',
  },
  modalAddButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  modalAddText: {
    color: 'white',
    fontWeight: '600',
  },
});
