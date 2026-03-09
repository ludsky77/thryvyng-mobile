import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

const PHASE_TYPE_DISPLAY: Record<string, string> = {
  warmup: 'Warm-Up',
  technical: 'SSG',
  preferential: 'Pref. Sim',
  extended: 'Ext. Pref',
  debrief: 'Free Play',
};

function formatPhaseType(phaseType: string | null | undefined): string {
  if (!phaseType) return '';
  const lower = String(phaseType).toLowerCase();
  return PHASE_TYPE_DISPLAY[lower] ?? phaseType;
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

interface DrillCardProps {
  drill: Drill;
  language?: 'en' | 'es';
  onPress: (drillId: string) => void;
}

const CATEGORY_STYLES: Record<string, { bg: string; text: string }> = {
  attacking: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981' },
  defending: { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444' },
  possession: { bg: 'rgba(139, 92, 246, 0.2)', text: '#8b5cf6' },
  transition: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' },
};

export function DrillCard({ drill, language = 'en', onPress }: DrillCardProps) {
  const name = language === 'es' && drill.name_es ? drill.name_es : drill.name;
  const category = (drill.category || '').toLowerCase();
  const categoryStyle = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.possession;

  const playerMin = drill.player_count_min ?? 0;
  const playerMax = drill.player_count_max ?? 0;
  const playerRange =
    playerMin > 0 || playerMax > 0
      ? playerMin === playerMax
        ? `${playerMin}`
        : `${playerMin}-${playerMax}`
      : null;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(drill.id)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        {drill.is_featured ? (
          <View style={styles.featuredBadge}>
            <Text style={styles.featuredText}>Featured</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.badgesRow}>
        {drill.category ? (
          <View style={[styles.categoryBadge, { backgroundColor: categoryStyle.bg }]}>
            <Text style={[styles.categoryText, { color: categoryStyle.text }]}>
              {drill.category}
            </Text>
          </View>
        ) : null}
        {drill.phase_type ? (
          <View style={[styles.categoryBadge, styles.phaseBadge]}>
            <Text style={styles.phaseText}>
              {formatPhaseType(drill.phase_type)}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.bottomRow}>
        {drill.duration_min != null ? (
          <View style={styles.metaItem}>
            <Feather name="clock" size={14} color="#94a3b8" />
            <Text style={styles.metaText}>{drill.duration_min} min</Text>
          </View>
        ) : null}
        {playerRange ? (
          <View style={styles.metaItem}>
            <Feather name="users" size={14} color="#94a3b8" />
            <Text style={styles.metaText}>{playerRange}</Text>
          </View>
        ) : null}
      </View>
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
    flex: 1,
    minWidth: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    marginRight: 8,
  },
  featuredBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  featuredText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#f59e0b',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  phaseBadge: {
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
  },
  phaseText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94a3b8',
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: '#94a3b8',
  },
});
