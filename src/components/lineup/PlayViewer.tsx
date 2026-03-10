import React, { memo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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

const TEAM_COLORS: Record<string, string> = {
  attack: '#ef4444',
  defend: '#3b82f6',
  neutral: '#f59e0b',
  goalkeeper: '#10b981',
};

function getViewBoxHeight(fieldType: string): number {
  return FIELD_ASPECT[fieldType] ? 100 / FIELD_ASPECT[fieldType] : 65;
}

function arrowhead(x: number, y: number, angle: number, size: number): string {
  const rad = (angle * Math.PI) / 180;
  const ax = x - size * Math.cos(rad);
  const ay = y - size * Math.sin(rad);
  const bx = ax + size * 0.5 * Math.cos(rad + 2.5);
  const by = ay + size * 0.5 * Math.sin(rad + 2.5);
  const cx = ax + size * 0.5 * Math.cos(rad - 2.5);
  const cy = ay + size * 0.5 * Math.sin(rad - 2.5);
  return `M ${ax} ${ay} L ${bx} ${by} L ${x} ${y} L ${cx} ${cy} Z`;
}

interface PlayViewerProps {
  play: {
    name?: string | null;
    name_es?: string | null;
    animation_data?: { frames?: any[] } | null;
    coaching_points?: string[] | null;
    coaching_points_es?: string[] | null;
  };
  fieldType: string;
  jerseyConfig?: Record<string, unknown>;
  language: 'en' | 'es';
  width: number;
}

export const PlayViewer = memo(function PlayViewer({
  play,
  fieldType,
  language,
  width,
}: PlayViewerProps) {
  const [activeFrame, setActiveFrame] = useState(0);
  const aspect = FIELD_ASPECT[fieldType] || 0.65;
  const height = width * aspect;
  const vbH = getViewBoxHeight(fieldType);
  const viewBox = `0 0 100 ${vbH}`;

  const frames = (play.animation_data as any)?.frames || [];
  const frameCount = frames.length;
  const frame = frames[activeFrame] || {};
  const players = frame.players || [];
  const lines = frame.lines || [];
  const notes = frame.notes || [];

  const coachingPoints =
    language === 'es' && play.coaching_points_es?.length
      ? play.coaching_points_es
      : play.coaching_points || [];

  const sy = (v: number) => (v * vbH) / 100;

  const renderLine = (ln: any, i: number) => {
    const x1 = ln.x1 ?? 0;
    const y1 = sy(ln.y1 ?? 0);
    const x2 = ln.x2 ?? 100;
    const y2 = sy(ln.y2 ?? 0);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const stroke = ln.color ?? '#fff';
    const dash = ln.type === 'run' ? '2,1.5' : undefined;
    const pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
    return (
      <G key={i}>
        <Path d={pathD} fill="none" stroke={stroke} strokeWidth={0.6} strokeDasharray={dash} />
        <Path d={arrowhead(x2, y2, angle, 1.2)} fill={stroke} />
      </G>
    );
  };

  return (
    <View style={styles.container}>
      <Svg width={width} height={height} viewBox={viewBox}>
        <Rect x={0} y={0} width={100} height={vbH} fill="#2d5a27" />
        <Rect x={0.5} y={0.5} width={99} height={vbH - 1} fill="none" stroke="#fff" strokeWidth={0.3} />
        <Circle cx={50} cy={vbH / 2} r={6} fill="none" stroke="#fff" strokeWidth={0.2} strokeDasharray="2,1" />
        <Line x1={50} y1={0} x2={50} y2={vbH} stroke="#fff" strokeWidth={0.2} strokeDasharray="2,1" />
        <Rect x={0} y={0} width={50} height={16} fill="none" stroke="#fff" strokeWidth={0.25} strokeDasharray="2,1" />
        <Rect x={0} y={vbH - 16} width={50} height={16} fill="none" stroke="#fff" strokeWidth={0.25} strokeDasharray="2,1" />

        {lines.map(renderLine)}

        {players.map((p: any, i: number) => {
          const x = p.x ?? 50;
          const y = sy(p.y ?? 50);
          const team = p.team || 'neutral';
          const color = TEAM_COLORS[team] ?? '#f59e0b';
          const radius = team === 'goalkeeper' ? 3 : 2.5;
          return (
            <G key={i}>
              <Circle cx={x} cy={y} r={radius} fill={color} stroke="#fff" strokeWidth={0.5} />
              {p.number != null && (
                <SvgText x={x} y={y + 0.8} fill="#fff" fontSize={2.5} textAnchor="middle" fontWeight="bold">
                  {String(p.number)}
                </SvgText>
              )}
            </G>
          );
        })}

        {notes.map((n: any, i: number) => (
          <G key={i}>
            <Rect
              x={(n.x ?? 50) - 4}
              y={sy(n.y ?? 50) - 1}
              width={8}
              height={2}
              rx={0.5}
              fill="rgba(0,0,0,0.6)"
            />
            <SvgText x={n.x ?? 50} y={sy(n.y ?? 50) + 0.3} fill="#fff" fontSize={1.2} textAnchor="middle">
              {n.text ?? ''}
            </SvgText>
          </G>
        ))}
      </Svg>

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.stepperBtn}
          onPress={() => setActiveFrame((f) => Math.max(0, f - 1))}
          disabled={activeFrame === 0}
        >
          <Text style={styles.stepperText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.frameLabel}>
          Frame {activeFrame + 1} of {frameCount || 1}
        </Text>
        <TouchableOpacity
          style={styles.stepperBtn}
          onPress={() => setActiveFrame((f) => Math.min(frameCount - 1, f + 1))}
          disabled={activeFrame >= frameCount - 1 || frameCount === 0}
        >
          <Text style={styles.stepperText}>›</Text>
        </TouchableOpacity>
      </View>

      {coachingPoints.length > 0 && (
        <View style={styles.coachingSection}>
          <Text style={styles.coachingTitle}>Coaching Points</Text>
          {coachingPoints.map((pt, i) => (
            <Text key={i} style={styles.coachingPoint}>
              {i + 1}. {pt}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 12,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '600',
  },
  frameLabel: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '600',
  },
  coachingSection: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  coachingTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  coachingPoint: {
    fontSize: 14,
    color: '#e2e8f0',
    marginBottom: 4,
  },
});
