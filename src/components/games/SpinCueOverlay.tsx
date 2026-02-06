import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

const SPIN_INFO: Record<string, { icon: string; color: string; label: string; behavior: string }> = {
  none: { icon: '●', color: '#ffffff', label: 'No Spin', behavior: 'Straight path' },
  topspin: { icon: '🔴', color: '#ef4444', label: 'TOPSPIN', behavior: 'Ball DIPS down and speeds up' },
  backspin: { icon: '🔵', color: '#3b82f6', label: 'BACKSPIN', behavior: 'Ball FLOATS and slows down' },
  curve_right: { icon: '🟣', color: '#a855f7', label: 'CURVES RIGHT', behavior: 'Ball bends to the RIGHT' },
  curve_left: { icon: '🟠', color: '#f59e0b', label: 'CURVES LEFT', behavior: 'Ball bends to the LEFT' },
  knuckle: { icon: '🩷', color: '#ec4899', label: 'KNUCKLEBALL', behavior: 'Unpredictable movement!' },
  variable: { icon: '❓', color: '#94a3b8', label: 'VARIABLE', behavior: 'Changes after bounce' },
  changes: { icon: '🔄', color: '#06b6d4', label: 'CHANGING', behavior: 'Direction changes on contact' },
};

const ROUND_HINT_CONFIG: Record<number, { showText: boolean; duration: number; iconSize: number }> = {
  1: { showText: true, duration: 2000, iconSize: 48 },
  2: { showText: true, duration: 1000, iconSize: 36 },
  3: { showText: false, duration: 800, iconSize: 24 },
  4: { showText: false, duration: 300, iconSize: 20 },
};

interface SpinCueOverlayProps {
  spinType: string;
  roundNumber: number;
  visible: boolean;
  onComplete: () => void;
}

export default function SpinCueOverlay({
  spinType,
  roundNumber,
  visible,
  onComplete,
}: SpinCueOverlayProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const spinKey = spinType?.toLowerCase().replace(/-/g, '_') || 'none';
  const info = SPIN_INFO[spinKey] ?? SPIN_INFO.none;
  const roundConfig = ROUND_HINT_CONFIG[roundNumber];

  useEffect(() => {
    if (!visible) return;

    // Round 5: no cues, complete immediately
    if (roundNumber >= 5) {
      onComplete();
      return;
    }

    const config = roundConfig ?? ROUND_HINT_CONFIG[1];

    // Fade in over 200ms
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    // Auto-dismiss after duration
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => onComplete());
    }, config.duration);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, roundNumber, spinType, onComplete, opacity]);

  if (!visible || roundNumber >= 5) return null;

  const config = roundConfig ?? ROUND_HINT_CONFIG[1];
  const { showText, iconSize } = config;

  return (
    <Animated.View style={[styles.overlay, { opacity }]} pointerEvents="none">
      <View style={[styles.card, { borderColor: info.color }]}>
        <Text style={[styles.icon, { fontSize: iconSize }]}>{info.icon}</Text>
        {showText && (
          <>
            <Text style={[styles.label, { color: info.color }]}>{info.label}</Text>
            <Text style={styles.behavior}>{info.behavior}</Text>
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  card: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderWidth: 3,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    minWidth: 200,
  },
  icon: {
    marginBottom: 8,
  },
  label: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  behavior: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
});
