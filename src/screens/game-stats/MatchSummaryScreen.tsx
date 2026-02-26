import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useLiveGameSession } from '../../hooks/useLiveGameSession';
import { gameStatsService } from '../../services/gameStatsService';
import { TeamHeader } from '../../components/game-stats/TeamHeader';
import {
  POSITIONS,
  type MVPVoteType,
  type PlayerLine,
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
  muted: '#374151',
};

type RouteParams = {
  MatchSummary: {
    sessionId: string;
  };
};

interface MVPResultItem {
  player_id: string;
  jersey_number: number | null;
  player_name: string;
  vote_count: number;
}

interface MVPResults {
  individual?: MVPResultItem[];
}

export default function MatchSummaryScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'MatchSummary'>>();
  const { sessionId } = route.params;

  const { session, lineup, timeline } = useLiveGameSession(sessionId);

  const [voteType, setVoteType] = useState<MVPVoteType>('individual');
  const [selectedPlayers, setSelectedPlayers] = useState<
    { rank: number; playerId: string }[]
  >([]);
  const [selectedGroup, setSelectedGroup] = useState<PlayerLine | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [results, setResults] = useState<MVPResults | null>(null);
  const [voteSubmitting, setVoteSubmitting] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await gameStatsService.getGameSummary(sessionId);
      setSummary(data);
    } catch (err) {
      console.error('[MatchSummary] Error fetching summary:', err);
    }
  }, [sessionId]);

  const fetchResults = useCallback(async () => {
    try {
      const data = await gameStatsService.getMVPResults(sessionId);
      setResults(data as MVPResults);
    } catch (err) {
      console.error('[MatchSummary] Error fetching MVP results:', err);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSummary();
    fetchResults();
  }, [fetchSummary, fetchResults]);

  useEffect(() => {
    if (!session?.mvp_voting_open) return;
    const interval = setInterval(fetchResults, 5000);
    return () => clearInterval(interval);
  }, [session?.mvp_voting_open, fetchResults]);

  const submitVote = useCallback(async () => {
    setVoteSubmitting(true);
    try {
      if (voteType === 'individual') {
        for (const vote of selectedPlayers) {
          await gameStatsService.castMVPVote({
            gameSessionId: sessionId,
            voteType: 'individual',
            playerId: vote.playerId,
            rank: vote.rank,
          });
        }
      } else if (voteType === 'group' && selectedGroup) {
        await gameStatsService.castMVPVote({
          gameSessionId: sessionId,
          voteType: 'group',
          groupName: selectedGroup,
        });
      } else if (voteType === 'team') {
        await gameStatsService.castMVPVote({
          gameSessionId: sessionId,
          voteType: 'team',
        });
      }
      setHasVoted(true);
      Alert.alert('🏆 Vote Submitted!', 'Thanks for voting!');
      await fetchResults();
    } catch (err) {
      console.error('[MatchSummary] Vote error:', err);
      Alert.alert('Error', 'Failed to submit vote');
    } finally {
      setVoteSubmitting(false);
    }
  }, [
    voteType,
    selectedPlayers,
    selectedGroup,
    sessionId,
    fetchResults,
  ]);

  // Show all players in lineup who have a player_id (not guests without player_id)
  // OR show starters, OR show anyone who was on field
  const playersWhoPlayed = lineup.filter(
    (l) => l.player_id && (l.is_starter || l.is_currently_on_field || (l.total_minutes_played ?? 0) >= 0)
  );

  const handlePlayerSelect = (rank: number, playerId: string) => {
    const newSelection = selectedPlayers.filter(
      (s) => s.rank !== rank && s.playerId !== playerId
    );
    newSelection.push({ rank, playerId });
    setSelectedPlayers(newSelection.sort((a, b) => a.rank - b.rank));
  };

  const getPlayerForRank = (rank: number) => {
    return selectedPlayers.find((s) => s.rank === rank)?.playerId;
  };

  const canSubmit = () => {
    if (voteType === 'individual') return selectedPlayers.length >= 1;
    if (voteType === 'group') return selectedGroup !== null;
    return true;
  };

  const getPlayerStats = (playerId: string) => {
    const goals = timeline.filter(
      (e) =>
        ['goal', 'penalty_goal'].includes(e.event_type) &&
        e.player_id === playerId
    ).length;
    const assists = timeline.filter(
      (e) =>
        ['goal', 'penalty_goal'].includes(e.event_type) &&
        e.secondary_player_id === playerId
    ).length;
    return { goals, assists };
  };

  const getJerseyNumber = (p: (typeof lineup)[0]) =>
    p.jersey_number ?? p.player?.jersey_number ?? p.guest_jersey_number ?? '?';

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.popToTop();
              } else {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Main' }],
                });
              }
            }}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Match Summary</Text>
          <TouchableOpacity>
            <Ionicons name="share-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Final Score */}
        <View style={styles.scoreCard}>
          <View style={styles.fullTimeBadge}>
            <Text style={styles.fullTimeBadgeText}>FULL TIME</Text>
          </View>
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
        </View>

        {/* MVP Voting */}
        {session.mvp_voting_open && !hasVoted && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="trophy" size={20} color={colors.warning} />
              <Text style={styles.cardTitle}>Vote for MVP</Text>
            </View>

            {/* Vote Type */}
            <View style={styles.voteTypeRow}>
              <TouchableOpacity
                style={[
                  styles.voteTypeButton,
                  voteType === 'individual' && styles.voteTypeActive,
                ]}
                onPress={() => setVoteType('individual')}
              >
                <Ionicons
                  name="star"
                  size={16}
                  color={voteType === 'individual' ? 'white' : colors.text}
                />
                <Text
                  style={[
                    styles.voteTypeText,
                    voteType === 'individual' && styles.voteTypeTextActive,
                  ]}
                >
                  Individual
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.voteTypeButton,
                  voteType === 'group' && styles.voteTypeActive,
                ]}
                onPress={() => setVoteType('group')}
              >
                <Ionicons
                  name="people"
                  size={16}
                  color={voteType === 'group' ? 'white' : colors.text}
                />
                <Text
                  style={[
                    styles.voteTypeText,
                    voteType === 'group' && styles.voteTypeTextActive,
                  ]}
                >
                  Group
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.voteTypeButton,
                  voteType === 'team' && styles.voteTypeActive,
                ]}
                onPress={() => setVoteType('team')}
              >
                <Ionicons
                  name="shirt"
                  size={16}
                  color={voteType === 'team' ? 'white' : colors.text}
                />
                <Text
                  style={[
                    styles.voteTypeText,
                    voteType === 'team' && styles.voteTypeTextActive,
                  ]}
                >
                  Team
                </Text>
              </TouchableOpacity>
            </View>

            {/* Individual Selection */}
            {voteType === 'individual' && (
              <View style={styles.individualVoting}>
                {[1, 2, 3].map((rank) => (
                  <View key={rank} style={styles.rankSection}>
                    <Text style={styles.rankLabel}>
                      {rank === 1
                        ? '🥇 1st (50 XP)'
                        : rank === 2
                          ? '🥈 2nd (30 XP)'
                          : '🥉 3rd (20 XP)'}
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.playerScroll}
                    >
                      <View style={styles.playersRow}>
                        {playersWhoPlayed.map((p) => {
                          const isSelected = getPlayerForRank(rank) === p.player_id;
                          const isSelectedElsewhere = selectedPlayers.some(
                            (s) => s.playerId === p.player_id && s.rank !== rank
                          );
                          const jerseyNum = p.jersey_number || p.player?.jersey_number || p.guest_jersey_number || '?';
                          const playerName = p.player?.first_name || p.guest_player_name?.split(' ')[0] || 'Player';

                          return (
                            <TouchableOpacity
                              key={p.id}
                              style={[
                                styles.playerVoteChip,
                                isSelected && styles.playerVoteChipSelected,
                                isSelectedElsewhere && styles.playerVoteChipDisabled,
                              ]}
                              onPress={() => !isSelectedElsewhere && handlePlayerSelect(rank, p.player_id!)}
                              disabled={isSelectedElsewhere}
                            >
                              <Text
                                style={[
                                  styles.playerVoteText,
                                  isSelected && styles.playerVoteTextSelected,
                                ]}
                              >
                                #{jerseyNum} {playerName}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                ))}
              </View>
            )}

            {/* Group Selection */}
            {voteType === 'group' && (
              <View style={styles.groupVoting}>
                {(['defense', 'midfield', 'forward'] as PlayerLine[]).map(
                  (group) => {
                    const count = playersWhoPlayed.filter(
                      (p) => p.player_line === group
                    ).length;
                    return (
                      <TouchableOpacity
                        key={group}
                        style={[
                          styles.groupButton,
                          selectedGroup === group &&
                            styles.groupButtonSelected,
                        ]}
                        onPress={() => setSelectedGroup(group)}
                      >
                        <Text
                          style={[
                            styles.groupName,
                            selectedGroup === group &&
                              styles.groupNameSelected,
                          ]}
                        >
                          {group}
                        </Text>
                        <Text style={styles.groupCount}>{count} players</Text>
                      </TouchableOpacity>
                    );
                  }
                )}
              </View>
            )}

            {/* Team Selection */}
            {voteType === 'team' && (
              <View style={styles.teamVoting}>
                <Ionicons name="people" size={32} color={colors.success} />
                <Text style={styles.teamVotingTitle}>
                  Everyone played great!
                </Text>
                <Text style={styles.teamVotingSubtitle}>
                  XP split equally among all players
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.submitVoteButton,
                !canSubmit() && styles.submitVoteButtonDisabled,
              ]}
              onPress={submitVote}
              disabled={!canSubmit() || voteSubmitting}
            >
              <Text style={styles.submitVoteText}>
                {voteSubmitting ? 'Submitting...' : 'Submit Vote'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* MVP Results */}
        {(hasVoted || !session.mvp_voting_open) && results?.individual && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="trophy" size={20} color={colors.warning} />
              <Text style={styles.cardTitle}>MVP Results</Text>
            </View>
            {results.individual.slice(0, 3).map((r, idx) => (
              <View key={r.player_id} style={styles.resultRow}>
                <View
                  style={[
                    styles.rankCircle,
                    {
                      backgroundColor:
                        idx === 0 ? '#f59e0b' : idx === 1 ? '#9ca3af' : '#b45309',
                    },
                  ]}
                >
                  <Text style={styles.rankCircleText}>{idx + 1}</Text>
                </View>
                <Text style={styles.resultName}>
                  #{r.jersey_number} {r.player_name}
                </Text>
                <View style={styles.voteBadge}>
                  <Text style={styles.voteBadgeText}>
                    {r.vote_count} votes
                  </Text>
                </View>
              </View>
            ))}
            {hasVoted && (
              <View style={styles.votedConfirm}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={colors.success}
                />
                <Text style={styles.votedConfirmText}>
                  Your vote has been recorded
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Player Performance */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="people" size={20} color={colors.text} />
            <Text style={styles.cardTitle}>Player Performance</Text>
          </View>
          {lineup
            .filter((l) => l.total_minutes_played > 0)
            .sort((a, b) => b.total_minutes_played - a.total_minutes_played)
            .map((p) => {
              const stats = p.player_id
                ? getPlayerStats(p.player_id)
                : { goals: 0, assists: 0 };
              return (
                <View key={p.id} style={styles.playerPerfRow}>
                  <View
                    style={[
                      styles.playerPerfNumber,
                      {
                        backgroundColor:
                          POSITIONS.find((pos) => pos.id === p.position)
                            ?.color || colors.border,
                      },
                    ]}
                  >
                    <Text style={styles.playerPerfNumberText}>
                      {getJerseyNumber(p)}
                    </Text>
                  </View>
                  <View style={styles.playerPerfInfo}>
                    <Text style={styles.playerPerfName}>
                      {p.player?.first_name} {p.player?.last_name}
                      {p.guest_player_name && !p.player
                        ? ` ${p.guest_player_name}`
                        : ''}
                    </Text>
                    <Text style={styles.playerPerfMeta}>
                      {p.position || '-'}
                    </Text>
                  </View>
                  <View style={styles.playerPerfStats}>
                    <View style={styles.playerPerfStat}>
                      <Ionicons
                        name="time-outline"
                        size={12}
                        color={colors.textMuted}
                      />
                      <Text style={styles.playerPerfStatText}>
                        {p.total_minutes_played}'
                      </Text>
                    </View>
                    {stats.goals > 0 && (
                      <View style={styles.goalBadge}>
                        <Text style={styles.goalBadgeText}>
                          ⚽ {stats.goals}
                        </Text>
                      </View>
                    )}
                    {stats.assists > 0 && (
                      <View style={styles.assistBadge}>
                        <Text style={styles.assistBadgeText}>
                          🅰️ {stats.assists}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
        </View>

        {/* Resume Game Button - for mistakes or PKs */}
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: 14,
            backgroundColor: colors.muted,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.warning,
            marginBottom: 12,
          }}
          onPress={() => {
            Alert.alert(
              'Resume Game?',
              'This will reopen the game for continued recording. Use this if:\n\n• Game ended by mistake\n• Match went to penalty kicks\n• Extra time needed',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Resume Game',
                  onPress: async () => {
                    try {
                      await gameStatsService.reopenGame(sessionId);
                      navigation.replace('StatsConsole', { sessionId });
                    } catch (e: any) {
                      Alert.alert('Error', e?.message || 'Failed to resume game');
                    }
                  },
                },
              ]
            );
          }}
        >
          <Ionicons name="play-circle-outline" size={20} color={colors.warning} />
          <Text style={{ color: colors.warning, fontSize: 14, fontWeight: '500' }}>
            Resume Game (PKs / Extra Time)
          </Text>
        </TouchableOpacity>

        {/* Done Button */}
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.popToTop();
            } else {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Main' }],
              });
            }
          }}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  loadingText: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 100,
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
    borderColor: colors.border,
  },
  fullTimeBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  fullTimeBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  score: {
    fontSize: 56,
    fontWeight: 'bold',
    color: colors.text,
  },
  matchup: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
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
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  voteTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  voteTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: colors.muted,
    borderRadius: 8,
  },
  voteTypeActive: {
    backgroundColor: colors.primary,
  },
  voteTypeText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  voteTypeTextActive: {
    color: 'white',
  },
  individualVoting: {
    gap: 16,
  },
  rankSection: {
    gap: 8,
  },
  rankLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  playerScroll: {
    marginBottom: 8,
  },
  playersRow: {
    flexDirection: 'row',
    gap: 8,
  },
  playerVoteChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.muted,
    borderRadius: 20,
  },
  playerVoteChipSelected: {
    backgroundColor: colors.primary,
  },
  playerVoteChipDisabled: {
    opacity: 0.4,
  },
  playerVoteText: {
    fontSize: 13,
    color: colors.text,
  },
  playerVoteTextSelected: {
    color: 'white',
    fontWeight: '600',
  },
  groupVoting: {
    flexDirection: 'row',
    gap: 8,
  },
  groupButton: {
    flex: 1,
    paddingVertical: 16,
    backgroundColor: colors.muted,
    borderRadius: 12,
    alignItems: 'center',
  },
  groupButtonSelected: {
    backgroundColor: colors.primary,
  },
  groupName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textTransform: 'capitalize',
  },
  groupNameSelected: {
    color: 'white',
  },
  groupCount: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  teamVoting: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: colors.muted,
    borderRadius: 12,
  },
  teamVotingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 8,
  },
  teamVotingSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  submitVoteButton: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  submitVoteButtonDisabled: {
    opacity: 0.5,
  },
  submitVoteText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    backgroundColor: colors.muted,
    borderRadius: 8,
    marginBottom: 8,
  },
  rankCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankCircleText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  resultName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  voteBadge: {
    backgroundColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  voteBadgeText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  votedConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  votedConfirmText: {
    fontSize: 13,
    color: colors.success,
  },
  playerPerfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  playerPerfNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerPerfNumberText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  playerPerfInfo: {
    flex: 1,
  },
  playerPerfName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  playerPerfMeta: {
    fontSize: 11,
    color: colors.textMuted,
  },
  playerPerfStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerPerfStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playerPerfStatText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  goalBadge: {
    backgroundColor: colors.warning + '30',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  goalBadgeText: {
    fontSize: 11,
  },
  assistBadge: {
    backgroundColor: colors.primary + '30',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  assistBadgeText: {
    fontSize: 11,
  },
  doneButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
