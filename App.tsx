import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { RegistrationProvider } from './src/contexts/RegistrationContext';
import { NotificationProvider } from './src/contexts/NotificationContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RegistrationProvider>
          <NotificationProvider>
            <AppNavigator />
            <StatusBar style="light" />
          </NotificationProvider>
        </RegistrationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}