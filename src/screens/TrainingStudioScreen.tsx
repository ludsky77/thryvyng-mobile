import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { SessionCard } from '../components/training/SessionCard';
import { DrillCard } from '../components/training/DrillCard';
import { ScheduleCard } from '../components/training/ScheduleCard';
import { CoachActivityCard } from '../components/training/CoachActivityCard';
import { SeasonPlanCard } from '../components/training/SeasonPlanCard';

type TabId = 'sessions' | 'drills' | 'schedule' | 'calendar' | 'season_plans' | 'curriculum' | 'activity';

const COACH_TABS: { id: TabId; label: string }[] = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'drills', label: 'Drills' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'season_plans', label: 'Season Plans' },
];

const DIRECTOR_TABS: { id: TabId; label: string }[] = [
  ...COACH_TABS,
  { id: 'curriculum', label: 'Curriculum' },
  { id: 'activity', label: 'Activity' },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRILL_COLUMNS = SCREEN_WIDTH > 380 ? 2 : 1;

interface Session {
  id: string;
  title: string;
  title_es?: string | null;
  topic?: string | null;
  age_group?: string | null;
  player_level?: string | null;
  status?: string | null;
  created_at: string;
  team_id?: string | null;
  club_id?: string | null;
  phases?: { id: string; phase_number: number; phase_type?: string }[] | null;
}

interface Drill {
  id: string;
  name: string;
  name_es?: string | null;
  category?: string | null;
  phase_type?: string | null;
  duration_min?: number | null;
  player_count_min?: number | null;
  player_count_max?: number | null;
  is_featured?: boolean | null;
}

interface ScheduledSession {
  id: string;
  scheduled_date: string;
  status: string;
  notes?: string | null;
  coach_id?: string | null;
  session_id?: string | null;
  session?: { id: string; title?: string | null; title_es?: string | null; topic?: string | null; phase_of_play?: string | null } | null;
  team?: { id: string; name?: string | null } | null;
  coach?: { id: string; full_name?: string | null } | null;
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
  weeks?: {
    id: string;
    week_number: number;
    theme?: string | null;
    notes?: string | null;
    sessions?: {
      id: string;
      day_of_week?: number | null;
      display_order?: number | null;
      session?: { id: string; title?: string | null; title_es?: string | null; topic?: string | null; age_group?: string | null } | null;
    }[];
  }[];
}

interface CurriculumItem {
  id: string;
  name: string;
  name_es?: string | null;
  description?: string | null;
  description_es?: string | null;
  age_group?: string | null;
  total_weeks?: number | null;
  club_id?: string | null;
  sessions?: { id: string; session_id?: string | null; session?: { id: string; title?: string | null; title_es?: string | null; topic?: string | null } | null }[];
}

function SkeletonCard() {
  return (
    <View style={styles.skeletonCard}>
      <View style={[styles.skeletonLine, { width: '70%', marginBottom: 8 }]} />
      <View style={[styles.skeletonLine, { width: '50%', marginBottom: 12 }]} />
      <View style={styles.skeletonRow}>
        <View style={[styles.skeletonPill, { width: 60 }]} />
        <View style={[styles.skeletonPill, { width: 80 }]} />
      </View>
      <View style={[styles.skeletonLine, { width: '40%', marginTop: 8 }]} />
    </View>
  );
}

export default function TrainingStudioScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { user } = useAuth();
  const params = (route.params as { teamId?: string; clubId?: string }) || {};
  const { teamId, clubId } = params;

  const [resolvedClubId, setResolvedClubId] = useState<string | null>(clubId || null);
  const [activeTab, setActiveTab] = useState<TabId>('sessions');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [scheduledSessions, setScheduledSessions] = useState<ScheduledSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [drillsLoading, setDrillsLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [sessionsRefreshing, setSessionsRefreshing] = useState(false);
  const [drillsRefreshing, setDrillsRefreshing] = useState(false);
  const [scheduleRefreshing, setScheduleRefreshing] = useState(false);
  const [schedulePastExpanded, setSchedulePastExpanded] = useState(false);
  const [activityCoaches, setActivityCoaches] = useState<
    { id: string; full_name?: string | null; avatar_url?: string | null; role: string; sessionsCreated: number; sessionsScheduled: number; completed: number }[]
  >([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityRefreshing, setActivityRefreshing] = useState(false);
  const [activitySummary, setActivitySummary] = useState({
    totalSessions: 0,
    totalScheduled: 0,
    completionRate: 0,
  });
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [calendarSessions, setCalendarSessions] = useState<Record<string, ScheduledSession[]>>({});
  const [calendarFetchedMonths, setCalendarFetchedMonths] = useState<Record<string, boolean>>({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarRefreshing, setCalendarRefreshing] = useState(false);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string | null>(null);
  const [seasonPlans, setSeasonPlans] = useState<SeasonPlan[]>([]);
  const [seasonPlansLoading, setSeasonPlansLoading] = useState(false);
  const [seasonPlansRefreshing, setSeasonPlansRefreshing] = useState(false);
  const [curriculumItems, setCurriculumItems] = useState<CurriculumItem[]>([]);
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [curriculumRefreshing, setCurriculumRefreshing] = useState(false);

  const effectiveClubId = resolvedClubId ?? clubId ?? null;
  const language: 'en' | 'es' = 'en';
  const isCoach = !!teamId;
  const isDirector = !teamId && !!effectiveClubId;
  const TABS = isDirector ? DIRECTOR_TABS : COACH_TABS;

  useEffect(() => {
    if (teamId && !clubId) {
      supabase
        .from('teams')
        .select('club_id')
        .eq('id', teamId)
        .single()
        .then(({ data }) => {
          if (data?.club_id) setResolvedClubId(data.club_id);
        });
    } else if (clubId) {
      setResolvedClubId(clubId);
    }
  }, [teamId, clubId]);

  const fetchSessions = useCallback(async (isRefresh = false) => {
    if (!teamId && !effectiveClubId) return;
    if (teamId && !effectiveClubId) return;

    if (isRefresh) setSessionsRefreshing(true);
    else setSessionsLoading(true);

    try {
      let query = supabase
        .from('ts_sessions')
        .select(`
          id, title, title_es, age_group, phase_of_play, player_level,
          status, created_at, topic, team_id, club_id,
          phases:ts_session_phases(id, phase_number, phase_type)
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (teamId && effectiveClubId) {
        query = query.or(
          `team_id.eq.${teamId},and(club_id.eq.${effectiveClubId},team_id.is.null)`
        );
      } else if (effectiveClubId) {
        query = query.eq('club_id', effectiveClubId);
      } else {
        setSessions([]);
        return;
      }

      const { data, error } = await query;
      if (error) throw error;
      setSessions(data || []);
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setSessions([]);
    } finally {
      setSessionsLoading(false);
      setSessionsRefreshing(false);
    }
  }, [teamId, effectiveClubId]);

  const fetchDrills = useCallback(async (isRefresh = false) => {
    if (!effectiveClubId) return;

    if (isRefresh) setDrillsRefreshing(true);
    else setDrillsLoading(true);

    try {
      const { data, error } = await supabase
        .from('ts_drills')
        .select(`
          id, name, name_es, description, description_es, category,
          phase_type, duration_min, player_count_min, player_count_max,
          is_featured, age_min, age_max
        `)
        .or(`club_id.is.null,club_id.eq.${effectiveClubId}`)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      setDrills(data || []);
    } catch (err) {
      console.error('Error fetching drills:', err);
      setDrills([]);
    } finally {
      setDrillsLoading(false);
      setDrillsRefreshing(false);
    }
  }, [effectiveClubId]);

  const fetchSchedule = useCallback(async (isRefresh = false) => {
    if (!user?.id) return;
    if (isCoach && !teamId) return;
    if (!isCoach && !effectiveClubId) return;

    if (isRefresh) setScheduleRefreshing(true);
    else setScheduleLoading(true);

    try {
      if (isCoach) {
        const { data, error } = await supabase
          .from('ts_scheduled_sessions')
          .select(
            'id, scheduled_date, status, notes, session_id, session:ts_sessions(id, title, title_es, topic, age_group, phase_of_play), team:teams(id, name)'
          )
          .eq('coach_id', user.id)
          .eq('team_id', teamId!)
          .order('scheduled_date', { ascending: true })
          .limit(30);
        if (error) throw error;
        setScheduledSessions((data || []) as ScheduledSession[]);
      } else {
        const { data: teamsData } = await supabase
          .from('teams')
          .select('id')
          .eq('club_id', effectiveClubId!);
        const clubTeamIds = (teamsData || []).map((t: { id: string }) => t.id);
        if (clubTeamIds.length === 0) {
          setScheduledSessions([]);
          return;
        }
        const { data, error } = await supabase
          .from('ts_scheduled_sessions')
          .select(
            'id, scheduled_date, status, notes, coach_id, session_id, session:ts_sessions(id, title, title_es, topic, age_group, phase_of_play), team:teams(id, name)'
          )
          .in('team_id', clubTeamIds)
          .order('scheduled_date', { ascending: true })
          .limit(50);
        if (error) throw error;
        const sessionsData = (data || []) as ScheduledSession[];
        const coachIds = [...new Set(sessionsData.map((s) => s.coach_id).filter(Boolean))] as string[];
        if (coachIds.length > 0) {
          const { data: profilesData } = await supabase.from('profiles').select('id, full_name').in('id', coachIds);
          const coachMap = new Map((profilesData || []).map((p: any) => [p.id, p]));
          sessionsData.forEach((s) => {
            if (s.coach_id) (s as any).coach = coachMap.get(s.coach_id) ?? null;
          });
        }
        setScheduledSessions(sessionsData);
      }
    } catch (err) {
      console.error('Error fetching schedule:', err);
      setScheduledSessions([]);
    } finally {
      setScheduleLoading(false);
      setScheduleRefreshing(false);
    }
  }, [user?.id, teamId, effectiveClubId, isCoach]);

  const handleMarkComplete = useCallback(
    async (scheduledId: string) => {
      if (!user?.id) return;
      const { error } = await supabase
        .from('ts_scheduled_sessions')
        .update({ status: 'completed' })
        .eq('id', scheduledId)
        .eq('coach_id', user.id);
      if (error) throw error;
      setScheduledSessions((prev) =>
        prev.map((s) => (s.id === scheduledId ? { ...s, status: 'completed' } : s))
      );
    },
    [user?.id]
  );

  useEffect(() => {
    if (activeTab === 'sessions') fetchSessions();
  }, [activeTab, fetchSessions]);

  useEffect(() => {
    if (activeTab === 'drills') fetchDrills();
  }, [activeTab, fetchDrills]);

  useEffect(() => {
    if (activeTab === 'schedule') fetchSchedule();
  }, [activeTab, fetchSchedule]);

  const fetchActivity = useCallback(async (isRefresh = false) => {
    if (!effectiveClubId || !isDirector) return;

    if (isRefresh) setActivityRefreshing(true);
    else setActivityLoading(true);

    try {
      const { data: teamsData } = await supabase
        .from('teams')
        .select('id')
        .eq('club_id', effectiveClubId);
      const clubTeamIds = (teamsData || []).map((t: { id: string }) => t.id);

      const [staffRes, sessionsRes, scheduledRes] = await Promise.all([
        clubTeamIds.length > 0
          ? supabase
              .from('team_staff')
              .select('user_id, staff_role')
              .in('team_id', clubTeamIds)
              .in('staff_role', ['head_coach', 'assistant_coach'])
          : Promise.resolve({ data: [] }),
        supabase
          .from('ts_sessions')
          .select('id, created_by')
          .eq('club_id', effectiveClubId),
        clubTeamIds.length > 0
          ? supabase
              .from('ts_scheduled_sessions')
              .select('id, coach_id, status')
              .in('team_id', clubTeamIds)
          : Promise.resolve({ data: [] }),
      ]);

      const staffList = (staffRes.data || []) as { user_id: string; staff_role: string }[];
      const sessionsList = (sessionsRes.data || []) as { id: string; created_by?: string | null }[];
      const scheduledList = (scheduledRes.data || []) as {
        id: string;
        coach_id?: string | null;
        status?: string | null;
      }[];

      const coachIds = [...new Set(staffList.map((s) => s.user_id))];
      const staffMap = new Map(staffList.map((s) => [s.user_id, s.staff_role]));

      const sessionsByCoach = new Map<string, number>();
      const scheduledByCoach = new Map<string, number>();
      const completedByCoach = new Map<string, number>();

      sessionsList.forEach((s) => {
        const cid = s.created_by || '';
        if (cid) sessionsByCoach.set(cid, (sessionsByCoach.get(cid) || 0) + 1);
      });
      scheduledList.forEach((s) => {
        const cid = s.coach_id || '';
        if (cid) {
          scheduledByCoach.set(cid, (scheduledByCoach.get(cid) || 0) + 1);
          if (s.status === 'completed') {
            completedByCoach.set(cid, (completedByCoach.get(cid) || 0) + 1);
          }
        }
      });

      const allCoachIds = new Set([
        ...coachIds,
        ...sessionsByCoach.keys(),
        ...scheduledByCoach.keys(),
      ]);
      const coachIdsArr = [...allCoachIds];

      let profilesMap = new Map<string, { full_name?: string | null; avatar_url?: string | null }>();
      if (coachIdsArr.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', coachIdsArr);
        profilesMap = new Map(
          (profiles || []).map((p: any) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }])
        );
      }

      const coaches = coachIdsArr.map((id) => {
        const profile = profilesMap.get(id);
        const role = staffMap.get(id) || 'assistant_coach';
        const sessionsCreated = sessionsByCoach.get(id) || 0;
        const sessionsScheduled = scheduledByCoach.get(id) || 0;
        const completed = completedByCoach.get(id) || 0;
        return {
          id,
          full_name: profile?.full_name,
          avatar_url: profile?.avatar_url,
          role,
          sessionsCreated,
          sessionsScheduled,
          completed,
        };
      });

      coaches.sort(
        (a, b) =>
          b.sessionsCreated +
          b.sessionsScheduled +
          b.completed -
          (a.sessionsCreated + a.sessionsScheduled + a.completed)
      );

      const totalSessions = sessionsList.length;
      const totalScheduled = scheduledList.length;
      const totalCompleted = scheduledList.filter((s) => s.status === 'completed').length;
      const completionRate = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;

      setActivityCoaches(coaches);
      setActivitySummary({ totalSessions, totalScheduled, completionRate });
    } catch (err) {
      console.error('Error fetching activity:', err);
      setActivityCoaches([]);
    } finally {
      setActivityLoading(false);
      setActivityRefreshing(false);
    }
  }, [effectiveClubId, isDirector]);

  useEffect(() => {
    if (activeTab === 'activity') fetchActivity();
  }, [activeTab, fetchActivity]);

  const fetchCalendar = useCallback(
    async (year: number, month: number, isRefresh = false) => {
      if (!user?.id && !effectiveClubId) return;
      if (isCoach && !teamId) return;
      if (!isCoach && !effectiveClubId) return;

      if (isRefresh) setCalendarRefreshing(true);
      else setCalendarLoading(true);

      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const firstDayStr = firstDay.toISOString().split('T')[0];
      const lastDayStr = lastDay.toISOString().split('T')[0];

      try {
        let query = supabase
          .from('ts_scheduled_sessions')
          .select(
            'id, scheduled_date, status, session:ts_sessions(id, title, title_es, topic, age_group, phase_of_play), team:teams(id, name)'
          )
          .gte('scheduled_date', firstDayStr)
          .lte('scheduled_date', lastDayStr)
          .order('scheduled_date', { ascending: true });

        if (isCoach) {
          query = query.eq('coach_id', user!.id);
        } else {
          const { data: teamsData } = await supabase.from('teams').select('id').eq('club_id', effectiveClubId!);
          const clubTeamIds = (teamsData || []).map((t: { id: string }) => t.id);
          if (clubTeamIds.length === 0) {
            setCalendarSessions({});
            return;
          }
          query = query.in('team_id', clubTeamIds);
        }

        const { data, error } = await query;
        if (error) throw error;

        const byDate: Record<string, ScheduledSession[]> = {};
        (data || []).forEach((s: any) => {
          const date = s.scheduled_date?.split('T')[0] || '';
          if (!byDate[date]) byDate[date] = [];
          byDate[date].push(s as ScheduledSession);
        });

        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
        setCalendarSessions((prev) => ({ ...prev, ...byDate }));
        setCalendarFetchedMonths((prev) => ({ ...prev, [monthKey]: true }));
      } catch (err) {
        console.error('Error fetching calendar:', err);
        setCalendarSessions({});
      } finally {
        setCalendarLoading(false);
        setCalendarRefreshing(false);
      }
    },
    [user?.id, teamId, effectiveClubId, isCoach]
  );

  const fetchSeasonPlans = useCallback(
    async (isRefresh = false) => {
      const scopeId = teamId || effectiveClubId;
      if (!scopeId) return;

      if (isRefresh) setSeasonPlansRefreshing(true);
      else setSeasonPlansLoading(true);

      try {
        const col = teamId ? 'team_id' : 'club_id';
        const { data, error } = await supabase
          .from('ts_season_plans')
          .select(
            `id, title, season_type, age_group, gender, start_date, end_date, total_weeks, theme, status, created_by,
            weeks:ts_season_weeks(id, week_number, theme, notes,
              sessions:ts_season_sessions(id, day_of_week, display_order,
                session:ts_sessions(id, title, title_es, topic, age_group)))`
          )
          .eq(col, scopeId)
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) throw error;
        setSeasonPlans((data || []) as SeasonPlan[]);
      } catch (err) {
        console.error('Error fetching season plans:', err);
        setSeasonPlans([]);
      } finally {
        setSeasonPlansLoading(false);
        setSeasonPlansRefreshing(false);
      }
    },
    [teamId, effectiveClubId]
  );

  const fetchCurriculum = useCallback(
    async (isRefresh = false) => {
      if (!effectiveClubId || !isDirector) return;

      if (isRefresh) setCurriculumRefreshing(true);
      else setCurriculumLoading(true);

      try {
        const { data, error } = await supabase
          .from('ts_curriculum')
          .select(
            `id, name, name_es, description, description_es, age_group, total_weeks, club_id,
            sessions:ts_curriculum_sessions(id, session_id, session:ts_sessions(id, title, title_es, topic))`
          )
          .or(`club_id.is.null,club_id.eq.${effectiveClubId}`)
          .order('age_group', { ascending: true });

        if (error) throw error;
        setCurriculumItems((data || []) as CurriculumItem[]);
      } catch (err) {
        console.error('Error fetching curriculum:', err);
        setCurriculumItems([]);
      } finally {
        setCurriculumLoading(false);
        setCurriculumRefreshing(false);
      }
    },
    [effectiveClubId, isDirector]
  );

  useEffect(() => {
    if (activeTab === 'calendar') {
      const monthKey = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, '0')}`;
      if (!calendarFetchedMonths[monthKey] && !calendarLoading) {
        fetchCalendar(calendarMonth.year, calendarMonth.month);
      }
    }
  }, [activeTab, calendarMonth, calendarFetchedMonths, calendarLoading, fetchCalendar]);

  useEffect(() => {
    if (activeTab === 'season_plans') fetchSeasonPlans();
  }, [activeTab, fetchSeasonPlans]);

  useEffect(() => {
    if (activeTab === 'curriculum') fetchCurriculum();
  }, [activeTab, fetchCurriculum]);

  const handleCalendarMonthChange = useCallback(
    (delta: number) => {
      setCalendarMonth((prev) => {
        const d = new Date(prev.year, prev.month + delta, 1);
        return { year: d.getFullYear(), month: d.getMonth() };
      });
    },
    []
  );

  const handleSessionPress = (sessionId: string) => {
    navigation.navigate('SessionDetail', { sessionId });
  };

  const handleDrillPress = (drillId: string) => {
    navigation.navigate('DrillDetail', { drillId });
  };

  const handleSeasonPlanPress = (plan: SeasonPlan) => {
    navigation.navigate('SeasonPlanDetail', { plan });
  };

  const handleCurriculumPress = (item: CurriculumItem) => {
    navigation.navigate('CurriculumDetail', { curriculum: item });
  };

  const getSessionsForCalendarMonth = () => {
    const { year, month } = calendarMonth;
    const result: Record<string, ScheduledSession[]> = {};
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    Object.keys(calendarSessions).forEach((dateStr) => {
      if (dateStr.startsWith(prefix)) result[dateStr] = calendarSessions[dateStr];
    });
    return result;
  };

  const renderSessionsContent = () => {
    if (sessionsLoading && sessions.length === 0) {
      return (
        <View style={styles.listContent}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      );
    }

    if (sessions.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Feather name="file-text" size={48} color="#64748b" />
          <Text style={styles.emptyTitle}>No sessions yet</Text>
          <Text style={styles.emptySubtitle}>
            Sessions created on web will appear here
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SessionCard
            session={item}
            language={language}
            onPress={handleSessionPress}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={sessionsRefreshing}
            onRefresh={() => fetchSessions(true)}
            tintColor="#8b5cf6"
          />
        }
      />
    );
  };

  const renderDrillsContent = () => {
    if (drillsLoading && drills.length === 0) {
      return (
        <View style={styles.listContent}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      );
    }

    if (drills.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Feather name="target" size={48} color="#64748b" />
          <Text style={styles.emptyTitle}>No drills available</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={drills}
        keyExtractor={(item) => item.id}
        numColumns={DRILL_COLUMNS}
        key={DRILL_COLUMNS}
        columnWrapperStyle={DRILL_COLUMNS === 2 ? styles.drillColumnWrapper : undefined}
        renderItem={({ item }) => (
          <View style={styles.drillCardWrapper}>
            <DrillCard
              drill={item}
              language={language}
              onPress={handleDrillPress}
            />
          </View>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={drillsRefreshing}
            onRefresh={() => fetchDrills(true)}
            tintColor="#8b5cf6"
          />
        }
      />
    );
  };

  const renderScheduleContent = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = scheduledSessions.filter((s) => {
      const d = new Date(s.scheduled_date);
      d.setHours(0, 0, 0, 0);
      return d >= today;
    });
    const past = scheduledSessions.filter((s) => {
      const d = new Date(s.scheduled_date);
      d.setHours(0, 0, 0, 0);
      return d < today;
    });

    if (scheduleLoading && scheduledSessions.length === 0) {
      return (
        <View style={styles.listContent}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      );
    }

    if (scheduledSessions.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Feather name="calendar" size={48} color="#64748b" />
          <Text style={styles.emptyTitle}>No scheduled sessions</Text>
          <Text style={styles.emptySubtitle}>
            Schedule sessions from the web app
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.scheduleScroll}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={scheduleRefreshing}
            onRefresh={() => fetchSchedule(true)}
            tintColor="#8b5cf6"
          />
        }
      >
        <View style={styles.scheduleSection}>
          <Text style={styles.scheduleSectionTitle}>Upcoming</Text>
          {upcoming.map((item) => (
          <ScheduleCard
            key={item.id}
            item={item}
            language={language}
            isCoach={isCoach}
            onPress={handleSessionPress}
            onMarkComplete={handleMarkComplete}
          />
        ))}
        </View>

        <TouchableOpacity
          style={styles.pastSectionHeader}
          onPress={() => setSchedulePastExpanded(!schedulePastExpanded)}
        >
          <Text style={styles.scheduleSectionTitle}>Past</Text>
          <Feather name={schedulePastExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#94a3b8" />
        </TouchableOpacity>
        {schedulePastExpanded &&
          past.map((item) => (
            <ScheduleCard
              key={item.id}
              item={item}
              language={language}
              isCoach={isCoach}
              onPress={handleSessionPress}
              onMarkComplete={handleMarkComplete}
            />
          ))}
      </ScrollView>
    );
  };

  const PHASE_COLORS: Record<string, string> = {
    attacking: '#10b981',
    defending: '#ef4444',
    transition: '#f59e0b',
    possession: '#8b5cf6',
    goalkeeper: '#06b6d4',
  };

  const renderCalendarContent = () => {
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = ((firstDay.getDay() + 6) % 7);
    const daysInMonth = lastDay.getDate();
    const monthSessions = getSessionsForCalendarMonth();
    const todayStr = new Date().toISOString().split('T')[0];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const cells: { day: number | null; dateStr: string | null; isCurrentMonth: boolean; isToday: boolean }[] = [];
    for (let i = 0; i < startOffset; i++) cells.push({ day: null, dateStr: null, isCurrentMonth: false, isToday: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, dateStr, isCurrentMonth: true, isToday: dateStr === todayStr });
    }
    const remainder = (7 - (cells.length % 7)) % 7;
    for (let i = 0; i < remainder; i++) cells.push({ day: null, dateStr: null, isCurrentMonth: false, isToday: false });

    const selectedSessions = calendarSelectedDate ? monthSessions[calendarSelectedDate] || [] : [];

    return (
      <ScrollView
        style={styles.calendarScroll}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={calendarRefreshing}
            onRefresh={() => fetchCalendar(calendarMonth.year, calendarMonth.month, true)}
            tintColor="#8b5cf6"
          />
        }
      >
        <View style={styles.calendarHeader}>
          <TouchableOpacity onPress={() => handleCalendarMonthChange(-1)} style={styles.calendarArrow}>
            <Feather name="chevron-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.calendarMonthTitle}>
            {monthNames[month]} {year}
          </Text>
          <TouchableOpacity onPress={() => handleCalendarMonthChange(1)} style={styles.calendarArrow}>
            <Feather name="chevron-right" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {calendarLoading ? (
          <View style={styles.calendarLoading}>
            <ActivityIndicator size="small" color="#8b5cf6" />
          </View>
        ) : (
          <>
            <View style={styles.calendarDowRow}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <Text key={d} style={styles.calendarDow}>
                  {d}
                </Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {cells.map((cell, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.calendarCell,
                    cell.isToday && styles.calendarCellToday,
                    calendarSelectedDate === cell.dateStr && styles.calendarCellSelected,
                  ]}
                  onPress={() => cell.dateStr && setCalendarSelectedDate(calendarSelectedDate === cell.dateStr ? null : cell.dateStr)}
                >
                  <Text style={[styles.calendarCellText, !cell.isCurrentMonth && styles.calendarCellMuted]}>
                    {cell.day ?? ''}
                  </Text>
                  {cell.dateStr && monthSessions[cell.dateStr] && (
                    <View style={styles.calendarDots}>
                      {(monthSessions[cell.dateStr] || []).slice(0, 3).map((s, i) => (
                        <View
                          key={i}
                          style={[
                            styles.calendarDot,
                            {
                              backgroundColor:
                                PHASE_COLORS[s.session?.phase_of_play || ''] || '#64748b',
                            },
                          ]}
                        />
                      ))}
                      {(monthSessions[cell.dateStr] || []).length > 3 && (
                        <Text style={styles.calendarDotOverflow}>
                          +{(monthSessions[cell.dateStr] || []).length - 3}
                        </Text>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {!calendarLoading &&
              calendarFetchedMonths[`${year}-${String(month + 1).padStart(2, '0')}`] &&
              Object.keys(monthSessions).length === 0 && (
                <Text style={styles.calendarEmptyMonth}>
                  No training sessions scheduled this month
                </Text>
              )}

            {calendarSelectedDate && selectedSessions.length > 0 && (
              <View style={styles.calendarDayDetail}>
                <Text style={styles.calendarDayDetailTitle}>
                  {new Date(calendarSelectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                {selectedSessions.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.calendarSessionItem}
                    onPress={() => handleSessionPress(s.session?.id || '')}
                  >
                    <Text style={styles.calendarSessionTitle}>
                      {s.session?.title || 'Session'}
                    </Text>
                    <View style={styles.calendarSessionMeta}>
                      <Text style={styles.calendarSessionTeam}>{s.team?.name || 'Team'}</Text>
                      <View
                        style={[
                          styles.calendarSessionBadge,
                          s.status === 'completed' && styles.calendarSessionBadgeCompleted,
                        ]}
                      >
                        <Text style={styles.calendarSessionBadgeText}>{s.status}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    );
  };

  const renderSeasonPlansContent = () => {
    if (seasonPlansLoading && seasonPlans.length === 0) {
      return (
        <View style={styles.listContent}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      );
    }

    if (seasonPlans.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Feather name="calendar" size={48} color="#64748b" />
          <Text style={styles.emptyTitle}>No season plans yet</Text>
          <Text style={styles.emptySubtitle}>Create season plans on the web app</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={seasonPlans}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SeasonPlanCard plan={item} onPress={() => handleSeasonPlanPress(item)} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={seasonPlansRefreshing}
            onRefresh={() => fetchSeasonPlans(true)}
            tintColor="#8b5cf6"
          />
        }
      />
    );
  };

  const renderCurriculumContent = () => {
    if (curriculumLoading && curriculumItems.length === 0) {
      return (
        <View style={styles.listContent}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      );
    }

    if (curriculumItems.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Feather name="book" size={48} color="#64748b" />
          <Text style={styles.emptyTitle}>No curriculum templates available</Text>
          <Text style={styles.emptySubtitle}>Curriculum is managed on the web app</Text>
        </View>
      );
    }

    const byAgeGroup = curriculumItems.reduce<Record<string, CurriculumItem[]>>((acc, item) => {
      const key = item.age_group || 'Other';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    const sections = Object.entries(byAgeGroup).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    return (
      <FlatList
        data={sections}
        keyExtractor={([key]) => key}
        ListHeaderComponent={<View style={{ height: 8 }} />}
        renderItem={({ item: [ageGroup, items] }) => (
          <View style={styles.curriculumSection}>
            <Text style={styles.curriculumSectionTitle}>{ageGroup}</Text>
            {items.map((cur) => (
              <TouchableOpacity
                key={cur.id}
                style={styles.curriculumCard}
                onPress={() => handleCurriculumPress(cur)}
              >
                <Text style={styles.curriculumCardTitle}>{cur.name}</Text>
                <Text style={styles.curriculumCardDesc} numberOfLines={2}>
                  {cur.description || ''}
                </Text>
                <View style={styles.curriculumCardBadges}>
                  <View style={styles.curriculumBadge}>
                    <Text style={styles.curriculumBadgeText}>{cur.total_weeks || 0} weeks</Text>
                  </View>
                  <View style={styles.curriculumBadge}>
                    <Text style={styles.curriculumBadgeText}>
                      {(cur.sessions?.length || 0)} sessions
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={curriculumRefreshing}
            onRefresh={() => fetchCurriculum(true)}
            tintColor="#8b5cf6"
          />
        }
      />
    );
  };

  const renderActivityContent = () => {
    if (activityLoading && activityCoaches.length === 0) {
      return (
        <View style={styles.listContent}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      );
    }

    if (activityCoaches.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Feather name="users" size={48} color="#64748b" />
          <Text style={styles.emptyTitle}>No coaches found</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={activityCoaches}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.activityHeader}>
            <Text style={styles.activityTitle}>Coach Activity</Text>
            <Text style={styles.activitySubtitle}>
              Training Studio usage across your club
            </Text>
            <View style={styles.activitySummaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryNumber}>{activitySummary.totalSessions}</Text>
                <Text style={styles.summaryLabel}>Total Sessions</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryNumber}>{activitySummary.totalScheduled}</Text>
                <Text style={styles.summaryLabel}>Scheduled</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryNumber}>{activitySummary.completionRate}%</Text>
                <Text style={styles.summaryLabel}>Completion</Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => <CoachActivityCard coach={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={activityRefreshing}
            onRefresh={() => fetchActivity(true)}
            tintColor="#8b5cf6"
          />
        }
      />
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'sessions':
        return renderSessionsContent();
      case 'drills':
        return renderDrillsContent();
      case 'schedule':
        return renderScheduleContent();
      case 'calendar':
        return renderCalendarContent();
      case 'season_plans':
        return renderSeasonPlansContent();
      case 'curriculum':
        return renderCurriculumContent();
      case 'activity':
        return renderActivityContent();
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Training Studio</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollContent}
          style={styles.tabScroll}
        >
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab.id && styles.tabTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.tabFade} pointerEvents="none">
          <LinearGradient
            colors={['transparent', 'rgba(15, 23, 42, 0.95)']}
            style={styles.tabFadeGradient}
          />
        </View>
      </View>

      <View style={styles.content}>{renderContent()}</View>
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
  tabWrapper: {
    marginHorizontal: 16,
    marginBottom: 8,
    position: 'relative',
  },
  tabScroll: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
  },
  tabScrollContent: {
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabFade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 24,
  },
  tabFadeGradient: {
    flex: 1,
    width: '100%',
  },
  tab: {
    minWidth: 90,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#8b5cf6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94a3b8',
  },
  tabTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listContent: {
    paddingBottom: 40,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
  },
  placeholderText: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
  },
  skeletonCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    marginBottom: 12,
  },
  skeletonLine: {
    height: 14,
    backgroundColor: '#334155',
    borderRadius: 4,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  skeletonPill: {
    height: 24,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  drillColumnWrapper: {
    gap: 12,
    marginBottom: 12,
  },
  drillCardWrapper: {
    flex: 1,
    minWidth: 0,
  },
  scheduleScroll: {
    flex: 1,
  },
  scheduleSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pastSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 12,
  },
  scheduleSection: {
    marginBottom: 8,
  },
  activityHeader: {
    marginBottom: 16,
  },
  activityTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  activitySubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 16,
  },
  activitySummaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  summaryNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  calendarScroll: {
    flex: 1,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calendarArrow: {
    padding: 8,
  },
  calendarMonthTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  calendarLoading: {
    padding: 32,
    alignItems: 'center',
  },
  calendarDowRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  calendarDow: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  calendarCell: {
    width: (SCREEN_WIDTH - 32) / 7,
    height: (SCREEN_WIDTH - 32) / 7,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    borderRadius: 8,
  },
  calendarCellToday: {
    borderWidth: 2,
    borderColor: '#06b6d4',
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
  },
  calendarCellSelected: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  calendarCellText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  calendarCellMuted: {
    color: '#475569',
  },
  calendarDots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 2,
    marginTop: 2,
  },
  calendarDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  calendarDotOverflow: {
    fontSize: 9,
    color: '#94a3b8',
  },
  calendarEmptyMonth: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
  },
  calendarDayDetail: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    marginBottom: 16,
  },
  calendarDayDetailTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  calendarSessionItem: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  calendarSessionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  calendarSessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  calendarSessionTeam: {
    fontSize: 13,
    color: '#94a3b8',
  },
  calendarSessionBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  calendarSessionBadgeCompleted: {
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
  },
  calendarSessionBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'capitalize',
  },
  curriculumSection: {
    marginBottom: 24,
  },
  curriculumSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  curriculumCard: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  curriculumCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  curriculumCardDesc: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 12,
  },
  curriculumCardBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  curriculumBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  curriculumBadgeText: {
    fontSize: 11,
    color: '#94a3b8',
  },
});
