/**
 * Single source of truth for PAC Playbook error text (ruling R-5).
 *
 * The playbook RPCs signal every refusal through a Postgres `HINT` beside an
 * errcode in the P0040–P0049 range
 * (supabase/migrations/20261028190000_playbook_v1_schema.sql). This maps the
 * HINT to a sentence, in both languages, in the same shape as the join flow's
 * map (src/lib/joinErrors.ts) — HINT first, then the errcode, then a fallback.
 *
 * Why it exists: the ledger already records what an UNMAPPED refusal looks
 * like on screen. In the pathway templates `onComplete()` still runs after a
 * thrown RPC, "so the screen reports success while no XP is awarded"
 * (docs/ledger.md:41, on P0050/P0051). R-5 is the rule that stops the reader
 * repeating it: a throw is always shown, and never followed by a success path.
 */

export type PlaybookErrorToken =
  | 'not_signed_in'
  | 'no_player_access'
  | 'not_found'
  | 'bad_submission'
  | 'not_player_staff'
  | 'run_not_found'
  | 'run_already_submitted'
  | 'quiz_pool_too_small'
  | 'last_editor'
  | 'first_editor_missing'
  | 'unknown';

const TOKENS: PlaybookErrorToken[] = [
  'not_signed_in',
  'no_player_access',
  'not_found',
  'bad_submission',
  'not_player_staff',
  'run_not_found',
  'run_already_submitted',
  'quiz_pool_too_small',
  'last_editor',
  'first_editor_missing',
];

/** errcode → token, for a driver that drops the hint but keeps the code. */
const BY_CODE: Record<string, PlaybookErrorToken> = {
  P0040: 'not_signed_in',
  P0041: 'no_player_access',
  P0042: 'not_found',
  P0043: 'bad_submission',
  P0044: 'not_player_staff',
  P0045: 'run_not_found',
  P0046: 'run_already_submitted',
  P0047: 'quiz_pool_too_small',
  P0048: 'last_editor',
  P0049: 'first_editor_missing',
};

const MESSAGES: Record<'en' | 'es', Record<PlaybookErrorToken, string>> = {
  en: {
    not_signed_in: 'Please sign in again to save your playbook progress.',
    no_player_access:
      "You can read this playbook, but only this player or their parent can mark cards, take the quiz or send a question.",
    not_found: "That part of the playbook isn't there any more. Go back and open it again.",
    bad_submission: "That didn't go through. Please try again.",
    not_player_staff: 'Only this player’s coaches can reply here.',
    run_not_found: "We couldn't find that quiz run. Start a new one.",
    run_already_submitted: 'This quiz was already handed in. Start a new one to play again.',
    quiz_pool_too_small:
      "There aren't enough questions in the bank for a full quiz yet. Ask your coach.",
    last_editor: 'A book needs at least one editor, so the last one cannot be removed.',
    first_editor_missing: 'The playbook has no editor set up yet.',
    unknown: 'Something went wrong. Please try again.',
  },
  es: {
    not_signed_in: 'Vuelve a iniciar sesión para guardar tu progreso del playbook.',
    no_player_access:
      'Puedes leer este playbook, pero solo este jugador o su familia pueden marcar tarjetas, hacer el quiz o enviar una pregunta.',
    not_found: 'Esa parte del playbook ya no está. Vuelve atrás y ábrela otra vez.',
    bad_submission: 'No se pudo enviar. Inténtalo de nuevo.',
    not_player_staff: 'Solo los coaches de este jugador pueden responder aquí.',
    run_not_found: 'No encontramos ese intento del quiz. Empieza uno nuevo.',
    run_already_submitted: 'Este quiz ya se entregó. Empieza uno nuevo para jugar otra vez.',
    quiz_pool_too_small:
      'Todavía no hay suficientes preguntas en el banco para un quiz completo. Pregúntale a tu coach.',
    last_editor: 'Un libro necesita al menos un editor, así que no se puede quitar el último.',
    first_editor_missing: 'El playbook todavía no tiene editor.',
    unknown: 'Algo salió mal. Inténtalo de nuevo.',
  },
};

/**
 * Classify a playbook RPC error. Prefers the Postgres HINT, then the errcode,
 * then the message text — the same order joinErrorToken() uses.
 */
export function playbookErrorToken(err: unknown): PlaybookErrorToken {
  const e = err as { hint?: unknown; code?: unknown; message?: unknown } | null;

  const hint = typeof e?.hint === 'string' ? e.hint.trim() : '';
  if (hint && (TOKENS as string[]).includes(hint)) return hint as PlaybookErrorToken;

  const code = typeof e?.code === 'string' ? e.code.trim().toUpperCase() : '';
  if (code && BY_CODE[code]) return BY_CODE[code];

  const message = typeof e?.message === 'string' ? e.message : '';
  for (const [c, token] of Object.entries(BY_CODE)) {
    if (message.includes(c)) return token;
  }
  return 'unknown';
}

/** The sentence to put on the screen. Never empty. */
export function playbookErrorMessage(err: unknown, lang: 'en' | 'es' = 'en'): string {
  return MESSAGES[lang][playbookErrorToken(err)];
}
