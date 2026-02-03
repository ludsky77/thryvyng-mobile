import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Subscribe to channel presence and track typing state.
 * Returns list of display names of other users currently typing.
 */
export function useTypingPresence(channelId: string | null) {
  const { user, profile } = useAuth();
  const [typingUserNames, setTypingUserNames] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTyping = useCallback(
    (typing: boolean) => {
      if (!channelId || !user?.id) return;
      setIsTyping(typing);
      const ch = channelRef.current;
      if (ch) {
        ch.track({
          user_id: user.id,
          full_name: profile?.full_name ?? 'Someone',
          typing,
        }).catch(() => {});
      }
    },
    [channelId, user?.id, profile?.full_name]
  );

  useEffect(() => {
    if (!channelId || !user?.id) {
      setTypingUserNames([]);
      return;
    }

    const channel = supabase.channel(`typing:${channelId}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const names: string[] = [];
        Object.values(state).forEach((presences) => {
          (presences as Array<{ user_id?: string; full_name?: string; typing?: boolean }>).forEach(
            (p) => {
              if (p.user_id !== user?.id && p.typing) {
                names.push(p.full_name || 'Someone');
              }
            }
          );
        });
        setTypingUserNames(names);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          channelRef.current = channel;
          await channel.track({
            user_id: user.id,
            full_name: profile?.full_name ?? 'Someone',
            typing: isTyping,
          });
        }
      });

    return () => {
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
      channelRef.current = null;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [channelId, user?.id, profile?.full_name]);

  // Sync isTyping to presence when it changes
  useEffect(() => {
    if (!channelRef.current || !user?.id) return;
    channelRef.current
      .track({
        user_id: user.id,
        full_name: profile?.full_name ?? 'Someone',
        typing: isTyping,
      })
      .catch(() => {});
  }, [isTyping, user?.id, profile?.full_name]);

  return { typingUserNames, setTyping };
}
