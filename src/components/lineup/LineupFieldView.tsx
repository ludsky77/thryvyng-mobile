import React, { memo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, {
  Rect,
  Circle,
  Line,
  Path,
  Text as SvgText,
  G,
} from 'react-native-svg';

const FIELD_ASPECT: Record<string, number> = {
  '11v11': 0.65,
  '9v9': 0.7,
  '7v7': 0.75,
  '5v5': 0.85,
};

function getViewBoxHeight(fieldType: string): number {
  return FIELD_ASPECT[fieldType] ? 100 / FIELD_ASPECT[fieldType] : 65;
}

/** Shirt silhouette path - scaled for ~8% of field width */
function jerseyPath(w: number, h: number): string {
  const cw = w / 2;
  return `M ${cw - w * 0.4} ${h * 0.1}
    L ${cw - w * 0.35} ${h * 0.25}
    L ${cw - w * 0.4} ${h * 0.9}
    L ${cw + w * 0.4} ${h * 0.9}
    L ${cw + w * 0.35} ${h * 0.25}
    Z`;
}

export interface PositionData {
  code: string;
  x: number;
  y: number;
  role: string;
  assignedPlayer?: {
    id: string;
    full_name?: string | null;
    jersey_number?: number | null;
    is_captain?: boolean;
  };
}

export interface JerseyConfig {
  team_color?: string;
  team_pattern?: string;
  gk_color?: string;
  gk_pattern?: string;
}

interface LineupFieldViewProps {
  fieldType: string;
  positions: PositionData[];
  jerseyConfig?: JerseyConfig;
  onPositionTap?: (index: number) => void;
  selectedPosition?: number | null;
  width: number;
  readOnly?: boolean;
  highlightPlayerId?: string | null;
  isParentView?: boolean;
}

export const LineupFieldView = memo(function LineupFieldView({
  fieldType,
  positions,
  jerseyConfig = {},
  onPositionTap,
  selectedPosition = null,
  width,
  readOnly = false,
  highlightPlayerId = null,
  isParentView = false,
}: LineupFieldViewProps) {
  const aspect = FIELD_ASPECT[fieldType] || 0.65;
  const height = width * aspect;
  const vbH = getViewBoxHeight(fieldType);
  const viewBox = `0 0 100 ${vbH}`;

  const teamColor = jerseyConfig.team_color || '#3b82f6';
  const gkColor = jerseyConfig.gk_color || '#ef4444';

  const sy = (v: number) => (v * vbH) / 100;

  const hitSize = Math.min(width * 0.15, 48);

  return (
    <View style={{ width, height }}>
    <Svg width={width} height={height} viewBox={viewBox}>
      {/* Layer 1: Field background */}
      <Rect x={0} y={0} width={100} height={vbH} fill="#2d5a27" />
      <Rect
        x={0.5}
        y={0.5}
        width={99}
        height={vbH - 1}
        fill="none"
        stroke="#fff"
        strokeWidth={0.3}
      />

      {/* Layer 2: Field markings */}
      {fieldType === '11v11' && (
        <>
          <Circle cx={50} cy={vbH / 2} r={9.15} fill="none" stroke="#fff" strokeWidth={0.2} strokeDasharray="2,1" />
          <Line x1={50} y1={0} x2={50} y2={vbH} stroke="#fff" strokeWidth={0.2} strokeDasharray="2,1" />
          <Rect x={0} y={0} width={44} height={20} fill="none" stroke="#fff" strokeWidth={0.25} strokeDasharray="2,1" />
          <Rect x={0} y={vbH - 20} width={44} height={20} fill="none" stroke="#fff" strokeWidth={0.25} strokeDasharray="2,1" />
        </>
      )}
      {(fieldType === '9v9' || fieldType === '7v7' || fieldType === '5v5') && (
        <>
          <Circle cx={50} cy={vbH / 2} r={6} fill="none" stroke="#fff" strokeWidth={0.2} strokeDasharray="2,1" />
          <Line x1={50} y1={0} x2={50} y2={vbH} stroke="#fff" strokeWidth={0.2} strokeDasharray="2,1" />
          <Rect x={0} y={0} width={50} height={16} fill="none" stroke="#fff" strokeWidth={0.25} strokeDasharray="2,1" />
          <Rect x={0} y={vbH - 16} width={50} height={16} fill="none" stroke="#fff" strokeWidth={0.25} strokeDasharray="2,1" />
        </>
      )}

      {/* Layer 3: Goals */}
      <Rect x={0} y={0} width={44} height={8} fill="none" stroke="#fff" strokeWidth={0.3} />
      <Rect x={0} y={vbH - 8} width={44} height={8} fill="none" stroke="#fff" strokeWidth={0.3} />

      {/* Layer 4: Positions */}
      {positions.map((pos, i) => {
        const x = pos.x;
        const y = sy(pos.y);
        const isSelected = !readOnly && selectedPosition === i;
        const isHighlighted = !!highlightPlayerId && pos.assignedPlayer?.id === highlightPlayerId;
        const isGK = pos.role === 'goalkeeper';
        const baseJerseySize = width * 0.08;
        const jerseySize = isHighlighted ? baseJerseySize * 1.15 : baseJerseySize;
        const jw = (jerseySize / width) * 100;
        const jh = jw * 1.2;

        return (
          <G key={`pos-${i}`}>
            {isHighlighted && (
              <Circle
                cx={x}
                cy={y}
                r={7}
                fill="none"
                stroke="#06b6d4"
                strokeWidth={1}
              />
            )}
            {isSelected && (
              <Circle
                cx={x}
                cy={y}
                r={6}
                fill="none"
                stroke="#06b6d4"
                strokeWidth={0.8}
              />
            )}
            {pos.assignedPlayer ? (
              <G>
                <Path
                  d={jerseyPath(jw, jh)}
                  fill={isGK ? gkColor : teamColor}
                  stroke={isHighlighted ? '#06b6d4' : '#fff'}
                  strokeWidth={isHighlighted ? 0.6 : 0.3}
                  transform={`translate(${x - jw / 2}, ${y - jh / 2})`}
                />
                <SvgText
                  x={x}
                  y={y + 0.5}
                  fill="#fff"
                  fontSize={2.2}
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  {pos.assignedPlayer.jersey_number ?? '?'}
                </SvgText>
                {pos.assignedPlayer.is_captain && (
                  <SvgText
                    x={x + jw / 2 - 0.5}
                    y={y - jh / 2 + 1}
                    fill="#fff"
                    fontSize={1.2}
                    fontWeight="bold"
                  >
                    C
                  </SvgText>
                )}
                <SvgText
                  x={x}
                  y={y + jh / 2 + 1.5}
                  fill="#fff"
                  fontSize={1.2}
                  textAnchor="middle"
                >
                  {(pos.assignedPlayer.full_name || '').split(' ').pop() || ''}
                </SvgText>
              </G>
            ) : (
              <G>
                <Circle
                  cx={x}
                  cy={y}
                  r={4}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth={0.4}
                  strokeDasharray="2,2"
                />
                <SvgText
                  x={x}
                  y={y + 0.6}
                  fill="#94a3b8"
                  fontSize={1.8}
                  textAnchor="middle"
                  fontWeight="600"
                >
                  {pos.code}
                </SvgText>
              </G>
            )}
          </G>
        );
      })}
    </Svg>
    {/* Touch overlays for each position - only when not readOnly */}
    {!readOnly &&
      onPositionTap &&
      positions.map((pos, i) => {
        const xPx = (pos.x / 100) * width;
        const yPx = (pos.y / vbH) * height;
        return (
          <TouchableOpacity
            key={`hit-${i}`}
            style={[
              styles.hitArea,
              {
                width: hitSize,
                height: hitSize,
                left: xPx - hitSize / 2,
                top: yPx - hitSize / 2,
              },
            ]}
            onPress={() => onPositionTap(i)}
            activeOpacity={1}
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  hitArea: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
});
