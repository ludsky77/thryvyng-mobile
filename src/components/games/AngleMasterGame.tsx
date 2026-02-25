import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import type { AngleMasterConfig, GameResult } from '../../types/games';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PAD = 16;
// Safe area: dedicated gutter so exit targets never touch screen edge
const FIELD_SIZE = SCREEN_WIDTH - PAD * 4;
const CELL = FIELD_SIZE / 6;
const GRID = 6;
const BALL_SIZE = Math.min(28, CELL * 0.6);
const ENTRY_ARROW_SIZE = Math.round(CELL * 0.4);

const MEMORIZE_MS = 3000;
const TRIALS_PER_LEVEL = 3;
const PASS_PERCENT = 67;


const COLORS = {
  background: '#0a1612',
  fieldDark: '#0D1F17',
  fieldLight: '#133320',
  fieldBorder: '#2d5a3d',
  gridLine: 'rgba(255,255,255,0.08)',
  angle: '#FFFFFF',
  angleFlash: '#FFFFFF',
  trail: '#FFFFFF',
  trailGlow: 'rgba(255,255,255,0.3)',
  entryGlow: '#3B82F6',
  entryArrow: '#3B82F6',
  exitZone: '#374151',
  exitCorrect: '#3B82F6',
  exitWrong: '#F97316',
  exitMissed: '#EF4444',
  theme: '#F59E0B',
};

type Dir = 'up' | 'down' | 'left' | 'right';
type AngleType = 'nw-se' | 'ne-sw';

interface AngleCell {
  row: number;
  col: number;
  type: AngleType;
  isDecoy: boolean;
}

interface GridCell {
  row: number;
  col: number;
}

interface Scenario {
  startEdge: Dir;
  startPos: number;
  activeAngles: AngleCell[];
  decoys: AngleCell[];
  pathCells: GridCell[];
  correctExitZone: number;
}

type GamePhase = 'ready' | 'memorize' | 'predict' | 'reveal' | 'trialResult' | 'levelComplete';

function getLevelConfig(levelNumber: number): { realAngles: number; decoys: number; xp: number } {
  const configs: Record<number, { realAngles: number; decoys: number; xp: number }> = {
    1: { realAngles: 2, decoys: 0, xp: 20 },
    2: { realAngles: 2, decoys: 1, xp: 25 },
    3: { realAngles: 3, decoys: 0, xp: 30 },
    4: { realAngles: 3, decoys: 1, xp: 35 },
    5: { realAngles: 3, decoys: 2, xp: 40 },
    6: { realAngles: 4, decoys: 1, xp: 45 },
    7: { realAngles: 4, decoys: 2, xp: 50 },
    8: { realAngles: 4, decoys: 3, xp: 55 },
    9: { realAngles: 5, decoys: 2, xp: 60 },
    10: { realAngles: 5, decoys: 3, xp: 65 },
    11: { realAngles: 6, decoys: 2, xp: 70 },
    12: { realAngles: 6, decoys: 3, xp: 75 },
    13: { realAngles: 6, decoys: 4, xp: 80 },
    14: { realAngles: 7, decoys: 3, xp: 90 },
    15: { realAngles: 7, decoys: 4, xp: 100 },
  };
  return configs[levelNumber] ?? configs[15];
}

// ═══════════════════════════════════════════════════════════════════════
// COORDINATE SYSTEM - Single source of truth (safe-area grid)
// Row/col 0–5 = inside grid. Row/col -1 or 6 = exit targets in gutters.
// Math: x = (col + 0.5) * CELL, y = (row + 0.5) * CELL
// ═══════════════════════════════════════════════════════════════════════

function getCoordinate(row: number, col: number): { x: number; y: number } {
  return {
    x: (col + 0.5) * CELL,
    y: (row + 0.5) * CELL,
  };
}

function getEntryPixel(edge: Dir, pos: number): { x: number; y: number } {
  const offset = CELL * 0.15;
  switch (edge) {
    case 'left': return { x: -offset, y: (pos + 0.5) * CELL };
    case 'right': return { x: FIELD_SIZE + offset, y: (pos + 0.5) * CELL };
    case 'up': return { x: (pos + 0.5) * CELL, y: -offset };
    case 'down': return { x: (pos + 0.5) * CELL, y: FIELD_SIZE + offset };
  }
}

function getExitZonePixel(zoneIndex: number): { x: number; y: number } {
  const offset = CELL * 0.15;
  if (zoneIndex < 6) {
    return { x: (zoneIndex + 0.5) * CELL, y: -offset };
  } else if (zoneIndex < 12) {
    return { x: FIELD_SIZE + offset, y: (zoneIndex - 6 + 0.5) * CELL };
  } else if (zoneIndex < 18) {
    return { x: (zoneIndex - 12 + 0.5) * CELL, y: FIELD_SIZE + offset };
  } else {
    return { x: -offset, y: (zoneIndex - 18 + 0.5) * CELL };
  }
}

function getStartCell(edge: Dir, pos: number): { row: number; col: number; dr: number; dc: number } {
  switch (edge) {
    case 'left': return { row: pos, col: 0, dr: 0, dc: 1 };
    case 'right': return { row: pos, col: GRID - 1, dr: 0, dc: -1 };
    case 'up': return { row: 0, col: pos, dr: 1, dc: 0 };
    case 'down': return { row: GRID - 1, col: pos, dr: -1, dc: 0 };
  }
}

function calculateExitZone(row: number, col: number, dr: number, dc: number): number {
  const exitRow = row + dr;
  const exitCol = col + dc;
  if (exitRow < 0) return col;
  if (exitCol >= GRID) return 6 + row;
  if (exitRow >= GRID) return 12 + col;
  if (exitCol < 0) return 18 + row;
  return -1;
}

// ═══════════════════════════════════════════════════════════════════════
// COLLISION LOGIC - 90° bounce matrix
// ═══════════════════════════════════════════════════════════════════════

const BOUNCE_MATRIX: Record<AngleType, Record<string, { dr: number; dc: number }>> = {
  'nw-se': {
    '0,1': { dr: 1, dc: 0 },
    '0,-1': { dr: -1, dc: 0 },
    '-1,0': { dr: 0, dc: -1 },
    '1,0': { dr: 0, dc: 1 },
  },
  'ne-sw': {
    '0,1': { dr: -1, dc: 0 },
    '0,-1': { dr: 1, dc: 0 },
    '-1,0': { dr: 0, dc: 1 },
    '1,0': { dr: 0, dc: -1 },
  },
};

function applyBounce(dr: number, dc: number, angleType: AngleType): { dr: number; dc: number } {
  const key = `${dr},${dc}`;
  return BOUNCE_MATRIX[angleType][key] ?? { dr, dc };
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIO GENERATION - Pure grid logic, no pixels
// ═══════════════════════════════════════════════════════════════════════

function generateScenario(activeCount: number, decoyCount: number): Scenario {
  const MAX_ATTEMPTS = 100;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const edges: Dir[] = ['left', 'right', 'up', 'down'];
    const startEdge = edges[Math.floor(Math.random() * 4)];
    const startPos = Math.floor(Math.random() * GRID);

    let { row, col, dr, dc } = getStartCell(startEdge, startPos);

    const pathCells: GridCell[] = [];
    const activeAngles: AngleCell[] = [];
    const occupiedCells = new Set<string>();
    let anglesPlaced = 0;
    let safety = 30;

    while (safety-- > 0) {
      if (row < 0 || row >= GRID || col < 0 || col >= GRID) {
        break;
      }

      const cellKey = `${row},${col}`;
      pathCells.push({ row, col });
      occupiedCells.add(cellKey);

      const needMoreAngles = anglesPlaced < activeCount;
      const nextRow = row + dr;
      const nextCol = col + dc;
      const willExitNext = nextRow < 0 || nextRow >= GRID || nextCol < 0 || nextCol >= GRID;

      const shouldPlace = needMoreAngles && (
        (willExitNext && anglesPlaced < activeCount) ||
        (!willExitNext && Math.random() < 0.35)
      );

      if (shouldPlace) {
        const types: AngleType[] = ['nw-se', 'ne-sw'];
        let chosenType: AngleType | null = null;

        for (const type of types.sort(() => Math.random() - 0.5)) {
          const newVel = applyBounce(dr, dc, type);
          const testRow = row + newVel.dr;
          const testCol = col + newVel.dc;

          if (anglesPlaced === activeCount - 1) {
            chosenType = type;
            break;
          }

          if (testRow >= 0 && testRow < GRID && testCol >= 0 && testCol < GRID) {
            chosenType = type;
            break;
          }
        }

        if (chosenType) {
          activeAngles.push({ row, col, type: chosenType, isDecoy: false });
          const newVel = applyBounce(dr, dc, chosenType);
          dr = newVel.dr;
          dc = newVel.dc;
          anglesPlaced++;
        }
      }

      row += dr;
      col += dc;
    }

    if (anglesPlaced !== activeCount) continue;

    const exitZone = calculateExitZone(row - dr, col - dc, dr, dc);
    if (exitZone < 0 || exitZone > 23) continue;

    const decoys: AngleCell[] = [];
    const available: GridCell[] = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!occupiedCells.has(`${r},${c}`)) {
          available.push({ row: r, col: c });
        }
      }
    }
    available.sort(() => Math.random() - 0.5);

    for (let i = 0; i < decoyCount && i < available.length; i++) {
      decoys.push({
        row: available[i].row,
        col: available[i].col,
        type: Math.random() < 0.5 ? 'nw-se' : 'ne-sw',
        isDecoy: true,
      });
    }

    return {
      startEdge,
      startPos,
      activeAngles,
      decoys,
      pathCells,
      correctExitZone: exitZone,
    };
  }

  return generateScenario(Math.max(1, activeCount - 1), 0);
}

function getScenarioSignature(scenario: Scenario): string {
  const anglesSig = scenario.activeAngles
    .map((a) => `${a.row},${a.col},${a.type}`)
    .sort()
    .join('|');
  const decoysSig = scenario.decoys
    .map((d) => `${d.row},${d.col}`)
    .sort()
    .join('|');
  return `${scenario.startEdge}-${scenario.startPos}-${anglesSig}-${decoysSig}`;
}

function generateUniqueScenario(
  activeCount: number,
  decoyCount: number,
  usedSignatures: Set<string>,
  maxAttempts: number = 20
): Scenario {
  for (let i = 0; i < maxAttempts; i++) {
    const scenario = generateScenario(activeCount, decoyCount);
    const signature = getScenarioSignature(scenario);
    if (!usedSignatures.has(signature)) {
      return scenario;
    }
  }
  return generateScenario(activeCount, decoyCount);
}

function buildAnimationPath(scenario: Scenario): {
  x: number;
  y: number;
  isAngle: boolean;
  angleIndex: number | null;
}[] {
  const points: { x: number; y: number; isAngle: boolean; angleIndex: number | null }[] = [];

  const angleMap = new Map<string, number>();
  scenario.activeAngles.forEach((a, i) => angleMap.set(`${a.row},${a.col}`, i));

  const entry = getEntryPixel(scenario.startEdge, scenario.startPos);
  points.push({ x: entry.x, y: entry.y, isAngle: false, angleIndex: null });

  for (const cell of scenario.pathCells) {
    const pixel = getCoordinate(cell.row, cell.col);
    const angleIndex = angleMap.get(`${cell.row},${cell.col}`) ?? null;
    points.push({
      x: pixel.x,
      y: pixel.y,
      isAngle: angleIndex !== null,
      angleIndex,
    });
  }

  const exit = getExitZonePixel(scenario.correctExitZone);
  points.push({ x: exit.x, y: exit.y, isAngle: false, angleIndex: null });

  return points;
}

function AngleBar({ angle, isFlashing }: { angle: AngleCell; isFlashing: boolean }) {
  const lineLength = CELL * 0.6;
  const half = lineLength / 2;
  const cx = CELL / 2;
  const cy = CELL / 2;

  const coords = angle.type === 'nw-se'
    ? { x1: cx - half, y1: cy - half, x2: cx + half, y2: cy + half }
    : { x1: cx + half, y1: cy - half, x2: cx - half, y2: cy + half };

  return (
    <View style={[
      { width: CELL, height: CELL },
      isFlashing && styles.angleFlashWrap,
    ]}>
      <Svg width={CELL} height={CELL}>
        <Line
          x1={coords.x1}
          y1={coords.y1}
          x2={coords.x2}
          y2={coords.y2}
          stroke="#FFFFFF"
          strokeWidth={5}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

function SoccerCelebration() {
  const balls = useRef(
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: new Animated.Value(Math.random() * SCREEN_WIDTH),
      y: new Animated.Value(-50),
      rotate: new Animated.Value(0),
      delay: Math.random() * 500,
    }))
  ).current;

  useEffect(() => {
    balls.forEach((ball) => {
      const fallDuration = 2000 + Math.random() * 1000;
      Animated.parallel([
        Animated.timing(ball.y, {
          toValue: SCREEN_HEIGHT + 50,
          duration: fallDuration,
          delay: ball.delay,
          useNativeDriver: true,
        }),
        Animated.timing(ball.rotate, {
          toValue: 360 * (2 + Math.random() * 2),
          duration: fallDuration,
          delay: ball.delay,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {balls.map((ball) => (
        <Animated.Text
          key={ball.id}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            fontSize: 30 + Math.random() * 20,
            transform: [
              { translateX: ball.x },
              { translateY: ball.y },
              {
                rotate: ball.rotate.interpolate({
                  inputRange: [0, 1440],
                  outputRange: ['0deg', '1440deg'],
                }),
              },
            ],
          }}
        >
          ⚽
        </Animated.Text>
      ))}
    </View>
  );
}

interface AngleMasterGameProps {
  config: AngleMasterConfig;
  levelNumber: number;
  xpReward: number;
  onComplete: (result: GameResult, durationSeconds: number) => void;
  onQuit: () => void;
}

export default function AngleMasterGame({
  config,
  levelNumber,
  xpReward,
  onComplete,
  onQuit,
}: AngleMasterGameProps) {
  const levelConfig = getLevelConfig(levelNumber);
  const realAngles = config?.activeAngles ?? levelConfig.realAngles;
  const decoysCount = levelConfig.decoys;
  const xp = config?.xpReward ?? xpReward ?? levelConfig.xp;

  const [phase, setPhase] = useState<GamePhase>('ready');
  const [trial, setTrial] = useState(1);
  const [trialScores, setTrialScores] = useState<number[]>([]);
  const [streak, setStreak] = useState(0);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [selectedExitZone, setSelectedExitZone] = useState<number | null>(null);
  const [memorizeTimeLeft, setMemorizeTimeLeft] = useState(MEMORIZE_MS / 1000);
  const [trialCorrect, setTrialCorrect] = useState(false);
  const [revealedAngles, setRevealedAngles] = useState<Set<number>>(new Set());
  const [flashingAngleIndex, setFlashingAngleIndex] = useState<number | null>(null);
  const [ballPathIndex, setBallPathIndex] = useState<number>(-1);
  const [showScorePopup, setShowScorePopup] = useState(false);
  const [lastScore, setLastScore] = useState(0);
  const [ballPosition, setBallPosition] = useState({ x: 0, y: 0 });
  const [trailPoints, setTrailPoints] = useState<{ x: number; y: number }[]>([]);
  const [usedScenarios, setUsedScenarios] = useState<Set<string>>(new Set());
  const [showCelebration, setShowCelebration] = useState(false);

  const startTimeRef = useRef<number>(0);
  const soundRef = useRef<{ ding?: Audio.Sound; goal?: Audio.Sound; wrong?: Audio.Sound; fanfare?: Audio.Sound }>({});
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const floatUpAnim = useRef(new Animated.Value(0)).current;
  const anglesOpacity = useRef(new Animated.Value(1)).current;
  const missedZonePulseAnim = useRef(new Animated.Value(1)).current;

  const allAngles = scenario ? [...scenario.activeAngles, ...scenario.decoys] : [];
  const correctCount = trialScores.filter(Boolean).length;
  const accuracy = trialScores.length ? Math.round((correctCount / trialScores.length) * 100) : 0;
  const levelPassed = trialScores.length >= TRIALS_PER_LEVEL && accuracy >= PASS_PERCENT;

  const playSound = useCallback(async (key: 'ding' | 'goal' | 'wrong' | 'fanfare') => {
    try {
      const s = soundRef.current[key];
      if (s) await s.replayAsync();
    } catch (_) {}
  }, []);

  const startNewTrial = useCallback(() => {
    anglesOpacity.setValue(1);
    const sc = generateUniqueScenario(realAngles, decoysCount, usedScenarios);
    const signature = getScenarioSignature(sc);
    setUsedScenarios((prev) => new Set([...prev, signature]));
    setScenario(sc);
    setSelectedExitZone(null);
    setBallPosition({ x: 0, y: 0 });
    setTrailPoints([]);
    setPhase('memorize');
    setMemorizeTimeLeft(MEMORIZE_MS / 1000);
  }, [realAngles, decoysCount, usedScenarios, anglesOpacity]);

  useEffect(() => {
    if (phase === 'ready') return;
    if (phase === 'memorize') {
      const t = setTimeout(() => {
        Animated.timing(anglesOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setPhase('predict'));
      }, MEMORIZE_MS);
      const iv = setInterval(() => setMemorizeTimeLeft((prev) => Math.max(0, prev - 1)), 1000);
      return () => {
        clearTimeout(t);
        clearInterval(iv);
      };
    }
  }, [phase, anglesOpacity]);

  useEffect(() => {
    if (phase !== 'reveal' || !scenario) return;

    const animPath = buildAnimationPath(scenario);
    const startPt = animPath[0] ? { x: animPath[0].x, y: animPath[0].y } : { x: 0, y: 0 };
    setRevealedAngles(new Set());
    setBallPathIndex(0);
    setTrailPoints([startPt]);
    setBallPosition(startPt);

    let step = 0;

    const interval = setInterval(() => {
      step++;

      if (step >= animPath.length) {
        clearInterval(interval);
        setFlashingAngleIndex(null);
        setTimeout(() => {
          if (trial >= TRIALS_PER_LEVEL) {
            setPhase('levelComplete');
          } else {
            setTrial((t) => t + 1);
            startNewTrial();
          }
        }, 1200);
        return;
      }

      const point = animPath[step];
      setBallPosition({ x: point.x, y: point.y });
      setTrailPoints((prev) => [...prev, { x: point.x, y: point.y }]);
      setBallPathIndex(step);

      if (point.isAngle && point.angleIndex !== null) {
        setFlashingAngleIndex(point.angleIndex);
        setRevealedAngles((prev) => new Set([...prev, point.angleIndex!]));
        playSound('ding');
        setTimeout(() => setFlashingAngleIndex(null), 150);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [phase, scenario, trial, levelPassed, startNewTrial]);

  useEffect(() => {
    if (phase === 'levelComplete' && levelPassed) {
      setShowCelebration(true);
      playSound('fanfare');
    }
  }, [phase, levelPassed, playSound]);

  useEffect(() => {
    if (phase !== 'predict') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.9, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulseAnim]);

  useEffect(() => {
    if (!showScorePopup) return;
    floatUpAnim.setValue(0);
    Animated.timing(floatUpAnim, { toValue: 1, duration: 1000, useNativeDriver: true }).start();
  }, [showScorePopup, floatUpAnim]);

  useEffect(() => {
    if (phase !== 'reveal' && phase !== 'trialResult') return;
    if (trialCorrect || !scenario) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(missedZonePulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
        Animated.timing(missedZonePulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase, trialCorrect, scenario, missedZonePulseAnim]);

  const handleTapExitZone = useCallback((zoneIndex: number) => {
    if (phase !== 'predict' || !scenario) return;
    setSelectedExitZone(zoneIndex);
    const correct = zoneIndex === scenario.correctExitZone;
    setTrialCorrect(correct);
    if (correct) {
      const points = 100 + streak * 25;
      setLastScore(points);
      setShowScorePopup(true);
      setTimeout(() => setShowScorePopup(false), 1000);
      setTrialScores((s) => [...s, points]);
      setStreak((prev) => prev + 1);
      setTimeout(() => playSound('goal'), 300);
    } else {
      setTrialScores((s) => [...s, 0]);
      setStreak(0);
      setTimeout(() => playSound('wrong'), 300);
    }
    setPhase('reveal');
  }, [phase, scenario, streak, playSound]);

  const handleCompleteLevel = useCallback(() => {
    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
    const totalScore = trialScores.reduce((a, b) => a + b, 0);
    const xpEarned = levelPassed ? xp : 0;
    onComplete(
      {
        score: totalScore,
        accuracy,
        xpEarned,
        isPerfect: accuracy === 100,
        levelCompleted: levelPassed,
        newHighScore: false,
      },
      durationSeconds
    );
  }, [trialScores, accuracy, levelPassed, xp, onComplete]);

  const handleStart = useCallback(() => {
    startTimeRef.current = Date.now();
    setTrial(1);
    setTrialScores([]);
    setStreak(0);
    setUsedScenarios(new Set());
    setShowCelebration(false);
    startNewTrial();
  }, [startNewTrial]);

  const ballStart = scenario ? getEntryPixel(scenario.startEdge, scenario.startPos) : { x: 0, y: 0 };

  const getArrowRotation = useCallback(() => {
    if (!scenario) return '0deg';
    switch (scenario.startEdge) {
      case 'left': return '0deg';
      case 'right': return '180deg';
      case 'up': return '90deg';
      case 'down': return '-90deg';
      default: return '0deg';
    }
  }, [scenario]);

  if (phase === 'ready') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onQuit} style={styles.quitBtn}>
            <Feather name="x" size={24} color="#94a3b8" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Angle Master</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.readyContent}>
          <Text style={styles.levelText}>Level {levelNumber}</Text>
          <Text style={styles.instructionText}>
            Memorize the angle bars. Then predict where the ball will exit after bouncing.
          </Text>
          <View style={styles.configRow}>
            <Text style={styles.configText}>{realAngles} angles</Text>
            <Text style={styles.configText}>15 trials</Text>
            <Text style={styles.configText}>{xp} XP</Text>
          </View>
          <TouchableOpacity style={styles.startButton} onPress={handleStart}>
            <Text style={styles.startButtonText}>Start</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quitButton} onPress={onQuit}>
            <Text style={styles.quitButtonText}>Quit</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (phase === 'levelComplete') {
    return (
      <View style={styles.container}>
        {showCelebration && <SoccerCelebration />}
        <View style={styles.completeContent}>
          <Feather
            name={levelPassed ? 'award' : 'target'}
            size={56}
            color={levelPassed ? COLORS.exitCorrect : COLORS.theme}
          />
          {levelPassed && <Text style={styles.goalText}>⚽ GOAL! ⚽</Text>}
          <Text style={styles.completeTitle}>
            {levelPassed ? 'Level Complete!' : 'Try Again'}
          </Text>
          <Text style={styles.completeScore}>
            {correctCount}/{TRIALS_PER_LEVEL} correct • {accuracy}%
          </Text>
          {levelPassed && <Text style={styles.xpText}>+{xp} XP</Text>}
          <TouchableOpacity style={styles.doneButton} onPress={handleCompleteLevel}>
            <Text style={styles.doneButtonText}>
              {levelPassed ? 'Next Level' : 'Try Again'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const showExitZones = phase === 'predict' || phase === 'reveal' || phase === 'trialResult';
  const pulseStyle = { transform: [{ scale: pulseAnim }] };
  const floatUpStyle = {
    opacity: floatUpAnim,
    transform: [
      {
        translateY: floatUpAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -24] }),
      },
    ],
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onQuit} style={styles.quitBtn}>
          <Feather name="x" size={24} color="#94a3b8" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.phaseLabel}>
            {phase === 'memorize' && 'MEMORIZE'}
            {phase === 'predict' && 'PREDICT'}
            {(phase === 'reveal' || phase === 'trialResult') && 'REVEAL'}
          </Text>
          {phase === 'memorize' && <Text style={styles.timerText}>{memorizeTimeLeft}s</Text>}
        </View>
        <Text style={styles.trialBadge}>Trial {trial}/{TRIALS_PER_LEVEL}</Text>
      </View>

      {phase === 'memorize' && (
        <View style={styles.timerBarWrap}>
          <View style={[styles.timerBar, { width: `${(memorizeTimeLeft / (MEMORIZE_MS / 1000)) * 100}%` }]} />
        </View>
      )}

      <View style={styles.fieldWrap}>
        <View style={[styles.field, styles.gameWorld, { width: FIELD_SIZE, height: FIELD_SIZE }]}>
          {[...Array(GRID)].map((_, ri) =>
            [...Array(GRID)].map((_, ci) => (
              <View
                key={`stripe-${ri}-${ci}`}
                style={[
                  styles.stripe,
                  {
                    left: ci * CELL,
                    top: ri * CELL,
                    width: CELL,
                    height: CELL,
                    backgroundColor: (ri + ci) % 2 === 0 ? COLORS.fieldDark : COLORS.fieldLight,
                  },
                ]}
              />
            ))
          )}
          {[...Array(7)].map((_, i) => (
            <View
              key={`h${i}`}
              style={[styles.gridLine, styles.gridLineH, { top: i * CELL, width: FIELD_SIZE }]}
            />
          ))}
          {[...Array(7)].map((_, i) => (
            <View
              key={`v${i}`}
              style={[styles.gridLine, styles.gridLineV, { left: i * CELL, height: FIELD_SIZE }]}
            />
          ))}

          {phase === 'memorize' && (
            <Animated.View style={[styles.anglesContainer, { opacity: anglesOpacity }]}>
              {allAngles.map((a, i) => (
                <View
                  key={`${a.row}-${a.col}-${i}`}
                  style={{
                    position: 'absolute',
                    left: a.col * CELL,
                    top: a.row * CELL,
                  }}
                >
                  <AngleBar angle={a} isFlashing={false} />
                </View>
              ))}
            </Animated.View>
          )}
          {phase === 'reveal' &&
            scenario?.activeAngles.map((a, i) => {
              if (!revealedAngles.has(i)) return null;
              const isFlashing = flashingAngleIndex === i;
              return (
                <View
                  key={`reveal-${a.row}-${a.col}-${i}`}
                  style={{
                    position: 'absolute',
                    left: a.col * CELL,
                    top: a.row * CELL,
                  }}
                >
                  <AngleBar angle={a} isFlashing={isFlashing} />
                </View>
              );
            })}

          {(phase === 'reveal' || phase === 'trialResult') && trailPoints.length >= 2 && (
            <Svg style={[StyleSheet.absoluteFill, { width: FIELD_SIZE, height: FIELD_SIZE }]} width={FIELD_SIZE} height={FIELD_SIZE}>
              <Path
                d={trailPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                stroke={COLORS.trailGlow}
                strokeWidth={8}
                fill="none"
                strokeLinecap="round"
              />
              <Path
                d={trailPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                stroke={COLORS.trail}
                strokeWidth={3}
                strokeDasharray="8,6"
                fill="none"
                strokeLinecap="round"
              />
            </Svg>
          )}
          {(phase === 'reveal' || phase === 'trialResult') && (
            <View style={[styles.ball, { left: ballPosition.x - BALL_SIZE / 2, top: ballPosition.y - BALL_SIZE / 2 }]}>
              <Text style={styles.ballEmoji}>⚽</Text>
            </View>
          )}
          {phase === 'predict' && (
            <View style={[styles.entryContainer, { left: ballStart.x - CELL / 2, top: ballStart.y - CELL / 2 }]}>
              <Animated.View style={[styles.entryGlowOuter, pulseStyle]} />
              <View style={styles.entryGlowInner} />
              <View style={styles.entryBall}>
                <Text style={styles.ballEmoji}>⚽</Text>
              </View>
              <View style={[styles.entryArrow, { transform: [{ rotate: getArrowRotation() }] }]}>
                <Feather name="chevron-right" size={ENTRY_ARROW_SIZE} color="#FFFFFF" />
              </View>
            </View>
          )}

          {showScorePopup && (
            <Animated.Text style={[styles.scorePopup, floatUpStyle]}>+{lastScore}</Animated.Text>
          )}

          {showExitZones && (
            <>
              {[...Array(24)].map((_, i) => {
                const { x: ex, y: ey } = getExitZonePixel(i);
                const isCorrect = scenario?.correctExitZone === i;
                const isSelected = selectedExitZone === i;
                const isReveal = phase === 'reveal' || phase === 'trialResult';
                const isMissed = isReveal && isCorrect && !isSelected;
                let backgroundColor = phase === 'predict' ? '#6B7280' : COLORS.exitZone;
                let content: React.ReactNode = null;
                let extraStyles: object = {};
                if (isReveal) {
                  if (isSelected && isCorrect) {
                    backgroundColor = COLORS.exitCorrect;
                    content = <Text style={styles.goalIcon}>🥅</Text>;
                    extraStyles = {
                      shadowColor: COLORS.exitCorrect,
                      shadowRadius: 15,
                      shadowOpacity: 0.8,
                      transform: [{ scale: 1.3 }],
                    };
                  } else if (isSelected && !isCorrect) {
                    backgroundColor = COLORS.exitWrong;
                    content = <Text style={styles.wrongIcon}>✗</Text>;
                    extraStyles = { transform: [{ scale: 1.2 }] };
                  } else if (isMissed) {
                    return (
                      <Animated.View
                        key={i}
                        style={[
                          styles.exitZone,
                          styles.exitZoneMissed,
                          {
                            left: ex - 16,
                            top: ey - 16,
                            transform: [{ scale: missedZonePulseAnim }],
                          },
                        ]}
                      />
                    );
                  }
                }
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => handleTapExitZone(i)}
                    disabled={phase !== 'predict'}
                    style={[
                      styles.exitZone,
                      phase === 'predict' && styles.exitZoneActive,
                      { left: ex - 16, top: ey - 16, backgroundColor },
                      extraStyles,
                    ]}
                  >
                    {content}
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </View>
      </View>

      {(phase === 'reveal' || phase === 'trialResult') && (
        <View style={styles.resultBar}>
          {trialCorrect ? (
            <>
              <Feather name="target" size={28} color={COLORS.exitCorrect} />
              <Text style={styles.resultTextCorrect}>Correct!</Text>
            </>
          ) : (
            <>
              <Feather name="x" size={28} color={COLORS.exitWrong} />
              <Text style={styles.resultTextWrong}>Wrong</Text>
            </>
          )}
        </View>
      )}

      {phase === 'predict' && (
        <Text style={styles.hintText}>Tap where the ball will exit</Text>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  quitBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerRight: {
    width: 40,
  },
  phaseLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  timerText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.theme,
  },
  trialBadge: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  timerBarWrap: {
    height: 4,
    backgroundColor: '#1e293b',
    marginHorizontal: PAD,
  },
  timerBar: {
    height: '100%',
    backgroundColor: COLORS.theme,
    borderRadius: 2,
  },
  fieldWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: PAD,
  },
  field: {
    backgroundColor: COLORS.fieldDark,
    borderRadius: 8,
    overflow: 'visible',
  },
  gameWorld: {
    position: 'relative',
  },
  stripe: {
    position: 'absolute',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: COLORS.gridLine,
  },
  gridLineH: {
    height: 1,
    left: 0,
  },
  gridLineV: {
    width: 1,
    top: 0,
  },
  anglesContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  angleWrap: {
    position: 'absolute',
  },
  angleFlashWrap: {
    transform: [{ scale: 1.15 }],
    shadowColor: '#FFFFFF',
    shadowRadius: 12,
    shadowOpacity: 0.8,
  },
  angleSvg: {
    position: 'absolute',
  },
  entryContainer: {
    position: 'absolute',
    width: CELL,
    height: CELL,
    justifyContent: 'center',
    alignItems: 'center',
  },
  entryGlowOuter: {
    position: 'absolute',
    width: CELL,
    height: CELL,
    borderRadius: CELL / 2,
    borderWidth: 2,
    borderColor: COLORS.entryGlow,
    opacity: 0.5,
  },
  entryGlowInner: {
    position: 'absolute',
    width: CELL * 0.7,
    height: CELL * 0.7,
    borderRadius: CELL * 0.35,
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
  },
  entryBall: {
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  entryArrow: {
    position: 'absolute',
    right: -10,
  },
  ball: {
    position: 'absolute',
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ballEmoji: {
    fontSize: 24,
  },
  goalIcon: {
    fontSize: 22,
  },
  wrongIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  scorePopup: {
    position: 'absolute',
    top: 100,
    right: 40,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10B981',
  },
  exitZone: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4B5563',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exitZoneActive: {
    backgroundColor: '#6B7280',
    borderColor: 'rgba(255,255,255,0.6)',
  },
  exitZoneMissed: {
    backgroundColor: 'transparent',
    borderColor: COLORS.exitMissed,
    borderWidth: 4,
  },
  resultBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  resultTextCorrect: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.exitCorrect,
  },
  resultTextWrong: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.exitWrong,
  },
  hintText: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 14,
    paddingVertical: 8,
  },
  readyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  levelText: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.theme,
    marginBottom: 12,
  },
  instructionText: {
    fontSize: 15,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  configRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 28,
  },
  configText: {
    fontSize: 14,
    color: '#64748b',
  },
  startButton: {
    backgroundColor: COLORS.theme,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 12,
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
  completeContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  goalText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 8,
    textAlign: 'center',
  },
  completeTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  completeScore: {
    fontSize: 16,
    color: '#94a3b8',
    marginBottom: 8,
  },
  xpText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.exitCorrect,
    marginBottom: 24,
  },
  doneButton: {
    backgroundColor: COLORS.theme,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
