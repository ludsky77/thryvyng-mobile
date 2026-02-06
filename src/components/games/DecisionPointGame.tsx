import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { DecisionPointConfig, GameResult } from '../../types/games';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FIELD_WIDTH = SCREEN_WIDTH - 32;
const FIELD_HEIGHT = SCREEN_HEIGHT * 0.45;

type GamePhase = 'ready' | 'playing' | 'feedback' | 'result';
type Decision = 'shoot' | 'pass' | 'dribble';

interface Scenario {
  id: number;
  description: string;
  playerPosition: { x: number; y: number };
  teammates: { x: number; y: number; open: boolean }[];
  defenders: { x: number; y: number }[];
  goalkeeper: { x: number; y: number };
  correctAnswer: Decision;
  explanation: string;
}

interface DecisionPointGameProps {
  config: DecisionPointConfig;
  levelNumber: number;
  xpReward: number;
  onComplete: (result: GameResult, durationSeconds: number) => void;
  onQuit: () => void;
}

// Scenario generator based on complexity
const generateScenarios = (complexity: string, count: number): Scenario[] => {
  const scenarios: Scenario[] = [];

  const templates = {
    basic: [
      {
        description: "Open shot on goal, no defenders nearby",
        playerPosition: { x: 0.5, y: 0.3 },
        teammates: [{ x: 0.3, y: 0.4, open: true }],
        defenders: [{ x: 0.7, y: 0.4 }],
        goalkeeper: { x: 0.5, y: 0.08 },
        correctAnswer: 'shoot' as Decision,
        explanation: "Clear shot on goal - take it!",
      },
      {
        description: "Teammate wide open, you're marked",
        playerPosition: { x: 0.5, y: 0.4 },
        teammates: [{ x: 0.8, y: 0.25, open: true }],
        defenders: [{ x: 0.48, y: 0.38 }, { x: 0.52, y: 0.42 }],
        goalkeeper: { x: 0.5, y: 0.08 },
        correctAnswer: 'pass' as Decision,
        explanation: "You're marked - pass to open teammate!",
      },
      {
        description: "Space ahead, one defender to beat",
        playerPosition: { x: 0.5, y: 0.6 },
        teammates: [{ x: 0.3, y: 0.5, open: false }],
        defenders: [{ x: 0.5, y: 0.45 }],
        goalkeeper: { x: 0.5, y: 0.08 },
        correctAnswer: 'dribble' as Decision,
        explanation: "Space to attack - dribble past the defender!",
      },
    ],
    intermediate: [
      {
        description: "Tight angle, teammate at penalty spot",
        playerPosition: { x: 0.2, y: 0.25 },
        teammates: [{ x: 0.5, y: 0.22, open: true }],
        defenders: [{ x: 0.3, y: 0.2 }],
        goalkeeper: { x: 0.45, y: 0.08 },
        correctAnswer: 'pass' as Decision,
        explanation: "Tight angle - pass to teammate in better position!",
      },
      {
        description: "1v1 with goalkeeper",
        playerPosition: { x: 0.5, y: 0.2 },
        teammates: [{ x: 0.7, y: 0.3, open: false }],
        defenders: [],
        goalkeeper: { x: 0.5, y: 0.08 },
        correctAnswer: 'shoot' as Decision,
        explanation: "1v1 with keeper - shoot with confidence!",
      },
      {
        description: "Counterattack, defenders retreating",
        playerPosition: { x: 0.5, y: 0.55 },
        teammates: [{ x: 0.3, y: 0.45, open: true }, { x: 0.7, y: 0.5, open: true }],
        defenders: [{ x: 0.4, y: 0.35 }, { x: 0.6, y: 0.38 }],
        goalkeeper: { x: 0.5, y: 0.08 },
        correctAnswer: 'dribble' as Decision,
        explanation: "Defenders retreating - drive forward!",
      },
    ],
    advanced: [
      {
        description: "Crowded box, small gap to shoot",
        playerPosition: { x: 0.4, y: 0.25 },
        teammates: [{ x: 0.6, y: 0.28, open: false }, { x: 0.3, y: 0.35, open: false }],
        defenders: [{ x: 0.45, y: 0.2 }, { x: 0.55, y: 0.22 }, { x: 0.35, y: 0.3 }],
        goalkeeper: { x: 0.52, y: 0.08 },
        correctAnswer: 'shoot' as Decision,
        explanation: "Small window but shootable - take your chance!",
      },
      {
        description: "Wing position, overlapping fullback",
        playerPosition: { x: 0.15, y: 0.35 },
        teammates: [{ x: 0.08, y: 0.45, open: true }, { x: 0.5, y: 0.25, open: false }],
        defenders: [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.28 }],
        goalkeeper: { x: 0.5, y: 0.08 },
        correctAnswer: 'pass' as Decision,
        explanation: "Use the overlap - pass to fullback!",
      },
    ],
  };

  const pool = complexity === 'basic' ? templates.basic :
    complexity === 'intermediate' ? [...templates.basic, ...templates.intermediate] :
    [...templates.basic, ...templates.intermediate, ...templates.advanced];

  for (let i = 0; i < count; i++) {
    const template = pool[Math.floor(Math.random() * pool.length)];
    scenarios.push({ ...template, id: i } as Scenario);
  }

  return scenarios;
};

export default function DecisionPointGame({
  config,
  levelNumber,
  xpReward,
  onComplete,
  onQuit,
}: DecisionPointGameProps) {
  const { timeLimit, scenarioComplexity } = config;

  const [phase, setPhase] = useState<GamePhase>('ready');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<Decision | null>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(timeLimit / 1000);
  const [countdown, setCountdown] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);

  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalScenarios = 8;

  const currentScenario = scenarios[currentIndex];

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
        const newScenarios = generateScenarios(scenarioComplexity, totalScenarios);
        setScenarios(newScenarios);
        setCurrentIndex(0);
        setScore(0);
        setResults([]);
        setPhase('playing');
        startTimer();
      }
    }, 1000);
  };

  // Timer
  const startTimer = () => {
    setTimeLeft(timeLimit / 1000);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleTimeout();
          return timeLimit / 1000;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleTimeout = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setResults(prev => [...prev, false]);
    moveToNext();
  };

  const handleDecision = (decision: Decision) => {
    if (phase !== 'playing' || !currentScenario) return;

    setSelectedAnswer(decision);
    const isCorrect = decision === currentScenario.correctAnswer;

    if (isCorrect) {
      setScore(prev => prev + 1);
    }
    setResults(prev => [...prev, isCorrect]);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPhase('feedback');

    setTimeout(() => {
      moveToNext();
    }, 1500);
  };

  const moveToNext = () => {
    setSelectedAnswer(null);

    if (currentIndex + 1 >= totalScenarios) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setPhase('result');
    } else {
      setCurrentIndex(prev => prev + 1);
      setPhase('playing');
      startTimer();
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Handle game complete
  const handleComplete = () => {
    const accuracy = Math.round((score / totalScenarios) * 100);
    const isPerfect = accuracy === 100;
    const xpEarned = isPerfect ? xpReward + 10 : Math.round((accuracy / 100) * xpReward);
    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);

    const result: GameResult = {
      score: accuracy,
      accuracy,
      xpEarned,
      isPerfect,
      levelCompleted: accuracy >= 70,
      newHighScore: false,
    };

    onComplete(result, durationSeconds);
  };

  // Ready screen
  if (phase === 'ready') {
    return (
      <View style={styles.container}>
        <View style={styles.readyContainer}>
          <Text style={styles.titleText}>⚡ Decision Point</Text>
          <Text style={styles.levelText}>Level {levelNumber}</Text>
          <Text style={styles.instructionText}>
            Quick decisions! See the play, choose: Shoot, Pass, or Dribble
          </Text>
          <View style={styles.configInfo}>
            <Text style={styles.configText}>⏱️ {timeLimit / 1000}s per decision</Text>
            <Text style={styles.configText}>📊 {scenarioComplexity}</Text>
            <Text style={styles.configText}>🎯 {totalScenarios} scenarios</Text>
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
    const accuracy = Math.round((score / totalScenarios) * 100);

    return (
      <View style={styles.container}>
        <View style={styles.resultContainer}>
          <Text style={styles.resultTitle}>Game Complete!</Text>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreText}>{accuracy}%</Text>
          </View>
          <Text style={styles.scoreSubtext}>{score} / {totalScenarios} correct</Text>
          <Text style={styles.scoreLabel}>
            {accuracy === 100 ? '🎉 Perfect decisions!' :
              accuracy >= 70 ? '👍 Good instincts!' : '💪 Keep training!'}
          </Text>

          <View style={styles.resultDots}>
            {results.map((correct, idx) => (
              <View
                key={idx}
                style={[
                  styles.resultDot,
                  correct ? styles.resultDotCorrect : styles.resultDotWrong,
                ]}
              />
            ))}
          </View>

          <TouchableOpacity style={styles.nextButton} onPress={handleComplete}>
            <Text style={styles.nextButtonText}>See Results</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Playing / Feedback screen
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onQuit} style={styles.quitIconButton}>
          <Feather name="x" size={24} color="#94a3b8" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.scenarioCount}>{currentIndex + 1} / {totalScenarios}</Text>
          <View style={styles.timerContainer}>
            <Feather name="clock" size={16} color={timeLeft <= 2 ? '#ef4444' : '#f59e0b'} />
            <Text style={[styles.timerText, timeLeft <= 2 && styles.timerTextUrgent]}>
              {timeLeft}s
            </Text>
          </View>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreBadgeText}>{score} ✓</Text>
        </View>
      </View>

      {/* Scenario description */}
      {currentScenario && (
        <View style={styles.descriptionBar}>
          <Text style={styles.descriptionText}>{currentScenario.description}</Text>
        </View>
      )}

      {/* Field visualization */}
      <View style={styles.fieldContainer}>
        <View style={styles.field}>
          <View style={styles.fieldBorder}>
            <View style={styles.goalArea} />
            <View style={styles.penaltyArea} />
            <View style={styles.penaltySpot} />

            {currentScenario && (
              <>
                <View style={[
                  styles.goalkeeper,
                  {
                    left: `${currentScenario.goalkeeper.x * 100}%`,
                    top: `${currentScenario.goalkeeper.y * 100}%`,
                  }
                ]}>
                  <Text style={styles.playerIcon}>🧤</Text>
                </View>

                {currentScenario.defenders.map((def, idx) => (
                  <View
                    key={`def-${idx}`}
                    style={[
                      styles.defender,
                      { left: `${def.x * 100}%`, top: `${def.y * 100}%` }
                    ]}
                  >
                    <Feather name="user" size={20} color="#fff" />
                  </View>
                ))}

                {currentScenario.teammates.map((tm, idx) => (
                  <View
                    key={`tm-${idx}`}
                    style={[
                      styles.teammate,
                      tm.open && styles.teammateOpen,
                      { left: `${tm.x * 100}%`, top: `${tm.y * 100}%` }
                    ]}
                  >
                    <Feather name="user" size={20} color="#fff" />
                  </View>
                ))}

                <View style={[
                  styles.player,
                  {
                    left: `${currentScenario.playerPosition.x * 100}%`,
                    top: `${currentScenario.playerPosition.y * 100}%`,
                  }
                ]}>
                  <Text style={styles.ballIcon}>⚽</Text>
                </View>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Feedback overlay */}
      {phase === 'feedback' && currentScenario && (
        <View style={styles.feedbackOverlay}>
          <View style={[
            styles.feedbackCard,
            selectedAnswer === currentScenario.correctAnswer
              ? styles.feedbackCorrect
              : styles.feedbackWrong
          ]}>
            <Text style={styles.feedbackIcon}>
              {selectedAnswer === currentScenario.correctAnswer ? '✓' : '✗'}
            </Text>
            <Text style={styles.feedbackText}>{currentScenario.explanation}</Text>
          </View>
        </View>
      )}

      {/* Decision buttons */}
      {phase === 'playing' && (
        <View style={styles.decisionsContainer}>
          <TouchableOpacity
            style={[styles.decisionButton, styles.shootButton]}
            onPress={() => handleDecision('shoot')}
          >
            <Text style={styles.decisionIcon}>🎯</Text>
            <Text style={styles.decisionText}>SHOOT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.decisionButton, styles.passButton]}
            onPress={() => handleDecision('pass')}
          >
            <Text style={styles.decisionIcon}>➡️</Text>
            <Text style={styles.decisionText}>PASS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.decisionButton, styles.dribbleButton]}
            onPress={() => handleDecision('dribble')}
          >
            <Text style={styles.decisionIcon}>💨</Text>
            <Text style={styles.decisionText}>DRIBBLE</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Progress dots */}
      <View style={styles.progressDots}>
        {Array(totalScenarios).fill(0).map((_, idx) => (
          <View
            key={idx}
            style={[
              styles.progressDot,
              idx < results.length && (results[idx] ? styles.progressDotCorrect : styles.progressDotWrong),
              idx === currentIndex && styles.progressDotCurrent,
            ]}
          />
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
    color: '#f59e0b',
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
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
  },
  startButton: {
    backgroundColor: '#f59e0b',
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
  scenarioCount: {
    fontSize: 14,
    color: '#94a3b8',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  timerText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f59e0b',
  },
  timerTextUrgent: {
    color: '#ef4444',
  },
  scoreBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  scoreBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  descriptionBar: {
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  descriptionText: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '500',
  },
  fieldContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
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
  goalArea: {
    position: 'absolute',
    top: 0,
    left: '35%',
    width: '30%',
    height: '12%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderTopWidth: 0,
  },
  penaltyArea: {
    position: 'absolute',
    top: 0,
    left: '20%',
    width: '60%',
    height: '28%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderTopWidth: 0,
  },
  penaltySpot: {
    position: 'absolute',
    top: '20%',
    left: '50%',
    marginLeft: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  goalkeeper: {
    position: 'absolute',
    width: 36,
    height: 36,
    marginLeft: -18,
    marginTop: -18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerIcon: {
    fontSize: 28,
  },
  ballIcon: {
    fontSize: 32,
  },
  defender: {
    position: 'absolute',
    width: 36,
    height: 36,
    marginLeft: -18,
    marginTop: -18,
    borderRadius: 18,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  teammate: {
    position: 'absolute',
    width: 36,
    height: 36,
    marginLeft: -18,
    marginTop: -18,
    borderRadius: 18,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  teammateOpen: {
    backgroundColor: '#10b981',
    borderWidth: 3,
    borderColor: '#34d399',
  },
  player: {
    position: 'absolute',
    width: 44,
    height: 44,
    marginLeft: -22,
    marginTop: -22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedbackOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  feedbackCard: {
    backgroundColor: '#1e293b',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginHorizontal: 32,
    borderWidth: 3,
  },
  feedbackCorrect: {
    borderColor: '#10b981',
  },
  feedbackWrong: {
    borderColor: '#ef4444',
  },
  feedbackIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  feedbackText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  decisionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  decisionButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  shootButton: {
    backgroundColor: '#ef4444',
  },
  passButton: {
    backgroundColor: '#3b82f6',
  },
  dribbleButton: {
    backgroundColor: '#8b5cf6',
  },
  decisionIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  decisionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  progressDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#334155',
  },
  progressDotCorrect: {
    backgroundColor: '#10b981',
  },
  progressDotWrong: {
    backgroundColor: '#ef4444',
  },
  progressDotCurrent: {
    backgroundColor: '#f59e0b',
    transform: [{ scale: 1.3 }],
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
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  scoreText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
  },
  scoreSubtext: {
    color: '#94a3b8',
    fontSize: 16,
    marginBottom: 8,
  },
  scoreLabel: {
    fontSize: 18,
    color: '#94a3b8',
    marginBottom: 24,
  },
  resultDots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 32,
  },
  resultDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  resultDotCorrect: {
    backgroundColor: '#10b981',
  },
  resultDotWrong: {
    backgroundColor: '#ef4444',
  },
  nextButton: {
    backgroundColor: '#f59e0b',
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
