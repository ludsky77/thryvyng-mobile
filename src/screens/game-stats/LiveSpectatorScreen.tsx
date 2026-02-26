import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useLiveGameSession } from '../../hooks/useLiveGameSession';
import { gameStatsService } from '../../services/gameStatsService';
import { TeamHeader } from '../../components/game-stats/TeamHeader';
import { POSITIONS } from '../../types/game-stats';

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

type RouteParams = {
  LiveSpectator: {
    sessionId: string;
  };
};

export default function LiveSpectatorScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'LiveSpectator'>>();
  const { sessionId } = route.params;

  const { session, lineup, timeline, isLoading, claimStatsKeeper } =
    useLiveGameSession(sessionId);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  if (isLoading || !session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading game...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const onFieldPlayers = lineup.filter((l) => l.is_currently_on_field);
  const possessionHome = session.possession_home ?? 50;

  const teamShots = timeline.filter(
    (e) => e.event_type === 'shot' && !e.is_opponent_event
  ).length;
  const teamCorners = timeline.filter(
    (e) => e.event_type === 'corner' && !e.is_opponent_event
  ).length;
  const teamFouls = timeline.filter(
    (e) => e.event_type === 'foul' && !e.is_opponent_event
  ).length;

  const getEventIcon = (type: string) => {
    const icons: Record<string, string> = {
      goal: '⚽',
      penalty_goal: '⚽',
      own_goal: '🥅',
      yellow_card: '🟨',
      red_card: '🟥',
      substitution: '🔄',
      shot: '🎯',
      corner: '📐',
      foul: '⚠️',
      save: '🧤',
      kickoff: '▶️',
      halftime: '⏸️',
      fulltime: '🏁',
    };
    return icons[type] || '•';
  };

  const getJerseyNumber = (p: (typeof lineup)[0]) =>
    p.jersey_number ?? p.player?.jersey_number ?? p.guest_jersey_number ?? '?';
  const getPlayerName = (p: (typeof lineup)[0]) =>
    p.player?.first_name ?? p.guest_player_name?.split(' ')[0] ?? '?';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Live Match</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Score Card */}
        <View style={styles.scoreCard}>
          <Animated.View style={[styles.liveBadge, { opacity: pulseAnim }]}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </Animated.View>

          <Text style={styles.score}>
            {session.home_score} - {session.away_score}
          </Text>

          <TeamHeader
            teamName={session.team?.name}
            clubLogoUrl={session.team?.club?.logo_url}
            opponentName={session.opponent_name ?? undefined}
            isHome={session.is_home_team}
            size="large"
          />

          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              {session.status === 'halftime'
                ? 'Halftime'
                : session.status === 'first_half'
                  ? '1st Half'
                  : session.status === 'second_half'
                    ? '2nd Half'
                    : session.status}
            </Text>
          </View>

          {!session.stats_keeper_id && (
            <TouchableOpacity
              style={styles.claimButton}
              onPress={async () => {
                const ok = await claimStatsKeeper();
                if (ok) navigation.navigate('StatsConsole', { sessionId });
              }}
            >
              <Text style={styles.claimButtonText}>Start Recording</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <StatBox label="Possession" value={`${possessionHome}%`} />
          <StatBox label="Shots" value={teamShots.toString()} />
          <StatBox label="Corners" value={teamCorners.toString()} />
          <StatBox label="Fouls" value={teamFouls.toString()} />
        </View>

        {/* Possession Bar */}
        <View style={styles.card}>
          <View style={styles.possessionHeader}>
            <Text style={styles.possessionLabel}>Home {possessionHome}%</Text>
            <Text style={styles.possessionTitle}>Possession</Text>
            <Text style={styles.possessionLabel}>
              {100 - possessionHome}% Away
            </Text>
          </View>
          <View style={styles.possessionBar}>
            <View style={[styles.possessionHome, { flex: possessionHome }]} />
            <View
              style={[styles.possessionAway, { flex: 100 - possessionHome }]}
            />
          </View>
        </View>

        {/* On Field */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>On Field ({onFieldPlayers.length})</Text>
          <View style={styles.playersWrap}>
            {onFieldPlayers.map((p) => (
              <View key={p.id} style={styles.playerChip}>
                <View
                  style={[
                    styles.playerNumber,
                    {
                      backgroundColor:
                        POSITIONS.find((pos) => pos.id === p.position)?.color ||
                        colors.border,
                    },
                  ]}
                >
                  <Text style={styles.playerNumberText}>
                    {getJerseyNumber(p)}
                  </Text>
                </View>
                <Text style={styles.playerName}>{getPlayerName(p)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Match Timeline - With Scorer & Assist */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Match Timeline</Text>
          {timeline.length === 0 ? (
            <Text style={styles.noEvents}>No events yet</Text>
          ) : (
            <View style={styles.timeline}>
              {timeline.slice(0, 15).map((event) => {
                const isGoal = ['goal', 'penalty_goal'].includes(
                  event.event_type
                );
                const isOpponentGoal = isGoal && event.is_opponent_event;
                const isTeamGoal = isGoal && !event.is_opponent_event;
                const ev = event as any;

                return (
                  <TouchableOpacity
                    key={event.id}
                    style={[
                      styles.timelineEvent,
                      isTeamGoal && styles.timelineEventTeamGoal,
                      isOpponentGoal && styles.timelineEventOpponentGoal,
                    ]}
                    onLongPress={() => {
                      Alert.alert(
                        'Delete Event?',
                        `Remove: ${event.game_minute}' ${event.event_type.replace('_', ' ')}`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                await gameStatsService.deleteEvent(event.id, sessionId);
                                // Refetch will happen via real-time subscription
                              } catch (e) {
                                Alert.alert('Error', 'Failed to delete event');
                              }
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <View
                      style={[
                        styles.eventIconContainer,
                        isTeamGoal && styles.eventIconTeamGoal,
                        isOpponentGoal && styles.eventIconOpponentGoal,
                      ]}
                    >
                      <Text style={styles.eventIcon}>
                        {getEventIcon(event.event_type)}
                      </Text>
                    </View>

                    <View style={styles.eventContent}>
                      <View style={styles.eventHeader}>
                        <Text style={styles.eventMinute}>
                          {event.game_minute}'
                        </Text>
                        <Text
                          style={[
                            styles.eventType,
                            isOpponentGoal && styles.eventTypeOpponent,
                          ]}
                        >
                          {isOpponentGoal
                            ? 'Opponent Goal'
                            : event.event_type.replace('_', ' ')}
                        </Text>
                      </View>

                      {/* Show scorer for team goals - flat fields from RPC */}
                      {isTeamGoal &&
                        (ev.player_first_name || ev.player?.first_name) && (
                          <View style={styles.goalDetails}>
                            <Text style={styles.scorerName}>
                              ⚽ #{ev.player_number ?? ev.player?.jersey_number ?? '?'}{' '}
                              {ev.player_first_name ?? ev.player?.first_name}{' '}
                              {ev.player_last_name ?? ev.player?.last_name}
                            </Text>
                            {(ev.secondary_player_first_name ||
                              ev.secondary_player?.first_name) && (
                              <Text style={styles.assistName}>
                                🅰️ #{ev.secondary_player_number ?? ev.secondary_player?.jersey_number ?? '?'}{' '}
                                {ev.secondary_player_first_name ??
                                  ev.secondary_player?.first_name}
                              </Text>
                            )}
                          </View>
                        )}

                      {/* For non-goal events with a player */}
                      {!isGoal &&
                        (ev.player_first_name || ev.player) && (
                          <Text style={styles.eventPlayer}>
                            #{ev.player_number ?? ev.player?.jersey_number ?? '?'}{' '}
                            {ev.player_first_name ?? ev.player?.first_name}{' '}
                            {ev.player_last_name ?? ev.player?.last_name}
                          </Text>
                        )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  scoreCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.primary + '40',
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
  matchup: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 8,
  },
  score: {
    fontSize: 56,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  statusBadge: {
    backgroundColor: colors.muted,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  claimButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  claimButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  statLabel: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  possessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  possessionTitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  possessionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  possessionBar: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  possessionHome: {
    backgroundColor: colors.primary,
  },
  possessionAway: {
    backgroundColor: colors.warning,
  },
  playersWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  playerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.muted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  playerNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerNumberText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
  },
  playerName: {
    fontSize: 13,
    color: colors.text,
  },
  noEvents: {
    textAlign: 'center',
    color: colors.textMuted,
    paddingVertical: 32,
  },
  timeline: {
    gap: 8,
  },
  timelineEvent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 8,
    backgroundColor: colors.muted,
    borderRadius: 8,
  },
  timelineEventTeamGoal: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderLeftWidth: 4,
    borderLeftColor: '#22c55e',
  },
  timelineEventOpponentGoal: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  eventIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventIconTeamGoal: {
    backgroundColor: 'rgba(34, 197, 94, 0.3)',
  },
  eventIconOpponentGoal: {
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
  },
  eventIcon: {
    fontSize: 18,
  },
  eventContent: {
    flex: 1,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventMinute: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    fontFamily: 'monospace',
  },
  eventType: {
    fontSize: 13,
    color: colors.text,
    textTransform: 'capitalize',
  },
  eventTypeOpponent: {
    color: '#ef4444',
    fontWeight: '600',
  },
  goalDetails: {
    marginTop: 4,
  },
  scorerName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  assistName: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  eventPlayer: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  opponentBadge: {
    backgroundColor: colors.textMuted + '30',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  opponentBadgeText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
