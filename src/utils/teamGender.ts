/**
 * THE ONE GENDER RULE for `teams.gender`.
 *
 * The column is free text, written by `RegisterTeamScreen`'s picker, and it has
 * historically held several spellings for the same thing — which is why a
 * normaliser exists at all.
 *
 * Extracted 2026-11-02 from the two places that had each grown their own copy:
 * the chat list's club-wide team picker (`src/screens/ChatScreen.tsx`) and the
 * playbook's staff drill-down (`src/features/pac-playbook/staffTeams.ts`, which
 * re-exports these for its own callers). A new spelling is now added once.
 *
 * `'unset'` is the fourth key ON PURPOSE: a team whose gender nobody set is a
 * real case the staff tree has to group under a bucket of its own, not an
 * error. A caller that would rather read it as "no answer" tests for it — the
 * chat list does, because an unrecognised gender must not become a filter chip
 * there and must print as nothing on the team row.
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

export function getGenderLabel(key: GenderKey, es: boolean): string {
  if (key === 'male') return es ? 'Niños' : 'Boys';
  if (key === 'female') return es ? 'Niñas' : 'Girls';
  if (key === 'coed') return es ? 'Mixto' : 'Coed';
  return es ? 'Sin categoría' : 'Not set';
}

/** Boys, Girls, Coed, then the bucket for teams with no gender on the row. */
export const GENDER_ORDER: GenderKey[] = ['male', 'female', 'coed', 'unset'];
