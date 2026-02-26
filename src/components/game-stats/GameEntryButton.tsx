import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const colors = {
  card: '#2a2a4e',
  text: '#ffffff',
  textMuted: '#9CA3AF',
  border: '#374151',
  primary: '#8B5CF6',
  success: '#10B981',
  error: '#EF4444',
  muted: '#374151',
};

interface GameEntryButtonProps {
  eventId: string;
  teamId: string;
  eventType?: string;
}

interface GameSession {
  id: string;
  status: string;
  home_score: number;
  away_score: number;
}

export function GameEntryButton({
  eventId,
  teamId,
  eventType,
}: GameEntryButtonProps) {
  const navigation = useNavigation<any>();
  const pulseOpacity = useSharedValue(1);
  const [existingSession, setExistingSession] = useState<GameSession | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    if (eventType !== 'game') return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('game_sessions')
        .select('id, status, home_score, away_score')
        .eq('event_id', eventId)
        .maybeSingle();
      if (error) throw error;
      setExistingSession(data as GameSession | null);
    } catch (err) {
      console.error('[GameEntryButton] Error:', err);
      setExistingSession(null);
    } finally {
      setIsLoading(false);
    }
  }, [eventId, eventType]);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withTiming(0.4, { duration: 1000 }),
      -1,
      true
    );
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  if (eventType !== 'game') {
    return null;
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  // Game finished
  if (existingSession?.status === 'finished') {
    return (
      <TouchableOpacity
        style={styles.summaryButton}
        onPress={() =>
          navigation.navigate('MatchSummary', {
            sessionId: existingSession.id,
          })
        }
      >
        <Ionicons name="document-text" size={20} color={colors.text} />
        <View style={styles.buttonContent}>
          <Text style={styles.buttonTitle}>View Match Summary</Text>
          <Text style={styles.buttonSubtitle}>
            Final: {existingSession.home_score} - {existingSession.away_score}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    );
  }

  // Game is live
  if (
    existingSession &&
    ['warmup', 'first_half', 'halftime', 'second_half'].includes(
      existingSession.status
    )
  ) {
    return (
      <View style={styles.liveContainer}>
        <View style={styles.liveHeader}>
          <Animated.View style={[styles.liveDot, pulseStyle]} />
          <Text style={styles.liveText}>LIVE</Text>
          <Text style={styles.liveScore}>
            {existingSession.home_score} - {existingSession.away_score}
          </Text>
        </View>
        <View style={styles.liveButtons}>
          <TouchableOpacity
            style={styles.watchButton}
            onPress={() =>
              navigation.navigate('LiveSpectator', {
                sessionId: existingSession.id,
              })
            }
          >
            <Ionicons name="eye" size={18} color={colors.text} />
            <Text style={styles.watchButtonText}>Watch</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.recordButton}
            onPress={() =>
              navigation.navigate('StatsConsole', {
                sessionId: existingSession.id,
              })
            }
          >
            <Ionicons name="radio-button-on" size={18} color="white" />
            <Text style={styles.recordButtonText}>Stats Console</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // No session - show start button
  return (
    <TouchableOpacity
      style={styles.startButton}
      onPress={() =>
        navigation.navigate('PreGameSetup', {
          eventId,
          teamId,
        })
      }
    >
      <Ionicons name="play-circle" size={24} color="white" />
      <Text style={styles.startButtonText}>Start Match Center</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  summaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonContent: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  buttonSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  liveContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.error + '40',
  },
  liveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.error,
  },
  liveText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.error,
  },
  liveScore: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginLeft: 'auto',
  },
  liveButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  watchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: colors.muted,
    borderRadius: 8,
  },
  watchButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  recordButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  recordButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.success,
    paddingVertical: 16,
    borderRadius: 12,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
