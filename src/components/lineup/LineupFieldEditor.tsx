import React, { memo, useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  PanResponder,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, {
  Rect,
  Circle,
  Line,
  Path,
  Text as SvgText,
  G,
  Defs,
  Pattern,
  Image as SvgImage,
  ClipPath,
} from 'react-native-svg';

const TAP_THRESHOLD_MS = 200;
const TAP_THRESHOLD_PX = 5;

function DraggableOverlay({
  index,
  xPx,
  yPx,
  hitSizePx,
  sx,
  sy,
  onTap,
  onDragMove,
  onDragEnd,
  onDragStateChange,
}: {
  index: number;
  xPx: number;
  yPx: number;
  hitSizePx: number;
  /** px per viewBox unit, per axis, from the measured pitch box. */
  sx: number;
  sy: number;
  onTap: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  onDragStateChange: (isDragging: boolean) => void;
}) {
  const startRef = useRef({ time: 0, pageX: 0, pageY: 0, isDrag: false });

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
            onDragMove(pxToPctX(xPx + dx, sx), pxToPctY(yPx + dy, sy));
          }
        },
        onPanResponderRelease: (evt) => {
          const { isDrag, pageX, pageY } = startRef.current;
          if (isDrag) {
            const dx = evt.nativeEvent.pageX - pageX;
            const dy = evt.nativeEvent.pageY - pageY;
            onDragEnd(pxToPctX(xPx + dx, sx), pxToPctY(yPx + dy, sy));
          } else {
            onTap();
          }
          onDragStateChange(false);
        },
      }),
    [index, xPx, yPx, sx, sy, onTap, onDragMove, onDragEnd, onDragStateChange]
  );

  return <View style={[styles.hitArea, { width: hitSizePx, height: hitSizePx, left: xPx - hitSizePx / 2, top: yPx - hitSizePx / 2 }]} {...pan.panHandlers} />;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VIEWBOX_W = 100;
const VIEWBOX_H = 140;
const VIEWBOX_PAD_TOP = 8;
const VIEWBOX_PAD_BOTTOM = 8;
const VB = { w: VIEWBOX_W, h: VIEWBOX_H, minY: -VIEWBOX_PAD_TOP, totalH: VIEWBOX_H + VIEWBOX_PAD_TOP + VIEWBOX_PAD_BOTTOM };

/**
 * Height the pitch takes when the parent gives it no definite height -- i.e.
 * inside a ScrollView, as LineupViewScreen does. Derived from the width so the
 * whole viewBox (both goals included) is visible without being cropped.
 */
const INTRINSIC_HEIGHT = Math.round((SCREEN_WIDTH * VB.totalH) / VB.w);

/**
 * ONE transform shared by the painted jerseys and the touch layer, carrying a
 * SEPARATE scale per axis -- px per viewBox unit -- taken from the MEASURED box.
 *
 * In `fill` mode the pitch is stretched to the box exactly
 * (preserveAspectRatio="none"), so sx and sy differ and the aspect is not
 * preserved: no letterbox bars, no cropped goals, no dead space. Keeping the
 * two axes independent is what lets taps and drags stay exact under a stretch --
 * each axis inverts against its own scale.
 *
 * Without `fill` the two scales are equal, which is the aspect-preserving case
 * LineupViewScreen still uses inside its ScrollView.
 */
const scaleX = (x: number) => x;
const scaleY = (y: number) => (y / 100) * VIEWBOX_H;
/** pct of pitch (0-100) -> px inside the pitch box, per axis. */
const pctToPxX = (x: number, sx: number) => scaleX(x) * sx;
const pctToPxY = (y: number, sy: number) => (scaleY(y) - VB.minY) * sy;
/** px inside the pitch box -> pct: the exact per-axis inverse of pctToPx*. */
const clampPct = (v: number) => Math.max(2, Math.min(98, v));
const pxToPctX = (px: number, sx: number) => clampPct(px / sx);
const pxToPctY = (py: number, sy: number) =>
  clampPct(((py / sy + VB.minY) / VIEWBOX_H) * 100);

/**
 * Size the pitch to the measured box.
 *   stretch  -> fills the box exactly; sx and sy independent.
 *   !stretch -> largest box-fitting pitch that keeps the viewBox aspect.
 */
function fitPitch(boxW: number, boxH: number, stretch: boolean) {
  const w = boxW > 1 ? boxW : SCREEN_WIDTH;
  const h = boxH > 1 ? boxH : INTRINSIC_HEIGHT;
  if (stretch) {
    return { sx: w / VB.w, sy: h / VB.totalH, width: w, height: h };
  }
  const s = Math.min(w / VB.w, h / VB.totalH);
  return { sx: s, sy: s, width: VB.w * s, height: VB.totalH * s };
}

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
    photo_url?: string | null;
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
  /** Print the squad number on the jersey. Default true; absent means true so
   *  lineups saved before this setting existed keep showing numbers. */
  showNumbers?: boolean;
}

interface LineupFieldEditorProps {
  fieldType: string;
  positions: PositionSlot[];
  jerseyConfig?: JerseyConfig;
  visualConfig?: VisualConfig;
  displayMode?: 'jersey' | 'photo';
  onPositionTap: (index: number) => void;
  onPositionDragEnd?: (index: number, x: number, y: number) => void;
  selectedPositionIndex: number | null;
  /**
   * Fill the parent's height instead of taking an intrinsic width-derived one.
   * The editor passes this because its wrapper is flex:1 above a fixed bench
   * strip; a caller inside a ScrollView must not, since flex:1 there is 0.
   */
  fill?: boolean;
}

export const LineupFieldEditor = memo(function LineupFieldEditor({
  fieldType,
  positions,
  jerseyConfig = {},
  visualConfig = {},
  displayMode = 'jersey',
  onPositionTap,
  onPositionDragEnd,
  selectedPositionIndex,
  fill = false,
}: LineupFieldEditorProps) {
  const teamColor = jerseyConfig.team_color || '#8b5cf6';
  const gkColor = jerseyConfig.gk_color || '#ef4444';

  // The box the parent actually gave us. When `fill` is set the height is the
  // parent's to decide, so it starts at 0 and the pitch waits one frame for
  // onLayout rather than flashing at the intrinsic size and then shrinking.
  const [box, setBox] = useState({ w: SCREEN_WIDTH, h: fill ? 0 : INTRINSIC_HEIGHT });
  const measured = box.h > 1;
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) =>
      Math.abs(prev.w - width) < 0.5 && Math.abs(prev.h - height) < 0.5
        ? prev
        : { w: width, h: height }
    );
  }, []);

  const { sx, sy, width: pitchW, height: pitchH } = useMemo(
    () => fitPitch(box.w, box.h, fill),
    [box.w, box.h, fill]
  );
  /**
   * The pitch SVG stretches (preserveAspectRatio="none"), so one viewBox unit is
   * sx px across but sy px down. That is wanted for the pitch lines and NOT for
   * the players: a shirt drawn in plain viewBox units came out sx/sy wider than
   * tall, and slot circles came out oval.
   *
   * Every glyph is therefore drawn inside a group counter-scaled by (gx, gy),
   * which cancels the stretch exactly:
   *     width  px = u * gx * sx = u * su
   *     height px = u * gy * sy = u * su
   * so glyphs render at one uniform scale `su` whatever the pitch is doing.
   * Positions stay per-axis -- only the artwork is made square again.
   */
  const su = Math.min(sx, sy);
  const gx = su / sx;
  const gy = su / sy;
  // Tap targets follow the drawn size, so they use the same uniform scale.
  const hitSizePx = Math.max(14 * su, 50);
  const fieldLinesOpacity = (visualConfig?.fieldLines ?? 50) / 100;
  const jerseyScale = (visualConfig?.jerseySize ?? 100) / 100;
  const jerseyStroke = (visualConfig?.jerseyOutline ?? 3) / 10;
  const nameSizeMult = (visualConfig?.nameSize ?? 100) / 100;
  const showNames = (visualConfig?.nameSize ?? 100) > 0;
  // Absent means true: lineups saved before this setting existed keep numbers.
  const showNumbers = visualConfig?.showNumbers !== false;
  // Gaps below the jersey, scaled with jerseySize so the stack holds together
  // at 105% and above instead of the name creeping up onto the shirt.
  const nameGap = 3.4 * jerseyScale;
  const codeGap = 3.6 * jerseyScale;

  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);

  return (
    <View
      style={[styles.container, fill ? styles.containerFill : { height: INTRINSIC_HEIGHT }]}
      onLayout={handleLayout}
    >
      {/* Sized to the viewBox aspect exactly, so nothing is letterboxed inside
          it and the touch overlays share the pitch's own coordinate origin. */}
      {measured && (
      <View style={{ width: pitchW, height: pitchH }}>
      <Svg
        width={pitchW}
        height={pitchH}
        viewBox={`0 ${VB.minY} ${VB.w} ${VB.totalH}`}
        preserveAspectRatio={fill ? 'none' : 'xMidYMid meet'}
      >
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

          // Position per-axis (stretched pitch), artwork at a uniform scale.
          const glyph = `translate(${x}, ${y}) scale(${gx}, ${gy})`;
          const ghost = `translate(${scaleX(pos.x)}, ${scaleY(pos.y)}) scale(${gx}, ${gy})`;

          return (
            <G key={`pos-${i}`} opacity={isDimmed ? 0.6 : 1}>
              {isDragging && (
                <G transform={ghost}>
                  <Circle cx={0} cy={0} r={6} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={0.5} strokeDasharray="2,2" />
                </G>
              )}
              <G transform={glyph}>
              {pos.assignedPlayer ? (
                <>
                  {isSelected && !isDragging && <Circle cx={0} cy={0} r={7} fill="none" stroke="rgba(6,182,212,0.8)" strokeWidth={0.8} />}
                  {displayMode === 'photo' && pos.assignedPlayer.photo_url ? (
                    <>
                      <Defs>
                        <ClipPath id={`clip-player-${i}`}>
                          <Circle cx={0} cy={0} r={6 * jerseyScale * scaleMult} />
                        </ClipPath>
                      </Defs>
                      <G clipPath={`url(#clip-player-${i})`}>
                        <SvgImage
                          href={{ uri: pos.assignedPlayer.photo_url }}
                          x={-6 * jerseyScale * scaleMult}
                          y={-6 * jerseyScale * scaleMult}
                          width={12 * jerseyScale * scaleMult}
                          height={12 * jerseyScale * scaleMult}
                          preserveAspectRatio="xMidYMid slice"
                        />
                      </G>
                      <Circle
                        cx={0}
                        cy={0}
                        r={6 * jerseyScale * scaleMult}
                        fill="none"
                        stroke="#fff"
                        strokeWidth={Math.max(0.15, jerseyStroke * 0.45)}
                      />
                      {pos.assignedPlayer.isCaptain && (
                        <G transform="translate(-5, -4)">
                          <Circle cx={0} cy={0} r={2.5} fill="#fbbf24" />
                          <SvgText x={0} y={1} fill="#1f2937" fontSize={2} textAnchor="middle" fontWeight="bold">
                            C
                          </SvgText>
                        </G>
                      )}
                      {showNames && (pos.assignedPlayer.lastName || pos.assignedPlayer.fullName) && (
                        <SvgText
                          x={0}
                          y={6 * jerseyScale * scaleMult + nameGap}
                          fill="#fff"
                          fontSize={Math.max(0.5, 3.5 * nameSizeMult)}
                          textAnchor="middle"
                          fontWeight="bold"
                        >
                          {pos.assignedPlayer.lastName || pos.assignedPlayer.fullName.split(' ').pop() || ''}
                        </SvgText>
                      )}
                      <SvgText
                        x={0}
                        y={6 * jerseyScale * scaleMult + nameGap + codeGap}
                        fill="#64748b"
                        fontSize={2.5}
                        textAnchor="middle"
                      >
                        {pos.code}
                      </SvgText>
                    </>
                  ) : (
                    <>
                      <Path
                        d={JERSEY_PATH}
                        fill={isGK ? gkColor : teamColor}
                        stroke="#fff"
                        strokeWidth={Math.max(0.1, jerseyStroke)}
                        transform={`scale(${JERSEY_SCALE * jerseyScale * scaleMult}) translate(-20, -18)`}
                      />
                      {showNumbers && pos.assignedPlayer.jerseyNumber != null && (
                        <SvgText x={0} y={2} fill="#fff" fontSize={5} textAnchor="middle" fontWeight="bold">
                          {pos.assignedPlayer.jerseyNumber}
                        </SvgText>
                      )}
                      {pos.assignedPlayer.isCaptain && (
                        <G transform="translate(-5, -4)">
                          <Circle cx={0} cy={0} r={2.5} fill="#fbbf24" />
                          <SvgText x={0} y={1} fill="#1f2937" fontSize={2} textAnchor="middle" fontWeight="bold">
                            C
                          </SvgText>
                        </G>
                      )}
                      {showNames && (pos.assignedPlayer.lastName || pos.assignedPlayer.fullName) && (
                        <SvgText
                          x={0}
                          y={(JERSEY_HEIGHT * jerseyScale * scaleMult) / 2 + nameGap}
                          fill="#fff"
                          fontSize={Math.max(0.5, 3.5 * nameSizeMult)}
                          textAnchor="middle"
                          fontWeight="bold"
                        >
                          {pos.assignedPlayer.lastName || pos.assignedPlayer.fullName.split(' ').pop() || ''}
                        </SvgText>
                      )}
                      <SvgText
                        x={0}
                        y={(JERSEY_HEIGHT * jerseyScale * scaleMult) / 2 + nameGap + codeGap}
                        fill="#64748b"
                        fontSize={2.5}
                        textAnchor="middle"
                      >
                        {pos.code}
                      </SvgText>
                    </>
                  )}
                </>
              ) : (
                <>
                  {isSelected && <Circle cx={0} cy={0} r={7} fill="none" stroke="rgba(6,182,212,0.8)" strokeWidth={0.8} />}
                  <Circle cx={0} cy={0} r={5} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.6)" strokeWidth={0.5} strokeDasharray="2,2" />
                  <SvgText x={0} y={0.8} fill="#fff" fontSize={3} textAnchor="middle" fontWeight="bold">
                    {pos.code}
                  </SvgText>
                </>
              )}
              </G>
            </G>
          );
        })}
      </Svg>

      {positions.map((pos, i) => {
        const xPx = pctToPxX(pos.x, sx);
        const yPx = pctToPxY(pos.y, sy);
        const hasAssigned = !!pos.assignedPlayer;

        if (hasAssigned && onPositionDragEnd) {
          return (
            <DraggableOverlay
              key={`hit-${i}`}
              index={i}
              xPx={xPx}
              yPx={yPx}
              hitSizePx={hitSizePx}
              sx={sx}
              sy={sy}
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
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  // Centres the pitch box; height comes from `fill` (parent) or INTRINSIC_HEIGHT.
  container: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  containerFill: { flex: 1 },
  hitArea: { position: 'absolute', backgroundColor: 'transparent' },
});
