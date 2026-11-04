/**
 * ONE unsent announcement, kept on the phone — F-2 (Lu, 2026-11-04).
 *
 * WHAT CHANGED AND WHY. The discard prompt had two answers: keep writing, or
 * throw it away. A staff member half way through a long message who got a
 * phone call had those two and nothing else. F-2 adds the third — Save draft —
 * and this module is where it goes.
 *
 * ON THE DEVICE ONLY. `AsyncStorage`, which this app already depends on
 * (`package.json`: `@react-native-async-storage/async-storage` 2.2.0 — the
 * supabase session lives in it, `src/lib/supabase.ts`). NOTHING IS WRITTEN TO
 * THE DATABASE: an unsent announcement is not a row anywhere, there is no
 * drafts table, and adding one is a schema change nobody has ruled on. It is
 * the same trade `useMyMessages` makes for its last-seen stamp and
 * `SurveyPopupModal` for its dismissal.
 *
 * WHAT THAT COSTS, stated rather than hidden: the draft is PER DEVICE. Start a
 * message on the phone and the tablet does not have it.
 *
 * ONE DRAFT PER USER PER CLUB, which is what the key says. The user half keeps
 * two accounts on one phone from reading each other's writing; the club half
 * keeps a multi-club admin from carrying one club's draft into another club's
 * compose form. There is exactly one announcements channel per club, so a
 * per-channel key would be the same key with a worse name.
 *
 * EVERY CALL IS WRAPPED. A phone that refuses the read (cleared data, a locked
 * keychain) answers `null`, which means "no draft" — the form opens empty,
 * which is exactly what it did before F-2. A failed WRITE is reported to the
 * caller, because "Save draft" that silently saved nothing would be a lie.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnnouncementActionKind } from './clubAnnouncementCards';

/**
 * A drafted button, with the screen's local `id` left off: it is a render key
 * (`ComposeAnnouncementScreen.newDraft`), not part of what was written, and a
 * restored row gets a fresh one.
 */
export interface AnnouncementDraftAction {
  kind: AnnouncementActionKind;
  label: string;
  target: string;
}

export interface AnnouncementDraft {
  title: string;
  body: string;
  actions: AnnouncementDraftAction[];
  /** ISO, when Save draft was tapped. Not shown yet; written so it can be. */
  savedAt: string;
}

/** The three button kinds this build can restore. An unknown kind is dropped. */
const DRAFT_ACTION_KINDS: readonly AnnouncementActionKind[] = [
  'playbook',
  'playbook_card',
  'courses',
];

/**
 * One key per user per club. The `v1` is deliberate: a later shape change
 * bumps it rather than trying to read an old one back.
 */
function draftKey(userId: string, clubId: string): string {
  return `announce.draft.v1.${userId}.${clubId}`;
}

/**
 * Anything stored could have been written by an older build, so nothing is
 * trusted: a draft is only returned when it still has usable text in it, and
 * every button is checked field by field.
 */
function parseDraft(raw: string): AnnouncementDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const value = parsed as Record<string, unknown>;
  const title = typeof value.title === 'string' ? value.title : '';
  const body = typeof value.body === 'string' ? value.body : '';
  const actions = Array.isArray(value.actions)
    ? value.actions.reduce<AnnouncementDraftAction[]>((kept, entry) => {
        if (!entry || typeof entry !== 'object') return kept;
        const row = entry as Record<string, unknown>;
        const kind = row.kind;
        if (
          typeof kind !== 'string' ||
          !DRAFT_ACTION_KINDS.includes(kind as AnnouncementActionKind)
        ) {
          return kept;
        }
        kept.push({
          kind: kind as AnnouncementActionKind,
          label: typeof row.label === 'string' ? row.label : '',
          target: typeof row.target === 'string' ? row.target : '',
        });
        return kept;
      }, [])
    : [];

  // An empty draft is no draft: restoring it would show "Draft restored" over
  // a form identical to the one that opens without it.
  if (!title.trim() && !body.trim() && actions.length === 0) return null;

  return {
    title,
    body,
    actions,
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : '',
  };
}

/**
 * HOW OLD IS THIS DRAFT, in the one wording both callers use — F-3.
 *
 * The feed's draft card says "DRAFT · saved 5 min ago" and the compose form's
 * note says "Draft restored · saved 5 min ago", so the phrase is written once,
 * here, next to the thing it describes. The steps are the ones
 * `chatHelpers.getTimeAgo` already uses for a chat row, spelled out in words
 * rather than initials because this sits in a sentence ("saved 5 min ago", not
 * "saved 5m ago").
 *
 * `null` when there is no usable stamp — a draft written by a build before
 * `savedAt` existed, or an unparseable one. The callers then print "DRAFT"
 * and "Draft restored" with no age, which is true, rather than a guess.
 */
export function announcementDraftAge(
  savedAt: string | null | undefined
): string | null {
  if (!savedAt) return null;
  const then = new Date(savedAt).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  // A clock that moved backwards (timezone change, a manual set) must not
  // print "saved -3 min ago".
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(diffMs / 86400000);
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
  return new Date(then).toLocaleDateString();
}

/** This user's saved draft for this club, or null — including on failure. */
export async function loadAnnouncementDraft(
  userId: string | null | undefined,
  clubId: string | null | undefined
): Promise<AnnouncementDraft | null> {
  if (!userId || !clubId) return null;
  try {
    const raw = await AsyncStorage.getItem(draftKey(userId, clubId));
    return raw ? parseDraft(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Keep this draft. `false` when it could not be written — the caller says so
 * rather than claiming a save that did not happen.
 */
export async function saveAnnouncementDraft(
  userId: string | null | undefined,
  clubId: string | null | undefined,
  draft: Omit<AnnouncementDraft, 'savedAt'>
): Promise<boolean> {
  if (!userId || !clubId) return false;
  try {
    const payload: AnnouncementDraft = {
      ...draft,
      savedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(
      draftKey(userId, clubId),
      JSON.stringify(payload)
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Throw the draft away — Discard, and a send that succeeded. A failure here
 * is silent on purpose: both callers are already leaving the screen, and a
 * leftover draft shows up as a restored draft next time, not as lost work.
 */
export async function clearAnnouncementDraft(
  userId: string | null | undefined,
  clubId: string | null | undefined
): Promise<void> {
  if (!userId || !clubId) return;
  try {
    await AsyncStorage.removeItem(draftKey(userId, clubId));
  } catch {
    /* nothing to do: the next open simply restores what is still there */
  }
}
