import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/** Stop advertising "typing" this long after the last keystroke. */
const TYPING_TIMEOUT_MS = 3000;
/** At most one presence write per this interval while typing continues. */
const TRACK_THROTTLE_MS = 1500;

export interface TypingUser {
  userId: string;
  /** Self-reported presence name; callers should prefer their own member map. */
  name: string;
}

/**
 * Channel presence for "X is typing".
 *
 * Typing state lives in a ref, not state: the presence subscription reads it
 * when it (re)subscribes, and keeping it in state made the effect re-subscribe
 * on every keystroke and capture a stale value.
 *
 * setTyping(true) is safe to call on every keystroke -- the presence write is
 * throttled to one per 1.5s, and a 3s timer clears the flag on its own if the
 * user stops without sending.
 */
export function useTypingPresence(channelId: string | null) {
  const { user, profile } = useAuth();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isTypingRef = useRef(false);
  const lastTrackRef = useRef(0);
  const autoClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayName = profile?.full_name ?? 'Someone';

  const track = useCallback(
    (typing: boolean, force = false) => {
      const ch = channelRef.current;
      if (!ch || !user?.id) return;
      const now = Date.now();
      if (typing && !force && now - lastTrackRef.current < TRACK_THROTTLE_MS) {
        return;
      }
      lastTrackRef.current = now;
      ch.track({ user_id: user.id, full_name: displayName, typing }).catch(() => {});
    },
    [user?.id, displayName]
  );

  const setTyping = useCallback(
    (typing: boolean) => {
      if (!channelId || !user?.id) return;

      if (autoClearRef.current) {
        clearTimeout(autoClearRef.current);
        autoClearRef.current = null;
      }

      if (typing) {
        isTypingRef.current = true;
        track(true);
        // Self-clear if the keystrokes stop without a send.
        autoClearRef.current = setTimeout(() => {
          autoClearRef.current = null;
          isTypingRef.current = false;
          track(false, true);
        }, TYPING_TIMEOUT_MS);
        return;
      }

      if (!isTypingRef.current) return;
      isTypingRef.current = false;
      track(false, true);
    },
    [channelId, user?.id, track]
  );

  useEffect(() => {
    if (!channelId || !user?.id) {
      setTypingUsers([]);
      return;
    }

    const channel = supabase.channel(`typing:${channelId}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const next: TypingUser[] = [];
        const seen = new Set<string>();
        Object.values(state).forEach((presences) => {
          (
            presences as Array<{
              user_id?: string;
              full_name?: string;
              typing?: boolean;
            }>
          ).forEach((p) => {
            if (!p.user_id || p.user_id === user.id || !p.typing) return;
            if (seen.has(p.user_id)) return;
            seen.add(p.user_id);
            next.push({ userId: p.user_id, name: p.full_name || 'Someone' });
          });
        });
        setTypingUsers(next);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          channelRef.current = channel;
          // Read the ref, not a captured value -- this may re-subscribe mid-typing.
          await channel.track({
            user_id: user.id,
            full_name: displayName,
            typing: isTypingRef.current,
          });
        }
      });

    return () => {
      if (autoClearRef.current) {
        clearTimeout(autoClearRef.current);
        autoClearRef.current = null;
      }
      isTypingRef.current = false;
      lastTrackRef.current = 0;
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
      channelRef.current = null;
      setTypingUsers([]);
    };
  }, [channelId, user?.id, displayName]);

  return { typingUsers, setTyping };
}
