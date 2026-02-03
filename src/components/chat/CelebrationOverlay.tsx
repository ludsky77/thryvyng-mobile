import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type CelebrationType = 'birthday' | 'goal' | 'celebrate';

interface CelebrationOverlayProps {
  type: CelebrationType;
  visible: boolean;
  onComplete: () => void;
}

export function CelebrationOverlay({
  type,
  visible,
  onComplete,
}: CelebrationOverlayProps) {
  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <ConfettiCannon
        count={200}
        origin={{ x: SCREEN_WIDTH / 2, y: -20 }}
        fadeOut
        autoStart={true}
        explosionSpeed={350}
        fallSpeed={3000}
        onAnimationEnd={onComplete}
      />
      {type === 'birthday' && (
        <View style={styles.messageOverlay}>
          <Text style={styles.celebrationText}>🎂 Happy Birthday! 🎉</Text>
        </View>
      )}
      {type === 'goal' && (
        <View style={styles.messageOverlay}>
          <Text style={styles.celebrationText}>⚽ GOAL! 🎉</Text>
        </View>
      )}
      {type === 'celebrate' && (
        <View style={styles.messageOverlay}>
          <Text style={styles.celebrationText}>🎉 Celebrate! 🎉</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  messageOverlay: {
    position: 'absolute',
    top: '30%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrationText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
});
