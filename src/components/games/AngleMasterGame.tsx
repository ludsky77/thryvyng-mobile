import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import type { AngleMasterConfig, GameResult } from '../../types/games';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PAD = 16;
const FIELD_SIZE = Math.min(SCREEN_WIDTH - PAD * 2, SCREEN_HEIGHT * 0.55);
const CELL = FIELD_SIZE / 6;
const GRID = 6;

const MEMORIZE_MS = 3000;
const TRIALS_PER_LEVEL = 15;
const PASS_PERCENT = 50;

const BOUNCE_MAP: Record<string, Record<string, string>> = {
  'nw-se': { right: 'down', left: 'up', up: 'left', down: 'right' },
  'ne-sw': { right: 'up', left: 'down', up: 'right', down: 'left' },
};

const COLORS = {
  fieldDark: '#1a472a',
  fieldLight: '#1f5233',
  gridLine: 'rgba(255,255,255,0.12)',
  angle: '#FFFFFF',
  angleDecoy: 'rgba(255,255,255,0.3)',
  trail: '#FCD34D',
  exitZone: '#4B5563',
  exitCorrect: '#10B981',
  exitWrong: '#EF4444',
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

interface Scenario {
  startEdge: Dir;
  startPos: number;
  activeAngles: AngleCell[];
  decoys: AngleCell[];
  path: { row: number; col: number; dir: Dir }[];
  correctExitZone: number;
}

type GamePhase = 'ready' | 'memorize' | 'predict' | 'reveal' | 'trialResult' | 'levelComplete';

function getLevelConfig(levelNumber: number): { activeAngles: number; decoyMin: number; decoyMax: number; xpReward: number } {
  if (levelNumber <= 2) return { activeAngles: 3, decoyMin: 0, decoyMax: 2, xpReward: 30 };
  if (levelNumber <= 4) return { activeAngles: 4, decoyMin: 0, decoyMax: 2, xpReward: 40 };
  if (levelNumber <= 6) return { activeAngles: 5, decoyMin: 0, decoyMax: 2, xpReward: 50 };
  if (levelNumber <= 8) return { activeAngles: 6, decoyMin: 0, decoyMax: 2, xpReward: 60 };
  if (levelNumber <= 10) return { activeAngles: 7, decoyMin: 1, decoyMax: 3, xpReward: 70 };
  return { activeAngles: 8, decoyMin: 2, decoyMax: 3, xpReward: 100 };
}

function dirToDelta(d: Dir): { dr: number; dc: number } {
  if (d === 'up') return { dr: -1, dc: 0 };
  if (d === 'down') return { dr: 1, dc: 0 };
  if (d === 'left') return { dr: 0, dc: -1 };
  return { dr: 0, dc: 1 };
}

function bounce(outDir: Dir, angleType: AngleType): Dir {
  const d = BOUNCE_MAP[angleType][outDir];
  return d as Dir;
}

function getExitZone(row: number, col: number, dir: Dir): number {
  if (dir === 'up' && row <= 0) return col;
  if (dir === 'down' && row >= GRID - 1) return 12 + col;
  if (dir === 'right' && col >= GRID - 1) return 6 + row;
  if (dir === 'left' && col <= 0) return 18 + row;
  return -1;
}

function startToRC(edge: Dir, pos: number): { r: number; c: number; dir: Dir } {
  if (edge === 'left') return { r: pos, c: 0, dir: 'right' };
  if (edge === 'right') return { r: pos, c: GRID - 1, dir: 'left' };
  if (edge === 'top') return { r: 0, c: pos, dir: 'down' };
  return { r: GRID - 1, c: pos, dir: 'up' };
}

function generateScenario(activeCount: number, decoyMin: number, decoyMax: number): Scenario {
  const edges: Dir[] = ['left', 'right', 'up', 'down'];
  const startEdge = edges[Math.floor(Math.random() * 4)];
  const startPos = Math.floor(Math.random() * 6);
  let { r, c, dir } = startToRC(startEdge, startPos);

  const path: { row: number; col: number; dir: Dir }[] = [];
  const activeAngles: AngleCell[] = [];
  const pathSet = new Set<string>();

  for (let i = 0; i < activeCount; i++) {
    const { dr, dc } = dirToDelta(dir);
    let nextR = r + dr;
    let nextC = c + dc;
    const candidates: { r: number; c: number }[] = [];
    while (nextR >= 0 && nextR < GRID && nextC >= 0 && nextC < GRID) {
      candidates.push({ r: nextR, c: nextC });
      nextR += dr;
      nextC += dc;
    }
    if (candidates.length === 0) return generateScenario(activeCount, decoyMin, decoyMax);
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const type: AngleType = Math.random() < 0.5 ? 'nw-se' : 'ne-sw';
    pathSet.add(`${pick.r},${pick.c}`);
    activeAngles.push({ row: pick.r, col: pick.c, type, isDecoy: false });
    path.push({ row: pick.r, col: pick.c, dir });
    r = pick.r;
    c = pick.c;
    dir = bounce(dir, type);
  }

  const exitRow = r + dirToDelta(dir).dr;
  const exitCol = c + dirToDelta(dir).dc;
  let correctExitZone = -1;
  if (exitRow < 0) correctExitZone = exitCol;
  else if (exitRow >= GRID) correctExitZone = 12 + exitCol;
  else if (exitCol < 0) correctExitZone = 18 + exitRow;
  else if (exitCol >= GRID) correctExitZone = 6 + exitRow;
  if (correctExitZone < 0 || correctExitZone > 23) return generateScenario(activeCount, decoyMin, decoyMax);

  const decoyCount = decoyMin + Math.floor(Math.random() * (decoyMax - decoyMin + 1));
  const decoys: AngleCell[] = [];
  const empty: { r: number; c: number }[] = [];
  for (let ri = 0; ri < GRID; ri++) {
    for (let ci = 0; ci < GRID; ci++) {
      if (!pathSet.has(`${ri},${ci}`)) empty.push({ r: ri, c: ci });
    }
  }
  for (let i = 0; i < decoyCount && empty.length > 0; i++) {
    const idx = Math.floor(Math.random() * empty.length);
    const [cell] = empty.splice(idx, 1);
    const type: AngleType = Math.random() < 0.5 ? 'nw-se' : 'ne-sw';
    decoys.push({ row: cell.r, col: cell.c, type, isDecoy: true });
  }

  return {
    startEdge,
    startPos,
    activeAngles,
    decoys,
    path,
    correctExitZone,
  };
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
  const activeAngles = config?.activeAngles ?? levelConfig.activeAngles;
  const decoyMin = config?.decoyMin ?? levelConfig.decoyMin;
  const decoyMax = config?.decoyMax ?? levelConfig.decoyMax;
  const xp = config?.xpReward ?? xpReward ?? levelConfig.xpReward;

  const [phase, setPhase] = useState<GamePhase>('ready');
  const [trial, setTrial] = useState(1);
  const [trialScores, setTrialScores] = useState<number[]>([]);
  const [streak, setStreak] = useState(0);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [selectedExitZone, setSelectedExitZone] = useState<number | null>(null);
  const [memorizeTimeLeft, setMemorizeTimeLeft] = useState(MEMORIZE_MS / 1000);
  const [trialCorrect, setTrialCorrect] = useState(false);

  const startTimeRef = useRef<number>(0);
  const soundRef = useRef<{ ding?: Audio.Sound; goal?: Audio.Sound; wrong?: Audio.Sound; fanfare?: Audio.Sound }>({});

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
    const sc = generateScenario(activeAngles, decoyMin, decoyMax);
    setScenario(sc);
    setSelectedExitZone(null);
    setPhase('memorize');
    setMemorizeTimeLeft(MEMORIZE_MS / 1000);
  }, [activeAngles, decoyMin, decoyMax]);

  useEffect(() => {
    if (phase === 'ready') return;
    if (phase === 'memorize') {
      const t = setTimeout(() => setPhase('predict'), MEMORIZE_MS);
      const iv = setInterval(() => setMemorizeTimeLeft((prev) => Math.max(0, prev - 1)), 1000);
      return () => {
        clearTimeout(t);
        clearInterval(iv);
      };
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'reveal') return;
    if (scenario?.path.length) {
      scenario.path.forEach((_, i) => {
        setTimeout(() => playSound('ding'), 300 + i * 350);
      });
    }
    const delay = trialCorrect ? 1800 : 2600;
    const t = setTimeout(() => finishReveal(), delay);
    return () => clearTimeout(t);
  }, [phase, trialCorrect, finishReveal, scenario?.path, playSound]);

  const handleTapExitZone = useCallback((zoneIndex: number) => {
    if (phase !== 'predict' || !scenario) return;
    setSelectedExitZone(zoneIndex);
    const correct = zoneIndex === scenario.correctExitZone;
    setTrialCorrect(correct);
    setStreak((prev) => {
      const points = correct ? 100 + prev * 20 : 0;
      setTrialScores((s) => [...s, points]);
      return correct ? prev + 1 : 0;
    });
    setPhase('reveal');
    if (correct) setTimeout(() => playSound('goal'), 300);
    else setTimeout(() => playSound('wrong'), 300);
  }, [phase, scenario, playSound]);

  const finishReveal = useCallback(() => {
    if (trial >= TRIALS_PER_LEVEL) {
      setPhase('levelComplete');
      if (levelPassed) setTimeout(() => playSound('fanfare'), 400);
    } else {
      setTrial((t) => t + 1);
      setPhase('memorize');
      setScenario(null);
      setSelectedExitZone(null);
      setTimeout(() => {
        const sc = generateScenario(activeAngles, decoyMin, decoyMax);
        setScenario(sc);
        setMemorizeTimeLeft(MEMORIZE_MS / 1000);
      }, 400);
    }
  }, [trial, levelPassed, activeAngles, decoyMin, decoyMax, playSound]);

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
    startNewTrial();
  }, [startNewTrial]);

  const getBallStartXY = useCallback(() => {
    if (!scenario) return { x: 0, y: 0 };
    const { startEdge, startPos } = scenario;
    if (startEdge === 'left') return { x: CELL * 0.2, y: CELL * (startPos + 0.5) };
    if (startEdge === 'right') return { x: FIELD_SIZE - CELL * 0.2, y: CELL * (startPos + 0.5) };
    if (startEdge === 'top') return { x: CELL * (startPos + 0.5), y: CELL * 0.2 };
    return { x: CELL * (startPos + 0.5), y: FIELD_SIZE - CELL * 0.2 };
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
            <Text style={styles.configText}>{activeAngles} angles</Text>
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
        <View style={styles.completeContent}>
          <Feather
            name={levelPassed ? 'award' : 'target'}
            size={56}
            color={levelPassed ? COLORS.exitCorrect : COLORS.theme}
          />
          <Text style={styles.completeTitle}>{levelPassed ? 'Level Complete!' : 'Level Incomplete'}</Text>
          <Text style={styles.completeScore}>
            Score: {correctCount}/{TRIALS_PER_LEVEL} • {accuracy}% accuracy
          </Text>
          {levelPassed && <Text style={styles.xpText}>+{xp} XP</Text>}
          <TouchableOpacity style={styles.doneButton} onPress={handleCompleteLevel}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const showAngles = phase === 'memorize' || phase === 'reveal' || phase === 'trialResult';
  const showBall = phase === 'predict' || phase === 'reveal' || phase === 'trialResult';
  const showExitZones = phase === 'predict' || phase === 'reveal' || phase === 'trialResult';
  const ballStart = getBallStartXY();

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
        <View style={[styles.field, { width: FIELD_SIZE, height: FIELD_SIZE }]}>
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

          {showAngles && allAngles.map((a, i) => (
            <View
              key={`${a.row}-${a.col}-${i}`}
              style={[
                styles.angleWrap,
                {
                  left: a.col * CELL,
                  top: a.row * CELL,
                  width: CELL,
                  height: CELL,
                },
              ]}
            >
              <Svg width={CELL} height={CELL} style={styles.angleSvg}>
                {a.type === 'nw-se' ? (
                  <Line x1={0} y1={0} x2={CELL} y2={CELL} stroke={a.isDecoy ? COLORS.angleDecoy : COLORS.angle} strokeWidth={3} />
                ) : (
                  <Line x1={CELL} y1={0} x2={0} y2={CELL} stroke={a.isDecoy ? COLORS.angleDecoy : COLORS.angle} strokeWidth={3} />
                )}
              </Svg>
            </View>
          ))}

          {showBall && (
            <View style={[styles.ball, { left: ballStart.x - 14, top: ballStart.y - 14 }]}>
              <Text style={styles.ballEmoji}>⚽</Text>
            </View>
          )}

          {showExitZones && (
            <>
              {[...Array(24)].map((_, i) => {
                let x = 0, y = 0;
                if (i < 6) {
                  x = CELL * (i + 0.5);
                  y = -8;
                } else if (i < 12) {
                  x = FIELD_SIZE + 8;
                  y = CELL * (i - 6 + 0.5);
                } else if (i < 18) {
                  x = CELL * (i - 12 + 0.5);
                  y = FIELD_SIZE + 8;
                } else {
                  x = -8;
                  y = CELL * (i - 18 + 0.5);
                }
                const isCorrect = scenario?.correctExitZone === i;
                const isWrong = selectedExitZone === i && phase !== 'predict' && !trialCorrect;
                const isSelected = selectedExitZone === i;
                const fill =
                  phase === 'trialResult' || phase === 'reveal'
                    ? isCorrect
                      ? COLORS.exitCorrect
                      : isWrong
                        ? COLORS.exitWrong
                        : COLORS.exitZone
                    : COLORS.exitZone;
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => handleTapExitZone(i)}
                    disabled={phase !== 'predict'}
                    style={[styles.exitZone, { left: x - 12, top: y - 12, backgroundColor: fill }]}
                  />
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
              <Text style={styles.resultTextWrong}>Wrong — tap to continue</Text>
            </>
          )}
        </View>
      )}

      {phase === 'predict' && (
        <Text style={styles.hintText}>Tap where the ball will exit</Text>
      )}

      {phase === 'reveal' && (
        <View style={styles.revealHint}>
          <Text style={styles.revealHintText}>Real angles = bright • Decoys = dim</Text>
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
  angleWrap: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  angleSvg: {
    position: 'absolute',
  },
  ball: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ballEmoji: {
    fontSize: 18,
  },
  exitZone: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
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
  revealHint: {
    paddingVertical: 6,
  },
  revealHintText: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 12,
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
