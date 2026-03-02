import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface QuickAction {
  id: string;
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
}

interface QuickActionsCardProps {
  actions: QuickAction[];
  title?: string;
}

export default function QuickActionsCard({ actions, title }: QuickActionsCardProps) {
  const row1 = actions.slice(0, 3);
  const row2 = actions.slice(3, 6);

  const renderButton = (action: QuickAction) => (
    <TouchableOpacity
      key={action.id}
      style={styles.buttonWrapper}
      onPress={action.onPress}
      activeOpacity={0.7}
    >
      <View style={styles.buttonBorder}>
        <View style={[styles.iconBox, { backgroundColor: action.color }]}>
          <Ionicons name={action.icon as any} size={28} color="#fff" />
        </View>
        <Text style={styles.label}>{action.label}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {title && (
        <View style={styles.titleRow}>
          <Text style={styles.titleIcon}>⚡</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
      )}
      <View style={styles.grid}>
        <View style={styles.row}>
          {row1.map(renderButton)}
        </View>
        {row2.length > 0 && (
          <View style={styles.row}>
            {row2.map(renderButton)}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginTop: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  titleIcon: {
    fontSize: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  grid: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  buttonWrapper: {
    flex: 1,
  },
  buttonBorder: {
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9ca3af',
    textAlign: 'center',
  },
});
