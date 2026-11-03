/**
 * The family's messages, and the one thing the server does not store: WHEN
 * THIS READER LAST LOOKED AT THEM — PLAYBOOK-COVER-POLISH, FAMILY-MESSAGES-ON-COVER.
 *
 * THE DOT IS A LOCAL FACT, ON PURPOSE. "A reply you have not seen yet" needs a
 * per-user last-seen timestamp, and there is no column for one —
 * `playbook_questions` has `status` and `playbook_question_replies` has
 * `created_at`, and NO SCHEMA CHANGE was in this task's scope (it is a sacred
 * path either way). So the timestamp lives in `AsyncStorage`, which this app
 * already depends on (`package.json`: `@react-native-async-storage/async-storage`
 * 2.2.0 — `src/lib/supabase.ts` stores the session in it), under one key per
 * USER so two accounts on one phone do not clear each other's dots.
 *
 * WHAT THAT COSTS, stated rather than hidden: the dot is per DEVICE. Read your
 * replies on a phone and the tablet still shows the dot. For a "you have
 * something new" cue that is the right trade against a migration, and it is
 * the same trade the app already makes for the survey popup
 * (`SurveyPopupModal.tsx`).
 *
 * MARKING SEEN DOES NOT BLANK THE SCREEN YOU ARE ON. `markSeen()` writes the
 * new timestamp and clears the COVER's count, but the per-item dots keep
 * reading the timestamp loaded at mount — so opening the list does not erase
 * the marks on the very items you opened it to find. The next open of the book
 * loads the new timestamp and the dots are gone.
 *
 * EVERY STORAGE CALL IS WRAPPED. A phone that refuses the read (cleared data,
 * a locked keychain) gets `null`, which means "never looked" — the dot shows.
 * A failure never costs the list itself, which comes from the server.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { currentUserId } from './coachRpc';
import { fetchMyMessages, latestReplyAt, type MyMessage } from './familyRpc';

/** One key per user; `playerId` is the fallback when there is no session. */
const seenKey = (who: string) => `pbk.messages.seen.${who}`;

/** The `__DEV__` harness's messages; never set on the real route. */
export interface OfflineMessages {
  messages: MyMessage[];
  /** Pretend the reader last looked then, so the dot rule can be seen. */
  seenAt?: string | null;
}

export interface MyMessagesState {
  messages: MyMessage[];
  /** How many carry a reply newer than the reader's last look. */
  newCount: number;
  /** How many are still waiting for one. */
  openCount: number;
  /** Does THIS message carry an unseen reply? */
  isNew: (m: MyMessage) => boolean;
  loading: boolean;
  /** The reader opened the list: persist "now" and clear the cover's count. */
  markSeen: () => void;
  reload: () => void;
}

export function useMyMessages(
  playerId: string | null,
  enabled: boolean,
  offline?: OfflineMessages | null
): MyMessagesState {
  const [messages, setMessages] = useState<MyMessage[]>(offline?.messages ?? []);
  const [seenAt, setSeenAt] = useState<string | null>(offline?.seenAt ?? null);
  const [cleared, setCleared] = useState(false);
  const [loading, setLoading] = useState(!offline && enabled && !!playerId);
  const [nonce, setNonce] = useState(0);
  /** Who the stored timestamp belongs to, resolved once per load. */
  const who = useRef<string | null>(null);

  useEffect(() => {
    if (offline || !enabled || !playerId) return;
    let gone = false;
    setLoading(true);
    (async () => {
      try {
        const rows = await fetchMyMessages(playerId);
        if (gone) return;
        setMessages(rows);
        if (!rows.length) return;
        const uid = (await currentUserId()) ?? playerId;
        if (gone) return;
        who.current = uid;
        try {
          const stored = await AsyncStorage.getItem(seenKey(uid));
          if (!gone) setSeenAt(stored || null);
        } catch {
          // No stored look is the same as never having looked.
        }
      } catch (e) {
        // A read that fails leaves the cover exactly as it was: the block
        // hides itself on an empty list, so nothing broken is drawn.
        if (!gone) setMessages([]);
        console.warn('playbook: my messages failed to load', e);
      } finally {
        if (!gone) setLoading(false);
      }
    })();
    return () => {
      gone = true;
    };
  }, [playerId, enabled, offline, nonce]);

  const isNew = useCallback(
    (m: MyMessage) => {
      const at = latestReplyAt(m);
      if (!at) return false;
      if (!seenAt) return true;
      return new Date(at).getTime() > new Date(seenAt).getTime();
    },
    [seenAt]
  );

  const markSeen = useCallback(() => {
    setCleared(true);
    const uid = who.current;
    if (!uid) return;
    AsyncStorage.setItem(seenKey(uid), new Date().toISOString()).catch(() => {
      // The dot comes back next time; nothing else depends on this write.
    });
  }, []);

  const newCount = cleared ? 0 : messages.filter(isNew).length;
  const openCount = messages.filter((m) => m.status !== 'answered').length;

  return {
    messages,
    newCount,
    openCount,
    isNew,
    loading,
    markSeen,
    reload: useCallback(() => setNonce((n) => n + 1), []),
  };
}
