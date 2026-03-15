import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

interface SurveyRow {
  id: string;
  title: string;
  closes_at: string | null;
  responseCount: number;
}

interface SurveyPickerModalProps {
  visible: boolean;
  channelId: string;
  teamId: string | null;
  isStaff: boolean;
  onClose: () => void;
  onShare: (surveyId: string, surveyTitle: string) => void;
}

function formatClosingDate(closesAt: string | null): string {
  if (!closesAt) return 'No deadline';
  const d = new Date(closesAt);
  return `Closes ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export default function SurveyPickerModal({
  visible,
  channelId,
  teamId,
  isStaff,
  onClose,
  onShare,
}: SurveyPickerModalProps) {
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharingId] = useState<string | null>(null);

  const loadSurveys = useCallback(async () => {
    if (!teamId) {
      setSurveys([]);
      return;
    }
    setLoading(true);
    try {
      // Get club_id for this team
      const { data: teamData } = await supabase
        .from('teams')
        .select('club_id')
        .eq('id', teamId)
        .single();

      if (!teamData?.club_id) {
        setSurveys([]);
        return;
      }

      // Fetch open surveys for the club
      const { data: surveyData } = await supabase
        .from('sv_surveys')
        .select('id, title, closes_at')
        .eq('club_id', teamData.club_id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (!surveyData?.length) {
        setSurveys([]);
        return;
      }

      // Fetch response counts
      const surveyIds = surveyData.map((s) => s.id);
      const { data: responseData } = await supabase
        .from('sv_responses')
        .select('survey_id')
        .in('survey_id', surveyIds);

      const countMap: Record<string, number> = {};
      (responseData || []).forEach((r: any) => {
        countMap[r.survey_id] = (countMap[r.survey_id] ?? 0) + 1;
      });

      setSurveys(
        surveyData.map((s: any) => ({
          id: s.id,
          title: s.title,
          closes_at: s.closes_at,
          responseCount: countMap[s.id] ?? 0,
        }))
      );
    } catch {
      setSurveys([]);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (visible && isStaff) {
      loadSurveys();
    }
  }, [visible, isStaff, loadSurveys]);

  const handleShare = (survey: SurveyRow) => {
    setSharingId(survey.id);
    onShare(survey.id, survey.title);
    setTimeout(() => setSharingId(null), 1500);
  };

  const renderSurveyRow = ({ item }: { item: SurveyRow }) => (
    <View style={styles.surveyRow}>
      <View style={styles.surveyInfo}>
        <Text style={styles.surveyTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.surveyMeta}>
          {formatClosingDate(item.closes_at)}
        </Text>
        <Text style={styles.surveyMeta}>
          {item.responseCount} response{item.responseCount !== 1 ? 's' : ''}
        </Text>
      </View>
      <TouchableOpacity
        style={[
          styles.shareBtn,
          sharing === item.id && styles.shareBtnDone,
        ]}
        onPress={() => handleShare(item)}
        disabled={sharing !== null}
        activeOpacity={0.8}
      >
        <Text style={styles.shareBtnText}>
          {sharing === item.id ? 'Shared!' : 'Share'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={styles.sheet}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Share a Survey</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        {!isStaff ? (
          <View style={styles.centerState}>
            <Feather name="lock" size={32} color="#475569" />
            <Text style={styles.centerText}>
              Only team staff can share surveys in chat
            </Text>
          </View>
        ) : loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#8b5cf6" />
          </View>
        ) : surveys.length === 0 ? (
          <View style={styles.centerState}>
            <Feather name="clipboard" size={32} color="#475569" />
            <Text style={styles.centerText}>No open surveys.</Text>
            <Text style={styles.centerHint}>Create one in Club Admin.</Text>
          </View>
        ) : (
          <FlatList
            data={surveys}
            keyExtractor={(item) => item.id}
            renderItem={renderSurveyRow}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    maxHeight: '70%',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  surveyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  surveyInfo: {
    flex: 1,
    gap: 2,
  },
  surveyTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  surveyMeta: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  shareBtn: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  shareBtnDone: {
    backgroundColor: '#22c55e',
  },
  shareBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  separator: {
    height: 1,
    backgroundColor: '#1e293b',
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
    paddingHorizontal: 24,
  },
  centerText: {
    color: '#94a3b8',
    fontSize: 15,
    textAlign: 'center',
  },
  centerHint: {
    color: '#475569',
    fontSize: 13,
    textAlign: 'center',
  },
});
