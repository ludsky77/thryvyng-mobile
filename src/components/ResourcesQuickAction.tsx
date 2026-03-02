import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

interface ResourcesQuickActionProps {
  playerId: string | null;
  userId?: string;
  /** When true, matches the inline style of PlayerDashboard action buttons */
  inline?: boolean;
}

export default function ResourcesQuickAction({
  playerId,
  userId,
  inline,
}: ResourcesQuickActionProps) {
  const navigation = useNavigation<any>();

  const handlePress = () => {
    navigation.navigate('Resources', { playerId, userId });
  };

  if (inline) {
    return (
      <TouchableOpacity
        style={styles.inlineContainer}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <View style={[styles.actionButtonIcon, { backgroundColor: '#EC4899' }]}>
          <Ionicons name="book-outline" size={28} color="#FFFFFF" />
        </View>
        <Text style={styles.inlineLabel}>Resources</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Ionicons name="book-outline" size={28} color="#fff" />
      </View>
      <Text style={styles.label}>Resources</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: 80,
  },
  inlineContainer: {
    flex: 1,
    backgroundColor: '#2a2a4e',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  actionButtonIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9ca3af',
  },
  inlineLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
