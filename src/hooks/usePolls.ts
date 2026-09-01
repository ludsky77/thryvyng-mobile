import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Poll, PollOption, VoterProfile } from '../types';

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
      .select('id, poll_id, option_id, user_id, rank, comment, profiles:profiles!user_id(id, full_name, avatar_url)')
      .eq('poll_id', pollId);

    const userVotes = votes?.filter(v => v.user_id === user?.id) || [];

    const optionsWithCounts = pollData.options?.map((opt: PollOption) => {
      const optVotes = votes?.filter(v => v.option_id === opt.id) || [];
      const voters = optVotes
        .map((v: any) => v.profiles)
        .filter(Boolean) as VoterProfile[];
      return {
        ...opt,
        vote_count: optVotes.length,
        voters,
      };
    }) || [];

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

  const vote = async (optionId: string, comment?: string | null) => {
    if (!user || !poll) return false;

    if (poll.poll_type === 'single' || poll.poll_type === 'yes_no') {
      await supabase
        .from('comm_poll_votes')
        .delete()
        .eq('poll_id', poll.id)
        .eq('user_id', user.id);
    }

    const insertPayload: { poll_id: string; option_id: string; user_id: string; comment?: string } = {
      poll_id: poll.id,
      option_id: optionId,
      user_id: user.id,
    };
    if (comment != null && comment !== '') {
      insertPayload.comment = comment;
    }

    const { error } = await supabase.from('comm_poll_votes').insert(insertPayload);

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

/**
 * createPoll reports partial failures instead of collapsing them to null:
 * a rolled-back poll returns { poll: null, error }, while a poll that saved but
 * failed to post its chat card returns { poll, error } so the caller can say so.
 */
export interface CreatePollResult {
  poll: Poll | null;
  error: string | null;
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
      displayStyle?: 'standard' | 'board_room';
      /** When migration adds send_reminder column, persist this */
      sendReminder?: boolean;
      /** When migration adds reminder_before_minutes column, persist (60, 120, or 1440) */
      reminderBeforeMinutes?: number;
    } = {}
  ): Promise<CreatePollResult> => {
    if (!user) {
      return { poll: null, error: 'You must be signed in to create a poll.' };
    }

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
        ends_at: settings.endsAt?.toISOString() || null,
        display_style: settings.displayStyle || 'standard',
      })
      .select()
      .single();

    if (pollError || !poll) {
      if (__DEV__) console.error('[useCreatePoll] poll insert failed', pollError);
      return { poll: null, error: 'Could not create the poll. Please try again.' };
    }

    const optionsToInsert = options.map((text, index) => ({
      poll_id: poll.id,
      option_text: text,
      sort_order: index,
      added_by: user.id
    }));

    const { error: optionsError } = await supabase
      .from('comm_poll_options')
      .insert(optionsToInsert);

    if (optionsError) {
      if (__DEV__) console.error('[useCreatePoll] options insert failed', optionsError);
      // Roll back the poll row we just created -- a poll with no options is
      // unanswerable and would sit in the channel forever.
      const { error: rollbackError } = await supabase
        .from('comm_polls')
        .delete()
        .eq('id', poll.id);
      if (rollbackError && __DEV__) {
        console.error(
          '[useCreatePoll] rollback of orphaned poll failed',
          poll.id,
          rollbackError
        );
      }
      return {
        poll: null,
        error: 'Could not save the poll options. Please try again.',
      };
    }

    // Create the poll message with the poll_id linked
    const { error: messageError } = await supabase.from('comm_messages').insert({
      channel_id: channelId,
      user_id: user.id,
      content: `📊 Poll: ${question}`,
      message_type: 'poll',
      poll_id: poll.id
    });

    if (messageError) {
      if (__DEV__) console.error('[useCreatePoll] poll message insert failed', messageError);
      // The poll itself is valid and reachable from the polls list, so this is
      // not a rollback case -- but the channel will not show a card for it.
      return {
        poll,
        error:
          'Your poll was created, but it could not be posted to the chat. Open Polls to share it.',
      };
    }

    return { poll, error: null };
  };

  return { createPoll };
}