import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  otherCount: number;
  onViewAll: () => void;
}

export default function OtherInvitationsBanner({ otherCount, onViewAll }: Props) {
  if (otherCount === 0) return null;

  return (
    <TouchableOpacity style={styles.banner} onPress={onViewAll}>
      <Ionicons name="information-circle" size={20} color="#4ade80" />
      <Text style={styles.bannerText}>
        {otherCount} Other Invitation{otherCount > 1 ? 's' : ''} Pending
      </Text>
      <View style={styles.viewAllButton}>
        <Text style={styles.viewAllText}>View All</Text>
        <Ionicons name="chevron-forward" size={16} color="#4ade80" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.3)',
  },
  bannerText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewAllText: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '600',
  },
});
