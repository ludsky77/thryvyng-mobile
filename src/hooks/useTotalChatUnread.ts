import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const LOOKBACK_DAYS = 30;

export function useTotalChatUnread(): number {
  const { user } = useAuth();
  const [totalUnread, setTotalUnread] = useState(0);

  const fetchUnread = useCallback(async () => {
    if (!user?.id) {
      setTotalUnread(0);
      return;
    }

    const { data: memberships } = await supabase
      .from('comm_channel_members')
      .select('channel_id, last_read_at')
      .eq('user_id', user.id);

    if (!memberships?.length) {
      setTotalUnread(0);
      return;
    }

    const channelIds = memberships.map((m: any) => m.channel_id);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

    const { data: messages } = await supabase
      .from('comm_messages')
      .select('channel_id, created_at, user_id')
      .in('channel_id', channelIds)
      .eq('is_deleted', false)
      .neq('user_id', user.id)
      .gte('created_at', cutoff.toISOString());

    if (!messages?.length) {
      setTotalUnread(0);
      return;
    }

    const readMap = new Map<string, string | null>(
      memberships.map((m: any) => [m.channel_id, m.last_read_at ?? null])
    );

    let total = 0;
    for (const msg of messages as any[]) {
      const lastRead = readMap.get(msg.channel_id);
      if (!lastRead || new Date(msg.created_at) > new Date(lastRead)) {
        total++;
      }
    }
    setTotalUnread(total);
  }, [user?.id]);

  useEffect(() => {
    fetchUnread();
  }, [fetchUnread]);

  // Re-fetch on new messages or when last_read_at is updated
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`total-unread-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comm_messages' },
        () => fetchUnread()
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'comm_channel_members',
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchUnread()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchUnread]);

  return totalUnread;
}
