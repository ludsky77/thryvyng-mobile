import { supabase } from '../lib/supabase';
import type {
  GameLineup,
  GameEvent,
  PlayerPosition,
  GameEventType,
  MVPVoteType,
  PlayerLine,
} from '../types/game-stats';

export const gameStatsService = {
  // Get or create game session from calendar event
  async getOrCreateSession(eventId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.rpc('get_or_create_game_session', {
      p_event_id: eventId,
      p_user_id: user.id,
    });

    if (error) throw error;
    return data as {
      success: boolean;
      session_id?: string;
      is_new?: boolean;
      error?: string;
    };
  },

  // Claim stats keeper role
  async claimStatsKeeper(gameSessionId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.rpc('claim_stats_keeper', {
      p_game_session_id: gameSessionId,
      p_user_id: user.id,
    });

    if (error) throw error;
    return data as { success: boolean; error?: string };
  },

  // Release stats keeper role
  async releaseStatsKeeper(gameSessionId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.rpc('release_stats_keeper', {
      p_game_session_id: gameSessionId,
      p_user_id: user.id,
    });

    if (error) throw error;
    return data as { success: boolean; error?: string };
  },

  // Transfer stats keeper to another user
  async transferStatsKeeper(gameSessionId: string, toUserId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.rpc('transfer_stats_keeper', {
      p_game_session_id: gameSessionId,
      p_from_user_id: user.id,
      p_to_user_id: toUserId,
    });

    if (error) throw error;
    return data as { success: boolean; error?: string };
  },

  // Send heartbeat to stay active as stats keeper
  async sendHeartbeat(gameSessionId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.rpc('stats_keeper_heartbeat', {
      p_game_session_id: gameSessionId,
      p_user_id: user.id,
    });
  },

  // Update game status
  async updateGameStatus(gameSessionId: string, newStatus: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.rpc('update_game_status', {
      p_game_session_id: gameSessionId,
      p_user_id: user.id,
      p_new_status: newStatus,
    });

    if (error) throw error;
    return data as { success: boolean; error?: string };
  },

  // Reopen a finished game (resume recording)
  async reopenGame(gameSessionId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('game_sessions')
      .update({
        status: 'second_half',
        stats_keeper_id: user.id,
        stats_keeper_last_active_at: new Date().toISOString(),
      } as any)
      .eq('id', gameSessionId);

    if (error) throw error;
    return { success: true };
  },

  // Record a goal
  async recordGoal(params: {
    gameSessionId: string;
    playerId?: string;
    assistPlayerId?: string;
    gameMinute: number;
    period: number;
    isOpponent?: boolean;
    isOwnGoal?: boolean;
    isPenalty?: boolean;
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.rpc('record_goal', {
      p_game_session_id: params.gameSessionId,
      p_user_id: user.id,
      p_player_id: params.playerId || null,
      p_assist_player_id: params.assistPlayerId || null,
      p_game_minute: params.gameMinute,
      p_period: params.period,
      p_is_opponent: params.isOpponent || false,
      p_is_own_goal: params.isOwnGoal || false,
      p_is_penalty: params.isPenalty || false,
    });

    if (error) throw error;
    return data as { success: boolean; event_id?: string; error?: string };
  },

  // Record a substitution
  async recordSubstitution(params: {
    gameSessionId: string;
    playerInId: string;
    playerOutId?: string;
    gameMinute: number;
    period: number;
    position?: PlayerPosition;
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.rpc('record_substitution', {
      p_game_session_id: params.gameSessionId,
      p_user_id: user.id,
      p_player_in_id: params.playerInId,
      p_player_out_id: params.playerOutId || null,
      p_game_minute: params.gameMinute,
      p_period: params.period,
      p_position: params.position || null,
    });

    if (error) throw error;
    return data as { success: boolean; error?: string };
  },

  // Record generic event (cards, shots, etc.)
  async recordEvent(params: {
    gameSessionId: string;
    eventType: GameEventType;
    playerId?: string;
    gameMinute: number;
    period: number;
    isOpponent?: boolean;
    notes?: string;
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.rpc('record_game_event', {
      p_game_session_id: params.gameSessionId,
      p_user_id: user.id,
      p_event_type: params.eventType,
      p_player_id: params.playerId || null,
      p_game_minute: params.gameMinute,
      p_period: params.period,
      p_is_opponent: params.isOpponent || false,
      p_notes: params.notes || null,
    });

    if (error) throw error;
    return data as { success: boolean; event_id?: string; error?: string };
  },

  // Delete a game event
  async deleteEvent(eventId: string, gameSessionId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get the event first to check if it's a goal (need to update score)
    const { data: event } = await supabase
      .from('game_events')
      .select('event_type, is_opponent_event')
      .eq('id', eventId)
      .single();

    // Delete the event
    const { error } = await supabase
      .from('game_events')
      .delete()
      .eq('id', eventId);

    if (error) throw error;

    // If it was a goal, decrement the score
    if (event && ['goal', 'penalty_goal', 'own_goal'].includes(event.event_type)) {
      const scoreField = event.is_opponent_event ? 'away_score' : 'home_score';

      // Get current score
      const { data: session } = await supabase
        .from('game_sessions')
        .select('home_score, away_score')
        .eq('id', gameSessionId)
        .single();

      if (session) {
        const newScore = Math.max(0, (session[scoreField] || 0) - 1);
        await supabase
          .from('game_sessions')
          .update({ [scoreField]: newScore } as any)
          .eq('id', gameSessionId);
      }
    }

    return { success: true };
  },

  // Cast MVP vote
  async castMVPVote(params: {
    gameSessionId: string;
    voteType: MVPVoteType;
    playerId?: string;
    rank?: number;
    groupName?: PlayerLine;
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.rpc('cast_mvp_vote', {
      p_game_session_id: params.gameSessionId,
      p_voter_id: user.id,
      p_vote_type: params.voteType,
      p_player_id: params.playerId || null,
      p_rank: params.rank || null,
      p_group_name: params.groupName || null,
    });

    if (error) throw error;
    return data as { success: boolean; error?: string };
  },

  // Get MVP results
  async getMVPResults(gameSessionId: string) {
    const { data, error } = await supabase.rpc('get_mvp_results', {
      p_game_session_id: gameSessionId,
    });

    if (error) throw error;
    return data;
  },

  // Get game summary
  async getGameSummary(gameSessionId: string) {
    const { data, error } = await supabase.rpc('get_game_summary', {
      p_game_session_id: gameSessionId,
    });

    if (error) throw error;
    return data;
  },

  // Get live game state
  async getLiveGameState(gameSessionId: string) {
    const { data, error } = await supabase.rpc('get_live_game_state', {
      p_game_session_id: gameSessionId,
    });

    if (error) throw error;
    return data;
  },

  // Get game timeline
  async getGameTimeline(gameSessionId: string): Promise<GameEvent[]> {
    const { data, error } = await supabase.rpc('get_game_timeline', {
      p_game_session_id: gameSessionId,
    });

    if (error) throw error;
    return (data || []) as GameEvent[];
  },

  // Get online parents for transfer
  async getOnlineParents(gameSessionId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase.rpc('get_online_team_parents', {
      p_game_session_id: gameSessionId,
      p_exclude_user_id: user?.id || null,
    });

    if (error) throw error;
    return (data || []) as {
      user_id: string;
      full_name: string;
      avatar_url: string | null;
    }[];
  },

  // Get live games for club
  async getLiveGames(clubId: string) {
    const { data, error } = await supabase
      .from('live_games')
      .select('*')
      .eq('club_id', clubId);

    if (error) throw error;
    return data || [];
  },

  // Add player to lineup
  async addToLineup(params: {
    gameSessionId: string;
    playerId?: string;
    guestPlayerName?: string;
    guestJerseyNumber?: number;
    position?: PlayerPosition;
    isStarter?: boolean;
  }): Promise<GameLineup> {
    const line: PlayerLine | null = params.position
      ? (['GK', 'CB', 'LB', 'RB'].includes(params.position)
        ? 'defense'
        : ['CDM', 'CM', 'CAM'].includes(params.position)
          ? 'midfield'
          : 'forward')
      : null;

    const { data, error } = await supabase
      .from('game_lineup')
      .insert({
        game_session_id: params.gameSessionId,
        player_id: params.playerId || null,
        guest_player_name: params.guestPlayerName || null,
        guest_jersey_number: params.guestJerseyNumber || null,
        position: params.position || null,
        is_starter: params.isStarter || false,
        is_currently_on_field: params.isStarter || false,
        player_line: line,
      } as any)
      .select()
      .single();

    if (error) throw error;
    return data as unknown as GameLineup;
  },

  // Get lineup for game - FAST VERSION using RPC
  async getLineup(gameSessionId: string): Promise<GameLineup[]> {
    const { data, error } = await supabase.rpc('get_game_lineup', {
      p_game_session_id: gameSessionId,
    });

    if (error) throw error;
    return (data || []) as unknown as GameLineup[];
  },

  // Update possession
  async updatePossession(
    gameSessionId: string,
    homePasses: number,
    awayPasses: number
  ) {
    const total = homePasses + awayPasses;
    const possessionHome = total > 0 ? Math.round((homePasses / total) * 100) : 50;

    const { error } = await supabase
      .from('game_sessions')
      .update({
        home_passes: homePasses,
        away_passes: awayPasses,
        possession_home: possessionHome,
      } as any)
      .eq('id', gameSessionId);

    if (error) throw error;
  },
};
