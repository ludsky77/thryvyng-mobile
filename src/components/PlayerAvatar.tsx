import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

interface PlayerAvatarProps {
  photoUrl?: string | null;
  jerseyNumber?: number | string | null;
  firstName?: string;
  lastName?: string;
  size?: number;
  teamColor?: string;
}

const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  photoUrl,
  jerseyNumber,
  firstName = '',
  lastName = '',
  size = 50,
  teamColor = '#8B6BAD', // Default purple
}) => {
  // If photo exists, show it
  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[
          styles.image,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      />
    );
  }

  // If jersey number exists, show it
  if (jerseyNumber !== null && jerseyNumber !== undefined) {
    return (
      <View
        style={[
          styles.fallbackCircle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: teamColor,
          },
        ]}
      >
        <Text style={[styles.jerseyNumber, { fontSize: size * 0.4 }]}>
          {jerseyNumber}
        </Text>
      </View>
    );
  }

  // Fallback to initials
  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?';
  return (
    <View
      style={[
        styles.fallbackCircle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: teamColor,
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.35 }]}>
        {initials}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  image: {
    resizeMode: 'cover',
  },
  fallbackCircle: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  jerseyNumber: {
    color: 'white',
    fontWeight: 'bold',
  },
  initials: {
    color: 'white',
    fontWeight: '600',
  },
});

export default PlayerAvatar;
