/**
 * THE one place a team's colour is decided, and the one place team-colour maths
 * lives (tint for fills, darken for the badge band).
 *
 * A team's colour is assigned in the DATABASE: a trigger sets `teams.color`
 * from the 32-hex palette below (migration 20261026141431, web repo, which
 * superseded the 24-hex 20261026120913). Clients never choose a colour -- the
 * two 32-swatch pickers this file replaced are gone, and the app now renders
 * the assigned colour read-only.
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
 * The 32 colours the DB trigger assigns, in trigger order. Kept here so the
 * app can name the palette it is rendering (and so the read-only swatch has
 * something to fall back on); the app never writes a value from it.
 *
 * palette v2 by gender — boys 1–16, girls 17–28, coed 29–32; source of truth =
 * DB migration 20261026141431 (web repo)
 */
export const TEAM_COLOR_PALETTE: readonly string[] = [
  // boys 1-16
  '#5A7FC4',
  '#5E9E7E',
  '#4A9A9A',
  '#3F6BB0',
  '#4F7F5F',
  '#58A6B5',
  '#4A5F93',
  '#6FB39A',
  '#7A7FC9',
  '#357A80',
  '#6FA3D1',
  '#3E6B5E',
  '#55698A',
  '#6E8F74',
  '#5C7BA6',
  '#7B8FA8',
  // girls 17-28
  '#B5629A',
  '#9A7BC4',
  '#C2708F',
  '#A99BD6',
  '#A6497A',
  '#B07FC0',
  '#C97579',
  '#8A5A82',
  '#D48FA6',
  '#9E4F5C',
  '#A87B98',
  '#6F5AA6',
  // coed 29-32
  '#8C8C7A',
  '#8A8F99',
  '#9A8A80',
  '#8A6E58',
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
