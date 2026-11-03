/**
 * TEAM METADATA FOR THE STAFF DRILL-DOWN — PLAYBOOK-STAFF-DRILLDOWN.
 *
 * `playbook_staff_roster()` returns a player's `team_id`, `team_name` and
 * `club_id` and nothing else about the team. The director view needs three
 * more facts per team — its GENDER, its AGE GROUP and whether it belongs to
 * THIS season — and none of them is a new permission: `teams.age_group` /
 * `teams.gender` are read by the chat list's club-wide picker
 * (`src/screens/ChatScreen.tsx:1614`) and `teams.team_status` / `is_test` /
 * `season_id` by `src/hooks/useUserTeams.ts:109-130`. This file asks for the
 * same columns, filtered by the ids the roster already handed us.
 *
 * WHY A SEPARATE FILE AND NOT `rpc.ts`: `rpc.ts` is a declared MIRROR of the
 * web's (`MIRROR.md`) and the web has no staff track at all. Same reason
 * `coachRpc.ts` and `familyRpc.ts` exist beside it.
 *
 * NO NEW RPC, NO NEW COLUMN, NO SCHEMA CHANGE. Two table reads, both of which
 * the app already performs elsewhere, and both of which DEGRADE: a team whose
 * row RLS does not return simply has no gender and no age group, and the tree
 * puts it in its own bucket rather than dropping the players in it (see
 * `staffTree.ts`). A head coach's name is a nicety and a missing one prints
 * nothing.
 */

import { supabase } from '../../lib/supabase';

/** The same untyped door `coachRpc.ts` uses, plus the `in` filter. */
type Result = { data: unknown; error: unknown };

interface Query extends PromiseLike<Result> {
  select: (cols: string) => Query;
  eq: (col: string, val: unknown) => Query;
  in: (col: string, vals: readonly unknown[]) => Query;
}

interface UntypedClient {
  from: (t: string) => Query;
}

const db = supabase as unknown as UntypedClient;

function unwrap<T>(res: Result): T {
  if (res.error) throw res.error;
  return res.data as T;
}

/* --------------------------------------------------------------- the rows */

/** One team's metadata, exactly the columns the two existing reads name. */
export interface TeamMeta {
  id: string;
  name: string | null;
  age_group: string | null;
  gender: string | null;
  team_status: string | null;
  is_test: boolean | null;
  season_id: string | null;
  /** `profiles.full_name` of the head coach, when that read is permitted. */
  coach_name?: string | null;
}

/* ------------------------------------------------------- gender and season */

/**
 * THE CHAT LIST'S OWN GENDER RULE, not a second one.
 *
 * `ChatScreen.tsx:1636-1652` normalises the free-text `teams.gender` column to
 * 'male' | 'female' | 'coed' and labels those Boys / Girls / Coed. The column
 * is written by `RegisterTeamScreen`'s picker and has historically held several
 * spellings, which is why a normaliser exists at all. Copied here rather than
 * imported because that one is a local function inside a 2 600-line screen
 * component and this prompt may not edit it (see the ledger's RECOMMEND).
 */
export type GenderKey = 'male' | 'female' | 'coed' | 'unset';

export function normalizeGender(gender: string | null | undefined): GenderKey {
  if (!gender) return 'unset';
  const lower = gender.toLowerCase().trim();
  if (['male', 'boys', 'boy', 'm'].includes(lower)) return 'male';
  if (['female', 'girls', 'girl', 'f'].includes(lower)) return 'female';
  if (['coed', 'co-ed', 'mixed'].includes(lower)) return 'coed';
  return 'unset';
}

export function genderLabel(key: GenderKey, es: boolean): string {
  if (key === 'male') return es ? 'Niños' : 'Boys';
  if (key === 'female') return es ? 'Niñas' : 'Girls';
  if (key === 'coed') return es ? 'Mixto' : 'Coed';
  return es ? 'Sin categoría' : 'Not set';
}

/** Boys, Girls, Coed, then the bucket for teams with no gender on the row. */
export const GENDER_ORDER: GenderKey[] = ['male', 'female', 'coed', 'unset'];

/**
 * ACTIVE OR PAST — **the chat list's rule, copied, not invented.**
 *
 * `src/hooks/useUserTeams.ts:26-33` (`getTeamBucket`) is what the mobile chat
 * list and the calendar split "Past teams" by, through `useSharedUserTeams`
 * (`ChatScreen.tsx:722-724`). The rule, verbatim: a test team is HIDDEN; a
 * `team_status` that is not one of active / archived / inactive — including
 * null — is HIDDEN; archived and inactive are PAST; active is ACTIVE.
 *
 * It is copied because `getTeamBucket` is not exported and this prompt's SCOPE
 * is `src/features/pac-playbook/**`. That is a real fork risk and it is on the
 * record: the ledger RECOMMENDs exporting the hook's function and deleting
 * this copy. **If one moves, both move.**
 *
 * A TEAM WE HAVE NO ROW FOR is 'unknown' — NOT hidden. The hook can afford to
 * hide a team it could not classify because it only ever sees teams it read
 * itself; here the roster has already told us the player exists, and dropping
 * them would be a silently short club. 'unknown' shows under the current
 * season, which is the conservative place for a player nobody can say is past.
 */
export type TeamBucket = 'active' | 'past' | 'hidden' | 'unknown';

export function teamBucket(meta: TeamMeta | undefined | null): TeamBucket {
  if (!meta) return 'unknown';
  if (meta.is_test === true) return 'hidden';
  const status = meta.team_status;
  const known = status === 'active' || status === 'archived' || status === 'inactive';
  if (!status || !known) return 'hidden';
  if (status === 'archived' || status === 'inactive') return 'past';
  return 'active';
}

/* ------------------------------------------------------------- the reads */

/** Chunked so a director's hundred-team club cannot build a URL too long. */
const CHUNK = 60;

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/**
 * The teams behind a roster, by id. Missing rows are simply absent from the
 * result — RLS refusing a row is not an error here, it is one less fact.
 */
export async function fetchTeamMeta(teamIds: string[]): Promise<TeamMeta[]> {
  const ids = Array.from(new Set(teamIds.filter(Boolean)));
  if (!ids.length) return [];
  const out: TeamMeta[] = [];
  for (const part of chunks(ids, CHUNK)) {
    const res = await db
      .from('teams')
      .select('id, name, age_group, gender, team_status, is_test, season_id')
      .in('id', part);
    out.push(...(unwrap<TeamMeta[]>(res) || []));
  }
  return out;
}

/**
 * Head coach names, by team id — the same two reads
 * `ClubTeamsListScreen.tsx:57-71` makes, batched instead of per team.
 *
 * A NICETY, AND IT FAILS QUIETLY. A coach reading their own team gets their
 * own name; a director gets every name the club's policies allow. Where
 * either read is refused the map is short and the team card prints no coach
 * line, which is a missing nicety rather than a broken screen.
 */
export async function fetchHeadCoaches(teamIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(teamIds.filter(Boolean)));
  const byTeam = new Map<string, string>();
  if (!ids.length) return byTeam;
  const staff: { team_id: string; user_id: string }[] = [];
  for (const part of chunks(ids, CHUNK)) {
    const res = await db
      .from('team_staff')
      .select('team_id, user_id')
      .eq('staff_role', 'head_coach')
      .in('team_id', part);
    staff.push(...(unwrap<{ team_id: string; user_id: string }[]>(res) || []));
  }
  const userIds = Array.from(new Set(staff.map((s) => s.user_id).filter(Boolean)));
  if (!userIds.length) return byTeam;
  const names = new Map<string, string>();
  for (const part of chunks(userIds, CHUNK)) {
    const res = await db.from('profiles').select('id, full_name').in('id', part);
    for (const p of unwrap<{ id: string; full_name: string | null }[]>(res) || []) {
      if (p.full_name) names.set(p.id, p.full_name);
    }
  }
  for (const s of staff) {
    const n = names.get(s.user_id);
    if (n && !byTeam.has(s.team_id)) byTeam.set(s.team_id, n);
  }
  return byTeam;
}
