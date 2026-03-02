import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useWellness } from '../hooks/useWellness';
import WellnessContentRenderer from '../components/WellnessContentRenderer';
import type { WellnessTopic } from '../types/wellness';

export default function WellnessTopicScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const engagementIdRef = useRef<string | null>(null);

  const { topicId, topicTitle, topic, colorGradient, playerId, userId } =
    route.params || {};
  const topicData = topic as WellnessTopic | undefined;

  const { startView, endView } = useWellness(userId, playerId);

  // Track view on mount/unmount
  useEffect(() => {
    if (topicId) {
      startView(topicId).then((id) => {
        engagementIdRef.current = id;
      });
    }

    return () => {
      if (engagementIdRef.current) {
        endView(engagementIdRef.current);
      }
    };
  }, [topicId, startView, endView]);

  if (!topicData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Topic not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {topicData.title}
          </Text>
          {topicData.estimated_read_time && (
            <Text style={styles.headerSubtitle}>
              {topicData.estimated_read_time}
            </Text>
          )}
        </View>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <WellnessContentRenderer
          content={topicData.content_json || {}}
          colorGradient={colorGradient}
        />

        {/* Expert Source */}
        {topicData.expert_source && (
          <View style={styles.expertSource}>
            <Ionicons name="checkmark-circle" size={16} color="#9ca3af" />
            <Text style={styles.expertSourceText}>
              Reviewed by {topicData.expert_source}
            </Text>
          </View>
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
  errorContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 12,
  },
  backLink: {
    fontSize: 16,
    color: '#8b5cf6',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  expertSource: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    gap: 6,
  },
  expertSourceText: {
    fontSize: 12,
    color: '#9ca3af',
  },
});
