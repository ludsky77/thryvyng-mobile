import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CollapsibleSection } from '../components/CollapsibleSection';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Lesson {
  id: string;
  module_id: string;
  title: string;
  lesson_order: number;
  video_url: string | null;
  mux_playback_id: string | null;
}

interface Module {
  id: string;
  course_id: string;
  title: string;
  module_order: number;
  lessons?: Lesson[];
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  price: number | null;
  status: string;
  created_by_user_id: string | null;
  creator?: { full_name: string | null } | null;
}

export default function CourseDetailScreen({ route, navigation }: any) {
  const { course_id } = route.params;
  const { user } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [enrollment, setEnrollment] = useState<{
    progress_percentage: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCourseDetail();
  }, [course_id, user?.id]);

  const fetchCourseDetail = async () => {
    if (!course_id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: courseData, error: courseError } = await supabase
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
        .eq('id', course_id)
        .single();

      if (courseError) throw courseError;
      const creatorRel = (c: any) => c.creator;
      const creator = Array.isArray(creatorRel(courseData))
        ? creatorRel(courseData)[0]
        : creatorRel(courseData);
      setCourse({ ...courseData, creator } as Course);

      const { data: modulesData, error: modulesError } = await supabase
        .from('modules')
        .select('*')
        .eq('course_id', course_id)
        .order('module_order', { ascending: true });

      if (modulesError) throw modulesError;

      const modulesWithLessons = await Promise.all(
        (modulesData || []).map(async (mod: any) => {
          const { data: lessonsData } = await supabase
            .from('lessons')
            .select('*')
            .eq('module_id', mod.id)
            .order('lesson_order', { ascending: true });
          return { ...mod, lessons: lessonsData || [] };
        })
      );

      setModules(modulesWithLessons);

      if (user?.id) {
        const { data: enrollmentData } = await supabase
          .from('course_enrollments')
          .select('progress_percentage')
          .eq('course_id', course_id)
          .eq('user_id', user.id)
          .maybeSingle();
        setEnrollment(enrollmentData as any);
      } else {
        setEnrollment(null);
      }
    } catch (error) {
      console.error('Error fetching course:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEnroll = () => {
    // Placeholder - could insert into course_enrollments
  };

  const handleContinue = () => {
    // Placeholder - could navigate to first unwatched lesson
  };

  const creatorName =
    (course?.creator as any)?.full_name ||
    (Array.isArray(course?.creator) ? course?.creator?.[0]?.full_name : null) ||
    'Unknown';

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading course...</Text>
      </View>
    );
  }

  if (!course) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Course not found</Text>
      </View>
    );
  }

  const isEnrolled = !!enrollment;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {course.category && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{course.category}</Text>
          </View>
        )}
        <Text style={styles.title}>{course.title}</Text>
        <Text style={styles.creator}>by {creatorName}</Text>
        <Text style={styles.price}>
          {course.price != null && course.price > 0
            ? `$${course.price}`
            : 'Free'}
        </Text>
      </View>

      {course.description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.description}>{course.description}</Text>
        </View>
      )}

      {isEnrolled && (
        <View style={styles.section}>
          <View style={styles.progressHeader}>
            <Text style={styles.sectionTitle}>Your Progress</Text>
            <Text style={styles.progressText}>
              {Math.round(enrollment?.progress_percentage || 0)}%
            </Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${enrollment?.progress_percentage || 0}%`,
                },
              ]}
            />
          </View>
          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinue}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Curriculum</Text>
        {modules.length === 0 ? (
          <Text style={styles.emptyText}>No modules yet</Text>
        ) : (
          modules.map((module) => (
            <CollapsibleSection
              key={module.id}
              title={module.title}
              summary={`${module.lessons?.length || 0} lessons`}
              defaultExpanded={false}
            >
              {module.lessons && module.lessons.length > 0 ? (
                module.lessons.map((lesson, idx) => (
                  <View key={lesson.id} style={styles.lessonRow}>
                    <Text style={styles.lessonNumber}>{idx + 1}.</Text>
                    <Text style={styles.lessonTitle}>{lesson.title}</Text>
                    <Text style={styles.lessonDuration}>▶</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyLessonText}>No lessons</Text>
              )}
            </CollapsibleSection>
          ))
        )}
      </View>

      {!isEnrolled && (
        <TouchableOpacity style={styles.enrollButton} onPress={handleEnroll}>
          <Text style={styles.enrollButtonText}>Enroll</Text>
        </TouchableOpacity>
      )}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    paddingBottom: 40,
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
  errorContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },
  header: {
    backgroundColor: '#2a2a4e',
    padding: 20,
    marginBottom: 16,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#3a3a6e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  categoryBadgeText: {
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  creator: {
    color: '#8b5cf6',
    fontSize: 15,
    marginBottom: 4,
  },
  price: {
    color: '#10b981',
    fontSize: 18,
    fontWeight: '700',
  },
  section: {
    padding: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  description: {
    color: '#ccc',
    fontSize: 15,
    lineHeight: 22,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#3a3a6e',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 4,
  },
  continueButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  lessonNumber: {
    color: '#888',
    fontSize: 14,
    width: 24,
  },
  lessonTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  lessonDuration: {
    color: '#666',
    fontSize: 12,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
  },
  emptyLessonText: {
    color: '#666',
    fontSize: 13,
    padding: 12,
  },
  enrollButton: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  enrollButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 40,
  },
});
