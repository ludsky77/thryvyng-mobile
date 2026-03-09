import React, { useState } from 'react';
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

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface SessionRef {
  id: string;
  day_of_week?: number | null;
  display_order?: number | null;
  session?: {
    id: string;
    title?: string | null;
    title_es?: string | null;
    topic?: string | null;
    age_group?: string | null;
  } | null;
}

interface Week {
  id: string;
  week_number: number;
  theme?: string | null;
  notes?: string | null;
  sessions?: SessionRef[] | null;
}

interface SeasonPlan {
  id: string;
  title: string;
  season_type?: string | null;
  age_group?: string | null;
  gender?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  total_weeks?: number | null;
  theme?: string | null;
  status?: string | null;
  weeks?: Week[] | null;
}

function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start || !end) return '';
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export default function SeasonPlanDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const plan = (route.params as { plan?: SeasonPlan })?.plan;

  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>({});

  if (!plan) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Season Plan</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Plan not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const dateRange = formatDateRange(plan.start_date, plan.end_date);

  const toggleWeek = (weekId: string) => {
    setExpandedWeeks((prev) => ({ ...prev, [weekId]: !prev[weekId] }));
  };

  const handleSessionPress = (sessionId: string) => {
    navigation.navigate('SessionDetail', { sessionId });
  };

  const sortedWeeks = [...(plan.weeks || [])].sort(
    (a, b) => a.week_number - b.week_number
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {plan.title}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.planHeader}>
          {dateRange && (
            <Text style={styles.dateRange}>{dateRange}</Text>
          )}
          <View style={styles.pillsRow}>
            {plan.age_group && (
              <View style={styles.pill}>
                <Text style={styles.pillText}>{plan.age_group}</Text>
              </View>
            )}
            {plan.gender && (
              <View style={styles.pill}>
                <Text style={styles.pillText}>{plan.gender}</Text>
              </View>
            )}
          </View>
          {plan.theme && (
            <Text style={styles.theme}>{plan.theme}</Text>
          )}
        </View>

        {sortedWeeks.map((week) => {
          const isExpanded = expandedWeeks[week.id];
          const sessions = (week.sessions || []).sort(
            (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
          );

          return (
            <View key={week.id} style={styles.weekCard}>
              <TouchableOpacity
                style={styles.weekHeader}
                onPress={() => toggleWeek(week.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.weekTitle}>Week {week.week_number}</Text>
                {week.theme && (
                  <Text style={styles.weekTheme} numberOfLines={1}>
                    {week.theme}
                  </Text>
                )}
                {week.notes && (
                  <Text style={styles.weekNotes} numberOfLines={1}>
                    {week.notes}
                  </Text>
                )}
                <Feather
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color="#94a3b8"
                  style={styles.weekChevron}
                />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.weekContent}>
                  {sessions.length === 0 ? (
                    <Text style={styles.noSessions}>No sessions assigned</Text>
                  ) : (
                    sessions.map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={styles.sessionRow}
                        onPress={() => handleSessionPress(s.session?.id || '')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.sessionDay}>
                          {s.day_of_week != null && s.day_of_week >= 1 && s.day_of_week <= 7
                            ? DAY_LABELS[s.day_of_week - 1]
                            : '—'}
                        </Text>
                        <Text style={styles.sessionTitle} numberOfLines={2}>
                          {s.session?.title || 'Session'}
                        </Text>
                        {s.session?.age_group && (
                          <View style={styles.sessionPill}>
                            <Text style={styles.sessionPillText}>
                              {s.session.age_group}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}
            </View>
          );
        })}
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
    flex: 1,
    textAlign: 'center',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  planHeader: {
    marginBottom: 24,
  },
  dateRange: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 8,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  pill: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pillText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  theme: {
    fontSize: 14,
    color: '#94a3b8',
  },
  weekCard: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  weekHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    padding: 16,
  },
  weekTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginRight: 8,
  },
  weekTheme: {
    fontSize: 13,
    color: '#94a3b8',
    flex: 1,
  },
  weekNotes: {
    fontSize: 12,
    color: '#64748b',
    width: '100%',
    marginTop: 4,
  },
  weekChevron: {
    marginLeft: 'auto',
  },
  weekContent: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    padding: 16,
  },
  noSessions: {
    fontSize: 14,
    color: '#64748b',
    fontStyle: 'italic',
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    gap: 12,
  },
  sessionDay: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    width: 36,
  },
  sessionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  sessionPill: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sessionPillText: {
    fontSize: 11,
    color: '#94a3b8',
  },
});
