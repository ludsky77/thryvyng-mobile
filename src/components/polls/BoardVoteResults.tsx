import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface BoardVoteResultsProps {
  stats: {
    yes: number;
    no: number;
    pending: number;
    unread: number;
  };
}

const STATUS_COLORS = {
  yes: '#10b981',
  no: '#ef4444',
  pending: '#f59e0b',
  unread: '#475569',
} as const;

export function BoardVoteResults({ stats }: BoardVoteResultsProps) {
  const items = [
    { label: 'Yes', count: stats.yes, color: STATUS_COLORS.yes },
    { label: 'No', count: stats.no, color: STATUS_COLORS.no },
    { label: 'Pending', count: stats.pending, color: STATUS_COLORS.pending },
    { label: 'Unread', count: stats.unread, color: STATUS_COLORS.unread },
  ];

  return (
    <View style={styles.container}>
      {items.map((item, index) => (
        <View key={item.label} style={styles.item}>
          {index > 0 && <Text style={styles.dot}>•</Text>}
          <View style={[styles.dotIndicator, { backgroundColor: item.color }]} />
          <Text style={styles.count}>{item.count}</Text>
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    color: '#64748b',
    fontSize: 12,
    marginHorizontal: 4,
  },
  dotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  count: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  label: {
    fontSize: 13,
    color: '#94a3b8',
  },
});
