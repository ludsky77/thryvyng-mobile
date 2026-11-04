import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logError } from '../utils/logError';
import type { GameLevel, GameSession, GameResult } from '../types/games';

interface UseGameSessionProps {
  gameId: string;
  gameSlug: string;
}

/**
 * WHICH of `recordSession`'s four writes went wrong — RELEASE-1.0.20-FIXES
 * (Lu, 2026-11-04), the "games silent save" item.
 *
 * WHAT WAS SILENT, precisely. The screen did already show one Alert when
 * `recordSession` returned false, so the WHOLE-save failure was visible. What
 * was not:
 *
 *   * **step 3, `daily_game_time`** — both the update and the insert threw
 *     their `{ error }` away without looking at it;
 *   * **step 4, `award_xp_safe`** — the same, so the XP the results screen
 *     has just told the player they earned could fail to be added and the
 *     save still reported success;
 *   * **every failure** went to `console.error`, which reaches no report. The
 *     repo's own rule for an absorbed failure is `utils/logError` (Sentry +
 *     a fixed console format), and this hook predates it.
 *
 * So a save could land half-written and be announced as a win. It now names
 * the step, and the screen says which part did not stick.
 *
 * NOT FIXED HERE, and it is the bigger half: `docs/recon/arcade.md` §0.1 has
 * step 1 failing outright because the live `game_sessions` is the soccer
 * live-stats table and no longer has `player_id` / `game_id` / `score`. That
 * is a SCHEMA question (SACRED) and is deliberately untouched — this item was
 * "a failed save is not silent", and after this change that failure reports
 * itself as `step: 'session'` instead of as a bare sentence.
 */
export type RecordSessionStep =
  | 'signed-out'
  | 'session'
  | 'progress'
  | 'daily'
  | 'xp';

export type RecordSessionOutcome =
  | { ok: true }
  | { ok: false; step: RecordSessionStep };

/**
 * What to tell the player, per step. Each one says what DID land, because
 * "failed to save" over a half-written save is worse than saying which half.
 */
export const RECORD_SESSION_MESSAGES: Record<RecordSessionStep, string> = {
  'signed-out':
    "We couldn't tell who was playing, so nothing was saved. Sign in and try again.",
  session: "Your score couldn't be saved. Your level and XP are unchanged.",
  progress:
    "Your score was saved but your level wasn't. Play the level again to record it.",
  daily:
    "Your score and level were saved. Today's play time wasn't recorded, and your XP may not have been added.",
  xp: 'Your score and level were saved, but the XP was not added to your total.',
};

export function useGameSession({ gameId, gameSlug }: UseGameSessionProps) {
  const { currentRole } = useAuth();
  const playerId = currentRole?.entity_id;

  const [levels, setLevels] = useState<GameLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState<GameLevel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch levels for this game (select('*') returns all columns: config, spin_type, spin_intensity, trajectory_type, etc.)
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
  const recordSession = useCallback(async (
    result: GameResult,
    durationSeconds: number
  ): Promise<RecordSessionOutcome> => {
    // Not "the save failed": we never had a player or a level to save for.
    // Named so the screen stops offering "try again" for something trying
    // again cannot fix.
    if (!playerId || !currentLevel) {
      logError('useGameSession.recordSession', 'no player or no level', {
        gameId,
        gameSlug,
        hasPlayer: !!playerId,
        hasLevel: !!currentLevel,
      });
      return { ok: false, step: 'signed-out' };
    }

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

      if (sessionError) {
        // docs/recon/arcade.md §0.1: this is the step expected to fail today,
        // because the live `game_sessions` is the soccer live-stats table.
        logError('useGameSession.insertSession', sessionError, {
          gameId,
          gameSlug,
          levelNumber: currentLevel.level_number,
        });
        return { ok: false, step: 'session' };
      }

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

        if (updateError) {
          logError('useGameSession.updateProgress', updateError, {
            gameId,
            gameSlug,
            progressId: existingProgress.id,
          });
          return { ok: false, step: 'progress' };
        }
      } else {
        const { error: insertError } = await supabase
          .from('player_game_progress')
          .insert({ ...progressData, created_at: new Date().toISOString() });

        if (insertError) {
          logError('useGameSession.insertProgress', insertError, {
            gameId,
            gameSlug,
            playerId,
          });
          return { ok: false, step: 'progress' };
        }
      }

      // 3. Update daily game time
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const minutesPlayed = Math.ceil(durationSeconds / 60);

      const { data: existingDaily } = await supabase
        .from('daily_game_time')
        .select('*')
        .eq('player_id', playerId)
        .eq('date', today)
        .maybeSingle();

      const gamesPlayed = existingDaily?.games_played || {};
      gamesPlayed[gameSlug] = (gamesPlayed[gameSlug] || 0) + 1;

      // BOTH results are read now. These two were the silent pair: the write
      // was fired and the `{ error }` dropped, so a refused daily row looked
      // exactly like a written one.
      const { error: dailyError } = existingDaily
        ? await supabase
            .from('daily_game_time')
            .update({
              minutes_played: existingDaily.minutes_played + minutesPlayed,
              sessions_count: existingDaily.sessions_count + 1,
              games_played: gamesPlayed,
            })
            .eq('id', existingDaily.id)
        : await supabase
            .from('daily_game_time')
            .insert({
              player_id: playerId,
              date: today,
              minutes_played: minutesPlayed,
              sessions_count: 1,
              games_played: gamesPlayed,
            });

      if (dailyError) {
        logError('useGameSession.dailyGameTime', dailyError, {
          gameId,
          gameSlug,
          date: today,
          existing: !!existingDaily,
        });
        return { ok: false, step: 'daily' };
      }

      // 4. Award XP to player's total via RPC (CORRECT PARAMETERS)
      if (result.xpEarned > 0) {
        const { error: xpError } = await supabase.rpc('award_xp_safe', {
          p_player_id: playerId,
          p_source_type: 'cognitive_game',
          p_source_id: gameId,
          p_amount: result.xpEarned,
        });
        // A refusal here is NOT the same as `already_awarded`, which the
        // function returns as a VALUE and not as an error — game XP is once
        // per game forever (arcade.md §0.2), so a second play legitimately
        // adds nothing and that path produces no error to report.
        if (xpError) {
          logError('useGameSession.awardXp', xpError, {
            gameId,
            gameSlug,
            amount: result.xpEarned,
          });
          return { ok: false, step: 'xp' };
        }
      }

      return { ok: true };
    } catch (err) {
      // Anything thrown rather than returned — a dropped connection mid-save.
      // `console.error` reached no report on a release build; logError does.
      logError('useGameSession.recordSession', err, { gameId, gameSlug });
      return { ok: false, step: 'session' };
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
