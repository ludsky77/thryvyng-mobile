import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_WEEK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  scheduled: { bg: '#06b6d4', text: '#fff' },
  completed: { bg: '#10b981', text: '#fff' },
  cancelled: { bg: '#ef4444', text: '#fff' },
};

interface ScheduleCardProps {
  item: {
    id: string;
    scheduled_date: string;
    status: string;
    notes?: string | null;
    coach_id?: string | null;
    session_id?: string | null;
    session?: {
      id: string;
      title?: string | null;
      title_es?: string | null;
      topic?: string | null;
      age_group?: string | null;
      phase_of_play?: string | null;
    } | null;
    team?: { id: string; name?: string | null } | null;
    coach?: { id: string; full_name?: string | null } | null;
  };
  language: 'en' | 'es';
  isCoach: boolean;
  onPress: (sessionId: string) => void;
  onMarkComplete: (scheduledId: string) => Promise<void>;
}

export function ScheduleCard({
  item,
  language,
  isCoach,
  onPress,
  onMarkComplete,
}: ScheduleCardProps) {
  const sessionId = item.session?.id ?? item.session_id;
  const title = language === 'es' && item.session?.title_es ? item.session.title_es : item.session?.title;
  const topic = item.session?.topic;
  const teamName = item.team?.name;
  const coachName = item.coach?.full_name;

  const d = new Date(item.scheduled_date);
  const dayNum = d.getDate();
  const month = MONTH_SHORT[d.getMonth()];
  const dayWeek = DAY_WEEK[d.getDay()];

  const statusStyle = STATUS_STYLES[item.status] ?? STATUS_STYLES.scheduled;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const scheduledDateOnly = new Date(d);
  scheduledDateOnly.setHours(0, 0, 0, 0);
  const showMarkComplete =
    isCoach &&
    item.status === 'scheduled' &&
    scheduledDateOnly <= today;

  const [markingComplete, setMarkingComplete] = React.useState(false);

  const handleMarkComplete = () => {
    Alert.alert(
      'Mark Complete',
      'Mark this session as completed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setMarkingComplete(true);
            try {
              await onMarkComplete(item.id);
            } finally {
              setMarkingComplete(false);
            }
          },
        },
      ]
    );
  };

  const handlePress = () => {
    if (sessionId) onPress(sessionId);
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.cardInner}>
        <View style={styles.dateBlock}>
          <Text style={styles.dateDay}>{dayNum}</Text>
          <Text style={styles.dateMonth}>{month}</Text>
          <Text style={styles.dateWeek}>{dayWeek}</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={2}>
              {title || 'Untitled Session'}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.text }]}>
                {item.status}
              </Text>
            </View>
          </View>

          {topic ? (
            <Text style={styles.topic} numberOfLines={1}>
              {topic}
            </Text>
          ) : null}

          {teamName ? (
            <View style={styles.metaRow}>
              <Feather name="users" size={12} color="#94a3b8" />
              <Text style={styles.metaText}>{teamName}</Text>
            </View>
          ) : null}

          {coachName ? (
            <View style={styles.metaRow}>
              <Feather name="user" size={12} color="#94a3b8" />
              <Text style={styles.metaText}>{coachName}</Text>
            </View>
          ) : null}

          {showMarkComplete && (
            <TouchableOpacity
              style={styles.markCompleteBtn}
              onPress={(e) => {
                e.stopPropagation();
                handleMarkComplete();
              }}
              disabled={markingComplete}
            >
              {markingComplete ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.markCompleteText}>Mark Complete ✓</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  cardInner: {
    flexDirection: 'row',
  },
  dateBlock: {
    width: 70,
    backgroundColor: '#1e1b4b',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    marginRight: 12,
  },
  dateDay: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  dateMonth: {
    fontSize: 11,
    color: '#a78bfa',
    marginTop: 2,
  },
  dateWeek: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  topic: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  metaText: {
    fontSize: 13,
    color: '#94a3b8',
  },
  markCompleteBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  markCompleteText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
