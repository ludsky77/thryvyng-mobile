import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const LANG = 'en';

interface SurveyResponseScreenParams {
  surveyId?: string;
  slug?: string;
  respondentTeamId?: string;
}

interface Survey {
  id: string;
  title: string;
  title_es?: string | null;
  status: string;
}

interface QuestionOption {
  id: string;
  question_id: string;
  option_text?: string | null;
  option_text_es?: string | null;
  display_order?: number | null;
}

interface Question {
  id: string;
  survey_id: string;
  question_text: string;
  question_text_es?: string | null;
  question_type: string;
  display_order: number;
  is_required?: boolean;
  scale_label_min?: string | null;
  scale_label_max?: string | null;
  scale_label_min_es?: string | null;
  scale_label_max_es?: string | null;
  options?: QuestionOption[];
}

type AnswerState =
  | { type: 'star'; value: number }
  | { type: 'nps'; value: number }
  | { type: 'yesno'; value: 'yes' | 'no' | null }
  | { type: 'mc_single'; value: string | null }
  | { type: 'mc_multi'; value: string[] }
  | { type: 'scale'; value: number }
  | { type: 'text'; value: string };

function mapRoleToRespondent(role: string): string {
  const m: Record<string, string> = {
    parent: 'parents',
    player: 'players',
    head_coach: 'coaches',
    assistant_coach: 'coaches',
    team_manager: 'managers',
    club_admin: 'managers',
  };
  return m[role] ?? 'parents';
}

export default function SurveyResponseScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { user, currentRole } = useAuth();
  const params = (route.params || {}) as SurveyResponseScreenParams;

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const mountTime = useRef(Date.now());

  const lang = LANG;
  const isEs = lang === 'es';

  const loadSurvey = useCallback(async () => {
    setLoading(true);
    setError(null);
    const surveyId = params.surveyId;
    const slug = params.slug;

    try {
      let surveyRow: Survey | null = null;

      if (surveyId) {
        const { data, error: e } = await supabase
          .from('sv_surveys')
          .select('id, title, title_es, status')
          .eq('id', surveyId)
          .single();
        if (e || !data) throw new Error('Survey not found');
        surveyRow = data as Survey;
      } else if (slug) {
        const { data, error: e } = await supabase
          .from('sv_surveys')
          .select('id, title, title_es, status')
          .eq('public_slug', slug)
          .eq('status', 'open')
          .single();
        if (e || !data) throw new Error('Survey not found');
        surveyRow = data as Survey;
      } else {
        throw new Error('surveyId or slug required');
      }

      setSurvey(surveyRow);

      const { data: qData, error: qErr } = await supabase
        .from('sv_questions')
        .select('id, survey_id, question_text, question_text_es, question_type, display_order, is_required, scale_label_min, scale_label_max, scale_label_min_es, scale_label_max_es, sv_question_options(id, question_id, option_label, option_label_es, display_order)')
        .eq('survey_id', surveyRow.id)
        .order('display_order', { ascending: true });

      if (qErr || !qData?.length) {
        setQuestions([]);
        setLoading(false);
        return;
      }

      const qs: Question[] = (qData as any[]).map((q) => {
        const rawOpts = q.sv_question_options;
        const rawArr = Array.isArray(rawOpts) ? rawOpts : rawOpts ? [rawOpts] : [];
        const opts: QuestionOption[] = rawArr.map((o: any) => ({
          ...o,
          option_text: o.option_label ?? o.option_text,
          option_text_es: o.option_label_es ?? o.option_text_es,
        }));
        opts.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
        const { sv_question_options: _, ...rest } = q;
        return { ...rest, options: opts };
      });

      setQuestions(qs);

      const initial: Record<string, AnswerState> = {};
      qs.forEach((q) => {
        if (q.question_type === 'star') initial[q.id] = { type: 'star', value: 0 };
        else if (q.question_type === 'nps') initial[q.id] = { type: 'nps', value: -1 };
        else if (q.question_type === 'yesno') initial[q.id] = { type: 'yesno', value: null };
        else if (q.question_type === 'mc_single') initial[q.id] = { type: 'mc_single', value: null };
        else if (q.question_type === 'mc_multi') initial[q.id] = { type: 'mc_multi', value: [] };
        else if (q.question_type === 'scale') initial[q.id] = { type: 'scale', value: 5 };
        else if (q.question_type === 'text') initial[q.id] = { type: 'text', value: '' };
      });
      setAnswers(initial);
    } catch (err: any) {
      setError(err?.message || 'Failed to load survey');
      setSurvey(null);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [params.surveyId, params.slug]);

  useEffect(() => {
    loadSurvey();
  }, [loadSurvey]);

  const hasAnyAnswer = Object.values(answers).some((a) => {
    if (!a) return false;
    if (a.type === 'star') return a.value > 0;
    if (a.type === 'nps') return a.value >= 0;
    if (a.type === 'yesno') return a.value != null;
    if (a.type === 'mc_single') return a.value != null;
    if (a.type === 'mc_multi') return a.value.length > 0;
    if (a.type === 'scale') return true;
    if (a.type === 'text') return (a.value as string).trim().length > 0;
    return false;
  });

  const handleBack = () => {
    if (currentIndex === 0) {
      if (hasAnyAnswer) {
        Alert.alert(
          'Discard responses?',
          'Your answers will not be saved if you leave now.',
          [
            { text: 'Stay', style: 'cancel' },
            { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
          ]
        );
      } else {
        navigation.goBack();
      }
    } else {
      setCurrentIndex((i) => i - 1);
    }
  };

  const currentQ = questions[currentIndex];
  const currentAnswer = currentQ ? answers[currentQ.id] : null;

  const isValidAnswer = (): boolean => {
    if (!currentQ || !currentAnswer) return !currentQ?.is_required;
    if (!currentQ.is_required) return true;
    if (currentAnswer.type === 'star') return (currentAnswer as any).value > 0;
    if (currentAnswer.type === 'nps') return (currentAnswer as any).value >= 0;
    if (currentAnswer.type === 'yesno') return (currentAnswer as any).value != null;
    if (currentAnswer.type === 'mc_single') return (currentAnswer as any).value != null;
    if (currentAnswer.type === 'mc_multi') return (currentAnswer as any).value.length > 0;
    if (currentAnswer.type === 'scale') return true;
    if (currentAnswer.type === 'text') return ((currentAnswer as any).value as string).trim().length > 0;
    return true;
  };

  const handleNext = async () => {
    if (currentIndex === questions.length - 1) {
      await handleSubmit();
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handleSubmit = async () => {
    if (!survey || !questions.length || submitting) return;
    setSubmitting(true);

    try {
      let respondentTeamId = params.respondentTeamId;
      if (!respondentTeamId && user?.id) {
        const { data: dist } = await supabase
          .from('sv_distributions')
          .select('team_id')
          .eq('survey_id', survey.id)
          .eq('user_id', user.id)
          .is('completed_at', null)
          .limit(1)
          .single();
        respondentTeamId = (dist as any)?.team_id ?? undefined;
      }

      const timeToCompleteSec = Math.round((Date.now() - mountTime.current) / 1000);
      const role = mapRoleToRespondent(currentRole?.role || 'parent');

      const { data: respData, error: respErr } = await supabase
        .from('sv_responses')
        .insert({
          survey_id: survey.id,
          respondent_user_id: user?.id ?? null,
          respondent_team_id: respondentTeamId ?? null,
          respondent_role: role,
          is_guest: false,
          language_used: lang,
          completed_at: new Date().toISOString(),
          time_to_complete_sec: timeToCompleteSec,
        })
        .select('id')
        .single();

      if (respErr) throw respErr;
      const responseId = (respData as any).id;

      for (const q of questions) {
        const a = answers[q.id];
        if (!a) continue;

        const row: Record<string, any> = {
          response_id: responseId,
          question_id: q.id,
        };

        if (a.type === 'star') row.answer_numeric = (a as any).value;
        else if (a.type === 'nps') row.answer_numeric = (a as any).value;
        else if (a.type === 'yesno') row.answer_text = (a as any).value;
        else if (a.type === 'mc_single') row.selected_option_id = (a as any).value;
        else if (a.type === 'mc_multi') row.answer_array = (a as any).value;
        else if (a.type === 'scale') row.answer_numeric = (a as any).value;
        else if (a.type === 'text') row.answer_freetext = (a as any).value;

        await supabase.from('sv_answers').insert(row);
      }

      if (user?.id) {
        await supabase
          .from('sv_distributions')
          .update({ completed_at: new Date().toISOString() })
          .eq('survey_id', survey.id)
          .eq('user_id', user.id);
      }

      setSubmitted(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const setAnswer = (qId: string, updater: (prev: AnswerState) => AnswerState) => {
    setAnswers((prev) => {
      const next = { ...prev };
      next[qId] = updater(prev[qId]!);
      return next;
    });
  };

  useEffect(() => {
    if (submitted) {
      const t = setTimeout(() => navigation.goBack(), 3000);
      return () => clearTimeout(t);
    }
  }, [submitted, navigation]);

  // Thank you screen
  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.thankYouWrap}>
          <View style={styles.checkCircle}>
            <Feather name="check" size={48} color="#10b981" />
          </View>
          <Text style={styles.thankYouTitle}>Thank you</Text>
          <Text style={styles.thankYouSub}>Your response has been recorded</Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
  const progress = questions.length > 0 ? (currentIndex + 1) / questions.length : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.headerBack}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{surveyTitle}</Text>
          <Text style={styles.headerMeta}>
            Question {currentIndex + 1} of {questions.length}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {!currentQ ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No questions in this survey</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.questionBlock}>
            <View style={styles.questionRow}>
              <Text style={styles.questionText}>
                {isEs && currentQ.question_text_es ? currentQ.question_text_es : currentQ.question_text}
              </Text>
              {currentQ.is_required && (
                <View style={styles.requiredBadge}>
                  <Text style={styles.requiredText}>Required</Text>
                </View>
              )}
            </View>

            {currentQ.question_type === 'star' && (
              <View style={styles.starRow}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const v = (currentAnswer as any)?.value ?? 0;
                  const filled = n <= v;
                  return (
                    <TouchableOpacity
                      key={n}
                      style={styles.starBtn}
                      onPress={() => setAnswer(currentQ.id, () => ({ type: 'star', value: n }))}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Feather
                        name="star"
                        size={40}
                        color={filled ? '#8b5cf6' : '#64748b'}
                        fill={filled ? '#8b5cf6' : 'transparent'}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {(currentAnswer as any)?.type === 'star' && (currentAnswer as any)?.value > 0 && (
              <Text style={styles.starCount}>{(currentAnswer as any).value}/5</Text>
            )}

            {currentQ.question_type === 'nps' && (
              <View style={styles.npsRow}>
                {Array.from({ length: 11 }, (_, n) => {
                  const v = (currentAnswer as any)?.value ?? -1;
                  const sel = v === n;
                  return (
                    <TouchableOpacity
                      key={n}
                      style={[styles.npsCircle, sel && styles.npsCircleSelected]}
                      onPress={() => setAnswer(currentQ.id, () => ({ type: 'nps', value: n }))}
                    >
                      <Text style={[styles.npsNum, sel && styles.npsNumSelected]}>{n}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {currentQ.question_type === 'yesno' && (
              <View style={styles.yesnoRow}>
                {(['yes', 'no'] as const).map((val) => {
                  const sel = (currentAnswer as any)?.value === val;
                  return (
                    <TouchableOpacity
                      key={val}
                      style={[styles.yesnoBtn, sel && styles.yesnoBtnSelected]}
                      onPress={() => setAnswer(currentQ.id, () => ({ type: 'yesno', value: val }))}
                    >
                      {val === 'yes' ? (
                        <Ionicons name="thumbs-up" size={32} color={sel ? '#8b5cf6' : '#94a3b8'} />
                      ) : (
                        <Ionicons name="thumbs-down" size={32} color={sel ? '#8b5cf6' : '#94a3b8'} />
                      )}
                      <Text style={[styles.yesnoLabel, sel && styles.yesnoLabelSelected]}>
                        {val === 'yes' ? 'Yes' : 'No'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {currentQ.question_type === 'mc_single' && (
              <View style={styles.mcList}>
                {(currentQ.options || []).map((opt) => {
                  const sel = (currentAnswer as any)?.value === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.mcCard, sel && styles.mcCardSelected]}
                      onPress={() => setAnswer(currentQ.id, () => ({ type: 'mc_single', value: opt.id }))}
                    >
                      <Text style={styles.mcText}>
                        {isEs && opt.option_text_es ? opt.option_text_es : opt.option_text || ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {currentQ.question_type === 'mc_multi' && (
              <View style={styles.mcList}>
                {(currentQ.options || []).map((opt) => {
                  const arr = (currentAnswer as any)?.value ?? [];
                  const sel = arr.includes(opt.id);
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.mcCard, sel && styles.mcCardSelected]}
                      onPress={() =>
                        setAnswer(currentQ.id, (prev) => {
                          const p = prev as { type: 'mc_multi'; value: string[] };
                          const next = sel ? p.value.filter((id) => id !== opt.id) : [...p.value, opt.id];
                          return { type: 'mc_multi', value: next };
                        })
                      }
                    >
                      <View style={[styles.checkbox, sel && styles.checkboxChecked]}>
                        {sel && <Feather name="check" size={16} color="#fff" />}
                      </View>
                      <Text style={styles.mcText}>
                        {isEs && opt.option_text_es ? opt.option_text_es : opt.option_text || ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {currentQ.question_type === 'scale' && (
              <View style={styles.scaleBlock}>
                <Text style={styles.scaleMin}>
                  {isEs && currentQ.scale_label_min_es ? currentQ.scale_label_min_es : currentQ.scale_label_min || '1'}
                </Text>
                <View style={styles.scaleRow}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
                    const v = (currentAnswer as any)?.value ?? 5;
                    const sel = v === n;
                    return (
                      <TouchableOpacity
                        key={n}
                        style={[styles.scaleCircle, sel && styles.scaleCircleSelected]}
                        onPress={() => setAnswer(currentQ.id, () => ({ type: 'scale', value: n }))}
                      >
                        <Text style={[styles.scaleNum, sel && styles.scaleNumSelected]}>{n}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.scaleMax}>
                  {isEs && currentQ.scale_label_max_es ? currentQ.scale_label_max_es : currentQ.scale_label_max || '10'}
                </Text>
                <Slider
                  style={styles.slider}
                  minimumValue={1}
                  maximumValue={10}
                  step={1}
                  value={(currentAnswer as any)?.value ?? 5}
                  onValueChange={(val) => setAnswer(currentQ.id, () => ({ type: 'scale', value: Math.round(val) }))}
                  minimumTrackTintColor="#8b5cf6"
                  maximumTrackTintColor="#334155"
                  thumbTintColor="#fff"
                />
              </View>
            )}

            {currentQ.question_type === 'text' && (
              <TextInput
                style={styles.textInput}
                placeholder="Type your answer..."
                placeholderTextColor="#64748b"
                multiline
                value={(currentAnswer as any)?.value ?? ''}
                onChangeText={(t) => setAnswer(currentQ.id, () => ({ type: 'text', value: t }))}
              />
            )}
          </View>
        </ScrollView>
      )}

      <View style={styles.navBar}>
        <TouchableOpacity
          style={[styles.navBtn, styles.navBack, currentIndex === 0 && styles.navDisabled]}
          onPress={handleBack}
          disabled={currentIndex === 0}
        >
          <Feather name="arrow-left" size={20} color={currentIndex === 0 ? '#64748b' : '#fff'} />
          <Text style={[styles.navBtnText, currentIndex === 0 && styles.navDisabledText]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navBtn, styles.navNext, (!isValidAnswer() || submitting) && styles.navDisabled]}
          onPress={handleNext}
          disabled={!isValidAnswer() || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={[styles.navBtnText, (!isValidAnswer() || submitting) && styles.navDisabledText]}>
                {currentIndex === questions.length - 1 ? 'Submit' : 'Next'}
              </Text>
              {currentIndex < questions.length - 1 && (
                <Feather name="arrow-right" size={20} color={!isValidAnswer() || submitting ? '#64748b' : '#fff'} />
              )}
            </>
          )}
        </TouchableOpacity>
      </View>
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
  headerCenter: { flex: 1, alignItems: 'center' },
  headerRight: { width: 40 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  headerMeta: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  progressBar: { height: 4, backgroundColor: '#1e293b' },
  progressFill: { height: '100%', backgroundColor: '#8b5cf6' },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  questionBlock: { marginBottom: 24 },
  questionRow: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 },
  questionText: { flex: 1, color: '#fff', fontSize: 18, lineHeight: 26 },
  requiredBadge: { backgroundColor: 'rgba(239, 68, 68, 0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  requiredText: { color: '#ef4444', fontSize: 12, fontWeight: '600' },

  starRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 24 },
  starBtn: { padding: 8 },
  starCount: { color: '#94a3b8', fontSize: 14, textAlign: 'center', marginTop: 8 },

  npsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 24 },
  npsCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  npsCircleSelected: { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' },
  npsNum: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  npsNumSelected: { color: '#fff' },

  yesnoRow: { flexDirection: 'row', gap: 16, marginTop: 24 },
  yesnoBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: '#334155',
    borderRadius: 12,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  yesnoBtnSelected: { borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.15)' },
  yesnoLabel: { color: '#94a3b8', fontSize: 16, fontWeight: '600' },
  yesnoLabelSelected: { color: '#8b5cf6' },

  mcList: { marginTop: 16, gap: 10 },
  mcCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 0,
    gap: 12,
  },
  mcCardSelected: { borderColor: '#8b5cf6', borderLeftWidth: 4, borderLeftColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)' },
  mcText: { flex: 1, color: '#fff', fontSize: 16 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' },

  scaleBlock: { marginTop: 24 },
  scaleMin: { color: '#94a3b8', fontSize: 13 },
  scaleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  scaleCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleCircleSelected: { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' },
  scaleNum: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  scaleNumSelected: { color: '#fff' },
  scaleMax: { color: '#94a3b8', fontSize: 13, textAlign: 'right' },
  slider: { width: '100%', height: 40 },

  textInput: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
  },

  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBack: {},
  navNext: { backgroundColor: '#8b5cf6', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  navDisabled: { opacity: 0.5 },
  navDisabledText: { color: '#64748b' },
  navBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },

  thankYouWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  thankYouTitle: { color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 8 },
  thankYouSub: { color: '#94a3b8', fontSize: 16, marginBottom: 32 },
  doneBtn: { backgroundColor: '#8b5cf6', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 10 },
  doneBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#94a3b8', fontSize: 16 },
});
