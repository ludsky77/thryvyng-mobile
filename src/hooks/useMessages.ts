import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeToMessageInserts,
  subscribeToReactionChanges,
} from '../lib/realtimeHub';
import { fetchChannelTeamMemberNames } from '../lib/memberNames';
import { logError } from '../utils/logError';
import {
  SEND_OK,
  sendFailure,
  type SendResult,
} from '../utils/sendResult';
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
      if (!isMine) return;
      const insertedId = row?.id;
      if (!insertedId) {
        logError('useMessages.realtimeInsert', 'realtime INSERT has no row id', {
          channelId,
        });
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
        logError('useMessages.realtimeInsert.enrich', error ?? 'no row returned', {
          messageId: insertedId,
        });
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

    // UPDATEs get their own channel. The shared hub subscribes with
    // event:'INSERT' (lib/realtimeHub.ts), so without this an edit -- or a
    // soft delete -- only ever reached the editor's own device and every other
    // viewer kept the old text until they reopened the room. Narrow filter so
    // this costs one server-side-filtered stream per open channel.
    const updateChannel = supabase
      .channel(`messages-updates-${channelId}-${instanceIdRef.current}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'comm_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload: any) => {
          const row = payload?.new;
          if (!row?.id) return;

          setMessages((prev) => {
            const index = prev.findIndex((m) => m.id === row.id);
            if (index === -1) return prev; // not in the loaded window
            // A row soft-deleted elsewhere must leave, matching the fetch's
            // .eq('is_deleted', false).
            if (row.is_deleted) {
              return prev.filter((m) => m.id !== row.id);
            }
            const next = [...prev];
            // Merge, never replace: the realtime row carries no joined profile,
            // reactions or attachments, and overwriting would blank them.
            next[index] = {
              ...next[index],
              content: row.content,
              is_edited: row.is_edited,
              edited_at: row.edited_at,
              is_pinned: row.is_pinned,
            } as Message;
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      unsubscribeInserts();
      unsubscribeReactions();
      supabase.removeChannel(updateChannel);
    };
  }, [channelId, fetchMessages, onNewMessage]);

  /**
   * Send one message. Returns a REASON, never a bare boolean.
   *
   * Six unrelated failures used to collapse into `false`, and the input bar
   * turned all of them into "Your attachment could not be uploaded" -- so a
   * text-only reply whose INSERT was refused blamed an attachment that did not
   * exist. The reason now travels with the result and the copy is derived from
   * it (src/utils/sendResult.ts).
   */
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
  ): Promise<SendResult> => {
    if (!user || !channelId) {
      return sendFailure('auth', !user ? 'no signed-in user' : 'no channel');
    }
    const hasContent = (content && content.trim()) || options?.attachment;
    if (!hasContent) return sendFailure('validation', 'empty message');

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
          logError('useMessages.sendMessage.attachment', 'attachment read as empty', {
            uri: att.uri,
          });
          return sendFailure('attachment_upload', 'attachment read as empty');
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
          logError('useMessages.sendMessage.upload', uploadError, { filePath });
          return sendFailure('attachment_upload', uploadError.message);
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
        logError('useMessages.sendMessage.upload', err, { channelId });
        return sendFailure(
          'attachment_upload',
          err instanceof Error ? err.message : 'upload threw'
        );
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
      // THE case that caused the misreport: a text-only reply lands here, with
      // nothing whatsoever to do with attachments.
      logError('useMessages.sendMessage.insert', messageError ?? 'no row returned', {
        channelId,
        isReply: !!options?.replyTo,
        hasAttachment: !!options?.attachment,
      });
      return sendFailure(
        'insert',
        messageError?.message ?? 'insert returned no row'
      );
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
        // The bytes ARE in storage and the message row exists, so the send
        // succeeded -- only the link row failed. Reported, not surfaced: the
        // message is there, and telling the sender it failed would be wrong.
        logError('useMessages.sendMessage.attachmentRow', attachmentError, {
          messageId: messageData.id,
        });
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
      // The reply quote has to be on the optimistic row too. Without these the
      // sender saw their own reply render as a plain message and the quote only
      // appeared after a refetch -- the row went in with reply_to_* set, but the
      // local echo did not carry them.
      reply_to_id: options?.replyTo?.id ?? null,
      reply_to_content: options?.replyTo?.content ?? null,
      reply_to_sender: options?.replyTo?.senderName ?? null,
      poll_id: null,
      thread_count: 0,
      is_pinned: false,
      is_edited: false,
      is_deleted: false,
      edited_at: null,
      created_at: messageData.created_at || new Date().toISOString(),
      profile: {
        id: user.id,
        // NO EMAIL FALLBACK. A raw email must never become a display name --
        // the same rule the reaction paint below already states, which this
        // site was missing. Screens resolve the real name through memberNames
        // (the channel RPC) before ever reaching this, so this value is only a
        // last resort for the sender's own bubble in the frame after sending.
        full_name: user.user_metadata?.full_name || 'You',
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

    return SEND_OK;
  };

  /**
   * Edit one's OWN message in place.
   *
   * The 5-minute window is enforced where the action is offered
   * (MessageActionsModal) and again by RLS, which only lets an author update
   * their own rows -- the `.eq('user_id', user.id)` here is the third guard and
   * the reason a refusal comes back as zero rows rather than an error.
   *
   * is_edited / edited_at are set by this write, never by a trigger, so the
   * bubble's "(edited)" marker and this update cannot disagree.
   *
   * Optimistic, like the send and the reaction toggle: paint, persist, roll
   * back on refusal.
   */
  const editMessage = async (
    messageId: string,
    content: string
  ): Promise<SendResult> => {
    if (!user) return sendFailure('auth', 'no signed-in user');
    const trimmed = content.trim();
    if (!trimmed) return sendFailure('validation', 'empty edit');

    const previous = messages.find((m) => m.id === messageId);
    if (!previous) return sendFailure('validation', 'message not loaded');
    if (previous.content === trimmed) return SEND_OK; // nothing to write

    const editedAt = new Date().toISOString();

    // 1. PAINT
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? ({ ...m, content: trimmed, is_edited: true, edited_at: editedAt } as Message)
          : m
      )
    );

    // 2. PERSIST -- author-only, enforced here and by RLS.
    const { data, error } = await supabase
      .from('comm_messages')
      .update({ content: trimmed, is_edited: true, edited_at: editedAt })
      .eq('id', messageId)
      .eq('user_id', user.id)
      .select('id');

    // RLS filters a denied write out silently: no error, no rows.
    if (error || !data || data.length === 0) {
      logError('useMessages.editMessage', error ?? 'update returned no rows', {
        messageId,
      });
      // 3. ROLLBACK to exactly what was on screen before.
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? previous : m))
      );
      return sendFailure('insert', error?.message ?? 'update refused');
    }

    return SEND_OK;
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
      logError('useMessages.toggleReaction', 'reaction write refused, rolled back', {
        messageId,
        emoji,
      });
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
    editMessage,
    addReaction,
    removeReaction,
    toggleReaction,
    refetch: fetchMessages,
  };
}