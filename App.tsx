import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { CartProvider } from './src/contexts/CartContext';
import { RegistrationProvider } from './src/contexts/RegistrationContext';
import { NotificationProvider } from './src/contexts/NotificationContext';
import AppNavigator from './src/navigation/AppNavigator';
import SplashScreen from './src/screens/SplashScreen';
import { initSentry } from './src/services/sentry';

// Initialize Sentry before app renders
initSentry();

function AppContent() {
  const { loading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);
  const splashOpacity = useRef(new Animated.Value(1)).current;

  const handleSplashFinish = () => {
    Animated.timing(splashOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setShowSplash(false);
      }
    });
  };

  if (showSplash) {
    return (
      <>
        <Animated.View style={[styles.splashWrapper, { opacity: splashOpacity }]}>
          <SplashScreen isReady={!loading} onFinish={handleSplashFinish} />
        </Animated.View>
        <StatusBar style="light" />
      </>
    );
  }

  return (
    <>
      <AppNavigator />
      <StatusBar style="light" />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CartProvider>
          <RegistrationProvider>
            <NotificationProvider>
              <AppContent />
            </NotificationProvider>
          </RegistrationProvider>
        </CartProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashWrapper: {
    flex: 1,
  },
});
