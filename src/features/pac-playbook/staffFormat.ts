/**
 * The three things every coach-track screen prints — in one place so the
 * roster, the player detail and the inbox never disagree about a name, a
 * percentage or how long ago something happened.
 */

import type { Bilingual } from './types';

/** "Last · First" is a roster; "First Last" is a person. This is a person. */
export function fullName(
  first: string | null | undefined,
  last: string | null | undefined,
  es: boolean
): string {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || (es ? 'Jugador/a' : 'Player');
}

/**
 * Whole percent, and `total` of 0 is 0 rather than NaN — a book with no
 * published cards is a deploy accident, not a reason to print "NaN%".
 */
export function pctOf(got: number, total: number): number {
  if (!total) return 0;
  return Math.round((got / total) * 100);
}

/**
 * Rough age of a timestamp. `ChapterEndScreen`'s own `ago()`, lifted here
 * unchanged in behaviour so the family side and the staff side read the same
 * — minutes under an hour, hours under two days, then days.
 */
export function ago(iso: string | null | undefined, es: boolean): string {
  if (!iso) return es ? 'nunca' : 'never';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
  if (m < 60) return `${Math.max(0, m)} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

/** A bilingual jsonb column the RPCs return straight from `content->'name'`. */
export function pickName(b: Bilingual | null | undefined, lang: 'en' | 'es'): string {
  if (!b) return '';
  return (lang === 'es' ? b.es || b.en : b.en || b.es) || '';
}
