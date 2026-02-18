import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/linking';

type ClaimPlayerRouteProp = RouteProp<RootStackParamList, 'ClaimPlayer'>;
type ClaimPlayerNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ClaimPlayer'>;

/**
 * Redirects /claim-player/:code to JoinTeam with role=player.
 * This allows the web app's claim-player link to work in the mobile app.
 */
export const ClaimPlayerScreen: React.FC = () => {
  const route = useRoute<ClaimPlayerRouteProp>();
  const navigation = useNavigation<ClaimPlayerNavigationProp>();

  const code = route.params?.code ?? '';

  useEffect(() => {
    if (code) {
      navigation.replace('JoinTeam', { code, role: 'player' });
    } else {
      navigation.replace('NotFound');
    }
  }, [code, navigation]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#8b5cf6" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
