import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function EditProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Edit Profile - Coming soon</Text>
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
