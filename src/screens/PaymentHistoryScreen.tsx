import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function PaymentHistoryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Payment History - Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholder: {
    color: '#888',
    fontSize: 16,
  },
});
