import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { DribbleRushConfig, DribbleRushRoundMod, GameResult } from '../../types/games';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HUD_HEIGHT = 60;
const CONTROLS_HEIGHT = 120;
const FIELD_HEIGHT = SCREEN_HEIGHT - HUD_HEIGHT - CONTROLS_HEIGHT;
const FIELD_WIDTH = SCREEN_WIDTH;
const LANE_WIDTH = FIELD_WIDTH / 3;
const PLAYER_Y = FIELD_HEIGHT - 80;
const COLLISION_RADIUS = 40;
const FRAME_MS = 16;

type GamePhase = 'ready' | 'countdown' | 'playing' | 'roundComplete' | 'collision' | 'levelComplete';
type PlayerLane = 0 | 1 | 2;

interface Obstacle {
  id: string;
  type: 'static_defender' | 'teammate_pass' | 'sliding_tackle';
  lane: number;
  y: number;
  teammateLane?: number;
  slideDirection?: 'left' | 'right';
  slideProgress?: number;
  spawnTime?: number;
  flickering?: boolean;
}

type ObstacleType = Obstacle['type'];

interface DribbleRushGameProps {
  config: DribbleRushConfig;
  levelNumber: number;
  xpReward: number;
  onComplete: (result: GameResult, durationSeconds: number) => void;
  onQuit: () => void;
}

const MAX_OBSTACLES_ON_SCREEN = 8;

const DEFAULT_CONFIG: DribbleRushConfig = {
  name: 'Level',
  tier: 1,
  baseSpeed: 2.0,
  maxSpeed: 3.0,
  accelRate: 0.01,
  obstacleFrequency: 2500,
  warningDistance: 350,
  distanceTarget: 150,
  passThreshold: 60,
  obstacleTypes: ['static_defender'],
  obstacleWeights: { static_defender: 100 },
  passWindow: 3.0,
  roundModifiers: {
    round1: { speedMod: 1.0, freqMod: 1.0, warnMod: 1.0, distMod: 0.85 },
    round2: { speedMod: 1.08, freqMod: 0.90, warnMod: 0.92, distMod: 0.95 },
    round3: { speedMod: 1.15, freqMod: 0.80, warnMod: 0.85, distMod: 1.0 },
  },
  scoring: { dodgePoints: 2, passPoints: 4, fakePenalty: -3 },
  environment: { rain: 0, night: 0 },
  bonusElements: { shields: 3 },
};

function getRoundModifiers(
  roundModifiers: DribbleRushConfig['roundModifiers'],
  round: number
): DribbleRushRoundMod {
  const key = `round${round}` as keyof typeof roundModifiers;
  return roundModifiers[key] ?? DEFAULT_CONFIG.roundModifiers.round1;
}

// Player silhouette icon (head + shoulders)
const PlayerIcon = ({ color, size = 50 }: { color: string; size?: number }) => (
  <View style={{ alignItems: 'center', width: size, height: size }}>
    <View
      style={{
        width: size * 0.4,
        height: size * 0.4,
        borderRadius: size * 0.2,
        backgroundColor: color,
      }}
    />
    <View
      style={{
        width: size * 0.7,
        height: size * 0.45,
        borderTopLeftRadius: size * 0.35,
        borderTopRightRadius: size * 0.35,
        backgroundColor: color,
        marginTop: -size * 0.05,
      }}
    />
  </View>
);

// Simple dark green field with dotted lane dividers only
const SoccerFieldBackground = () => {
  const fieldColor = '#15803d';

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fieldColor }]} />
      {/* Subtle grass stripes */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View
          key={`stripe-${i}`}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${i * 16.66}%`,
            width: '16.66%',
            backgroundColor: i % 2 === 0 ? 'rgba(0,0,0,0.05)' : 'transparent',
          }}
        />
      ))}
      {/* Dotted lane dividers */}
      {[LANE_WIDTH, LANE_WIDTH * 2].map((leftPos, index) => (
        <View
          key={`lane-${index}`}
          style={{
            position: 'absolute',
            left: leftPos - 1.5,
            top: 0,
            bottom: 0,
          }}
        >
          {Array.from({ length: Math.ceil(FIELD_HEIGHT / 30) }).map((_, i) => (
            <View
              key={`dot-${i}`}
              style={{
                width: 3,
                height: 15,
                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                marginBottom: 15,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
};

export default function DribbleRushGame({
  config,
  levelNumber,
  xpReward,
  onComplete,
  onQuit,
}: DribbleRushGameProps) {
  const safeConfig: DribbleRushConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const [phase, setPhase] = useState<GamePhase>('ready');
  const [countdownNum, setCountdownNum] = useState(3);
  const [currentRound, setCurrentRound] = useState(1);
  const [distance, setDistance] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(safeConfig.baseSpeed);
  const [playerLane, setPlayerLane] = useState<PlayerLane>(1);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [score, setScore] = useState(0);
  const [comboChain, setComboChain] = useState(0);
  const [shields, setShields] = useState(safeConfig.bonusElements?.shields || 3);
  const [roundScores, setRoundScores] = useState<number[]>([]);
  const [successfulDodges, setSuccessfulDodges] = useState(0);
  const [successfulPasses, setSuccessfulPasses] = useState(0);
  const [missedPasses, setMissedPasses] = useState(0);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'pass' | 'miss' | null;
    visible: boolean;
  }>({ type: null, visible: false });

  const speedRef = useRef(safeConfig.baseSpeed);
  const distanceRef = useRef(0);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const gameStartTimeRef = useRef<number>(0);
  const lastSpawnTimeRef = useRef<number>(0);
  const roundCompleteHandledRef = useRef(false);

  const roundMods = getRoundModifiers(safeConfig.roundModifiers, currentRound);
  const roundDistanceTarget = (safeConfig.distanceTarget || 150) * (roundMods.distMod || 1);

  const showFeedback = (type: 'pass' | 'miss') => {
    setFeedbackMessage({ type, visible: true });
    setTimeout(() => {
      setFeedbackMessage({ type: null, visible: false });
    }, 800);
  };

  const spawnObstacle = useCallback(() => {
    if (obstaclesRef.current.length >= MAX_OBSTACLES_ON_SCREEN) return;

    const types = safeConfig.obstacleTypes || ['static_defender'];
    const weights = safeConfig.obstacleWeights || { static_defender: 100 };

    const totalWeight = types.reduce((sum, type) => sum + (weights[type] || 0), 0);
    let random = Math.random() * totalWeight;
    let selectedType: ObstacleType = 'static_defender';

    for (const type of types) {
      if (random < (weights[type] || 0)) {
        selectedType = type as ObstacleType;
        break;
      }
      random -= weights[type] || 0;
    }

    const lane = Math.floor(Math.random() * 3);
    const newObstacle: Obstacle = {
      id: `obs-${Date.now()}-${Math.random()}`,
      type: selectedType,
      lane,
      y: -60,
    };

    if (selectedType === 'teammate_pass') {
      const possibleLanes = [0, 1, 2].filter((l) => l !== lane);
      newObstacle.teammateLane = possibleLanes[Math.floor(Math.random() * possibleLanes.length)];
    }

    obstaclesRef.current = [...obstaclesRef.current, newObstacle];
    setObstacles(obstaclesRef.current);
  }, [safeConfig.obstacleTypes, safeConfig.obstacleWeights]);

  const calculateRoundScore = useCallback(() => {
    const distanceScore = 60;
    const maxActions = 30;
    const actionScore = Math.min(
      (successfulDodges * (safeConfig.scoring?.dodgePoints || 2)) +
      (successfulPasses * (safeConfig.scoring?.passPoints || 4)),
      maxActions
    );
    const comboTiers = [0, 12, 8, 5, 2, 0];
    const comboBonus = Math.min(comboChain, 5) < comboTiers.length
      ? comboTiers[Math.min(comboChain, 5)]
      : 0;
    const penalties = missedPasses * (safeConfig.scoring?.missPassPenalty || -2);

    const total = Math.max(0, Math.min(100, distanceScore + actionScore + comboBonus + penalties));
    return total;
  }, [successfulDodges, successfulPasses, comboChain, missedPasses, safeConfig.scoring]);

  const handleRoundComplete = useCallback(() => {
    if (roundCompleteHandledRef.current) return;
    roundCompleteHandledRef.current = true;

    const roundScore = calculateRoundScore();
    setRoundScores((prev) => [...prev, roundScore]);

    if (currentRound < 3) {
      setPhase('roundComplete');
    } else {
      const allScores = [...roundScores, roundScore];
      const avgScore = allScores.reduce((a, b) => a + b, 0) / allScores.length;
      const passed = avgScore >= (safeConfig.passThreshold || 60);
      const duration = (Date.now() - gameStartTimeRef.current) / 1000;

      onComplete(
        {
          score: avgScore,
          passed,
          xpEarned: passed ? xpReward : Math.floor(xpReward * 0.25),
          metrics: {
            roundScores: allScores,
            totalDodges: successfulDodges,
            totalPasses: successfulPasses,
            maxCombo: comboChain,
          },
        },
        duration
      );
      setPhase('levelComplete');
    }
  }, [currentRound, roundScores, calculateRoundScore, safeConfig.passThreshold, onComplete, xpReward, successfulDodges, successfulPasses, comboChain]);

  const handleCollision = useCallback(() => {
    if (shields > 0) {
      setShields((s) => s - 1);
      return;
    }
    setPhase('collision');
  }, [shields]);

  const checkCollisions = useCallback(() => {
    const playerX = playerLane * LANE_WIDTH + LANE_WIDTH / 2;

    for (const obs of obstaclesRef.current) {
      if (obs.type === 'teammate_pass') continue;

      const obsX = obs.lane * LANE_WIDTH + LANE_WIDTH / 2;
      const obsY = obs.y;

      const dx = Math.abs(playerX - obsX);
      const dy = Math.abs(PLAYER_Y - obsY);

      if (dx < COLLISION_RADIUS && dy < COLLISION_RADIUS) {
        handleCollision();
        obstaclesRef.current = obstaclesRef.current.filter((o) => o.id !== obs.id);
        setObstacles(obstaclesRef.current);
        return;
      }
    }

    // Check for successful dodges
    const dodgedObstacles = obstaclesRef.current.filter(
      (obs) => obs.y > PLAYER_Y + 50 && obs.type !== 'teammate_pass'
    );

    if (dodgedObstacles.length > 0) {
      setSuccessfulDodges((d) => d + dodgedObstacles.length);
      setComboChain((c) => c + dodgedObstacles.length);
      setScore((s) => s + dodgedObstacles.length * (safeConfig.scoring?.dodgePoints || 2));
      obstaclesRef.current = obstaclesRef.current.filter(
        (obs) => !dodgedObstacles.includes(obs)
      );
      setObstacles(obstaclesRef.current);
    }
  }, [playerLane, handleCollision, safeConfig.scoring]);

  // Pass works anywhere on screen when teammate is visible
  const handlePass = useCallback(() => {
    if (phase !== 'playing') return;

    const nearbyTeammate = obstaclesRef.current.find(
      (obs) =>
        obs.type === 'teammate_pass' &&
        obs.y > 0 &&
        obs.y < FIELD_HEIGHT &&
        obs.teammateLane !== undefined
    );

    if (nearbyTeammate && nearbyTeammate.teammateLane === playerLane) {
      setScore((s) => s + (safeConfig.scoring?.passPoints || 4));
      setSuccessfulPasses((p) => p + 1);
      setComboChain((c) => c + 1);
      obstaclesRef.current = obstaclesRef.current.filter((o) => o.id !== nearbyTeammate.id);
      setObstacles(obstaclesRef.current);
      showFeedback('pass');
    } else if (nearbyTeammate) {
      showFeedback('miss');
      setMissedPasses((m) => m + 1);
      setComboChain(0);
    } else {
      setScore((s) => s + (safeConfig.scoring?.missPassPenalty || -2));
      setMissedPasses((m) => m + 1);
      setComboChain(0);
      showFeedback('miss');
    }
  }, [phase, playerLane, safeConfig.scoring]);

  const moveLeft = useCallback(() => {
    setPlayerLane((lane) => (lane > 0 ? ((lane - 1) as PlayerLane) : lane));
  }, []);

  const moveRight = useCallback(() => {
    setPlayerLane((lane) => (lane < 2 ? ((lane + 1) as PlayerLane) : lane));
  }, []);

  const startRound = useCallback(() => {
    setPhase('countdown');
    setCountdownNum(3);
    setDistance(0);
    distanceRef.current = 0;
    setCurrentSpeed(safeConfig.baseSpeed);
    speedRef.current = safeConfig.baseSpeed;
    setObstacles([]);
    obstaclesRef.current = [];
    setPlayerLane(1);
    setComboChain(0);
    setSuccessfulDodges(0);
    setSuccessfulPasses(0);
    setMissedPasses(0);
    setShields(safeConfig.bonusElements?.shields || 3);
    roundCompleteHandledRef.current = false;
    lastSpawnTimeRef.current = 0;
  }, [safeConfig.baseSpeed, safeConfig.bonusElements]);

  const startNextRound = useCallback(() => {
    setCurrentRound((r) => r + 1);
    startRound();
  }, [startRound]);

  const tryAgain = useCallback(() => {
    startRound();
  }, [startRound]);

  const startGame = useCallback(() => {
    gameStartTimeRef.current = Date.now();
    setRoundScores([]);
    setCurrentRound(1);
    startRound();
  }, [startRound]);

  // Countdown effect
  useEffect(() => {
    if (phase !== 'countdown') return;

    if (countdownNum > 0) {
      const timer = setTimeout(() => setCountdownNum((n) => n - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setPhase('playing');
    }
  }, [phase, countdownNum]);

  // Game loop
  useEffect(() => {
    if (phase !== 'playing') return;

    const gameLoop = setInterval(() => {
      // Update speed
      speedRef.current = Math.min(
        speedRef.current + (safeConfig.accelRate || 0.01),
        (safeConfig.maxSpeed || 3.0) * (roundMods.speedMod || 1)
      );
      setCurrentSpeed(speedRef.current);

      // Update distance
      distanceRef.current += speedRef.current * 0.016 * 2;
      setDistance(distanceRef.current);

      // Check round complete
      if (distanceRef.current >= roundDistanceTarget) {
        handleRoundComplete();
        return;
      }

      // Spawn obstacles
      const now = Date.now();
      const spawnInterval = (safeConfig.obstacleFrequency || 2500) * (roundMods.freqMod || 1);
      if (now - lastSpawnTimeRef.current > spawnInterval) {
        spawnObstacle();
        lastSpawnTimeRef.current = now;
      }

      // Move obstacles
      obstaclesRef.current = obstaclesRef.current
        .map((obs) => ({
          ...obs,
          y: obs.y + speedRef.current * 3,
        }))
        .filter((obs) => obs.y < FIELD_HEIGHT + 100);
      setObstacles(obstaclesRef.current);

      // Check collisions
      checkCollisions();
    }, FRAME_MS);

    return () => clearInterval(gameLoop);
  }, [phase, roundDistanceTarget, handleRoundComplete, spawnObstacle, checkCollisions, safeConfig, roundMods]);

  // Auto-start next round
  useEffect(() => {
    if (phase !== 'roundComplete') return;

    const timer = setTimeout(() => {
      startNextRound();
    }, 2000);

    return () => clearTimeout(timer);
  }, [phase, startNextRound]);

  // Ready screen
  if (phase === 'ready') {
    return (
      <View style={styles.container}>
        <View style={styles.readyContainer}>
          <Text style={styles.titleText}>⚽ DRIBBLE RUSH</Text>
          <Text style={styles.levelText}>Level {levelNumber}</Text>
          <Text style={styles.instructionText}>
            Dodge defenders, pass to teammates, and reach the goal!
          </Text>
          <View style={styles.configInfo}>
            <Text style={styles.configText}>🎯 {safeConfig.distanceTarget}m</Text>
            <Text style={styles.configText}>⚡ {safeConfig.baseSpeed}x</Text>
            <Text style={styles.configText}>🛡️ {safeConfig.bonusElements?.shields || 3}</Text>
          </View>
          <TouchableOpacity style={styles.startButton} onPress={startGame}>
            <Text style={styles.startButtonText}>START</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quitButton} onPress={onQuit}>
            <Text style={styles.quitButtonText}>Back to Games</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Countdown screen
  if (phase === 'countdown') {
    return (
      <View style={styles.container}>
        <View style={styles.countdownContainer}>
          <Text style={styles.countdownText}>{countdownNum || 'GO!'}</Text>
        </View>
      </View>
    );
  }

  // Collision screen
  if (phase === 'collision') {
    return (
      <View style={styles.container}>
        <View style={styles.collisionContainer}>
          <View style={styles.collisionCard}>
            <Text style={styles.collisionTitle}>TACKLED!</Text>
            <Text style={styles.collisionSubtitle}>Round {currentRound} Failed</Text>
            <Text style={styles.collisionTip}>Time your dodges and watch for sliding tackles!</Text>
            <Text style={styles.collisionScore}>
              Distance: {Math.floor(distance)}m / {Math.floor(roundDistanceTarget)}m
            </Text>
            <View style={styles.collisionActions}>
              <TouchableOpacity style={styles.tryAgainButton} onPress={tryAgain}>
                <Text style={styles.tryAgainButtonText}>Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quitButton} onPress={onQuit}>
                <Text style={styles.quitButtonText}>Quit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // Round complete screen
  if (phase === 'roundComplete') {
    const roundScore = roundScores[currentRound - 1] || calculateRoundScore();
    return (
      <View style={styles.container}>
        <View style={styles.overlayContainer}>
          <View style={styles.overlayBox}>
            <Text style={styles.overlayTitle}>Round {currentRound} Complete!</Text>
            <Text style={styles.scoreText}>{roundScore}%</Text>
            <Text style={styles.nextRoundText}>Next round...</Text>
            <TouchableOpacity style={styles.secondaryButton} onPress={tryAgain}>
              <Text style={styles.secondaryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Level complete screen
  if (phase === 'levelComplete') {
    const avgScore = roundScores.reduce((a, b) => a + b, 0) / roundScores.length;
    const passed = avgScore >= (safeConfig.passThreshold || 60);
    const stars = avgScore >= 90 ? 3 : avgScore >= 75 ? 2 : 1;

    return (
      <View style={styles.container}>
        <View style={styles.overlayContainer}>
          <View style={styles.overlayBox}>
            <Text style={styles.overlayTitle}>
              {passed ? 'Level Complete!' : 'Level Failed'}
            </Text>
            <Text style={styles.scoreText}>{Math.floor(avgScore)}%</Text>
            <Text style={styles.starsText}>{'⭐'.repeat(stars)}</Text>
            <View style={styles.roundScoresContainer}>
              {roundScores.map((rs, i) => (
                <Text key={i} style={styles.roundScoreText}>
                  R{i + 1}: {rs}%
                </Text>
              ))}
            </View>
            <Text style={styles.xpText}>+{passed ? xpReward : Math.floor(xpReward * 0.25)} XP</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={onQuit}>
              <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Playing screen
  const progressPercent = Math.min(100, (distance / roundDistanceTarget) * 100);

  return (
    <View style={styles.container}>
      {/* HUD */}
      <View style={styles.hud}>
        <TouchableOpacity style={styles.quitIconButton} onPress={onQuit}>
          <Feather name="x" size={24} color="#ef4444" />
        </TouchableOpacity>
        <View style={styles.hudRow}>
          <Text style={styles.hudText}>⚽ {Math.floor(distance)}m</Text>
          <Text style={styles.hudText}>⚡ {currentSpeed.toFixed(1)}x</Text>
          <Text style={styles.hudText}>Round {currentRound}/3</Text>
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>
        <Text style={styles.progressPct}>{Math.floor(progressPercent)}%</Text>
        {shields > 0 && <Text style={styles.shieldText}>🛡️ {shields}</Text>}
      </View>

      {/* Game Field */}
      <View style={styles.gameField}>
        <SoccerFieldBackground />

        {/* Obstacles */}
        {obstacles.map((obstacle) => {
          // All defenders are RED
          const iconColor = '#ef4444';

          if (obstacle.type === 'teammate_pass') {
            return (
              <React.Fragment key={obstacle.id}>
                {/* Defender (red) */}
                <View
                  style={[
                    styles.obstacleContainer,
                    {
                      top: obstacle.y,
                      left: obstacle.lane * LANE_WIDTH + LANE_WIDTH / 2 - 25,
                    },
                  ]}
                >
                  <PlayerIcon color="#ef4444" size={50} />
                </View>
                {/* Teammate (light blue) */}
                {obstacle.teammateLane !== undefined && (
                  <View
                    style={[
                      styles.obstacleContainer,
                      {
                        top: obstacle.y,
                        left: obstacle.teammateLane * LANE_WIDTH + LANE_WIDTH / 2 - 25,
                      },
                    ]}
                  >
                    <PlayerIcon color="#60a5fa" size={50} />
                    {/* PASS indicator - shows when teammate is on screen */}
                    {obstacle.y > 0 && obstacle.y < FIELD_HEIGHT && (
                      <View style={styles.passIndicator}>
                        <Text style={styles.passIndicatorText}>PASS!</Text>
                      </View>
                    )}
                  </View>
                )}
              </React.Fragment>
            );
          }

          return (
            <View
              key={obstacle.id}
              style={[
                styles.obstacleContainer,
                {
                  top: obstacle.y,
                  left: obstacle.lane * LANE_WIDTH + LANE_WIDTH / 2 - 25,
                },
              ]}
            >
              <PlayerIcon color={iconColor} size={50} />
            </View>
          );
        })}

        {/* Player */}
        <View
          style={[
            styles.player,
            { left: playerLane * LANE_WIDTH + LANE_WIDTH / 2 - 25 },
          ]}
        >
          <PlayerIcon color="#3b82f6" size={50} />
          <View style={styles.ball} />
        </View>

        {/* Combo indicator */}
        {comboChain >= 3 && (
          <View style={styles.comboIndicator}>
            <Text style={styles.comboText}>🔥 {comboChain}x COMBO</Text>
          </View>
        )}

        {/* Pass/Miss Feedback Popup */}
        {feedbackMessage.visible && (
          <View
            style={[
              styles.feedbackPopup,
              feedbackMessage.type === 'pass' ? styles.feedbackPass : styles.feedbackMiss,
            ]}
          >
            <Text style={styles.feedbackIcon}>
              {feedbackMessage.type === 'pass' ? '✅' : '❌'}
            </Text>
            <Text style={styles.feedbackText}>
              {feedbackMessage.type === 'pass' ? 'PASS!' : 'MISS!'}
            </Text>
            <Text style={styles.feedbackPoints}>
              {feedbackMessage.type === 'pass' ? '+4' : '-2'}
            </Text>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity style={styles.controlButton} onPress={moveLeft}>
          <Feather name="chevron-left" size={36} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.controlButton, styles.passButton]} onPress={handlePass}>
          <Text style={styles.controlButtonText}>PASS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={moveRight}>
          <Feather name="chevron-right" size={36} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  readyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  titleText: { fontSize: 28, fontWeight: '700', color: '#f97316', marginBottom: 8 },
  levelText: { fontSize: 22, fontWeight: '600', color: '#ea580c', marginBottom: 16 },
  instructionText: { fontSize: 16, color: '#94a3b8', textAlign: 'center', marginBottom: 24 },
  configInfo: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  configText: { fontSize: 14, color: '#64748b' },
  startButton: { backgroundColor: '#f97316', paddingHorizontal: 48, paddingVertical: 16, borderRadius: 12, marginBottom: 16 },
  startButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  quitButton: { padding: 12 },
  quitButtonText: { color: '#64748b', fontSize: 16 },
  countdownContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  countdownText: { fontSize: 72, fontWeight: '800', color: '#f97316' },
  hud: { height: HUD_HEIGHT, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, justifyContent: 'center', backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155' },
  quitIconButton: { position: 'absolute', top: 8, right: 16, zIndex: 10, width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  hudRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  hudText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  progressBarBg: { height: 6, backgroundColor: '#334155', borderRadius: 3, overflow: 'hidden', marginBottom: 2 },
  progressBarFill: { height: '100%', backgroundColor: '#f97316', borderRadius: 3 },
  progressPct: { color: '#94a3b8', fontSize: 12, textAlign: 'right' },
  shieldText: { position: 'absolute', top: 8, right: 48, color: '#ef4444', fontSize: 14 },
  gameField: { flex: 1, width: FIELD_WIDTH, position: 'relative', overflow: 'hidden' },
  obstacleContainer: { position: 'absolute', width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  passIndicator: { position: 'absolute', top: -25, backgroundColor: '#60a5fa', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  passIndicatorText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  player: { position: 'absolute', bottom: 80, width: 50, height: 60, alignItems: 'center', justifyContent: 'flex-end' },
  ball: { width: 15, height: 15, borderRadius: 7.5, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#1a1a2e', marginTop: -5 },
  controlsContainer: { height: CONTROLS_HEIGHT, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, backgroundColor: '#1a1a2e' },
  controlButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255, 255, 255, 0.3)', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'rgba(255, 255, 255, 0.6)' },
  passButton: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(249, 115, 22, 0.8)', borderColor: '#f97316' },
  controlButtonText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  comboIndicator: { position: 'absolute', top: 120, alignSelf: 'center', backgroundColor: 'rgba(249,115,22,0.9)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  comboText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  collisionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  collisionCard: { backgroundColor: '#1e293b', borderRadius: 16, padding: 24, width: '100%', maxWidth: 320, borderWidth: 2, borderColor: '#ef4444' },
  collisionTitle: { fontSize: 28, fontWeight: '800', color: '#ef4444', textAlign: 'center', marginBottom: 8 },
  collisionSubtitle: { fontSize: 16, color: '#94a3b8', textAlign: 'center', marginBottom: 16 },
  collisionTip: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 16, fontStyle: 'italic' },
  collisionScore: { fontSize: 18, color: '#f97316', textAlign: 'center', marginBottom: 24, fontWeight: '600' },
  collisionActions: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  tryAgainButton: { backgroundColor: '#f97316', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  tryAgainButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  overlayContainer: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.95)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  overlayBox: { backgroundColor: '#1e293b', borderRadius: 16, padding: 28, alignItems: 'center', width: '100%', maxWidth: 320, borderWidth: 2, borderColor: '#334155' },
  overlayTitle: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 16, textAlign: 'center' },
  scoreText: { fontSize: 48, fontWeight: '800', color: '#f97316', marginBottom: 8 },
  starsText: { fontSize: 32, marginVertical: 10 },
  roundScoresContainer: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginVertical: 10 },
  roundScoreText: { color: '#9ca3af', fontSize: 14 },
  xpText: { color: '#f97316', fontSize: 20, fontWeight: 'bold', marginVertical: 10 },
  buttonRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  primaryButton: { backgroundColor: '#f97316', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  secondaryButton: { marginTop: 15, paddingVertical: 12, paddingHorizontal: 30, borderRadius: 8, borderWidth: 2, borderColor: '#f97316', backgroundColor: 'transparent' },
  secondaryButtonText: { color: '#f97316', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  nextRoundText: { color: '#9ca3af', fontSize: 16, marginTop: 10 },
  feedbackPopup: { position: 'absolute', top: '40%', alignSelf: 'center', paddingHorizontal: 30, paddingVertical: 15, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 100 },
  feedbackPass: { backgroundColor: 'rgba(34, 197, 94, 0.9)' },
  feedbackMiss: { backgroundColor: 'rgba(239, 68, 68, 0.9)' },
  feedbackIcon: { fontSize: 24 },
  feedbackText: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  feedbackPoints: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
});
