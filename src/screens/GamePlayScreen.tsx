import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useGameSession } from '../hooks/useGameSession';
import FieldVisionGame from '../components/games/FieldVisionGame';
import PatternPlayGame from '../components/games/PatternPlayGame';
import DecisionPointGame from '../components/games/DecisionPointGame';
import AnticipationArenaGame from '../components/games/AnticipationArenaGame';
import PressureProtocolGame from '../components/games/PressureProtocolGame';
import DribbleRushGame from '../components/games/DribbleRushGame';
import AngleMasterGame from '../components/games/AngleMasterGame';
import type { GameResult, FieldVisionConfig, PatternPlayConfig, DecisionPointConfig, AnticipationConfig, PressureConfig, DribbleRushConfig, AngleMasterConfig } from '../types/games';

interface GamePlayScreenProps {
  navigation: any;
  route: {
    params: {
      gameId: string;
      gameSlug: string;
      gameName: string;
    };
  };
}

export default function GamePlayScreen({ navigation, route }: GamePlayScreenProps) {
  const { gameId, gameSlug, gameName } = route.params;

  const {
    levels,
    currentLevel,
    loading,
    saving,
    fetchLevels,
    selectLevel,
    recordSession,
  } = useGameSession({ gameId, gameSlug });

  const [showLevelSelect, setShowLevelSelect] = useState(true);
  const [gameComplete, setGameComplete] = useState(false);
  const [lastResult, setLastResult] = useState<GameResult | null>(null);

  useEffect(() => {
    fetchLevels();
  }, [fetchLevels]);

  const handleGameComplete = async (result: GameResult, durationSeconds: number) => {
    setLastResult(result);
    setGameComplete(true);

    const success = await recordSession(result, durationSeconds);
    if (!success) {
      Alert.alert('Error', 'Failed to save your progress. Please try again.');
    }
  };

  const handleQuit = () => {
    Alert.alert(
      'Quit Game',
      'Are you sure you want to quit? Your progress for this session will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Quit', style: 'destructive', onPress: () => navigation.goBack() },
      ]
    );
  };

  const handlePlayAgain = () => {
    setGameComplete(false);
    setLastResult(null);
    setShowLevelSelect(true);
  };

  const handleNextLevel = () => {
    if (currentLevel && currentLevel.level_number < levels.length) {
      selectLevel(currentLevel.level_number + 1);
      setGameComplete(false);
      setLastResult(null);
      setShowLevelSelect(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Loading {gameName}...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Game complete screen
  if (gameComplete && lastResult) {
    const canAdvance = lastResult.levelCompleted && currentLevel && currentLevel.level_number < levels.length;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.completeContainer}>
          <View style={styles.completeIcon}>
            <Feather
              name={lastResult.levelCompleted ? 'award' : 'target'}
              size={48}
              color={lastResult.levelCompleted ? '#10b981' : '#f59e0b'}
            />
          </View>

          <Text style={styles.completeTitle}>
            {lastResult.isPerfect
              ? '🎉 Perfect!'
              : lastResult.levelCompleted
              ? 'Level Complete!'
              : 'Good Effort!'}
          </Text>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{lastResult.score}%</Text>
              <Text style={styles.statLabel}>Score</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>+{lastResult.xpEarned}</Text>
              <Text style={styles.statLabel}>XP Earned</Text>
            </View>
          </View>

          {lastResult.levelCompleted ? (
            <Text style={styles.unlockText}>
              {canAdvance
                ? `Level ${currentLevel!.level_number + 1} unlocked!`
                : 'All levels completed!'}
            </Text>
          ) : (
            <Text style={styles.tipText}>
              Score 70% or higher to complete the level
            </Text>
          )}

          {saving && (
            <View style={styles.savingIndicator}>
              <ActivityIndicator size="small" color="#8b5cf6" />
              <Text style={styles.savingText}>Saving progress...</Text>
            </View>
          )}

          <View style={styles.completeActions}>
            {canAdvance && (
              <TouchableOpacity style={styles.primaryButton} onPress={handleNextLevel}>
                <Text style={styles.primaryButtonText}>Next Level</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.secondaryButton, canAdvance && styles.secondaryButtonSmall]}
              onPress={handlePlayAgain}
            >
              <Text style={styles.secondaryButtonText}>Play Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
              <Text style={styles.backLinkText}>Back to Games</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Level select screen
  if (showLevelSelect) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{gameName}</Text>
          <View style={styles.headerRight} />
        </View>

        <View style={styles.levelSelectContainer}>
          <Text style={styles.selectTitle}>Select Level</Text>

          <View style={styles.levelsGrid}>
            {levels.map((level) => {
              const isSelected = currentLevel?.id === level.id;
              return (
                <TouchableOpacity
                  key={level.id}
                  style={[styles.levelCard, isSelected && styles.levelCardSelected]}
                  onPress={() => selectLevel(level.level_number)}
                >
                  <Text style={[styles.levelNumber, isSelected && styles.levelNumberSelected]}>
                    {level.level_number}
                  </Text>
                  <Text style={styles.levelXp}>+{level.xp_reward} XP</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {currentLevel && (
            <View style={styles.levelDetails}>
              <Text style={styles.levelDetailsTitle}>Level {currentLevel.level_number}</Text>
              <View style={styles.levelConfig}>
                {gameSlug === 'pattern-play' ? (
                  <>
                    <Text style={styles.configItem}>
                      🔢 {(currentLevel.config as PatternPlayConfig).patternLength} passes
                    </Text>
                    <Text style={styles.configItem}>
                      ⏱️ {(currentLevel.config as PatternPlayConfig).showDuration}ms each
                    </Text>
                  </>
                ) : gameSlug === 'decision-point' ? (
                  <>
                    <Text style={styles.configItem}>
                      ⏱️ {(currentLevel.config as DecisionPointConfig).timeLimit / 1000}s per decision
                    </Text>
                    <Text style={styles.configItem}>
                      📊 {(currentLevel.config as DecisionPointConfig).scenarioComplexity}
                    </Text>
                  </>
                ) : gameSlug === 'anticipation-arena' ? (
                  <>
                    <Text style={styles.configItem}>
                      ⚡ {(currentLevel.config as AnticipationConfig).ballSpeed}x speed
                    </Text>
                    <Text style={styles.configItem}>
                      ⏱️ {(currentLevel.config as AnticipationConfig).predictionTime / 1000}s to predict
                    </Text>
                  </>
                ) : gameSlug === 'pressure-protocol' ? (
                  <>
                    <Text style={styles.configItem}>
                      ⏱️ {(currentLevel.config as PressureConfig).timeLimit / 1000}s
                    </Text>
                    <Text style={styles.configItem}>
                      🎯 {(currentLevel.config as PressureConfig).taskType}
                    </Text>
                    <Text style={styles.configItem}>
                      😵 Distraction: {(currentLevel.config as PressureConfig).distractionLevel}
                    </Text>
                  </>
                ) : gameSlug === 'dribble-rush' ? (
                  <>
                    <Text style={styles.configItem}>
                      🏃 {(currentLevel.config as DribbleRushConfig).distanceTarget}m
                    </Text>
                    <Text style={styles.configItem}>
                      ⚡ {(currentLevel.config as DribbleRushConfig).baseSpeed}x speed
                    </Text>
                    <Text style={styles.configItem}>
                      🛡️ Pass: {(currentLevel.config as DribbleRushConfig).passThreshold}%
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.configItem}>
                      👥 {(currentLevel.config as FieldVisionConfig).players} players
                    </Text>
                    <Text style={styles.configItem}>
                      🎯 {(currentLevel.config as FieldVisionConfig).targets} targets
                    </Text>
                    <Text style={styles.configItem}>
                      ⏱️ {(currentLevel.config as FieldVisionConfig).duration / 1000}s
                    </Text>
                  </>
                )}
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.playButton, !currentLevel && styles.playButtonDisabled]}
            onPress={() => currentLevel && setShowLevelSelect(false)}
            disabled={!currentLevel}
          >
            <Feather name="play" size={20} color="#fff" />
            <Text style={styles.playButtonText}>Play Level {currentLevel?.level_number ?? '—'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Dribble Rush game
  if (gameSlug === 'dribble-rush' && currentLevel) {
    return (
      <SafeAreaView style={styles.container}>
        <DribbleRushGame
          config={currentLevel.config as DribbleRushConfig}
          levelNumber={currentLevel.level_number}
          xpReward={currentLevel.xp_reward}
          onComplete={handleGameComplete}
          onQuit={handleQuit}
        />
      </SafeAreaView>
    );
  }

  // Render the actual game based on slug
  if (gameSlug === 'field-vision' && currentLevel) {
    return (
      <SafeAreaView style={styles.container}>
        <FieldVisionGame
          config={currentLevel.config as FieldVisionConfig}
          levelNumber={currentLevel.level_number}
          xpReward={currentLevel.xp_reward}
          onComplete={handleGameComplete}
          onQuit={handleQuit}
        />
      </SafeAreaView>
    );
  }

  // Pattern Play game
  if (gameSlug === 'pattern-play' && currentLevel) {
    return (
      <SafeAreaView style={styles.container}>
        <PatternPlayGame
          config={currentLevel.config as PatternPlayConfig}
          levelNumber={currentLevel.level_number}
          xpReward={currentLevel.xp_reward}
          onComplete={handleGameComplete}
          onQuit={handleQuit}
        />
      </SafeAreaView>
    );
  }

  // Decision Point game
  if (gameSlug === 'decision-point' && currentLevel) {
    return (
      <SafeAreaView style={styles.container}>
        <DecisionPointGame
          config={currentLevel.config as DecisionPointConfig}
          levelNumber={currentLevel.level_number}
          xpReward={currentLevel.xp_reward}
          onComplete={handleGameComplete}
          onQuit={handleQuit}
        />
      </SafeAreaView>
    );
  }

  // Anticipation Arena game (spin_type from level column, not config)
  if (gameSlug === 'anticipation-arena' && currentLevel) {
    return (
      <SafeAreaView style={styles.container}>
        <AnticipationArenaGame
          config={currentLevel.config as AnticipationConfig}
          levelNumber={currentLevel.level_number}
          xpReward={currentLevel.xp_reward}
          spinType={currentLevel.spin_type ?? 'none'}
          trajectoryType={currentLevel.trajectory_type ?? 'linear'}
          onComplete={handleGameComplete}
          onQuit={handleQuit}
        />
      </SafeAreaView>
    );
  }

  // Pressure Protocol game
  if (gameSlug === 'pressure-protocol' && currentLevel) {
    return (
      <SafeAreaView style={styles.container}>
        <PressureProtocolGame
          config={currentLevel.config as PressureConfig}
          levelNumber={currentLevel.level_number}
          xpReward={currentLevel.xp_reward}
          onComplete={handleGameComplete}
          onQuit={handleQuit}
        />
      </SafeAreaView>
    );
  }

  // Angle Master game
  if (gameSlug === 'angle-master' && currentLevel) {
    return (
      <SafeAreaView style={styles.container}>
        <AngleMasterGame
          config={currentLevel.config as AngleMasterConfig}
          levelNumber={currentLevel.level_number}
          xpReward={currentLevel.xp_reward}
          onComplete={handleGameComplete}
          onQuit={handleQuit}
        />
      </SafeAreaView>
    );
  }

  // Placeholder for other games
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{gameName}</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.placeholderContainer}>
        <Feather name="tool" size={48} color="#8b5cf6" />
        <Text style={styles.placeholderTitle}>{gameName}</Text>
        <Text style={styles.placeholderText}>Coming soon!</Text>
        <TouchableOpacity style={styles.backButtonLarge} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonLargeText}>Back to Games</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  // Level select
  levelSelectContainer: {
    flex: 1,
    padding: 20,
  },
  selectTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
  },
  levelsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  levelCard: {
    width: 60,
    height: 70,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  levelCardSelected: {
    borderColor: '#8b5cf6',
    backgroundColor: '#2d1f54',
  },
  levelNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#94a3b8',
  },
  levelNumberSelected: {
    color: '#fff',
  },
  levelXp: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 4,
  },
  levelDetails: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  levelDetailsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  levelConfig: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  configItem: {
    color: '#94a3b8',
    fontSize: 14,
  },
  playButton: {
    backgroundColor: '#8b5cf6',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  playButtonDisabled: {
    opacity: 0.5,
  },
  playButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  // Complete screen
  completeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  completeIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  completeTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  statBox: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#8b5cf6',
  },
  statLabel: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  unlockText: {
    color: '#10b981',
    fontSize: 16,
    marginBottom: 24,
  },
  tipText: {
    color: '#f59e0b',
    fontSize: 14,
    marginBottom: 24,
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  savingText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  completeActions: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#1e293b',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonSmall: {
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backLink: {
    padding: 12,
    alignItems: 'center',
  },
  backLinkText: {
    color: '#64748b',
    fontSize: 14,
  },
  // Placeholder
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  placeholderText: {
    color: '#94a3b8',
    fontSize: 16,
    marginBottom: 32,
  },
  backButtonLarge: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  backButtonLargeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
