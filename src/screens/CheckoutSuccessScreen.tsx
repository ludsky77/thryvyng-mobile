import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from 'react-native-reanimated';

export default function CheckoutSuccessScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { sessionId } = (route.params as { sessionId?: string }) || {};

  const checkScale = useSharedValue(0);
  const contentOpacity = useSharedValue(0);

  useEffect(() => {
    checkScale.value = withSpring(1, { damping: 12 });
    contentOpacity.value = withDelay(300, withSpring(1));
  }, []);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const handleGoToDashboard = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Dashboard' as never }],
    });
  };

  const handleContinueShopping = () => {
    navigation.navigate('ProductStore' as never);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View style={[styles.checkCircle, checkStyle]}>
          <Ionicons name="checkmark" size={60} color="#0f172a" />
        </Animated.View>

        <Animated.View style={[styles.textContent, contentStyle]}>
          <Text style={styles.title}>Order Complete!</Text>
          <Text style={styles.subtitle}>
            Thank you for supporting the team!
          </Text>

          <View style={styles.infoCard}>
            <Ionicons name="mail-outline" size={24} color="#8B5CF6" />
            <View style={styles.infoText}>
              <Text style={styles.infoTitle}>Confirmation Email</Text>
              <Text style={styles.infoSubtitle}>
                Check your inbox for order details
              </Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Ionicons name="heart-outline" size={24} color="#10B981" />
            <View style={styles.infoText}>
              <Text style={styles.infoTitle}>Team Supported</Text>
              <Text style={styles.infoSubtitle}>
                Your purchase helps fund the team
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleGoToDashboard}
          >
            <Text style={styles.primaryButtonText}>Go to Dashboard</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleContinueShopping}
          >
            <Text style={styles.secondaryButtonText}>Continue Shopping</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  checkCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  textContent: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 12,
  },
  infoText: {
    marginLeft: 16,
    flex: 1,
  },
  infoTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoSubtitle: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 2,
  },
  primaryButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
    marginTop: 24,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#8B5CF6',
    fontSize: 16,
    fontWeight: '600',
  },
});
