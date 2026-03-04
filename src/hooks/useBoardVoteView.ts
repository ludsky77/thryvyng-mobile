import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface BoardVoteParticipant {
  id: string;
  name: string;
  initials: string;
  role: string;
  status: 'yes' | 'no' | 'pending' | 'unread';
  comment: string | null;
  optionText: string | null;
}

export interface UseBoardVoteViewResult {
  participants: BoardVoteParticipant[];
  isLoading: boolean;
  error: Error | null;
  markAsViewed: () => Promise<void>;
  refetch: () => Promise<void>;
}

function getInitials(name: string | null | undefined): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  }
  return name.charAt(0).toUpperCase();
}

function normalizeOptionToYesNo(optionText: string | null | undefined): 'yes' | 'no' | null {
  if (!optionText) return null;
  const lower = optionText.toLowerCase().trim();
  if (lower === 'yes' || lower === 'y') return 'yes';
  if (lower === 'no' || lower === 'n') return 'no';
  return null;
}

export function useBoardVoteView(
  pollId: string | null,
  channelId: string | null
): UseBoardVoteViewResult {
  const { user } = useAuth();
  const [participants, setParticipants] = useState<BoardVoteParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!pollId || !channelId) {
      setParticipants([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch channel members with profiles
      const { data: membersData, error: membersError } = await supabase
        .from('comm_channel_members')
        .select(`
          user_id,
          profile:profiles(id, full_name)
        `)
        .eq('channel_id', channelId);

      if (membersError) throw membersError;

      // 2. Fetch poll votes with option text and comment
      const { data: votesData, error: votesError } = await supabase
        .from('comm_poll_votes')
        .select(`
          user_id,
          option_id,
          comment,
          comm_poll_options(option_text)
        `)
        .eq('poll_id', pollId);

      if (votesError) throw votesError;

      // 3. Fetch poll views
      const { data: viewsData, error: viewsError } = await supabase
        .from('comm_poll_views')
        .select('user_id')
        .eq('poll_id', pollId);

      if (viewsError) throw viewsError;

      const votedUserIds = new Set((votesData || []).map((v: any) => v.user_id));
      const viewedUserIds = new Set((viewsData || []).map((v: any) => v.user_id));

      const voteMap = new Map<
        string,
        { optionText: string; comment: string | null }
      >();
      (votesData || []).forEach((v: any) => {
        const opt = Array.isArray(v.comm_poll_options)
          ? v.comm_poll_options[0]
          : v.comm_poll_options;
        const optionText = opt?.option_text ?? '';
        voteMap.set(v.user_id, {
          optionText,
          comment: v.comment ?? null,
        });
      });

      const merged: BoardVoteParticipant[] = (membersData || []).map(
        (m: any) => {
          const userId = m.user_id;
          const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile;
          const name = profile?.full_name ?? 'Unknown';
          const voteInfo = voteMap.get(userId);
          const hasVote = !!voteInfo;
          const hasView = viewedUserIds.has(userId);

          let status: 'yes' | 'no' | 'pending' | 'unread';
          let optionText: string | null = null;
          let comment: string | null = null;

          if (hasVote && voteInfo) {
            optionText = voteInfo.optionText || null;
            comment = voteInfo.comment;
            const normalized = normalizeOptionToYesNo(voteInfo.optionText);
            status = normalized === 'yes' ? 'yes' : normalized === 'no' ? 'no' : 'yes';
            // For non-yes/no options, treat as 'yes' (has voted)
            if (normalized === null && voteInfo.optionText) {
              status = 'yes';
            }
          } else if (hasView) {
            status = 'pending';
          } else {
            status = 'unread';
          }

          return {
            id: userId,
            name,
            initials: getInitials(name),
            role: 'Member',
            status,
            comment,
            optionText,
          };
        }
      );

      setParticipants(merged);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setParticipants([]);
    } finally {
      setIsLoading(false);
    }
  }, [pollId, channelId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time subscription for votes and views
  useEffect(() => {
    if (!pollId) return;

    const channel = supabase
      .channel(`board_vote_view:${pollId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comm_poll_votes',
          filter: `poll_id=eq.${pollId}`,
        },
        () => fetchData()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comm_poll_views',
          filter: `poll_id=eq.${pollId}`,
        },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pollId, fetchData]);

  const markAsViewed = useCallback(async () => {
    if (!pollId || !user?.id) return;

    try {
      await supabase.from('comm_poll_views').insert({
        poll_id: pollId,
        user_id: user.id,
      });
      await fetchData();
    } catch (err) {
      console.error('[useBoardVoteView] markAsViewed error:', err);
    }
  }, [pollId, user?.id, fetchData]);

  return {
    participants,
    isLoading,
    error,
    markAsViewed,
    refetch: fetchData,
  };
}

/**
 * Standalone helper to record that a user has viewed a poll.
 * Call this when opening a poll with display_style='board_room'.
 */
export async function recordPollView(
  pollId: string,
  userId: string
): Promise<void> {
  try {
    await supabase.from('comm_poll_views').insert({
      poll_id: pollId,
      user_id: userId,
    });
  } catch (err) {
    // Ignore duplicate key errors if table has unique on (poll_id, user_id)
    console.error('[recordPollView] error:', err);
  }
}
