import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Poll, PollOption } from '../types';

export function usePoll(pollId: string | null) {
  const { user } = useAuth();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPoll = useCallback(async () => {
    if (!pollId) return;
    
    setLoading(true);
    
    const { data: pollData, error: pollError } = await supabase
      .from('comm_polls')
      .select(`
        *,
        options:comm_poll_options(*)
      `)
      .eq('id', pollId)
      .single();

    if (pollError || !pollData) {
      setLoading(false);
      return;
    }

    const { data: votes } = await supabase
      .from('comm_poll_votes')
      .select('*')
      .eq('poll_id', pollId);

    const userVotes = votes?.filter(v => v.user_id === user?.id) || [];

    const optionsWithCounts = pollData.options?.map((opt: PollOption) => ({
      ...opt,
      vote_count: votes?.filter(v => v.option_id === opt.id).length || 0
    })) || [];

    setPoll({
      ...pollData,
      options: optionsWithCounts,
      votes: votes || [],
      user_votes: userVotes
    } as Poll);
    
    setLoading(false);
  }, [pollId, user?.id]);

  useEffect(() => {
    fetchPoll();
  }, [fetchPoll]);

  useEffect(() => {
    if (!pollId) return;

    const channel = supabase
      .channel(`poll_votes:${pollId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comm_poll_votes',
          filter: `poll_id=eq.${pollId}`
        },
        () => {
          fetchPoll();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pollId, fetchPoll]);

  const vote = async (optionId: string) => {
    if (!user || !poll) return false;

    if (poll.poll_type === 'single' || poll.poll_type === 'yes_no') {
      await supabase
        .from('comm_poll_votes')
        .delete()
        .eq('poll_id', poll.id)
        .eq('user_id', user.id);
    }

    const { error } = await supabase.from('comm_poll_votes').insert({
      poll_id: poll.id,
      option_id: optionId,
      user_id: user.id
    });

    if (!error) {
      await fetchPoll();
    }
    return !error;
  };

  const removeVote = async (optionId: string) => {
    if (!user || !poll) return false;

    const { error } = await supabase
      .from('comm_poll_votes')
      .delete()
      .eq('poll_id', poll.id)
      .eq('option_id', optionId)
      .eq('user_id', user.id);

    if (!error) {
      await fetchPoll();
    }
    return !error;
  };

  const closePoll = async () => {
    if (!user || !poll || poll.created_by !== user.id) return false;

    const { error } = await supabase
      .from('comm_polls')
      .update({ is_active: false })
      .eq('id', poll.id);

    if (!error) {
      await fetchPoll();
    }
    return !error;
  };

  return { poll, loading, vote, removeVote, closePoll, refetch: fetchPoll };
}

export function useCreatePoll() {
  const { user } = useAuth();

  const createPoll = async (
    channelId: string,
    question: string,
    pollType: 'single' | 'multiple' | 'ranked' | 'yes_no',
    options: string[],
    settings: {
      isAnonymous?: boolean;
      showResultsLive?: boolean;
      allowAddOptions?: boolean;
      endsAt?: Date | null;
      teamId?: string;
      /** When migration adds send_reminder column, persist this */
      sendReminder?: boolean;
      /** When migration adds reminder_before_minutes column, persist (60, 120, or 1440) */
      reminderBeforeMinutes?: number;
    } = {}
  ) => {
    if (!user) return null;

    // Get team_id from channel if not provided
    let teamId = settings.teamId;
    if (!teamId) {
      const { data: channel } = await supabase
        .from('comm_channels')
        .select('team_id')
        .eq('id', channelId)
        .single();
      teamId = channel?.team_id || undefined;
    }

    const { data: poll, error: pollError } = await supabase
      .from('comm_polls')
      .insert({
        channel_id: channelId,
        team_id: teamId,
        created_by: user.id,
        question,
        poll_type: pollType,
        is_anonymous: settings.isAnonymous || false,
        show_results_live: settings.showResultsLive ?? true,
        allow_add_options: settings.allowAddOptions || false,
        ends_at: settings.endsAt?.toISOString() || null
      })
      .select()
      .single();

    if (pollError || !poll) return null;

    const optionsToInsert = options.map((text, index) => ({
      poll_id: poll.id,
      option_text: text,
      sort_order: index,
      added_by: user.id
    }));

    const { error: optionsError } = await supabase
      .from('comm_poll_options')
      .insert(optionsToInsert);

    if (optionsError) return null;

    // Create the poll message with the poll_id linked
    await supabase.from('comm_messages').insert({
      channel_id: channelId,
      user_id: user.id,
      content: `📊 Poll: ${question}`,
      message_type: 'poll',
      poll_id: poll.id
    });

    return poll;
  };

  return { createPoll };
}