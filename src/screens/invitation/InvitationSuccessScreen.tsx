import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from 'react-native-reanimated';

export default function InvitationSuccessScreen() {
  const navigation = useNavigation();

  const checkScale = useSharedValue(0);
  const contentOpacity = useSharedValue(0);

  useEffect(() => {
    checkScale.value = withSpring(1, { damping: 12 });
    contentOpacity.value = withDelay(300, withSpring(1));
  }, [checkScale, contentOpacity]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const handleGoToDashboard = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' as never }],
    });
  };

  const handleViewTeam = () => {
    navigation.reset({
      index: 0,
      routes: [
        { name: 'MainTabs' as never },
        { name: 'TeamDetail' as never },
      ],
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View style={[styles.checkCircle, checkStyle]}>
          <Ionicons name="checkmark" size={60} color="#000" />
        </Animated.View>

        <Animated.View style={[styles.textContent, contentStyle]}>
          <Text style={styles.title}>Registration Complete!</Text>
          <Text style={styles.subtitle}>
            Welcome to the team! You'll receive a confirmation email shortly.
          </Text>

          <View style={styles.infoCard}>
            <Ionicons name="mail" size={20} color="#4ade80" />
            <Text style={styles.infoText}>
              Check your email for registration details and next steps
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Ionicons name="calendar" size={20} color="#4ade80" />
            <Text style={styles.infoText}>
              Team schedule and events will appear in your calendar
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Ionicons name="chatbubbles" size={20} color="#4ade80" />
            <Text style={styles.infoText}>
              Join team chat to connect with coaches and other families
            </Text>
          </View>
        </Animated.View>
      </View>

      <View style={styles.bottom}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleGoToDashboard}
        >
          <Text style={styles.primaryBtnText}>Go to Dashboard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={handleViewTeam}>
          <Text style={styles.secondaryBtnText}>View Team</Text>
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
  checkCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#4ade80',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  textContent: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 32,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    width: '100%',
    gap: 12,
  },
  infoText: {
    color: '#fff',
    fontSize: 13,
    flex: 1,
  },
  bottom: {
    padding: 16,
    paddingBottom: 24,
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: '#4ade80',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
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

