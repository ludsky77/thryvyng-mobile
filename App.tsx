import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { CartProvider } from './src/contexts/CartContext';
import { RegistrationProvider } from './src/contexts/RegistrationContext';
import { NotificationProvider } from './src/contexts/NotificationContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CartProvider>
          <RegistrationProvider>
            <NotificationProvider>
              <AppNavigator />
              <StatusBar style="light" />
            </NotificationProvider>
          </RegistrationProvider>
        </CartProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}