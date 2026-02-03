import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Message } from '../types';

export function useMessages(channelId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

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
        profile: msg.profile || { id: msg.user_id, full_name: 'Unknown', avatar_url: null }
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

    const channel = supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comm_messages',
          filter: `channel_id=eq.${channelId}`
        },
        async (payload) => {
          // Fetch full message with profile
          const { data } = await supabase
            .from('comm_messages')
            .select(`
              *,
              profile:profiles(id, full_name, avatar_url),
              reactions:comm_message_reactions(*),
              comm_message_attachments(*)
            `)
            .eq('id', payload.new.id)
            .single();
          
          if (data) {
            const newMessage = {
              ...data,
              profile: data.profile || { id: data.user_id, full_name: 'Unknown', avatar_url: null }
            } as unknown as Message;
            // Deduplicate: poll (and other) messages may already be in state from refetch after create
            setMessages(prev => {
              if (prev.some(m => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comm_message_reactions',
        },
        () => {
          // Refetch to update reactions
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, fetchMessages]);

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
      .select('id')
      .single();

    if (messageError || !messageData) return false;

    if (options?.attachment && messageData) {
      const att = options.attachment;
      try {
        const response = await fetch(att.uri);
        const blob = await response.blob();
        const safeName = att.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${channelId}/${user.id}/${Date.now()}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, blob, {
            contentType: att.mimeType || undefined,
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