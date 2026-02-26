import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
  error: '#EF4444',
  muted: '#374151',
};

interface LiveGamesWidgetProps {
  clubId?: string;
  teamId?: string;
}

interface LiveGame {
  game_session_id: string;
  team_name: string;
  opponent_name: string | null;
  home_score: number;
  away_score: number;
  status: string;
}

export function LiveGamesWidget({ clubId, teamId }: LiveGamesWidgetProps) {
  const navigation = useNavigation<any>();
  const pulseOpacity = useSharedValue(1);
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);

  const fetchLiveGames = useCallback(async () => {
    try {
      let query = supabase.from('live_games').select('*');
      if (clubId) query = query.eq('club_id', clubId);
      if (teamId) query = query.eq('team_id', teamId);
      const { data, error } = await query.limit(3);
      if (error) throw error;
      setLiveGames((data || []) as LiveGame[]);
    } catch (err) {
      console.error('[LiveGamesWidget] Error:', err);
      setLiveGames([]);
    }
  }, [clubId, teamId]);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withTiming(0.4, { duration: 1000 }),
      -1,
      true
    );
  }, []);

  useEffect(() => {
    fetchLiveGames();
    const interval = setInterval(fetchLiveGames, 10000);
    return () => clearInterval(interval);
  }, [fetchLiveGames]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  if (liveGames.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Animated.View style={[styles.liveDot, pulseStyle]} />
        <Text style={styles.headerText}>LIVE NOW</Text>
      </View>

      {liveGames.map((game) => (
        <TouchableOpacity
          key={game.game_session_id}
          style={styles.gameCard}
          onPress={() =>
            navigation.navigate('LiveSpectator', {
              sessionId: game.game_session_id,
            })
          }
        >
          <View style={styles.gameInfo}>
            <Text style={styles.teamName}>{game.team_name}</Text>
            <Text style={styles.vsText}>
              vs {game.opponent_name || 'Opponent'}
            </Text>
          </View>
          <View style={styles.scoreContainer}>
            <Text style={styles.score}>
              {game.home_score} - {game.away_score}
            </Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>
                {game.status === 'first_half'
                  ? '1H'
                  : game.status === 'halftime'
                    ? 'HT'
                    : '2H'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.error + '40',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.error,
    letterSpacing: 0.5,
  },
  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  gameInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  vsText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  scoreContainer: {
    alignItems: 'flex-end',
    marginRight: 12,
  },
  score: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  statusBadge: {
    backgroundColor: colors.muted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
