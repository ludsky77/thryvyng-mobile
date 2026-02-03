// Game data from cognitive_games table
export interface CognitiveGame {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  skill_type: string | null;
  primary_color: string | null;
  is_active: boolean;
  display_order: number;
}

// Level config from game_levels table
export interface GameLevel {
  id: string;
  game_id: string;
  level_number: number;
  xp_reward: number;
  field_type: 'half' | 'full';
  is_active: boolean;
  config: FieldVisionConfig | PatternPlayConfig | DecisionPointConfig | AnticipationConfig | PressureConfig;
}

// Field Vision specific config
export interface FieldVisionConfig {
  targets: number;      // Number of players to track
  players: number;      // Total players on field
  speed: number;        // Movement speed multiplier
  duration: number;     // Tracking duration in ms
  distractors?: number; // Distractor players (Level 2+)
}

// Pattern Play config
export interface PatternPlayConfig {
  patternLength: number;
  showDuration: number;
}

// Decision Point config
export interface DecisionPointConfig {
  timeLimit: number;
  scenarioComplexity: 'basic' | 'intermediate' | 'advanced' | 'expert' | 'master';
}

// Anticipation Arena config
export interface AnticipationConfig {
  ballSpeed: number;
  showPath: boolean;
  predictionTime: number;
  targetSize: number;
}

// Pressure Protocol config
export interface PressureConfig {
  taskType: string;
  distractionLevel: number;
  timeLimit: number;
}

// Player's progress per game
export interface PlayerGameProgress {
  id: string;
  player_id: string;
  game_id: string;
  current_level: number;
  highest_level_completed: number;
  total_xp_earned: number;
  total_sessions: number;
  best_scores: Record<string, number>; // { "1": 45, "2": 38 }
  last_played_at: string | null;
}

// Session record for each play
export interface GameSession {
  id?: string;
  player_id: string;
  game_id: string;
  level_number: number;
  score: number;
  xp_earned: number;
  duration_seconds: number;
  rounds_completed?: number;
  accuracy_percentage?: number;
  is_perfect: boolean;
  session_data?: Record<string, any>;
  played_at?: string;
}

// Daily time tracking
export interface DailyGameTime {
  id: string;
  player_id: string;
  date: string;
  minutes_played: number;
  sessions_count: number;
  games_played: Record<string, number>; // { "field-vision": 2 }
}

// Game result after completing a round
export interface GameResult {
  score: number;
  accuracy: number;
  xpEarned: number;
  isPerfect: boolean;
  levelCompleted: boolean;
  newHighScore: boolean;
}
