import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import SpinCueOverlay from './SpinCueOverlay';
import type { AnticipationConfig, GameResult } from '../../types/games';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FIELD_WIDTH = SCREEN_WIDTH - 32;
const FIELD_HEIGHT = SCREEN_HEIGHT * 0.5;

const HIDE_POINT = 0.6; // fraction of path after which ball fades out

const SPIN_GLOW: Record<string, { color: string; opacity: number }> = {
  none: { color: '#ffffff', opacity: 0.15 },
  topspin: { color: '#ef4444', opacity: 0.3 },
  backspin: { color: '#3b82f6', opacity: 0.3 },
  curve_right: { color: '#a855f7', opacity: 0.3 },
  curve_left: { color: '#f59e0b', opacity: 0.3 },
  knuckle: { color: '#ec4899', opacity: 0.3 },
  variable: { color: '#ffffff', opacity: 0.2 },
  changes: { color: '#ffffff', opacity: 0.2 },
};

function getQuadraticBezier(t: number, p0: number, p1: number, p2: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

const DEFAULT_CONFIG = {
  ballSpeed: 2.0,
  showPath: false,
  predictionTime: 3000,
  targetSize: 50,
};

type GamePhase = 'ready' | 'watching' | 'predict' | 'reveal' | 'result';

interface BallTrajectory {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  controlX: number;
  controlY: number;
  trajectoryType: string;
  // Bounce: ball hits ground at (bounceX, bounceY), then arcs to end
  bounceX?: number;
  bounceY?: number;
  control2X?: number;
  control2Y?: number;
}

interface AnticipationArenaGameProps {
  config: AnticipationConfig;
  levelNumber: number;
  xpReward: number;
  /** From game_levels.spin_type column (preferred over config) */
  spinType?: string;
  /** From game_levels.trajectory_type column */
  trajectoryType?: string;
  onComplete: (result: GameResult, durationSeconds: number) => void;
  onQuit: () => void;
}

export default function AnticipationArenaGame({
  config,
  levelNumber,
  xpReward,
  spinType: levelSpinType,
  trajectoryType: levelTrajectoryType,
  onComplete,
  onQuit,
}: AnticipationArenaGameProps) {
  const safeConfig = {
    ballSpeed: config?.ballSpeed > 0 ? config.ballSpeed : DEFAULT_CONFIG.ballSpeed,
    showPath: config?.showPath ?? DEFAULT_CONFIG.showPath,
    predictionTime: config?.predictionTime > 0 ? config.predictionTime : DEFAULT_CONFIG.predictionTime,
    targetSize: config?.targetSize > 0 ? config.targetSize : DEFAULT_CONFIG.targetSize,
  };
  // Use level column spin_type (from DB), not config JSON
  const spinType = levelSpinType ?? (config as { spin_type?: string })?.spin_type ?? 'none';
  const trajectoryType = levelTrajectoryType ?? (config as { trajectory_type?: string })?.trajectory_type ?? 'linear';

  console.log('[AnticipationArena] Config:', {
    original: config,
    safe: safeConfig,
    levelNumber,
  });

  const [phase, setPhase] = useState<GamePhase>('ready');
  const [round, setRound] = useState(1);
  const [scores, setScores] = useState<number[]>([]);
  const [trajectory, setTrajectory] = useState<BallTrajectory | null>(null);
  const [prediction, setPrediction] = useState<{ x: number; y: number } | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [predictionTimer, setPredictionTimer] = useState(safeConfig.predictionTime / 1000);
  const [showSpinCue, setShowSpinCue] = useState(false);

  const ballPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const ballOpacity = useRef(new Animated.Value(1)).current;
  const ballRotation = useRef(new Animated.Value(0)).current;
  const rotationLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const rotationDirectionRef = useRef<1 | -1>(1);
  const startTimeRef = useRef<number>(0);
  const predictionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trajectoryRef = useRef<BallTrajectory | null>(null);
  const totalRounds = 5;
  const acceptableRadius = safeConfig.targetSize;

  // Generate random trajectory with control point (and optional bounce) based on trajectory_type
  const generateTrajectory = useCallback((): BallTrajectory => {
    const padding = 60;
    const midX = (start: number, end: number) => (start + end) / 2;
    const midY = (start: number, end: number) => (start + end) / 2;

    const side = Math.floor(Math.random() * 4);
    let startX: number, startY: number;

    switch (side) {
      case 0:
        startX = padding + Math.random() * (FIELD_WIDTH - padding * 2);
        startY = padding;
        break;
      case 1:
        startX = FIELD_WIDTH - padding;
        startY = padding + Math.random() * (FIELD_HEIGHT - padding * 2);
        break;
      case 2:
        startX = padding + Math.random() * (FIELD_WIDTH - padding * 2);
        startY = FIELD_HEIGHT - padding;
        break;
      default:
        startX = padding;
        startY = padding + Math.random() * (FIELD_HEIGHT - padding * 2);
    }

    const endX = padding + Math.random() * (FIELD_WIDTH - padding * 2);
    const endY = padding + Math.random() * (FIELD_HEIGHT - padding * 2);

    const spin = (spinType ?? 'none').toLowerCase().replace(/\s+/g, '_');
    let type: string = trajectoryType === 'random'
      ? ['linear', 'arc_low', 'arc_high', 'curve', 'driven', 'arc_float', 'bounce', 'deflection', 'knuckleball'][Math.floor(Math.random() * 9)]
      : trajectoryType;

    // Enforce spinType → trajectoryType so spin drives the curve
    if (spin === 'topspin') {
      type = ['arc_low', 'driven'][Math.floor(Math.random() * 2)];
    } else if (spin === 'backspin') {
      type = ['arc_float', 'arc_high'][Math.floor(Math.random() * 2)];
    } else if (spin === 'curve_right') {
      type = 'curve';
    } else if (spin === 'curve_left') {
      type = 'curve';
    } else if (spin === 'knuckle') {
      type = 'knuckleball';
    }
    // none / variable / changes: leave type as is

    let controlX: number, controlY: number;
    let bounceX: number | undefined, bounceY: number | undefined, control2X: number | undefined, control2Y: number | undefined;

    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    const midYVal = midY(startY, endY);

    switch (type) {
      case 'linear':
        controlX = midX(startX, endX);
        controlY = midY(startY, endY);
        break;
      case 'arc_low':
        controlX = midX(startX, endX);
        controlY = minY - 40;
        break;
      case 'arc_high':
        controlX = midX(startX, endX);
        controlY = minY - 80;
        break;
      case 'arc_float':
        controlX = midX(startX, endX);
        controlY = minY - 100;
        break;
      case 'curve': {
        const curveDir = (spinType === 'curve_right' || spinType === 'curve_left') ? (spinType === 'curve_right' ? 1 : -1) : (Math.random() > 0.5 ? 1 : -1);
        controlX = midX(startX, endX) + curveDir * 55;
        controlY = midY(startY, endY);
        break;
      }
      case 'driven':
        controlX = midX(startX, endX);
        controlY = midYVal + 30;
        break;
      case 'bounce': {
        controlX = midX(startX, endX);
        controlY = minY - 30;
        bounceX = midX(startX, endX) + (Math.random() - 0.5) * 40;
        bounceY = FIELD_HEIGHT - padding - 20;
        control2X = midX(bounceX, endX);
        control2Y = bounceY - 50;
        break;
      }
      case 'deflection': {
        const defX = midX(startX, endX) + (Math.random() - 0.5) * 80;
        const defY = midY(startY, endY) + (Math.random() - 0.5) * 60;
        controlX = defX;
        controlY = defY;
        bounceX = defX;
        bounceY = defY;
        control2X = midX(defX, endX);
        control2Y = midY(defY, endY);
        break;
      }
      case 'knuckleball':
        controlX = midX(startX, endX) + (Math.random() - 0.5) * 60;
        controlY = midY(startY, endY) + (Math.random() - 0.5) * 60;
        break;
      default:
        controlX = midX(startX, endX);
        controlY = midY(startY, endY);
    }

    return {
      startX, startY, endX, endY, controlX, controlY, trajectoryType: type,
      ...(bounceX !== undefined && { bounceX, bounceY: bounceY!, control2X, control2Y }),
    };
  }, [trajectoryType, spinType]);

  // Start game
  const startGame = () => {
    startTimeRef.current = Date.now();
    setCountdown(3);

    let count = 3;
    const countdownInterval = setInterval(() => {
      count--;
      setCountdown(count);
      if (count === 0) {
        clearInterval(countdownInterval);
        startRound();
      }
    }, 1000);
  };

  // Handle user tap to predict (trajOverride used when called from timer timeout)
  const handlePrediction = useCallback((x: number, y: number, trajOverride?: BallTrajectory | null) => {
    const traj = trajOverride ?? trajectory;
    if (phase !== 'predict' || !traj) return;

    if (predictionIntervalRef.current) {
      clearInterval(predictionIntervalRef.current);
      predictionIntervalRef.current = null;
    }

    setPrediction({ x, y });

    const landing = getEffectiveLanding(traj);
    const distance = Math.sqrt(
      Math.pow(x - landing.x, 2) + Math.pow(y - landing.y, 2)
    );
    const maxDistance = Math.sqrt(FIELD_WIDTH ** 2 + FIELD_HEIGHT ** 2);
    const roundScore = Math.max(0, Math.round(100 - (distance / maxDistance) * 150));
    setScores(prev => [...prev, roundScore]);

    setPhase('reveal');
    ballOpacity.setValue(1);
    ballPosition.setValue({ x: landing.x, y: landing.y });

    setTimeout(() => {
      if (round < totalRounds) {
        setRound(prev => prev + 1);
        startRound();
      } else {
        setPhase('result');
      }
    }, 2000);
  }, [phase, trajectory, round, getEffectiveLanding]);

  // Get position along trajectory at path progress t in [0, 1] (t up to HIDE_POINT for visible segment)
  const getPositionAt = useCallback((pathT: number, traj: BallTrajectory): { x: number; y: number } => {
    const hasBounce = traj.bounceX !== undefined && traj.bounceY !== undefined;
    const isDeflection = traj.trajectoryType === 'deflection';

    if (hasBounce || isDeflection) {
      const split = traj.trajectoryType === 'bounce' ? 0.55 : 0.5;
      const c2X = traj.control2X ?? traj.endX;
      const c2Y = traj.control2Y ?? traj.endY;
      const bx = traj.bounceX ?? traj.endX;
      const by = traj.bounceY ?? traj.endY;

      if (pathT <= split) {
        const t1 = pathT / split;
        return {
          x: getQuadraticBezier(t1, traj.startX, traj.controlX, bx),
          y: getQuadraticBezier(t1, traj.startY, traj.controlY, by),
        };
      }
      const t2 = (pathT - split) / (1 - split);
      return {
        x: getQuadraticBezier(t2, bx, c2X, traj.endX),
        y: getQuadraticBezier(t2, by, c2Y, traj.endY),
      };
    }

    return {
      x: getQuadraticBezier(pathT, traj.startX, traj.controlX, traj.endX),
      y: getQuadraticBezier(pathT, traj.startY, traj.controlY, traj.endY),
    };
  }, []);

  // Effective landing position: for knuckleball, apply same wobble offset as display at pathT=1 so scoring matches what the player sees
  const getEffectiveLanding = useCallback((traj: BallTrajectory): { x: number; y: number } => {
    if (traj.trajectoryType !== 'knuckleball') {
      return { x: traj.endX, y: traj.endY };
    }
    const pathEndValue = 1;
    const wobbleAtEnd = (1 - pathEndValue) * 8;
    return {
      x: traj.endX + wobbleAtEnd * Math.sin(pathEndValue * 20),
      y: traj.endY + wobbleAtEnd * Math.cos(pathEndValue * 17),
    };
  }, []);

  // Run ball animation (bezier path; scoring still uses traj.endX, traj.endY)
  const runBallAnimation = useCallback(() => {
    const traj = trajectoryRef.current;
    if (!traj) return;

    const travelDuration = 1500 / Math.max(safeConfig.ballSpeed, 0.5);
    const durationMs = travelDuration * HIDE_POINT;

    // Start rotation loop based on spin type
    const startRotationLoop = () => {
      const norm = (spinType ?? 'none').toLowerCase().replace(/\s+/g, '_');
      let duration = 2000;
      let direction: 1 | -1 = 1;

      if (norm === 'none') {
        duration = 2000;
        direction = 1;
      } else if (norm === 'topspin') {
        duration = 400;
        direction = 1;
      } else if (norm === 'backspin') {
        duration = 500;
        direction = -1;
      } else if (norm === 'curve_right') {
        duration = 600;
        direction = 1;
      } else if (norm === 'curve_left') {
        duration = 600;
        direction = -1;
      } else if (norm === 'knuckle') {
        const anim = Animated.loop(
          Animated.sequence([
            Animated.timing(ballRotation, { toValue: 1, duration: 300, useNativeDriver: false }),
            Animated.timing(ballRotation, { toValue: 0, duration: 300, useNativeDriver: false }),
          ])
        );
        rotationLoopRef.current = anim;
        anim.start();
        return;
      } else {
        duration = 800;
        direction = 1;
      }

      const oneLap = Animated.sequence([
        Animated.timing(ballRotation, {
          toValue: 1,
          duration,
          useNativeDriver: false,
        }),
        Animated.timing(ballRotation, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ]);
      rotationLoopRef.current = Animated.loop(oneLap);
      rotationLoopRef.current.start();
    };

    startRotationLoop();

    const progress = new Animated.Value(0);
    const listenerId = progress.addListener(({ value }) => {
      const pathT = value * HIDE_POINT;
      let { x, y } = getPositionAt(pathT, traj);
      if (traj.trajectoryType === 'knuckleball') {
        const wobble = (1 - value) * 8;
        x += wobble * Math.sin(value * 20);
        y += wobble * Math.cos(value * 17);
      }
      ballPosition.setValue({ x, y });
    });

    Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      useNativeDriver: false,
    }).start(() => {
      progress.removeListener(listenerId);
      if (rotationLoopRef.current) {
        rotationLoopRef.current.stop();
        rotationLoopRef.current = null;
      }

      Animated.timing(ballOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: false,
      }).start(() => {
        setPhase('predict');
        setPredictionTimer(safeConfig.predictionTime / 1000);

        if (predictionIntervalRef.current) clearInterval(predictionIntervalRef.current);
        predictionIntervalRef.current = setInterval(() => {
          setPredictionTimer(prev => {
            if (prev <= 1) {
              if (predictionIntervalRef.current) {
                clearInterval(predictionIntervalRef.current);
                predictionIntervalRef.current = null;
              }
              const t = trajectoryRef.current;
              if (t) handlePrediction(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, t);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      });
    });
  }, [safeConfig.ballSpeed, safeConfig.predictionTime, spinType, ballPosition, ballOpacity, ballRotation, handlePrediction, getPositionAt]);

  // Start a round: set up trajectory, show spin cue (or skip on round 5), then run ball animation
  const startRound = useCallback(() => {
    const traj = generateTrajectory();
    trajectoryRef.current = traj;
    setTrajectory(traj);
    setPrediction(null);
    setPhase('watching');

    ballPosition.setValue({ x: traj.startX, y: traj.startY });
    ballOpacity.setValue(1);
    ballRotation.setValue(0);

    if (round >= 5) {
      // Round 5: no cues, start ball immediately
      runBallAnimation();
    } else {
      setShowSpinCue(true);
    }
  }, [generateTrajectory, round, ballPosition, ballOpacity, runBallAnimation]);

  // Handle field tap
  const handleFieldTap = (event: { nativeEvent: { locationX: number; locationY: number } }) => {
    if (phase !== 'predict') return;
    const { locationX, locationY } = event.nativeEvent;
    handlePrediction(locationX, locationY);
  };

  // Calculate final results
  const handleComplete = () => {
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const isPerfect = avgScore >= 95;
    const xpEarned = isPerfect ? xpReward + 10 : Math.round((avgScore / 100) * xpReward);
    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);

    const result: GameResult = {
      score: avgScore,
      accuracy: avgScore,
      xpEarned,
      isPerfect,
      levelCompleted: avgScore >= 60,
      newHighScore: false,
    };

    onComplete(result, durationSeconds);
  };

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (predictionIntervalRef.current) clearInterval(predictionIntervalRef.current);
    };
  }, []);

  // Ready screen
  if (phase === 'ready') {
    return (
      <View style={styles.container}>
        <View style={styles.readyContainer}>
          <Text style={styles.titleText}>🎯 Anticipation Arena</Text>
          <Text style={styles.levelText}>Level {levelNumber}</Text>
          <Text style={styles.instructionText}>
            Watch the ball's path, then tap where you think it will land
          </Text>
          <View style={styles.configInfo}>
            <Text style={styles.configText}>⚡ Speed: {safeConfig.ballSpeed}x</Text>
            <Text style={styles.configText}>⏱️ {safeConfig.predictionTime / 1000}s to predict</Text>
            <Text style={styles.configText}>🎯 {totalRounds} rounds</Text>
          </View>
          {countdown > 0 && countdown < 4 ? (
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownText}>{countdown}</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.startButton} onPress={startGame}>
                <Text style={styles.startButtonText}>Start Game</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quitButton} onPress={onQuit}>
                <Text style={styles.quitButtonText}>Quit</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  // Result screen
  if (phase === 'result') {
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    return (
      <View style={styles.container}>
        <View style={styles.resultContainer}>
          <Text style={styles.resultTitle}>Game Complete!</Text>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreText}>{avgScore}%</Text>
          </View>
          <Text style={styles.scoreLabel}>
            {avgScore >= 90 ? '🎉 Amazing anticipation!' :
              avgScore >= 70 ? '👍 Good predictions!' :
                avgScore >= 50 ? '💪 Keep practicing!' : '🔄 Try again!'}
          </Text>

          <View style={styles.roundScoresRow}>
            {scores.map((score, idx) => (
              <View key={idx} style={styles.roundScoreItem}>
                <Text style={styles.roundScoreLabel}>R{idx + 1}</Text>
                <Text style={[
                  styles.roundScoreValue,
                  score >= 70 && styles.roundScoreGood,
                  score < 40 && styles.roundScoreBad,
                ]}>{score}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.nextButton} onPress={handleComplete}>
            <Text style={styles.nextButtonText}>See Results</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Game screen (watching, predict, reveal)
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onQuit} style={styles.quitIconButton}>
          <Feather name="x" size={24} color="#94a3b8" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.phaseText}>
            {phase === 'watching' && '👀 WATCH'}
            {phase === 'predict' && '👆 TAP TO PREDICT'}
            {phase === 'reveal' && '📍 RESULT'}
          </Text>
          {phase === 'predict' && (
            <Text style={[styles.timerText, predictionTimer <= 2 && styles.timerUrgent]}>
              {predictionTimer}s
            </Text>
          )}
        </View>
        <View style={styles.roundBadge}>
          <Text style={styles.roundBadgeText}>{round}/{totalRounds}</Text>
        </View>
      </View>

      <View style={styles.instructionBar}>
        <Text style={styles.instructionBarText}>
          {phase === 'watching' && 'Watch where the ball is going...'}
          {phase === 'predict' && 'Tap where the ball will land!'}
          {phase === 'reveal' && `Score: ${scores[scores.length - 1] ?? 0} points`}
        </Text>
      </View>

      <View style={styles.fieldContainer}>
        <SpinCueOverlay
          spinType={spinType}
          roundNumber={round}
          visible={showSpinCue}
          onComplete={() => {
            setShowSpinCue(false);
            runBallAnimation();
          }}
        />
        <TouchableOpacity
          style={styles.field}
          onPress={handleFieldTap}
          activeOpacity={1}
          disabled={phase !== 'predict'}
        >
          <View style={styles.fieldBorder}>
            <View style={styles.centerLine} />
            <View style={styles.centerCircle} />
            <View style={styles.penaltyAreaTop} />
            <View style={styles.penaltyAreaBottom} />

            {safeConfig.showPath && trajectory && phase === 'watching' && (
              <View style={[
                styles.trajectoryHint,
                {
                  left: trajectory.startX,
                  top: trajectory.startY,
                  width: 4,
                  height: 40,
                  transform: [
                    { rotate: `${Math.atan2(
                      trajectory.endY - trajectory.startY,
                      trajectory.endX - trajectory.startX
                    ) * 180 / Math.PI + 90}deg` }
                  ],
                }
              ]} />
            )}

            <Animated.View
              style={[
                styles.ballWrapper,
                {
                  left: Animated.subtract(ballPosition.x, 20),
                  top: Animated.subtract(ballPosition.y, 20),
                  opacity: ballOpacity,
                },
              ]}
            >
              <View
                style={[
                  styles.ballGlow,
                  {
                    backgroundColor: (SPIN_GLOW[spinType ?? 'none'] ?? SPIN_GLOW.none).color,
                    opacity: (SPIN_GLOW[spinType ?? 'none'] ?? SPIN_GLOW.none).opacity,
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.ball,
                  {
                    transform: [
                      {
                        rotate: ballRotation.interpolate({
                          inputRange: [0, 1],
                          outputRange: (() => {
                            const n = (spinType ?? 'none').toLowerCase().replace(/\s+/g, '_');
                            const reverse = n === 'backspin' || n === 'curve_left';
                            return reverse ? ['0deg', '-360deg'] : ['0deg', '360deg'];
                          })(),
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Text style={styles.ballEmoji}>⚽</Text>
              </Animated.View>
            </Animated.View>

            {prediction && (
              <View
                style={[
                  styles.predictionMarker,
                  { left: prediction.x - 20, top: prediction.y - 20 },
                ]}
              >
                <Feather name="crosshair" size={40} color="#3b82f6" />
              </View>
            )}

            {phase === 'reveal' && trajectory && (() => {
              const landing = getEffectiveLanding(trajectory);
              return (
              <View
                style={[
                  styles.actualMarker,
                  { left: landing.x - 25, top: landing.y - 25 },
                ]}
              >
                <View style={styles.actualMarkerInner}>
                  <Feather name="check-circle" size={30} color="#10b981" />
                </View>
              </View>
            );
            })()}
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.scoresRow}>
        {scores.map((score, idx) => (
          <View key={idx} style={styles.scoreChip}>
            <Text style={styles.scoreChipText}>{score}</Text>
          </View>
        ))}
        {Array(totalRounds - scores.length).fill(0).map((_, idx) => (
          <View key={`empty-${idx}`} style={styles.scoreChipEmpty} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
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
    color: '#06b6d4',
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
    gap: 12,
    marginBottom: 32,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  configText: {
    fontSize: 14,
    color: '#64748b',
  },
  countdownContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#06b6d4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
  },
  startButton: {
    backgroundColor: '#06b6d4',
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
    color: '#06b6d4',
    marginTop: 4,
  },
  timerUrgent: {
    color: '#ef4444',
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
  instructionBar: {
    backgroundColor: '#1e293b',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  instructionBarText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  fieldContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
    flex: 1,
  },
  field: {
    width: FIELD_WIDTH,
    height: FIELD_HEIGHT,
    backgroundColor: '#2d8a4e',
    borderRadius: 4,
    overflow: 'hidden',
  },
  fieldBorder: {
    flex: 1,
    margin: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 2,
    position: 'relative',
  },
  centerLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  centerCircle: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    top: '50%',
    left: '50%',
    marginTop: -30,
    marginLeft: -30,
  },
  penaltyAreaTop: {
    position: 'absolute',
    top: 0,
    left: '25%',
    width: '50%',
    height: '18%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    borderTopWidth: 0,
  },
  penaltyAreaBottom: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    width: '50%',
    height: '18%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    borderBottomWidth: 0,
  },
  trajectoryHint: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
  },
  ballWrapper: {
    position: 'absolute',
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ballGlow: {
    position: 'absolute',
    width: 56,
    height: 56,
    left: -8,
    top: -8,
    borderRadius: 28,
  },
  ball: {
    position: 'absolute',
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ballEmoji: {
    fontSize: 36,
  },
  predictionMarker: {
    position: 'absolute',
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actualMarker: {
    position: 'absolute',
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actualMarkerInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#10b981',
  },
  scoresRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  scoreChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#06b6d4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreChipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  scoreChipEmpty: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#334155',
  },
  resultContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  resultTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 24,
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#06b6d4',
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
  roundScoresRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  roundScoreItem: {
    alignItems: 'center',
  },
  roundScoreLabel: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 4,
  },
  roundScoreValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  roundScoreGood: {
    color: '#10b981',
  },
  roundScoreBad: {
    color: '#ef4444',
  },
  nextButton: {
    backgroundColor: '#06b6d4',
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
