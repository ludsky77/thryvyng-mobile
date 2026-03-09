import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

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
}

interface SeasonPlanCardProps {
  plan: SeasonPlan;
  onPress: () => void;
}

function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start || !end) return '';
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  active: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981' },
  draft: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' },
  archived: { bg: 'rgba(100, 116, 139, 0.2)', text: '#94a3b8' },
};

export const SeasonPlanCard = memo(function SeasonPlanCard({ plan, onPress }: SeasonPlanCardProps) {
  const dateRange = formatDateRange(plan.start_date, plan.end_date);
  const statusStyle = STATUS_STYLES[plan.status || 'draft'] ?? STATUS_STYLES.draft;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.title} numberOfLines={2}>
        {plan.title}
      </Text>

      {plan.season_type && (
        <View style={styles.seasonTypeBadge}>
          <Text style={styles.seasonTypeText}>{plan.season_type}</Text>
        </View>
      )}

      <View style={styles.pillsRow}>
        {plan.age_group && (
          <View style={styles.pill}>
            <Text style={styles.pillText}>{plan.age_group}</Text>
          </View>
        )}
        {plan.gender && (
          <View style={styles.pill}>
            <Text style={styles.pillText}>{plan.gender}</Text>
          </View>
        )}
      </View>

      {dateRange ? (
        <Text style={styles.dateRange}>{dateRange}</Text>
      ) : null}

      {plan.total_weeks != null && (
        <Text style={styles.weeks}>{plan.total_weeks} weeks</Text>
      )}

      {plan.theme ? (
        <Text style={styles.theme} numberOfLines={2}>
          {plan.theme}
        </Text>
      ) : null}

      <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
        <Text style={[styles.statusText, { color: statusStyle.text }]}>
          {plan.status || 'draft'}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  seasonTypeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  seasonTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  pill: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pillText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  dateRange: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 4,
  },
  weeks: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 8,
  },
  theme: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 12,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
