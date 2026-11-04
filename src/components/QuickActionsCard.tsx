import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface QuickAction {
  id: string;
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
  badge?: number;
  /**
   * A second line under the label. Added for R-04's arcade tile, which has to
   * say both what it is and that it is not here yet. Optional, so every
   * existing action renders byte-for-byte as before.
   */
  subtitle?: string;
  /**
   * R-04: draw this tile CALMER than its neighbours and put a small
   * "Coming soon" word on it. It is still a real, tappable tile the same size
   * as the rest — the tap opens an Alert instead of a screen — so this changes
   * only the ink: a neutral grey frame instead of the grid's purple, and a
   * muted icon box instead of `color`.
   */
  comingSoon?: boolean;
  /** The text of that badge. */
  comingSoonLabel?: string;
}

interface QuickActionsCardProps {
  actions: QuickAction[];
  title?: string;
}

export default function QuickActionsCard({ actions, title }: QuickActionsCardProps) {
  const row1 = actions.slice(0, 3);
  const row2 = actions.slice(3, 6);
  const row3 = actions.slice(6, 9);

  const renderButton = (action: QuickAction) => (
    <TouchableOpacity
      key={action.id}
      style={styles.buttonWrapper}
      onPress={action.onPress}
      activeOpacity={0.7}
    >
      <View
        style={[styles.buttonBorder, action.comingSoon && styles.buttonBorderQuiet]}
      >
        {/* The "Coming soon" word sits ABOVE the icon, not in the badge's
            top-right corner: that corner is the numeric unread pill's, and a
            word there would read as a count. */}
        {action.comingSoon && action.comingSoonLabel ? (
          <View style={styles.soonChip}>
            <Text style={styles.soonChipText}>{action.comingSoonLabel}</Text>
          </View>
        ) : null}
        <View
          style={[
            styles.iconBox,
            { backgroundColor: action.comingSoon ? QUIET_ICON_BG : action.color },
          ]}
        >
          <Ionicons
            name={action.icon as any}
            size={22}
            color={action.comingSoon ? QUIET_ICON_INK : '#fff'}
          />
        </View>
        <Text
          style={[styles.label, action.comingSoon && styles.labelQuiet]}
          numberOfLines={2}
        >
          {action.label}
        </Text>
        {action.subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {action.subtitle}
          </Text>
        ) : null}
        {!!action.badge && action.badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{action.badge > 99 ? '99+' : action.badge}</Text>
          </View>
        )}
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
        {row3.length > 0 && (
          <View style={styles.row}>
            {row3.map(renderButton)}
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * R-04's quiet palette. The grid's own purple is `rgba(139,92,246,…)`; these
 * two are the app's neutral slate, already this file's `#9ca3af` label grey
 * and the card greys the dashboards use, so the tile reads as the same
 * furniture with the colour turned down rather than as a different component.
 */
const QUIET_ICON_BG = '#2b3350';
const QUIET_ICON_INK = '#9ca3af';

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
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
    minHeight: 90,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * R-04: the arcade tile's frame. SAME box — same radius, same minHeight,
   * same padding, and it is a flex child of the same row, so it stays exactly
   * the size of its neighbours. Only the ink is calmer: neutral slate instead
   * of the grid's purple tint and purple border.
   */
  buttonBorderQuiet: {
    backgroundColor: 'rgba(148, 163, 184, 0.06)',
    borderColor: 'rgba(148, 163, 184, 0.28)',
  },
  soonChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(148, 163, 184, 0.16)',
    marginBottom: 8,
  },
  soonChipText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  iconBox: {
    width: 44,
    height: 44,
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
  /** The arcade tile's own title is the one thing on it that is NOT dimmer. */
  labelQuiet: {
    color: '#cbd5e1',
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 9.5,
    fontWeight: '400',
    color: '#7b8699',
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 12,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
});
