import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface PendingSurvey {
  distributionId: string;
  surveyId: string;
  title: string;
  closesAt: string | null;
}

interface SurveyPopupModalProps {
  navigation: any;
}

function getTodayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function getDismissalKey(surveyId: string): string {
  return `survey_dismissed_${surveyId}_${getTodayDateString()}`;
}

function formatDeadline(closesAt: string | null): string {
  if (!closesAt) return 'No deadline';
  const d = new Date(closesAt);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isClosingSoon(closesAt: string | null): boolean {
  if (!closesAt) return false;
  const diffMs = new Date(closesAt).getTime() - Date.now();
  return diffMs > 0 && diffMs < 48 * 60 * 60 * 1000;
}

export default function SurveyPopupModal({ navigation }: SurveyPopupModalProps) {
  const { user } = useAuth();
  const [survey, setSurvey] = useState<PendingSurvey | null>(null);
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);

  const checkAndShow = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('sv_distributions')
        .select(`
          id,
          survey_id,
          sv_surveys!inner(
            id,
            title,
            closes_at,
            status
          )
        `)
        .eq('user_id', user.id)
        .is('completed_at', null)
        .limit(10);

      if (error || !data) return;

      const rows = (data as any[]).filter(
        (r) => r.sv_surveys?.status === 'open'
      );

      if (rows.length === 0) return;

      // Pick the first open survey that hasn't been dismissed today
      for (const row of rows) {
        const surveyId: string = row.survey_id;
        const dismissed = await AsyncStorage.getItem(getDismissalKey(surveyId));
        if (!dismissed) {
          setSurvey({
            distributionId: row.id,
            surveyId,
            title: row.sv_surveys?.title ?? 'Survey',
            closesAt: row.sv_surveys?.closes_at ?? null,
          });
          setVisible(true);
          break;
        }
      }
    } catch {
      // Silently ignore — non-critical
    } finally {
      setChecked(true);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id && !checked) {
      checkAndShow();
    }
  }, [user?.id, checked, checkAndShow]);

  const handleAnswerNow = () => {
    setVisible(false);
    if (!survey) return;
    try {
      navigation.navigate('SurveyResponse', { surveyId: survey.surveyId });
    } catch {
      navigation.getParent()?.navigate('SurveyResponse', { surveyId: survey.surveyId });
    }
  };

  const handleRemindLater = async () => {
    setVisible(false);
    if (!survey) return;
    try {
      await AsyncStorage.setItem(getDismissalKey(survey.surveyId), '1');
    } catch {
      // ignore
    }
  };

  if (!visible || !survey) return null;

  const soon = isClosingSoon(survey.closesAt);
  const deadline = formatDeadline(survey.closesAt);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleRemindLater}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Icon */}
          <View style={styles.iconWrap}>
            <Ionicons name="clipboard-outline" size={36} color="#8b5cf6" />
          </View>

          {/* Title */}
          <Text style={styles.title}>Your Club Needs Your Feedback</Text>

          {/* Survey name */}
          <Text style={styles.surveyTitle}>{survey.title}</Text>

          {/* Deadline row */}
          <View style={styles.deadlineRow}>
            <Ionicons name="calendar-outline" size={14} color="#94a3b8" />
            <Text style={styles.deadline}>
              Closes: {deadline}
            </Text>
          </View>

          {/* Closing soon warning */}
          {soon && (
            <View style={styles.urgentRow}>
              <Ionicons name="alert-circle-outline" size={14} color="#ef4444" />
              <Text style={styles.urgentText}>Closing soon!</Text>
            </View>
          )}

          {/* Answer Now button */}
          <TouchableOpacity
            style={styles.answerBtn}
            onPress={handleAnswerNow}
            activeOpacity={0.85}
          >
            <Text style={styles.answerBtnText}>Answer Now</Text>
          </TouchableOpacity>

          {/* Remind later */}
          <TouchableOpacity
            style={styles.remindBtn}
            onPress={handleRemindLater}
            activeOpacity={0.7}
          >
            <Text style={styles.remindBtnText}>Remind Me Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.70)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 26,
  },
  surveyTitle: {
    color: '#a78bfa',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  deadline: {
    color: '#94a3b8',
    fontSize: 13,
  },
  urgentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    marginBottom: 4,
  },
  urgentText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  answerBtn: {
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    marginTop: 20,
  },
  answerBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  remindBtn: {
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  remindBtnText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '500',
  },
});
