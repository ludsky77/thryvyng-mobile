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
        reactions:comm_message_reactions(*)
      `)
      .eq('channel_id', channelId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(100);

    if (!error && data) {
      // Enrich messages with sender name from profile
      const enrichedMessages = data.map((msg: any) => ({
        ...msg,
        profile: msg.profile || { id: msg.user_id, full_name: 'Unknown', avatar_url: null }
      }));
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
              reactions:comm_message_reactions(*)
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

  const sendMessage = async (content: string, parentMessageId?: string) => {
    if (!user || !channelId || !content.trim()) return false;

    const { error } = await supabase.from('comm_messages').insert({
      channel_id: channelId,
      user_id: user.id,
      content: content.trim(),
      parent_id: parentMessageId || null
    });

    return !error;
  };

  return { messages, loading, sendMessage, refetch: fetchMessages };
}