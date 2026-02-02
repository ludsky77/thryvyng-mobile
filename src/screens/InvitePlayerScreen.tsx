import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Linking,
} from 'react-native';

export default function InvitePlayerScreen({ route }: any) {
  const team_id = route.params?.team_id ?? route.params?.teamId;

  const handleShareInvite = async () => {
    try {
      await Share.share({
        message: `Join our team on Thryvyng! https://thryvyng.com/join-team/${team_id || ''}`,
        title: 'Invite to Team',
      });
    } catch (err: any) {
      if (err.message !== 'User did not share') {
        Linking.openURL(`https://thryvyng.com/join-team/${team_id || ''}`);
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Invite Player</Text>
      <Text style={styles.description}>
        Share your team invite link with new players to join your roster.
      </Text>
      <TouchableOpacity style={styles.button} onPress={handleShareInvite}>
        <Text style={styles.buttonText}>📤 Share Invite Link</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 24,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
  description: {
    color: '#888',
    fontSize: 16,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
