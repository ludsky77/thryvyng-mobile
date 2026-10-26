/**
 * THE one place a team's colour is decided, and the one place team-colour maths
 * lives (tint for fills, darken for the badge band).
 *
 * A team's colour is assigned in the DATABASE: a trigger sets `teams.color`
 * from the 24-hex palette below (migration 20261026120913, web repo). Clients
 * never choose a colour -- the two 32-swatch pickers this file replaced are
 * gone, and the app now renders the assigned colour read-only.
 *
 * `resolveTeamColor` is therefore a READ helper, not a chooser. Its palette arm
 * is a safety net for a row written before the trigger existed: it is keyed on
 * the team's own id, so the same team gets the same colour on every surface,
 * for every user, in every list order. That is the whole reason the old
 * positional fallback in useUserTeams had to go -- `TEAM_COLORS[index % 8]`
 * gave one team different colours in two people's team lists, and a different
 * colour again when a list's membership changed.
 *
 * Before this file there were FIVE inline fallback hexes across ~18 read sites
 * (#8b5cf6, #5B7BB5, #8B6BAD, colors.accentDim, and none at all -- which
 * rendered a transparent dot). See docs/recon/calendar-teams-v2.md §1 and §5.
 *
 * Event TYPE is a different axis and is NOT in this file: a type carries an
 * icon and a neutral grey chip (src/constants/eventTypes.ts), never a hue.
 */

/**
 * The 24 colours the DB trigger assigns, in trigger order. Kept here so the
 * app can name the palette it is rendering (and so the read-only swatch has
 * something to fall back on); the app never writes a value from it.
 */
export const TEAM_COLOR_PALETTE: readonly string[] = [
  '#5A7FC4',
  '#4A9A9A',
  '#5E9E7E',
  '#8E9E57',
  '#BF9E58',
  '#C98A62',
  '#C97579',
  '#C2708F',
  '#9A7BC4',
  '#7A7FC9',
  '#7B8FA8',
  '#A8907A',
  '#4A5F93',
  '#357A80',
  '#4F7F5F',
  '#7A8A3E',
  '#A8883A',
  '#A65F3E',
  '#9E4F5C',
  '#8A5A82',
  '#6F5AA6',
  '#55698A',
  '#8A6E58',
  '#8C8C7A',
];

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

/** True for exactly `#rrggbb`. Anything else (null, '', 'red', #abc) is false. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX6.test(value.trim());
}

/**
 * FNV-1a, 32-bit. Any stable string hash would do; what matters is that it
 * depends only on the team's id, so it cannot drift with list order.
 */
function stableHash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The team's assigned colour. Shape is widened to a nullish team so that every
 * read site stays a one-liner at surfaces where the team may be absent; with no
 * id to hash, the first palette entry is returned rather than a transparent
 * dot.
 */
export function resolveTeamColor(
  team: { id?: string | null; color?: string | null } | null | undefined
): string {
  const assigned = team?.color;
  if (isHexColor(assigned)) return assigned.trim();
  return TEAM_COLOR_PALETTE[stableHash(team?.id || '') % TEAM_COLOR_PALETTE.length];
}

function parseHex(hex: string): [number, number, number] | null {
  if (!isHexColor(hex)) return null;
  const n = parseInt(hex.trim().slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The team's colour as a fill behind text: the same hue at `alpha`, so the
 * surface under it still shows through. 0.18 is the week/month pill fill.
 */
export function tint(hex: string, alpha = 0.18): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The team's colour `amount` darker (0-1), for the badge's weekday band. 0.12
 * is the band tone.
 */
export function darken(hex: string, amount = 0.12): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const k = 1 - amount;
  return (
    '#' +
    rgb
      .map((c) =>
        Math.max(0, Math.round(c * k)).toString(16).padStart(2, '0')
      )
      .join('')
  );
}
