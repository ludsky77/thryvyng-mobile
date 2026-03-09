import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

function formatSessionDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const PHASE_COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'];

interface Phase {
  id: string;
  phase_number: number;
  phase_type?: string;
}

interface Session {
  id: string;
  title: string;
  title_es?: string | null;
  topic?: string | null;
  age_group?: string | null;
  player_level?: string | null;
  status?: string | null;
  created_at: string;
  phases?: Phase[] | null;
}

interface SessionCardProps {
  session: Session;
  language?: 'en' | 'es';
  onPress: (sessionId: string) => void;
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' },
  published: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981' },
  completed: { bg: 'rgba(100, 116, 139, 0.2)', text: '#94a3b8' },
};

export function SessionCard({ session, language = 'en', onPress }: SessionCardProps) {
  const title = language === 'es' && session.title_es ? session.title_es : session.title;
  const statusStyle = STATUS_STYLES[session.status || 'draft'] ?? STATUS_STYLES.draft;

  const phaseNumbers = new Set((session.phases || []).map((p) => p.phase_number));

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(session.id)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {session.status || 'draft'}
          </Text>
        </View>
      </View>

      {session.topic ? (
        <Text style={styles.topic} numberOfLines={1}>
          {session.topic}
        </Text>
      ) : null}

      <View style={styles.tagsRow}>
        {session.age_group ? (
          <View style={styles.tagGreen}>
            <Text style={styles.tagText}>{session.age_group}</Text>
          </View>
        ) : null}
        {session.player_level ? (
          <View style={styles.tagPurple}>
            <Text style={styles.tagText}>{session.player_level}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.phaseDots}>
        {PHASE_COLORS.map((color, i) => {
          const phaseNum = i + 1;
          const filled = phaseNumbers.has(phaseNum);
          return (
            <View
              key={i}
              style={[
                styles.phaseDot,
                { backgroundColor: filled ? color : 'transparent', borderColor: filled ? color : '#64748b' },
              ]}
            />
          );
        })}
      </View>

      <Text style={styles.date}>
        {formatSessionDate(session.created_at)}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
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
    textTransform: 'capitalize',
  },
  topic: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  tagGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagPurple: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 12,
    color: '#e2e8f0',
    fontWeight: '500',
  },
  phaseDots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  phaseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  date: {
    fontSize: 12,
    color: '#64748b',
  },
});
