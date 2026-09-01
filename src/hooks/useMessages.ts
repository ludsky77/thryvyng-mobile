import { useState, useEffect, useCallback, useRef } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeToMessageInserts,
  subscribeToReactionChanges,
} from '../lib/realtimeHub';
import type { Message } from '../types';

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

  const fetchMessages = useCallback(async () => {
    if (!channelId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
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
      .order('created_at', { ascending: true })
      .limit(100);

    if (!error && data) {
      // Enrich messages with sender profile
      const withSenderProfile = data.map((msg: any) => ({
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

      // Fetch profiles for reaction users
      let profilesMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
      if (reactionUserIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', Array.from(reactionUserIds));
        if (profiles) {
          profilesMap = profiles.reduce(
            (acc, p) => {
              acc[p.id] = { full_name: p.full_name ?? null, avatar_url: p.avatar_url ?? null };
              return acc;
            },
            {} as Record<string, { full_name: string | null; avatar_url: string | null }>
          );
        }
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
      // Refetch to update reactions
      fetchMessages();
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

    if (messageError || !messageData) return false;

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
      comm_message_attachments: [],
    } as Message;

    // Add to state immediately (deduplication in subscription will handle if it arrives again)
    setMessages(prev => {
      if (prev.some(m => m.id === optimisticMessage.id)) return prev;
      return [...prev, optimisticMessage];
    });

    if (options?.attachment && messageData) {
      const att = options.attachment;
      try {
        const base64 = await FileSystem.readAsStringAsync(att.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const byteString = globalThis.atob(base64);
        const arrayBuffer = new ArrayBuffer(byteString.length);
        const uint8Array = new Uint8Array(arrayBuffer);
        for (let i = 0; i < byteString.length; i++) {
          uint8Array[i] = byteString.charCodeAt(i);
        }

        if (arrayBuffer.byteLength === 0) {
          console.warn('Attachment file is empty, skipping upload');
          return true;
        }

        const safeName = att.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${channelId}/${user.id}/${Date.now()}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, arrayBuffer, {
            contentType: att.mimeType || 'image/jpeg',
            upsert: false,
          });

        if (uploadError) {
          console.warn('Attachment upload failed:', uploadError);
          return true; // message was created
        }

        const { data: urlData } = supabase.storage
          .from('chat-attachments')
          .getPublicUrl(filePath);
        const fileUrl = urlData.publicUrl;

        await supabase.from('comm_message_attachments').insert({
          message_id: messageData.id,
          file_url: fileUrl,
          file_name: att.name,
          file_type: att.type,
          file_size: att.size ?? 0,
        });
      } catch (err) {
        console.warn('Attachment upload error:', err);
      }
    }

    return true;
  };

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

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return false;
    const message = messages.find((m) => m.id === messageId);
    const reactions = message?.reactions ?? [];
    const userReacted = reactions.some(
      (r) => r.user_id === user.id && r.emoji === emoji
    );
    if (userReacted) return removeReaction(messageId, emoji);
    return addReaction(messageId, emoji);
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