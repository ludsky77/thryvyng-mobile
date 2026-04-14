import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const LOOKBACK_DAYS = 30;
const DEBOUNCE_MS = 3000; // Wait 3 seconds after last message before re-fetching

export function useTotalChatUnread(): number {
  const { user } = useAuth();
  const [totalUnread, setTotalUnread] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const fetchUnread = useCallback(async () => {
    if (!user?.id || !isMountedRef.current) {
      setTotalUnread(0);
      return;
    }

    try {
      const { data: memberships } = await supabase
        .from('comm_channel_members')
        .select('channel_id, last_read_at')
        .eq('user_id', user.id);

      if (!memberships?.length || !isMountedRef.current) {
        setTotalUnread(0);
        return;
      }

      // Count unread per channel using individual count queries (faster than fetching all messages)
      let total = 0;
      const countPromises = memberships.map(async (m: any) => {
        const lastRead = m.last_read_at;
        let query = supabase
          .from('comm_messages')
          .select('id', { count: 'exact', head: true })
          .eq('channel_id', m.channel_id)
          .eq('is_deleted', false)
          .neq('user_id', user.id);

        if (lastRead) {
          query = query.gt('created_at', lastRead);
        } else {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
          query = query.gte('created_at', cutoff.toISOString());
        }

        const { count } = await query;
        return count || 0;
      });

      const counts = await Promise.all(countPromises);
      total = counts.reduce((sum, c) => sum + c, 0);

      if (isMountedRef.current) {
        setTotalUnread(total);
      }
    } catch (err) {
      console.error('useTotalChatUnread error:', err);
    }
  }, [user?.id]);

  // Debounced version — waits for activity to settle before querying
  const debouncedFetch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchUnread();
    }, DEBOUNCE_MS);
  }, [fetchUnread]);

  // Initial fetch on mount
  useEffect(() => {
    isMountedRef.current = true;
    fetchUnread();
    return () => {
      isMountedRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [fetchUnread]);

  // Subscribe to changes — debounced so rapid messages don't cause query storm
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`total-unread-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comm_messages' },
        () => debouncedFetch()
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'comm_channel_members',
          filter: `user_id=eq.${user.id}`,
        },
        () => debouncedFetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, debouncedFetch]);

  return totalUnread;
}
