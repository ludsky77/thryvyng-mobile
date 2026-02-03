import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { GameLevel, GameSession, GameResult } from '../types/games';

interface UseGameSessionProps {
  gameId: string;
  gameSlug: string;
}

export function useGameSession({ gameId, gameSlug }: UseGameSessionProps) {
  const { currentRole } = useAuth();
  const playerId = currentRole?.entity_id;

  const [levels, setLevels] = useState<GameLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState<GameLevel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch levels for this game
  const fetchLevels = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('game_levels')
        .select('*')
        .eq('game_id', gameId)
        .eq('is_active', true)
        .order('level_number');

      if (error) throw error;
      setLevels(data || []);

      // Set first level as default
      if (data && data.length > 0) {
        setCurrentLevel(data[0]);
      }
    } catch (err) {
      console.error('Error fetching levels:', err);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  // Select a specific level
  const selectLevel = useCallback((levelNumber: number) => {
    const level = levels.find(l => l.level_number === levelNumber);
    if (level) {
      setCurrentLevel(level);
    }
  }, [levels]);

  // Record a completed session and award XP
  const recordSession = useCallback(async (result: GameResult, durationSeconds: number): Promise<boolean> => {
    if (!playerId || !currentLevel) return false;

    setSaving(true);
    try {
      // 1. Insert game session
      const session: Omit<GameSession, 'id' | 'played_at'> = {
        player_id: playerId,
        game_id: gameId,
        level_number: currentLevel.level_number,
        score: result.score,
        xp_earned: result.xpEarned,
        duration_seconds: durationSeconds,
        accuracy_percentage: result.accuracy,
        is_perfect: result.isPerfect,
      };

      const { error: sessionError } = await supabase
        .from('game_sessions')
        .insert(session);

      if (sessionError) throw sessionError;

      // 2. Update player_game_progress (upsert)
      const { data: existingProgress } = await supabase
        .from('player_game_progress')
        .select('*')
        .eq('player_id', playerId)
        .eq('game_id', gameId)
        .maybeSingle();

      const newHighestLevel = result.levelCompleted
        ? Math.max(existingProgress?.highest_level_completed || 0, currentLevel.level_number)
        : existingProgress?.highest_level_completed || 0;

      const bestScores = existingProgress?.best_scores || {};
      const levelKey = String(currentLevel.level_number);
      if (result.newHighScore || !bestScores[levelKey]) {
        bestScores[levelKey] = Math.max(bestScores[levelKey] || 0, result.score);
      }

      const progressData = {
        player_id: playerId,
        game_id: gameId,
        current_level: result.levelCompleted
          ? Math.min(currentLevel.level_number + 1, levels.length)
          : currentLevel.level_number,
        highest_level_completed: newHighestLevel,
        total_xp_earned: (existingProgress?.total_xp_earned || 0) + result.xpEarned,
        total_sessions: (existingProgress?.total_sessions || 0) + 1,
        best_scores: bestScores,
        last_played_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (existingProgress) {
        const { error: updateError } = await supabase
          .from('player_game_progress')
          .update(progressData)
          .eq('id', existingProgress.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('player_game_progress')
          .insert({ ...progressData, created_at: new Date().toISOString() });

        if (insertError) throw insertError;
      }

      // 3. Update daily game time
      const today = new Date().toISOString().split('T')[0];
      const minutesPlayed = Math.ceil(durationSeconds / 60);

      const { data: existingDaily } = await supabase
        .from('daily_game_time')
        .select('*')
        .eq('player_id', playerId)
        .eq('date', today)
        .maybeSingle();

      const gamesPlayed = existingDaily?.games_played || {};
      gamesPlayed[gameSlug] = (gamesPlayed[gameSlug] || 0) + 1;

      if (existingDaily) {
        await supabase
          .from('daily_game_time')
          .update({
            minutes_played: existingDaily.minutes_played + minutesPlayed,
            sessions_count: existingDaily.sessions_count + 1,
            games_played: gamesPlayed,
          })
          .eq('id', existingDaily.id);
      } else {
        await supabase
          .from('daily_game_time')
          .insert({
            player_id: playerId,
            date: today,
            minutes_played: minutesPlayed,
            sessions_count: 1,
            games_played: gamesPlayed,
          });
      }

      // 4. Award XP to player's total via RPC (CORRECT PARAMETERS)
      if (result.xpEarned > 0) {
        await supabase.rpc('award_xp_safe', {
          p_player_id: playerId,
          p_source_type: 'cognitive_game',
          p_source_id: gameId,
          p_amount: result.xpEarned,
        });
      }

      return true;
    } catch (err) {
      console.error('Error recording session:', err);
      return false;
    } finally {
      setSaving(false);
    }
  }, [playerId, gameId, gameSlug, currentLevel, levels]);

  return {
    levels,
    currentLevel,
    loading,
    saving,
    fetchLevels,
    selectLevel,
    recordSession,
  };
}
