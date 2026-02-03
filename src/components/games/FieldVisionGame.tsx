import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import type { FieldVisionConfig, GameResult } from '../../types/games';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FIELD_WIDTH = SCREEN_WIDTH - 32;
const FIELD_HEIGHT = FIELD_WIDTH * 0.75;
const PLAYER_SIZE = 48;
const PADDING = PLAYER_SIZE / 2;

type GamePhase = 'ready' | 'memorize' | 'tracking' | 'select' | 'result';

interface PlayerData {
  id: number;
  isTarget: boolean;
  startX: number;
  startY: number;
}

interface AnimatedPlayerProps {
  player: PlayerData;
  phase: GamePhase;
  speed: number;
  duration: number;
  isSelected: boolean;
  showResult: boolean;
  onSelect: (id: number) => void;
}

// Single animated player component
function AnimatedPlayer({
  player,
  phase,
  speed,
  duration,
  isSelected,
  showResult,
  onSelect,
}: AnimatedPlayerProps) {
  const translateX = useSharedValue(player.startX);
  const translateY = useSharedValue(player.startY);
  const scale = useSharedValue(1);

  // Generate random movement path
  useEffect(() => {
    if (phase === 'tracking') {
      const moveDuration = duration / (speed * 2);
      const moveCount = Math.floor(duration / moveDuration);

      let currentX = player.startX;
      let currentY = player.startY;

      for (let i = 0; i < moveCount; i++) {
        const newX = PADDING + Math.random() * (FIELD_WIDTH - PLAYER_SIZE - PADDING * 2);
        const newY = PADDING + Math.random() * (FIELD_HEIGHT - PLAYER_SIZE - PADDING * 2);

        translateX.value = withDelay(
          i * moveDuration,
          withTiming(newX, {
            duration: moveDuration,
            easing: Easing.inOut(Easing.quad),
          })
        );
        translateY.value = withDelay(
          i * moveDuration,
          withTiming(newY, {
            duration: moveDuration,
            easing: Easing.inOut(Easing.quad),
          })
        );

        currentX = newX;
        currentY = newY;
      }
    }
  }, [phase, duration, speed, player.startX, player.startY]);

  // Pulse animation during memorize phase for targets
  useEffect(() => {
    if (phase === 'memorize' && player.isTarget) {
      scale.value = withSequence(
        withTiming(1.2, { duration: 300 }),
        withTiming(1, { duration: 300 }),
        withTiming(1.2, { duration: 300 }),
        withTiming(1, { duration: 300 })
      );
    }
  }, [phase, player.isTarget]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Determine player appearance based on phase
  const getPlayerColor = () => {
    if (phase === 'memorize' && player.isTarget) {
      return '#8b5cf6'; // Purple for targets during memorize
    }
    if (showResult) {
      if (player.isTarget && isSelected) return '#10b981'; // Green - correct
      if (player.isTarget && !isSelected) return '#ef4444'; // Red - missed
      if (!player.isTarget && isSelected) return '#f59e0b'; // Orange - wrong
      return '#475569'; // Gray - neutral
    }
    if (isSelected) {
      return '#8b5cf6'; // Purple when selected
    }
    return '#475569'; // Default gray
  };

  const getBorderColor = () => {
    if (phase === 'memorize' && player.isTarget) {
      return '#a78bfa';
    }
    if (isSelected) {
      return '#a78bfa';
    }
    return '#64748b';
  };

  const canSelect = phase === 'select' && !showResult;

  return (
    <Animated.View style={[styles.playerContainer, animatedStyle]}>
      <TouchableOpacity
        onPress={() => canSelect && onSelect(player.id)}
        disabled={!canSelect}
        activeOpacity={0.7}
        style={[
          styles.player,
          {
            backgroundColor: getPlayerColor(),
            borderColor: getBorderColor(),
          },
        ]}
      >
        <Feather
          name="user"
          size={20}
          color={phase === 'memorize' && player.isTarget ? '#fff' : '#94a3b8'}
        />
        {showResult && player.isTarget && (
          <View style={styles.targetIndicator}>
            <Feather
              name={isSelected ? 'check' : 'x'}
              size={12}
              color="#fff"
            />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// Main game component
interface FieldVisionGameProps {
  config: FieldVisionConfig;
  levelNumber: number;
  xpReward: number;
  onComplete: (result: GameResult, durationSeconds: number) => void;
  onQuit: () => void;
}

export default function FieldVisionGame({
  config,
  levelNumber,
  xpReward,
  onComplete,
  onQuit,
}: FieldVisionGameProps) {
  const { targets, players: totalPlayers, speed, duration } = config;

  const [phase, setPhase] = useState<GamePhase>('ready');
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [round, setRound] = useState(1);
  const [roundScores, setRoundScores] = useState<number[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [phaseTimer, setPhaseTimer] = useState(0);
  const [autoSubmitDue, setAutoSubmitDue] = useState(false);

  const startTimeRef = useRef<number>(0);
  const totalRounds = 3;

  // Initialize players with random positions
  const initializePlayers = useCallback(() => {
    const newPlayers: PlayerData[] = [];
    const targetIndices = new Set<number>();

    while (targetIndices.size < targets) {
      targetIndices.add(Math.floor(Math.random() * totalPlayers));
    }

    for (let i = 0; i < totalPlayers; i++) {
      newPlayers.push({
        id: i,
        isTarget: targetIndices.has(i),
        startX: PADDING + Math.random() * (FIELD_WIDTH - PLAYER_SIZE - PADDING * 2),
        startY: PADDING + Math.random() * (FIELD_HEIGHT - PLAYER_SIZE - PADDING * 2),
      });
    }

    setPlayers(newPlayers);
    setSelectedIds(new Set());
    setShowResult(false);
  }, [targets, totalPlayers]);

  // Start game
  const startGame = () => {
    startTimeRef.current = Date.now();
    setCountdown(3);
    setPhase('ready');

    // Countdown timer
    let count = 3;
    const countdownInterval = setInterval(() => {
      count--;
      setCountdown(count);
      if (count === 0) {
        clearInterval(countdownInterval);
        initializePlayers();
        setPhase('memorize');
      }
    }, 1000);
  };

  // Submit selection and calculate score
  const handleSubmitSelection = useCallback(() => {
    setShowResult(true);

    const targetIds = new Set(players.filter((p) => p.isTarget).map((p) => p.id));
    let correct = 0;
    selectedIds.forEach((id) => {
      if (targetIds.has(id)) correct++;
    });

    const roundScore = Math.round((correct / targets) * 100);
    setRoundScores((prev) => [...prev, roundScore]);

    // Move to result phase after showing
    setTimeout(() => {
      setPhase('result');
    }, 2000);
  }, [players, selectedIds, targets]);

  // When timer expires in select phase, trigger submit with current state
  useEffect(() => {
    if (autoSubmitDue && phase === 'select') {
      setAutoSubmitDue(false);
      handleSubmitSelection();
    }
  }, [autoSubmitDue, phase, handleSubmitSelection]);

  // Phase transitions
  useEffect(() => {
    if (phase === 'memorize') {
      setPhaseTimer(2);
      const timer = setTimeout(() => {
        setPhase('tracking');
      }, 2000);
      return () => clearTimeout(timer);
    }

    if (phase === 'tracking') {
      setPhaseTimer(Math.ceil(duration / 1000));
      const timer = setTimeout(() => {
        setPhase('select');
      }, duration);

      // Update timer display
      const interval = setInterval(() => {
        setPhaseTimer((prev) => Math.max(0, prev - 1));
      }, 1000);

      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }

    if (phase === 'select') {
      setPhaseTimer(10); // 10 seconds to select
      const interval = setInterval(() => {
        setPhaseTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setAutoSubmitDue(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [phase, duration]);

  // Handle player selection
  const handleSelectPlayer = (id: number) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else if (newSet.size < targets) {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Handle next round or complete game
  const handleNextRound = () => {
    if (round < totalRounds) {
      setRound((prev) => prev + 1);
      initializePlayers();
      setPhase('memorize');
    } else {
      // Calculate final results
      const avgScore = Math.round(
        roundScores.reduce((a, b) => a + b, 0) / roundScores.length
      );
      const accuracy = avgScore;
      const isPerfect = avgScore === 100;
      const xpEarned = isPerfect ? xpReward + 10 : Math.round((avgScore / 100) * xpReward);
      const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);

      const result: GameResult = {
        score: avgScore,
        accuracy,
        xpEarned,
        isPerfect,
        levelCompleted: avgScore >= 70,
        newHighScore: false, // Will be determined by hook
      };

      onComplete(result, durationSeconds);
    }
  };

  // Ready screen - countdown
  if (phase === 'ready' && countdown > 0) {
    return (
      <View style={styles.container}>
        <View style={styles.readyContainer}>
          <Text style={styles.levelText}>Level {levelNumber}</Text>
          <Text style={styles.instructionText}>
            Watch the highlighted players, then track them as they move
          </Text>
          <View style={styles.configInfo}>
            <Text style={styles.configText}>👥 {totalPlayers} players</Text>
            <Text style={styles.configText}>🎯 {targets} targets</Text>
            <Text style={styles.configText}>⏱️ {duration / 1000}s tracking</Text>
          </View>
          {countdown > 0 ? (
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownText}>{countdown}</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  // Initial ready state - Start button
  if (phase === 'ready') {
    return (
      <View style={styles.container}>
        <View style={styles.readyContainer}>
          <Text style={styles.titleText}>Field Vision</Text>
          <Text style={styles.levelText}>Level {levelNumber}</Text>
          <Text style={styles.instructionText}>
            Track the highlighted players as they move around the field
          </Text>
          <View style={styles.configInfo}>
            <Text style={styles.configText}>👥 {totalPlayers} players</Text>
            <Text style={styles.configText}>🎯 {targets} to track</Text>
            <Text style={styles.configText}>⏱️ {duration / 1000}s</Text>
          </View>
          <TouchableOpacity style={styles.startButton} onPress={startGame}>
            <Text style={styles.startButtonText}>Start Round {round}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quitButton} onPress={onQuit}>
            <Text style={styles.quitButtonText}>Quit</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Result screen
  if (phase === 'result') {
    const lastScore = roundScores[roundScores.length - 1];
    const isLastRound = round >= totalRounds;

    return (
      <View style={styles.container}>
        <View style={styles.resultContainer}>
          <Text style={styles.roundText}>Round {round} Complete!</Text>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreText}>{lastScore}%</Text>
          </View>
          <Text style={styles.scoreLabel}>
            {lastScore === 100 ? '🎉 Perfect!' : lastScore >= 70 ? '👍 Good job!' : '💪 Keep practicing!'}
          </Text>

          {roundScores.length > 1 && (
            <View style={styles.roundScores}>
              {roundScores.map((score, idx) => (
                <View key={idx} style={styles.roundScoreBadge}>
                  <Text style={styles.roundScoreText}>R{idx + 1}: {score}%</Text>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.nextButton} onPress={handleNextRound}>
            <Text style={styles.nextButtonText}>
              {isLastRound ? 'See Results' : `Next Round (${round + 1}/${totalRounds})`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Game field
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onQuit} style={styles.quitIconButton}>
          <Feather name="x" size={24} color="#94a3b8" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.phaseText}>
            {phase === 'memorize' && '👀 MEMORIZE'}
            {phase === 'tracking' && '👁️ TRACK'}
            {phase === 'select' && `🎯 SELECT ${targets}`}
          </Text>
          <Text style={styles.timerText}>{phaseTimer}s</Text>
        </View>
        <View style={styles.roundBadge}>
          <Text style={styles.roundBadgeText}>{round}/{totalRounds}</Text>
        </View>
      </View>

      {/* Instructions */}
      <View style={styles.instructionBar}>
        <Text style={styles.instructionBarText}>
          {phase === 'memorize' && 'Remember the purple players!'}
          {phase === 'tracking' && 'Keep your eyes on them...'}
          {phase === 'select' && `Tap ${targets - selectedIds.size} more player(s)`}
        </Text>
      </View>

      {/* Field */}
      <View style={styles.fieldContainer}>
        <View style={styles.field}>
          {/* Field markings */}
          <View style={styles.centerCircle} />
          <View style={styles.centerLine} />
          <View style={styles.penaltyAreaTop} />
          <View style={styles.penaltyAreaBottom} />

          {/* Players */}
          {players.map((player) => (
            <AnimatedPlayer
              key={player.id}
              player={player}
              phase={phase}
              speed={speed}
              duration={duration}
              isSelected={selectedIds.has(player.id)}
              showResult={showResult}
              onSelect={handleSelectPlayer}
            />
          ))}
        </View>
      </View>

      {/* Selection count */}
      {phase === 'select' && (
        <View style={styles.selectionInfo}>
          <Text style={styles.selectionText}>
            Selected: {selectedIds.size} / {targets}
          </Text>
          {selectedIds.size === targets && (
            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmitSelection}
            >
              <Text style={styles.submitButtonText}>Submit</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  // Ready/Start screen
  readyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  titleText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  levelText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#8b5cf6',
    marginBottom: 16,
  },
  instructionText: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  configInfo: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  configText: {
    fontSize: 14,
    color: '#64748b',
  },
  countdownContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
  },
  startButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  quitButton: {
    padding: 12,
  },
  quitButtonText: {
    color: '#64748b',
    fontSize: 16,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  quitIconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  phaseText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  timerText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#8b5cf6',
  },
  roundBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  roundBadgeText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  // Instruction bar
  instructionBar: {
    backgroundColor: '#1e293b',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  instructionBarText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  // Field
  fieldContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  field: {
    width: FIELD_WIDTH,
    height: FIELD_HEIGHT,
    backgroundColor: '#166534',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
    position: 'relative',
  },
  centerCircle: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    top: FIELD_HEIGHT / 2 - 40,
    left: FIELD_WIDTH / 2 - 40,
  },
  centerLine: {
    position: 'absolute',
    width: 2,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.3)',
    left: FIELD_WIDTH / 2 - 1,
  },
  penaltyAreaTop: {
    position: 'absolute',
    width: 120,
    height: 40,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    borderTopWidth: 0,
    top: 0,
    left: FIELD_WIDTH / 2 - 60,
  },
  penaltyAreaBottom: {
    position: 'absolute',
    width: 120,
    height: 40,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    borderBottomWidth: 0,
    bottom: 0,
    left: FIELD_WIDTH / 2 - 60,
  },
  // Player
  playerContainer: {
    position: 'absolute',
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
  },
  player: {
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    borderRadius: PLAYER_SIZE / 2,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  targetIndicator: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Selection
  selectionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 16,
  },
  selectionText: {
    color: '#94a3b8',
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Result screen
  resultContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  roundText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 24,
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
  },
  scoreLabel: {
    fontSize: 18,
    color: '#94a3b8',
    marginBottom: 24,
  },
  roundScores: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 32,
  },
  roundScoreBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  roundScoreText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  nextButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
