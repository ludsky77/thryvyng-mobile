import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

// Staff requests trickle in far more slowly than chat messages, so this settles
// quicker than useTotalChatUnread's 3s without risking a query storm.
const DEBOUNCE_MS = 1500;

export interface ClubTeamRef {
  id: string;
  name: string;
}

// Single writer for "which teams belong to this club". The badge counts across this set
// and StaffRequestsScreen lists across it — if they resolved it separately they could
// disagree, and a badge you cannot clear is worse than no badge.
export async function fetchClubTeams(clubId: string): Promise<ClubTeamRef[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name')
    .eq('club_id', clubId);

  if (error) throw error;
  return (data as ClubTeamRef[]) || [];
}

/**
 * Count of pending team_join_requests for one team, or across every team in a club.
 * Pass a teamId (coach) or a clubId (club admin); teamId wins if both are given.
 */
export function usePendingStaffRequests(
  teamId?: string | null,
  clubId?: string | null
): number {
  const [pendingCount, setPendingCount] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const fetchCount = useCallback(async () => {
    if ((!teamId && !clubId) || !isMountedRef.current) {
      setPendingCount(0);
      return;
    }

    try {
      // Club mode: resolve the club's teams first, then count across them.
      let clubTeamIds: string[] | null = null;
      if (!teamId && clubId) {
        const teams = await fetchClubTeams(clubId);
        if (!isMountedRef.current) return;
        clubTeamIds = teams.map((t) => t.id);
        if (!clubTeamIds.length) {
          setPendingCount(0);
          return;
        }
      }

      let query = supabase
        .from('team_join_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');

      query = clubTeamIds
        ? query.in('team_id', clubTeamIds)
        : query.eq('team_id', teamId as string);

      const { count } = await query;

      if (isMountedRef.current) {
        setPendingCount(count || 0);
      }
    } catch (err) {
      console.error('usePendingStaffRequests error:', err);
    }
  }, [teamId, clubId]);

  const debouncedFetch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchCount();
    }, DEBOUNCE_MS);
  }, [fetchCount]);

  // Initial fetch on mount
  useEffect(() => {
    isMountedRef.current = true;
    fetchCount();
    return () => {
      isMountedRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [fetchCount]);

  // Refresh when the dashboard regains focus — e.g. after approving from StaffRequests.
  useFocusEffect(
    useCallback(() => {
      fetchCount();
    }, [fetchCount])
  );

  useEffect(() => {
    if (!teamId && !clubId) return;

    // postgres_changes filters are single-column equality only, so club mode listens
    // broadly and leans on the debounce; team mode narrows server-side.
    const filter = teamId ? `team_id=eq.${teamId}` : undefined;
    const channel = supabase
      .channel(`pending-staff-requests-${teamId ?? clubId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_join_requests', ...(filter ? { filter } : {}) },
        () => debouncedFetch()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'team_join_requests', ...(filter ? { filter } : {}) },
        () => debouncedFetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, clubId, debouncedFetch]);

  return pendingCount;
}
