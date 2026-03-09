import React, { useState, useEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { getLocalizedContent } from '../../utils/localization';

const CATEGORY_STYLES: Record<string, { bg: string; text: string }> = {
  attacking: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981' },
  defending: { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444' },
  possession: { bg: 'rgba(139, 92, 246, 0.2)', text: '#8b5cf6' },
  transition: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' },
};

const PHASE_TYPE_DISPLAY: Record<string, string> = {
  warmup: 'Technical Warm-Up',
  technical: 'Small Sided Game',
  preferential: 'Preferential Simulation',
  extended: 'Extended Preferential Game',
  debrief: 'Free Play & Reflection',
};

const SECTION_HEADER_COLORS: Record<string, string> = {
  'OVERVIEW': '#a78bfa',
  'DESCRIPTION': '#c084fc',
  'EQUIPMENT': '#8b5cf6',
  'COACHING POINTS': '#8b5cf6',
  'KEY QUESTIONS': '#a78bfa',
  'PROGRESSIONS': '#10b981',
  'REGRESSIONS': '#ef4444',
};

function toArray(val: string[] | string | null | undefined): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'string') return val ? [val] : [];
  return [];
}

function formatPhaseType(phaseType: string | null | undefined): string {
  if (!phaseType) return '';
  const lower = String(phaseType).toLowerCase();
  return PHASE_TYPE_DISPLAY[lower] ?? phaseType;
}

const DrillSectionCard = memo(function DrillSectionCard({
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

function DrillContentSkeleton() {
  return (
    <View style={styles.content}>
      <View style={[styles.skeletonLine, { width: '70%', marginBottom: 16 }]} />
      <View style={[styles.skeletonLine, { width: '90%', marginBottom: 8 }]} />
      <View style={[styles.skeletonLine, { width: '80%', marginBottom: 16 }]} />
      <View style={[styles.skeletonLine, { width: '60%', marginBottom: 8 }]} />
      <View style={[styles.skeletonLine, { width: '50%', marginBottom: 12 }]} />
    </View>
  );
}

export default function DrillDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const drillId = route.params?.drillId as string | undefined;

  const [drill, setDrill] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<'en' | 'es'>('en');

  useEffect(() => {
    if (!drillId) {
      setError('Drill not found');
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('ts_drills')
          .select('*')
          .eq('id', drillId)
          .single();

        if (cancelled) return;
        if (err) {
          setError(err.message || 'Drill not found');
          setDrill(null);
          return;
        }
        setDrill(data as Record<string, unknown>);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError('Drill not found');
          setDrill(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drillId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Drill Detail</Text>
          <View style={{ width: 24 }} />
        </View>
        <DrillContentSkeleton />
      </SafeAreaView>
    );
  }

  if (error || !drill) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Drill Detail</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>{error || 'Drill not found'}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const name = getLocalizedContent(drill.name, drill.name_es, language) as string;
  const description = getLocalizedContent(drill.description, drill.description_es, language) as string | null | undefined;
  const category = (drill.category as string) || '';
  const categoryStyle =
    CATEGORY_STYLES[category.toLowerCase()] ?? CATEGORY_STYLES.possession;
  const phaseType = drill.phase_type as string | null | undefined;
  const phaseTypeDisplay = formatPhaseType(phaseType);
  const isFeatured = drill.is_featured as boolean | null | undefined;

  const duration = drill.duration_min as number | null | undefined;
  const playerMin = drill.player_count_min as number | null | undefined;
  const playerMax = drill.player_count_max as number | null | undefined;
  const ageMin = drill.age_min as number | string | null | undefined;
  const ageMax = drill.age_max as number | string | null | undefined;

  const equipmentRaw = getLocalizedContent(drill.equipment, drill.equipment_es, language);
  const equipment = toArray(equipmentRaw);
  const coachingPoints = toArray(getLocalizedContent(drill.coaching_points, drill.coaching_points_es, language));
  const keyQuestions = toArray(getLocalizedContent(drill.key_questions, drill.key_questions_es, language));
  const progressions = toArray(getLocalizedContent(drill.progressions, drill.progressions_es, language));
  const regressions = toArray(getLocalizedContent(drill.regressions, drill.regressions_es, language));

  const ageRange =
    ageMin != null && ageMax != null
      ? `U${ageMin} - U${ageMax}`
      : ageMin != null
      ? `U${ageMin}+`
      : ageMax != null
      ? `Up to U${ageMax}`
      : null;

  const playerRange =
    playerMin != null && playerMax != null
      ? playerMin === playerMax
        ? `${playerMin}`
        : `${playerMin}-${playerMax}`
      : playerMin != null
      ? `${playerMin}+`
      : playerMax != null
      ? `Up to ${playerMax}`
      : null;

  const hasOverview =
    category || phaseTypeDisplay || isFeatured || duration != null || playerRange || ageRange;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Drill Detail</Text>
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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.drillHeader}>
          <Text style={styles.drillName}>{name}</Text>
        </View>

        {hasOverview && (
          <DrillSectionCard title="OVERVIEW">
            <View style={styles.overviewPills}>
              {category ? (
                <View style={[styles.pill, { backgroundColor: categoryStyle.bg }]}>
                  <Text style={[styles.pillText, { color: categoryStyle.text }]}>
                    {category}
                  </Text>
                </View>
              ) : null}
              {phaseTypeDisplay ? (
                <View style={[styles.pill, styles.pillSlate]}>
                  <Text style={styles.pillText}>{phaseTypeDisplay}</Text>
                </View>
              ) : null}
              {isFeatured ? (
                <View style={[styles.pill, styles.pillFeatured]}>
                  <Text style={styles.pillFeaturedText}>Featured</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.overviewMeta}>
              {duration != null && (
                <View style={styles.metaItem}>
                  <Feather name="clock" size={14} color="#94a3b8" />
                  <Text style={styles.metaText}>{duration} min</Text>
                </View>
              )}
              {playerRange && (
                <View style={styles.metaItem}>
                  <Feather name="users" size={14} color="#94a3b8" />
                  <Text style={styles.metaText}>{playerRange}</Text>
                </View>
              )}
              {ageRange && (
                <View style={styles.metaItem}>
                  <Feather name="user" size={14} color="#94a3b8" />
                  <Text style={styles.metaText}>{ageRange}</Text>
                </View>
              )}
            </View>
          </DrillSectionCard>
        )}

        {description && (
          <DrillSectionCard title="DESCRIPTION">
            <Text style={styles.sectionBody}>{description}</Text>
          </DrillSectionCard>
        )}

        {equipment.length > 0 && (
          <DrillSectionCard title="EQUIPMENT">
            <View style={styles.equipmentRow}>
              {equipment.map((item, i) => (
                <View key={i} style={[styles.pill, styles.pillSlate]}>
                  <Text style={styles.pillText}>{String(item)}</Text>
                </View>
              ))}
            </View>
          </DrillSectionCard>
        )}

        {coachingPoints.length > 0 && (
          <DrillSectionCard title="COACHING POINTS">
            {coachingPoints.map((item, i) => (
              <Text key={i} style={styles.listItemNumbered}>
                {i + 1}. {item}
              </Text>
            ))}
          </DrillSectionCard>
        )}

        {keyQuestions.length > 0 && (
          <DrillSectionCard title="KEY QUESTIONS">
            {keyQuestions.map((item, i) => (
              <Text key={i} style={styles.listItemNumbered}>
                Q{i + 1}. {item}
              </Text>
            ))}
          </DrillSectionCard>
        )}

        {progressions.length > 0 && (
          <DrillSectionCard title="PROGRESSIONS">
            {progressions.map((item, i) => (
              <Text key={i} style={styles.listItemBullet}>
                ↑ {item}
              </Text>
            ))}
          </DrillSectionCard>
        )}

        {regressions.length > 0 && (
          <DrillSectionCard title="REGRESSIONS">
            {regressions.map((item, i) => (
              <Text key={i} style={styles.listItemBullet}>
                ↓ {item}
              </Text>
            ))}
          </DrillSectionCard>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  drillHeader: {
    paddingVertical: 16,
  },
  drillName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
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
  overviewPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pillSlate: {
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
  },
  pillFeatured: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  pillFeaturedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f59e0b',
  },
  overviewMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  sectionBody: {
    fontSize: 15,
    color: '#ffffff',
    lineHeight: 22,
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
