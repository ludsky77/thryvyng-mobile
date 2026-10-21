import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { fetchChatProfileNames } from '../lib/memberNames';
import {
  canClosePoll,
  closePoll as closePollRpc,
  isChannelStaff,
  type ClosePollResult,
} from '../lib/channelStaff';
import type { Poll, PollOption, VoterProfile } from '../types';

export function usePoll(pollId: string | null) {
  const { user } = useAuth();
  const [poll, setPoll] = useState<Poll | null>(null);
  /** What `fetchPoll` reads to tell a first load from a refetch (P3). */
  const pollRef = useRef<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  // Ruling Q3 B: staffness comes from the server's ONE definition, not from
  // `label_kind`, not from a `team_staff` count this screen did itself.
  const [isStaff, setIsStaff] = useState(false);

  // Keeps the ref above in step with the state, so one `setPoll` site cannot
  // forget it (there are two).
  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  const fetchPoll = useCallback(async () => {
    if (!pollId) return;

    /*
     * P3 (Lu, Oct 21): only the FIRST fetch flips `loading`. Every action here
     * -- vote, removeVote, closePoll -- ends in `fetchPoll()`, and PollCard
     * renders `if (loading || !poll)` as a small "Loading poll..." box, so a
     * refetch used to collapse a full poll card to about a fifth of its height
     * and expand it again a second later, shoving the whole chat. Once a poll
     * is in hand the card stays on screen with the values it has until the new
     * ones land, so nothing moves. `poll` is read through a ref because the
     * callback must not be rebuilt on every poll change -- an effect and a
     * realtime subscription depend on its identity.
     */
    if (!pollRef.current) {
      setLoading(true);
    }
    
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
      .select('id, poll_id, option_id, user_id, rank, comment')
      .eq('poll_id', pollId);

    const userVotes = votes?.filter(v => v.user_id === user?.id) || [];

    // Voter names came from a `profiles:profiles!user_id(...)` embed that RLS
    // blocked for a regular viewer; the voter was then dropped from the list
    // by the filter below, so the list silently shrank. Names now come from
    // the CHANNEL-gated RPC, asked for the voters by id: the team-gated pair
    // it replaced resolved nothing on a poll in a club channel or a DM (no
    // team id to gate with), and its ladder could still end in NULL. Every
    // voter is kept whether or not a name came back.
    const memberNames = await fetchChatProfileNames(
      (votes || []).map((v: any) => v.user_id)
    );

    const optionsWithCounts = pollData.options?.map((opt: PollOption) => {
      const optVotes = votes?.filter(v => v.option_id === opt.id) || [];
      const voters: VoterProfile[] = optVotes.map((v: any) => {
        const resolved = memberNames.get(v.user_id);
        return {
          id: v.user_id,
          full_name: resolved?.name ?? null,
          avatar_url: resolved?.avatar ?? null,
        };
      });
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

  // Ruling Q3 B -- who counts as staff of this chat. Re-asked when the poll
  // resolves to a different chat, and reset to false in between so a stale
  // `true` can never leak a Close button into another chat.
  useEffect(() => {
    let cancelled = false;
    const channelId = poll?.channel_id;

    if (!channelId || !user) {
      setIsStaff(false);
      return;
    }

    isChannelStaff(channelId).then(result => {
      if (!cancelled) setIsStaff(result);
    });

    return () => {
      cancelled = true;
    };
  }, [poll?.channel_id, user]);

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

  const isCreator = !!user && !!poll && poll.created_by === user.id;
  const isExpired = !!poll?.ends_at && new Date(poll.ends_at) < new Date();

  /**
   * May the Close control be offered at all? Ruling Q3 B's predicate, through
   * the shared helper, so the hook and the card cannot disagree -- which is
   * precisely how the old bug worked: `PollCard` offered Close to staff and
   * this hook refused them.
   */
  const canClose = canClosePoll({
    isCreator,
    isStaff,
    isActive: poll?.is_active === true,
    isExpired,
  });

  /**
   * Close the poll. Ruling Q4 B: the ONE door is `close_poll`, never an UPDATE
   * on `comm_polls`.
   *
   * 4d-EXTRA: the card flips to Closed IMMEDIATELY. The local row is updated
   * before the refetch rather than after it, so the state change does not wait
   * on a round trip; `fetchPoll` then reconciles vote counts.
   *
   * Returns the result object, not a boolean. The old `false` was the bug: it
   * could mean "you may not" or "it did not go through", and `handleClosePoll`
   * ignored it either way, so the poll just stayed open with no message.
   */
  const closePoll = async (): Promise<ClosePollResult> => {
    if (!user || !poll) {
      return { status: 'error', error: new Error('no poll') };
    }

    const result = await closePollRpc(poll.id);

    if (result.status === 'ok') {
      setPoll(current => (current ? { ...current, is_active: false } : current));
      await fetchPoll();
    }

    return result;
  };

  return {
    poll,
    loading,
    vote,
    removeVote,
    closePoll,
    canClose,
    isChannelStaff: isStaff,
    refetch: fetchPoll,
  };
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