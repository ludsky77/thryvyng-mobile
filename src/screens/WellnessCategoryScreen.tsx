import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useWellness } from '../hooks/useWellness';
import type { WellnessTopic } from '../types/wellness';

const contentTypeIcons: Record<string, { icon: string; emoji: string }> = {
  infographic: { icon: 'document-text-outline', emoji: '📊' },
  tips: { icon: 'bulb-outline', emoji: '💡' },
  checklist: { icon: 'checkbox-outline', emoji: '✅' },
  video: { icon: 'play-circle-outline', emoji: '▶️' },
  links: { icon: 'link-outline', emoji: '🔗' },
};

const gradientColors: Record<string, { primary: string; bg: string }> = {
  'from-purple-400 to-violet-500': { primary: '#8b5cf6', bg: '#f3e8ff' },
  'from-green-400 to-emerald-500': { primary: '#10b981', bg: '#d1fae5' },
  'from-orange-400 to-amber-500': { primary: '#f59e0b', bg: '#fef3c7' },
  'from-blue-400 to-cyan-500': { primary: '#06b6d4', bg: '#cffafe' },
  'from-rose-400 to-pink-500': { primary: '#ec4899', bg: '#fce7f3' },
  'from-gray-400 to-slate-500': { primary: '#64748b', bg: '#f1f5f9' },
};

export default function WellnessCategoryScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { categoryId, categoryName, colorGradient, playerId, userId } =
    route.params || {};

  const [topics, setTopics] = useState<WellnessTopic[]>([]);
  const [loading, setLoading] = useState(true);

  const { fetchTopics } = useWellness(userId, playerId);

  const colors =
    gradientColors[colorGradient || ''] || { primary: '#ec4899', bg: '#fce7f3' };

  useEffect(() => {
    if (categoryId) {
      setLoading(true);
      fetchTopics(categoryId).then((data) => {
        setTopics(data);
        setLoading(false);
      });
    }
  }, [categoryId, fetchTopics]);

  const handleTopicPress = (topic: WellnessTopic) => {
    navigation.navigate('WellnessTopic', {
      topicId: topic.id,
      topicTitle: topic.title,
      topic,
      colorGradient,
      playerId,
      userId,
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>{categoryName || 'Category'}</Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name="document-text" size={24} color="#fff" />
          </View>
        </View>
      </View>

      {/* Topics List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : topics.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No topics available yet.</Text>
          </View>
        ) : (
          <>
            {topics.map((topic) => {
              const typeInfo =
                contentTypeIcons[topic.content_type] || contentTypeIcons.tips;

              return (
                <TouchableOpacity
                  key={topic.id}
                  style={styles.topicCard}
                  onPress={() => handleTopicPress(topic)}
                  activeOpacity={0.7}
                >
                  <View style={styles.topicIcon}>
                    <Text style={styles.topicEmoji}>{typeInfo.emoji}</Text>
                  </View>

                  <View style={styles.topicContent}>
                    <Text style={styles.topicTitle}>{topic.title}</Text>
                    {topic.subtitle && (
                      <Text style={styles.topicSubtitle}>{topic.subtitle}</Text>
                    )}
                  </View>

                  <View style={styles.topicMeta}>
                    {topic.estimated_read_time && (
                      <Text style={styles.topicTime}>
                        {topic.estimated_read_time}
                      </Text>
                    )}
                    <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Coming Soon Courses */}
            <View style={styles.coursesSection}>
              <Text style={styles.coursesTitle}>Expert Courses</Text>
              <View style={styles.coursesCard}>
                <View style={styles.coursesIcon}>
                  <Ionicons name="play-circle" size={28} color="#fff" />
                </View>
                <View style={styles.coursesContent}>
                  <Text style={styles.coursesName}>Deep Dive Courses</Text>
                  <Text style={styles.coursesDesc}>
                    By certified female athlete specialists
                  </Text>
                </View>
                <View style={styles.comingSoonBadge}>
                  <Text style={styles.comingSoonText}>Coming Soon</Text>
                </View>
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
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
  topicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  topicIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topicEmoji: {
    fontSize: 24,
  },
  topicContent: {
    flex: 1,
    marginLeft: 14,
  },
  topicTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  topicSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  topicMeta: {
    alignItems: 'flex-end',
  },
  topicTime: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 4,
  },
  coursesSection: {
    marginTop: 24,
  },
  coursesTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  coursesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f3ff',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  coursesIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coursesContent: {
    flex: 1,
    marginLeft: 14,
  },
  coursesName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  coursesDesc: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  comingSoonBadge: {
    backgroundColor: '#ede9fe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  comingSoonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7c3aed',
  },
});
