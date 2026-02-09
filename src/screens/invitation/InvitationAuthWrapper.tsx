import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import InvitationScreen from './InvitationScreen';

interface RouteParams {
  token: string;
}

export default function InvitationAuthWrapper() {
  const route = useRoute();
  const navigation = useNavigation();
  const { token } = route.params as RouteParams;
  const { user, loading: authLoading } = useAuth();

  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        navigation.navigate(
          'Login' as never,
          {
            returnTo: 'Invitation',
            returnParams: { token },
          } as never,
        );
      }
      setCheckingAuth(false);
    }
  }, [authLoading, user, navigation, token]);

  if (authLoading || checkingAuth) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#4ade80" />
        <Text style={styles.loadingText}>Checking authentication...</Text>
      </View>
    );
  }

  if (!user) {
    return null;
  }

  return <InvitationScreen />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
  },
});

