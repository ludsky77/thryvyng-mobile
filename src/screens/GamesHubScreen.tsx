import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useCognitiveGames } from '../hooks/useCognitiveGames';
import type { CognitiveGame } from '../types/games';

interface GamesHubScreenProps {
  navigation: any;
}

// Game icon mapping
const GAME_ICONS: Record<string, { icon: string; color: string }> = {
  'field-vision': { icon: 'eye', color: '#8b5cf6' },
  'pattern-play': { icon: 'grid', color: '#10b981' },
  'decision-point': { icon: 'zap', color: '#f59e0b' },
  'anticipation-arena': { icon: 'target', color: '#06b6d4' },
  'pressure-protocol': { icon: 'activity', color: '#ef4444' },
};

export default function GamesHubScreen({ navigation }: any) {
  const {
    games,
    loading,
    error,
    getGameProgress,
    minutesRemaining,
    totalXpEarned,
    refetch,
  } = useCognitiveGames();

  // Header with back button
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const handleGamePress = (game: CognitiveGame) => {
    // Will navigate to individual game screen in Phase 3+
    navigation.navigate('GamePlay', {
      gameId: game.id,
      gameSlug: game.slug,
      gameName: game.name,
    });
  };

  const getProgressForGame = (gameId: string) => {
    const progress = getGameProgress(gameId);
    return {
      currentLevel: progress?.current_level || 1,
      highestLevel: progress?.highest_level_completed || 0,
      totalXp: progress?.total_xp_earned || 0,
      sessions: progress?.total_sessions || 0,
    };
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Loading games...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>🎮 Cognitive Games</Text>
          <Text style={styles.headerSubtitle}>Train your soccer brain</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Feather name="clock" size={20} color="#8b5cf6" />
            </View>
            <Text style={styles.statValue}>{minutesRemaining}</Text>
            <Text style={styles.statLabel}>min left today</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Feather name="star" size={20} color="#f59e0b" />
            </View>
            <Text style={styles.statValue}>{totalXpEarned}</Text>
            <Text style={styles.statLabel}>XP earned</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Feather name="award" size={20} color="#10b981" />
            </View>
            <Text style={styles.statValue}>{games.length}</Text>
            <Text style={styles.statLabel}>games</Text>
          </View>
        </View>

        {/* Daily Limit Warning */}
        {minutesRemaining <= 15 && minutesRemaining > 0 && (
          <View style={styles.warningBanner}>
            <Feather name="alert-triangle" size={16} color="#f59e0b" />
            <Text style={styles.warningText}>
              Only {minutesRemaining} minutes remaining today
            </Text>
          </View>
        )}

        {minutesRemaining === 0 && (
          <View style={styles.limitBanner}>
            <Feather name="clock" size={16} color="#ef4444" />
            <Text style={styles.limitText}>
              Daily limit reached. Come back tomorrow!
            </Text>
          </View>
        )}

        {/* Games List */}
        <Text style={styles.sectionTitle}>Choose a Game</Text>

        {games.map((game) => {
          const gameConfig = GAME_ICONS[game.slug] || { icon: 'play', color: '#8b5cf6' };
          const progress = getProgressForGame(game.id);
          const isDisabled = minutesRemaining === 0;

          return (
            <TouchableOpacity
              key={game.id}
              style={[styles.gameCard, isDisabled && styles.gameCardDisabled]}
              onPress={() => !isDisabled && handleGamePress(game)}
              disabled={isDisabled}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.gameIconContainer,
                  { backgroundColor: `${gameConfig.color}20` },
                ]}
              >
                <Feather
                  name={gameConfig.icon as any}
                  size={28}
                  color={isDisabled ? '#64748b' : gameConfig.color}
                />
              </View>

              <View style={styles.gameInfo}>
                <Text style={[styles.gameName, isDisabled && styles.gameNameDisabled]}>
                  {game.name}
                </Text>
                <Text style={styles.gameSkill}>{game.skill_type?.replace('-', ' ')}</Text>

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${(progress.highestLevel / 5) * 100}%`,
                          backgroundColor: gameConfig.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    Level {progress.currentLevel}/5
                  </Text>
                </View>
              </View>

              <View style={styles.gameStats}>
                <Text style={styles.gameXp}>{progress.totalXp} XP</Text>
                <Feather
                  name="chevron-right"
                  size={20}
                  color={isDisabled ? '#64748b' : '#94a3b8'}
                />
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Info Section */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Feather name="info" size={16} color="#64748b" />
            <Text style={styles.infoText}>
              Complete levels to earn XP and improve your cognitive skills
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Feather name="clock" size={16} color="#64748b" />
            <Text style={styles.infoText}>
              3 hour daily limit helps maintain focus
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#ef4444',
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  warningText: {
    color: '#f59e0b',
    marginLeft: 8,
    fontSize: 14,
  },
  limitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  limitText: {
    color: '#ef4444',
    marginLeft: 8,
    fontSize: 14,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  gameCardDisabled: {
    opacity: 0.5,
  },
  gameIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  gameInfo: {
    flex: 1,
  },
  gameName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  gameNameDisabled: {
    color: '#64748b',
  },
  gameSkill: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    marginRight: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    color: '#64748b',
    fontSize: 11,
  },
  gameStats: {
    alignItems: 'flex-end',
  },
  gameXp: {
    color: '#8b5cf6',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#1e293b',
    borderRadius: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  infoText: {
    color: '#94a3b8',
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
});
