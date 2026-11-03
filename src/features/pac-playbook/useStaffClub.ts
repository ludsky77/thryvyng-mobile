/**
 * The team metadata behind the staff drill-down — PLAYBOOK-STAFF-DRILLDOWN.
 *
 * ONE LOAD PER ROSTER, keyed off the roster's own team ids. `useStaffTrack`
 * has already asked the server who this viewer may see; this asks the two
 * things that question does not answer — each team's gender/age/season
 * (`teams`) and its head coach's name (`team_staff` → `profiles`) — and it
 * asks them ONCE per distinct id set rather than per screen or per level.
 *
 * IT NEVER BLOCKS THE SCREEN. `loading` is for a spinner, not a gate: the
 * tree builds from an EMPTY metadata map perfectly well (every team lands in
 * the `unset` bucket under the current season), so the roster is readable the
 * instant it arrives and the gender/age levels appear when their facts do.
 *
 * A FAILURE IS A MISSING FACT, NOT AN ERROR STATE. If the `teams` read is
 * refused, `missing` names the ids it could not place and the screen says so
 * in one line instead of showing a broken club — which is this prompt's own
 * instruction: keep the rest, report what is unreachable.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RosterRow } from './coachRpc';
import { fetchHeadCoaches, fetchTeamMeta, type TeamMeta } from './staffTeams';

/** The `__DEV__` harness's team metadata; never set on the real route. */
export interface OfflineClub {
  meta: TeamMeta[];
  /** team id → head coach name, where the fixture does not inline it. */
  coaches?: Record<string, string>;
}

export interface StaffClub {
  metaById: Map<string, TeamMeta>;
  coaches: Map<string, string>;
  loading: boolean;
  /** Team ids the roster named and the `teams` read did not return. */
  missing: string[];
}

const EMPTY_META = new Map<string, TeamMeta>();
const EMPTY_COACH = new Map<string, string>();

export function useStaffClub(roster: RosterRow[], offline?: OfflineClub | null): StaffClub {
  /** The id set, as a stable string, so a re-sorted roster is not a new load. */
  const ids = useMemo(
    () =>
      Array.from(new Set(roster.map((r) => r.team_id).filter((x): x is string => !!x))).sort(),
    [roster]
  );
  const key = ids.join(',');

  const [state, setState] = useState<{ meta: Map<string, TeamMeta>; coaches: Map<string, string> }>(
    () =>
      offline
        ? {
            meta: new Map(offline.meta.map((m) => [m.id, m])),
            coaches: new Map(Object.entries(offline.coaches ?? {})),
          }
        : { meta: EMPTY_META, coaches: EMPTY_COACH }
  );
  const [loading, setLoading] = useState(!offline && ids.length > 0);
  const done = useRef<string>('');

  useEffect(() => {
    if (offline) return;
    if (!ids.length) {
      setState({ meta: EMPTY_META, coaches: EMPTY_COACH });
      setLoading(false);
      return;
    }
    if (done.current === key) return;
    done.current = key;
    let gone = false;
    setLoading(true);
    (async () => {
      try {
        const meta = await fetchTeamMeta(ids);
        if (gone) return;
        setState((prev) => ({ ...prev, meta: new Map(meta.map((m) => [m.id, m])) }));
        /* The coach names are a SECOND, optional read and they come after:
           the gender/age levels must not wait on a nicety. A refusal here
           leaves the map empty and the team cards print no coach line. */
        const coaches = await fetchHeadCoaches(ids);
        if (!gone) setState((prev) => ({ ...prev, coaches }));
      } catch (e) {
        // Keep whatever arrived; the tree reads a short map correctly.
        console.warn('playbook: team metadata failed to load', e);
      } finally {
        if (!gone) setLoading(false);
      }
    })();
    return () => {
      gone = true;
    };
  }, [ids, key, offline]);

  const missing = useMemo(() => ids.filter((id) => !state.meta.has(id)), [ids, state.meta]);

  return { metaById: state.meta, coaches: state.coaches, loading, missing };
}
