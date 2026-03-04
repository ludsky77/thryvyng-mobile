import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  useWellnessParent,
  useIsFemaleAthlete,
} from '../hooks/useWellness';

interface WellnessParentAlertProps {
  playerId: string;
  playerName: string;
  userId: string;
}

export default function WellnessParentAlert({
  playerId,
  playerName,
  userId,
}: WellnessParentAlertProps) {
  const navigation = useNavigation<any>();
  const { isFemale } = useIsFemaleAthlete(playerId);
  const { pendingApprovals, engagement, loading } = useWellnessParent(
    userId,
    playerId
  );

  if (!isFemale || loading) {
    return null;
  }

  const handlePress = () => {
    navigation.navigate('WellnessParentDashboard', {
      playerId,
      playerName,
      userId,
    });
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
  };

  return (
    <View style={styles.container}>
      {pendingApprovals.length > 0 && (
        <TouchableOpacity
          style={styles.alertCard}
          onPress={handlePress}
          activeOpacity={0.7}
        >
          <View style={styles.alertIcon}>
            <Ionicons name="notifications" size={18} color="#fff" />
          </View>
          <View style={styles.alertContent}>
            <Text style={styles.alertTitle}>Approval Requested</Text>
            <Text style={styles.alertSubtitle}>
              {playerName} wants access to restricted content
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#fbbf24" />
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.statsCard}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <View style={styles.statsHeader}>
          <View style={styles.statsIcon}>
            <Ionicons name="heart" size={20} color="#fff" />
          </View>
          <View>
            <Text style={styles.statsTitle}>Women's Wellness</Text>
            <Text style={styles.statsSubtitle}>View {playerName}'s activity</Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <Ionicons name="eye-outline" size={16} color="#ec4899" />
          <Text style={styles.statsText}>
            {engagement?.total_views || 0} topics viewed
          </Text>
          <Text style={styles.statsTime}>
            {formatTime(engagement?.total_time_seconds || 0)} total
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    marginTop: 16,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  alertIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
  },
  alertSubtitle: {
    fontSize: 12,
    color: '#b45309',
  },
  statsCard: {
    backgroundColor: '#831843',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#9d174d',
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statsIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  statsSubtitle: {
    fontSize: 12,
    color: '#f9a8d4',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(236, 72, 153, 0.3)',
    padding: 10,
    borderRadius: 10,
    gap: 6,
  },
  statsText: {
    fontSize: 13,
    color: '#fce7f3',
    flex: 1,
  },
  statsTime: {
    fontSize: 11,
    color: '#f9a8d4',
  },
});
