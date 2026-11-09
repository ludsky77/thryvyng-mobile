import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { withTimeout } from '../../hooks/useEventAttendance';
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
  /**
   * Team staff. Gates ONLY the controls that start or run a match (Start
   * Match Center, Stats Console). Watch and View Match Summary are read-only
   * and stay visible to the whole team, as they were before Nov 9.
   */
  canManage?: boolean;
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
  canManage = false,
}: GameEntryButtonProps) {
  const navigation = useNavigation<any>();
  const pulseOpacity = useSharedValue(1);
  const [existingSession, setExistingSession] = useState<GameSession | null>(
    null
  );
  /**
   * 'idle' until the first read settles -- it draws NOTHING, not a spinner,
   * so the button can never sit there spinning (the Nov 9 report). The read
   * gives up after 12 s; a failure is 'error', which shows a Retry instead of
   * guessing "no session" and offering "Start Match Center" on a game that
   * may already be live.
   */
  const [loadState, setLoadState] = useState<'idle' | 'ready' | 'error'>('idle');

  const fetchSession = useCallback(async () => {
    if (eventType !== 'game') return;
    try {
      const { data, error } = await withTimeout((signal) =>
        supabase
          .from('game_sessions')
          .select('id, status, home_score, away_score')
          .eq('event_id', eventId)
          .abortSignal(signal)
          .maybeSingle()
      );
      if (error) throw error;
      setExistingSession(data as GameSession | null);
      setLoadState('ready');
    } catch (err) {
      console.warn('[GameEntryButton] session read failed:', err);
      setExistingSession(null);
      setLoadState('error');
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

  if (loadState === 'idle') {
    return null;
  }

  if (loadState === 'error') {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Couldn't load match status.</Text>
        <TouchableOpacity
          onPress={() => {
            setLoadState('idle');
            fetchSession();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
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
          {canManage && (
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
          )}
        </View>
      </View>
    );
  }

  // No session - show start button (staff only; nothing to watch yet)
  if (!canManage) {
    return null;
  }

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
    gap: 8,
  },
  errorText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  retryText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
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
