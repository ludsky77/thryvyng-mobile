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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FIELD_WIDTH = SCREEN_WIDTH - 32;
const FIELD_HEIGHT = SCREEN_HEIGHT * 0.55; // Use more vertical space
const PLAYER_SIZE = 44;
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
  memorizeMs: number;
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
  memorizeMs,
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
      const pulseDuration = 300;
      const sequence: any[] = [];
      const pulseCount = Math.max(2, Math.floor(memorizeMs / (pulseDuration * 2)));

      for (let i = 0; i < pulseCount; i++) {
        sequence.push(withTiming(1.2, { duration: pulseDuration }));
        sequence.push(withTiming(1, { duration: pulseDuration }));
      }

      scale.value = withSequence(...sequence);
    }
  }, [phase, player.isTarget, memorizeMs]);

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
  const targets = config.targets || 3;
  const totalPlayers = config.players || 8;
  const baseSpeed = config.speed || 1.0;
  const baseDuration = config.duration || 4000;
  const baseMemorize = config.memorize || 2000;
  const selectionTime = config.selectionTime || 10;
  const roundModifiers = config.roundModifiers || {
    round2: { speedMult: 1.08, memorizeMult: 0.88 },
    round3: { speedMult: 1.15, memorizeMult: 0.78 },
  };

  const getRoundSpeed = (roundNum: number): number => {
    if (roundNum === 2) return baseSpeed * (roundModifiers.round2?.speedMult || 1.08);
    if (roundNum === 3) return baseSpeed * (roundModifiers.round3?.speedMult || 1.15);
    return baseSpeed;
  };

  const getRoundMemorize = (roundNum: number): number => {
    if (roundNum === 2) {
      return Math.round(baseMemorize * (roundModifiers.round2?.memorizeMult || 0.88));
    }
    if (roundNum === 3) {
      return Math.round(baseMemorize * (roundModifiers.round3?.memorizeMult || 0.78));
    }
    return baseMemorize;
  };

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

  // Phase transitions (do not depend on getRoundMemorize — it's recreated each render and would clear the transition timeout)
  useEffect(() => {
    if (phase === 'memorize') {
      const memorizeMs =
        round === 2
          ? Math.round(baseMemorize * (roundModifiers.round2?.memorizeMult || 0.88))
          : round === 3
            ? Math.round(baseMemorize * (roundModifiers.round3?.memorizeMult || 0.78))
            : baseMemorize;
      const memorizeSec = Math.ceil(memorizeMs / 1000);
      setPhaseTimer(memorizeSec);

      const interval = setInterval(() => {
        setPhaseTimer((prev) => Math.max(0, prev - 1));
      }, 1000);

      const timer = setTimeout(() => {
        setPhase('tracking');
      }, memorizeMs);

      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }

    if (phase === 'tracking') {
      setPhaseTimer(Math.ceil(baseDuration / 1000));
      const timer = setTimeout(() => {
        setPhase('select');
      }, baseDuration);

      const interval = setInterval(() => {
        setPhaseTimer((prev) => Math.max(0, prev - 1));
      }, 1000);

      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }

    if (phase === 'select') {
      setPhaseTimer(selectionTime);
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
  }, [phase, baseDuration, round, selectionTime, baseMemorize, roundModifiers]);

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
            <Text style={styles.configText}>⏱️ {baseDuration / 1000}s tracking</Text>
          </View>
          {round > 1 && (
            <View style={{
              backgroundColor: '#7c3aed20',
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 8,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: '#7c3aed40',
            }}>
              <Text style={{ color: '#a78bfa', fontSize: 13, textAlign: 'center' }}>
                ⚡ Round {round}: {round === 2 ? 'Faster' : 'Fastest'} — Less memorize time
              </Text>
            </View>
          )}
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
            <Text style={styles.configText}>⏱️ {baseDuration / 1000}s</Text>
          </View>
          {round > 1 && (
            <View style={{
              backgroundColor: '#7c3aed20',
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 8,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: '#7c3aed40',
            }}>
              <Text style={{ color: '#a78bfa', fontSize: 13, textAlign: 'center' }}>
                ⚡ Round {round}: {round === 2 ? 'Faster' : 'Fastest'} — Less memorize time
              </Text>
            </View>
          )}
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

          {round < totalRounds && (
            <View style={{
              backgroundColor: '#1e293b',
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 8,
              marginBottom: 16,
            }}>
              <Text style={{ color: '#64748b', fontSize: 13, textAlign: 'center' }}>
                Next: Speed ×{getRoundSpeed(round + 1).toFixed(1)} • Memorize {Math.ceil(getRoundMemorize(round + 1) / 1000)}s
              </Text>
            </View>
          )}

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
          {phase === 'memorize' && `Remember the purple players! (${Math.ceil(getRoundMemorize(round) / 1000)}s)`}
          {phase === 'tracking' && (round > 1 ? 'Faster now! Keep tracking...' : 'Keep your eyes on them...')}
          {phase === 'select' && (
            selectedIds.size >= targets
              ? 'Hit Submit!'
              : `Tap ${targets - selectedIds.size} more player(s)`
          )}
        </Text>
      </View>

      {/* Field */}
      <View style={styles.fieldContainer}>
        <View style={styles.field}>
          {/* Outer border */}
          <View style={styles.fieldBorder}>
            {/* Top Penalty Area */}
            <View style={styles.penaltyAreaTop}>
              <View style={styles.goalAreaTop} />
              <View style={styles.penaltySpotTop} />
              <View style={styles.penaltyArcTop} />
            </View>

            {/* Center Line */}
            <View style={styles.centerLine} />

            {/* Center Circle */}
            <View style={styles.centerCircle}>
              <View style={styles.centerSpot} />
            </View>

            {/* Bottom Penalty Area */}
            <View style={styles.penaltyAreaBottom}>
              <View style={styles.goalAreaBottom} />
              <View style={styles.penaltySpotBottom} />
              <View style={styles.penaltyArcBottom} />
            </View>

            {/* Corner Arcs */}
            <View style={styles.cornerTopLeft} />
            <View style={styles.cornerTopRight} />
            <View style={styles.cornerBottomLeft} />
            <View style={styles.cornerBottomRight} />

            {/* Goals */}
            <View style={styles.goalTop} />
            <View style={styles.goalBottom} />
          </View>

          {/* Players */}
          {players.map((player) => (
            <AnimatedPlayer
              key={player.id}
              player={player}
              phase={phase}
              speed={getRoundSpeed(round)}
              duration={baseDuration}
              memorizeMs={getRoundMemorize(round)}
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  field: {
    width: FIELD_WIDTH,
    height: FIELD_HEIGHT,
    backgroundColor: '#2d8a4e', // Grass green
    borderRadius: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  fieldBorder: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 2,
  },
  // Center elements
  centerLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.9)',
    marginTop: -1,
  },
  centerCircle: {
    position: 'absolute',
    width: FIELD_WIDTH * 0.22,
    height: FIELD_WIDTH * 0.22,
    borderRadius: FIELD_WIDTH * 0.11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    top: '50%',
    left: '50%',
    marginTop: -(FIELD_WIDTH * 0.11),
    marginLeft: -(FIELD_WIDTH * 0.11),
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSpot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  // Top penalty area
  penaltyAreaTop: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -(FIELD_WIDTH * 0.25),
    width: FIELD_WIDTH * 0.5,
    height: FIELD_HEIGHT * 0.18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderTopWidth: 0,
  },
  goalAreaTop: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -(FIELD_WIDTH * 0.15),
    width: FIELD_WIDTH * 0.3,
    height: FIELD_HEIGHT * 0.07,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderTopWidth: 0,
  },
  penaltySpotTop: {
    position: 'absolute',
    top: FIELD_HEIGHT * 0.12,
    left: '50%',
    marginLeft: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  penaltyArcTop: {
    position: 'absolute',
    bottom: -FIELD_WIDTH * 0.12,
    left: '50%',
    marginLeft: -(FIELD_WIDTH * 0.1),
    width: FIELD_WIDTH * 0.2,
    height: FIELD_WIDTH * 0.12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: FIELD_WIDTH * 0.1,
    borderBottomRightRadius: FIELD_WIDTH * 0.1,
    borderTopWidth: 0,
  },
  // Bottom penalty area
  penaltyAreaBottom: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    marginLeft: -(FIELD_WIDTH * 0.25),
    width: FIELD_WIDTH * 0.5,
    height: FIELD_HEIGHT * 0.18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderBottomWidth: 0,
  },
  goalAreaBottom: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    marginLeft: -(FIELD_WIDTH * 0.15),
    width: FIELD_WIDTH * 0.3,
    height: FIELD_HEIGHT * 0.07,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderBottomWidth: 0,
  },
  penaltySpotBottom: {
    position: 'absolute',
    bottom: FIELD_HEIGHT * 0.12,
    left: '50%',
    marginLeft: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  penaltyArcBottom: {
    position: 'absolute',
    top: -FIELD_WIDTH * 0.12,
    left: '50%',
    marginLeft: -(FIELD_WIDTH * 0.1),
    width: FIELD_WIDTH * 0.2,
    height: FIELD_WIDTH * 0.12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: FIELD_WIDTH * 0.1,
    borderTopRightRadius: FIELD_WIDTH * 0.1,
    borderBottomWidth: 0,
  },
  // Corner arcs
  cornerTopLeft: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 12,
    height: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
  cornerTopRight: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 12,
    height: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    borderTopWidth: 0,
    borderRightWidth: 0,
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: -6,
    left: -6,
    width: 12,
    height: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
  },
  cornerBottomRight: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 12,
    height: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    borderBottomWidth: 0,
    borderRightWidth: 0,
  },
  // Goals (behind the lines)
  goalTop: {
    position: 'absolute',
    top: -10,
    left: '50%',
    marginLeft: -(FIELD_WIDTH * 0.12),
    width: FIELD_WIDTH * 0.24,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  goalBottom: {
    position: 'absolute',
    bottom: -10,
    left: '50%',
    marginLeft: -(FIELD_WIDTH * 0.12),
    width: FIELD_WIDTH * 0.24,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
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
