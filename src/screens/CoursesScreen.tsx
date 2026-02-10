import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const FILTER_OPTIONS = [
  { key: 'All Courses', dbValue: 'all', color: '#1e293b' },
  { key: 'Master Class', dbValue: 'master_class', color: '#8B5CF6' },
  { key: 'Pathway', dbValue: 'pathway', color: '#3B82F6' },
  { key: 'Foundations', dbValue: 'foundations', color: '#10B981' },
  { key: 'Club House', dbValue: 'club_house', color: '#F59E0B' },
  { key: 'Parents Corner', dbValue: 'parents_corner', color: '#EC4899' },
] as const;

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
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

interface Profile {
  full_name: string | null;
  avatar_url: string | null;
}

interface Lesson {
  id: string;
}

interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  category: string;
  price: number;
  status: string;
  created_by_user_id: string | null;
  thumbnail_url?: string | null;
  xp_per_lesson: number | null;
  xp_completion_bonus: number | null;
  created_at: string;
  creator?: Profile | Profile[] | null;
  modules?: Module[];
  moduleCount?: number;
  lessonCount?: number;
  estimatedMinutes?: number;
  totalXp?: number;
}

function resolveCreator(creator: Profile | Profile[] | null | undefined): Profile | null {
  if (!creator) return null;
  return Array.isArray(creator) ? creator[0] ?? null : creator;
}

export default function CoursesScreen({ navigation }: any) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isTablet = width >= 600;
  const numColumns = isTablet ? 2 : 1;

  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('All Courses');
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<string[]>([]);
  const filteredCourses = useMemo(() => {
    const selected = FILTER_OPTIONS.find((f) => f.key === selectedFilter);
    if (!selected || selected.dbValue === 'all') return courses;
    return courses.filter(
      (c) => (c.category?.toLowerCase() ?? '') === selected.dbValue.toLowerCase()
    );
  }, [courses, selectedFilter]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('courses')
        .select(
          `
          *,
          creator:profiles!created_by_user_id(full_name, avatar_url),
          modules(id, title, lessons(id))
        `
        )
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Courses fetch error:', error);
        setCourses([]);
        return;
      }

      if (data) {
        const enriched: Course[] = data.map((course: any) => {
          const moduleList = course.modules || [];
          const lessonCount =
            moduleList.reduce(
              (sum: number, m: Module) => sum + (m.lessons?.length || 0),
              0
            ) || 0;
          const xpPerLesson = course.xp_per_lesson ?? 10;
          const completionBonus = course.xp_completion_bonus ?? 50;
          return {
            ...course,
            moduleCount: moduleList.length,
            lessonCount,
            estimatedMinutes: lessonCount * 8,
            totalXp: lessonCount * xpPerLesson + completionBonus,
          };
        });
        setCourses(enriched);
      } else {
        setCourses([]);
      }
    } catch (err) {
      console.error('Error fetching courses:', err);
      setCourses([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchEnrollments = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('course_enrollments')
      .select('course_id')
      .eq('user_id', user.id);
    if (data) {
      setEnrolledCourseIds(data.map((e: { course_id: string }) => e.course_id));
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCourses();
    fetchEnrollments();
  }, [fetchCourses, fetchEnrollments]);

  const handleFilterSelect = useCallback((filter: (typeof FILTER_OPTIONS)[number]) => {
    setSelectedFilter(filter.key);
  }, []);

  const totalXp = filteredCourses.reduce((sum, c) => sum + (c.totalXp ?? 0), 0);

  const listHeader = (
    <>
      {/* Header Banner */}
      <LinearGradient
        colors={['#7c3aed', '#4f46e5', '#3b82f6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.banner}
      >
        <Text style={styles.bannerIcon}>📚</Text>
        <Text style={styles.bannerTitle}>Course Library</Text>
        <Text style={styles.bannerSubtitle}>
          Expand your skills with expert-led courses. Track your progress and
          earn XP as you learn.
        </Text>
        <View style={styles.statsRowBanner}>
          <Text style={styles.statBanner}>
            {filteredCourses.length} Courses
          </Text>
          <Text style={styles.statBanner}>0 Students</Text>
          <Text style={styles.statBanner}>{totalXp.toLocaleString()} XP</Text>
        </View>
      </LinearGradient>

      {/* Filter Section */}
      <View style={styles.filterContainer}>
        <Text style={styles.filterLabel}>Browse by Type</Text>
        <View style={styles.filterGrid}>
          {FILTER_OPTIONS.map((filter) => (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.filterPill,
                selectedFilter === filter.key && { backgroundColor: filter.color },
                selectedFilter !== filter.key && { borderColor: filter.color, borderWidth: 1 },
              ]}
              onPress={() => handleFilterSelect(filter)}
            >
              <Text
                style={[
                  styles.filterText,
                  selectedFilter === filter.key && { color: '#fff' },
                  selectedFilter !== filter.key && { color: filter.color },
                ]}
              >
                {filter.key}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </>
  );

  const onCoursePress = useCallback(
    (courseId: string) => {
      navigation.navigate('CourseDetail', { courseId, course_id: courseId });
    },
    [navigation]
  );

  const onAddToCart = useCallback(() => {
    Alert.alert('Coming Soon', 'Shopping cart coming soon!');
  }, []);

  const renderCourseCard = useCallback(
    ({ item }: { item: Course }) => {
      const creator = resolveCreator(item.creator);
      const categoryColor = getCategoryColor(item.category);
      const isFree = item.price == null || Number(item.price) === 0;
      const priceNum = Number(item.price) || 0;
      const goesToTeam = (priceNum * 0.35).toFixed(2);
      const isEnrolled = enrolledCourseIds.includes(item.id);

      return (
        <TouchableOpacity
          style={styles.card}
          onPress={() => onCoursePress(item.id)}
          activeOpacity={0.85}
        >
          <View style={styles.cardImageContainer}>
            {item.thumbnail_url ? (
              <Image
                source={{ uri: item.thumbnail_url }}
                style={styles.cardImage}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient
                colors={getCategoryGradient(item.category)}
                style={styles.cardGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
            )}
            <View style={styles.badgeOverlay}>
              <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
                <Text style={styles.categoryBadgeText}>{formatCategoryName(item.category)}</Text>
              </View>
              <View style={styles.levelBadge}>
                <Text style={styles.levelBadgeText}>All Levels</Text>
              </View>
            </View>
          </View>

          <View style={styles.cardContent}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.cardDescription} numberOfLines={2}>
              {item.description || 'No description.'}
            </Text>

            <View style={styles.instructorRow}>
              {creator?.avatar_url ? (
                <Image
                  source={{ uri: creator.avatar_url }}
                  style={styles.instructorAvatar}
                />
              ) : (
                <View style={[styles.instructorAvatar, styles.instructorAvatarPlaceholder]}>
                  <Text style={styles.instructorAvatarText}>
                    {(creator?.full_name || '?').charAt(0)}
                  </Text>
                </View>
              )}
              <Text style={styles.instructorLabel} numberOfLines={1}>
                {creator?.full_name || 'Instructor'}
              </Text>
            </View>

            <View style={styles.statsRow}>
              <Text style={styles.statText}>
                📚 {item.moduleCount ?? 0} modules
              </Text>
              <Text style={styles.statText}>
                ⏱ ~{item.estimatedMinutes ?? 0} min
              </Text>
              <Text style={styles.statText}>
                ⚡ {item.totalXp ?? 0} XP
              </Text>
            </View>

            <Text style={styles.ratingText}>⭐ 0.0 (0)</Text>

            <View style={styles.priceRow}>
              <Text style={[styles.price, isFree && styles.priceFree]}>
                {isFree ? '$0' : `$${priceNum.toFixed(2)}`}
              </Text>
            </View>
            <Text style={styles.goesToTeam}>
              ${goesToTeam} goes to your team
            </Text>

            {isEnrolled ? (
              <TouchableOpacity
                style={styles.continueButton}
                onPress={(e) => {
                  e.stopPropagation();
                  onCoursePress(item.id);
                }}
              >
                <Text style={styles.continueButtonText}>Continue →</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.addToCartButton}
                onPress={(e) => {
                  e.stopPropagation();
                  onAddToCart();
                }}
              >
                <Text style={styles.addToCartText}>Add to Cart</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [onCoursePress, onAddToCart, enrolledCourseIds]
  );

  const keyExtractor = useCallback((item: Course) => item.id, []);

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading courses...</Text>
      </View>
    );
  }

  if (filteredCourses.length === 0 && !loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Course Library</Text>
          <View style={styles.headerRight} />
        </View>
        <ScrollView
          contentContainerStyle={styles.emptyScrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#8b5cf6"
            />
          }
        >
          {listHeader}
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📚</Text>
            <Text style={styles.emptyTitle}>No courses found</Text>
            <Text style={styles.emptyText}>
              Try another filter or check back later.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Course Library</Text>
        <View style={styles.headerButton} />
      </View>
      <FlatList
        data={filteredCourses}
        renderItem={renderCourseCard}
        keyExtractor={keyExtractor}
        key={numColumns}
        numColumns={numColumns}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={styles.listHeaderStyle}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={numColumns === 2 ? styles.columnWrapper : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#8b5cf6"
          />
        }
        showsVerticalScrollIndicator={false}
      />
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
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  listHeaderStyle: {
    marginBottom: 8,
  },
  emptyScrollContent: {
    paddingBottom: 40,
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
  banner: {
    paddingTop: 56,
    paddingBottom: 24,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  bannerIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  bannerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  bannerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
    marginBottom: 16,
  },
  statsRowBanner: {
    flexDirection: 'row',
    gap: 16,
  },
  statBanner: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  filterContainer: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 10,
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 8,
    paddingBottom: 40,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    margin: 8,
    overflow: 'hidden',
    flex: 1,
    maxWidth: 400,
  },
  cardImageContainer: {
    height: 160,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardGradient: {
    width: '100%',
    height: '100%',
  },
  badgeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  categoryBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  levelBadge: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  levelBadgeText: {
    color: '#374151',
    fontSize: 11,
    fontWeight: '500',
  },
  cardContent: {
    padding: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
    marginBottom: 10,
  },
  instructorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  instructorAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  instructorAvatarPlaceholder: {
    backgroundColor: '#475569',
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructorAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
  },
  instructorLabel: {
    fontSize: 12,
    color: '#94a3b8',
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 6,
  },
  statText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  ratingText: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 6,
  },
  priceRow: {
    marginBottom: 2,
  },
  price: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  priceFree: {
    color: '#10B981',
  },
  goesToTeam: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 10,
  },
  continueButton: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  addToCartButton: {
    borderWidth: 1,
    borderColor: '#4B5563',
    borderStyle: 'dashed',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  addToCartText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
