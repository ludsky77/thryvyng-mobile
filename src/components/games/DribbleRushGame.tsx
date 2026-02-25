import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { DribbleRushConfig, GameResult } from '../../types/games';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Layout
const HUD_HEIGHT = 70;
const CONTROLS_HEIGHT = 130;
const FIELD_HEIGHT = SCREEN_HEIGHT - HUD_HEIGHT - CONTROLS_HEIGHT;
const FIELD_WIDTH = SCREEN_WIDTH;

// Perspective Configuration
const HORIZON_Y = 60; // Vanishing point Y position (from top of field)
const PERSPECTIVE_RATIO = 0.35; // How narrow the field is at horizon (35% of bottom width)

// Lane System: [GUTTER_L] [LANE_0] [LANE_1] [LANE_2] [GUTTER_R]
const GUTTER_WIDTH = 40; // Width of each gutter zone
const PLAYABLE_WIDTH = FIELD_WIDTH - GUTTER_WIDTH * 2; // Width of 3-lane area
const LANE_WIDTH = PLAYABLE_WIDTH / 3;
const LANE_COUNT = 3;
const PLAYER_BOTTOM_OFFSET = 100; // Player distance from bottom
const PLAYER_SIZE = 50;
const PLAYER_Y = 0.85; // Normalized Y position of player (0=top, 1=bottom)

// Game Physics
const FRAME_MS = 16; // ~60fps
const BASE_SPEED = 2.5;
const MAX_SPEED = 7.0;
const ACCELERATION = 0.003; // Speed increase per frame
const SPEED_PENALTY_MULTIPLIER = 0.6; // Speed × this on miss/collision
const PASS_LEEWAY_MS = 150; // Forgiveness window for pass timing

// Types
type GamePhase = 'ready' | 'countdown' | 'playing' | 'collision' | 'finished';
type PlayerLane = 0 | 1 | 2;

interface Entity {
  id: string;
  type: 'defender' | 'winger';
  lane: number; // Defenders: 0, 1, 2 | Wingers: -1 (left gutter) or 3 (right gutter)
  normalizedY: number; // 0 = top of field, 1 = bottom
  passed: boolean;
}

interface SceneryItem {
  id: string;
  type: 'bench_home' | 'bench_away' | 'coach' | 'flag' | 'camera_crew';
  side: 'left' | 'right';
  yOffset: number; // Normalized 0-1 position that scrolls
}

// Level Configurations (Time-based progression)
const LEVEL_CONFIGS = [
  { level: 1, name: 'Training Ground', targetTime: 50, baseSpeed: 2.0, defenderFreq: 2500, wingerFreq: 5000 },
  { level: 2, name: 'Local Club', targetTime: 45, baseSpeed: 2.5, defenderFreq: 2200, wingerFreq: 4500 },
  { level: 3, name: 'Pro Stadium', targetTime: 40, baseSpeed: 3.0, defenderFreq: 1900, wingerFreq: 4000 },
  { level: 4, name: 'National Arena', targetTime: 35, baseSpeed: 3.5, defenderFreq: 1600, wingerFreq: 3500 },
  { level: 5, name: 'World Cup Final', targetTime: 30, baseSpeed: 4.0, defenderFreq: 1300, wingerFreq: 3000 },
];

// ═══════════════════════════════════════════════════════════════
// PERSPECTIVE HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

const getFieldWidthAtY = (normalizedY: number): number => {
  const minWidth = FIELD_WIDTH * PERSPECTIVE_RATIO;
  const maxWidth = FIELD_WIDTH;
  return minWidth + (maxWidth - minWidth) * normalizedY;
};

const getLaneX = (lane: number, normalizedY: number): number => {
  const fieldWidth = getFieldWidthAtY(normalizedY);
  const gutterWidth = GUTTER_WIDTH * normalizedY;
  const laneAreaWidth = fieldWidth - gutterWidth * 2;
  const laneWidth = laneAreaWidth / LANE_COUNT;
  const fieldLeft = (FIELD_WIDTH - fieldWidth) / 2;

  if (lane === -1) {
    return fieldLeft + gutterWidth / 2;
  } else if (lane === 3) {
    return fieldLeft + fieldWidth - gutterWidth / 2;
  } else {
    return fieldLeft + gutterWidth + laneWidth * lane + laneWidth / 2;
  }
};

const getScaleAtY = (normalizedY: number): number => {
  return 0.25 + normalizedY * 0.75;
};

const getPixelY = (normalizedY: number): number => {
  return HORIZON_Y + normalizedY * (FIELD_HEIGHT - HORIZON_Y);
};

// Get center X position for a lane (0, 1, or 2)
const getLaneCenterX = (lane: 0 | 1 | 2): number => {
  return GUTTER_WIDTH + LANE_WIDTH * lane + LANE_WIDTH / 2;
};

// Get X position for entities (handles both lanes and gutters)
const getEntityX = (lane: number, _normalizedY: number): number => {
  if (lane === -1) return GUTTER_WIDTH / 2;
  if (lane === 3) return FIELD_WIDTH - GUTTER_WIDTH / 2;
  return getLaneCenterX(lane as 0 | 1 | 2);
};

// Pixel Y from normalized (0=top of field, 1=bottom)
const getPixelYFromNormalized = (normalizedY: number): number => {
  return normalizedY * FIELD_HEIGHT;
};

// ============================================
// CLEAN FIELD (no clutter)
// ============================================

const CleanField = ({ scrollOffset }: { scrollOffset: number }) => {
  return (
    <View style={styles.fieldContainer}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1a472a' }]} />
      {Array.from({ length: 8 }).map((_, i) => {
        const stripeHeight = FIELD_HEIGHT / 8;
        const y = i * stripeHeight - (scrollOffset % (stripeHeight * 2));
        return (
          <View
            key={`stripe-${i}`}
            style={{
              position: 'absolute',
              top: y,
              left: 0,
              right: 0,
              height: stripeHeight,
              backgroundColor: i % 2 === 0 ? '#1a472a' : '#1f5233',
            }}
          />
        );
      })}
      {[1, 2].map((divider) => (
        <View key={`div-${divider}`} style={styles.laneDividerColumn}>
          {Array.from({ length: 20 }).map((_, i) => {
            const y = i * 40 - (scrollOffset % 80);
            const normalizedY = Math.max(0, Math.min(1, y / FIELD_HEIGHT));
            const scale = 0.3 + normalizedY * 0.7;
            const xOffset = (FIELD_WIDTH / 3) * divider;
            const perspectiveX = FIELD_WIDTH / 2 + (xOffset - FIELD_WIDTH / 2) * scale;
            return (
              <View
                key={`dash-${divider}-${i}`}
                style={{
                  position: 'absolute',
                  top: y,
                  left: perspectiveX - 2,
                  width: 4 * scale,
                  height: 20 * scale,
                  backgroundColor: 'rgba(255,255,255,0.4)',
                  borderRadius: 2,
                }}
              />
            );
          })}
        </View>
      ))}
      <View style={styles.leftGutter} />
      <View style={styles.rightGutter} />
    </View>
  );
};

// ============================================
// STADIUM ELEMENT COMPONENTS
// ============================================

const GoalPost = () => (
  <View style={styles.goalContainer}>
    <View style={styles.goalFrame}>
      <View style={styles.goalNet}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={`net-v-${i}`} style={[styles.netLineVertical, { left: `${i * 14}%` }]} />
        ))}
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={`net-h-${i}`} style={[styles.netLineHorizontal, { top: `${i * 33}%` }]} />
        ))}
      </View>
      <View style={styles.goalPostLeft} />
      <View style={styles.goalPostRight} />
      <View style={styles.goalCrossbar} />
    </View>
  </View>
);

const FarBleachers = () => (
  <View style={styles.farBleachers}>
    <View style={styles.farBleachersStand} />
    <View style={styles.farFansContainer}>
      {Array.from({ length: 40 }).map((_, i) => (
        <View
          key={`far-fan-${i}`}
          style={[
            styles.farFan,
            {
              left: `${3 + (i % 20) * 4.7}%`,
              top: Math.floor(i / 20) * 10 + 3,
              backgroundColor: ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c'][i % 7],
            },
          ]}
        />
      ))}
    </View>
  </View>
);

const NearBleachers = () => (
  <View style={styles.nearBleachers}>
    <View style={styles.nearBleachersStand} />
    {Array.from({ length: 25 }).map((_, i) => (
      <View
        key={`near-fan-${i}`}
        style={[
          styles.nearFan,
          {
            left: `${2 + (i % 25) * 3.9}%`,
            backgroundColor: ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22'][i % 6],
          },
        ]}
      />
    ))}
    <Text style={styles.crowdCheer}>⚡ VAMOS! ⚡</Text>
  </View>
);

const SideBleachers = ({ side, scrollOffset }: { side: 'left' | 'right'; scrollOffset: number }) => {
  const isLeft = side === 'left';

  return (
    <View style={[styles.sideBleachers, isLeft ? styles.sideBleachersLeft : styles.sideBleachersRight]}>
      {Array.from({ length: 8 }).map((_, i) => {
        const normalizedY = i / 8;
        const pixelY = getPixelY(normalizedY);
        const scale = getScaleAtY(normalizedY);
        const opacity = 0.3 + normalizedY * 0.5;

        return (
          <View
            key={`side-bleacher-${side}-${i}`}
            style={{
              position: 'absolute',
              top: pixelY - (scrollOffset % 60),
              [isLeft ? 'left' : 'right']: 0,
              width: 35 * scale,
              height: 25 * scale,
              backgroundColor: '#4a5568',
              opacity,
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            {[0, 1, 2].map((fi) => (
              <View
                key={`mini-fan-${fi}`}
                style={{
                  position: 'absolute',
                  bottom: 2,
                  left: 3 + fi * 10 * scale,
                  width: 6 * scale,
                  height: 8 * scale,
                  borderRadius: 3 * scale,
                  backgroundColor: ['#e74c3c', '#3498db', '#f1c40f'][fi],
                }}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
};

const SidelineItem = ({
  item,
  scrollOffset,
}: {
  item: SceneryItem;
  scrollOffset: number;
}) => {
  const isLeft = item.side === 'left';

  const baseY = item.yOffset * FIELD_HEIGHT;
  const scrolledY = (baseY + scrollOffset) % (FIELD_HEIGHT + 150);
  const adjustedY = scrolledY - 50;

  if (adjustedY < HORIZON_Y - 20 || adjustedY > FIELD_HEIGHT + 20) return null;

  const normalizedY = Math.max(0, Math.min(1, (adjustedY - HORIZON_Y) / (FIELD_HEIGHT - HORIZON_Y)));
  const scale = getScaleAtY(normalizedY);
  const opacity = 0.4 + normalizedY * 0.6;

  const xPos = isLeft ? 5 : FIELD_WIDTH - 55;

  const renderContent = () => {
    switch (item.type) {
      case 'bench_home':
      case 'bench_away': {
        const isHome = item.type === 'bench_home';
        return (
          <View style={[styles.bench, { transform: [{ scale }] }]}>
            <View style={styles.benchSeat} />
            {[0, 1, 2].map((i) => (
              <View
                key={`sub-${i}`}
                style={[
                  styles.subPlayer,
                  {
                    left: 3 + i * 14,
                    backgroundColor: isHome ? '#3b82f6' : '#ef4444',
                  },
                ]}
              />
            ))}
          </View>
        );
      }
      case 'coach':
        return (
          <View style={[styles.coachContainer, { transform: [{ scale }] }]}>
            <View style={[styles.coachBody, { backgroundColor: isLeft ? '#1e3a5f' : '#5f1e1e' }]} />
            <View style={styles.coachHead} />
            <View style={styles.clipboard} />
          </View>
        );
      case 'flag':
        return (
          <View style={[styles.flagContainer, { transform: [{ scale }] }]}>
            <View style={styles.flagPole} />
            <View style={[styles.flagCloth, { backgroundColor: isLeft ? '#3b82f6' : '#ef4444' }]} />
          </View>
        );
      case 'camera_crew':
        return (
          <View style={[styles.cameraCrewContainer, { transform: [{ scale }] }]}>
            <View style={styles.cameraOperator} />
            <View style={styles.camera} />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View
      style={[
        styles.sidelineItem,
        {
          top: adjustedY,
          left: xPos,
          opacity,
        },
      ]}
    >
      {renderContent()}
    </View>
  );
};

const generateSceneryItems = (): SceneryItem[] => {
  const items: SceneryItem[] = [];
  const types: SceneryItem['type'][] = ['bench_home', 'coach', 'flag', 'bench_away', 'camera_crew'];

  for (let i = 0; i < 10; i++) {
    items.push({
      id: `scenery-left-${i}`,
      type: types[i % types.length],
      side: 'left',
      yOffset: i * 0.15,
    });
    items.push({
      id: `scenery-right-${i}`,
      type: types[(i + 2) % types.length],
      side: 'right',
      yOffset: i * 0.15 + 0.075,
    });
  }

  return items;
};

// ============================================
// GAME ENTITY COMPONENTS
// ============================================

const PlayerSprite = ({ lane }: { lane: 0 | 1 | 2 }) => {
  const centerX = getLaneCenterX(lane);
  return (
    <View
      style={{
        position: 'absolute',
        top: HUD_HEIGHT + FIELD_HEIGHT - PLAYER_BOTTOM_OFFSET - 60,
        left: centerX - 30,
        width: 60,
        height: 70,
        alignItems: 'center',
        zIndex: 50,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: '#fcd5b5',
          borderWidth: 2,
          borderColor: '#22c55e',
        }}
      />
      <View
        style={{
          width: 36,
          height: 32,
          backgroundColor: '#22c55e',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          marginTop: -6,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>10</Text>
      </View>
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: '#fff',
          borderWidth: 2,
          borderColor: '#333',
          marginTop: 2,
        }}
      />
    </View>
  );
};

const EntitySprite = ({ entity }: { entity: Entity }) => {
  let x: number;
  if (entity.lane === -1) {
    x = GUTTER_WIDTH / 2;
  } else if (entity.lane === 3) {
    x = FIELD_WIDTH - GUTTER_WIDTH / 2;
  } else {
    x = getLaneCenterX(entity.lane as 0 | 1 | 2);
  }
  const y = entity.normalizedY * FIELD_HEIGHT;
  const scale = 0.4 + entity.normalizedY * 0.6;
  const isDefender = entity.type === 'defender';
  const color = isDefender ? '#dc2626' : '#3b82f6';
  if (entity.normalizedY < -0.05 || entity.normalizedY > 1.15) return null;
  return (
    <View
      style={{
        position: 'absolute',
        top: y - 25 * scale,
        left: x - 25 * scale,
        width: 50 * scale,
        height: 50 * scale,
        alignItems: 'center',
        zIndex: 30,
      }}
    >
      <View
        style={{
          width: 18 * scale,
          height: 18 * scale,
          borderRadius: 9 * scale,
          backgroundColor: '#fcd5b5',
          borderWidth: 2,
          borderColor: color,
        }}
      />
      <View
        style={{
          width: 28 * scale,
          height: 24 * scale,
          backgroundColor: color,
          borderTopLeftRadius: 14 * scale,
          borderTopRightRadius: 14 * scale,
          marginTop: -4 * scale,
        }}
      />
      {!isDefender && entity.normalizedY < 0.75 && !entity.passed && (
        <View
          style={{
            position: 'absolute',
            top: -20 * scale,
            backgroundColor: '#3b82f6',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 4,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>PASS!</Text>
        </View>
      )}
    </View>
  );
};

const DefenderSprite = ({ entity }: { entity: Entity }) => {
  if (entity.type !== 'defender') return null;
  const pixelY = getPixelYFromNormalized(entity.normalizedY);
  const scale = 0.3 + entity.normalizedY * 0.6;
  const x = getEntityX(entity.lane, entity.normalizedY);
  const size = 40;
  if (entity.normalizedY < -0.05 || entity.normalizedY > 1.1) return null;
  return (
    <View
      style={[
        styles.defenderContainer,
        {
          top: pixelY - size / 2,
          left: x - size / 2,
          transform: [{ scale }],
        },
      ]}
    >
      <View style={styles.defenderBody}>
        <View style={styles.defenderHead} />
        <View style={styles.defenderTorso} />
      </View>
      {entity.normalizedY > 0.7 && (
        <View style={styles.tackleIndicator}>
          <Text style={styles.tackleText}>⚠️</Text>
        </View>
      )}
      <View style={[styles.entityShadow, { transform: [{ scale: 0.8 }] }]} />
    </View>
  );
};

const WingerSprite = ({
  entity,
  isPassable,
}: {
  entity: Entity;
  isPassable: boolean;
}) => {
  if (entity.type !== 'winger') return null;
  const pixelY = getPixelYFromNormalized(entity.normalizedY);
  const scale = 0.3 + entity.normalizedY * 0.6;
  const x = getEntityX(entity.lane, entity.normalizedY);
  const size = 40;
  if (entity.normalizedY < -0.05 || entity.normalizedY > 1.1) return null;
  return (
    <View
      style={[
        styles.wingerContainer,
        {
          top: pixelY - size / 2,
          left: x - size / 2,
          transform: [{ scale }],
        },
      ]}
    >
      <View style={styles.wingerBody}>
        <View style={styles.wingerHead} />
        <View style={styles.wingerTorso} />
        <View style={styles.wingerArm} />
      </View>
      {isPassable && (
        <View style={styles.passPrompt}>
          <Text style={styles.passPromptText}>PASS!</Text>
        </View>
      )}
      {entity.normalizedY > PLAYER_Y && !entity.passed && (
        <View style={styles.missedPrompt}>
          <Text style={styles.missedPromptText}>MISSED</Text>
        </View>
      )}
      <View style={[styles.entityShadow, { backgroundColor: 'rgba(59, 130, 246, 0.3)' }]} />
    </View>
  );
};

const PassingBall = ({
  fromX,
  fromY,
  toX,
  toY,
  progress,
}: {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
}) => {
  const currentX = fromX + (toX - fromX) * progress;
  const currentY = fromY + (toY - fromY) * progress;
  const arc = Math.sin(progress * Math.PI) * 30;

  return (
    <View
      style={[
        styles.passingBall,
        {
          left: currentX - 10,
          top: currentY - arc - 10,
        },
      ]}
    >
      <View style={styles.ballHighlight} />
    </View>
  );
};

const FeedbackPopup = ({ type }: { type: string | null }) => {
  if (!type) return null;
  const config: Record<string, { text: string; color: string }> = {
    pass: { text: '✅ PASS! +100', color: '#22c55e' },
    miss: { text: '❌ MISS!', color: '#ef4444' },
    late: { text: '⏰ LATE!', color: '#f97316' },
    dodge: { text: '👟 DODGE! +50', color: '#3b82f6' },
    collision: { text: '💥 TACKLED!', color: '#ef4444' },
  };
  const { text, color } = config[type] || { text: '', color: '#fff' };
  return (
    <View style={[styles.feedbackPopup, { backgroundColor: color }]}>
      <Text style={styles.feedbackText}>{text}</Text>
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════
// PERSPECTIVE FIELD BACKGROUND COMPONENT
// ═══════════════════════════════════════════════════════════════

const PerspectiveField = ({ scrollOffset }: { scrollOffset: number }) => {
  const skyColor = '#7EC8E3';
  const grassDark = '#2E7D32';
  const grassLight = '#388E3C';
  const lineColor = 'rgba(255,255,255,0.5)';

  const renderLaneLines = () => {
    const lines = [];
    const cycleHeight = FIELD_HEIGHT - HORIZON_Y;
    for (let laneDiv = 1; laneDiv <= 2; laneDiv++) {
      lines.push(
        <View key={`lane-div-${laneDiv}`} style={StyleSheet.absoluteFill}>
          {Array.from({ length: 15 }).map((_, i) => {
            const normalizedY = i / 15;
            const pixelY = getPixelY(normalizedY) - (scrollOffset % 40);
            const scale = getScaleAtY(normalizedY);
            const xPos =
              (getLaneX(laneDiv - 1, normalizedY) + getLaneX(laneDiv, normalizedY)) / 2;
            if (pixelY < HORIZON_Y || pixelY > FIELD_HEIGHT) return null;
            return (
              <View
                key={`dash-${laneDiv}-${i}`}
                style={{
                  position: 'absolute',
                  top: pixelY,
                  left: xPos - 2 * scale,
                  width: 4 * scale,
                  height: 20 * scale,
                  backgroundColor: lineColor,
                  borderRadius: 2,
                }}
              />
            );
          })}
        </View>
      );
    }
    return lines;
  };

  const renderGrassStripes = () => {
    const stripes = [];
    const stripeCount = 12;
    const height = (FIELD_HEIGHT - HORIZON_Y) / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      const topY = HORIZON_Y + (FIELD_HEIGHT - HORIZON_Y) / stripeCount * i;
      stripes.push(
        <View
          key={`stripe-${i}`}
          style={{
            position: 'absolute',
            top: topY - (scrollOffset % (height * 2)),
            left: 0,
            right: 0,
            height,
            backgroundColor: i % 2 === 0 ? grassDark : grassLight,
          }}
        />
      );
    }
    return stripes;
  };

  const renderGutterZones = () => {
    const leftPoints: { x: number; y: number }[] = [];
    const rightPoints: { x: number; y: number }[] = [];
    for (let i = 0; i <= 10; i++) {
      const y = i / 10;
      leftPoints.push({ x: getGutterBoundaryX('left', y), y: getPixelY(y) });
      rightPoints.push({ x: getGutterBoundaryX('right', y), y: getPixelY(y) });
    }

    return (
      <>
        {leftPoints.map((point, i) => {
          if (i === 0) return null;
          const prev = leftPoints[i - 1];
          return (
            <View
              key={`gutter-left-${i}`}
              style={{
                position: 'absolute',
                top: prev.y,
                left: prev.x,
                width: 3,
                height: point.y - prev.y + 2,
                backgroundColor: 'rgba(255,255,255,0.3)',
              }}
            />
          );
        })}
        {rightPoints.map((point, i) => {
          if (i === 0) return null;
          const prev = rightPoints[i - 1];
          return (
            <View
              key={`gutter-right-${i}`}
              style={{
                position: 'absolute',
                top: prev.y,
                left: prev.x,
                width: 3,
                height: point.y - prev.y + 2,
                backgroundColor: 'rgba(255,255,255,0.3)',
              }}
            />
          );
        })}
      </>
    );
  };

  return (
    <View style={styles.fieldContainer}>
      <View style={[styles.sky, { backgroundColor: skyColor }]} />
      <View style={[styles.grassBase, { backgroundColor: grassDark }]}>
        {renderGrassStripes()}
      </View>
      <View style={styles.fieldLines}>
        {renderLaneLines()}
        {renderGutterZones()}
      </View>
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  fieldContainer: {
    position: 'absolute',
    top: HUD_HEIGHT,
    left: 0,
    right: 0,
    height: FIELD_HEIGHT,
    overflow: 'hidden',
  },
  laneDividerColumn: {
    ...StyleSheet.absoluteFillObject,
  },
  leftGutter: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: GUTTER_WIDTH,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  rightGutter: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: GUTTER_WIDTH,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  fieldAreaWrapper: {
    position: 'absolute',
    top: HUD_HEIGHT,
    left: 0,
    right: 0,
    height: FIELD_HEIGHT,
    overflow: 'hidden',
    zIndex: 2,
  },
  sky: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HORIZON_Y + 20,
  },
  grassBase: {
    position: 'absolute',
    top: HORIZON_Y,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  fieldLines: {
    ...StyleSheet.absoluteFillObject,
  },

  goalContainer: {
    position: 'absolute',
    top: HUD_HEIGHT - 15,
    left: '28%',
    right: '28%',
    height: 45,
    alignItems: 'center',
    zIndex: 5,
  },
  goalFrame: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  goalNet: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  netLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  netLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  goalPostLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: '#fff',
    borderRadius: 3,
  },
  goalPostRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: '#fff',
    borderRadius: 3,
  },
  goalCrossbar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: '#fff',
    borderRadius: 3,
  },

  farBleachers: {
    position: 'absolute',
    top: HORIZON_Y - 35,
    left: '10%',
    right: '10%',
    height: 30,
    zIndex: 3,
  },
  farBleachersStand: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: '#374151',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  farFansContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 5,
  },
  farFan: {
    position: 'absolute',
    width: 6,
    height: 8,
    borderRadius: 3,
  },

  nearBleachers: {
    position: 'absolute',
    bottom: CONTROLS_HEIGHT,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: '#374151',
    borderTopWidth: 3,
    borderTopColor: '#4B5563',
    zIndex: 10,
  },
  nearBleachersStand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 15,
    backgroundColor: '#4B5563',
  },
  nearFan: {
    position: 'absolute',
    bottom: 8,
    width: 10,
    height: 16,
    borderRadius: 5,
  },
  crowdCheer: {
    position: 'absolute',
    right: 15,
    top: 12,
    color: '#fbbf24',
    fontWeight: 'bold',
    fontSize: 13,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },

  sideBleachers: {
    position: 'absolute',
    top: HORIZON_Y,
    bottom: 0,
    width: 40,
    zIndex: 4,
  },
  sideBleachersLeft: {
    left: 0,
  },
  sideBleachersRight: {
    right: 0,
  },

  sidelineItem: {
    position: 'absolute',
    width: 50,
    height: 40,
    zIndex: 6,
  },
  bench: {
    width: 45,
    height: 22,
    backgroundColor: '#8B4513',
    borderRadius: 3,
    position: 'relative',
  },
  benchSeat: {
    position: 'absolute',
    bottom: 0,
    left: 2,
    right: 2,
    height: 7,
    backgroundColor: '#A0522D',
    borderRadius: 2,
  },
  subPlayer: {
    position: 'absolute',
    top: -10,
    width: 10,
    height: 14,
    borderRadius: 5,
  },
  coachContainer: {
    width: 25,
    height: 35,
    alignItems: 'center',
  },
  coachBody: {
    width: 18,
    height: 22,
    borderRadius: 4,
    marginTop: 10,
  },
  coachHead: {
    position: 'absolute',
    top: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fcd5b5',
  },
  clipboard: {
    position: 'absolute',
    bottom: 8,
    right: 0,
    width: 8,
    height: 10,
    backgroundColor: '#fff',
    borderRadius: 1,
  },
  flagContainer: {
    width: 20,
    height: 40,
    alignItems: 'center',
  },
  flagPole: {
    width: 3,
    height: 35,
    backgroundColor: '#9CA3AF',
  },
  flagCloth: {
    position: 'absolute',
    top: 2,
    left: 5,
    width: 18,
    height: 12,
    borderRadius: 2,
  },
  cameraCrewContainer: {
    width: 30,
    height: 30,
    alignItems: 'center',
  },
  cameraOperator: {
    width: 12,
    height: 18,
    backgroundColor: '#1f2937',
    borderRadius: 3,
  },
  camera: {
    position: 'absolute',
    top: 5,
    right: 0,
    width: 15,
    height: 10,
    backgroundColor: '#374151',
    borderRadius: 2,
  },

  player: {
    position: 'absolute',
    width: PLAYER_SIZE,
    height: PLAYER_SIZE + 15,
    alignItems: 'center',
    zIndex: 50,
  },
  playerHead: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fcd5b5',
    borderWidth: 2,
    borderColor: '#22c55e',
  },
  playerBody: {
    width: 30,
    height: 28,
    backgroundColor: '#22c55e',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    marginTop: -4,
  },
  playerBall: {
    position: 'absolute',
    bottom: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#333',
  },
  ballHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  playerShadow: {
    position: 'absolute',
    bottom: -5,
    width: 40,
    height: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 20,
  },

  defenderContainer: {
    position: 'absolute',
    width: 50,
    height: 55,
    alignItems: 'center',
    zIndex: 30,
  },
  defenderBody: {
    width: 50,
    height: 50,
    alignItems: 'center',
  },
  defenderHead: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fcd5b5',
    borderWidth: 2,
    borderColor: '#dc2626',
  },
  defenderTorso: {
    width: 32,
    height: 26,
    backgroundColor: '#dc2626',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: -4,
    borderWidth: 2,
    borderColor: '#b91c1c',
  },
  tackleIndicator: {
    position: 'absolute',
    top: -20,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tackleText: {
    fontSize: 12,
  },
  entityShadow: {
    position: 'absolute',
    bottom: -3,
    width: 35,
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 17,
  },

  wingerContainer: {
    position: 'absolute',
    width: 50,
    height: 60,
    alignItems: 'center',
    zIndex: 30,
  },
  wingerBody: {
    width: 50,
    height: 50,
    alignItems: 'center',
  },
  wingerHead: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fcd5b5',
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  wingerTorso: {
    width: 32,
    height: 26,
    backgroundColor: '#3b82f6',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: -4,
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  wingerArm: {
    position: 'absolute',
    top: 20,
    right: -5,
    width: 12,
    height: 5,
    backgroundColor: '#3b82f6',
    borderRadius: 2,
    transform: [{ rotate: '-30deg' }],
  },
  passPrompt: {
    position: 'absolute',
    top: -28,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  passPromptText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  missedPrompt: {
    position: 'absolute',
    top: -25,
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  missedPromptText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },

  passingBall: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#333',
    zIndex: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },

  testControls: {
    position: 'absolute',
    bottom: CONTROLS_HEIGHT + 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    zIndex: 100,
  },
  testButton: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 25,
    paddingVertical: 15,
    borderRadius: 10,
  },
  testButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  quitTestButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: '#ef4444',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    zIndex: 100,
  },
  feedbackPopup: {
    position: 'absolute',
    top: '35%',
    alignSelf: 'center',
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 12,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  feedbackText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 80,
  },
  gameTitle: {
    fontSize: 38,
    fontWeight: 'bold',
    color: '#22c55e',
    marginBottom: 5,
  },
  gameSubtitle: {
    fontSize: 18,
    color: '#94a3b8',
    marginBottom: 20,
  },
  levelBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#334155',
  },
  levelBadgeText: {
    fontSize: 16,
    color: '#f97316',
    fontWeight: 'bold',
  },
  levelName: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  targetInfo: {
    marginBottom: 20,
  },
  targetText: {
    fontSize: 14,
    color: '#cbd5e1',
    textAlign: 'center',
    marginBottom: 5,
  },
  instructionsBox: {
    backgroundColor: '#1e293b',
    padding: 15,
    borderRadius: 10,
    marginBottom: 25,
    width: '90%',
  },
  instructionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#f97316',
    marginBottom: 10,
    textAlign: 'center',
  },
  instruction: {
    fontSize: 13,
    color: '#e2e8f0',
    marginBottom: 6,
    textAlign: 'center',
  },
  startButton: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 50,
    paddingVertical: 18,
    borderRadius: 14,
    marginBottom: 15,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  backButton: {
    padding: 12,
  },
  backButtonText: {
    color: '#64748b',
    fontSize: 16,
  },

  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 90,
  },
  countdownText: {
    fontSize: 100,
    fontWeight: 'bold',
    color: '#f97316',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 10,
  },

  collisionTitle: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#ef4444',
    marginBottom: 10,
  },
  collisionSubtitle: {
    fontSize: 18,
    color: '#94a3b8',
    marginBottom: 25,
  },
  collisionStats: {
    marginBottom: 25,
  },
  collisionStat: {
    fontSize: 16,
    color: '#e2e8f0',
    marginBottom: 8,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#f97316',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 15,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },

  scoutTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#22c55e',
    marginBottom: 5,
  },
  scoutSubtitle: {
    fontSize: 18,
    color: '#fbbf24',
    marginBottom: 15,
  },
  starsContainer: {
    marginBottom: 20,
  },
  starsText: {
    fontSize: 36,
  },
  scoutCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 18,
    width: '95%',
    maxWidth: 340,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: '#334155',
  },
  scoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  scoutRowHighlight: {
    borderBottomWidth: 0,
    marginTop: 5,
  },
  scoutLabel: {
    fontSize: 15,
    color: '#94a3b8',
  },
  scoutValue: {
    fontSize: 15,
    color: '#fff',
    fontWeight: 'bold',
  },
  scoutLabelBig: {
    fontSize: 18,
    color: '#fbbf24',
    fontWeight: 'bold',
  },
  scoutValueBig: {
    fontSize: 22,
    color: '#fbbf24',
    fontWeight: 'bold',
  },
  xpEarned: {
    fontSize: 20,
    color: '#22c55e',
    fontWeight: 'bold',
    marginBottom: 20,
  },
  continueButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 50,
    paddingVertical: 16,
    borderRadius: 12,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },

  hud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HUD_HEIGHT,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    paddingHorizontal: 15,
    paddingTop: 8,
    zIndex: 70,
  },
  hudTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  hudStat: {
    alignItems: 'center',
  },
  hudLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
  },
  hudValue: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  hudValueUrgent: {
    color: '#ef4444',
  },
  hudBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreLabel: {
    fontSize: 12,
    color: '#fbbf24',
    fontWeight: 'bold',
  },
  scoreValue: {
    fontSize: 20,
    color: '#fbbf24',
    fontWeight: 'bold',
  },
  comboContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(249, 115, 22, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
  },
  comboLabel: {
    fontSize: 12,
    color: '#f97316',
  },
  comboValue: {
    fontSize: 14,
    color: '#f97316',
    fontWeight: 'bold',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    marginTop: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#22c55e',
  },

  controlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 130,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingBottom: 30,
    paddingTop: 10,
    zIndex: 9999,
    elevation: 10,
  },
  arrowButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#475569',
  },
  arrowText: {
    fontSize: 32,
    color: '#fff',
  },
  passButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f97316',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fb923c',
  },
  passButtonText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },

  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: CONTROLS_HEIGHT,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingBottom: 25,
    paddingTop: 10,
    borderTopWidth: 2,
    borderTopColor: '#1e293b',
  },
  controlButton: {
    width: 75,
    height: 75,
    borderRadius: 37,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  controlBtn: {
    width: 75,
    height: 75,
    borderRadius: 37,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  controlBtnText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  passBtn: {
    width: 95,
    height: 95,
    borderRadius: 47,
    backgroundColor: '#f97316',
    borderColor: '#fb923c',
  },
  passBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  passButtonControl: {
    width: 95,
    height: 95,
    borderRadius: 47,
    backgroundColor: '#f97316',
    borderColor: '#fb923c',
  },
  passButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  quitButton: {
    position: 'absolute',
    top: 12,
    right: 15,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
});

// ═══════════════════════════════════════════════════════════════
// COMPONENT SHELL
// ═══════════════════════════════════════════════════════════════

export default function DribbleRushGame({
  config,
  levelNumber,
  xpReward,
  onComplete,
  onQuit,
}: {
  config: DribbleRushConfig;
  levelNumber: number;
  xpReward: number;
  onComplete: (result: GameResult, durationSeconds: number) => void;
  onQuit: () => void;
}) {
  const levelConfig = LEVEL_CONFIGS[Math.min(levelNumber - 1, LEVEL_CONFIGS.length - 1)];

  const [phase, setPhase] = useState<GamePhase>('ready');
  const [countdown, setCountdown] = useState(3);
  const [playerLane, setPlayerLane] = useState<PlayerLane>(1);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [sceneryItems] = useState<SceneryItem[]>(() => generateSceneryItems());
  const [scrollOffset, setScrollOffset] = useState(0);

  const [currentSpeed, setCurrentSpeed] = useState(levelConfig.baseSpeed);
  const [distance, setDistance] = useState(0);
  const [topSpeed, setTopSpeed] = useState(levelConfig.baseSpeed);

  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [dodges, setDodges] = useState(0);
  const [passesAttempted, setPassesAttempted] = useState(0);
  const [passesCompleted, setPassesCompleted] = useState(0);

  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  const [feedback, setFeedback] = useState<{
    type: 'pass' | 'miss' | 'late' | 'dodge' | 'collision' | null;
    visible: boolean;
  }>({ type: null, visible: false });
  const [passingBall, setPassingBall] = useState<{
    active: boolean;
    fromX: number;
    toX: number;
    fromY: number;
    toY: number;
    progress: number;
  } | null>(null);
  const [levelSuccess, setLevelSuccess] = useState(false);

  const speedRef = useRef(levelConfig.baseSpeed);
  const entitiesRef = useRef<Entity[]>([]);
  const lastDefenderSpawnRef = useRef(0);
  const lastWingerSpawnRef = useRef(0);
  const playerLaneRef = useRef<PlayerLane>(1);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    playerLaneRef.current = playerLane;
  }, [playerLane]);

  useEffect(() => {
    entitiesRef.current = entities;
  }, [entities]);

  if (__DEV__) {
    console.log('=== RENDER ===', { phase, playerLane, entitiesCount: entities.length });
  }

  const showFeedback = useCallback((type: 'pass' | 'miss' | 'late' | 'dodge' | 'collision') => {
    setFeedback({ type, visible: true });
    setTimeout(() => setFeedback({ type: null, visible: false }), 700);
  }, []);

  const spawnDefender = useCallback(() => {
    const lane = Math.floor(Math.random() * 3) as 0 | 1 | 2;
    const defender: Entity = {
      id: `def-${Date.now()}`,
      type: 'defender',
      lane,
      normalizedY: 0.05,
      passed: false,
    };
    setEntities((prev) => [...prev, defender]);
  }, []);

  const spawnWinger = useCallback(() => {
    const gutterLane = Math.random() > 0.5 ? -1 : 3;
    const winger: Entity = {
      id: `wing-${Date.now()}`,
      type: 'winger',
      lane: gutterLane,
      normalizedY: 0.05,
      passed: false,
    };
    setEntities((prev) => [...prev, winger]);
  }, []);

  const handlePassSuccess = useCallback(
    (winger: Entity) => {
      const playerX = getLaneCenterX(playerLaneRef.current);
      const wingerX = getEntityX(winger.lane, winger.normalizedY);
      const playerPixelY = getPixelYFromNormalized(PLAYER_Y);
      const wingerPixelY = getPixelYFromNormalized(winger.normalizedY);
      setPassingBall({
        active: true,
        fromX: playerX,
        toX: wingerX,
        fromY: playerPixelY,
        toY: wingerPixelY,
        progress: 0,
      });
      let progress = 0;
      const animInterval = setInterval(() => {
        progress += 0.1;
        if (progress <= 0.5) {
          setPassingBall({
            active: true,
            fromX: playerX,
            toX: wingerX,
            fromY: playerPixelY,
            toY: wingerPixelY,
            progress: progress * 2,
          });
        } else if (progress <= 1) {
          setPassingBall({
            active: true,
            fromX: wingerX,
            toX: playerX,
            fromY: wingerPixelY,
            toY: playerPixelY,
            progress: (progress - 0.5) * 2,
          });
        } else {
          clearInterval(animInterval);
          setPassingBall(null);
        }
      }, 30);
      setScore((s) => s + 100);
      setCombo((c) => c + 1);
      setPassesCompleted((p) => p + 1);
      speedRef.current = Math.min(speedRef.current + 0.3, MAX_SPEED);
      setEntities((prev) => prev.filter((e) => e.id !== winger.id));
      showFeedback('pass');
    },
    [showFeedback]
  );

  const handlePassLate = useCallback(() => {
    setScore((s) => Math.max(0, s - 25));
    setCombo(0);
    speedRef.current = Math.max(speedRef.current * 0.6, BASE_SPEED * 0.5);
    showFeedback('late');
  }, [showFeedback]);

  const handlePassMiss = useCallback(() => {
    setCombo(0);
    speedRef.current = Math.max(speedRef.current * 0.8, BASE_SPEED * 0.5);
    showFeedback('miss');
  }, [showFeedback]);

  const handlePass = useCallback(() => {
    if (phase !== 'playing') return;
    setPassesAttempted((p) => p + 1);
    const validWinger = entitiesRef.current.find(
      (e) =>
        e.type === 'winger' &&
        e.normalizedY > 0.1 &&
        e.normalizedY < 0.75 &&
        !e.passed
    );
    if (validWinger) {
      handlePassSuccess(validWinger);
    } else {
      const lateWinger = entitiesRef.current.find(
        (e) => e.type === 'winger' && e.normalizedY >= 0.75 && !e.passed
      );
      if (lateWinger) {
        handlePassLate();
      } else {
        handlePassMiss();
      }
    }
  }, [phase, handlePassSuccess, handlePassLate, handlePassMiss]);

  const handleCollision = useCallback(() => {
    setPhase('collision');
    showFeedback('collision');
  }, [showFeedback]);

  const moveLeft = useCallback(() => {
    if (phase !== 'playing') return;
    setPlayerLane((prev) => {
      const newLane = Math.max(0, prev - 1) as 0 | 1 | 2;
      return newLane;
    });
  }, [phase]);

  const moveRight = useCallback(() => {
    if (phase !== 'playing') return;
    setPlayerLane((prev) => {
      const newLane = Math.min(2, prev + 1) as 0 | 1 | 2;
      return newLane;
    });
  }, [phase]);

  const startGame = useCallback(() => {
    setPhase('countdown');
    setCountdown(3);
    setPlayerLane(1);
    setEntities([]);
    setScrollOffset(0);
    setCurrentSpeed(levelConfig.baseSpeed);
    speedRef.current = levelConfig.baseSpeed;
    setDistance(0);
    setTopSpeed(levelConfig.baseSpeed);
    setScore(0);
    setCombo(0);
    setDodges(0);
    setPassesAttempted(0);
    setPassesCompleted(0);
    setElapsedTime(0);
    setStartTime(null);
    startTimeRef.current = null;
    setLevelSuccess(false);
    lastDefenderSpawnRef.current = 0;
    lastWingerSpawnRef.current = 0;
  }, [levelConfig.baseSpeed]);

  const completeLevel = useCallback(
    (success: boolean) => {
      const start = startTimeRef.current ?? Date.now();
      const duration = (Date.now() - start) / 1000;
      const passAccuracy =
        passesAttempted > 0 ? Math.round((passesCompleted / passesAttempted) * 100) : 0;

      onComplete(
        {
          score: Math.round(score),
          accuracy: Math.round(passAccuracy),
          xpEarned: success ? Math.floor(xpReward) : Math.floor(xpReward * 0.25),
          isPerfect: passesAttempted > 0 && passesCompleted === passesAttempted,
          levelCompleted: success,
          newHighScore: false,
        },
        Math.round(duration)
      );

      setLevelSuccess(success);
      setPhase('finished');
    },
    [
      startTime,
      passesAttempted,
      passesCompleted,
      score,
      distance,
      topSpeed,
      dodges,
      combo,
      xpReward,
      onComplete,
    ]
  );

  useEffect(() => {
    if (phase !== 'countdown') return;

    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setPhase('playing');
      const now = Date.now();
      setStartTime(now);
      startTimeRef.current = now;
    }
  }, [phase, countdown]);

  useEffect(() => {
    if (phase !== 'playing') return;

    const gameLoop = setInterval(() => {
      const now = Date.now();
      const start = startTimeRef.current ?? now;
      const elapsed = (now - start) / 1000;
      if (__DEV__) {
        console.log('Game loop tick, entities:', entitiesRef.current.length);
      }

      speedRef.current = Math.min(speedRef.current + ACCELERATION, MAX_SPEED);
      setCurrentSpeed(speedRef.current);
      setTopSpeed((prev) => Math.max(prev, speedRef.current));

      setDistance((d) => d + speedRef.current * 0.3);
      setElapsedTime(elapsed);
      setScrollOffset((s) => s + speedRef.current * 1.5);

      const defenderInterval =
        levelConfig.defenderFreq / (speedRef.current / levelConfig.baseSpeed);
      if (now - lastDefenderSpawnRef.current > defenderInterval) {
        spawnDefender();
        lastDefenderSpawnRef.current = now;
      }

      const wingerInterval =
        levelConfig.wingerFreq / (speedRef.current / levelConfig.baseSpeed);
      if (now - lastWingerSpawnRef.current > wingerInterval) {
        spawnWinger();
        lastWingerSpawnRef.current = now;
      }

      const PLAYER_NORM_Y = 0.82;
      const COLLISION_Y_THRESHOLD = 0.08;
      const MOVE_SPEED = speedRef.current * 0.015;

      setEntities((prev) => {
        const updated: Entity[] = [];

        for (const entity of prev) {
          const newY = entity.normalizedY + MOVE_SPEED;

          if (entity.type === 'defender' && !entity.passed) {
            if (entity.lane >= 0 && entity.lane <= 2) {
              if (Math.abs(newY - PLAYER_NORM_Y) < COLLISION_Y_THRESHOLD) {
                if (entity.lane === playerLaneRef.current) {
                  setPhase('collision');
                  showFeedback('collision');
                  return [];
                }
              }
              if (newY > PLAYER_NORM_Y + 0.1) {
                setScore((s) => s + 50);
                setCombo((c) => c + 1);
                setDodges((d) => d + 1);
                showFeedback('dodge');
                updated.push({ ...entity, normalizedY: newY, passed: true });
                continue;
              }
            }
          }

          if (
            entity.type === 'winger' &&
            !entity.passed &&
            newY > PLAYER_Y + 0.1
          ) {
            speedRef.current = Math.max(
              speedRef.current * 0.85,
              levelConfig.baseSpeed * 0.5
            );
            updated.push({ ...entity, normalizedY: newY, passed: true });
            continue;
          }

          if (newY < 1.2) {
            updated.push({ ...entity, normalizedY: newY });
          }
        }

        return updated;
      });

      if (elapsed >= levelConfig.targetTime) {
        completeLevel(true);
      }
    }, FRAME_MS);

    return () => clearInterval(gameLoop);
  }, [
    phase,
    levelConfig.targetTime,
    levelConfig.baseSpeed,
    levelConfig.defenderFreq,
    levelConfig.wingerFreq,
    spawnDefender,
    spawnWinger,
    completeLevel,
    showFeedback,
  ]);

  const isWingerPassable = (entity: Entity) => {
    return (
      entity.type === 'winger' &&
      entity.normalizedY > 0.15 &&
      entity.normalizedY < PLAYER_Y - 0.05 &&
      !entity.passed
    );
  };

  if (phase === 'ready') {
    return (
      <View style={styles.container}>
        <CleanField scrollOffset={0} />
        <GoalPost />

        <View style={styles.overlay}>
          <Text style={styles.gameTitle}>⚽ DRIBBLE RUSH</Text>
          <Text style={styles.gameSubtitle}>Stadium Runner</Text>

          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>Level {levelNumber}</Text>
            <Text style={styles.levelName}>{levelConfig.name}</Text>
          </View>

          <View style={styles.targetInfo}>
            <Text style={styles.targetText}>🎯 Target: {levelConfig.targetTime} seconds</Text>
            <Text style={styles.targetText}>⚡ Starting Speed: {levelConfig.baseSpeed}x</Text>
          </View>

          <View style={styles.instructionsBox}>
            <Text style={styles.instructionTitle}>HOW TO PLAY</Text>
            <Text style={styles.instruction}>◀️ ▶️ Dodge defenders in lanes</Text>
            <Text style={styles.instruction}>🔵 Pass to wingers on the sides</Text>
            <Text style={styles.instruction}>⚠️ Pass BEFORE they pass you!</Text>
          </View>

          <TouchableOpacity style={styles.startButton} onPress={startGame}>
            <Text style={styles.startButtonText}>START RUN</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backButton} onPress={onQuit}>
            <Text style={styles.backButtonText}>← Back to Games</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (phase === 'countdown') {
    return (
      <View style={styles.container}>
        <CleanField scrollOffset={0} />
        <GoalPost />
        <View style={styles.fieldAreaWrapper}>
          <PlayerSprite lane={playerLane} />
        </View>

        <View style={styles.countdownOverlay}>
          <Text style={styles.countdownText}>{countdown || 'GO!'}</Text>
        </View>
      </View>
    );
  }

  if (phase === 'collision') {
    return (
      <View style={styles.container}>
        <CleanField scrollOffset={scrollOffset} />
        <GoalPost />

        <View style={styles.overlay}>
          <Text style={styles.collisionTitle}>💥 TACKLED!</Text>
          <Text style={styles.collisionSubtitle}>A defender got you!</Text>

          <View style={styles.collisionStats}>
            <Text style={styles.collisionStat}>Distance: {Math.floor(distance)}m</Text>
            <Text style={styles.collisionStat}>Score: {score}</Text>
            <Text style={styles.collisionStat}>
              Time: {elapsedTime.toFixed(1)}s / {levelConfig.targetTime}s
            </Text>
          </View>

          <TouchableOpacity style={styles.retryButton} onPress={startGame}>
            <Text style={styles.retryButtonText}>🔄 TRY AGAIN</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backButton} onPress={() => completeLevel(false)}>
            <Text style={styles.backButtonText}>← Quit</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (phase === 'finished') {
    const passAccuracy =
      passesAttempted > 0 ? Math.round((passesCompleted / passesAttempted) * 100) : 100;
    const success = levelSuccess;
    const stars = score >= 2000 ? 3 : score >= 1000 ? 2 : 1;

    return (
      <View style={styles.container}>
        <CleanField scrollOffset={scrollOffset} />
        <GoalPost />

        <View style={styles.overlay}>
          <Text style={styles.scoutTitle}>📋 SCOUT REPORT</Text>
          <Text style={styles.scoutSubtitle}>
            {success ? '✅ LEVEL COMPLETE!' : '⏱️ Time Expired'}
          </Text>

          <View style={styles.starsContainer}>
            <Text style={styles.starsText}>{'⭐'.repeat(stars)}{'☆'.repeat(3 - stars)}</Text>
          </View>

          <View style={styles.scoutCard}>
            <View style={styles.scoutRow}>
              <Text style={styles.scoutLabel}>📏 Distance</Text>
              <Text style={styles.scoutValue}>{Math.floor(distance)}m</Text>
            </View>
            <View style={styles.scoutRow}>
              <Text style={styles.scoutLabel}>⚡ Top Speed</Text>
              <Text style={styles.scoutValue}>{topSpeed.toFixed(1)}x</Text>
            </View>
            <View style={styles.scoutRow}>
              <Text style={styles.scoutLabel}>🎯 Pass Accuracy</Text>
              <Text style={styles.scoutValue}>{passAccuracy}%</Text>
            </View>
            <View style={styles.scoutRow}>
              <Text style={styles.scoutLabel}>👟 Dodges</Text>
              <Text style={styles.scoutValue}>{dodges}</Text>
            </View>
            <View style={styles.scoutRow}>
              <Text style={styles.scoutLabel}>🔥 Best Combo</Text>
              <Text style={styles.scoutValue}>{combo}x</Text>
            </View>
            <View style={[styles.scoutRow, styles.scoutRowHighlight]}>
              <Text style={styles.scoutLabelBig}>🏆 SCORE</Text>
              <Text style={styles.scoutValueBig}>{score}</Text>
            </View>
          </View>

          <Text style={styles.xpEarned}>
            +{success ? xpReward : Math.floor(xpReward * 0.25)} XP
          </Text>

          <TouchableOpacity style={styles.continueButton} onPress={onQuit}>
            <Text style={styles.continueButtonText}>CONTINUE</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const timeRemaining = Math.max(0, levelConfig.targetTime - elapsedTime);
  const progressPercent = Math.min(100, (elapsedTime / levelConfig.targetTime) * 100);

  return (
    <View style={styles.container}>
      <CleanField scrollOffset={scrollOffset} />
      <GoalPost />

      <View style={styles.hud}>
        <View style={styles.hudTop}>
          <View style={styles.hudStat}>
            <Text style={styles.hudLabel}>DISTANCE</Text>
            <Text style={styles.hudValue}>{Math.floor(distance)}m</Text>
          </View>
          <View style={styles.hudStat}>
            <Text style={styles.hudLabel}>SPEED</Text>
            <Text style={styles.hudValue}>{currentSpeed.toFixed(1)}x</Text>
          </View>
          <View style={styles.hudStat}>
            <Text style={styles.hudLabel}>TIME</Text>
            <Text
              style={[styles.hudValue, timeRemaining < 10 && styles.hudValueUrgent]}
            >
              {timeRemaining.toFixed(1)}s
            </Text>
          </View>
        </View>

        <View style={styles.hudBottom}>
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreLabel}>SCORE</Text>
            <Text style={styles.scoreValue}>{score}</Text>
          </View>
          {combo >= 3 && (
            <View style={styles.comboContainer}>
              <Text style={styles.comboLabel}>🔥 COMBO</Text>
              <Text style={styles.comboValue}>{combo}x</Text>
            </View>
          )}
        </View>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
      </View>

      <View style={styles.fieldAreaWrapper}>
        {entities.map((entity) => (
          <EntitySprite key={entity.id} entity={entity} />
        ))}
      </View>

      <PlayerSprite lane={playerLane} />

      {passingBall?.active && (
        <View
          style={[
            styles.passingBall,
            {
              left: passingBall.fromX + (passingBall.toX - passingBall.fromX) * passingBall.progress - 10,
              top:
                passingBall.fromY +
                (passingBall.toY - passingBall.fromY) * passingBall.progress -
                Math.sin(passingBall.progress * Math.PI) * 20 -
                10,
            },
          ]}
        >
          <View style={styles.ballHighlight} />
        </View>
      )}

      {feedback.visible && <FeedbackPopup type={feedback.type} />}

      <View style={styles.controlsContainer} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.arrowButton}
          onPressIn={() => {
            if (__DEV__) console.log('LEFT PRESSED');
            if (phase === 'playing') {
              setPlayerLane((prev) => Math.max(0, prev - 1) as 0 | 1 | 2);
            }
          }}
          activeOpacity={0.5}
        >
          <Text style={styles.arrowText}>◀</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.passButton}
          onPressIn={() => {
            if (__DEV__) console.log('PASS PRESSED');
            if (phase === 'playing') {
              handlePass();
            }
          }}
          activeOpacity={0.5}
        >
          <Text style={styles.passButtonText}>PASS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.arrowButton}
          onPressIn={() => {
            if (__DEV__) console.log('RIGHT PRESSED');
            if (phase === 'playing') {
              setPlayerLane((prev) => Math.min(2, prev + 1) as 0 | 1 | 2);
            }
          }}
          activeOpacity={0.5}
        >
          <Text style={styles.arrowText}>▶</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.quitButton} onPress={onQuit}>
        <Feather name="x" size={24} color="#ef4444" />
      </TouchableOpacity>
    </View>
  );
}
