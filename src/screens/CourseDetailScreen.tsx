import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Platform,
  UIManager,
  LayoutAnimation,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CollapsibleSection } from '../components/CollapsibleSection';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function getCategoryGradient(category: string): [string, string] {
  const gradients: Record<string, [string, string]> = {
    foundations: ['#10B981', '#059669'],
    pathway: ['#3B82F6', '#2563EB'],
    master_class: ['#8B5CF6', '#7C3AED'],
    club_house: ['#F59E0B', '#D97706'],
    parents_corner: ['#EC4899', '#DB2777'],
  };
  return gradients[category?.toLowerCase()] || ['#6B7280', '#4B5563'];
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    foundations: '#10B981',
    pathway: '#3B82F6',
    master_class: '#8B5CF6',
    club_house: '#F59E0B',
    parents_corner: '#EC4899',
  };
  return colors[category?.toLowerCase()] || '#6B7280';
}

function formatCategoryName(category: string): string {
  if (!category) return '';
  return category
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function getLessonTypeIcon(lessonType: string | null): string {
  switch (lessonType?.toLowerCase()) {
    case 'video':
      return '🎬';
    case 'quiz':
      return '❓';
    case 'text':
      return '📄';
    default:
      return '📄';
  }
}

interface Lesson {
  id: string;
  module_id: string;
  title: string;
  lesson_order: number;
  lesson_type?: string | null;
  mux_playback_id?: string | null;
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
  thumbnail_url?: string | null;
  instructor_name?: string | null;
  instructor_photo_url?: string | null;
  xp_per_lesson?: number | null;
  xp_completion_bonus?: number | null;
  modules?: Module[];
}

interface Enrollment {
  id: string;
  progress_percentage: number;
}

const DESCRIPTION_PREVIEW_LENGTH = 150;

export default function CourseDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const courseId = route.params?.courseId ?? route.params?.course_id;

  const { user } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [loading, setLoading] = useState(true);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const fetchCourse = useCallback(async () => {
    if (!courseId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
      .from('courses')
      .select(
        `
        *,
        modules(
          id, title, module_order,
          lessons(id, title, lesson_order, lesson_type)
        )
      `
      )
      .eq('id', courseId)
      .single();

    if (error) {
      console.error('Course fetch error:', error);
      setCourse(null);
      return;
    }
    if (data) {
      const modules = (data.modules || []).slice();
      modules.sort((a: Module, b: Module) => a.module_order - b.module_order);
      modules.forEach((m: Module) => {
        if (m.lessons) {
          m.lessons.sort(
            (a: Lesson, b: Lesson) => a.lesson_order - b.lesson_order
          );
        }
      });
      setCourse({ ...data, modules });
    } else {
      setCourse(null);
    }
    } catch (err) {
      console.error('Error fetching course:', err);
      setCourse(null);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  const checkEnrollment = useCallback(async () => {
    if (!user?.id || !courseId) return;
    const { data } = await supabase
      .from('course_enrollments')
      .select('id, progress_percentage')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .maybeSingle();
    setEnrollment(data as Enrollment | null);
  }, [user?.id, courseId]);

  useEffect(() => {
    fetchCourse();
  }, [fetchCourse]);

  useEffect(() => {
    if (course) checkEnrollment();
  }, [course, checkEnrollment]);

  const enrollFreeCourse = useCallback(async () => {
    if (!user || !course) return;
    if (Number(course.price) > 0) {
      Alert.alert('Coming Soon', 'Paid course checkout coming soon!');
      return;
    }
    const { data, error } = await supabase
      .from('course_enrollments')
      .insert({
        user_id: user.id,
        course_id: course.id,
        progress_percentage: 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Enroll error:', error);
      Alert.alert('Error', 'Could not enroll. Please try again.');
      return;
    }
    if (data) {
      setEnrollment(data as Enrollment);
      Alert.alert('Enrolled!', 'You are now enrolled in this course.');
    }
  }, [user, course]);

  const handleAddToCart = useCallback(() => {
    Alert.alert('Coming Soon', 'Shopping cart coming soon!');
  }, []);

  const handleContinueLearning = useCallback(() => {
    if (!courseId || !enrollment) return;
    navigation.navigate('CoursePlayer', {
      courseId,
      enrollmentId: enrollment.id,
    });
  }, [navigation, courseId, enrollment]);

  if (loading && !course) {
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
        <TouchableOpacity
          style={styles.backButtonStandalone}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonIcon}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isEnrolled = !!enrollment;
  const modules = course.modules || [];
  const lessonCount = modules.reduce(
    (sum, m) => sum + (m.lessons?.length || 0),
    0
  );
  const xpPerLesson = course.xp_per_lesson ?? 10;
  const completionBonus = course.xp_completion_bonus ?? 50;
  const totalXp = lessonCount * xpPerLesson + completionBonus;
  const estimatedMinutes = lessonCount * 8;
  const instructorName =
    course.instructor_name || 'Instructor';
  const instructorPhoto = course.instructor_photo_url;
  const isFree = course.price == null || Number(course.price) === 0;
  const priceNum = Number(course.price) || 0;
  const description = course.description || '';
  const showReadMore =
    description.length > DESCRIPTION_PREVIEW_LENGTH;
  const descriptionText = descriptionExpanded
    ? description
    : description.slice(0, DESCRIPTION_PREVIEW_LENGTH) +
      (description.length > DESCRIPTION_PREVIEW_LENGTH ? '...' : '');
  const categoryColor = getCategoryColor(course.category ?? '');
  const gradientColors = getCategoryGradient(course.category ?? '');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Course Details</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.heroContainer}>
          {course.thumbnail_url ? (
            <Image
              source={{ uri: course.thumbnail_url }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={gradientColors}
              style={styles.heroGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          )}
          <View style={styles.heroBadgeOverlay}>
            <View style={[styles.heroCategoryBadge, { backgroundColor: categoryColor }]}>
              <Text style={styles.heroCategoryBadgeText}>
                {formatCategoryName(course.category ?? '')}
              </Text>
            </View>
            <View style={styles.heroLevelBadge}>
              <Text style={styles.heroLevelBadgeText}>All Levels</Text>
            </View>
          </View>
        </View>

        {/* Course info */}
        <View style={styles.section}>
          <Text style={styles.title}>{course.title}</Text>

          {description.length > 0 && (
            <View style={styles.descriptionBlock}>
              <Text style={styles.description}>{descriptionText}</Text>
              {showReadMore && (
                <TouchableOpacity
                  onPress={() => {
                    LayoutAnimation.configureNext(
                      LayoutAnimation.Presets.easeInEaseOut
                    );
                    setDescriptionExpanded(!descriptionExpanded);
                  }}
                >
                  <Text style={styles.readMoreLink}>
                    {descriptionExpanded ? 'Show less' : 'Read more'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.instructorRow}>
            {instructorPhoto ? (
              <Image
                source={{ uri: instructorPhoto }}
                style={styles.instructorAvatar}
              />
            ) : (
              <View style={[styles.instructorAvatar, styles.instructorAvatarPlaceholder]}>
                <Text style={styles.instructorAvatarText}>
                  {instructorName.charAt(0)}
                </Text>
              </View>
            )}
            <Text style={styles.instructorName}>{instructorName}</Text>
          </View>

          <View style={styles.statsRow}>
            <Text style={styles.statText}>📚 {modules.length} modules</Text>
            <Text style={styles.statText}>⏱ ~{estimatedMinutes} min</Text>
            <Text style={styles.statText}>⚡ {totalXp} XP</Text>
            <Text style={styles.statText}>⭐ 0.0 (0)</Text>
          </View>
        </View>

        {/* This course includes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>This Course Includes</Text>
          <View style={styles.includesCard}>
            <Text style={styles.includesItem}>• {modules.length} modules with lessons</Text>
            <Text style={styles.includesItem}>• ~{estimatedMinutes} min of content</Text>
            <Text style={styles.includesItem}>• Earn up to {totalXp} XP</Text>
            <Text style={styles.includesItem}>• Certificate of completion</Text>
          </View>
        </View>

        {/* Curriculum */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Course Curriculum</Text>
          {modules.length === 0 ? (
            <Text style={styles.emptyText}>No modules yet</Text>
          ) : (
            modules.map((module, index) => (
              <CollapsibleSection
                key={module.id}
                title={`Module ${index + 1}: ${module.title}`}
                summary={`${module.lessons?.length || 0} lessons`}
                defaultExpanded={index === 0}
              >
                {module.lessons && module.lessons.length > 0 ? (
                  module.lessons.map((lesson) => (
                    <View key={lesson.id} style={styles.lessonRow}>
                      <Text style={styles.lessonIcon}>
                        {getLessonTypeIcon(lesson.lesson_type)}
                      </Text>
                      <Text style={styles.lessonTitle} numberOfLines={1}>
                        {lesson.title}
                      </Text>
                      {!isEnrolled && (
                        <Text style={styles.lessonLock}>🔒</Text>
                      )}
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyLessonText}>No lessons</Text>
                )}
              </CollapsibleSection>
            ))
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom action bar */}
      <View style={styles.bottomBar}>
        {isEnrolled ? (
          <>
            <View style={styles.progressBlock}>
              <Text style={styles.progressLabel}>
                Your progress: {Math.round(enrollment.progress_percentage || 0)}%
              </Text>
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
            <TouchableOpacity
              style={styles.continueButton}
              onPress={handleContinueLearning}
            >
              <Text style={styles.continueButtonText}>Continue Learning →</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.priceRow}>
              <Text style={[styles.priceText, isFree && styles.priceFree]}>
                {isFree ? 'Free' : `$${priceNum.toFixed(2)}`}
              </Text>
            </View>
            {isFree ? (
              <TouchableOpacity
                style={styles.enrollButton}
                onPress={enrollFreeCourse}
              >
                <Text style={styles.enrollButtonText}>Enroll Free</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.addToCartButton}
                onPress={handleAddToCart}
              >
                <Text style={styles.addToCartButtonText}>Add to Cart</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    marginBottom: 16,
  },
  backButtonStandalone: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  heroContainer: {
    height: 200,
    width: '100%',
    position: 'relative',
    backgroundColor: '#1e293b',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    width: '100%',
    height: '100%',
  },
  heroBadgeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroCategoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  heroCategoryBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  heroLevelBadge: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  heroLevelBadgeText: {
    color: '#374151',
    fontSize: 11,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
  descriptionBlock: {
    marginBottom: 16,
  },
  description: {
    color: '#9CA3AF',
    fontSize: 15,
    lineHeight: 22,
  },
  readMoreLink: {
    color: '#8b5cf6',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },
  instructorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  instructorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  instructorAvatarPlaceholder: {
    backgroundColor: '#475569',
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructorAvatarText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '600',
  },
  instructorName: {
    color: '#94a3b8',
    fontSize: 15,
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  statText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  includesCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
  },
  includesItem: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 24,
  },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  lessonIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  lessonTitle: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 14,
  },
  lessonLock: {
    fontSize: 14,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  emptyLessonText: {
    color: '#64748b',
    fontSize: 13,
    padding: 12,
  },
  bottomSpacer: {
    height: 140,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  progressBlock: {
    marginBottom: 12,
  },
  progressLabel: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 6,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  continueButton: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  priceRow: {
    marginBottom: 12,
  },
  priceText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  priceFree: {
    color: '#10B981',
  },
  enrollButton: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  enrollButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  addToCartButton: {
    borderWidth: 2,
    borderColor: '#475569',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addToCartButtonText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '600',
  },
});
