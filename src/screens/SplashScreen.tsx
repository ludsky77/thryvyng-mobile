import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  Dimensions,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const SPLASH_BACKGROUND = require('../../assets/splash-background.png');
const SPLASH_ICON = require('../../assets/splash-icon.png');

interface SplashScreenProps {
  onFinish?: () => void;
  isReady?: boolean;
}

export default function SplashScreen({ onFinish, isReady = false }: SplashScreenProps) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(15)).current;
  const lineOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const dot1Opacity = useRef(new Animated.Value(0.3)).current;
  const dot2Opacity = useRef(new Animated.Value(0.3)).current;
  const dot3Opacity = useRef(new Animated.Value(0.3)).current;

  const minDisplayTime = 2500;
  const safetyTimeout = 10000;
  const hasCalledFinish = useRef(false);
  const minElapsed = useRef(false);

  const tryFinish = () => {
    if (hasCalledFinish.current || !onFinish) return;
    hasCalledFinish.current = true;
    onFinish();
  };

  useEffect(() => {
    const minTimer = setTimeout(() => {
      minElapsed.current = true;
      if (isReady) {
        tryFinish();
      }
    }, minDisplayTime);

    const safetyTimer = setTimeout(() => {
      tryFinish();
    }, safetyTimeout);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(safetyTimer);
    };
  }, []);

  useEffect(() => {
    if (isReady && minElapsed.current) {
      tryFinish();
    }
  }, [isReady]);

  useEffect(() => {
    // Step 1 (0-600ms): Logo fade in + scale
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Step 2 (400-1000ms): Title fade in + slide up (starts at 400ms)
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(titleTranslateY, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    }, 400);

    // Step 3 (800-1200ms): Line fade in
    setTimeout(() => {
      Animated.timing(lineOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, 800);

    // Step 4 (1000-1400ms): Tagline fade in
    setTimeout(() => {
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, 1000);

    // Step 5 (1400-continuous): Dots pulse in sequence
    const pulseDot = (anim: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: 300,
            useNativeDriver: true,
          }),
        ])
      );
    };

    setTimeout(() => {
      pulseDot(dot1Opacity, 0).start();
      pulseDot(dot2Opacity, 200).start();
      pulseDot(dot3Opacity, 400).start();
    }, 1400);
  }, []);

  return (
    <View style={styles.container}>
      <Image
        source={SPLASH_BACKGROUND}
        style={styles.backgroundImage}
        resizeMode="cover"
      />

      <View style={styles.content}>
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image
            source={SPLASH_ICON}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.titleContainer,
            {
              opacity: titleOpacity,
              transform: [{ translateY: titleTranslateY }],
            },
          ]}
        >
          <Text style={styles.title}>THRYVYNG</Text>
        </Animated.View>

        <Animated.View style={[styles.lineContainer, { opacity: lineOpacity }]}>
          <View style={styles.line} />
        </Animated.View>

        <Animated.View style={[styles.taglineContainer, { opacity: taglineOpacity }]}>
          <Text style={styles.tagline}>Elevating Youth Soccer</Text>
        </Animated.View>
      </View>

      <View style={styles.dotsContainer}>
        <Animated.View style={[styles.dot, { opacity: dot1Opacity }]} />
        <Animated.View style={[styles.dot, { opacity: dot2Opacity }]} />
        <Animated.View style={[styles.dot, { opacity: dot3Opacity }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -SCREEN_HEIGHT * 0.08,
  },
  logoContainer: {
    marginBottom: 16,
  },
  logo: {
    width: 80,
    height: 80,
  },
  titleContainer: {
    marginBottom: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: 'bold',
    letterSpacing: 6,
  },
  lineContainer: {
    marginBottom: 12,
  },
  line: {
    width: 60,
    height: 2,
    backgroundColor: '#8b5cf6',
  },
  taglineContainer: {
    marginBottom: 0,
  },
  tagline: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '400',
    letterSpacing: 1,
  },
  dotsContainer: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.15,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8b5cf6',
  },
});
