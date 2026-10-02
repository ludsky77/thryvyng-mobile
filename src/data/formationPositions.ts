/**
 * Default position coordinates for formations (x, y as 0-100 percentage of field).
 * y=0 is top (attacking goal), y=100 is bottom (defending goal).
 */

export const FORMATIONS_BY_FIELD: Record<string, string[]> = {
  '11v11': ['4-3-3', '4-4-2', '4-4-2 Diamond', '4-2-3-1', '3-5-2', '3-4-3', '4-1-4-1', '4-5-1', '5-3-2', '5-4-1', '4-1-2-1-2'],
  '9v9': ['3-3-2', '3-2-3', '2-3-3', '3-1-2-2', '2-4-2', '1-3-2-2'],
  '7v7': ['2-3-1', '3-2-1', '2-1-2-1', '1-2-1-2', '3-1-2', '1-3-2', '2-2-2'],
  '5v5': ['2-1-1', '1-2-1', 'Diamond', '2-2', '1-1-2'],
};

export interface FormationPosition {
  code: string;
  x: number;
  y: number;
  role: 'goalkeeper' | 'defender' | 'midfielder' | 'forward';
}

export function getFormationPositions(
  formation: string,
  fieldType: string
): FormationPosition[] {
  const key = `${fieldType}:${formation}`;
  const positions = FORMATION_POSITIONS[key];
  if (positions) return positions;
  return getDefaultPositions(formation, fieldType);
}

/**
 * Outermost player of a 3+ man line, as a % of pitch width.
 * 20 rather than 15: the jersey glyph is wider than the slot circle it replaces,
 * so at 15 the outer back-four shirts overhung the touchline.
 */
const SPREAD_EDGE = 20;
/**
 * A two-man line is inset further: two strikers belong in the channels, not out
 * by the touchlines, so they sit at 32/68.
 */
const SPREAD_EDGE_PAIR = 32;

const GK_Y = 92;
/** Deepest and highest outfield lines. The three outfield layers are spread
 *  evenly between them; GK stays put. FWD_Y was 27, which left the top quarter
 *  of the pitch empty while the other three lines bunched at the back. */
const DEF_Y = 76;
const FWD_Y = 18;

/**
 * Even horizontal spread for one line of n players: both ends sit the same
 * distance from their touchline and the rest are evenly spaced between.
 *
 * Replaces `15 + 70 * (i + 1) / (n + 1)`, which divided by n+1 and so pulled
 * the outermost players inward -- a 3-man forward line spanned only 32.5..67.5,
 * 35% of the pitch, and every line in every formation was bunched centrally.
 * n=1 -> 50; n=2 -> 32/68; n>=3 -> 20..80 evenly spaced (4 -> 20/40/60/80).
 */
function spreadX(i: number, n: number): number {
  if (n <= 1) return 50;
  const left = n === 2 ? SPREAD_EDGE_PAIR : SPREAD_EDGE;
  const right = 100 - left;
  return left + ((right - left) * i) / (n - 1);
}

function getDefaultPositions(formation: string, fieldType: string): FormationPosition[] {
  const gk: FormationPosition = { code: 'GK', x: 50, y: GK_Y, role: 'goalkeeper' };
  const codes = parseFormationCodes(formation, fieldType);
  const byLayer = new Map<number, string[]>();
  for (const code of codes) {
    const layer = getLayerForCode(code);
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(code);
  }
  const positions: FormationPosition[] = [gk];
  const layerY: Record<number, number> = {
    1: DEF_Y,
    2: DEF_Y + (FWD_Y - DEF_Y) / 2,
    3: FWD_Y,
  };
  for (const layer of [1, 2, 3]) {
    const codesInLayer = byLayer.get(layer) || [];
    const n = codesInLayer.length;
    const yBase = layerY[layer];
    for (let i = 0; i < n; i++) {
      positions.push({
        code: codesInLayer[i],
        x: spreadX(i, n),
        y: yBase,
        role: getRoleForCode(codesInLayer[i]),
      });
    }
  }
  return positions;
}

function parseFormationCodes(formation: string, fieldType: string): string[] {
  const defs: Record<string, string[]> = {
    '4-3-3': ['LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'LW', 'ST', 'RW'],
    '4-4-2': ['LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'],
    '4-4-2 Diamond': ['LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'ST', 'ST'],
    '4-2-3-1': ['LB', 'CB', 'CB', 'RB', 'CDM', 'CDM', 'LW', 'CAM', 'RW', 'ST'],
    '3-5-2': ['CB', 'CB', 'CB', 'LWB', 'CDM', 'CM', 'RWB', 'CAM', 'ST', 'ST'],
    '3-4-3': ['CB', 'CB', 'CB', 'LWB', 'CM', 'CM', 'RWB', 'LW', 'ST', 'RW'],
    '4-1-4-1': ['LB', 'CB', 'CB', 'RB', 'CDM', 'LM', 'CM', 'CM', 'RM', 'ST'],
    '4-5-1': ['LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'CAM', 'ST'],
    '5-3-2': ['LWB', 'CB', 'CB', 'CB', 'RWB', 'CM', 'CM', 'CM', 'ST', 'ST'],
    '5-4-1': ['LWB', 'CB', 'CB', 'CB', 'RWB', 'LM', 'CM', 'CM', 'RM', 'ST'],
    '4-1-2-1-2': ['LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CAM', 'CM', 'ST', 'ST'],
    '3-3-2': ['CB', 'CB', 'CB', 'LM', 'CM', 'RM', 'ST', 'ST'],
    '3-2-3': ['CB', 'CB', 'CB', 'CM', 'CM', 'LW', 'ST', 'RW'],
    '2-3-3': ['CB', 'CB', 'LM', 'CM', 'RM', 'LW', 'ST', 'RW'],
    '3-1-2-2': ['CB', 'CB', 'CB', 'CDM', 'LM', 'RM', 'ST', 'ST'],
    '2-4-2': ['CB', 'CB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'],
    '1-3-2-2': ['CB', 'LWB', 'CM', 'RWB', 'LM', 'RM', 'ST', 'ST'],
    '2-3-1': ['CB', 'CB', 'LM', 'CM', 'RM', 'CAM', 'ST'],
    '3-2-1': ['CB', 'CB', 'CB', 'CM', 'CM', 'CAM', 'ST'],
    '2-1-2-1': ['CB', 'CB', 'CDM', 'LM', 'RM', 'CAM', 'ST'],
    '1-2-1-2': ['CB', 'LM', 'CM', 'RM', 'ST', 'ST'],
    '3-1-2': ['CB', 'CB', 'CB', 'CDM', 'LM', 'RM', 'ST'],
    '1-3-2': ['CB', 'LM', 'CM', 'RM', 'ST', 'ST'],
    '2-2-2': ['CB', 'CB', 'LM', 'RM', 'ST', 'ST'],
    '2-1-1': ['CB', 'CB', 'CM', 'ST'],
    '1-2-1': ['CB', 'LM', 'RM', 'ST'],
    Diamond: ['CB', 'LM', 'CM', 'RM', 'ST'],
    '2-2': ['CB', 'CB', 'CM', 'CM'],
    '1-1-2': ['CB', 'CM', 'ST', 'ST'],
  };

  return defs[formation] || ['CB', 'CB', 'CM', 'ST'];
}

function getLayerForCode(code: string): number {
  if (['GK'].includes(code)) return 0;
  if (['CB', 'LWB', 'RWB', 'LB', 'RB'].includes(code)) return 1;
  if (['CDM', 'CM', 'LM', 'RM', 'CAM'].includes(code)) return 2;
  return 3;
}

function getRoleForCode(code: string): 'goalkeeper' | 'defender' | 'midfielder' | 'forward' {
  if (code === 'GK') return 'goalkeeper';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(code)) return 'defender';
  if (['CDM', 'CM', 'LM', 'RM', 'CAM'].includes(code)) return 'midfielder';
  return 'forward';
}

// Pre-populate explicit positions for all formations (used by lineup editor)
const FORMATION_POSITIONS: Record<string, FormationPosition[]> = {};

function initFormationPositions() {
  for (const fieldType of Object.keys(FORMATIONS_BY_FIELD)) {
    for (const formation of FORMATIONS_BY_FIELD[fieldType]) {
      const key = `${fieldType}:${formation}`;
      if (!FORMATION_POSITIONS[key]) {
        FORMATION_POSITIONS[key] = getDefaultPositions(formation, fieldType);
      }
    }
  }
}
initFormationPositions();
