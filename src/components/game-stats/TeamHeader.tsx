import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const colors = {
  text: '#ffffff',
  textMuted: '#9CA3AF',
  primary: '#8B5CF6',
  muted: '#374151',
};

interface TeamHeaderProps {
  teamName?: string;
  clubLogoUrl?: string | null;
  opponentName?: string;
  isHome?: boolean;
  size?: 'small' | 'large' | 'compact';
}

export function TeamHeader({
  teamName,
  clubLogoUrl,
  opponentName,
  isHome = true,
  size = 'small',
}: TeamHeaderProps) {
  const logoSize = size === 'large' ? 56 : size === 'compact' ? 52 : 32;
  const isCompact = size === 'compact';

  return (
    <View style={[styles.container, isCompact && styles.containerCompact]}>
      {/* Our Team */}
      <View style={styles.teamSide}>
        {clubLogoUrl ? (
          <Image
            source={{ uri: clubLogoUrl }}
            style={[styles.logo, { width: logoSize, height: logoSize }]}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.placeholderLogo, { width: logoSize, height: logoSize }]}>
            <Ionicons name="shield" size={logoSize * 0.6} color={colors.primary} />
          </View>
        )}
        <Text
          style={[
            styles.teamName,
            size === 'large' && styles.teamNameLarge,
            isCompact && styles.teamNameCompact,
          ]}
          numberOfLines={1}
        >
          {teamName || 'Our Team'}
        </Text>
        <Text style={[styles.homeAwayBadge, isCompact && styles.homeAwayBadgeCompact]}>
          {isHome ? 'HOME' : 'AWAY'}
        </Text>
      </View>

      <Text style={[styles.vs, isCompact && styles.vsCompact]}>vs</Text>

      {/* Opponent */}
      <View style={styles.teamSide}>
        <View style={[styles.opponentLogo, { width: logoSize, height: logoSize }]}>
          <Ionicons name="shield-outline" size={logoSize * 0.6} color={colors.textMuted} />
        </View>
        <Text
          style={[
            styles.teamName,
            size === 'large' && styles.teamNameLarge,
            isCompact && styles.teamNameCompact,
          ]}
          numberOfLines={1}
        >
          {opponentName || 'Opponent'}
        </Text>
        <Text style={[styles.homeAwayBadge, isCompact && styles.homeAwayBadgeCompact]}>
          {!isHome ? 'HOME' : 'AWAY'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  containerCompact: {
    gap: 8,
  },
  teamSide: {
    alignItems: 'center',
    flex: 1,
  },
  logo: {
    borderRadius: 8,
    marginBottom: 2,
  },
  placeholderLogo: {
    borderRadius: 8,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  opponentLogo: {
    borderRadius: 8,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  teamName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  teamNameLarge: {
    fontSize: 14,
  },
  teamNameCompact: {
    fontSize: 11,
  },
  vs: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '500',
  },
  vsCompact: {
    fontSize: 12,
  },
  homeAwayBadge: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  homeAwayBadgeCompact: {
    fontSize: 8,
    marginTop: 1,
  },
});
