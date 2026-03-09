import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Rect,
  Circle,
  Line,
  Path,
  Text as SvgText,
  G,
  Polygon,
} from 'react-native-svg';

const FIELD_ASPECT: Record<string, number> = {
  quarter: 1,
  half: 1.3,
  two_thirds: 0.97,
  full: 0.65,
};

const TEAM_COLORS: Record<string, string> = {
  attack: '#ef4444',
  defend: '#3b82f6',
  neutral: '#f59e0b',
  goalkeeper: '#10b981',
  team_c: '#06b6d4',
  team_d: '#a855f7',
};

function getViewBoxHeight(fieldType: string): number {
  const ratio = FIELD_ASPECT[fieldType] ?? 1.3;
  if (fieldType === 'quarter') return 100;
  if (fieldType === 'half') return 130;
  if (fieldType === 'two_thirds') return 97;
  if (fieldType === 'full') return 65;
  return 130;
}

function mapY(y: number, vbH: number): number {
  return (y * vbH) / 100;
}

function arrowhead(
  x: number,
  y: number,
  angle: number,
  size: number
): string {
  const rad = (angle * Math.PI) / 180;
  const ax = x - size * Math.cos(rad);
  const ay = y - size * Math.sin(rad);
  const bx = ax + size * 0.5 * Math.cos(rad + 2.5);
  const by = ay + size * 0.5 * Math.sin(rad + 2.5);
  const cx = ax + size * 0.5 * Math.cos(rad - 2.5);
  const cy = ay + size * 0.5 * Math.sin(rad - 2.5);
  return `M ${ax} ${ay} L ${bx} ${by} L ${x} ${y} L ${cx} ${cy} Z`;
}

function FieldDiagramInner({ data, width }: { data: any; width: number }) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const fieldType = data.fieldType || 'half';
  const aspectRatio = FIELD_ASPECT[fieldType] ?? 1.3;
  const height = width * aspectRatio;
  const vbH = getViewBoxHeight(fieldType);
  const viewBox = `0 0 100 ${vbH}`;

  const sy = (v: number) => mapY(v, vbH);

  return (
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

      {/* Field markings by type */}
      {fieldType === 'half' && (
        <>
          <Rect x={0} y={vbH - 20} width={44} height={20} fill="none" stroke="#fff" strokeWidth={0.25} strokeDasharray="2,1" />
          <Rect x={0} y={vbH - 8} width={17} height={8} fill="none" stroke="#fff" strokeWidth={0.2} strokeDasharray="2,1" />
          <Path d={`M ${50 - 9.15} ${vbH} Q 50 ${vbH - 9.15} ${50 + 9.15} ${vbH}`} fill="none" stroke="#fff" strokeWidth={0.2} strokeDasharray="2,1" />
        </>
      )}
      {fieldType === 'two_thirds' && (
        <>
          <Rect x={0} y={vbH - 20} width={44} height={20} fill="none" stroke="#fff" strokeWidth={0.25} strokeDasharray="2,1" />
          <Line x1={50} y1={0} x2={50} y2={vbH} stroke="#fff" strokeWidth={0.2} strokeDasharray="4,2" />
        </>
      )}
      {fieldType === 'full' && (
        <>
          <Circle cx={50} cy={vbH / 2} r={9.15} fill="none" stroke="#fff" strokeWidth={0.2} strokeDasharray="2,1" />
          <Line x1={50} y1={0} x2={50} y2={vbH} stroke="#fff" strokeWidth={0.2} strokeDasharray="2,1" />
          <Rect x={0} y={0} width={44} height={20} fill="none" stroke="#fff" strokeWidth={0.25} strokeDasharray="2,1" />
          <Rect x={0} y={vbH - 20} width={44} height={20} fill="none" stroke="#fff" strokeWidth={0.25} strokeDasharray="2,1" />
        </>
      )}

      {/* Subgrids */}
      {data.subGrids &&
        (Array.isArray(data.subGrids)
          ? data.subGrids.map((sg: any, i: number) => (
              <Line
                key={`sg-${i}`}
                x1={sg.x1 ?? 0}
                y1={sy(sg.y1 ?? 0)}
                x2={sg.x2 ?? 100}
                y2={sy(sg.y2 ?? 0)}
                stroke="#fff"
                strokeWidth={0.2}
                strokeDasharray="3,2"
              />
            ))
          : typeof data.subGrids === 'object' &&
            data.subGrids.cols != null &&
            data.subGrids.rows != null &&
            (() => {
              const cols = Number(data.subGrids.cols) || 2;
              const rows = Number(data.subGrids.rows) || 2;
              const lines: React.ReactNode[] = [];
              for (let c = 1; c < cols; c++) {
                const x = (c * 100) / cols;
                lines.push(
                  <Line key={`sg-v-${c}`} x1={x} y1={0} x2={x} y2={vbH} stroke="#fff" strokeWidth={0.2} strokeDasharray="3,2" />
                );
              }
              for (let r = 1; r < rows; r++) {
                const y = sy((r * 100) / rows);
                lines.push(
                  <Line key={`sg-h-${r}`} x1={0} y1={y} x2={100} y2={y} stroke="#fff" strokeWidth={0.2} strokeDasharray="3,2" />
                );
              }
              return lines;
            })())}

      {/* Layer 2: Zones */}
      {Array.isArray(data.zones) &&
        data.zones.map((z: any, i: number) => {
          const opacity = z.opacity ?? 0.15;
          const color = z.color || '#94a3b8';
          return (
            <G key={`zone-${i}`}>
              <Rect
                x={z.x ?? 0}
                y={sy(z.y ?? 0)}
                width={z.width ?? 10}
                height={((z.height ?? 10) * vbH) / 100}
                fill={color}
                fillOpacity={opacity}
                stroke={color}
                strokeWidth={0.2}
                strokeDasharray="2,2"
              />
              {z.label && (
                <SvgText
                  x={(z.x ?? 0) + (z.width ?? 10) / 2}
                  y={sy((z.y ?? 0) + (z.height ?? 10) / 2)}
                  fill="#fff"
                  fontSize={1.8}
                  textAnchor="middle"
                  fontWeight="500"
                >
                  {z.label}
                </SvgText>
              )}
            </G>
          );
        })}

      {/* Layer 3: Equipment */}
      {Array.isArray(data.equipment) &&
        data.equipment.map((eq: any, i: number) => {
          const type = eq.type || 'cone';
          const x = eq.x ?? 50;
          const y = sy(eq.y ?? 50);
          const rot = eq.rotation ?? 0;
          const rad = (rot * Math.PI) / 180;

          if (type === 'cone') {
            const s = 2;
            const pts = `${x},${y - s} ${x + s},${y + s} ${x - s},${y + s}`;
            return <Polygon key={`eq-${i}`} points={pts} fill="#f97316" stroke="#fff" strokeWidth={0.1} />;
          }
          if (type === 'cone_marker') {
            return <Circle key={`eq-${i}`} cx={x} cy={y} r={1} fill="#fff" stroke="#64748b" strokeWidth={0.15} />;
          }
          if (type === 'cone_tall') {
            const w = 0.5;
            const h = 1.5;
            return <Rect key={`eq-${i}`} x={x - w / 2} y={y - h} width={w} height={h} fill="#f97316" />;
          }
          if (type === 'ball') {
            return <Circle key={`eq-${i}`} cx={x} cy={y} r={1.2} fill="#fff" stroke="#000" strokeWidth={0.15} />;
          }
          if (type === 'ball_supply') {
            return (
              <G key={`eq-${i}`}>
                <Circle cx={x - 0.6} cy={y} r={0.8} fill="#fff" stroke="#000" strokeWidth={0.1} />
                <Circle cx={x} cy={y - 0.4} r={0.8} fill="#fff" stroke="#000" strokeWidth={0.1} />
                <Circle cx={x + 0.6} cy={y} r={0.8} fill="#fff" stroke="#000" strokeWidth={0.1} />
              </G>
            );
          }
          if (type === 'goal_full') {
            const w = 12;
            const h = 3;
            return <Rect key={`eq-${i}`} x={x - w / 2} y={y - h} width={w} height={h} fill="none" stroke="#fff" strokeWidth={0.8} />;
          }
          if (type === 'goal_small') {
            const w = 6;
            const h = 2;
            return <Rect key={`eq-${i}`} x={x - w / 2} y={y - h} width={w} height={h} fill="none" stroke="#fff" strokeWidth={0.5} />;
          }
          if (type === 'mannequin') {
            return (
              <G key={`eq-${i}`}>
                <Line x1={x} y1={y} x2={x} y2={y - 2} stroke="#64748b" strokeWidth={0.3} />
                <Circle cx={x} cy={y - 2} r={0.6} fill="#64748b" />
              </G>
            );
          }
          if (type === 'gate') {
            const px = Math.cos(rad) * 1.5;
            const py = Math.sin(rad) * 1.5;
            return (
              <G key={`eq-${i}`}>
                <Polygon points={`${x - 1.5 - px},${y - py} ${x - 1.5 + py},${y + px} ${x - 1.5 + px},${y + py}`} fill="#f97316" />
                <Polygon points={`${x + 1.5 - px},${y - py} ${x + 1.5 + py},${y + px} ${x + 1.5 + px},${y + py}`} fill="#f97316" />
              </G>
            );
          }
          if (type === 'ladder') {
            return (
              <G key={`eq-${i}`}>
                <Line x1={x - 1} y1={y - 1} x2={x - 1} y2={y + 1} stroke="#fff" strokeWidth={0.2} />
                <Line x1={x + 1} y1={y - 1} x2={x + 1} y2={y + 1} stroke="#fff" strokeWidth={0.2} />
                {[0, 0.5, 1, 1.5, 2].map((t, j) => (
                  <Line key={j} x1={x - 1} y1={y - 1 + t} x2={x + 1} y2={y - 1 + t} stroke="#fff" strokeWidth={0.15} />
                ))}
              </G>
            );
          }
          if (type === 'flag') {
            return (
              <G key={`eq-${i}`}>
                <Line x1={x} y1={y} x2={x} y2={y - 2} stroke="#fff" strokeWidth={0.2} />
                <Polygon points={`${x},${y - 2} ${x + 0.5},${y - 1.5} ${x},${y - 1}`} fill="#fff" />
              </G>
            );
          }
          if (type === 'hurdle') {
            return (
              <Path
                key={`eq-${i}`}
                d={`M ${x - 1} ${y} Q ${x} ${y - 1.2} ${x + 1} ${y}`}
                fill="none"
                stroke="#fff"
                strokeWidth={0.3}
              />
            );
          }
          return <Circle key={`eq-${i}`} cx={x} cy={y} r={1} fill="#64748b" />;
        })}

      {/* Layer 4: Lines */}
      {Array.isArray(data.lines) &&
        data.lines.map((ln: any, i: number) => {
          const x1 = ln.x1 ?? 0;
          const y1 = sy(ln.y1 ?? 0);
          const x2 = ln.x2 ?? 100;
          const y2 = sy(ln.y2 ?? 100);
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
          const arrowSize = 1.2;

          let stroke = '#fff';
          let strokeWidth = 0.6;
          let dash: string | undefined;
          let pathD: string | null = null;

          switch (ln.type) {
            case 'pass':
              stroke = ln.color ?? '#fff';
              pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
              break;
            case 'run':
              stroke = ln.color ?? '#fff';
              dash = '2,1.5';
              pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
              break;
            case 'curved_run': {
              stroke = ln.color ?? '#fff';
              dash = '2,1.5';
              const curvature = ln.curvature ?? 0.3;
              const perpX = -(y2 - y1) * curvature;
              const perpY = (x2 - x1) * curvature;
              const cx = midX + perpX;
              const cy = midY + perpY;
              pathD = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
              break;
            }
            case 'dribble': {
              stroke = ln.color ?? '#fff';
              const dx = (x2 - x1) / 5;
              const wave = 1.5;
              let d = `M ${x1} ${y1}`;
              for (let j = 1; j <= 5; j++) {
                const t = j / 5;
                const nx = x1 + dx * j + (j % 2 === 0 ? wave : -wave);
                const ny = y1 + (y2 - y1) * t;
                d += ` L ${nx} ${ny}`;
              }
              pathD = d;
              break;
            }
            case 'press':
              stroke = ln.color ?? '#ef4444';
              const cp1x = midX + (y2 - y1) * 0.2;
              const cp1y = midY - (x2 - x1) * 0.2;
              pathD = `M ${x1} ${y1} Q ${cp1x} ${cp1y} ${x2} ${y2}`;
              break;
            case 'shot':
              stroke = ln.color ?? '#f59e0b';
              strokeWidth = 1.0;
              pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
              break;
            case 'cross':
              stroke = ln.color ?? '#fff';
              dash = '4,1,1,1';
              pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
              break;
            case 'defensive_slide':
              stroke = ln.color ?? '#3b82f6';
              dash = '2,1.5';
              pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
              break;
            default:
              stroke = ln.color ?? '#fff';
              pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
          }

          if (!pathD) return null;

          return (
            <G key={`line-${i}`}>
              <Path d={pathD} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />
              <Path d={arrowhead(x2, y2, angle, arrowSize)} fill={stroke} />
              {ln.label && (
                <SvgText x={midX} y={midY} fill="#fff" fontSize={1.6} textAnchor="middle" fontWeight="500">
                  {ln.label}
                </SvgText>
              )}
            </G>
          );
        })}

      {/* Layer 5: Players */}
      {Array.isArray(data.players) &&
        data.players.map((p: any, i: number) => {
          const x = p.x ?? 50;
          const y = sy(p.y ?? 50);
          const team = p.team || 'neutral';
          const color = TEAM_COLORS[team] ?? '#f59e0b';
          const radius = team === 'goalkeeper' ? 3 : 2.5;

          return (
            <G key={p.id ?? `player-${i}`}>
              <Circle cx={x} cy={y} r={radius} fill={color} stroke="#fff" strokeWidth={0.5} />
              {p.number != null && (
                <SvgText x={x} y={y + 0.8} fill="#fff" fontSize={2.5} textAnchor="middle" fontWeight="bold">
                  {String(p.number)}
                </SvgText>
              )}
              {p.hasBall && <Circle cx={x + 1.5} cy={y + 1.5} r={0.8} fill="#fff" stroke="#000" strokeWidth={0.1} />}
              {p.label && (
                <SvgText x={x} y={y + radius + 1.8} fill="#fff" fontSize={1.8} textAnchor="middle">
                  {p.label}
                </SvgText>
              )}
            </G>
          );
        })}

      {/* Layer 6: Coach */}
      {data.coach && typeof data.coach === 'object' && (
        <G>
          <Circle
            cx={data.coach.x ?? 50}
            cy={sy(data.coach.y ?? 50)}
            r={2.2}
            fill="#fff"
            stroke="#64748b"
            strokeWidth={0.3}
          />
          <SvgText
            x={data.coach.x ?? 50}
            y={sy((data.coach.y ?? 50)) + 0.7}
            fill="#000"
            fontSize={2.2}
            textAnchor="middle"
            fontWeight="bold"
          >
            C
          </SvgText>
        </G>
      )}

      {/* Layer 7: Ball position (if no hasBall player) */}
      {data.ballPosition &&
        typeof data.ballPosition === 'object' &&
        !(Array.isArray(data.players) && data.players.some((p: any) => p.hasBall)) && (
          <Circle
            cx={data.ballPosition.x ?? 50}
            cy={sy(data.ballPosition.y ?? 50)}
            r={1.2}
            fill="#fff"
            stroke="#000"
            strokeWidth={0.15}
          />
        )}

      {/* Layer 8: Ball supply */}
      {data.ballSupply && typeof data.ballSupply === 'object' && (
        <G>
          <Circle cx={(data.ballSupply.x ?? 50) - 0.6} cy={sy(data.ballSupply.y ?? 50)} r={0.8} fill="#fff" stroke="#000" strokeWidth={0.1} />
          <Circle cx={data.ballSupply.x ?? 50} cy={sy((data.ballSupply.y ?? 50)) - 0.4} r={0.8} fill="#fff" stroke="#000" strokeWidth={0.1} />
          <Circle cx={(data.ballSupply.x ?? 50) + 0.6} cy={sy(data.ballSupply.y ?? 50)} r={0.8} fill="#fff" stroke="#000" strokeWidth={0.1} />
        </G>
      )}

      {/* Layer 9: Labels */}
      {Array.isArray(data.labels) &&
        data.labels.map((lb: any, i: number) => {
          const fs = lb.fontSize === 'lg' ? 3.5 : lb.fontSize === 'md' ? 2.5 : 1.8;
          return (
            <SvgText
              key={`label-${i}`}
              x={lb.x ?? 50}
              y={sy(lb.y ?? 50)}
              fill="#fff"
              fontSize={fs}
              textAnchor="middle"
            >
              {lb.text ?? ''}
            </SvgText>
          );
        })}

      {/* Grid size label */}
      {data.gridSize && (
        <SvgText x={2} y={vbH - 1} fill="#fff" fontSize={1.6} textAnchor="start">
          {String(data.gridSize)}
        </SvgText>
      )}

      {/* Direction of play arrow */}
      {data.directionOfPlay && (
        (() => {
          const dir = String(data.directionOfPlay).toLowerCase();
          const size = 3;
          let pts: string;
          let cx: number;
          let cy: number;
          if (dir === 'up' || dir === 'north') {
            cx = 50;
            cy = 4;
            pts = `${cx},${cy - size} ${cx - size},${cy + size} ${cx + size},${cy + size}`;
          } else if (dir === 'down' || dir === 'south') {
            cx = 50;
            cy = vbH - 4;
            pts = `${cx},${cy + size} ${cx - size},${cy - size} ${cx + size},${cy - size}`;
          } else if (dir === 'left' || dir === 'west') {
            cx = 4;
            cy = vbH / 2;
            pts = `${cx - size},${cy} ${cx + size},${cy - size} ${cx + size},${cy + size}`;
          } else {
            cx = 96;
            cy = vbH / 2;
            pts = `${cx + size},${cy} ${cx - size},${cy - size} ${cx - size},${cy + size}`;
          }
          return <Polygon points={pts} fill="#fff" fillOpacity={0.8} />;
        })()
      )}
    </Svg>
  );
}

const FieldDiagramComponent = memo(function FieldDiagram({
  data,
  width,
  height: heightProp,
}: {
  data: any;
  width: number;
  height?: number;
}) {
  try {
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      return (
        <View style={[styles.placeholder, { width, height: width * 1.3 }]}>
          <Text style={styles.placeholderText}>No diagram available</Text>
        </View>
      );
    }

    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return (
          <View style={[styles.placeholder, { width, height: width * 1.3 }]}>
            <Text style={styles.placeholderText}>No diagram available</Text>
          </View>
        );
      }
    }

    const fieldType = data.fieldType || 'half';
    const aspectRatio = FIELD_ASPECT[fieldType] ?? 1.3;
    const height = heightProp ?? width * aspectRatio;

    return (
      <View style={[styles.container, { width, height }]}>
        <FieldDiagramInner data={data} width={width} />
      </View>
    );
  } catch {
    return (
      <View style={[styles.placeholder, { width, height: width * 1.3 }]}>
        <Text style={styles.placeholderText}>No diagram available</Text>
      </View>
    );
  }
});

export default FieldDiagramComponent;

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  placeholder: {
    backgroundColor: '#334155',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#94a3b8',
    fontSize: 14,
  },
});
