import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

interface Course {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  price: number | null;
  status: string;
  created_by_user_id: string | null;
  creator?: { full_name: string | null } | null;
  isEnrolled?: boolean;
}

export default function CoursesScreen({ navigation }: any) {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const fetchCourses = useCallback(async () => {
    try {
      const { data: coursesData, error: coursesError } = await supabase
        .from('courses')
        .select(
          `
          id,
          title,
          description,
          category,
          price,
          status,
          created_by_user_id,
          creator:profiles!created_by_user_id(full_name)
        `
        )
        .eq('status', 'published');

      if (coursesError) throw coursesError;

      let enrolledCourseIds: string[] = [];
      if (user?.id) {
        const { data: enrollments } = await supabase
          .from('course_enrollments')
          .select('course_id')
          .eq('user_id', user.id);
        enrolledCourseIds = (enrollments || []).map((e: any) => e.course_id);
      }

      const creatorRel = (c: any) => c.creator;
      const coursesWithCreator = (coursesData || []).map((c: any) => {
        const creator = Array.isArray(creatorRel(c))
          ? creatorRel(c)[0]
          : creatorRel(c);
        return {
          ...c,
          creator,
          isEnrolled: enrolledCourseIds.includes(c.id),
        };
      });

      setCourses(coursesWithCreator);
    } catch (error) {
      console.error('Error fetching courses:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCourses();
  };

  const categories = useMemo(() => {
    const cats = new Set<string>();
    courses.forEach((c) => {
      if (c.category) cats.add(c.category);
    });
    return ['All', ...Array.from(cats).sort()];
  }, [courses]);

  const filteredCourses = useMemo(() => {
    if (selectedCategory === 'All') return courses;
    return courses.filter((c) => c.category === selectedCategory);
  }, [courses, selectedCategory]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading courses...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Courses</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryTabs}
        contentContainerStyle={styles.categoryTabsContent}
      >
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[
              styles.categoryTab,
              selectedCategory === cat && styles.categoryTabActive,
            ]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text
              style={[
                styles.categoryTabText,
                selectedCategory === cat && styles.categoryTabTextActive,
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

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
        {filteredCourses.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📚</Text>
            <Text style={styles.emptyTitle}>No courses yet</Text>
            <Text style={styles.emptyText}>
              Check back soon for new courses
            </Text>
          </View>
        ) : (
          filteredCourses.map((course) => (
            <TouchableOpacity
              key={course.id}
              style={styles.courseCard}
              onPress={() =>
                navigation.navigate('CourseDetail', { course_id: course.id })
              }
              activeOpacity={0.7}
            >
              <View style={styles.courseHeader}>
                <Text style={styles.courseTitle} numberOfLines={2}>
                  {course.title}
                </Text>
                <View style={styles.courseBadges}>
                  {course.category && (
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryBadgeText}>
                        {course.category}
                      </Text>
                    </View>
                  )}
                  {course.isEnrolled && (
                    <View style={styles.enrolledBadge}>
                      <Text style={styles.enrolledBadgeText}>Enrolled</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.courseFooter}>
                <Text style={styles.creatorName}>
                  by{' '}
                  {(course.creator as any)?.full_name ||
                    (Array.isArray(course.creator)
                      ? course.creator[0]?.full_name
                      : 'Unknown')}
                </Text>
                <Text style={styles.price}>
                  {course.price != null && course.price > 0
                    ? `$${course.price}`
                    : 'Free'}
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
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#2a2a4e',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  categoryTabs: {
    maxHeight: 50,
    backgroundColor: '#2a2a4e',
  },
  categoryTabsContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#3a3a6e',
    marginRight: 8,
  },
  categoryTabActive: {
    backgroundColor: '#8b5cf6',
  },
  categoryTabText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
  },
  categoryTabTextActive: {
    color: '#fff',
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
  courseHeader: {
    flex: 1,
    minWidth: 0,
  },
  courseTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  courseBadges: {
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
  enrolledBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  enrolledBadgeText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600',
  },
  courseFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  creatorName: {
    color: '#888',
    fontSize: 13,
  },
  price: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '700',
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
  },
});
