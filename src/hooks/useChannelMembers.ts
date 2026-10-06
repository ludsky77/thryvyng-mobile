import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fetchChannelTeamMemberNames } from '../lib/memberNames';

export interface ChannelMemberRead {
  user_id: string;
  last_read_message_id: string | null;
  full_name?: string | null;
}

export function useChannelMembers(channelId: string | null) {
  const [members, setMembers] = useState<ChannelMemberRead[]>([]);

  const fetchMembers = useCallback(async () => {
    if (!channelId) {
      setMembers([]);
      return;
    }
    const { data, error } = await supabase
      .from('comm_channel_members')
      .select(`
        user_id,
        last_read_message_id
      `)
      .eq('channel_id', channelId);

    if (error || !data) {
      setMembers([]);
      return;
    }
    // The old `profile:profiles(full_name)` embed resolved to null for a
    // regular viewer, so every member came back nameless. Names now come from
    // the team-gated RPC, which resolves for anyone on the team.
    const memberNames = await fetchChannelTeamMemberNames(channelId);
    const list: ChannelMemberRead[] = (data as any[]).map((row: any) => ({
      user_id: row.user_id,
      last_read_message_id: row.last_read_message_id ?? null,
      full_name: memberNames.get(row.user_id)?.name ?? null,
    }));
    setMembers(list);
  }, [channelId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const updateLastReadMessage = useCallback(
    async (messageId: string) => {
      if (!channelId) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;
      await supabase
        .from('comm_channel_members')
        .update({
          last_read_at: new Date().toISOString(),
          last_read_message_id: messageId,
        })
        .eq('channel_id', channelId)
        .eq('user_id', user.id);
      fetchMembers();
    },
    [channelId, fetchMembers]
  );

  return { members, refetch: fetchMembers, updateLastReadMessage };
}
