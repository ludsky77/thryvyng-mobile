import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface RouteParams {
  token?: string;
}

export default function InvitationCancelScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { token } = (route.params as RouteParams) || {};

  const handleRetry = () => {
    if (token) {
      navigation.navigate('Invitation' as never, { token } as never);
    } else {
      navigation.goBack();
    }
  };

  const handleGoHome = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' as never }],
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="close" size={48} color="#f59e0b" />
        </View>

        <Text style={styles.title}>Payment Cancelled</Text>
        <Text style={styles.subtitle}>
          Your payment was not completed. No charges have been made.
        </Text>

        <View style={styles.infoCard}>
          <Ionicons name="time" size={20} color="#888" />
          <Text style={styles.infoText}>
            Your invitation is still valid. You can complete the registration
            at any time before it expires.
          </Text>
        </View>
      </View>

      <View style={styles.bottom}>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleRetry}>
          <Ionicons name="refresh" size={20} color="#000" />
          <Text style={styles.primaryBtnText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={handleGoHome}>
          <Text style={styles.secondaryBtnText}>Go to Dashboard</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#f59e0b',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 32,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    width: '100%',
    gap: 12,
  },
  infoText: {
    color: '#888',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  bottom: {
    padding: 16,
    paddingBottom: 24,
    gap: 10,
  },
  primaryBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#4ade80',
    paddingVertical: 16,
    borderRadius: 10,
    gap: 8,
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  secondaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

