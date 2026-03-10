import React, { memo, useRef, useState, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions, PanResponder } from 'react-native';
import Svg, { Rect, Circle, Line, Path, Text as SvgText, G, Defs, Pattern } from 'react-native-svg';

const TAP_THRESHOLD_MS = 200;
const TAP_THRESHOLD_PX = 5;

function DraggableOverlay({
  index,
  xPx,
  yPx,
  hitSizePx,
  fieldWidth,
  fieldHeight,
  onTap,
  onDragMove,
  onDragEnd,
  onDragStateChange,
}: {
  index: number;
  xPx: number;
  yPx: number;
  hitSizePx: number;
  fieldWidth: number;
  fieldHeight: number;
  onTap: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  onDragStateChange: (isDragging: boolean) => void;
}) {
  const startRef = useRef({ time: 0, pageX: 0, pageY: 0, isDrag: false });
  const pxToX = (px: number) => Math.max(2, Math.min(98, (px / fieldWidth) * 100));
  const pxToY = (px: number) => Math.max(2, Math.min(98, (px / fieldHeight) * 100));

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          startRef.current = {
            time: Date.now(),
            pageX: evt.nativeEvent.pageX,
            pageY: evt.nativeEvent.pageY,
            isDrag: false,
          };
        },
        onPanResponderMove: (evt) => {
          const { pageX, pageY, time } = startRef.current;
          const dx = evt.nativeEvent.pageX - pageX;
          const dy = evt.nativeEvent.pageY - pageY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const elapsed = Date.now() - time;
          if (!startRef.current.isDrag && (dist > TAP_THRESHOLD_PX || elapsed > TAP_THRESHOLD_MS)) {
            startRef.current.isDrag = true;
            onDragStateChange(true);
          }
          if (startRef.current.isDrag) {
            onDragMove(pxToX(xPx + dx), pxToY(yPx + dy));
          }
        },
        onPanResponderRelease: (evt) => {
          const { isDrag, pageX, pageY } = startRef.current;
          if (isDrag) {
            const dx = evt.nativeEvent.pageX - pageX;
            const dy = evt.nativeEvent.pageY - pageY;
            onDragEnd(pxToX(xPx + dx), pxToY(yPx + dy));
          } else {
            onTap();
          }
          onDragStateChange(false);
        },
      }),
    [index, xPx, yPx, fieldWidth, fieldHeight, onTap, onDragMove, onDragEnd, onDragStateChange]
  );

  return <View style={[styles.hitArea, { width: hitSizePx, height: hitSizePx, left: xPx - hitSizePx / 2, top: yPx - hitSizePx / 2 }]} {...pan.panHandlers} />;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FIELD_WIDTH = SCREEN_WIDTH;
const FIELD_HEIGHT = Math.round(SCREEN_HEIGHT * 0.6);
const VIEWBOX_W = 100;
const VIEWBOX_H = 140;
const VIEWBOX_PAD_TOP = 8;
const VIEWBOX_PAD_BOTTOM = 8;
const VB = { w: VIEWBOX_W, h: VIEWBOX_H, minY: -VIEWBOX_PAD_TOP, totalH: VIEWBOX_H + VIEWBOX_PAD_TOP + VIEWBOX_PAD_BOTTOM };

const JERSEY_PATH = 'M8,0 L16,0 L20,4 L24,0 L32,0 L40,8 L34,14 L30,10 L30,36 L10,36 L10,10 L6,14 L0,8 Z';
const JERSEY_WIDTH = 12;
const JERSEY_HEIGHT = 10.8;
const JERSEY_SCALE = 0.3;

export interface PositionSlot {
  code: string;
  x: number;
  y: number;
  role: string;
  assignedPlayer?: {
    id: string;
    fullName: string;
    lastName?: string;
    jerseyNumber: number | null;
    isCaptain: boolean;
  };
}

export interface JerseyConfig {
  team_color?: string;
  gk_color?: string;
}

export interface VisualConfig {
  jerseySize?: number;
  jerseyOutline?: number;
  fieldLines?: number;
  nameSize?: number;
}

interface LineupFieldEditorProps {
  fieldType: string;
  positions: PositionSlot[];
  jerseyConfig?: JerseyConfig;
  visualConfig?: VisualConfig;
  onPositionTap: (index: number) => void;
  onPositionDragEnd?: (index: number, x: number, y: number) => void;
  selectedPositionIndex: number | null;
}

export const LineupFieldEditor = memo(function LineupFieldEditor({
  fieldType,
  positions,
  jerseyConfig = {},
  visualConfig = {},
  onPositionTap,
  onPositionDragEnd,
  selectedPositionIndex,
}: LineupFieldEditorProps) {
  const teamColor = jerseyConfig.team_color || '#8b5cf6';
  const gkColor = jerseyConfig.gk_color || '#ef4444';
  const hitSizePx = Math.max((14 / 100) * FIELD_WIDTH, (14 / VB.totalH) * FIELD_HEIGHT, 50);
  const fieldLinesOpacity = (visualConfig?.fieldLines ?? 50) / 100;
  const jerseyScale = (visualConfig?.jerseySize ?? 100) / 100;
  const jerseyStroke = (visualConfig?.jerseyOutline ?? 3) / 10;
  const nameSizeMult = (visualConfig?.nameSize ?? 100) / 100;
  const showNames = (visualConfig?.nameSize ?? 100) > 0;

  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);

  const scaleY = (y: number) => (y / 100) * VIEWBOX_H;
  const scaleX = (x: number) => x;
  const yToPx = (y: number) => (y / 100) * FIELD_HEIGHT;
  const xToPx = (x: number) => (x / 100) * FIELD_WIDTH;
  const pxToX = (px: number) => Math.max(2, Math.min(98, (px / FIELD_WIDTH) * 100));
  const pxToY = (px: number) => Math.max(2, Math.min(98, (px / FIELD_HEIGHT) * 100));

  return (
    <View style={styles.container}>
      <Svg width={FIELD_WIDTH} height={FIELD_HEIGHT} viewBox={`0 ${VB.minY} ${VB.w} ${VB.totalH}`} preserveAspectRatio="xMidYMid meet">
        <Defs>
          <Pattern id="stripes" width={VIEWBOX_W} height={24} patternUnits="userSpaceOnUse">
            <Rect x={0} y={0} width={VIEWBOX_W} height={12} fill="#2d8a31" />
            <Rect x={0} y={12} width={VIEWBOX_W} height={12} fill="#247028" />
          </Pattern>
          <Pattern id="net" width={3} height={3} patternUnits="userSpaceOnUse">
            <Line x1={0} y1={0} x2={3} y2={3} stroke="rgba(255,255,255,0.25)" strokeWidth={0.25} />
            <Line x1={3} y1={0} x2={0} y2={3} stroke="rgba(255,255,255,0.25)" strokeWidth={0.25} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width={VIEWBOX_W} height={VIEWBOX_H} fill="url(#stripes)" />
        <Rect x={0.5} y={0.5} width={VIEWBOX_W - 1} height={VIEWBOX_H - 1} fill="none" stroke={`rgba(255,255,255,${fieldLinesOpacity * 0.6})`} strokeWidth={0.4} />

        <Line x1={0} y1={VIEWBOX_H / 2} x2={VIEWBOX_W} y2={VIEWBOX_H / 2} stroke={`rgba(255,255,255,${fieldLinesOpacity * 0.6})`} strokeWidth={0.4} />
        <Circle cx={VIEWBOX_W / 2} cy={VIEWBOX_H / 2} r={5} fill="none" stroke={`rgba(255,255,255,${fieldLinesOpacity * 0.6})`} strokeWidth={0.3} />
        {fieldType === '11v11' && (
          <>
            <Rect x={20} y={0} width={60} height={21} fill="none" stroke={`rgba(255,255,255,${fieldLinesOpacity * 0.6})`} strokeWidth={0.35} />
            <Rect x={32.5} y={0} width={35} height={7} fill="none" stroke={`rgba(255,255,255,${fieldLinesOpacity * 0.6})`} strokeWidth={0.3} />
            <Rect x={20} y={VIEWBOX_H - 21} width={60} height={21} fill="none" stroke={`rgba(255,255,255,${fieldLinesOpacity * 0.6})`} strokeWidth={0.35} />
            <Rect x={32.5} y={VIEWBOX_H - 7} width={35} height={7} fill="none" stroke={`rgba(255,255,255,${fieldLinesOpacity * 0.6})`} strokeWidth={0.3} />
          </>
        )}
        {(fieldType === '9v9' || fieldType === '7v7') && (
          <>
            <Rect x={20} y={0} width={60} height={21} fill="none" stroke={`rgba(255,255,255,${fieldLinesOpacity * 0.6})`} strokeWidth={0.35} />
            <Rect x={32.5} y={0} width={35} height={7} fill="none" stroke={`rgba(255,255,255,${fieldLinesOpacity * 0.6})`} strokeWidth={0.3} />
            <Rect x={20} y={VIEWBOX_H - 21} width={60} height={21} fill="none" stroke={`rgba(255,255,255,${fieldLinesOpacity * 0.6})`} strokeWidth={0.35} />
            <Rect x={32.5} y={VIEWBOX_H - 7} width={35} height={7} fill="none" stroke={`rgba(255,255,255,${fieldLinesOpacity * 0.6})`} strokeWidth={0.3} />
          </>
        )}

        <Rect x={37.5} y={-VIEWBOX_PAD_TOP} width={25} height={6} fill="url(#net)" stroke={`rgba(255,255,255,${fieldLinesOpacity * 0.9})`} strokeWidth={0.4} />
        <Rect x={37.5} y={VIEWBOX_H} width={25} height={6} fill="url(#net)" stroke={`rgba(255,255,255,${fieldLinesOpacity * 0.9})`} strokeWidth={0.4} />

        {positions.map((pos, i) => {
          const renderX = draggingIndex === i && dragPosition ? dragPosition.x : pos.x;
          const renderY = draggingIndex === i && dragPosition ? dragPosition.y : pos.y;
          const x = scaleX(renderX);
          const y = scaleY(renderY);
          const isSelected = selectedPositionIndex === i;
          const isGK = pos.role === 'goalkeeper';
          const isDragging = draggingIndex === i;
          const isDimmed = draggingIndex !== null && draggingIndex !== i;
          const scaleMult = isDragging ? 1.15 : 1;

          return (
            <G key={`pos-${i}`} opacity={isDimmed ? 0.6 : 1}>
              {pos.assignedPlayer ? (
                <>
                  {isSelected && !isDragging && <Circle cx={x} cy={y} r={7} fill="none" stroke="rgba(6,182,212,0.8)" strokeWidth={0.8} />}
                  {isDragging && <Circle cx={scaleX(pos.x)} cy={scaleY(pos.y)} r={6} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={0.5} strokeDasharray="2,2" />}
                  <Path
                    d={JERSEY_PATH}
                    fill={isGK ? gkColor : teamColor}
                    stroke="#fff"
                    strokeWidth={Math.max(0.1, jerseyStroke)}
                    transform={`translate(${x}, ${y}) scale(${JERSEY_SCALE * jerseyScale * scaleMult}) translate(-20, -18)`}
                  />
                  <SvgText x={x} y={y + 2} fill="#fff" fontSize={5} textAnchor="middle" fontWeight="bold">
                    {pos.assignedPlayer.jerseyNumber ?? '?'}
                  </SvgText>
                  {pos.assignedPlayer.isCaptain && (
                    <G transform={`translate(${x - 5}, ${y - 4})`}>
                      <Circle cx={0} cy={0} r={2.5} fill="#fbbf24" />
                      <SvgText x={0} y={1} fill="#1f2937" fontSize={2} textAnchor="middle" fontWeight="bold">C</SvgText>
                    </G>
                  )}
                  {showNames && (pos.assignedPlayer.lastName || pos.assignedPlayer.fullName) && (
                    <SvgText x={x} y={y + (JERSEY_HEIGHT * jerseyScale) / 2 + 2} fill="#fff" fontSize={Math.max(0.5, 3.5 * nameSizeMult)} textAnchor="middle" fontWeight="bold">
                      {pos.assignedPlayer.lastName || pos.assignedPlayer.fullName.split(' ').pop() || ''}
                    </SvgText>
                  )}
                  <SvgText x={x} y={y + (JERSEY_HEIGHT * jerseyScale) / 2 + 5.5} fill="#64748b" fontSize={2.5} textAnchor="middle">
                    {pos.code}
                  </SvgText>
                </>
              ) : (
                <>
                  {isSelected && <Circle cx={x} cy={y} r={7} fill="none" stroke="rgba(6,182,212,0.8)" strokeWidth={0.8} />}
                  <Circle cx={x} cy={y} r={5} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.6)" strokeWidth={0.5} strokeDasharray="2,2" />
                  <SvgText x={x} y={y + 0.8} fill="#fff" fontSize={3} textAnchor="middle" fontWeight="bold">
                    {pos.code}
                  </SvgText>
                </>
              )}
            </G>
          );
        })}
      </Svg>

      {positions.map((pos, i) => {
        const xPx = xToPx(pos.x);
        const yPx = yToPx(pos.y);
        const hasAssigned = !!pos.assignedPlayer;

        if (hasAssigned && onPositionDragEnd) {
          return (
            <DraggableOverlay
              key={`hit-${i}`}
              index={i}
              xPx={xPx}
              yPx={yPx}
              hitSizePx={hitSizePx}
              fieldWidth={FIELD_WIDTH}
              fieldHeight={FIELD_HEIGHT}
              onTap={() => onPositionTap(i)}
              onDragMove={(x, y) => setDragPosition({ x, y })}
              onDragEnd={(x, y) => {
                onPositionDragEnd(i, x, y);
                setDraggingIndex(null);
                setDragPosition(null);
              }}
              onDragStateChange={(isDragging) => {
                if (isDragging) setDraggingIndex(i);
                else {
                  setDraggingIndex(null);
                  setDragPosition(null);
                }
              }}
            />
          );
        }
        return (
          <TouchableOpacity
            key={`hit-${i}`}
            style={[styles.hitArea, { width: hitSizePx, height: hitSizePx, left: xPx - hitSizePx / 2, top: yPx - hitSizePx / 2 }]}
            onPress={() => onPositionTap(i)}
            activeOpacity={1}
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: FIELD_WIDTH, height: FIELD_HEIGHT },
  hitArea: { position: 'absolute', backgroundColor: 'transparent' },
});
