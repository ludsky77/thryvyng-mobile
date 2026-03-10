/**
 * Default position coordinates for formations (x, y as 0-100 percentage of field).
 * y=0 is top (own goal), y=100 is bottom (opponent goal).
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

function getDefaultPositions(formation: string, fieldType: string): FormationPosition[] {
  const vbH = fieldType === '11v11' ? 65 : fieldType === '9v9' ? 55 : fieldType === '7v7' ? 45 : 35;
  const gk: FormationPosition = { code: 'GK', x: 50, y: 4, role: 'goalkeeper' };
  const codes = parseFormationCodes(formation, fieldType);
  const byLayer = new Map<number, string[]>();
  for (const code of codes) {
    const layer = getLayerForCode(code);
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(code);
  }
  const positions: FormationPosition[] = [gk];
  const layers = [1, 2, 3];
  for (const layer of layers) {
    const codesInLayer = byLayer.get(layer) || [];
    const n = codesInLayer.length;
    const yBase = vbH * (0.12 + (layer / 3) * 0.75);
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 50 : 15 + (70 * (i + 1)) / (n + 1);
      positions.push({
        code: codesInLayer[i],
        x,
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

const FORMATION_POSITIONS: Record<string, FormationPosition[]> = {};
