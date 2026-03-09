import React, { useState, useEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import FieldDiagram from '../../components/training/FieldDiagram';
import { getLocalizedContent } from '../../utils/localization';

const PHASE_NAMES_SHORT: Record<number, string> = {
  1: 'Warm-Up',
  2: 'SSG',
  3: 'Pref. Sim',
  4: 'Ext. Pref',
  5: 'Free Play',
};

const PHASE_NAMES_FULL: Record<number, string> = {
  1: 'Technical Warm-Up',
  2: 'Small Sided Game',
  3: 'Preferential Simulation',
  4: 'Extended Preferential Game',
  5: 'Free Play & Reflection',
};

const PHASE_COLORS: Record<number, string> = {
  1: '#06b6d4',
  2: '#8b5cf6',
  3: '#f59e0b',
  4: '#10b981',
  5: '#ef4444',
};

interface Phase {
  id: string;
  phase_number: number;
  phase_type?: string;
  drill_name?: string | null;
  activity_name_es?: string | null;
  duration_minutes?: number | null;
  duration_min?: number | null;
  space_description?: string | null;
  space_description_es?: string | null;
  player_count?: string | number | null;
  player_count_es?: string | null;
  equipment?: string[] | string | null;
  equipment_es?: string[] | string | null;
  coaching_points?: string[] | string | null;
  coaching_points_es?: string[] | string | null;
  key_questions?: string[] | string | null;
  key_questions_es?: string[] | string | null;
  progressions?: string[] | string | null;
  progressions_es?: string[] | string | null;
  regressions?: string[] | string | null;
  regressions_es?: string[] | string | null;
  game_format?: Record<string, unknown> | null;
  game_format_es?: Record<string, unknown> | null;
  variations?: Record<string, unknown> | null;
  variations_es?: Record<string, unknown> | null;
  decision_trigger?: string | null;
  decision_trigger_es?: string | null;
  diagram_data?: Record<string, unknown> | string | null;
}

interface Session {
  id: string;
  title: string;
  title_es?: string | null;
  topic?: string | null;
  age_group?: string | null;
  phase_of_play?: string | null;
  player_level?: string | null;
  status?: string | null;
  duration_minutes?: number | null;
  created_at: string;
  phases?: Phase[] | null;
}

function toArray(val: string[] | string | null | undefined): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'string') return val ? [val] : [];
  return [];
}

const SECTION_HEADER_COLORS: Record<string, string> = {
  'SETUP & PLAYERS': '#a78bfa',
  'GAME FORMAT': '#c084fc',
  'COACHING POINTS': '#8b5cf6',
  'DECISION TRIGGER': '#7c3aed',
  'KEY QUESTIONS': '#a78bfa',
  'VARIATIONS': '#c084fc',
  'PROGRESSIONS': '#10b981',
  'REGRESSIONS': '#ef4444',
};

const PhaseSectionCard = memo(function PhaseSectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const textColor = SECTION_HEADER_COLORS[title] ?? '#a78bfa';
  return (
    <View style={styles.sectionCard}>
      <View style={[styles.sectionCardHeader, { borderTopLeftRadius: 12, borderTopRightRadius: 12 }]}>
        <Text style={[styles.sectionCardHeaderText, { color: textColor }]}>{title}</Text>
      </View>
      <View style={styles.sectionCardBody}>{children}</View>
    </View>
  );
});

function PhaseContentSkeleton() {
  return (
    <View style={styles.phaseContentWrapper}>
      <View style={[styles.skeletonLine, { width: '60%', marginBottom: 16 }]} />
      <View style={[styles.skeletonLine, { width: '90%', marginBottom: 8 }]} />
      <View style={[styles.skeletonLine, { width: '80%', marginBottom: 8 }]} />
      <View style={[styles.skeletonLine, { width: '70%', marginBottom: 16 }]} />
      <View style={[styles.skeletonLine, { width: '85%', marginBottom: 8 }]} />
      <View style={[styles.skeletonLine, { width: '75%', marginBottom: 8 }]} />
    </View>
  );
}

const PhaseContent = memo(function PhaseContent({
  phase,
  diagramWidth,
  language,
}: {
  phase: Phase;
  diagramWidth: number;
  language: 'en' | 'es';
}) {
  const activityName = getLocalizedContent(phase.drill_name, phase.activity_name_es, language);
  const duration = phase.duration_minutes ?? phase.duration_min;
  const space = getLocalizedContent(phase.space_description, phase.space_description_es, language);
  const playerCount = getLocalizedContent(phase.player_count, phase.player_count_es, language);
  const equipmentRaw = getLocalizedContent(phase.equipment, phase.equipment_es, language);
  const equipment = toArray(equipmentRaw);
  const coachingPoints = toArray(getLocalizedContent(phase.coaching_points, phase.coaching_points_es, language));
  const keyQuestions = toArray(getLocalizedContent(phase.key_questions, phase.key_questions_es, language));
  const progressions = toArray(getLocalizedContent(phase.progressions, phase.progressions_es, language));
  const regressions = toArray(getLocalizedContent(phase.regressions, phase.regressions_es, language));
  const gameFormat = getLocalizedContent(phase.game_format, phase.game_format_es, language);
  const variations = getLocalizedContent(phase.variations, phase.variations_es, language);
  const decisionTrigger = getLocalizedContent(phase.decision_trigger, phase.decision_trigger_es, language);

  const phaseNum = phase.phase_number;
  const phaseNameFull = PHASE_NAMES_FULL[phaseNum] || `Phase ${phaseNum}`;

  const hasSetup = space || (playerCount != null && playerCount !== '') || equipment.length > 0;
  const hasGameFormat = gameFormat && typeof gameFormat === 'object' && Object.keys(gameFormat).length > 0;
  const hasDecisionTrigger = decisionTrigger && String(decisionTrigger).trim() !== '';

  const diagramData =
    phase.diagram_data != null && phase.diagram_data !== ''
      ? typeof phase.diagram_data === 'string'
        ? (() => {
            try {
              return JSON.parse(phase.diagram_data);
            } catch {
              return null;
            }
          })()
        : phase.diagram_data
      : null;

  return (
    <View style={styles.phaseContentWrapper}>
      {activityName && (
        <Text style={styles.phaseContentHeader}>
          P{phaseNum} {activityName} / {phaseNameFull}
          {duration != null ? ` · ${duration}min` : ''}
        </Text>
      )}

      {phase.diagram_data != null && phase.diagram_data !== '' && diagramData && (
        <View style={styles.diagramWrapper}>
          <FieldDiagram data={diagramData} width={diagramWidth} />
        </View>
      )}

      {hasSetup && (
        <PhaseSectionCard title="SETUP & PLAYERS">
          {space ? <Text style={styles.sectionBody}>{space}</Text> : null}
          {playerCount != null && String(playerCount).trim() !== '' && (
            <Text style={[styles.sectionBody, space ? { marginTop: 8 } : undefined]}>
              Players: {String(playerCount)}
            </Text>
          )}
          {equipment.length > 0 && (
            <View style={[styles.equipmentRow, (space || playerCount) ? { marginTop: 8 } : undefined]}>
              {equipment.map((item, i) => (
                <View key={i} style={[styles.pill, styles.pillSlate]}>
                  <Text style={styles.pillText}>{String(item)}</Text>
                </View>
              ))}
            </View>
          )}
        </PhaseSectionCard>
      )}

      {hasGameFormat && (
        <PhaseSectionCard title="GAME FORMAT">
          {Object.entries(gameFormat!).map(([k, v]) => {
            const keyLower = String(k).toLowerCase();
            const isTransition = keyLower.includes('transition');
            return (
              <Text key={k} style={[styles.sectionBody, styles.gameFormatItem, isTransition ? styles.gameFormatTransition : undefined]}>
                {isTransition ? '→ ' : ''}{k}: {String(v)}
              </Text>
            );
          })}
        </PhaseSectionCard>
      )}

      {coachingPoints.length > 0 && (
        <PhaseSectionCard title="COACHING POINTS">
          {coachingPoints.map((item, i) => (
            <Text key={i} style={styles.listItemNumbered}>
              {i + 1}. {item}
            </Text>
          ))}
        </PhaseSectionCard>
      )}

      {hasDecisionTrigger && (
        <PhaseSectionCard title="DECISION TRIGGER">
          <Text style={styles.sectionBody}>{String(decisionTrigger)}</Text>
        </PhaseSectionCard>
      )}

      {keyQuestions.length > 0 && (
        <PhaseSectionCard title="KEY QUESTIONS">
          {keyQuestions.map((item, i) => (
            <Text key={i} style={styles.listItemNumbered}>
              Q{i + 1}. {item}
            </Text>
          ))}
        </PhaseSectionCard>
      )}

      {variations && typeof variations === 'object' && Object.keys(variations).length > 0 && (
        <PhaseSectionCard title="VARIATIONS">
          {Object.entries(variations).map(([k, v]) => (
            <Text key={k} style={styles.sectionBody}>
              {k}: {String(v)}
            </Text>
          ))}
        </PhaseSectionCard>
      )}

      {progressions.length > 0 && (
        <PhaseSectionCard title="PROGRESSIONS">
          {progressions.map((item, i) => (
            <Text key={i} style={styles.listItemBullet}>
              ↑ {item}
            </Text>
          ))}
        </PhaseSectionCard>
      )}

      {regressions.length > 0 && (
        <PhaseSectionCard title="REGRESSIONS">
          {regressions.map((item, i) => (
            <Text key={i} style={styles.listItemBullet}>
              ↓ {item}
            </Text>
          ))}
        </PhaseSectionCard>
      )}
    </View>
  );
});

export default function SessionDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const sessionId = route.params?.sessionId as string | undefined;

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePhaseIndex, setActivePhaseIndex] = useState(0);
  const [language, setLanguage] = useState<'en' | 'es'>('en');
  const { width: windowWidth } = useWindowDimensions();
  const diagramWidth = windowWidth - 32;

  useEffect(() => {
    if (!sessionId) {
      setError('Session not found');
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('ts_sessions')
          .select(
            `
            id, title, title_es, topic, age_group, phase_of_play, player_level,
            status, duration_minutes, created_at,
            phases:ts_session_phases(
              id, phase_number, phase_type, drill_name, activity_name_es,
              duration_minutes, space_description, space_description_es,
              player_count, player_count_es, equipment, equipment_es,
              coaching_points, coaching_points_es, key_questions, key_questions_es,
              progressions, progressions_es, regressions, regressions_es,
              game_format, game_format_es, variations, variations_es,
              diagram_data
            )
          `
          )
          .eq('id', sessionId)
          .single();

        if (cancelled) return;
        if (err) {
          setError(err.message || 'Session not found');
          setSession(null);
          return;
        }
        const s = data as Session;
        if (s?.phases && Array.isArray(s.phases)) {
          s.phases.sort((a, b) => a.phase_number - b.phase_number);
        }
        setSession(s);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError('Session not found');
          setSession(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Session Detail</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={[styles.skeletonLine, { width: '70%', marginHorizontal: 16, marginBottom: 8 }]} />
        <View style={[styles.skeletonLine, { width: '40%', marginHorizontal: 16, marginBottom: 24 }]} />
        <PhaseContentSkeleton />
      </SafeAreaView>
    );
  }

  if (error || !session) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Session Detail</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>{error || 'Session not found'}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const phases = session.phases || [];
  const hasPhases = phases.length > 0;
  const activePhase = hasPhases ? phases[activePhaseIndex] : null;

  const title = getLocalizedContent(session.title, session.title_es, language);
  const statusStyle =
    session.status === 'published'
      ? { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981' }
      : session.status === 'completed'
      ? { bg: 'rgba(100, 116, 139, 0.2)', text: '#94a3b8' }
      : { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Session Detail</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sessionHeader}>
          <Text style={styles.sessionTitle}>{title}</Text>
          {session.topic ? (
            <Text style={styles.topicSubtitle}>{session.topic}</Text>
          ) : null}
          <View style={styles.pillsAndLangRow}>
            <View style={styles.pillsRow}>
            {session.age_group ? (
              <View style={[styles.pill, styles.pillGreen]}>
                <Text style={styles.pillText}>{session.age_group}</Text>
              </View>
            ) : null}
            {session.player_level ? (
              <View style={[styles.pill, styles.pillPurple]}>
                <Text style={styles.pillText}>{session.player_level}</Text>
              </View>
            ) : null}
            <View style={[styles.pill, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.pillText, { color: statusStyle.text }]}>
                {session.status || 'draft'}
              </Text>
            </View>
          </View>
            <View style={styles.langToggle}>
              <TouchableOpacity
                style={[styles.langBtn, language === 'en' && styles.langBtnActive]}
                onPress={() => setLanguage('en')}
              >
                <Text style={[styles.langBtnText, language === 'en' && styles.langBtnTextActive]}>EN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langBtn, language === 'es' && styles.langBtnActive]}
                onPress={() => setLanguage('es')}
              >
                <Text style={[styles.langBtnText, language === 'es' && styles.langBtnTextActive]}>ES</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {!hasPhases ? (
          <View style={styles.emptyPhases}>
            <Text style={styles.emptyPhasesText}>No phases generated yet</Text>
          </View>
        ) : (
          <>
            <View style={styles.tabContainer}>
              <View style={styles.tabRow}>
                {[1, 2, 3, 4, 5].map((num) => {
                  const phase = phases.find((p) => p.phase_number === num);
                  const isActive = activePhase?.phase_number === num;
                  const color = PHASE_COLORS[num] || '#64748b';
                  const label = `${num}. ${PHASE_NAMES_SHORT[num] || 'Phase'}`;
                  const disabled = !phase;

                  return (
                    <TouchableOpacity
                      key={num}
                      style={[
                        styles.tab,
                        isActive && { backgroundColor: color },
                        !isActive && !disabled && {
                          borderWidth: 1,
                          borderColor: color,
                          backgroundColor: 'transparent',
                        },
                        disabled && styles.tabDisabled,
                      ]}
                      onPress={() => {
                        const idx = phases.findIndex((p) => p.phase_number === num);
                        if (idx >= 0) setActivePhaseIndex(idx);
                      }}
                      disabled={disabled}
                    >
                      <Text
                        style={[
                          styles.tabText,
                          isActive && styles.tabTextActive,
                          !isActive && !disabled && { color },
                          disabled && styles.tabTextDisabled,
                        ]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <PhaseContent
              phase={activePhase!}
              diagramWidth={diagramWidth}
              language={language}
            />
          </>
        )}
      </ScrollView>
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
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
  },
  sessionHeader: {
    padding: 16,
  },
  sessionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  topicSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 12,
  },
  pillsAndLangRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  langToggle: {
    flexDirection: 'row',
    gap: 4,
  },
  langBtn: {
    width: 36,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#94a3b8',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  langBtnActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  langBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  langBtnTextActive: {
    color: '#fff',
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pillGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  pillPurple: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  pillSlate: {
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  tabContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tab: {
    flex: 1,
    minWidth: 52,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabDisabled: {
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
    opacity: 0.6,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  tabTextActive: {
    color: '#fff',
  },
  tabTextDisabled: {
    color: '#64748b',
  },
  phaseContentWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  phaseContentHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
    lineHeight: 22,
  },
  diagramWrapper: {
    marginBottom: 16,
    alignItems: 'center',
  },
  sectionCard: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  sectionCardHeader: {
    backgroundColor: '#1e1b4b',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  sectionCardHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionCardBody: {
    padding: 16,
  },
  sectionBody: {
    fontSize: 15,
    color: '#ffffff',
    lineHeight: 22,
  },
  gameFormatItem: {
    marginBottom: 8,
  },
  gameFormatTransition: {
    marginLeft: 8,
  },
  equipmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  listItemNumbered: {
    fontSize: 14,
    color: '#ffffff',
    marginBottom: 8,
    lineHeight: 20,
  },
  listItemBullet: {
    fontSize: 14,
    color: '#ffffff',
    marginBottom: 8,
    lineHeight: 20,
  },
  emptyPhases: {
    padding: 32,
    alignItems: 'center',
  },
  emptyPhasesText: {
    fontSize: 16,
    color: '#94a3b8',
  },
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#94a3b8',
    marginBottom: 16,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#334155',
    borderRadius: 10,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  skeletonLine: {
    height: 14,
    backgroundColor: '#334155',
    borderRadius: 4,
  },
});
