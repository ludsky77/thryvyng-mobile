import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { subscribeToMessageInserts } from '../lib/realtimeHub';
import { useAuth } from '../contexts/AuthContext';

export const LOOKBACK_DAYS = 30;
const DEBOUNCE_MS = 3000; // Wait 3 seconds after last message before re-fetching

/*
 * ONE RULE for unread counting, shared by every surface that shows a count
 * (this hook's tab total and ChatScreen's per-card badge). Both previously
 * re-derived the rule and disagreed; these helpers are the single writer.
 *
 * A message is unread when ALL of the following hold:
 *   - its channel is not archived      (enforced by the caller's channel query)
 *   - it is not the reader's own       (enforced by the caller's .neq('user_id'))
 *   - it is not deleted                (enforced by the caller's .eq('is_deleted'))
 *   - it is strictly newer than the channel's unread floor (isUnreadMessage)
 *
 * The floor is last_read_at, falling back to the 30-day cutoff ONLY when
 * last_read_at is null.
 *
 * Mute is NOT part of this rule. A muted channel counts toward both in-app
 * surfaces exactly like any other; mute suppresses push notifications only.
 */

/** The 30-day floor, used only for channels the user has never read. */
export function unreadFallbackCutoff(now: Date = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  return cutoff.toISOString();
}

/** A channel's unread floor: last_read_at, else the 30-day fallback. */
export function unreadFloor(
  lastReadAt: string | null | undefined,
  fallbackCutoff: string
): string {
  return lastReadAt ?? fallbackCutoff;
}

/** A message is unread when it is strictly newer than its channel's floor. */
export function isUnreadMessage(
  createdAt: string,
  lastReadAt: string | null | undefined,
  fallbackCutoff: string
): boolean {
  return (
    new Date(createdAt).getTime() >
    new Date(unreadFloor(lastReadAt, fallbackCutoff)).getTime()
  );
}

/**
 * Reserved for the notification layer; not applied to in-app badges.
 * Mute affects push delivery only -- both the chat card count and the tab
 * total include muted channels. Kept exported so the push path (and
 * ChatScreen's muted-badge styling) has one place to ask.
 */
export function countsTowardUnread(membership: {
  is_muted?: boolean | null;
}): boolean {
  return membership?.is_muted !== true;
}

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
        .select('channel_id, last_read_at, is_muted')
        .eq('user_id', user.id);

      if (!memberships?.length || !isMountedRef.current) {
        setTotalUnread(0);
        return;
      }

      // Exclude archived channels — they are filtered out of the conversation list
      // (ChatScreen.tsx uses .eq('is_archived', false)), so counting their unread
      // messages produces a badge the user cannot act on.
      const membershipChannelIds = memberships.map((m: any) => m.channel_id);
      const { data: activeChannels } = await supabase
        .from('comm_channels')
        .select('id')
        .in('id', membershipChannelIds)
        .eq('is_archived', false);

      if (!isMountedRef.current) return;

      // Archived channels only. Muted channels are counted like any other --
      // mute suppresses push notifications, not in-app badges.
      const activeChannelIds = new Set((activeChannels || []).map((c: any) => c.id));
      const visibleMemberships = memberships.filter((m: any) =>
        activeChannelIds.has(m.channel_id)
      );

      if (!visibleMemberships.length) {
        setTotalUnread(0);
        return;
      }

      // Count unread per channel using individual count queries (faster than fetching all messages)
      let total = 0;
      const fallbackCutoff = unreadFallbackCutoff();
      const countPromises = visibleMemberships.map(async (m: any) => {
        const { count } = await supabase
          .from('comm_messages')
          .select('id', { count: 'exact', head: true })
          .eq('channel_id', m.channel_id)
          .eq('is_deleted', false)
          .neq('user_id', user.id)
          .gt('created_at', unreadFloor(m.last_read_at, fallbackCutoff));
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

    // comm_messages rides the shared hub; the membership listener stays on its
    // own channel because it is a different table and keeps a server-side filter.
    const unsubscribeMessages = subscribeToMessageInserts(() => debouncedFetch());

    const channel = supabase
      .channel(`total-unread-${user.id}`)
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
      unsubscribeMessages();
      supabase.removeChannel(channel);
    };
  }, [user?.id, debouncedFetch]);

  return totalUnread;
}
