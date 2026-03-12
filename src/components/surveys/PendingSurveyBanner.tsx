import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface PendingSurvey {
  id: string;
  survey_id: string;
  title: string;
  title_es?: string | null;
  closes_at: string | null;
}

interface PendingSurveyBannerProps {
  navigation: any;
}

export default function PendingSurveyBanner({ navigation }: PendingSurveyBannerProps) {
  const { user } = useAuth();
  const [surveys, setSurveys] = useState<PendingSurvey[]>([]);

  const fetchPending = useCallback(async () => {
    if (!user?.id) {
      setSurveys([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('sv_distributions')
        .select(
          `
          id,
          survey_id,
          sv_surveys!inner(
            id,
            title,
            title_es,
            public_slug,
            closes_at,
            status
          )
        `
        )
        .eq('user_id', user.id)
        .is('completed_at', null);

      if (error) {
        console.warn('[PendingSurveyBanner]', error.message);
        setSurveys([]);
        return;
      }

      const rows = (data || []) as any[];
      const list: PendingSurvey[] = rows
        .filter((r) => r.sv_surveys?.status === 'open')
        .map((r) => ({
          id: r.id,
          survey_id: r.survey_id,
          title: r.sv_surveys?.title ?? 'Survey',
          title_es: r.sv_surveys?.title_es,
          closes_at: r.sv_surveys?.closes_at ?? null,
        }));

      setSurveys(list.slice(0, 3));
    } catch (err) {
      console.warn('[PendingSurveyBanner]', err);
      setSurveys([]);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  if (surveys.length === 0) return null;

  const formatClosesIn = (closesAt: string | null): string => {
    if (!closesAt) return '';
    const now = new Date();
    const closes = new Date(closesAt);
    const diffMs = closes.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Closed';
    if (diffDays === 0) return 'Closes today';
    if (diffDays === 1) return 'Closes in 1 day';
    return `Closes in ${diffDays} days`;
  };

  const handleRespond = (surveyId: string) => {
    try {
      navigation.navigate('SurveyResponse' as never, { surveyId });
    } catch {
      navigation.getParent()?.navigate('SurveyResponse' as never, { surveyId });
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.bannersList}>
        {surveys.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={[styles.banner, surveys.length > 1 && styles.bannerGap]}
            onPress={() => handleRespond(s.survey_id)}
            activeOpacity={0.9}
          >
            <View style={styles.bannerLeft}>
              <Feather name="clipboard" size={24} color="#f59e0b" style={styles.icon} />
              <View style={styles.bannerText}>
                <Text style={styles.bannerTitle} numberOfLines={1}>
                  Pending Survey
                </Text>
                <Text style={styles.bannerSubtitle} numberOfLines={1}>
                  {s.title}
                </Text>
                {s.closes_at && (
                  <Text style={styles.closesText}>{formatClosesIn(s.closes_at)}</Text>
                )}
              </View>
            </View>
            <View style={styles.respondWrap}>
              <Text style={styles.respondText}>Respond</Text>
              <Feather name="chevron-right" size={18} color="#fff" />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
  },
  bannersList: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  bannerGap: {
    marginBottom: 6,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
    borderRadius: 12,
    padding: 14,
    minWidth: 280,
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    marginRight: 12,
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f59e0b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bannerSubtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginTop: 2,
  },
  closesText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  respondWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginLeft: 12,
  },
  respondText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4,
  },
});
