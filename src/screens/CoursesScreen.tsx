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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { playbookVisible } from '../constants/playbookLaunch';

const FILTER_OPTIONS = [
  { key: 'All Courses', dbValue: 'all', color: '#1e293b' },
  { key: 'Master Class', dbValue: 'master_class', color: '#8B5CF6' },
  { key: 'Pathway', dbValue: 'pathway', color: '#3B82F6' },
  { key: 'Foundations', dbValue: 'foundations', color: '#10B981' },
  { key: 'Club House', dbValue: 'club_house', color: '#F59E0B' },
  { key: 'Parents Corner', dbValue: 'parents_corner', color: '#EC4899' },
] as const;

/**
 * The featured card's chalk sketch — a run on goal, as the reader's own cover
 * draws it. Written out here rather than imported from
 * `src/features/pac-playbook/`: this screen may touch the launch switch (two
 * constants, a leaf by design) and nothing else of that feature, or opening
 * the course list would evaluate the reader's module graph and the lazy
 * boundary would be gone. Colours are the playbook theme's own, by value:
 * board `#0b1220`, chalk `#e8ecf2` (src/features/pac-playbook/theme.ts:65,73).
 */
function PlaybookChalkMark() {
  return (
    <Svg width={190} height={84} viewBox="0 0 220 96">
      <G
        fill="none"
        stroke="#e8ecf2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.55}
      >
        {/* the goal line, the frame and the six-yard box */}
        <Path d="M8 88 L212 88" strokeWidth={1} />
        <Path d="M78 88 L78 62 L142 62 L142 88" strokeWidth={1.4} />
        <Path d="M98 88 L98 76 L122 76 L122 88" strokeWidth={1} />
        {/* two of ours, one of theirs */}
        <Circle cx={36} cy={34} r={7} strokeWidth={1.6} />
        <Circle cx={146} cy={26} r={7} strokeWidth={1.6} />
        <Path d="M96 18 l10 10 m0 -10 l-10 10" strokeWidth={1.6} />
        {/* the pass, and the run that finishes it */}
        <Path d="M44 31 C 78 20, 112 18, 138 23" strokeWidth={1.3} strokeDasharray="4 4" />
        <Path d="M132 19 l7 4 -7 4" strokeWidth={1.3} />
        <Path d="M142 34 C 134 48, 124 56, 112 60" strokeWidth={1.3} />
        <Path d="M118 55 l-7 6 2 -9" strokeWidth={1.3} />
      </G>
    </Svg>
  );
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

  // The Playbook tile's own visibility, read in two places below — the tile
  // itself and the banner's course count, so the count cannot disagree with
  // what is on screen (the web does the same at CourseCatalog.tsx:341).
  const showPlaybook = playbookVisible && selectedFilter === 'All Courses';

  const listHeader = (
    <>
      {/* Header Banner */}
      <LinearGradient
        colors={['#7c3aed', '#4f46e5', '#3b82f6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.banner}
      >
        {/* HALF HEIGHT — Lu's phone look, Oct 30: title, one line, the three
            counts. The 📚 glyph (32pt + 8 margin) is gone, the description is
            one short line instead of two long ones, and the paddings are cut.
            ~236pt → ~118pt. The line is NOT given `numberOfLines`: short
            enough to sit on one row at the 375pt floor, and free to wrap
            rather than clip if it ever does not (rule R-G). */}
        <Text style={styles.bannerTitle}>Course Library</Text>
        <Text style={styles.bannerSubtitle}>Expert-led courses. Earn XP as you learn.</Text>
        <View style={styles.statsRowBanner}>
          <Text style={styles.statBanner}>
            {/* The Playbook tile counts, so the banner cannot disagree with
                what is on screen — the web's CourseCatalog.tsx:341 rule. */}
            {filteredCourses.length + (showPlaybook ? 1 : 0)} Courses
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

      {/* The PAC Playbook — not a course row, so it is written by hand rather
          than fetched. Mirrors the web's synthetic catalog tile
          (web CourseCatalog.tsx:176-186): it is free and it belongs to none of
          the five categories, so a category filter hides it exactly as that
          filter hides a course outside the chosen category. `playbookVisible`
          comes first, so until the launch switch flips the tile is absent
          (src/constants/playbookLaunch.ts). */}
      {showPlaybook && (
        <TouchableOpacity
          style={styles.playbookCard}
          onPress={() => navigation.navigate('Playbook')}
          activeOpacity={0.85}
        >
          {/* A FEATURED CARD, not a list row — Lu's ruling of Oct 30, option A.
              Same family as the course cards below: `#1e293b` box, 12pt
              radius, a banded top over `cardContent`. What differs is what
              the book is — the band is the reader's own chalkboard instead of
              a category gradient, and it is full width, above the grid. */}
          <View style={styles.playbookBand}>
            <PlaybookChalkMark />
          </View>
          <View style={styles.cardContent}>
            <View style={styles.playbookRow}>
              <View style={styles.playbookRowText}>
                <Text style={styles.cardTitle}>PAC Playbook</Text>
                {/* ONE LINE, and short enough to stay one at the 375pt
                    floor: 39 characters at 13pt is ~246pt against the ~285pt
                    the row leaves beside the chevron. No `numberOfLines`, so
                    it wraps rather than clips if it ever runs over (R-G). */}
                <Text style={styles.cardDescription}>
                  How we see the game and how we play it.
                </Text>
                <Text style={styles.playbookTileFree}>Free</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#8B5CF6" />
            </View>
          </View>
        </TouchableOpacity>
      )}
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

  // `!showPlaybook` is the web's own guard (CourseCatalog.tsx:326): with no
  // courses but the Playbook tile on screen, "No courses found" would be a lie
  // about a list that has one row in it.
  if (filteredCourses.length === 0 && !showPlaybook && !loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonIcon}>←</Text>
          </TouchableOpacity>
          {/* No title here: the hero below already names the screen. */}
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
      </SafeAreaView>
    );
  }

  return (
    /* SAFE AREA — Lu, Oct 30. The header row used to be drawn at y 0, under
       the status bar; the old hero's `paddingTop: 56` hid how close it was
       and halving the hero exposed it. `SafeAreaView edges={['top']}` from
       `react-native-safe-area-context` is the pattern the sibling HomeStack
       screens use (`ClubHubScreen.tsx:69`, and GamesHub / TrainingStudio);
       the bottom edge is the tab bar's and is deliberately not claimed. */
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header. No title: the hero below already prints "Course Library",
          and the screen was saying it twice. */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
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
    </SafeAreaView>
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
  // Referenced by the empty-state header only (:399-405) and never defined, so all
  // three render unstyled today. Declared empty to keep exactly that rendering --
  // real values would move pixels. See docs/recon/stage4-types.md, Group D.
  backButton: {},
  backButtonIcon: {},
  headerRight: {},
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  bannerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
    marginBottom: 10,
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
  // The Playbook FEATURED CARD (Lu, Oct 30, option A). The box is the course
  // card's own — `#1e293b`, 12pt radius, `overflow:'hidden'` so the band
  // follows the corners — at full width above the grid, and the band on top
  // is the reader's chalkboard where a course has its category gradient.
  playbookCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  playbookBand: {
    height: 120,
    backgroundColor: '#0b1220',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1f2b44',
  },
  playbookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playbookRowText: {
    flex: 1,
  },
  playbookTileFree: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10B981',
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
