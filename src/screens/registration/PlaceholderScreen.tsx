import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/linking';

type PlaceholderRouteProp = RouteProp<RootStackParamList, keyof RootStackParamList>;

interface PlaceholderScreenProps {
  screenName: string;
}

export const PlaceholderScreen: React.FC<PlaceholderScreenProps> = ({ screenName }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<PlaceholderRouteProp>();

  // Extract params safely
  const params = route.params as Record<string, string> | undefined;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.icon}>🚧</Text>
        <Text style={styles.title}>{screenName}</Text>
        <Text style={styles.subtitle}>Registration Coming Soon</Text>

        {params && Object.keys(params).length > 0 && (
          <View style={styles.paramsContainer}>
            <Text style={styles.paramsTitle}>Route Parameters:</Text>
            {Object.entries(params).map(([key, value]) => (
              <Text key={key} style={styles.paramText}>
                {key}: {value}
              </Text>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 24,
  },
  paramsContainer: {
    backgroundColor: '#2D2D2D',
    borderRadius: 8,
    padding: 16,
    width: '100%',
    marginBottom: 24,
  },
  paramsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#60A5FA',
    marginBottom: 8,
  },
  paramText: {
    fontSize: 14,
    color: '#D1D5DB',
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PlaceholderScreen;
