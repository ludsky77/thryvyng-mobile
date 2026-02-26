import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useLiveGameSession } from '../../hooks/useLiveGameSession';
import { supabase } from '../../lib/supabase';
import { gameStatsService } from '../../services/gameStatsService';
import { TeamHeader } from '../../components/game-stats/TeamHeader';
import {
  POSITIONS,
  type GameEventType,
} from '../../types/game-stats';

const colors = {
  background: '#0f172a',
  card: '#1e293b',
  text: '#ffffff',
  textMuted: '#94a3b8',
  border: '#334155',
  primary: '#8b5cf6',
  primaryLight: '#a78bfa',
  primaryDeep: '#6d28d9',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  muted: '#475569',
  slate: '#475569',
  slateDark: '#334155',
};

type RouteParams = {
  StatsConsole: {
    sessionId: string;
  };
};

export default function StatsConsoleScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'StatsConsole'>>();
  const { sessionId } = route.params;

  const {
    session,
    lineup,
    timeline,
    isLoading,
    updateStatus,
    recordGoal,
    recordEvent,
    recordSubstitution,
    deleteEvent,
  } = useLiveGameSession(sessionId);

  const [gameMinute, setGameMinute] = useState(0);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEventType, setSelectedEventType] = useState<GameEventType | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [selectedAssist, setSelectedAssist] = useState<string | null>(null);
  const [playerOut, setPlayerOut] = useState<string | null>(null);
  const [playerIn, setPlayerIn] = useState<string | null>(null);
  const [possessionMode, setPossessionMode] = useState(false);
  const [possessionHome, setPossessionHome] = useState(50);
  const [onlineParents, setOnlineParents] = useState<{ user_id: string; full_name: string }[]>([]);
  const [roster, setRoster] = useState<any[]>([]);

  const pulseAnim = useState(new Animated.Value(1))[0];

  // Fetch team roster for substitutions
  useEffect(() => {
    const fetchRoster = async () => {
      if (!session?.team_id) return;

      const { data, error } = await supabase
        .from('players')
        .select('id, first_name, last_name, jersey_number, photo_url')
        .eq('team_id', session.team_id)
        .order('jersey_number');

      if (!error && data) {
        setRoster(data);
      }
    };

    fetchRoster();
  }, [session?.team_id]);

  // Pulse animation for LIVE badge
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Calculate game minute from kickoff - FIXED
  useEffect(() => {
    if (
      !session?.kickoff_at ||
      session.status === 'finished' ||
      session.status === 'scheduled' ||
      session.status === 'warmup'
    ) {
      setGameMinute(0);
      return;
    }

    // If halftime, show the half length
    if (session.status === 'halftime') {
      setGameMinute(session.half_length_minutes || 45);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const halfLength = session.half_length_minutes || 45;

      if (session.status === 'first_half') {
        const kickoff = new Date(session.kickoff_at!).getTime();
        const elapsed = Math.floor((now - kickoff) / 60000);
        setGameMinute(Math.min(elapsed, halfLength + 5));
      } else if (
        session.status === 'second_half' &&
        session.second_half_start_at
      ) {
        const secondHalfStart = new Date(
          session.second_half_start_at
        ).getTime();
        const elapsed = Math.floor((now - secondHalfStart) / 60000);
        setGameMinute(
          Math.min(halfLength + elapsed, halfLength * 2 + 5)
        );
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [
    session?.kickoff_at,
    session?.status,
    session?.second_half_start_at,
    session?.half_length_minutes,
  ]);

  // Initialize possession from session
  useEffect(() => {
    if (session?.possession_home != null) {
      setPossessionHome(session.possession_home);
    }
  }, [session?.possession_home]);

  // Update possession (debounced)
  useEffect(() => {
    if (possessionMode && sessionId) {
      const timeout = setTimeout(() => {
        supabase
          .from('game_sessions')
          .update({ possession_home: possessionHome } as any)
          .eq('id', sessionId);
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [possessionHome, possessionMode, sessionId]);

  // Load online parents (filter duplicates)
  useEffect(() => {
    if (showTransfer) {
      gameStatsService.getOnlineParents(sessionId).then((parents) => {
        const uniqueParents = parents.filter(
          (parent, index, self) =>
            index === self.findIndex((p) => p.user_id === parent.user_id)
        );
        setOnlineParents(uniqueParents);
      });
    }
  }, [showTransfer, sessionId]);

  const onFieldPlayers = lineup.filter((l) => l.is_currently_on_field);
  const benchPlayers = lineup.filter((l) => !l.is_currently_on_field);

  // Roster players not yet in lineup (available to add)
  const lineupPlayerIds = lineup.map((l) => l.player_id).filter(Boolean);
  const availableFromRoster = roster.filter((p) => !lineupPlayerIds.includes(p.id));

  // Combined list for substitution "Player In"
  const playersAvailableToSubIn = [
    ...benchPlayers.map((p) => ({
      id: p.id,
      player_id: p.player_id || p.id,
      first_name: p.player?.first_name || p.guest_player_name?.split(' ')[0] || 'Player',
      last_name: p.player?.last_name || '',
      jersey_number: p.jersey_number ?? p.player?.jersey_number ?? p.guest_jersey_number ?? null,
      fromBench: true,
    })),
    ...availableFromRoster.map((p) => ({
      id: p.id,
      player_id: p.id,
      first_name: p.first_name,
      last_name: p.last_name || '',
      jersey_number: p.jersey_number,
      fromBench: false,
    })),
  ];

  const getCurrentPeriod = () => {
    if (session?.status === 'first_half') return 1;
    if (session?.status === 'second_half') return 2;
    return 1;
  };

  const handleGoal = (isOpponent: boolean) => {
    if (isOpponent) {
      recordGoal({
        gameSessionId: sessionId,
        gameMinute,
        period: getCurrentPeriod(),
        isOpponent: true,
      });
    } else {
      setShowGoalModal(true);
    }
  };

  const confirmGoal = () => {
    recordGoal({
      gameSessionId: sessionId,
      playerId: selectedPlayer || undefined,
      assistPlayerId: selectedAssist || undefined,
      gameMinute,
      period: getCurrentPeriod(),
    });
    setShowGoalModal(false);
    setSelectedPlayer(null);
    setSelectedAssist(null);
  };

  const confirmEvent = () => {
    if (!selectedEventType) return;
    recordEvent({
      gameSessionId: sessionId,
      eventType: selectedEventType,
      playerId: selectedPlayer || undefined,
      gameMinute,
      period: getCurrentPeriod(),
    });
    setShowEventModal(false);
    setSelectedEventType(null);
    setSelectedPlayer(null);
  };

  const confirmSubstitution = async () => {
    if (!playerIn) return;

    try {
      const isFromRoster = availableFromRoster.some((p) => p.id === playerIn);

      if (isFromRoster) {
        await gameStatsService.addToLineup({
          gameSessionId: sessionId,
          playerId: playerIn,
          isStarter: false,
        });
      }

      await recordSubstitution({
        gameSessionId: sessionId,
        playerInId: playerIn,
        playerOutId: playerOut || undefined,
        gameMinute,
        period: getCurrentPeriod(),
      });

      setShowSubModal(false);
      setPlayerIn(null);
      setPlayerOut(null);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to record substitution');
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === 'finished') {
      Alert.alert(
        'End Game?',
        'Are you sure you want to end this game?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'End Game',
            style: 'destructive',
            onPress: () => {
              updateStatus(newStatus);
              navigation.navigate('MatchSummary', { sessionId });
            },
          },
        ]
      );
    } else {
      updateStatus(newStatus);
    }
  };

  const handleTransfer = async (toUserId: string) => {
    const result = await gameStatsService.transferStatsKeeper(sessionId, toUserId);
    if (result.success) {
      Alert.alert('Transferred', 'Stats recording transferred');
      setShowTransfer(false);
      navigation.goBack();
    }
  };

  const handleRelease = async () => {
    await gameStatsService.releaseStatsKeeper(sessionId);
    setShowTransfer(false);
    navigation.goBack();
  };

  const getPlayerId = (p: (typeof lineup)[0]) => p.player_id || p.id;
  const getJerseyNumber = (p: (typeof lineup)[0]) =>
    p.jersey_number ?? p.player?.jersey_number ?? p.guest_jersey_number ?? '?';
  const getPlayerName = (p: (typeof lineup)[0]) =>
    p.player?.first_name ?? p.guest_player_name?.split(' ')[0] ?? '?';

  if (isLoading || !session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isPreGame = ['scheduled', 'warmup'].includes(session.status);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Stats Console</Text>
            <Text style={styles.headerSubtitle}>You are recording</Text>
          </View>
          <TouchableOpacity style={styles.transferButton} onPress={() => setShowTransfer(true)}>
            <Ionicons name="swap-horizontal" size={16} color={colors.text} />
            <Text style={styles.transferButtonText}>Transfer</Text>
          </TouchableOpacity>
        </View>

        {/* Live Score Card - Compact */}
        <View style={styles.scoreCard}>
          <Animated.View style={[styles.liveBadge, { opacity: pulseAnim }]}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>
              {session.status === 'halftime' ? 'HALFTIME' : isPreGame ? 'READY' : 'RECORDING'}
            </Text>
          </Animated.View>

          <Text style={styles.score}>
            {session.home_score} - {session.away_score}
          </Text>

          <TeamHeader
            teamName={session.team?.name}
            clubLogoUrl={session.team?.club?.logo_url}
            opponentName={session.opponent_name ?? undefined}
            isHome={session.is_home_team}
            size="compact"
          />

          <View style={styles.timeContainer}>
            <Ionicons name="time-outline" size={18} color={colors.primary} />
            <Text style={styles.gameMinute}>{gameMinute}'</Text>
            <Text style={styles.periodText}>
              {session.status === 'first_half'
                ? '1st Half'
                : session.status === 'second_half'
                  ? '2nd Half'
                  : session.status === 'halftime'
                    ? 'Halftime'
                    : session.status}
            </Text>
          </View>
        </View>

        {/* Action Buttons - Row 1 + Row 2 */}
        {session.status !== 'finished' && session.status !== 'cancelled' && (
          <View style={styles.actionsContainer}>
            {/* Row 1: Goal, Shot, Sub, Opp Goal */}
            <View style={styles.actionsRow1}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnFill, { backgroundColor: colors.primary }]}
                onPress={() => handleGoal(false)}
              >
                <Text style={styles.actionBtnIcon}>⚽</Text>
                <Text style={[styles.actionBtnLabel, { color: 'white' }]}>Goal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnOutline, { borderColor: colors.primaryLight }]}
                onPress={() => {
                  setSelectedEventType('shot');
                  setShowEventModal(true);
                }}
              >
                <Text style={styles.actionBtnIcon}>🎯</Text>
                <Text style={[styles.actionBtnLabel, { color: colors.primaryLight }]}>Shot</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnOutline, { borderColor: colors.primary }]}
                onPress={() => setShowSubModal(true)}
              >
                <Text style={styles.actionBtnIcon}>🔄</Text>
                <Text style={[styles.actionBtnLabel, { color: colors.primary }]}>Sub</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnFill, { backgroundColor: colors.slate }]}
                onPress={() => handleGoal(true)}
              >
                <Text style={styles.actionBtnIcon}>⚽</Text>
                <Text style={[styles.actionBtnLabel, { color: 'white' }]}>Opp Goal</Text>
              </TouchableOpacity>
            </View>
            {/* Row 2: Yellow, Red (centered, same width as row 1 buttons) */}
            <View style={styles.actionsRow2}>
              <View style={styles.actionsRow2Spacer} />
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnOutline, { borderColor: colors.primaryLight }]}
                onPress={() => {
                  setSelectedEventType('yellow_card');
                  setShowEventModal(true);
                }}
              >
                <View style={[styles.cardIconInner, { backgroundColor: colors.warning }]} />
                <Text style={[styles.actionBtnLabel, { color: colors.primaryLight }]}>Yellow</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnOutline, { borderColor: colors.primaryLight }]}
                onPress={() => {
                  setSelectedEventType('red_card');
                  setShowEventModal(true);
                }}
              >
                <View style={[styles.cardIconInner, { backgroundColor: colors.error }]} />
                <Text style={[styles.actionBtnLabel, { color: colors.primaryLight }]}>Red</Text>
              </TouchableOpacity>
              <View style={styles.actionsRow2Spacer} />
            </View>
          </View>
        )}

        {/* Game Flow Button */}
        <TouchableOpacity
          style={[
            styles.gameFlowButton,
            {
              backgroundColor:
                session.status === 'scheduled' || session.status === 'warmup' ? '#22c55e' :
                session.status === 'first_half' ? '#f59e0b' :
                session.status === 'halftime' ? '#22c55e' :
                session.status === 'second_half' ? colors.primaryDeep : colors.slate,
            },
          ]}
          onPress={() => {
            const nextStatus =
              session.status === 'scheduled' ? 'first_half' :
              session.status === 'warmup' ? 'first_half' :
              session.status === 'first_half' ? 'halftime' :
              session.status === 'halftime' ? 'second_half' :
              session.status === 'second_half' ? 'finished' : null;

            if (nextStatus) {
              Alert.alert(
                'Change Game Status',
                `Change from "${session.status}" to "${nextStatus}"?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Yes',
                    onPress: async () => {
                      try {
                        await updateStatus(nextStatus);
                        if (nextStatus === 'finished') {
                          navigation.navigate('MatchSummary', { sessionId });
                        }
                      } catch (e) {
                        Alert.alert('Error', 'Failed to update status');
                      }
                    },
                  },
                ]
              );
            }
          }}
        >
          <Text style={styles.gameFlowButtonText}>
            {(session.status === 'scheduled' || session.status === 'warmup') && '▶️ Start Game (Kickoff)'}
            {session.status === 'first_half' && '⏸️ Go to Halftime'}
            {session.status === 'halftime' && '▶️ Start 2nd Half'}
            {session.status === 'second_half' && '🏁 End Match'}
          </Text>
        </TouchableOpacity>

        {/* Undo - Slate outline, left-aligned, smaller */}
        {timeline.length > 0 && (
          <TouchableOpacity
            style={styles.undoButton}
            onPress={() => {
              const lastEvent = timeline[0];
              Alert.alert(
                'Undo Last Event?',
                `Remove: ${lastEvent.game_minute}' ${lastEvent.event_type.replace('_', ' ')}${lastEvent.is_opponent_event ? ' (Opponent)' : ''}`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => deleteEvent(lastEvent.id),
                  },
                ]
              );
            }}
          >
            <Ionicons name="arrow-undo" size={16} color={colors.textMuted} />
            <Text style={styles.undoButtonText}>Undo Last Event</Text>
          </TouchableOpacity>
        )}

        {/* On Field Players */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>On Field ({onFieldPlayers.length})</Text>
            <Text style={styles.cardHint}>Tap player for event</Text>
          </View>
          <View style={styles.playersGrid}>
            {onFieldPlayers.map((p) => {
                const playerGoals = timeline.filter(
                  (e) =>
                    ['goal', 'penalty_goal'].includes(e.event_type) &&
                    e.player_id === (p.player_id || p.id) &&
                    !e.is_opponent_event
                ).length;
                const isSelected = selectedPlayer === getPlayerId(p);

                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.playerChip,
                      isSelected && styles.playerChipSelected,
                    ]}
                    onPress={() => {
                      setSelectedPlayer(getPlayerId(p));
                      setShowEventModal(true);
                    }}
                  >
                    <View
                      style={[
                        styles.playerNumber,
                        {
                          backgroundColor:
                            POSITIONS.find((pos) => pos.id === p.position)
                              ?.color || colors.border,
                        },
                      ]}
                    >
                      <Text style={styles.playerNumberText}>
                        {getJerseyNumber(p)}
                      </Text>
                    </View>
                    <View style={styles.playerChipContent}>
                      <Text style={styles.playerName} numberOfLines={1}>{getPlayerName(p)}</Text>
                      <Text style={styles.playerMeta}>
                        {p.position || '-'} • {p.total_minutes_played}'
                        {playerGoals > 0 ? ` • ⚽${playerGoals}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
          </View>

          {/* Bench */}
          <View style={styles.benchSection}>
            <Text style={styles.benchTitle}>Bench ({benchPlayers.length})</Text>
            <View style={styles.benchGrid}>
              {benchPlayers.map((p) => (
                <View key={p.id} style={styles.benchChip}>
                  <Text style={styles.benchNumber}>#{getJerseyNumber(p)}</Text>
                  <Text style={styles.benchName} numberOfLines={1}>{getPlayerName(p)}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Possession Tracker - Redesigned */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>Possession</Text>
              <Text style={styles.cardHint}>Estimate ball control</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggle, possessionMode && styles.toggleActive]}
              onPress={() => setPossessionMode(!possessionMode)}
            >
              <View style={[styles.toggleThumb, possessionMode && styles.toggleThumbActive]} />
            </TouchableOpacity>
          </View>

          {possessionMode && (
            <View style={styles.possessionControl}>
              <View style={styles.possessionBarContainer}>
                <View style={styles.possessionBar}>
                  <View style={[styles.possessionHomeBar, { flex: possessionHome }]} />
                  <View style={[styles.possessionAwayBar, { flex: 100 - possessionHome }]} />
                </View>
                <View style={styles.possessionLabels}>
                  <Text style={styles.possessionLabelHome}>HOME {possessionHome}%</Text>
                  <Text style={styles.possessionLabelAway}>{100 - possessionHome}% AWAY</Text>
                </View>
              </View>

              <View style={styles.possessionPresets}>
                {[30, 40, 50, 60, 70].map((pct) => (
                  <TouchableOpacity
                    key={pct}
                    style={[
                      styles.possessionPreset,
                      possessionHome === pct && styles.possessionPresetActive,
                    ]}
                    onPress={() => setPossessionHome(pct)}
                  >
                    <Text
                      style={[
                        styles.possessionPresetText,
                        possessionHome === pct && styles.possessionPresetTextActive,
                      ]}
                    >
                      {pct}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.possessionFineControls}>
                <TouchableOpacity
                  style={styles.possessionAdjustButton}
                  onPress={() => setPossessionHome((prev) => Math.max(0, prev - 5))}
                >
                  <Text style={styles.possessionAdjustText}>-5%</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.possessionAdjustButton}
                  onPress={() => setPossessionHome((prev) => Math.max(0, prev - 1))}
                >
                  <Text style={styles.possessionAdjustText}>-1%</Text>
                </TouchableOpacity>

                <View style={styles.possessionCenterDisplay}>
                  <Text style={styles.possessionCenterValue}>{possessionHome}%</Text>
                  <Text style={styles.possessionCenterLabel}>HOME</Text>
                </View>

                <TouchableOpacity
                  style={styles.possessionAdjustButton}
                  onPress={() => setPossessionHome((prev) => Math.min(100, prev + 1))}
                >
                  <Text style={styles.possessionAdjustText}>+1%</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.possessionAdjustButton}
                  onPress={() => setPossessionHome((prev) => Math.min(100, prev + 5))}
                >
                  <Text style={styles.possessionAdjustText}>+5%</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Goal Modal */}
      <Modal visible={showGoalModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>⚽ Record Goal</Text>

            <Text style={styles.modalLabel}>Scorer</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playerScroll}>
              {onFieldPlayers.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.playerOption,
                    selectedPlayer === getPlayerId(p) && styles.playerOptionSelected,
                  ]}
                  onPress={() => setSelectedPlayer(getPlayerId(p))}
                >
                  <Text style={styles.playerOptionText}>
                    #{getJerseyNumber(p)} {getPlayerName(p)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.modalLabel}>Assist (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playerScroll}>
              <TouchableOpacity
                style={[styles.playerOption, !selectedAssist && styles.playerOptionSelected]}
                onPress={() => setSelectedAssist(null)}
              >
                <Text style={styles.playerOptionText}>None</Text>
              </TouchableOpacity>
              {onFieldPlayers
                .filter((p) => getPlayerId(p) !== selectedPlayer)
                .map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.playerOption,
                      selectedAssist === getPlayerId(p) && styles.playerOptionSelected,
                    ]}
                    onPress={() => setSelectedAssist(getPlayerId(p))}
                  >
                    <Text style={styles.playerOptionText}>
                      #{getJerseyNumber(p)} {getPlayerName(p)}
                    </Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowGoalModal(false);
                  setSelectedPlayer(null);
                  setSelectedAssist(null);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmButton, !selectedPlayer && styles.buttonDisabled]}
                onPress={confirmGoal}
                disabled={!selectedPlayer}
              >
                <Text style={styles.modalConfirmText}>Record Goal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Event Modal */}
      <Modal visible={showEventModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Record Event</Text>

            <Text style={styles.modalLabel}>Event Type</Text>
            <View style={styles.eventTypeGrid}>
              {(
                [
                  'shot',
                  'shot_on_target',
                  'yellow_card',
                  'red_card',
                  'foul',
                  'corner',
                  'save',
                ] as GameEventType[]
              ).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.eventTypeOption,
                    selectedEventType === type && styles.eventTypeSelected,
                  ]}
                  onPress={() => setSelectedEventType(type)}
                >
                  <Text style={styles.eventTypeText}>{type.replace('_', ' ')}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Player (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playerScroll}>
              <TouchableOpacity
                style={[styles.playerOption, !selectedPlayer && styles.playerOptionSelected]}
                onPress={() => setSelectedPlayer(null)}
              >
                <Text style={styles.playerOptionText}>None</Text>
              </TouchableOpacity>
              {onFieldPlayers.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.playerOption,
                    selectedPlayer === getPlayerId(p) && styles.playerOptionSelected,
                  ]}
                  onPress={() => setSelectedPlayer(getPlayerId(p))}
                >
                  <Text style={styles.playerOptionText}>
                    #{getJerseyNumber(p)} {getPlayerName(p)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowEventModal(false);
                  setSelectedEventType(null);
                  setSelectedPlayer(null);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmButton, !selectedEventType && styles.buttonDisabled]}
                onPress={confirmEvent}
                disabled={!selectedEventType}
              >
                <Text style={styles.modalConfirmText}>Record Event</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Substitution Modal */}
      <Modal visible={showSubModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🔄 Substitution</Text>

            <Text style={[styles.modalLabel, { color: colors.error }]}>Player Out</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playerScroll}>
              <TouchableOpacity
                style={[styles.playerOption, !playerOut && styles.playerOptionSelected]}
                onPress={() => setPlayerOut(null)}
              >
                <Text style={styles.playerOptionText}>None (Add only)</Text>
              </TouchableOpacity>
              {onFieldPlayers.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.playerOption,
                    playerOut === getPlayerId(p) && { backgroundColor: colors.error },
                  ]}
                  onPress={() => setPlayerOut(getPlayerId(p))}
                >
                  <Text
                    style={[
                      styles.playerOptionText,
                      playerOut === getPlayerId(p) && { color: 'white' },
                    ]}
                  >
                    #{getJerseyNumber(p)} {getPlayerName(p)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.modalLabel, { color: colors.success }]}>Player In</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playerScroll}>
              {playersAvailableToSubIn.length === 0 ? (
                <Text style={{ color: colors.textMuted, padding: 10 }}>
                  No players available on bench
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {playersAvailableToSubIn.map((p) => (
                    <TouchableOpacity
                      key={`sub-in-${p.player_id || p.id}`}
                      style={[
                        styles.playerOption,
                        playerIn === p.player_id && { backgroundColor: colors.success },
                        !p.fromBench && {
                          borderWidth: 1,
                          borderColor: colors.warning,
                          borderStyle: 'dashed',
                        },
                      ]}
                      onPress={() => setPlayerIn(p.player_id)}
                    >
                      <Text
                        style={[
                          styles.playerOptionText,
                          playerIn === p.player_id && { color: 'white' },
                        ]}
                      >
                        #{p.jersey_number ?? '?'} {p.first_name}
                        {!p.fromBench && ' 🆕'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowSubModal(false);
                  setPlayerIn(null);
                  setPlayerOut(null);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmButton,
                  { backgroundColor: colors.success },
                  !playerIn && styles.buttonDisabled,
                ]}
                onPress={confirmSubstitution}
                disabled={!playerIn}
              >
                <Text style={styles.modalConfirmText}>Confirm Sub</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Transfer Modal */}
      <Modal visible={showTransfer} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Transfer Recording Control</Text>
            <Text style={styles.modalHint}>
              Select a parent to transfer stats recording to:
            </Text>

            {onlineParents.length > 0 ? (
              onlineParents.map((parent, index) => (
                <TouchableOpacity
                  key={`parent-${parent.user_id}-${index}`}
                  style={styles.parentOption}
                  onPress={() => handleTransfer(parent.user_id)}
                >
                  <Text style={styles.parentName}>{parent.full_name}</Text>
                  <View style={styles.onlineBadge}>
                    <Text style={styles.onlineBadgeText}>Online</Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.noParentsText}>No other parents online</Text>
            )}

            <TouchableOpacity style={styles.releaseButton} onPress={handleRelease}>
              <Text style={styles.releaseButtonText}>Stop Recording (Release Control)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowTransfer(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textMuted,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  transferButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  transferButtonText: {
    fontSize: 12,
    color: colors.text,
  },
  scoreCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'white',
    marginRight: 6,
  },
  liveBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  score: {
    fontSize: 40,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 8,
    marginTop: 6,
  },
  gameMinute: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    fontFamily: 'monospace',
  },
  periodText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  actionsContainer: {
    marginTop: 12,
    marginBottom: 0,
  },
  actionsRow1: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  actionsRow2: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  actionsRow2Spacer: {
    flex: 1,
  },
  actionBtn: {
    flex: 1,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  actionBtnFill: {
    borderWidth: 0,
  },
  actionBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  actionBtnIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  cardIconInner: {
    width: 28,
    height: 28,
    borderRadius: 4,
    marginBottom: 4,
  },
  actionBtnLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  gameFlowButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 12,
  },
  gameFlowButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.slate,
    marginBottom: 16,
    marginTop: 8,
  },
  undoButtonText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  cardHint: {
    fontSize: 11,
    color: colors.textMuted,
  },
  playersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  playerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: colors.muted,
    borderRadius: 8,
    width: '23%',
    minWidth: 72,
  },
  playerChipSelected: {
    backgroundColor: colors.primary + '30',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  playerChipContent: {
    flex: 1,
    minWidth: 0,
  },
  benchSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  benchTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 8,
  },
  benchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  benchChip: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: colors.background,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    width: '23%',
    minWidth: 72,
  },
  benchNumber: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600',
  },
  benchName: {
    fontSize: 11,
    color: colors.text,
  },
  playerNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerNumberText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  playerName: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text,
  },
  playerMeta: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 2,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    justifyContent: 'center',
    padding: 2,
  },
  toggleActive: {
    backgroundColor: colors.primary,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'white',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  possessionControl: {
    marginTop: 12,
  },
  possessionBarContainer: {
    marginBottom: 16,
  },
  possessionBar: {
    height: 16,
    borderRadius: 8,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  possessionHomeBar: {
    backgroundColor: colors.primary,
  },
  possessionAwayBar: {
    backgroundColor: colors.warning,
  },
  possessionLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  possessionLabelHome: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  possessionLabelAway: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.warning,
  },
  possessionPresets: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  possessionPreset: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.muted,
    borderRadius: 20,
  },
  possessionPresetActive: {
    backgroundColor: colors.primary,
  },
  possessionPresetText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
  },
  possessionPresetTextActive: {
    color: 'white',
  },
  possessionFineControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  possessionAdjustButton: {
    width: 44,
    height: 44,
    backgroundColor: colors.muted,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  possessionAdjustText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  possessionCenterDisplay: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  possessionCenterValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  possessionCenterLabel: {
    fontSize: 10,
    color: colors.textMuted,
  },
  playerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  goalCountBadge: {
    backgroundColor: colors.warning + '30',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  goalCountText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.warning,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalHint: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  playerScroll: {
    marginBottom: 8,
  },
  playerOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.muted,
    borderRadius: 8,
    marginRight: 8,
  },
  playerOptionSelected: {
    backgroundColor: colors.primary,
  },
  playerOptionText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  eventTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  eventTypeOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.muted,
    borderRadius: 6,
  },
  eventTypeSelected: {
    backgroundColor: colors.primary,
  },
  eventTypeText: {
    fontSize: 12,
    color: colors.text,
    textTransform: 'capitalize',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalCancelButton: {
    flex: 1,
    padding: 14,
    backgroundColor: colors.muted,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelText: {
    color: colors.text,
    fontWeight: '500',
  },
  modalConfirmButton: {
    flex: 1,
    padding: 14,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: 'white',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  parentOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: colors.muted,
    borderRadius: 8,
    marginBottom: 8,
  },
  parentName: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  onlineBadge: {
    backgroundColor: colors.success + '30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  onlineBadgeText: {
    fontSize: 11,
    color: colors.success,
    fontWeight: '600',
  },
  noParentsText: {
    textAlign: 'center',
    color: colors.textMuted,
    paddingVertical: 20,
  },
  releaseButton: {
    padding: 14,
    backgroundColor: colors.error,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  releaseButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});
