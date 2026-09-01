import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * What a sender's name suffix means. Drives ChatBubble's rendering:
 *   parent -> "Name (Zack's)"   player -> "Name (Player)"
 *   staff  -> role icon only, no suffix        null -> no suffix
 */
export type SenderLabelKind = 'parent' | 'player' | 'staff' | null;

export interface ChatSenderLabels {
  /** user_id -> display name + avatar, from the membership-gated RPC. */
  memberNames: Map<string, { name: string; avatar: string | null }>;
  /** user_id -> child first name(s), e.g. "Zack" or "Ana & Zack". Parents only. */
  playerLabels: Map<string, string>;
  /** user_id -> how that sender should be labelled. */
  labelKind: Map<string, SenderLabelKind>;
}

const EMPTY: ChatSenderLabels = {
  memberNames: new Map(),
  playerLabels: new Map(),
  labelKind: new Map(),
};

/**
 * Sender display names and parent/player suffixes for a chat channel.
 *
 * Both halves come from SECURITY DEFINER RPCs because RLS does not let a
 * regular parent/player read another member's profile, roster, or role rows --
 * reading them directly returned null and rendered "Unknown".
 *
 *   get_channel_member_names(p_channel_id)  -> user_id, display_name, avatar_url
 *   get_channel_member_labels(p_channel_id) -> user_id, label_kind, child_names
 *
 * The label RPC derives the channel's team itself, so `teamId` is accepted for
 * call-site compatibility but no longer used here. Either RPC failing degrades
 * to empty maps: callers fall back to profile.full_name and render no suffix.
 */
export function useChatSenderLabels(
  channelId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  teamId?: string | null
): ChatSenderLabels {
  const [memberNames, setMemberNames] = useState<
    Map<string, { name: string; avatar: string | null }>
  >(new Map());
  const [playerLabels, setPlayerLabels] = useState<Map<string, string>>(new Map());
  const [labelKind, setLabelKind] = useState<Map<string, SenderLabelKind>>(new Map());

  const fetchChannelMemberNames = useCallback(async () => {
    if (!channelId) {
      setMemberNames(new Map());
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_channel_member_names', {
        p_channel_id: channelId,
      });
      // RPCs report failure as a returned error, not a throw.
      if (error) throw error;
      const map = new Map<string, { name: string; avatar: string | null }>();
      (data || []).forEach((row: any) => {
        if (row?.user_id && row.display_name) {
          map.set(row.user_id, {
            name: row.display_name,
            avatar: row.avatar_url ?? null,
          });
        }
      });
      setMemberNames(map);
    } catch (err) {
      // Fall back to whatever the caller can read itself (profile.full_name).
      if (__DEV__) console.error('[useChatSenderLabels] member names failed:', err);
      setMemberNames(new Map());
    }
  }, [channelId]);

  // Names change only with the channel, never with individual messages.
  useEffect(() => {
    fetchChannelMemberNames();
  }, [fetchChannelMemberNames]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!channelId) {
        if (!cancelled) {
          setPlayerLabels(new Map());
          setLabelKind(new Map());
        }
        return;
      }

      try {
        const { data, error } = await supabase.rpc('get_channel_member_labels', {
          p_channel_id: channelId,
        });
        if (error) throw error;

        const kinds = new Map<string, SenderLabelKind>();
        const labels = new Map<string, string>();
        (data || []).forEach((row: any) => {
          if (!row?.user_id) return;
          const kind = (row.label_kind ?? null) as SenderLabelKind;
          kinds.set(row.user_id, kind);
          // Only a parent carries a child suffix; staff and players never do.
          if (kind === 'parent' && row.child_names) {
            labels.set(row.user_id, row.child_names);
          }
        });

        if (!cancelled) {
          setLabelKind(kinds);
          setPlayerLabels(labels);
        }
      } catch (err) {
        // RLS refusals and dropped connections both land here: no label, no crash.
        if (__DEV__) console.error('[useChatSenderLabels] labels failed:', err);
        if (!cancelled) {
          setPlayerLabels(new Map());
          setLabelKind(new Map());
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  if (!channelId) return EMPTY;
  return { memberNames, playerLabels, labelKind };
}
