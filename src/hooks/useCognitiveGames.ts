import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type {
  CognitiveGame,
  PlayerGameProgress,
  DailyGameTime,
} from '../types/games';

export function useCognitiveGames() {
  const { currentRole } = useAuth();
  const playerId = currentRole?.entity_id;

  const [games, setGames] = useState<CognitiveGame[]>([]);
  const [progress, setProgress] = useState<PlayerGameProgress[]>([]);
  const [dailyTime, setDailyTime] = useState<DailyGameTime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all active games
  const fetchGames = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('cognitive_games')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (error) throw error;
      setGames(data || []);
    } catch (err) {
      console.error('Error fetching games:', err);
      setError('Failed to load games');
    }
  }, []);

  // Fetch player's progress for all games
  const fetchProgress = useCallback(async () => {
    if (!playerId) return;

    try {
      const { data, error } = await supabase
        .from('player_game_progress')
        .select('*')
        .eq('player_id', playerId);

      if (error) throw error;
      setProgress(data || []);
    } catch (err) {
      console.error('Error fetching progress:', err);
    }
  }, [playerId]);

  // Fetch today's play time
  const fetchDailyTime = useCallback(async () => {
    if (!playerId) return;

    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    try {
      const { data, error } = await supabase
        .from('daily_game_time')
        .select('*')
        .eq('player_id', playerId)
        .eq('date', today)
        .maybeSingle();

      if (error) throw error;
      setDailyTime(data || null);
    } catch (err) {
      console.error('Error fetching daily time:', err);
    }
  }, [playerId]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchGames(), fetchProgress(), fetchDailyTime()]);
      setLoading(false);
    };

    loadData();
  }, [fetchGames, fetchProgress, fetchDailyTime]);

  // Get progress for a specific game
  const getGameProgress = useCallback((gameId: string): PlayerGameProgress | undefined => {
    return progress.find(p => p.game_id === gameId);
  }, [progress]);

  // Calculate minutes remaining today (TEMP: bypass limit for testing)
  const minutesRemaining = 999; // TEMP: bypass limit for testing

  // Calculate total XP earned from all games
  const totalXpEarned = progress.reduce((sum, p) => sum + (p.total_xp_earned || 0), 0);

  // Refetch all data
  const refetch = useCallback(async () => {
    await Promise.all([fetchGames(), fetchProgress(), fetchDailyTime()]);
  }, [fetchGames, fetchProgress, fetchDailyTime]);

  return {
    games,
    progress,
    dailyTime,
    loading,
    error,
    playerId,
    getGameProgress,
    minutesRemaining,
    totalXpEarned,
    refetch,
  };
}
