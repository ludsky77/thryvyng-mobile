import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeToMessageInserts,
  subscribeToReactionChanges,
} from '../lib/realtimeHub';
import { fetchChannelTeamMemberNames } from '../lib/memberNames';
import type { Message } from '../types';

/**
 * Marks a reaction row that exists only on this device while its write is in
 * flight. The reconcile refetch replaces it with the server's row.
 */
const OPTIMISTIC_REACTION_ID = 'optimistic-reaction';

export function useMessages(channelId: string | null, onNewMessage?: () => void) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  // Two mounts can watch the same channel (React Navigation keeps the previous
  // screen alive). A shared topic name meant one unmount tore down the other's
  // subscription, so each mount gets its own.
  const instanceIdRef = useRef<string | null>(null);
  if (instanceIdRef.current === null) {
    instanceIdRef.current = Math.random().toString(36).slice(2);
  }
  // Reaction events arrive for every message on the device. Keep the ids we are
  // showing in a ref so the hub subscriber can scope them without resubscribing
  // on every state change.
  const messageIdsRef = useRef<Set<string>>(new Set());
  messageIdsRef.current = new Set(messages.map((m) => m.id));

  /**
   * `silent` refetches without flipping `loading`. The screens render a
   * full-thread spinner while `loading` is true, so the reaction subscription's
   * reconcile pass used to replace the whole conversation with a spinner on
   * every emoji tap -- which is most of what "reactions feel slow" was.
   */
  const fetchMessages = useCallback(async (options?: { silent?: boolean }) => {
    if (!channelId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    if (!options?.silent) setLoading(true);
    const { data, error } = await supabase
      .from('comm_messages')
      .select(`
        *,
        profile:profiles(id, full_name, avatar_url),
        reactions:comm_message_reactions(*),
        comm_message_attachments(*)
      `)
      .eq('channel_id', channelId)
      .eq('is_deleted', false)
      // ORDER runs before LIMIT, so ascending + limit(100) returned the OLDEST
      // 100 messages in the channel -- any thread past 100 opened on ancient
      // history and every day separator carried an old date. Take the NEWEST
      // 100 and flip back to ascending for rendering.
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      const rows = [...data].reverse();
      // Enrich messages with sender profile
      const withSenderProfile = rows.map((msg: any) => ({
        ...msg,
        profile: msg.profile ?? null
      }));

      // Collect all user_ids from reactions to fetch profiles
      const reactionUserIds = new Set<string>();
      withSenderProfile.forEach((msg: any) => {
        const reactions = msg.reactions ?? [];
        reactions.forEach((r: { user_id?: string }) => {
          if (r?.user_id) reactionUserIds.add(r.user_id);
        });
      });

      // Resolve reactor names. Reading `profiles` directly returned nothing for
      // a regular parent/player viewer -- RLS hides other members' rows -- so
      // every reactor rendered as 'Unknown'. The team-gated RPC resolves for
      // any viewer on the team; a DM or club channel has no team, so the map
      // comes back empty and the reaction keeps a null profile.
      let profilesMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
      if (reactionUserIds.size > 0) {
        const memberNames = await fetchChannelTeamMemberNames(channelId);
        reactionUserIds.forEach((reactorId) => {
          const resolved = memberNames.get(reactorId);
          if (resolved) {
            profilesMap[reactorId] = {
              full_name: resolved.name,
              avatar_url: resolved.avatar,
            };
          }
        });
      }

      // Enrich each message's reactions with profile data
      const enrichedMessages = withSenderProfile.map((msg: any) => {
        const reactions = msg.reactions ?? [];
        if (reactions.length === 0) return msg;
        return {
          ...msg,
          reactions: reactions.map((r: any) => ({
            ...r,
            profile: profilesMap[r.user_id] ?? null,
            profiles: profilesMap[r.user_id] ?? null,
          })),
        };
      });

      setMessages(enrichedMessages as unknown as Message[]);
    }
    setLoading(false);
  }, [channelId]);

  // Initial fetch
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Real-time subscription
  useEffect(() => {
    if (!channelId) return;

    // One shared channel per table; this mount just adds a callback.
    const unsubscribeInserts = subscribeToMessageInserts(async (row: any) => {
      // The hub is unfiltered and shared, so it sees every comm_messages
      // INSERT. Log first so foreign events are visible, then scope before
      // doing any work.
      const isMine = row?.channel_id === channelId;
      if (__DEV__) {
        console.log(
          '[useMessages] INSERT event',
          row?.id,
          row?.channel_id,
          'mine=' + isMine
        );
      }
      if (!isMine) return;
      const insertedId = row?.id;
      if (!insertedId) {
        if (__DEV__) {
          console.error('[useMessages] realtime INSERT has no row id', row);
        }
        return;
      }
      // The initial fetch hides deleted rows; do the same here rather than
      // letting one arrive live.
      if (row.is_deleted) return;

      // Fetch full message with profile
      const { data, error } = await supabase
        .from('comm_messages')
        .select(`
          *,
          profile:profiles(id, full_name, avatar_url),
          reactions:comm_message_reactions(*),
          comm_message_attachments(*)
        `)
        .eq('id', insertedId)
        .eq('is_deleted', false)
        .single();

      // RLS refusals, a row deleted mid-flight, and network failures all
      // land here. Dropping the message would lose it until a manual
      // refresh, so render the raw row instead -- screens resolve the
      // sender's name through memberNames, not through this join.
      let newMessage: Message;
      if (error || !data) {
        if (__DEV__) {
          console.error('[useMessages] enrichment failed', error);
        }
        newMessage = {
          ...(row as Record<string, unknown>),
          profile: null,
          reactions: [],
          comm_message_attachments: [],
        } as unknown as Message;
      } else {
        newMessage = {
          ...data,
          profile: data.profile ?? null,
        } as unknown as Message;
      }

      // Deduplicate: poll (and other) messages may already be in state from refetch after create
      setMessages(prev => {
        if (prev.some(m => m.id === newMessage.id)) return prev;
        onNewMessage?.();
        if (__DEV__) {
          console.log('[useMessages] appended', newMessage.id);
        }
        return [...prev, newMessage];
      });
    });

    const unsubscribeReactions = subscribeToReactionChanges((row: any) => {
      // Scope to messages we are actually showing when the payload names one;
      // without a message_id fall back to the old always-refetch behaviour.
      const messageId = row?.message_id;
      if (messageId && !messageIdsRef.current.has(messageId)) return;
      // Reconcile reactions against the server. Silent: an optimistic reaction
      // is already on screen and must not be wiped by a loading spinner.
      fetchMessages({ silent: true });
    });

    return () => {
      unsubscribeInserts();
      unsubscribeReactions();
    };
  }, [channelId, fetchMessages, onNewMessage]);

  const sendMessage = async (
    content: string,
    options?: {
      parentMessageId?: string;
      replyTo?: { id: string; content: string; senderName: string };
      attachment?: {
        uri: string;
        type: 'image' | 'video' | 'document';
        name: string;
        mimeType?: string;
        size?: number;
      };
    }
  ) => {
    if (!user || !channelId) return false;
    const hasContent = (content && content.trim()) || options?.attachment;
    if (!hasContent) return false;

    // UPLOAD FIRST. A message row created before a failed upload was a message
    // the sender saw as delivered and the recipient could never open, with no
    // error and no retry -- so nothing durable is written until the bytes land.
    let uploadedAttachment: {
      file_url: string;
      file_name: string;
      file_type: string;
      file_size: number;
    } | null = null;

    if (options?.attachment) {
      const att = options.attachment;
      try {
        // fetch -> arrayBuffer streams once. The old base64 -> atob -> Uint8Array
        // path held three copies of the file in memory at the same time.
        const response = await fetch(att.uri);
        const arrayBuffer = await response.arrayBuffer();

        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          if (__DEV__) {
            console.error('[useMessages] attachment read as empty', att.uri);
          }
          return false;
        }

        const safeName = att.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${channelId}/${user.id}/${Date.now()}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, arrayBuffer, {
            contentType: att.mimeType || 'application/octet-stream',
            upsert: false,
          });

        if (uploadError) {
          if (__DEV__) {
            console.error('[useMessages] attachment upload failed', uploadError);
          }
          return false;
        }

        const { data: urlData } = supabase.storage
          .from('chat-attachments')
          .getPublicUrl(filePath);

        uploadedAttachment = {
          file_url: urlData.publicUrl,
          file_name: att.name,
          file_type: att.type,
          file_size: att.size ?? arrayBuffer.byteLength,
        };
      } catch (err) {
        if (__DEV__) {
          console.error('[useMessages] attachment upload threw', err);
        }
        return false;
      }
    }

    const insertPayload: Record<string, unknown> = {
      channel_id: channelId,
      user_id: user.id,
      content: (content && content.trim()) || '',
      parent_id: options?.parentMessageId ?? null,
    };
    if (options?.replyTo) {
      insertPayload.reply_to_id = options.replyTo.id;
      insertPayload.reply_to_content = options.replyTo.content;
      insertPayload.reply_to_sender = options.replyTo.senderName;
    }

    const { data: messageData, error: messageError } = await supabase
      .from('comm_messages')
      .insert(insertPayload)
      .select('id, created_at')
      .single();

    if (messageError || !messageData) {
      if (__DEV__) {
        console.error('[useMessages] message insert failed', messageError);
      }
      return false;
    }

    // The file is already in storage; link it to the row that now exists.
    let attachmentRows: Array<Record<string, unknown>> = [];
    if (uploadedAttachment) {
      const { error: attachmentError } = await supabase
        .from('comm_message_attachments')
        .insert({
          message_id: messageData.id,
          ...uploadedAttachment,
        });
      if (attachmentError) {
        if (__DEV__) {
          console.error(
            '[useMessages] attachment row insert failed',
            attachmentError
          );
        }
      } else {
        attachmentRows = [{ message_id: messageData.id, ...uploadedAttachment }];
      }
    }

    // OPTIMISTIC UI: Add message to local state immediately
    const optimisticMessage: Message = {
      id: messageData.id,
      channel_id: channelId,
      user_id: user.id,
      content: (content && content.trim()) || '',
      message_type: 'standard',
      parent_id: options?.parentMessageId ?? null,
      poll_id: null,
      thread_count: 0,
      is_pinned: false,
      is_edited: false,
      is_deleted: false,
      edited_at: null,
      created_at: messageData.created_at || new Date().toISOString(),
      profile: {
        id: user.id,
        full_name: user.user_metadata?.full_name || user.email || 'You',
        avatar_url: user.user_metadata?.avatar_url || null,
      },
      reactions: [],
      comm_message_attachments: attachmentRows,
    } as unknown as Message;

    // Add to state immediately (deduplication in subscription will handle if it arrives again)
    setMessages(prev => {
      if (prev.some(m => m.id === optimisticMessage.id)) return prev;
      return [...prev, optimisticMessage];
    });

    return true;
  };

  /**
   * Paint one reaction locally. `present` true adds the current user's
   * reaction, false removes it. Used for the optimistic paint and, with the
   * argument inverted, for the rollback.
   */
  const paintReaction = useCallback(
    (messageId: string, emoji: string, present: boolean) => {
      if (!user) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = ((m as any).reactions ?? []) as any[];
          const isMine = (r: any) => r?.user_id === user.id && r?.emoji === emoji;

          if (!present) {
            return { ...m, reactions: reactions.filter((r) => !isMine(r)) } as Message;
          }
          if (reactions.some(isMine)) return m;

          // No email fallback here -- a raw email must never become a name.
          const selfProfile = {
            id: user.id,
            full_name: user.user_metadata?.full_name || 'You',
            avatar_url: user.user_metadata?.avatar_url || null,
          };
          return {
            ...m,
            reactions: [
              ...reactions,
              {
                id: `${OPTIMISTIC_REACTION_ID}:${messageId}:${emoji}`,
                message_id: messageId,
                user_id: user.id,
                emoji,
                created_at: new Date().toISOString(),
                profile: selfProfile,
                profiles: selfProfile,
              },
            ],
          } as Message;
        })
      );
    },
    [user]
  );

  const addReaction = async (messageId: string, emoji: string) => {
    if (!user) return false;
    const { error } = await supabase.from('comm_message_reactions').insert({
      message_id: messageId,
      user_id: user.id,
      emoji: emoji,
    });
    if (error) {
      console.error('Failed to add reaction:', error);
    }
    return !error;
  };

  const removeReaction = async (messageId: string, emoji: string) => {
    if (!user) return false;
    const { error } = await supabase
      .from('comm_message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji);
    return !error;
  };

  /**
   * Optimistic reaction toggle.
   *
   * A tap used to paint nothing until the INSERT/DELETE round trip returned AND
   * the realtime hub fired a refetch, so the emoji appeared a beat late behind a
   * spinner. Now the bubble updates on the tap frame and the server reconciles
   * behind it. Same shape as the optimistic send above and the flip at
   * RosterScreen.tsx:300 -- local state first, the server still the authority.
   *
   *   1. PAINT     flip the reaction locally, immediately
   *   2. PERSIST   write it
   *   3. ROLLBACK  on refusal, flip back and resync
   *   4. RECONCILE on success, the hub's silent refetch swaps the temporary row
   *                for the real one
   */
  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return false;
    const message = messages.find((m) => m.id === messageId);
    const reactions = message?.reactions ?? [];
    const userReacted = reactions.some(
      (r) => r.user_id === user.id && r.emoji === emoji
    );

    // 1. PAINT
    paintReaction(messageId, emoji, !userReacted);

    // 2. PERSIST
    const ok = userReacted
      ? await removeReaction(messageId, emoji)
      : await addReaction(messageId, emoji);

    // 3. ROLLBACK -- put the bubble back, then resync in case anything else
    //    changed while the write was in flight.
    if (!ok) {
      if (__DEV__) {
        console.warn('[useMessages] reaction write refused, rolled back', {
          messageId,
          emoji,
        });
      }
      paintReaction(messageId, emoji, userReacted);
      fetchMessages({ silent: true });
      return false;
    }

    // 4. RECONCILE happens via subscribeToReactionChanges -> silent refetch.
    return true;
  };

  return {
    messages,
    loading,
    sendMessage,
    addReaction,
    removeReaction,
    toggleReaction,
    refetch: fetchMessages,
  };
}