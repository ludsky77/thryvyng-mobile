import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface ReadReceiptsProps {
  readBy: string[];
  totalMembers: number;
}

export function ReadReceipts({ readBy, totalMembers }: ReadReceiptsProps) {
  if (readBy.length === 0) return null;

  const text =
    readBy.length >= totalMembers - 1
      ? 'Seen by everyone'
      : `Seen by ${readBy.length}`;

  return (
    <View style={styles.container}>
      <Feather name="check-circle" size={14} color="#8B5CF6" />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  text: {
    color: '#8B5CF6',
    fontSize: 12,
  },
});
