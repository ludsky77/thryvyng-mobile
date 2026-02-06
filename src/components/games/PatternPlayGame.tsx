import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Line } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import type { PatternPlayConfig, GameResult } from '../../types/games';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FIELD_WIDTH = SCREEN_WIDTH - 32;
const FIELD_HEIGHT = SCREEN_HEIGHT * 0.55;
const PLAYER_SIZE = 48;

interface Position {
  id: string;
  name: string;
  x: number;
  y: number;
}

interface Formation {
  id: string;
  code: string;
  name: string;
  positions: Position[];
}

interface Scenario {
  id: string;
  title: string;
  category: string;
  pass_sequence: string[];
  movements: any[];
  formation: Formation;
}

interface PassLine {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  opacity: Animated.Value;
}

type GamePhase = 'loading' | 'ready' | 'countdown' | 'watch' | 'retention' | 'replay' | 'roundResult' | 'gameComplete';

interface PatternPlayGameProps {
  config: PatternPlayConfig;
  levelNumber: number;
  xpReward: number;
  onComplete: (result: GameResult, durationSeconds: number) => void;
  onQuit: () => void;
}

// Level timing configurations
const getLevelConfig = (level: number) => {
  const configs: Record<number, { showDuration: number; lineFade: number; retentionGap: number }> = {
    1: { showDuration: 1200, lineFade: 800, retentionGap: 1000 },
    2: { showDuration: 1100, lineFade: 700, retentionGap: 1000 },
    3: { showDuration: 1000, lineFade: 650, retentionGap: 800 },
    4: { showDuration: 950, lineFade: 600, retentionGap: 800 },
    5: { showDuration: 900, lineFade: 550, retentionGap: 800 },
    6: { showDuration: 800, lineFade: 500, retentionGap: 700 },
    7: { showDuration: 750, lineFade: 480, retentionGap: 700 },
    8: { showDuration: 700, lineFade: 450, retentionGap: 600 },
    9: { showDuration: 650, lineFade: 420, retentionGap: 600 },
    10: { showDuration: 600, lineFade: 400, retentionGap: 600 },
    11: { showDuration: 580, lineFade: 380, retentionGap: 500 },
    12: { showDuration: 550, lineFade: 360, retentionGap: 500 },
    13: { showDuration: 520, lineFade: 340, retentionGap: 500 },
    14: { showDuration: 480, lineFade: 320, retentionGap: 400 },
    15: { showDuration: 450, lineFade: 300, retentionGap: 400 },
    16: { showDuration: 420, lineFade: 280, retentionGap: 400 },
    17: { showDuration: 400, lineFade: 260, retentionGap: 300 },
    18: { showDuration: 380, lineFade: 250, retentionGap: 300 },
    19: { showDuration: 360, lineFade: 240, retentionGap: 300 },
    20: { showDuration: 340, lineFade: 230, retentionGap: 250 },
  };
  return configs[level] || configs[1];
};

export default function PatternPlayGame({
  config,
  levelNumber,
  xpReward,
  onComplete,
  onQuit,
}: PatternPlayGameProps) {
  const levelConfig = getLevelConfig(levelNumber);
  const { showDuration, lineFade, retentionGap } = levelConfig;

  const [phase, setPhase] = useState<GamePhase>('loading');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [usedScenarioIds, setUsedScenarioIds] = useState<Set<string>>(new Set());
  const [currentScenario, setCurrentScenario] = useState<Scenario | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [passSequence, setPassSequence] = useState<string[]>([]);
  const [userSequence, setUserSequence] = useState<string[]>([]);
  const [currentPassIndex, setCurrentPassIndex] = useState(0);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [passLines, setPassLines] = useState<PassLine[]>([]);
  const [round, setRound] = useState(1);
  const [roundScores, setRoundScores] = useState<number[]>([]);
  const [countdown, setCountdown] = useState(3);
  const [tapFeedback, setTapFeedback] = useState<{ playerId: string; correct: boolean } | null>(null);
  const [fieldDimmed, setFieldDimmed] = useState(false);
  const [lastRoundScore, setLastRoundScore] = useState(0);

  const startTimeRef = useRef<number>(0);
  const totalRounds = 3;

  // Fetch scenarios for this level
  useEffect(() => {
    fetchScenarios();
  }, [levelNumber]);

  const fetchScenarios = async () => {
    try {
      let categories = ['build_out'];
      if (levelNumber >= 3) categories.push('possession');
      if (levelNumber >= 6) categories.push('switch');
      if (levelNumber >= 10) categories.push('attacking');
      if (levelNumber >= 16) categories.push('advanced');

      const { data, error } = await supabase
        .from('pattern_play_scenarios')
        .select(`
          id,
          title,
          category,
          pass_sequence,
          movements,
          formation:pattern_play_formations (
            id,
            code,
            name,
            positions
          )
        `)
        .in('category', categories)
        .lte('min_level', levelNumber)
        .gte('max_level', levelNumber)
        .eq('is_active', true);

      if (error) throw error;

      if (data && data.length > 0) {
        const transformedData = data.map(item => ({
          ...item,
          formation: item.formation as unknown as Formation,
        }));
        setScenarios(transformedData);
        setPhase('ready');
      } else {
        console.log('No scenarios found for level', levelNumber);
        setPhase('ready');
      }
    } catch (err) {
      console.error('Error fetching scenarios:', err);
      setPhase('ready');
    }
  };

  const positionToPixel = (pos: Position) => ({
    x: (pos.x / 100) * (FIELD_WIDTH - PLAYER_SIZE) + PLAYER_SIZE / 2,
    y: (pos.y / 100) * (FIELD_HEIGHT - PLAYER_SIZE) + PLAYER_SIZE / 2,
  });

  const getPositionById = (id: string): Position | undefined => {
    return positions.find(p => p.id === id);
  };

  // Select random scenario that hasn't been used this session
  const selectScenario = (): Scenario | null => {
    const availableScenarios = scenarios.filter(s => !usedScenarioIds.has(s.id));

    if (availableScenarios.length === 0) {
      // All scenarios used, reset (shouldn't happen with enough scenarios)
      setUsedScenarioIds(new Set());
      return scenarios[Math.floor(Math.random() * scenarios.length)];
    }

    const selected = availableScenarios[Math.floor(Math.random() * availableScenarios.length)];
    setUsedScenarioIds(prev => new Set([...prev, selected.id]));
    return selected;
  };

  const startRound = (effectiveRound?: number) => {
    if (scenarios.length === 0) {
      console.warn('No scenarios available');
      return;
    }

    const scenario = selectScenario();
    if (!scenario) return;

    const roundForThisGame = effectiveRound ?? round;

    setCurrentScenario(scenario);
    setPositions(scenario.formation.positions);
    setPassSequence(scenario.pass_sequence);
    setUserSequence([]);
    setPassLines([]);
    setCurrentPassIndex(0);
    setActivePlayerId(null);
    setTapFeedback(null);
    setFieldDimmed(false);

    // Start countdown
    setPhase('countdown');
    setCountdown(3);

    let count = 3;
    const countdownInterval = setInterval(() => {
      count--;
      setCountdown(count);
      if (count === 0) {
        clearInterval(countdownInterval);
        if (roundForThisGame === 1) {
          startTimeRef.current = Date.now();
        }
        showPattern(scenario.pass_sequence, scenario.formation.positions, roundForThisGame);
      }
    }, 1000);
  };

  // Animate showing the pattern
  const showPattern = async (sequence: string[], formationPositions: Position[], roundForRetention: number) => {
    setPhase('watch');
    const lines: PassLine[] = [];

    for (let i = 0; i < sequence.length; i++) {
      const playerId = sequence[i];
      setActivePlayerId(playerId);
      setCurrentPassIndex(i);

      // If not the first player, draw line from previous
      if (i > 0) {
        const fromPos = formationPositions.find(p => p.id === sequence[i - 1]);
        const toPos = formationPositions.find(p => p.id === playerId);

        if (fromPos && toPos) {
          const fromPixel = positionToPixel(fromPos);
          const toPixel = positionToPixel(toPos);

          const opacity = new Animated.Value(0.9);
          const newLine: PassLine = {
            fromX: fromPixel.x,
            fromY: fromPixel.y,
            toX: toPixel.x,
            toY: toPixel.y,
            opacity,
          };

          lines.push(newLine);
          setPassLines([...lines]);

          // Start fading previous line slightly
          if (lines.length > 1) {
            Animated.timing(lines[lines.length - 2].opacity, {
              toValue: 0.5,
              duration: showDuration * 0.5,
              useNativeDriver: false,
            }).start();
          }
        }
      }

      // Wait before showing next player
      await new Promise(resolve => setTimeout(resolve, showDuration));
    }

    // Brief hold showing complete pattern
    await new Promise(resolve => setTimeout(resolve, 200));

    // Fade ALL lines out
    lines.forEach(line => {
      Animated.timing(line.opacity, {
        toValue: 0,
        duration: lineFade,
        useNativeDriver: false,
      }).start();
    });

    // Dim active player
    setActivePlayerId(null);

    // Wait for lines to fade
    await new Promise(resolve => setTimeout(resolve, lineFade));

    // Clear lines completely
    setPassLines([]);

    // RETENTION GAP
    setPhase('retention');

    // Hybrid: Round 1 & 3 = players visible, Round 2 = dimmed
    const shouldDim = roundForRetention === 2;
    setFieldDimmed(shouldDim);

    await new Promise(resolve => setTimeout(resolve, retentionGap));

    // Start replay
    setFieldDimmed(false);
    setCurrentPassIndex(0);
    setPhase('replay');
  };

  // Handle player tap during replay - IMMEDIATE FEEDBACK
  const handlePlayerTap = (playerId: string) => {
    if (phase !== 'replay') return;

    const currentIndex = userSequence.length;
    const isCorrect = passSequence[currentIndex] === playerId;

    // Show immediate feedback
    setTapFeedback({ playerId, correct: isCorrect });
    setActivePlayerId(playerId);

    // Clear feedback after brief flash
    setTimeout(() => {
      setTapFeedback(null);
      setActivePlayerId(null);
    }, 300);

    const newUserSequence = [...userSequence, playerId];
    setUserSequence(newUserSequence);

    // Check if sequence complete
    if (newUserSequence.length === passSequence.length) {
      setTimeout(() => calculateRoundScore(newUserSequence), 400);
    }
  };

  const calculateRoundScore = (userSeq: string[]) => {
    let correct = 0;
    for (let i = 0; i < passSequence.length; i++) {
      if (userSeq[i] === passSequence[i]) correct++;
    }

    const roundScore = Math.round((correct / passSequence.length) * 100);
    setLastRoundScore(roundScore);
    setRoundScores(prev => [...prev, roundScore]);
    setPhase('roundResult');
  };

  const handleNextRound = () => {
    if (round < totalRounds) {
      const nextRound = round + 1;
      setRound(nextRound);
      startRound(nextRound);
    } else {
      setPhase('gameComplete');
    }
  };

  const handleGameComplete = () => {
    const avgScore = Math.round(roundScores.reduce((a, b) => a + b, 0) / roundScores.length);
    const isPerfect = avgScore === 100;
    const xpEarned = isPerfect ? xpReward + 10 : Math.round((avgScore / 100) * xpReward);
    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);

    const result: GameResult = {
      score: avgScore,
      accuracy: avgScore,
      xpEarned,
      isPerfect,
      levelCompleted: avgScore >= 70,
      newHighScore: false,
    };

    onComplete(result, durationSeconds);
  };

  // Get player style based on state
  const getPlayerStyle = (posId: string) => {
    const isActive = activePlayerId === posId;
    const userIndex = userSequence.indexOf(posId);
    const isInUserSequence = userIndex >= 0;
    const isCorrectPosition = isInUserSequence && passSequence[userIndex] === posId;
    const hasFeedback = tapFeedback?.playerId === posId;

    if (hasFeedback) {
      return tapFeedback.correct ? styles.playerCorrect : styles.playerWrong;
    }
    if (isActive) {
      return styles.playerActive;
    }
    if (phase === 'replay' && isInUserSequence) {
      return isCorrectPosition ? styles.playerCorrect : styles.playerWrong;
    }
    return null;
  };

  // Loading screen
  if (phase === 'loading') {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>Loading patterns...</Text>
        </View>
      </View>
    );
  }

  // Ready screen
  if (phase === 'ready') {
    return (
      <View style={styles.container}>
        <View style={styles.readyContainer}>
          <Text style={styles.titleText}>🔄 Pattern Play</Text>
          <Text style={styles.levelText}>Level {levelNumber}</Text>
          <Text style={styles.instructionText}>
            Watch the passing pattern carefully, then tap the players in the same order from memory
          </Text>
          <View style={styles.configInfo}>
            <Text style={styles.configText}>📋 {scenarios.length} patterns</Text>
            <Text style={styles.configText}>⏱️ {showDuration}ms speed</Text>
            <Text style={styles.configText}>🔄 {totalRounds} rounds</Text>
          </View>
          <TouchableOpacity style={styles.startButton} onPress={startRound}>
            <Text style={styles.startButtonText}>Start Game</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quitButton} onPress={onQuit}>
            <Text style={styles.quitButtonText}>Quit</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Countdown screen
  if (phase === 'countdown') {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.roundIndicator}>Round {round} of {totalRounds}</Text>
          {currentScenario && (
            <Text style={styles.scenarioTitle}>{currentScenario.title}</Text>
          )}
          <View style={styles.countdownCircle}>
            <Text style={styles.countdownText}>{countdown}</Text>
          </View>
        </View>
      </View>
    );
  }

  // Retention gap screen - SAME STRUCTURE as watch/replay to prevent shift
  if (phase === 'retention') {
    return (
      <View style={styles.container}>
        {/* Header - same as watch/replay */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onQuit} style={styles.quitIconButton}>
            <Feather name="x" size={24} color="#94a3b8" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.phaseText}>🧠 MEMORIZE...</Text>
          </View>
          <View style={styles.roundBadge}>
            <Text style={styles.roundBadgeText}>{round}/{totalRounds}</Text>
          </View>
        </View>

        {/* Instruction bar - same as watch/replay but different text */}
        <View style={styles.instructionBar}>
          <Text style={styles.instructionBarText}>
            {passSequence.length} passes to remember...
          </Text>
        </View>

        {/* Field - EXACT same structure */}
        <View style={styles.fieldContainer}>
          <View style={[styles.field, fieldDimmed && styles.fieldDimmed]}>
            {/* Field markings */}
            <View style={styles.fieldBorder}>
              <View style={styles.penaltyAreaTop}><View style={styles.goalAreaTop} /></View>
              <View style={styles.centerLine} />
              <View style={styles.centerCircle}><View style={styles.centerSpot} /></View>
              <View style={styles.penaltyAreaBottom}><View style={styles.goalAreaBottom} /></View>
            </View>

            {/* Players - dimmed state */}
            {!fieldDimmed && positions.map((pos) => {
              const pixel = positionToPixel(pos);
              return (
                <View
                  key={pos.id}
                  style={[
                    styles.player,
                    styles.playerDimmed,
                    { left: pixel.x - PLAYER_SIZE / 2, top: pixel.y - PLAYER_SIZE / 2 },
                  ]}
                >
                  <Text style={styles.playerLabel}>{pos.id}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Progress indicator - same as watch/replay */}
        <View style={styles.progressContainer}>
          {passSequence.map((_, idx) => (
            <View key={idx} style={styles.progressDot} />
          ))}
        </View>
      </View>
    );
  }

  // Round result screen
  if (phase === 'roundResult') {
    return (
      <View style={styles.container}>
        <View style={styles.resultContainer}>
          <Text style={styles.roundCompleteText}>Round {round} Complete!</Text>
          <View style={[styles.scoreCircle, lastRoundScore === 100 && styles.scoreCirclePerfect]}>
            <Text style={styles.scoreText}>{lastRoundScore}%</Text>
          </View>
          <Text style={styles.scoreLabel}>
            {lastRoundScore === 100 ? '🎉 Perfect!' :
             lastRoundScore >= 70 ? '👍 Good job!' :
             lastRoundScore >= 50 ? '💪 Keep trying!' : '🔄 Practice more!'}
          </Text>

          {roundScores.length > 1 && (
            <View style={styles.roundScoresRow}>
              {roundScores.map((score, idx) => (
                <View key={idx} style={[styles.roundScoreBadge, score === 100 && styles.roundScoreBadgePerfect]}>
                  <Text style={styles.roundScoreText}>R{idx + 1}: {score}%</Text>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.nextButton} onPress={handleNextRound}>
            <Text style={styles.nextButtonText}>
              {round < totalRounds ? `Next Round (${round + 1}/${totalRounds})` : 'See Final Results'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Game complete screen
  if (phase === 'gameComplete') {
    const avgScore = Math.round(roundScores.reduce((a, b) => a + b, 0) / roundScores.length);

    return (
      <View style={styles.container}>
        <View style={styles.resultContainer}>
          <Text style={styles.gameCompleteText}>🏆 Game Complete!</Text>
          <View style={[styles.scoreCircleLarge, avgScore === 100 && styles.scoreCirclePerfect]}>
            <Text style={styles.scoreTextLarge}>{avgScore}%</Text>
          </View>
          <Text style={styles.avgLabel}>Average Score</Text>

          <View style={styles.roundScoresRow}>
            {roundScores.map((score, idx) => (
              <View key={idx} style={[styles.roundScoreBadge, score === 100 && styles.roundScoreBadgePerfect]}>
                <Text style={styles.roundScoreText}>R{idx + 1}: {score}%</Text>
              </View>
            ))}
          </View>

          <Text style={styles.completionStatus}>
            {avgScore >= 70 ? '✅ Level Complete!' : '❌ Need 70% to pass'}
          </Text>

          <TouchableOpacity style={styles.finishButton} onPress={handleGameComplete}>
            <Text style={styles.finishButtonText}>Claim XP</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Watch & Replay phases - Game field
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onQuit} style={styles.quitIconButton}>
          <Feather name="x" size={24} color="#94a3b8" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {currentScenario && (
            <Text style={styles.scenarioTitleSmall}>{currentScenario.title}</Text>
          )}
          <Text style={styles.phaseText}>
            {phase === 'watch' ? '👀 WATCH' : '👆 YOUR TURN'}
          </Text>
        </View>
        <View style={styles.roundBadge}>
          <Text style={styles.roundBadgeText}>{round}/{totalRounds}</Text>
        </View>
      </View>

      {/* Instructions */}
      <View style={[styles.instructionBar, phase === 'replay' && styles.instructionBarReplay]}>
        <Text style={styles.instructionBarText}>
          {phase === 'watch'
            ? `Watching pass ${currentPassIndex + 1} of ${passSequence.length}...`
            : `Tap player ${userSequence.length + 1} of ${passSequence.length}`
          }
        </Text>
      </View>

      {/* Field */}
      <View style={styles.fieldContainer}>
        <View style={styles.field}>
          {/* Field markings */}
          <View style={styles.fieldBorder}>
            <View style={styles.penaltyAreaTop}><View style={styles.goalAreaTop} /></View>
            <View style={styles.centerLine} />
            <View style={styles.centerCircle}><View style={styles.centerSpot} /></View>
            <View style={styles.penaltyAreaBottom}><View style={styles.goalAreaBottom} /></View>
          </View>

          {/* Pass lines - ONLY during watch phase */}
          {phase === 'watch' && passLines.length > 0 && (
            <Svg style={StyleSheet.absoluteFill}>
              {passLines.map((line, idx) => (
                <AnimatedLineComponent key={idx} line={line} />
              ))}
            </Svg>
          )}

          {/* Players */}
          {positions.map((pos) => {
            const pixel = positionToPixel(pos);
            const playerStyle = getPlayerStyle(pos.id);
            const userIndex = userSequence.indexOf(pos.id);

            return (
              <TouchableOpacity
                key={pos.id}
                style={[
                  styles.player,
                  { left: pixel.x - PLAYER_SIZE / 2, top: pixel.y - PLAYER_SIZE / 2 },
                  playerStyle,
                ]}
                onPress={() => handlePlayerTap(pos.id)}
                disabled={phase !== 'replay'}
                activeOpacity={0.7}
              >
                <Text style={[styles.playerLabel, playerStyle && styles.playerLabelActive]}>
                  {pos.id}
                </Text>

                {/* Order badge for user selections in replay */}
                {phase === 'replay' && userIndex >= 0 && (
                  <View style={[
                    styles.orderBadge,
                    passSequence[userIndex] !== pos.id && styles.orderBadgeWrong,
                  ]}>
                    <Text style={styles.orderText}>{userIndex + 1}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Progress indicator */}
      <View style={styles.progressContainer}>
        {passSequence.map((_, idx) => (
          <View
            key={idx}
            style={[
              styles.progressDot,
              phase === 'watch' && idx <= currentPassIndex && styles.progressDotWatch,
              phase === 'replay' && idx < userSequence.length && (
                passSequence[idx] === userSequence[idx]
                  ? styles.progressDotCorrect
                  : styles.progressDotWrong
              ),
            ]}
          />
        ))}
      </View>
    </View>
  );
}

// Animated Line component - syncs Animated.Value opacity to re-render
const AnimatedLineComponent = ({ line }: { line: PassLine }) => {
  const [opacity, setOpacity] = useState(0.9);

  useEffect(() => {
    const listenerId = line.opacity.addListener(({ value }) => {
      setOpacity(value);
    });
    return () => line.opacity.removeListener(listenerId);
  }, [line.opacity]);

  if (opacity <= 0) return null;

  return (
    <Line
      x1={line.fromX}
      y1={line.fromY}
      x2={line.toX}
      y2={line.toY}
      stroke={`rgba(255, 255, 255, ${opacity})`}
      strokeWidth={3}
      strokeDasharray="8,4"
      strokeLinecap="round"
    />
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 18,
  },
  // Ready screen
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
    color: '#10b981',
    marginBottom: 16,
  },
  instructionText: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
    lineHeight: 24,
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
  startButton: {
    backgroundColor: '#10b981',
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
  // Countdown
  roundIndicator: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 8,
  },
  scenarioTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#10b981',
    marginBottom: 24,
    textAlign: 'center',
  },
  countdownCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
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
  scenarioTitleSmall: {
    fontSize: 13,
    fontWeight: '500',
    color: '#10b981',
    marginBottom: 4,
  },
  phaseText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
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
    marginBottom: 12,
  },
  instructionBarReplay: {
    backgroundColor: '#1e3a5f',
    borderWidth: 1,
    borderColor: '#3b82f6',
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
    position: 'relative',
  },
  field: {
    width: FIELD_WIDTH,
    height: FIELD_HEIGHT,
    backgroundColor: '#2d8a4e',
    borderRadius: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  fieldDimmed: {
    opacity: 0.3,
  },
  fieldBorder: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 2,
  },
  centerLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  centerCircle: {
    position: 'absolute',
    width: FIELD_WIDTH * 0.2,
    height: FIELD_WIDTH * 0.2,
    borderRadius: FIELD_WIDTH * 0.1,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    top: '50%',
    left: '50%',
    marginTop: -(FIELD_WIDTH * 0.1),
    marginLeft: -(FIELD_WIDTH * 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSpot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  penaltyAreaTop: {
    position: 'absolute',
    top: 0,
    left: '25%',
    width: '50%',
    height: '16%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    borderTopWidth: 0,
  },
  goalAreaTop: {
    position: 'absolute',
    top: 0,
    left: '25%',
    width: '50%',
    height: '40%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    borderTopWidth: 0,
  },
  penaltyAreaBottom: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    width: '50%',
    height: '16%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    borderBottomWidth: 0,
  },
  goalAreaBottom: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    width: '50%',
    height: '40%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    borderBottomWidth: 0,
  },
  // Players
  player: {
    position: 'absolute',
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    borderRadius: PLAYER_SIZE / 2,
    backgroundColor: '#475569',
    borderWidth: 3,
    borderColor: '#64748b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerDimmed: {
    backgroundColor: '#374151',
    borderColor: '#4b5563',
    opacity: 0.6,
  },
  playerActive: {
    backgroundColor: '#10b981',
    borderColor: '#34d399',
    transform: [{ scale: 1.15 }],
  },
  playerCorrect: {
    backgroundColor: '#10b981',
    borderColor: '#34d399',
  },
  playerWrong: {
    backgroundColor: '#ef4444',
    borderColor: '#f87171',
  },
  playerLabel: {
    color: '#e2e8f0',
    fontSize: 10,
    fontWeight: '700',
  },
  playerLabelActive: {
    color: '#fff',
  },
  orderBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderBadgeWrong: {
    backgroundColor: '#ef4444',
  },
  orderText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  // Progress
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  progressDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#334155',
    borderWidth: 2,
    borderColor: '#475569',
  },
  progressDotWatch: {
    backgroundColor: '#fbbf24',
    borderColor: '#fcd34d',
  },
  progressDotCorrect: {
    backgroundColor: '#10b981',
    borderColor: '#34d399',
  },
  progressDotWrong: {
    backgroundColor: '#ef4444',
    borderColor: '#f87171',
  },
  // Results
  resultContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  roundCompleteText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 24,
  },
  gameCompleteText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 24,
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreCircleLarge: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  scoreCirclePerfect: {
    backgroundColor: '#f59e0b',
    borderWidth: 4,
    borderColor: '#fcd34d',
  },
  scoreText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
  },
  scoreTextLarge: {
    fontSize: 42,
    fontWeight: '700',
    color: '#fff',
  },
  avgLabel: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 20,
  },
  scoreLabel: {
    fontSize: 18,
    color: '#94a3b8',
    marginBottom: 24,
  },
  completionStatus: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 24,
  },
  roundScoresRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  roundScoreBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  roundScoreBadgePerfect: {
    backgroundColor: '#854d0e',
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  roundScoreText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  nextButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  finishButton: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
  },
  finishButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
