import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Vibration,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { PressureConfig, GameResult } from '../../types/games';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type GamePhase = 'ready' | 'playing' | 'result';

interface MathTask {
  question: string;
  answer: number;
  options: number[];
}

interface ColorTask {
  word: string;
  displayColor: string;
  correctColor: string;
  options: { color: string; label: string }[];
}

interface SequenceTask {
  sequence: number[];
  missingIndex: number;
  answer: number;
  options: number[];
}

type Task = {
  type: 'math' | 'color' | 'sequence';
  data: MathTask | ColorTask | SequenceTask;
};

interface Distraction {
  id: number;
  type: 'shake' | 'popup';
  x: number;
  y: number;
}

interface PressureProtocolGameProps {
  config: PressureConfig;
  levelNumber: number;
  xpReward: number;
  onComplete: (result: GameResult, durationSeconds: number) => void;
  onQuit: () => void;
}

// Task generators
const generateMathTask = (difficulty: number): MathTask => {
  let a: number, b: number, answer: number, question: string;

  if (difficulty <= 1) {
    a = Math.floor(Math.random() * 20) + 1;
    b = Math.floor(Math.random() * 20) + 1;
    if (Math.random() > 0.5) {
      answer = a + b;
      question = `${a} + ${b} = ?`;
    } else {
      answer = a - b;
      question = `${a + b} - ${b} = ?`;
    }
  } else if (difficulty <= 2) {
    a = Math.floor(Math.random() * 12) + 1;
    b = Math.floor(Math.random() * 12) + 1;
    answer = a * b;
    question = `${a} × ${b} = ?`;
  } else {
    a = Math.floor(Math.random() * 15) + 5;
    b = Math.floor(Math.random() * 10) + 1;
    const c = Math.floor(Math.random() * 10) + 1;
    answer = a + b * c;
    question = `${a} + ${b} × ${c} = ?`;
  }

  const options = [answer];
  while (options.length < 4) {
    const wrong = answer + (Math.floor(Math.random() * 10) - 5);
    if (wrong !== answer && wrong > 0 && !options.includes(wrong)) {
      options.push(wrong);
    }
  }

  return {
    question,
    answer,
    options: options.sort(() => Math.random() - 0.5),
  };
};

const generateColorTask = (): ColorTask => {
  const colors = [
    { color: '#ef4444', label: 'RED' },
    { color: '#3b82f6', label: 'BLUE' },
    { color: '#10b981', label: 'GREEN' },
    { color: '#f59e0b', label: 'YELLOW' },
    { color: '#8b5cf6', label: 'PURPLE' },
  ];

  const wordColor = colors[Math.floor(Math.random() * colors.length)];
  let displayColorObj = colors[Math.floor(Math.random() * colors.length)];

  if (Math.random() > 0.3) {
    while (displayColorObj.label === wordColor.label) {
      displayColorObj = colors[Math.floor(Math.random() * colors.length)];
    }
  }

  const options = [displayColorObj, ...colors.filter(c => c.label !== displayColorObj.label).sort(() => Math.random() - 0.5).slice(0, 3)];
  const optionsShuffled = options.sort(() => Math.random() - 0.5);

  return {
    word: wordColor.label,
    displayColor: displayColorObj.color,
    correctColor: displayColorObj.label,
    options: optionsShuffled,
  };
};

const generateSequenceTask = (): SequenceTask => {
  const start = Math.floor(Math.random() * 10) + 1;
  const step = Math.floor(Math.random() * 5) + 2;
  const sequence: number[] = [];

  for (let i = 0; i < 5; i++) {
    sequence.push(start + step * i);
  }

  const missingIndex = Math.floor(Math.random() * 5);
  const answer = sequence[missingIndex];

  const options = [answer];
  while (options.length < 4) {
    const wrong = answer + (Math.floor(Math.random() * 10) - 5);
    if (wrong !== answer && wrong > 0 && !options.includes(wrong)) {
      options.push(wrong);
    }
  }

  return {
    sequence,
    missingIndex,
    answer,
    options: options.sort(() => Math.random() - 0.5),
  };
};

const generateTask = (taskType: string, difficulty: number): Task => {
  if (taskType === 'math' || taskType === 'mixed') {
    const rand = Math.random();
    if (taskType === 'mixed' && rand > 0.6) {
      return { type: 'color', data: generateColorTask() };
    } else if (taskType === 'mixed' && rand > 0.3) {
      return { type: 'sequence', data: generateSequenceTask() };
    }
    return { type: 'math', data: generateMathTask(difficulty) };
  } else if (taskType === 'color') {
    return { type: 'color', data: generateColorTask() };
  } else {
    return { type: 'sequence', data: generateSequenceTask() };
  }
};

export default function PressureProtocolGame({
  config,
  levelNumber,
  xpReward,
  onComplete,
  onQuit,
}: PressureProtocolGameProps) {
  const { taskType, distractionLevel, timeLimit } = config;

  const safeTimeLimit = timeLimit && !isNaN(timeLimit) ? timeLimit : 30000; // Default 30 seconds
  const totalTime = safeTimeLimit / 1000;

  const [phase, setPhase] = useState<GamePhase>('ready');
  const [task, setTask] = useState<Task | null>(null);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [timeLeft, setTimeLeft] = useState(totalTime);
  const [countdown, setCountdown] = useState(0);
  const [distractions, setDistractions] = useState<Distraction[]>([]);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const distractionRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const nextTask = useCallback(() => {
    const newTask = generateTask(taskType, distractionLevel);
    setTask(newTask);
  }, [taskType, distractionLevel]);

  const endGame = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (distractionRef.current) {
      clearInterval(distractionRef.current);
      distractionRef.current = null;
    }
    setPhase('result');
  }, []);

  const startGame = () => {
    startTimeRef.current = Date.now();
    setCountdown(3);

    let count = 3;
    const countdownInterval = setInterval(() => {
      count--;
      setCountdown(count);
      if (count === 0) {
        clearInterval(countdownInterval);
        setTasksCompleted(0);
        setCorrectAnswers(0);
        setTimeLeft(totalTime);
        nextTask();
        setPhase('playing');
        startTimer();
        startDistractions();
      }
    }, 1000);
  };

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          endGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startDistractions = () => {
    // Much slower: 3-5 seconds between distractions depending on level
    const interval = Math.max(3000, 5000 - distractionLevel * 400);
    distractionRef.current = setInterval(() => {
      triggerDistraction();
    }, interval);
  };

  const triggerDistraction = () => {
    // Only shake and popup - NO FLASH (seizure risk)
    const types: Distraction['type'][] = ['shake', 'popup'];
    const type = types[Math.floor(Math.random() * types.length)];

    if (type === 'shake') {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 5, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -5, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
      try {
        Vibration.vibrate(50);
      } catch (_) {
        // Vibration not available
      }
    } else if (type === 'popup') {
      // Position in corners only - never over center task area
      const corners = [
        { x: 20, y: 120 }, // Top left
        { x: SCREEN_WIDTH - 100, y: 120 }, // Top right
        { x: 20, y: SCREEN_HEIGHT - 200 }, // Bottom left
        { x: SCREEN_WIDTH - 100, y: SCREEN_HEIGHT - 200 }, // Bottom right
      ];
      const corner = corners[Math.floor(Math.random() * corners.length)];
      const newDistraction: Distraction = {
        id: Date.now(),
        type: 'popup',
        x: corner.x,
        y: corner.y,
      };

      setDistractions(prev => {
        if (prev.length >= 2) return prev;
        setTimeout(() => {
          setDistractions(p => p.filter(d => d.id !== newDistraction.id));
        }, 1500);
        return [...prev, newDistraction];
      });
    }
  };

  const handleAnswer = (selected: number | string) => {
    if (!task || phase !== 'playing') return;

    let isCorrect = false;

    if (task.type === 'math') {
      isCorrect = selected === (task.data as MathTask).answer;
    } else if (task.type === 'color') {
      isCorrect = selected === (task.data as ColorTask).correctColor;
    } else if (task.type === 'sequence') {
      isCorrect = selected === (task.data as SequenceTask).answer;
    }

    setTasksCompleted(prev => prev + 1);
    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
    }

    nextTask();
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (distractionRef.current) clearInterval(distractionRef.current);
    };
  }, []);

  const handleComplete = () => {
    const accuracy = tasksCompleted > 0 ? Math.round((correctAnswers / tasksCompleted) * 100) : 0;
    const speedBonus = Math.min(20, tasksCompleted * 2);
    const finalScore = Math.min(100, Math.round(accuracy * 0.8 + speedBonus));
    const isPerfect = accuracy === 100 && tasksCompleted >= 10;
    const xpEarned = isPerfect ? xpReward + 10 : Math.round((finalScore / 100) * xpReward);
    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);

    const result: GameResult = {
      score: finalScore,
      accuracy,
      xpEarned,
      isPerfect,
      levelCompleted: accuracy >= 60 && tasksCompleted >= 5,
      newHighScore: false,
    };

    onComplete(result, durationSeconds);
  };

  // Ready screen
  if (phase === 'ready') {
    return (
      <View style={styles.container}>
        <View style={styles.readyContainer}>
          <Text style={styles.titleText}>🔥 Pressure Protocol</Text>
          <Text style={styles.levelText}>Level {levelNumber}</Text>
          <Text style={styles.instructionText}>
            Answer as many questions as possible while distractions try to break your focus!
          </Text>
          <View style={styles.configInfo}>
            <Text style={styles.configText}>⏱️ {totalTime}s</Text>
            <Text style={styles.configText}>🎯 {taskType}</Text>
            <Text style={styles.configText}>😵 Distraction: {distractionLevel}</Text>
          </View>
          {countdown > 0 && countdown < 4 ? (
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownText}>{countdown}</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.startButton} onPress={startGame}>
                <Text style={styles.startButtonText}>Start Challenge</Text>
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
    const accuracy = tasksCompleted > 0 ? Math.round((correctAnswers / tasksCompleted) * 100) : 0;

    return (
      <View style={styles.container}>
        <View style={styles.resultContainer}>
          <Text style={styles.resultTitle}>Time's Up!</Text>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreText}>{accuracy}%</Text>
          </View>
          <Text style={styles.statsText}>
            {correctAnswers} / {tasksCompleted} correct
          </Text>
          <Text style={styles.scoreLabel}>
            {accuracy >= 90 ? '🔥 Unbreakable focus!' :
              accuracy >= 70 ? '💪 Strong mental game!' :
                accuracy >= 50 ? '👍 Good effort!' : '🧘 Practice staying calm'}
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{tasksCompleted}</Text>
              <Text style={styles.statLabel}>Tasks</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{correctAnswers}</Text>
              <Text style={styles.statLabel}>Correct</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{totalTime}s</Text>
              <Text style={styles.statLabel}>Time</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.nextButton} onPress={handleComplete}>
            <Text style={styles.nextButtonText}>See Results</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Playing screen
  return (
    <Animated.View style={[styles.container, { transform: [{ translateX: shakeAnim }] }]}>
      {distractions.map(d => (
        <View
          key={d.id}
          style={[styles.popupDistraction, { left: d.x, top: d.y }]}
        >
          <Text style={styles.popupText}>😈</Text>
        </View>
      ))}

      <View style={styles.header}>
        <TouchableOpacity onPress={onQuit} style={styles.quitIconButton}>
          <Feather name="x" size={24} color="#94a3b8" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.timerBar}>
            <View style={[styles.timerFill, { width: `${(timeLeft / totalTime) * 100}%` }]} />
          </View>
          <Text style={[styles.timerText, timeLeft <= 5 && styles.timerUrgent]}>
            {timeLeft}s
          </Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreBadgeText}>{correctAnswers} ✓</Text>
        </View>
      </View>

      <View style={styles.taskContainer}>
        {task?.type === 'math' && (
          <View style={styles.taskCard}>
            <Text style={styles.taskQuestion}>{(task.data as MathTask).question}</Text>
            <View style={styles.optionsGrid}>
              {(task.data as MathTask).options.map((opt, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.optionButton}
                  onPress={() => handleAnswer(opt)}
                >
                  <Text style={styles.optionText}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {task?.type === 'color' && (
          <View style={styles.taskCard}>
            <Text style={styles.taskLabel}>What COLOR is this word displayed in?</Text>
            <Text style={[styles.colorWord, { color: (task.data as ColorTask).displayColor }]}>
              {(task.data as ColorTask).word}
            </Text>
            <View style={styles.optionsGrid}>
              {(task.data as ColorTask).options.map((opt, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.colorOption, { backgroundColor: opt.color }]}
                  onPress={() => handleAnswer(opt.label)}
                >
                  <Text style={styles.colorOptionText}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {task?.type === 'sequence' && (
          <View style={styles.taskCard}>
            <Text style={styles.taskLabel}>What number is missing?</Text>
            <View style={styles.sequenceRow}>
              {(task.data as SequenceTask).sequence.map((num, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.sequenceBox,
                    idx === (task.data as SequenceTask).missingIndex && styles.sequenceBoxMissing,
                  ]}
                >
                  <Text style={styles.sequenceText}>
                    {idx === (task.data as SequenceTask).missingIndex ? '?' : num}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.optionsGrid}>
              {(task.data as SequenceTask).options.map((opt, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.optionButton}
                  onPress={() => handleAnswer(opt)}
                >
                  <Text style={styles.optionText}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      <View style={styles.progressBar}>
        <Text style={styles.progressText}>
          Tasks completed: {tasksCompleted} | Correct: {correctAnswers}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  popupDistraction: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(239, 68, 68, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  popupText: {
    fontSize: 24,
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
    color: '#ef4444',
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
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
  },
  startButton: {
    backgroundColor: '#ef4444',
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
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  timerBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#334155',
    borderRadius: 4,
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    backgroundColor: '#ef4444',
    borderRadius: 4,
  },
  timerText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ef4444',
    marginTop: 4,
  },
  timerUrgent: {
    color: '#fbbf24',
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
  taskContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  taskCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  taskLabel: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  taskQuestion: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 32,
    textAlign: 'center',
  },
  colorWord: {
    fontSize: 48,
    fontWeight: '900',
    marginBottom: 32,
  },
  sequenceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 32,
  },
  sequenceBox: {
    width: 50,
    height: 50,
    backgroundColor: '#334155',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sequenceBoxMissing: {
    backgroundColor: '#ef4444',
    borderWidth: 2,
    borderColor: '#fbbf24',
  },
  sequenceText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  optionButton: {
    width: '45%',
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  optionText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  colorOption: {
    width: '45%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  colorOptionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  progressBar: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  progressText: {
    color: '#64748b',
    fontSize: 14,
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
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  scoreText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
  },
  statsText: {
    color: '#94a3b8',
    fontSize: 16,
    marginBottom: 8,
  },
  scoreLabel: {
    fontSize: 18,
    color: '#94a3b8',
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  statBox: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
  },
  nextButton: {
    backgroundColor: '#ef4444',
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
