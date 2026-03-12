import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

const LANG = 'en';

interface SurveyResultsParams {
  surveyId: string;
}

interface Question {
  id: string;
  question_text: string;
  question_text_es?: string | null;
  question_type: string;
  display_order: number;
  scale_label_min?: string | null;
  scale_label_max?: string | null;
  scale_label_min_es?: string | null;
  scale_label_max_es?: string | null;
  sv_question_options?: Array<{
    id: string;
    option_label?: string | null;
    option_label_es?: string | null;
    display_order?: number | null;
  }>;
}

interface Answer {
  question_id: string;
  answer_numeric?: number | null;
  answer_text?: string | null;
  selected_option_id?: string | null;
  answer_array?: string[] | null;
  answer_freetext?: string | null;
}

interface Response {
  id: string;
  time_to_complete_sec?: number | null;
  sv_answers?: Answer[];
}

export default function SurveyResultsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const params = (route.params || {}) as SurveyResultsParams;
  const surveyId = params.surveyId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [survey, setSurvey] = useState<{
    id: string;
    title: string;
    title_es?: string | null;
    status: string;
    closes_at?: string | null;
  } | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);

  const loadData = useCallback(async () => {
    if (!surveyId) {
      setError('Survey ID required');
      setLoading(false);
      return;
    }

    try {
      const { data, error: dataErr } = await supabase
        .from('sv_surveys')
        .select(
          `id, title, title_es, status, closes_at,
          sv_questions(id, question_text, question_text_es, question_type, display_order, scale_label_min, scale_label_max, scale_label_min_es, scale_label_max_es, sv_question_options(id, option_label, option_label_es, display_order)),
          sv_responses(id, time_to_complete_sec, sv_answers(question_id, answer_numeric, answer_text, selected_option_id, answer_array, answer_freetext))`
        )
        .eq('id', surveyId)
        .single();

      if (dataErr || !data) throw new Error('Survey not found');

      const raw = data as any;
      setSurvey({
        id: raw.id,
        title: raw.title,
        title_es: raw.title_es,
        status: raw.status,
        closes_at: raw.closes_at,
      });

      const rawQs = raw.sv_questions;
      const qs: Question[] = (Array.isArray(rawQs) ? rawQs : rawQs ? [rawQs] : [])
        .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
        .map((q: any) => ({ ...q }));
      setQuestions(qs);

      const rawResps = raw.sv_responses;
      const resps: Response[] = Array.isArray(rawResps) ? rawResps : rawResps ? [rawResps] : [];
      setResponses(resps);
    } catch (err: any) {
      setError(err?.message || 'Failed to load survey');
    } finally {
      setLoading(false);
    }
  }, [surveyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isEs = LANG === 'es';

  const totalResponses = responses.length;
  const avgTimeSec = useMemo(() => {
    if (totalResponses === 0) return 0;
    const sum = responses.reduce((s, r) => s + (r.time_to_complete_sec ?? 0), 0);
    return Math.round(sum / totalResponses);
  }, [responses, totalResponses]);

  const formatAvgTime = (sec: number): string => {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  const daysRemaining = useMemo(() => {
    if (!survey?.closes_at) return null;
    const now = new Date();
    const closes = new Date(survey.closes_at);
    const diffMs = closes.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return diffDays;
  }, [survey?.closes_at]);

  const getAllAnswersForQuestion = (questionId: string): Answer[] => {
    const out: Answer[] = [];
    responses.forEach((r) => {
      const raw = r.sv_answers;
      const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
      arr.forEach((a: any) => {
        if (a?.question_id === questionId) out.push(a);
      });
    });
    return out;
  };

  const renderQuestionResult = (q: Question) => {
    const answers = getAllAnswersForQuestion(q.id);
    const qText = isEs && q.question_text_es ? q.question_text_es : q.question_text;
    const opts = Array.isArray(q.sv_question_options) ? q.sv_question_options : q.sv_question_options ? [q.sv_question_options] : [];

    const responseCountText = (
      <Text style={styles.responseCountText}>{answers.length} responses</Text>
    );

    if (q.question_type === 'star') {
      const nums = answers.map((a) => a.answer_numeric).filter((n): n is number => n != null && n > 0);
      const avg = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
      return (
        <View style={styles.qCard}>
          <Text style={styles.qText}>{qText}</Text>
          {responseCountText}
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => {
              const filled = n <= Math.round(avg);
              return (
                <Feather
                  key={n}
                  name="star"
                  size={24}
                  color={filled ? '#8b5cf6' : '#334155'}
                  fill={filled ? '#8b5cf6' : 'transparent'}
                  style={styles.starIcon}
                />
              );
            })}
          </View>
          <Text style={styles.qMeta}>{avg.toFixed(1)} / 5</Text>
        </View>
      );
    }

    if (q.question_type === 'nps') {
      const nums = answers.map((a) => a.answer_numeric).filter((n): n is number => n != null && n >= 0);
      const promoters = nums.filter((n) => n >= 9).length;
      const passives = nums.filter((n) => n >= 7 && n <= 8).length;
      const detractors = nums.filter((n) => n <= 6).length;
      const n = nums.length;
      const npsScore = n ? Math.round(((promoters - detractors) / n) * 100) : 0;
      const pPct = n ? Math.round((promoters / n) * 100) : 0;
      const passPct = n ? Math.round((passives / n) * 100) : 0;
      const dPct = n ? Math.round((detractors / n) * 100) : 0;
      return (
        <View style={styles.qCard}>
          <Text style={styles.qText}>{qText}</Text>
          {responseCountText}
          <Text style={styles.npsScore}>{npsScore}</Text>
          <View style={styles.npsBarTrack}>
            <View style={[styles.npsBarDetractors, { width: `${dPct}%` }]} />
            <View style={[styles.npsBarPassives, { width: `${passPct}%` }]} />
            <View style={[styles.npsBarPromoters, { width: `${pPct}%` }]} />
          </View>
          <Text style={styles.qMeta}>{pPct}% promoters · {passPct}% passives · {dPct}% detractors</Text>
        </View>
      );
    }

    if (q.question_type === 'yesno') {
      const yesCount = answers.filter((a) => a.answer_text === 'yes').length;
      const noCount = answers.filter((a) => a.answer_text === 'no').length;
      const total = yesCount + noCount;
      const yesPct = total ? (yesCount / total) * 100 : 50;
      return (
        <View style={styles.qCard}>
          <Text style={styles.qText}>{qText}</Text>
          {responseCountText}
          <Text style={styles.qMeta}>{Math.round(yesPct)}% Yes · {Math.round(100 - yesPct)}% No</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barYes, { width: `${yesPct}%` }]} />
            <View style={[styles.barNo, { width: `${100 - yesPct}%` }]} />
          </View>
        </View>
      );
    }

    if (q.question_type === 'mc_single' || q.question_type === 'mc_multi') {
      const counts: Record<string, number> = {};
      opts.forEach((o) => { counts[o.id] = 0; });
      answers.forEach((a) => {
        if (q.question_type === 'mc_single' && a.selected_option_id) {
          counts[a.selected_option_id] = (counts[a.selected_option_id] ?? 0) + 1;
        }
        if (q.question_type === 'mc_multi' && Array.isArray(a.answer_array)) {
          a.answer_array.forEach((id: string) => {
            counts[id] = (counts[id] ?? 0) + 1;
          });
        }
      });
      const maxCount = Math.max(0, ...Object.values(counts));
      return (
        <View style={styles.qCard}>
          <Text style={styles.qText}>{qText}</Text>
          {responseCountText}
          {opts.map((o) => {
            const cnt = counts[o.id] ?? 0;
            const pct = maxCount ? (cnt / maxCount) * 100 : 0;
            const label = isEs && o.option_label_es ? o.option_label_es : o.option_label ?? '';
            return (
              <View key={o.id} style={styles.optRow}>
                <Text style={styles.optLabel} numberOfLines={2}>{label}</Text>
                <View style={styles.optBarTrack}>
                  <View style={[styles.optBarFill, { width: `${pct}%` }]} />
                </View>
                <Text style={styles.optCount}>{cnt}</Text>
              </View>
            );
          })}
        </View>
      );
    }

    if (q.question_type === 'scale') {
      const nums = answers.map((a) => a.answer_numeric).filter((n): n is number => n != null);
      const avg = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
      const min = isEs && q.scale_label_min_es ? q.scale_label_min_es : q.scale_label_min ?? '1';
      const max = isEs && q.scale_label_max_es ? q.scale_label_max_es : q.scale_label_max ?? '10';
      return (
        <View style={styles.qCard}>
          <Text style={styles.qText}>{qText}</Text>
          {responseCountText}
          <Text style={styles.qMeta}>{avg.toFixed(1)} / 10</Text>
          <Text style={styles.scaleLabels}>{min} — {max}</Text>
        </View>
      );
    }

    if (q.question_type === 'text') {
      const texts = answers
        .map((a) => a.answer_freetext)
        .filter((t): t is string => !!t && typeof t === 'string');
      const first3 = texts.slice(0, 3);
      return (
        <View style={styles.qCard}>
          <Text style={styles.qText}>{qText}</Text>
          {responseCountText}
          <Text style={styles.qMeta}>{texts.length} text responses</Text>
          {first3.map((t, i) => (
            <View key={i} style={styles.quoteCard}>
              <Text style={styles.quoteText} numberOfLines={2}>{t}</Text>
            </View>
          ))}
        </View>
      );
    }

    return (
      <View style={styles.qCard}>
        <Text style={styles.qText}>{qText}</Text>
        {responseCountText}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  if (error || !survey) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error || 'Survey not found'}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const surveyTitle = isEs && survey.title_es ? survey.title_es : survey.title;
  const statusColor =
    survey.status === 'open' ? '#10b981' :
    survey.status === 'draft' ? '#94a3b8' : '#64748b';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={2}>{surveyTitle}</Text>
          <View style={styles.headerMeta}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusText}>{survey.status}</Text>
            </View>
            <Text style={styles.responseCount}>{totalResponses} responses</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalResponses}</Text>
            <Text style={styles.statLabel}>Total Responses</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatAvgTime(avgTimeSec)}</Text>
            <Text style={styles.statLabel}>Avg Time</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {daysRemaining === null ? '—' : daysRemaining < 0 ? 'Closed' : `${daysRemaining}`}
            </Text>
            <Text style={styles.statLabel}>
              {daysRemaining === null ? 'No close date' : daysRemaining < 0 ? 'Status' : 'Days Remaining'}
            </Text>
          </View>
        </ScrollView>

        <Text style={styles.sectionTitle}>Results by Question</Text>
        {questions.map((q) => (
          <View key={q.id}>{renderQuestionResult(q)}</View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  errorWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#ef4444', fontSize: 16, marginBottom: 16 },
  backBtn: { backgroundColor: '#8b5cf6', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  backBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerBack: { padding: 8, marginLeft: -8 },
  headerCenter: { flex: 1 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  responseCount: { color: '#94a3b8', fontSize: 13 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 120,
  },
  statValue: { color: '#fff', fontSize: 24, fontWeight: '700' },
  statLabel: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  sectionTitle: { color: '#94a3b8', fontSize: 14, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase' },

  qCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  qText: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  responseCountText: { color: '#94a3b8', fontSize: 13, marginBottom: 8 },
  qMeta: { color: '#94a3b8', fontSize: 13, marginBottom: 8 },
  starRow: { flexDirection: 'row', gap: 4, marginVertical: 8 },
  starIcon: {},
  npsScore: { color: '#8b5cf6', fontSize: 36, fontWeight: '700', marginVertical: 8 },
  npsBarTrack: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  npsBarDetractors: { backgroundColor: '#8b5cf6', height: '100%' },
  npsBarPassives: { backgroundColor: '#64748b', height: '100%' },
  npsBarPromoters: { backgroundColor: '#10b981', height: '100%' },
  barTrack: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  barYes: { backgroundColor: '#8b5cf6', height: '100%' },
  barNo: { backgroundColor: '#64748b', height: '100%' },
  optRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  optLabel: { flex: 1, color: '#fff', fontSize: 14 },
  optBarTrack: { flex: 2, height: 6, backgroundColor: '#334155', borderRadius: 3, overflow: 'hidden' },
  optBarFill: { height: '100%', backgroundColor: '#8b5cf6', borderRadius: 3 },
  optCount: { color: '#94a3b8', fontSize: 12, width: 24, textAlign: 'right' },
  scaleLabels: { color: '#64748b', fontSize: 12 },
  quoteCard: { backgroundColor: '#334155', padding: 12, borderRadius: 8, marginTop: 8 },
  quoteText: { color: '#94a3b8', fontSize: 14, fontStyle: 'italic' },
});
