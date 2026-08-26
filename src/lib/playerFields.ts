/**
 * Shared parsing/formatting for player form fields, so every join surface
 * treats a birth date and a jersey number the same way.
 */

/** Parse 'YYYY-MM-DD' in local time — `new Date(s)` would land a day early in US timezones. */
export const parseDateOnly = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Render a 'YYYY-MM-DD' string as a locale date, without the UTC off-by-one. */
export const formatDateOnly = (s: string) => {
  return parseDateOnly(s).toLocaleDateString();
};

/** Normalise free-text jersey input to a 0-999 string, or an error to show. */
// Jersey is free text on the way in; normalise to 0-999 or null before it
// reaches an RPC. Nothing else validated it.
export const normalizeJersey = (raw: string): { value: string | null; error: string | null } => {
  const s = (raw ?? '').trim();
  if (!s) return { value: null, error: null };
  if (!/^\d{1,3}$/.test(s)) return { value: null, error: 'Jersey number must be 0–999' };
  return { value: String(Number(s)), error: null };
};
