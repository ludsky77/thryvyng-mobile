/**
 * Is this reader staff, and may they answer? — the one hook the whole coach
 * track hangs off.
 *
 * It answers three questions the contents screen needs before it can draw a
 * single staff row, and it answers them in the order that costs least:
 *
 *   1. IS THIS VIEWER STAFF AT ALL?  `playbook_staff_roster()` returns rows
 *      only for players the caller may see, so a non-empty roster IS the
 *      staff test. A family-only account gets `[]` and the book looks exactly
 *      as it did before this track existed — that is ruling R1's "non-staff
 *      see nothing new", enforced by the server rather than by a role string
 *      read on the client.
 *   2. MAY THEY ANSWER?  `canAnswerAnything()` — see its own note. Managers
 *      are staff for PROGRESS (R1) and not for the INBOX (R2), and this is the
 *      only thing that tells the two apart.
 *   3. HOW MANY ARE OPEN?  Only asked when (2) is yes, because the badge is on
 *      a row that a manager never sees.
 *
 * THE ROSTER IS NOT A ROLE CHECK AND MUST NOT BECOME ONE. Nothing here reads
 * `user_roles` or a dashboard role: the Playbook's staff set is `team_staff` +
 * `club_staff` titles and the two sets genuinely differ (coach-track recon,
 * Q4 item 8 — a `view_only_director` can read every player's progress and
 * cannot SELECT those players through `players`). Asking the server is the
 * only answer that is right for both.
 *
 * ONE LOAD PER READER, not per screen: the contents row, the progress screen
 * and the inbox badge all read this one state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canAnswerAnything,
  fetchStaffInbox,
  fetchStaffRoster,
  type InboxRow,
  type RosterRow,
} from './coachRpc';

/** The `__DEV__` harness's staff data; never set on the real route. */
export interface OfflineStaff {
  roster: RosterRow[];
  inbox: InboxRow[];
  canAnswer: boolean;
}

export interface StaffTrack {
  roster: RosterRow[];
  /** Any row at all — the server's own answer to "are you staff here?". */
  isStaff: boolean;
  canAnswer: boolean;
  openCount: number;
  loading: boolean;
  reload: () => void;
}

export function useStaffTrack(
  enabled: boolean,
  offline?: OfflineStaff | null
): StaffTrack {
  const [roster, setRoster] = useState<RosterRow[]>(offline?.roster ?? []);
  const [canAnswer, setCanAnswer] = useState(offline?.canAnswer ?? false);
  const [openCount, setOpenCount] = useState(
    offline ? offline.inbox.filter((q) => q.status === 'open').length : 0
  );
  const [loading, setLoading] = useState(!offline && enabled);
  const [nonce, setNonce] = useState(0);
  const dead = useRef(false);

  useEffect(() => {
    dead.current = false;
    return () => {
      dead.current = true;
    };
  }, []);

  useEffect(() => {
    if (offline || !enabled) return;
    let gone = false;
    setLoading(true);
    (async () => {
      try {
        const rows = await fetchStaffRoster(null);
        if (gone) return;
        setRoster(rows);
        if (!rows.length) {
          // Not staff. Nothing else is asked, and nothing new is drawn.
          setCanAnswer(false);
          setOpenCount(0);
          return;
        }
        const may = await canAnswerAnything(rows);
        if (gone) return;
        setCanAnswer(may);
        if (!may) {
          setOpenCount(0);
          return;
        }
        const open = await fetchStaffInbox('open');
        if (!gone) setOpenCount(open.length);
      } catch (e) {
        // A staff read that fails leaves the book exactly as it was. The
        // reader is never shown a broken coach row — they are shown none.
        if (!gone) {
          setRoster([]);
          setCanAnswer(false);
          setOpenCount(0);
        }
        console.warn('playbook: staff track failed to load', e);
      } finally {
        if (!gone) setLoading(false);
      }
    })();
    return () => {
      gone = true;
    };
  }, [enabled, offline, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return {
    roster,
    isStaff: roster.length > 0,
    canAnswer,
    openCount,
    loading,
    reload,
  };
}
