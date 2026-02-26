import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { gameStatsService } from '../services/gameStatsService';
import type { GameSession, GameLineup, GameEvent } from '../types/game-stats';
import { Alert } from 'react-native';

export function useLiveGameSession(gameSessionId: string | null) {
  const { user } = useAuth();
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>();

  const [session, setSession] = useState<GameSession | null>(null);
  const [lineup, setLineup] = useState<GameLineup[]>([]);
  const [timeline, setTimeline] = useState<GameEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetchSession = useCallback(async () => {
    if (!gameSessionId) return;
    try {
      const { data, error } = await supabase
        .from('game_sessions')
        .select(
          `
          *,
          team:teams(
            id,
            name,
            club:clubs(
              id,
              name,
              logo_url
            )
          )
        `
        )
        .eq('id', gameSessionId)
        .single();

      if (error) throw error;
      setSession(data as unknown as GameSession);
    } catch (err) {
      console.error('[useLiveGameSession] Error fetching session:', err);
    }
  }, [gameSessionId]);

  const refetchLineup = useCallback(async () => {
    if (!gameSessionId) return;
    try {
      const data = await gameStatsService.getLineup(gameSessionId);
      setLineup(data);
    } catch (err) {
      console.error('[useLiveGameSession] Error fetching lineup:', err);
    }
  }, [gameSessionId]);

  const refetchTimeline = useCallback(async () => {
    if (!gameSessionId) return;
    try {
      const data = await gameStatsService.getGameTimeline(gameSessionId);
      setTimeline(data);
    } catch (err) {
      console.error('[useLiveGameSession] Error fetching timeline:', err);
    }
  }, [gameSessionId]);

  const refetchAll = useCallback(
    async (isInitial = false) => {
      if (!gameSessionId) return;
      if (isInitial) setIsLoading(true);
      try {
        await Promise.all([
          refetchSession(),
          refetchLineup(),
          refetchTimeline(),
        ]);
      } finally {
        if (isInitial) setIsLoading(false);
      }
    },
    [gameSessionId, refetchSession, refetchLineup, refetchTimeline]
  );

  // Initial fetch and periodic refetch (15s to reduce flickering)
  useEffect(() => {
    if (!gameSessionId) {
      setSession(null);
      setLineup([]);
      setTimeline([]);
      setIsLoading(false);
      return;
    }

    refetchAll(true);
    const interval = setInterval(() => refetchAll(false), 15000);
    return () => clearInterval(interval);
  }, [gameSessionId, refetchAll]);

  // Real-time subscriptions
  useEffect(() => {
    if (!gameSessionId) return;

    const channel = supabase
      .channel(`game:${gameSessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${gameSessionId}`,
        },
        () => refetchSession()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_events',
          filter: `game_session_id=eq.${gameSessionId}`,
        },
        () => refetchTimeline()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_lineup',
          filter: `game_session_id=eq.${gameSessionId}`,
        },
        () => refetchLineup()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameSessionId, refetchSession, refetchLineup, refetchTimeline]);

  // Heartbeat for stats keeper
  useEffect(() => {
    if (!gameSessionId || session?.stats_keeper_id !== user?.id) return;

    const sendHeartbeat = () => {
      gameStatsService.sendHeartbeat(gameSessionId);
    };

    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, 30000);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [gameSessionId, session?.stats_keeper_id, user?.id]);

  // Mutations
  const claimStatsKeeper = useCallback(async (): Promise<boolean> => {
    if (!gameSessionId) return false;
    const result = await gameStatsService.claimStatsKeeper(gameSessionId);
    if (result.success) {
      Alert.alert('Success', 'You are now recording stats');
      refetchSession();
      return true;
    } else {
      Alert.alert('Error', result.error || 'Could not claim stats keeper role');
      return false;
    }
  }, [gameSessionId, refetchSession]);

  const releaseStatsKeeper = useCallback(async () => {
    if (!gameSessionId) return;
    await gameStatsService.releaseStatsKeeper(gameSessionId);
    Alert.alert('Released', 'Stats recording released');
    refetchSession();
  }, [gameSessionId, refetchSession]);

  const updateStatus = useCallback(
    async (status: string) => {
      if (!gameSessionId) {
        console.log('[updateStatus] No gameSessionId');
        return;
      }

      console.log('[updateStatus] Updating to:', status);

      try {
        const result = await gameStatsService.updateGameStatus(gameSessionId, status);
        console.log('[updateStatus] Result:', result);

        if (result?.success) {
          refetchSession();
        } else {
          Alert.alert('Error', result?.error || 'Failed to update game status');
        }
      } catch (error: any) {
        console.error('[updateStatus] Error:', error);
        Alert.alert('Error', error?.message || 'Failed to update game status');
      }
    },
    [gameSessionId, refetchSession]
  );

  const recordGoal = useCallback(
    async (params: Parameters<typeof gameStatsService.recordGoal>[0]) => {
      await gameStatsService.recordGoal(params);
      refetchSession();
      refetchTimeline();
      Alert.alert('⚽ Goal!', 'Goal recorded');
    },
    [refetchSession, refetchTimeline]
  );

  const recordEvent = useCallback(
    async (params: Parameters<typeof gameStatsService.recordEvent>[0]) => {
      await gameStatsService.recordEvent(params);
      refetchTimeline();
    },
    [refetchTimeline]
  );

  const recordSubstitution = useCallback(
    async (
      params: Parameters<typeof gameStatsService.recordSubstitution>[0]
    ) => {
      await gameStatsService.recordSubstitution(params);
      refetchLineup();
      refetchTimeline();
      Alert.alert('🔄 Substitution', 'Substitution recorded');
    },
    [refetchLineup, refetchTimeline]
  );

  const deleteEvent = useCallback(
    async (eventId: string) => {
      if (!gameSessionId) return;
      try {
        await gameStatsService.deleteEvent(eventId, gameSessionId);
        refetchSession();
        refetchTimeline();
        Alert.alert('Deleted', 'Event removed');
      } catch (error: any) {
        Alert.alert('Error', error?.message || 'Failed to delete event');
      }
    },
    [gameSessionId, refetchSession, refetchTimeline]
  );

  const isLive =
    session?.status &&
    ['warmup', 'first_half', 'halftime', 'second_half'].includes(session.status);
  const isStatsKeeper = session?.stats_keeper_id === user?.id;

  return {
    session,
    lineup,
    timeline,
    isLoading,
    isLive: !!isLive,
    isStatsKeeper: !!isStatsKeeper,
    claimStatsKeeper,
    releaseStatsKeeper,
    updateStatus,
    recordGoal,
    recordEvent,
    recordSubstitution,
    deleteEvent,
    refetchAll,
  };
}
