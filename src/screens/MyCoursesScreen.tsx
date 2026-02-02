import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface EnrolledCourse {
  id: string;
  course_id: string;
  user_id: string;
  progress_percentage: number;
  enrolled_at: string;
  completed_at: string | null;
  course: {
    id: string;
    title: string;
    category: string | null;
  };
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function MyCoursesScreen({ navigation }: any) {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState<EnrolledCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEnrollments = useCallback(async () => {
    if (!user?.id) {
      setEnrollments([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('course_enrollments')
        .select(
          `
          id,
          course_id,
          user_id,
          progress_percentage,
          enrolled_at,
          completed_at,
          course:courses(id, title, category)
        `
        )
        .eq('user_id', user.id)
        .order('enrolled_at', { ascending: false });

      if (error) throw error;

      const courseRel = (e: any) => e.course;
      const enriched = (data || []).map((e: any) => {
        const course = Array.isArray(courseRel(e)) ? courseRel(e)[0] : courseRel(e);
        return {
          ...e,
          course: course || { id: e.course_id, title: 'Unknown', category: null },
        };
      });

      setEnrollments(enriched);
    } catch (err) {
      console.error('Error fetching enrollments:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEnrollments();
  };

  const handleBrowseCourses = () => {
    navigation.navigate('Courses');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading your courses...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Courses</Text>
        <View style={styles.headerRight} />
      </View>
      <View style={styles.headerSubtitleRow}>
        <Text style={styles.headerSubtitle}>
          {enrollments.length} {enrollments.length === 1 ? 'course' : 'courses'} enrolled
        </Text>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#8b5cf6"
          />
        }
      >
        {enrollments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📚</Text>
            <Text style={styles.emptyTitle}>No courses yet</Text>
            <Text style={styles.emptyText}>
              Browse our catalog to find courses that interest you
            </Text>
            <TouchableOpacity
              style={styles.browseButton}
              onPress={handleBrowseCourses}
            >
              <Text style={styles.browseButtonText}>Browse Courses</Text>
            </TouchableOpacity>
          </View>
        ) : (
          enrollments.map((enrollment) => (
            <TouchableOpacity
              key={enrollment.id}
              style={styles.courseCard}
              onPress={() =>
                navigation.navigate('CourseDetail', {
                  course_id: enrollment.course_id,
                })
              }
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <View style={styles.courseHeader}>
                  <Text style={styles.courseTitle} numberOfLines={2}>
                    {enrollment.course?.title || 'Unknown Course'}
                  </Text>
                  <View style={styles.badgesRow}>
                    {enrollment.course?.category && (
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryBadgeText}>
                          {enrollment.course.category}
                        </Text>
                      </View>
                    )}
                    {enrollment.completed_at && (
                      <View style={styles.completedBadge}>
                        <Text style={styles.completedBadgeText}>Completed ✓</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.progressSection}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressText}>
                      {Math.round(enrollment.progress_percentage || 0)}% Complete
                    </Text>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(100, enrollment.progress_percentage || 0)}%`,
                        },
                      ]}
                    />
                  </View>
                </View>

                <Text style={styles.enrolledDate}>
                  Enrolled {formatDate(enrollment.enrolled_at)}
                </Text>
              </View>
              <Text style={styles.courseArrow}>›</Text>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  headerSubtitleRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0f172a',
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 14,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  courseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  courseHeader: {
    marginBottom: 12,
  },
  courseTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryBadge: {
    backgroundColor: '#3a3a6e',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryBadgeText: {
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: '600',
  },
  completedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  completedBadgeText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600',
  },
  progressSection: {
    marginBottom: 8,
  },
  progressHeader: {
    marginBottom: 6,
  },
  progressText: {
    color: '#8b5cf6',
    fontSize: 13,
    fontWeight: '600',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#3a3a6e',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#8b5cf6',
    borderRadius: 3,
  },
  enrolledDate: {
    color: '#888',
    fontSize: 12,
  },
  courseArrow: {
    color: '#666',
    fontSize: 24,
    marginLeft: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
  },
  browseButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
  },
  browseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
