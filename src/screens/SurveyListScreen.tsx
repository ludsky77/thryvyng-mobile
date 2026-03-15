import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const ADMIN_ROLES = new Set([
  'club_director',
  'club_admin',
  'platform_admin',
]);

const LANG = 'en';

interface SurveyListScreenParams {
  clubId: string;
}

interface SurveyRow {
  id: string;
  title: string;
  title_es?: string | null;
  status: string;
  created_at: string;
  closes_at?: string | null;
  sv_responses?: { count: number }[] | { count: number };
}

export default function SurveyListScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { currentRole } = useAuth();
  const params = (route.params || {}) as SurveyListScreenParams;
  const clubId = params.clubId;

  const isAdmin = ADMIN_ROLES.has(currentRole?.role ?? '');
  const filterOptions = isAdmin
    ? (['all', 'open', 'draft', 'closed'] as const)
    : (['all', 'open', 'closed'] as const);

  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'draft' | 'closed'>('all');

  const loadSurveys = useCallback(async () => {
    if (!clubId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sv_surveys')
        .select('id, title, title_es, status, created_at, closes_at, sv_responses(count)')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data || []).map((r: any) => {
        const resp = r.sv_responses;
        const count = Array.isArray(resp) ? (resp[0]?.count ?? 0) : (resp?.count ?? 0);
        return { ...r, responseCount: count };
      });

      setSurveys(rows);
    } catch {
      setSurveys([]);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    loadSurveys();
  }, [loadSurveys]);

  const filtered = surveys.filter((s) => {
    if (filter === 'all') return true;
    return s.status === filter;
  });

  const isEs = LANG === 'es';
  const getTitle = (s: SurveyRow) => (isEs && s.title_es ? s.title_es : s.title);

  const formatCloses = (closesAt: string | null | undefined): string => {
    if (!closesAt) return '';
    const d = new Date(closesAt);
    return `Closes ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  const getStatusColor = (status: string) => {
    if (status === 'open') return '#10b981';
    if (status === 'draft') return '#94a3b8';
    return '#64748b';
  };

  if (!clubId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Club ID required</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Surveys</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.tabs}>
        <ScrollView horizontal contentContainerStyle={styles.tabsContent} showsHorizontalScrollIndicator={false}>
          {filterOptions.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.tab, filter === f && styles.tabActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.tabText, filter === f && styles.tabTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Feather name="clipboard" size={64} color="#475569" />
          <Text style={styles.emptyText}>No surveys yet</Text>
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {filtered.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.card}
              onPress={() => navigation.navigate('SurveyResults', { surveyId: s.id })}
              activeOpacity={0.8}
            >
              <View style={styles.cardMain}>
                <Text style={styles.cardTitle} numberOfLines={2}>{getTitle(s)}</Text>
                <View style={styles.cardRow}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(s.status) + '30' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(s.status) }]}>{s.status}</Text>
                  </View>
                  <Text style={styles.responseCount}>{(s as any).responseCount ?? 0} responses</Text>
                </View>
                {s.closes_at && (
                  <Text style={styles.closesText}>{formatCloses(s.closes_at)}</Text>
                )}
              </View>
              <Feather name="chevron-right" size={22} color="#64748b" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerBack: { padding: 8, marginLeft: -8 },
  headerRight: { width: 40 },
  headerTitle: { flex: 1, color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  tabs: { height: 52, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  tabsContent: { paddingHorizontal: 16, alignItems: 'center', gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: '#1e293b' },
  tabActive: { backgroundColor: '#8b5cf6' },
  tabText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#ef4444', fontSize: 16 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { color: '#94a3b8', fontSize: 18, fontWeight: '600', marginTop: 16 },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardMain: { flex: 1 },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  responseCount: { color: '#94a3b8', fontSize: 13 },
  closesText: { color: '#64748b', fontSize: 12, marginTop: 4 },
});
