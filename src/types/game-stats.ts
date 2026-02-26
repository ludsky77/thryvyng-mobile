// Game session status
export type GameStatus =
  | 'scheduled'
  | 'warmup'
  | 'first_half'
  | 'halftime'
  | 'second_half'
  | 'finished'
  | 'cancelled';

// Player positions (detailed)
export type PlayerPosition =
  | 'GK'
  | 'CB'
  | 'LB'
  | 'RB'
  | 'CDM'
  | 'CM'
  | 'CAM'
  | 'LW'
  | 'RW'
  | 'ST';

// Player line for group MVP voting
export type PlayerLine = 'defense' | 'midfield' | 'forward';

// Event types that can be recorded
export type GameEventType =
  | 'goal'
  | 'own_goal'
  | 'penalty_goal'
  | 'penalty_miss'
  | 'yellow_card'
  | 'red_card'
  | 'second_yellow'
  | 'substitution'
  | 'shot'
  | 'shot_on_target'
  | 'save'
  | 'foul'
  | 'corner'
  | 'offside'
  | 'injury'
  | 'kickoff'
  | 'halftime'
  | 'fulltime';

// MVP vote type
export type MVPVoteType = 'individual' | 'group' | 'team';

// USYS game formats
export interface USYSFormat {
  format: string;
  halfLength: number;
  periods: number;
  periodType: 'halves' | 'quarters';
  ballSize: number;
}

export const USYS_FORMATS: Record<string, USYSFormat> = {
  U6: { format: '4v4', halfLength: 10, periods: 4, periodType: 'quarters', ballSize: 3 },
  U7: { format: '4v4', halfLength: 10, periods: 4, periodType: 'quarters', ballSize: 3 },
  U8: { format: '4v4', halfLength: 12, periods: 4, periodType: 'quarters', ballSize: 3 },
  U9: { format: '7v7', halfLength: 25, periods: 2, periodType: 'halves', ballSize: 4 },
  U10: { format: '7v7', halfLength: 25, periods: 2, periodType: 'halves', ballSize: 4 },
  U11: { format: '9v9', halfLength: 30, periods: 2, periodType: 'halves', ballSize: 4 },
  U12: { format: '9v9', halfLength: 30, periods: 2, periodType: 'halves', ballSize: 4 },
  U13: { format: '11v11', halfLength: 35, periods: 2, periodType: 'halves', ballSize: 5 },
  U14: { format: '11v11', halfLength: 35, periods: 2, periodType: 'halves', ballSize: 5 },
  U15: { format: '11v11', halfLength: 40, periods: 2, periodType: 'halves', ballSize: 5 },
  U16: { format: '11v11', halfLength: 40, periods: 2, periodType: 'halves', ballSize: 5 },
  U17: { format: '11v11', halfLength: 45, periods: 2, periodType: 'halves', ballSize: 5 },
  U18: { format: '11v11', halfLength: 45, periods: 2, periodType: 'halves', ballSize: 5 },
  U19: { format: '11v11', halfLength: 45, periods: 2, periodType: 'halves', ballSize: 5 },
};

// Position metadata with React Native compatible colors
export const POSITIONS: {
  id: PlayerPosition;
  name: string;
  line: PlayerLine;
  color: string;
}[] = [
  { id: 'GK', name: 'Goalkeeper', line: 'defense', color: '#f59e0b' },
  { id: 'CB', name: 'Center Back', line: 'defense', color: '#3b82f6' },
  { id: 'LB', name: 'Left Back', line: 'defense', color: '#3b82f6' },
  { id: 'RB', name: 'Right Back', line: 'defense', color: '#3b82f6' },
  { id: 'CDM', name: 'Defensive Mid', line: 'midfield', color: '#10b981' },
  { id: 'CM', name: 'Center Mid', line: 'midfield', color: '#10b981' },
  { id: 'CAM', name: 'Attacking Mid', line: 'midfield', color: '#10b981' },
  { id: 'LW', name: 'Left Wing', line: 'forward', color: '#ef4444' },
  { id: 'RW', name: 'Right Wing', line: 'forward', color: '#ef4444' },
  { id: 'ST', name: 'Striker', line: 'forward', color: '#ef4444' },
];

// Database row types (same as web)
export interface GameSession {
  id: string;
  event_id: string;
  team_id: string;
  opponent_name: string | null;
  status: GameStatus;
  kickoff_at: string | null;
  halftime_at: string | null;
  second_half_start_at: string | null;
  fulltime_at: string | null;
  home_score: number;
  away_score: number;
  is_home_team: boolean;
  possession_home: number | null;
  home_passes: number | null;
  away_passes: number | null;
  game_format: string | null;
  half_length_minutes: number | null;
  period_type: 'halves' | 'quarters' | null;
  stats_keeper_id: string | null;
  stats_keeper_started_at: string | null;
  stats_keeper_last_active_at: string | null;
  mvp_voting_mode: MVPVoteType | null;
  mvp_voting_open: boolean;
  mvp_voting_closed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  team?: {
    id: string;
    name: string;
    club?: {
      id: string;
      name: string;
      logo_url: string | null;
    };
  };
}

export interface GameLineup {
  id: string;
  game_session_id: string;
  player_id: string | null;
  guest_player_name: string | null;
  guest_jersey_number: number | null;
  position: PlayerPosition | null;
  is_starter: boolean;
  is_currently_on_field: boolean;
  total_minutes_played: number;
  jersey_number: number | null;
  player_line: PlayerLine | null;
  created_at: string;
  updated_at: string;
  player?: {
    id: string;
    first_name: string;
    last_name: string;
    jersey_number: number | null;
    photo_url: string | null;
  };
}

export interface GameEvent {
  id: string;
  game_session_id: string;
  event_type: GameEventType;
  player_id: string | null;
  lineup_id: string | null;
  secondary_player_id: string | null;
  secondary_lineup_id: string | null;
  game_minute: number;
  period: number;
  is_opponent_event: boolean;
  position_at_event: string | null;
  notes: string | null;
  recorded_by: string;
  created_at: string;
  player?: {
    first_name: string;
    last_name: string;
    jersey_number: number | null;
  };
  secondary_player?: {
    first_name: string;
    last_name: string;
    jersey_number: number | null;
  };
}

export interface GameMVPVote {
  id: string;
  game_session_id: string;
  voter_id: string;
  vote_type: MVPVoteType;
  player_id: string | null;
  rank: number | null;
  group_name: PlayerLine | null;
  created_at: string;
}

export interface LiveGame {
  game_session_id: string;
  event_id: string;
  team_id: string;
  team_name: string;
  club_id: string;
  club_name: string;
  opponent_name: string | null;
  status: GameStatus;
  home_score: number;
  away_score: number;
  is_home_team: boolean;
  possession_home: number | null;
  game_format: string | null;
  half_length_minutes: number | null;
  stats_keeper_id: string | null;
  stats_keeper_name: string | null;
  kickoff_at: string | null;
  event_date: string;
  start_time: string | null;
  location_name: string | null;
}

export interface PlayerGameStats {
  game_session_id: string;
  player_id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  photo_url: string | null;
  position: PlayerPosition | null;
  player_line: PlayerLine | null;
  is_starter: boolean;
  total_minutes_played: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  shots: number;
  shots_on_target: number;
}
