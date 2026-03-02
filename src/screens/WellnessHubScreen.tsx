import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useWellness } from '../hooks/useWellness';
import WellnessDisclaimerScreen from './WellnessDisclaimerScreen';
import type { WellnessCategory } from '../types/wellness';

const iconMap: Record<string, string> = {
  calendar: 'calendar-outline',
  apple: 'nutrition-outline',
  sparkles: 'sparkles-outline',
  shield: 'shield-checkmark-outline',
  heart: 'heart-outline',
  lock: 'lock-closed-outline',
};

const gradientColors: Record<string, { primary: string; bg: string }> = {
  'from-purple-400 to-violet-500': { primary: '#8b5cf6', bg: '#f3e8ff' },
  'from-green-400 to-emerald-500': { primary: '#10b981', bg: '#d1fae5' },
  'from-orange-400 to-amber-500': { primary: '#f59e0b', bg: '#fef3c7' },
  'from-blue-400 to-cyan-500': { primary: '#06b6d4', bg: '#cffafe' },
  'from-rose-400 to-pink-500': { primary: '#ec4899', bg: '#fce7f3' },
  'from-gray-400 to-slate-500': { primary: '#64748b', bg: '#f1f5f9' },
};

export default function WellnessHubScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const playerId = route.params?.playerId;
  const userId = route.params?.userId ?? user?.id;

  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const {
    categories,
    loading,
    error,
    hasAcceptedDisclaimer,
    checkingDisclaimer,
    acceptDisclaimer,
    requestApproval,
  } = useWellness(userId, playerId);

  useEffect(() => {
    if (!checkingDisclaimer && !hasAcceptedDisclaimer) {
      setShowDisclaimer(true);
    }
  }, [checkingDisclaimer, hasAcceptedDisclaimer]);

  const handleAcceptDisclaimer = async () => {
    const success = await acceptDisclaimer();
    if (success) {
      setShowDisclaimer(false);
    }
    return success;
  };

  const handleCancelDisclaimer = () => {
    setShowDisclaimer(false);
    navigation.goBack();
  };

  const handleCategoryPress = async (category: WellnessCategory) => {
    if (category.requires_parent_approval && !category.is_approved) {
      if (!category.is_pending) {
        Alert.alert(
          'Parent Approval Required',
          "This content requires your parent or guardian's approval. Would you like to request access?",
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Request Access',
              onPress: async () => {
                const success = await requestApproval(category.id);
                if (success) {
                  Alert.alert(
                    'Request Sent',
                    'Your parent will be notified of your request.'
                  );
                }
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'Pending Approval',
          'Your request is waiting for parent approval.'
        );
      }
      return;
    }

    navigation.navigate('WellnessCategory', {
      categoryId: category.id,
      categoryName: category.name,
      colorGradient: category.color_gradient,
      playerId,
      userId,
    });
  };

  const getColors = (gradient: string | null) => {
    return (
      gradientColors[gradient || ''] || { primary: '#ec4899', bg: '#fce7f3' }
    );
  };

  if (checkingDisclaimer) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WellnessDisclaimerScreen
        visible={showDisclaimer}
        onAccept={handleAcceptDisclaimer}
        onCancel={handleCancelDisclaimer}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Women's Wellness</Text>
          <Text style={styles.headerSubtitle}>
            Tips & guides for female athletes
          </Text>
        </View>
      </View>

      {/* Stats Banner */}
      <View style={styles.statsBanner}>
        <View style={styles.statsIcon}>
          <Ionicons name="heart" size={20} color="#fff" />
        </View>
        <View>
          <Text style={styles.statsLabel}>Available Topics</Text>
          <Text style={styles.statsValue}>
            {categories.reduce((sum, c) => sum + (c.topic_count || 0), 0)} Quick
            Guides & Infographics
          </Text>
        </View>
      </View>

      {/* Categories */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingCategories}>
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={styles.skeletonCard} />
            ))}
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <>
            {categories.map((category) => {
              const colors = getColors(category.color_gradient);
              const isLocked =
                category.requires_parent_approval && !category.is_approved;
              const isPending = category.is_pending;

              return (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.categoryCard, { backgroundColor: colors.bg }]}
                  onPress={() => handleCategoryPress(category)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.categoryIcon,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Ionicons
                      name={
                        (iconMap[category.icon_name || 'heart'] ||
                          'heart-outline') as any
                      }
                      size={28}
                      color="#fff"
                    />
                    {isLocked && (
                      <View style={styles.lockBadge}>
                        <Ionicons name="lock-closed" size={10} color="#fff" />
                      </View>
                    )}
                  </View>

                  <View style={styles.categoryContent}>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryName}>{category.name}</Text>
                      {isPending && (
                        <View style={styles.pendingBadge}>
                          <Text style={styles.pendingText}>Pending</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.categoryDescription}>
                      {category.description}
                    </Text>
                    {isLocked && !isPending && (
                      <View style={styles.lockedText}>
                        <Ionicons name="lock-closed" size={12} color="#e11d48" />
                        <Text style={styles.lockedLabel}>
                          Requires parent approval
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.categoryMeta}>
                    <Text style={styles.topicCount}>
                      {category.topic_count || 0} tips
                    </Text>
                    <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Expert Badge */}
            <View style={styles.expertBadge}>
              <View style={styles.expertIcon}>
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color="#64748b"
                />
              </View>
              <View style={styles.expertContent}>
                <Text style={styles.expertTitle}>Expert-Reviewed Content</Text>
                <Text style={styles.expertText}>
                  All guides reviewed by sports medicine professionals,
                  registered dietitians, and certified athletic trainers.
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#ec4899',
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerContent: {
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  statsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: -20,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#db2777',
  },
  statsIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statsLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  statsValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 24,
  },
  loadingCategories: {
    gap: 12,
  },
  skeletonCard: {
    height: 80,
    backgroundColor: '#e5e7eb',
    borderRadius: 12,
  },
  errorContainer: {
    backgroundColor: '#fee2e2',
    padding: 16,
    borderRadius: 12,
  },
  errorText: {
    color: '#dc2626',
    textAlign: 'center',
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  categoryIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  lockBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4b5563',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryContent: {
    flex: 1,
    marginLeft: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  pendingText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#b45309',
  },
  categoryDescription: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  lockedText: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  lockedLabel: {
    fontSize: 11,
    color: '#e11d48',
  },
  categoryMeta: {
    alignItems: 'flex-end',
  },
  topicCount: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 4,
  },
  expertBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f1f5f9',
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
  },
  expertIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  expertContent: {
    flex: 1,
  },
  expertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  expertText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    lineHeight: 18,
  },
});
