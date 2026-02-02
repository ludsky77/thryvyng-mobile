import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  UIManager,
  LayoutAnimation,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
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

function getLessonTypeLabel(lessonType: string | null): string {
  switch (lessonType?.toLowerCase()) {
    case 'video':
      return 'Video';
    case 'quiz':
      return 'Quiz';
    case 'text':
      return 'Text';
    default:
      return 'Text';
  }
}

function getBlockTypeLabel(blockType: string | null | undefined): string {
  const labels: Record<string, string> = {
    video: '🎬 Video Lesson',
    swipe_stack: '🃏 Swipe Stack',
    pathway: '🎯 Decision Pathway',
    quiz: '❓ Quiz',
    summary: '📄 Summary',
    download: '📥 Download',
    q_and_a: '💬 Q&A & Resources',
  };
  return labels[blockType || ''] || '📚 Content';
}

interface Lesson {
  id: string;
  module_id: string;
  title: string;
  lesson_order: number;
  lesson_type?: string | null;
  mux_playback_id?: string | null;
  video_url?: string | null;
  transcript?: string | null;
}

interface LessonBlock {
  id: string;
  lesson_id: string;
  block_type: string;
  content?: Record<string, unknown> | null;
  sort_order: number;
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
  xp_per_lesson?: number | null;
  xp_completion_bonus?: number | null;
  modules?: Module[];
}

interface Enrollment {
  id: string;
  progress_percentage: number;
  completed_at?: string | null;
}

export default function CoursePlayerScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const courseId = route.params?.courseId;
  const enrollmentId = route.params?.enrollmentId;

  const videoRef = useRef<Video>(null);

  const [course, setCourse] = useState<Course | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [lessonBlocks, setLessonBlocks] = useState<LessonBlock[]>([]);
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>([]);
  const [expandedModules, setExpandedModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [videoStatus, setVideoStatus] = useState<AVPlaybackStatus | null>(null);

  const totalLessons =
    course?.modules?.reduce(
      (sum, m) => sum + (m.lessons?.length || 0),
      0
    ) ?? 0;
  const completedCount = completedLessonIds.length;
  const progressPercent =
    totalLessons > 0
      ? Math.round((completedCount / totalLessons) * 100)
      : 0;

  const fetchLessonContent = useCallback(async (lessonId: string) => {
    const { data: lesson } = await supabase
      .from('lessons')
      .select('*, transcript')
      .eq('id', lessonId)
      .single();

    const { data: blocks } = await supabase
      .from('lesson_blocks')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('sort_order', { ascending: true });

    if (lesson) {
      setCurrentLesson(lesson as Lesson);
    }
    setLessonBlocks((blocks as LessonBlock[]) || []);
    setCurrentBlockIndex(0);
    setCurrentCardIndex(0);
    setShowAnswer(false);
    setShowTranscript(false);
  }, []);

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
          lessons(id, title, lesson_order, lesson_type, mux_playback_id, video_url)
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
      if (modules[0]?.lessons?.[0]) {
        const firstLesson = modules[0].lessons[0];
        setCurrentLesson(firstLesson);
        setCurrentModuleIndex(0);
        setCurrentLessonIndex(0);
        setExpandedModules([modules[0].id]);
        fetchLessonContent(firstLesson.id);
      }
    } else {
      setCourse(null);
    }
    } catch (err) {
      console.error('Error fetching course:', err);
      setCourse(null);
    } finally {
      setLoading(false);
    }
  }, [courseId, fetchLessonContent]);

  const fetchProgress = useCallback(async () => {
    if (!enrollmentId) return;
    const { data: enrollmentData } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('id', enrollmentId)
      .single();

    if (enrollmentData) {
      setEnrollment(enrollmentData as Enrollment);
    }

    const { data: completions } = await supabase
      .from('lesson_completions')
      .select('lesson_id')
      .eq('enrollment_id', enrollmentId);

    if (completions && Array.isArray(completions)) {
      setCompletedLessonIds(completions.map((c: { lesson_id: string }) => c.lesson_id));
    }
  }, [enrollmentId]);

  useEffect(() => {
    fetchCourse();
  }, [fetchCourse]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  const autoAdvanceToNextLesson = useCallback(() => {
    if (!course?.modules) return;
    const allLessons = course.modules.flatMap((m) => m.lessons || []);
    const idx = allLessons.findIndex((l) => l.id === currentLesson?.id);
    if (idx >= 0 && idx < allLessons.length - 1) {
      const nextLesson = allLessons[idx + 1];
      setCurrentLesson(nextLesson);
      fetchLessonContent(nextLesson.id);
      const nextModule = course.modules.find((m) =>
        m.lessons?.some((l) => l.id === nextLesson.id)
      );
      if (nextModule) {
        let moduleIndex = course.modules.findIndex((m) => m.id === nextModule.id);
        if (moduleIndex < 0) moduleIndex = 0;
        const lessonIndex = nextModule.lessons?.findIndex(
          (l) => l.id === nextLesson.id
        ) ?? 0;
        setCurrentModuleIndex(moduleIndex);
        setCurrentLessonIndex(lessonIndex);
        if (!expandedModules.includes(nextModule.id)) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setExpandedModules((prev) => [...prev, nextModule.id]);
        }
      }
    }
  }, [course, currentLesson?.id, expandedModules, fetchLessonContent]);

  const markLessonComplete = useCallback(async () => {
    if (!currentLesson || completedLessonIds.includes(currentLesson.id)) return;
    if (!course || !enrollmentId) return;

    const xpEarned = course.xp_per_lesson ?? 10;
    const newCompletedIds = [...completedLessonIds, currentLesson.id];
    setCompletedLessonIds(newCompletedIds);

    await supabase.from('lesson_completions').insert({
      enrollment_id: enrollmentId,
      lesson_id: currentLesson.id,
      xp_earned: xpEarned,
      completed_at: new Date().toISOString(),
    }).then(() => {}).catch(() => {});

    const total = course.modules?.reduce(
      (sum, m) => sum + (m.lessons?.length || 0),
      0
    ) ?? 1;
    const newProgress = Math.round((newCompletedIds.length / total) * 100);

    await supabase
      .from('course_enrollments')
      .update({
        progress_percentage: newProgress,
        completed_at: newProgress === 100 ? new Date().toISOString() : null,
      })
      .eq('id', enrollmentId);

    setEnrollment((prev) =>
      prev ? { ...prev, progress_percentage: newProgress } : null
    );

    if (newProgress === 100) {
      Alert.alert('🎉 Congratulations!', 'You have completed this course!');
    } else {
      Alert.alert('✓ Lesson Complete', `+${xpEarned} XP earned!`);
    }
    autoAdvanceToNextLesson();
  }, [
    currentLesson,
    completedLessonIds,
    course,
    enrollmentId,
    autoAdvanceToNextLesson,
  ]);

  const selectLesson = useCallback(
    (lesson: Lesson, module: Module) => {
      setCurrentLesson(lesson);
      setCurrentBlockIndex(0);
      setCurrentCardIndex(0);
      setShowAnswer(false);
      setShowTranscript(false);
      fetchLessonContent(lesson.id);
      const moduleIndex = course?.modules?.findIndex((m) => m.id === module.id) ?? 0;
      const lessonIndex = module.lessons?.findIndex((l) => l.id === lesson.id) ?? 0;
      setCurrentModuleIndex(moduleIndex);
      setCurrentLessonIndex(lessonIndex);
      if (!expandedModules.includes(module.id)) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedModules((prev) => [...prev, module.id]);
      }
      videoRef.current?.stopAsync?.();
    },
    [course?.modules, expandedModules, fetchLessonContent]
  );

  const toggleModule = useCallback((moduleId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedModules((prev) =>
      prev.includes(moduleId)
        ? prev.filter((id) => id !== moduleId)
        : [...prev, moduleId]
    );
  }, []);

  const renderVideoBlock = useCallback(
    (block: LessonBlock | { content?: { mux_playback_id?: string; video_url?: string } }) => {
      const content = block?.content as { mux_playback_id?: string; video_url?: string } | undefined;
      const playbackId =
        content?.mux_playback_id || (currentLesson as Lesson)?.mux_playback_id;
      const videoUrl = playbackId
        ? `https://stream.mux.com/${playbackId}.m3u8`
        : (content?.video_url || (currentLesson as Lesson)?.video_url) || null;

      return (
        <View style={styles.videoBlockWrapper}>
          <View style={styles.videoContainer}>
            {videoUrl ? (
              <Video
                ref={videoRef}
                source={{ uri: videoUrl }}
                style={styles.video}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={false}
              />
            ) : (
              <View style={styles.noVideo}>
                <Text style={styles.noVideoText}>📄 No video for this lesson</Text>
              </View>
            )}
          </View>
        </View>
      );
    },
    [currentLesson]
  );

  const renderSwipeStackBlock = useCallback((block: LessonBlock) => {
    const cards = (block.content?.cards as { front: string; back: string; imageUrl?: string }[]) || [];
    const card = cards[currentCardIndex];

    if (!card) {
      return (
        <View style={styles.blockContainer}>
          <Text style={styles.noContent}>No cards available</Text>
        </View>
      );
    }

    return (
      <View style={styles.blockContainer}>
        <Text style={styles.cardCounter}>
          Card {currentCardIndex + 1} of {cards.length}
        </Text>
        <TouchableOpacity
          style={styles.flashcard}
          onPress={() => setShowAnswer(!showAnswer)}
          activeOpacity={0.9}
        >
          {card.imageUrl && !showAnswer && (
            <Image source={{ uri: card.imageUrl }} style={styles.cardImage} />
          )}
          <View style={styles.cardContent}>
            {!showAnswer ? (
              <>
                <Text style={styles.cardLabel}>Question</Text>
                <Text style={styles.cardFront}>{card.front}</Text>
                <Text style={styles.tapHint}>Tap to reveal answer</Text>
              </>
            ) : (
              <>
                <Text style={styles.cardLabel}>Answer</Text>
                <Text style={styles.cardBack}>{card.back}</Text>
                <Text style={styles.tapHint}>Tap to see question</Text>
              </>
            )}
          </View>
        </TouchableOpacity>
        <View style={styles.cardNavigation}>
          <TouchableOpacity
            style={[
              styles.cardNavButton,
              currentCardIndex === 0 && styles.cardNavDisabled,
            ]}
            onPress={() => {
              setCurrentCardIndex(currentCardIndex - 1);
              setShowAnswer(false);
            }}
            disabled={currentCardIndex === 0}
          >
            <Text style={styles.cardNavText}>← Previous</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.cardNavButton,
              currentCardIndex === cards.length - 1 && styles.cardNavDisabled,
            ]}
            onPress={() => {
              setCurrentCardIndex(currentCardIndex + 1);
              setShowAnswer(false);
            }}
            disabled={currentCardIndex === cards.length - 1}
          >
            <Text style={styles.cardNavText}>Next →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [currentCardIndex, showAnswer]);

  const renderPathwayBlock = useCallback((_block: LessonBlock) => (
    <View style={styles.blockContainer}>
      <View style={styles.placeholderBlock}>
        <Text style={styles.placeholderIcon}>🎯</Text>
        <Text style={styles.placeholderTitle}>Decision Pathway</Text>
        <Text style={styles.placeholderText}>
          Interactive scenario-based learning coming to mobile soon!
        </Text>
        <Text style={styles.placeholderHint}>
          Complete this on the web app for now.
        </Text>
      </View>
    </View>
  ), []);

  const renderQuizBlock = useCallback((_block: LessonBlock) => (
    <View style={styles.blockContainer}>
      <View style={styles.placeholderBlock}>
        <Text style={styles.placeholderIcon}>❓</Text>
        <Text style={styles.placeholderTitle}>Quiz</Text>
        <Text style={styles.placeholderText}>
          Quiz functionality coming to mobile soon!
        </Text>
      </View>
    </View>
  ), []);

  const renderDownloadBlock = useCallback((_block: LessonBlock) => (
    <View style={styles.blockContainer}>
      <View style={styles.placeholderBlock}>
        <Text style={styles.placeholderIcon}>📄</Text>
        <Text style={styles.placeholderTitle}>Resources</Text>
        <Text style={styles.placeholderText}>
          Downloads available on web app.
        </Text>
      </View>
    </View>
  ), []);

  const renderPlaceholderBlock = useCallback((block: LessonBlock) => (
    <View style={styles.blockContainer}>
      <View style={styles.placeholderBlock}>
        <Text style={styles.placeholderIcon}>📚</Text>
        <Text style={styles.placeholderTitle}>
          {getBlockTypeLabel(block.block_type)}
        </Text>
        <Text style={styles.placeholderText}>Content type not yet supported on mobile.</Text>
      </View>
    </View>
  ), []);

  const renderCurrentBlock = useCallback(() => {
    const block = lessonBlocks[currentBlockIndex];
    if (!block) {
      return renderVideoBlock({
        content: {
          mux_playback_id: currentLesson?.mux_playback_id ?? undefined,
          video_url: currentLesson?.video_url ?? undefined,
        },
      });
    }
    switch (block.block_type) {
      case 'video':
        return renderVideoBlock(block);
      case 'swipe_stack':
        return renderSwipeStackBlock(block);
      case 'pathway':
        return renderPathwayBlock(block);
      case 'quiz':
        return renderQuizBlock(block);
      case 'summary':
      case 'download':
        return renderDownloadBlock(block);
      default:
        return renderPlaceholderBlock(block);
    }
  }, [
    lessonBlocks,
    currentBlockIndex,
    currentLesson,
    renderVideoBlock,
    renderSwipeStackBlock,
    renderPathwayBlock,
    renderQuizBlock,
    renderDownloadBlock,
    renderPlaceholderBlock,
  ]);

  const isLastStep =
    lessonBlocks.length === 0 || currentBlockIndex >= lessonBlocks.length - 1;

  const goToPreviousLesson = useCallback(() => {
    if (!course?.modules) return;
    const allLessons = course.modules.flatMap((m) => m.lessons || []);
    const currentIndex = allLessons.findIndex((l) => l.id === currentLesson?.id);
    if (currentIndex > 0) {
      const prevLesson = allLessons[currentIndex - 1];
      const prevModule = course.modules.find((m) =>
        m.lessons?.some((l) => l.id === prevLesson.id)
      );
      if (prevModule) selectLesson(prevLesson, prevModule);
    }
  }, [course, currentLesson?.id, selectLesson]);

  const handlePrevious = useCallback(() => {
    if (currentBlockIndex > 0) {
      setCurrentBlockIndex(currentBlockIndex - 1);
      setCurrentCardIndex(0);
      setShowAnswer(false);
    } else {
      goToPreviousLesson();
    }
  }, [currentBlockIndex, goToPreviousLesson]);

  const handleNext = useCallback(() => {
    if (!isLastStep) {
      setCurrentBlockIndex(currentBlockIndex + 1);
      setCurrentCardIndex(0);
      setShowAnswer(false);
    } else {
      markLessonComplete();
    }
  }, [isLastStep, currentBlockIndex, markLessonComplete]);

  if (loading && !course) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Loading course...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!course) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Course not found</Text>
          <TouchableOpacity
            style={styles.backButtonStandalone}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonIcon}>← Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentModule = course.modules?.[currentModuleIndex];
  const isCurrentLessonCompleted = currentLesson
    ? completedLessonIds.includes(currentLesson.id)
    : false;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {course.title}
          </Text>
          <Text style={styles.headerSubtitle}>
            {completedCount}/{totalLessons} lessons completed
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.progressBlock}>
        <Text style={styles.progressLabel}>{progressPercent}% Complete</Text>
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.min(100, progressPercent)}%` },
            ]}
          />
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {lessonBlocks.length > 1 && (
          <View style={styles.stepIndicator}>
            <View style={styles.stepDots}>
              {lessonBlocks.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.stepDot,
                    index === currentBlockIndex && styles.stepDotActive,
                    index < currentBlockIndex && styles.stepDotCompleted,
                  ]}
                />
              ))}
            </View>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>
                🎬 {getBlockTypeLabel(lessonBlocks[currentBlockIndex]?.block_type)} • Step{' '}
                {currentBlockIndex + 1} of {lessonBlocks.length}
              </Text>
            </View>
          </View>
        )}

        {currentLesson && (
          <>
            <View style={styles.lessonInfo}>
              <Text style={styles.moduleTitle}>
                Module {currentModuleIndex + 1}: {currentModule?.title ?? ''}
              </Text>
              <Text style={styles.lessonTitle}>{currentLesson.title}</Text>
            </View>

            {renderCurrentBlock()}

            {/* Transcript Section - Collapsible */}
            {currentLesson?.transcript && (
              <View style={styles.transcriptSection}>
                <TouchableOpacity
                  style={styles.transcriptHeader}
                  onPress={() => setShowTranscript(!showTranscript)}
                >
                  <Text style={styles.transcriptTitle}>📜 Transcript</Text>
                  <Text style={styles.transcriptToggle}>
                    {showTranscript ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>
                {showTranscript && (
                  <View style={styles.transcriptContent}>
                    <Text style={styles.transcriptText}>
                      {currentLesson.transcript}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.markCompleteButton,
                completedLessonIds.includes(currentLesson.id) &&
                  styles.markCompleteButtonDone,
              ]}
              onPress={markLessonComplete}
              disabled={completedLessonIds.includes(currentLesson.id)}
            >
              <Text
                style={[
                  styles.markCompleteText,
                  completedLessonIds.includes(currentLesson.id) &&
                    styles.markCompleteTextDone,
                ]}
              >
                {completedLessonIds.includes(currentLesson.id)
                  ? '✓ Completed'
                  : '✓ Mark as Complete'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {!currentLesson && (
          <View style={styles.noVideoPlaceholder}>
            <Text style={styles.noVideoText}>No lesson selected</Text>
            <Text style={styles.noVideoSubtext}>
              Tap a lesson from the curriculum below
            </Text>
          </View>
        )}

        <View style={styles.curriculumSection}>
          <Text style={styles.curriculumTitle}>Course Content</Text>
          {course.modules?.map((module, modIdx) => {
            const isExpanded = expandedModules.includes(module.id);
            const lessons = module.lessons || [];
            return (
              <View key={module.id} style={styles.moduleBlock}>
                <TouchableOpacity
                  style={styles.moduleHeader}
                  onPress={() => toggleModule(module.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.moduleHeaderTitle}>
                    Module {modIdx + 1}: {module.title}
                  </Text>
                  <Text style={styles.moduleHeaderMeta}>
                    {lessons.length} lesson{lessons.length !== 1 ? 's' : ''}
                  </Text>
                  <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {isExpanded && (
                  <View style={styles.lessonsList}>
                    {lessons.map((lesson, lessonIdx) => {
                      const isCompleted = completedLessonIds.includes(lesson.id);
                      const isCurrent = currentLesson?.id === lesson.id;
                      return (
                        <TouchableOpacity
                          key={lesson.id}
                          style={[
                            styles.lessonRow,
                            isCurrent && styles.lessonRowCurrent,
                          ]}
                          onPress={() => selectLesson(lesson, module)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.lessonRowIcon,
                              isCompleted && styles.lessonRowIconCompleted,
                            ]}
                          >
                            {isCompleted ? '✓' : getLessonTypeIcon(lesson.lesson_type)}
                          </Text>
                          <Text
                            style={[
                              styles.lessonRowTitle,
                              isCompleted && styles.lessonRowTitleCompleted,
                            ]}
                            numberOfLines={1}
                          >
                            {lesson.title}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Fixed Bottom Navigation */}
      {currentLesson && (
        <View style={styles.bottomNavigation}>
          <TouchableOpacity
            style={styles.navButtonLeft}
            onPress={handlePrevious}
          >
            <Text style={styles.navButtonLeftText}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.stepCounterText}>
            {lessonBlocks.length > 1
              ? `Step ${currentBlockIndex + 1} of ${lessonBlocks.length}`
              : 'Step 1 of 1'}
          </Text>

          <TouchableOpacity
            style={styles.navButtonRight}
            onPress={handleNext}
          >
            <Text style={styles.navButtonRightText}>
              {isLastStep ? 'Finish →' : 'Continue →'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
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
  headerCenter: {
    flex: 1,
    marginHorizontal: 12,
    minWidth: 0,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
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
  progressBlock: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
  },
  progressLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 6,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#1e293b',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 120,
  },
  stepIndicator: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  stepDots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4B5563',
  },
  stepDotActive: {
    backgroundColor: '#10B981',
    width: 24,
  },
  stepDotCompleted: {
    backgroundColor: '#10B981',
  },
  stepBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stepBadgeText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '500',
  },
  blockContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  videoBlockWrapper: {
    width: '100%',
    marginBottom: 0,
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    marginBottom: 16,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  noVideo: {
    flex: 1,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 120,
  },
  noContent: {
    color: '#9CA3AF',
    textAlign: 'center',
    padding: 24,
    fontSize: 14,
  },
  transcriptSection: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  transcriptTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  transcriptToggle: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  transcriptContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    maxHeight: 200,
  },
  transcriptText: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 22,
  },
  flashcard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    minHeight: 300,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: 150,
    resizeMode: 'cover',
  },
  cardContent: {
    padding: 20,
    alignItems: 'center',
  },
  cardLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 8,
  },
  cardFront: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  cardBack: {
    color: '#10B981',
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 26,
  },
  tapHint: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 16,
  },
  cardCounter: {
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 12,
  },
  cardNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  cardNavButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cardNavDisabled: {
    opacity: 0.3,
  },
  cardNavText: {
    color: '#10B981',
    fontWeight: '500',
  },
  placeholderBlock: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  placeholderTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  placeholderText: {
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 8,
  },
  placeholderHint: {
    color: '#6B7280',
    fontSize: 12,
  },
  bottomNavigation: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  navButtonLeft: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  navButtonLeftText: {
    color: '#9CA3AF',
    fontWeight: '500',
  },
  navButtonRight: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#10B981',
  },
  navButtonRightText: {
    color: '#fff',
    fontWeight: '600',
  },
  stepCounterText: {
    color: '#6B7280',
    fontSize: 14,
  },
  noVideoPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  noVideoText: {
    color: '#94a3b8',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  noVideoSubtext: {
    color: '#cbd5e1',
    fontSize: 14,
    textAlign: 'center',
  },
  lessonInfo: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  moduleTitle: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 4,
  },
  lessonTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  markCompleteButton: {
    marginHorizontal: 16,
    marginBottom: 24,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#10B981',
    alignItems: 'center',
  },
  markCompleteButtonDone: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  markCompleteText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
  },
  markCompleteTextDone: {
    color: '#fff',
  },
  curriculumSection: {
    paddingHorizontal: 16,
  },
  curriculumTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },
  moduleBlock: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  moduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  moduleHeaderTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginRight: 8,
  },
  moduleHeaderMeta: {
    color: '#94a3b8',
    fontSize: 13,
    marginRight: 8,
  },
  chevron: {
    color: '#94a3b8',
    fontSize: 12,
  },
  lessonsList: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 4,
  },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  lessonRowCurrent: {
    borderLeftColor: '#8b5cf6',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  lessonRowIcon: {
    fontSize: 16,
    marginRight: 12,
    width: 24,
    textAlign: 'center',
    color: '#94a3b8',
  },
  lessonRowIconCompleted: {
    color: '#10B981',
  },
  lessonRowTitle: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 14,
  },
  lessonRowTitleCompleted: {
    color: '#10B981',
  },
  bottomSpacer: {
    height: 80,
  },
});
