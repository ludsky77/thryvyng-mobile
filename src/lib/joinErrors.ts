/**
 * Single source of truth for join-flow error text.
 *
 * The join RPCs signal failures through a Postgres `HINT`, falling back to
 * substrings in the message. Every surface in the join flow maps them here so
 * the same failure never reads two different ways.
 */

export type JoinErrorToken =
  | 'dob_mismatch'
  | 'max_parents_reached'
  | 'player_already_claimed'
  | 'already_claimed_by_another'
  | 'duplicate_player_on_team'
  | 'duplicate_player_email'
  | 'join_not_open'
  | 'self_registration_disabled'
  | 'self_create_not_enabled'
  | 'roster_frozen'
  | 'under_age_threshold'
  | 'player_not_found'
  | 'auth_mismatch'
  | 'invitation_invalid'
  | 'invitation_email_mismatch'
  | 'team_not_found'
  | 'team_not_approved'
  | 'security_gate_missing'
  | 'rate_limited'
  | 'session_not_ready'
  | 'unknown';

const TOKENS: JoinErrorToken[] = [
  'dob_mismatch',
  'max_parents_reached',
  'player_already_claimed',
  'already_claimed_by_another',
  'duplicate_player_on_team',
  'duplicate_player_email',
  'join_not_open',
  'self_registration_disabled',
  'self_create_not_enabled',
  'roster_frozen',
  'under_age_threshold',
  'player_not_found',
  'auth_mismatch',
  'invitation_invalid',
  'invitation_email_mismatch',
  'team_not_found',
  'team_not_approved',
  'security_gate_missing',
  'rate_limited',
  'session_not_ready',
];

const MESSAGES: Record<JoinErrorToken, string> = {
  dob_mismatch:
    "That doesn't match our records. Please check the date of birth and try again.",
  max_parents_reached:
    'This player already has two parents linked. Please contact your team manager.',
  player_already_claimed:
    'This player is already linked to an account. Sign in with the email you registered with — or use Forgot Password — or ask your team manager for help.',
  already_claimed_by_another:
    'This player is already linked to an account. Sign in with the email you registered with — or use Forgot Password — or ask your team manager for help.',
  duplicate_player_on_team:
    'This player is already registered on this team. Sign in to your existing account, or contact your team manager.',
  duplicate_player_email:
    "This email is already used by another player. Leave the player email blank, use a different one, or sign in if it's yours.",
  join_not_open: 'This team requires you to be added by your club before joining.',
  self_registration_disabled:
    'This team requires you to be added by your club before joining.',
  self_create_not_enabled:
    'This team requires you to be added by your club before joining.',
  roster_frozen:
    "This team's roster is currently closed. Please contact your team manager.",
  under_age_threshold:
    'Players under 16 must be registered by a parent or guardian.',
  player_not_found:
    "We couldn't find that player on this team. Check the name and birth date, or contact your team manager.",
  auth_mismatch:
    "This doesn't match the account you're signed in with. Sign out and try again.",
  invitation_invalid:
    'This invitation link is invalid, expired, or already used. Ask your team manager for a new one.',
  invitation_email_mismatch:
    'This invitation was sent to a different email address. Sign in with that email, or ask your team manager to resend it.',
  team_not_found:
    "This team link isn't valid anymore. Ask your team manager for a new link.",
  team_not_approved:
    "This team isn't accepting registrations yet. Please check back later or contact your club.",
  security_gate_missing: 'Something went wrong. Please try again.',
  rate_limited: 'Too many attempts. Please wait a minute and try again.',
  session_not_ready:
    "Your account was created but sign-in didn't complete. Please sign in and try again.",
  unknown: 'Something went wrong. Please try again.',
};

/** Errors whose real text only ever reaches the console. */
const OPAQUE: JoinErrorToken[] = ['security_gate_missing', 'unknown'];

/**
 * Classify a join-flow error. Prefers the Postgres HINT, then falls back to
 * substrings in the message.
 */
export function joinErrorToken(err: unknown): JoinErrorToken {
  const e = err as { hint?: unknown; details?: unknown; message?: unknown } | null;

  const hint = typeof e?.hint === 'string' ? e.hint.trim() : '';
  if (hint && (TOKENS as string[]).includes(hint)) {
    return hint as JoinErrorToken;
  }

  const details = typeof e?.details === 'string' ? e.details.trim() : '';
  if (details && (TOKENS as string[]).includes(details)) {
    return details as JoinErrorToken;
  }

  const raw = typeof e?.message === 'string' ? e.message : '';
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();

  if (raw.includes('user_roles_user_id_fkey') || raw.includes('Session verification failed')) {
    return 'session_not_ready';
  }
  if (lower.includes('rate limit') || raw.includes('429')) {
    return 'rate_limited';
  }
  if (lower.includes('already linked to another account')) {
    return 'player_already_claimed';
  }
  if (raw.includes('under 16')) {
    return 'under_age_threshold';
  }

  const named = TOKENS.find((t) => raw.includes(t));
  return named ?? 'unknown';
}

/** User-facing text for a join-flow error. */
export function mapJoinError(err: unknown): string {
  const token = joinErrorToken(err);
  if (OPAQUE.includes(token)) {
    // Keep the raw failure visible to whoever is looking at the console.
    console.error('[join] unmapped error', err);
  }
  return MESSAGES[token];
}
