import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function TeamDetailScreen({ route }: any) {
  const { teamId, teamName } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{teamName}</Text>
      <Text style={styles.subtitle}>Team ID: {teamId}</Text>
      <Text style={styles.placeholder}>
        Team detail view – add roster, events, and more
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 20,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
    marginBottom: 24,
  },
  placeholder: {
    color: '#666',
    fontSize: 14,
  },
});
