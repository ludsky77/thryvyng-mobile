import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useNotifications } from '../contexts/NotificationContext';

export function NotificationBell() {
  const navigation = useNavigation<any>();
  const { unreadCount, refetch } = useNotifications();

  // Refresh when screen comes into focus (after returning from NotificationsScreen)
  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch])
  );

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => navigation.navigate('Notifications')}
    >
      <Ionicons name="notifications-outline" size={24} color="#a78bfa" />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text
            style={styles.badgeText}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    padding: 4,
    // The badge is positioned outside this box; without this, "99+" is clipped
    // at the container edge on Android.
    overflow: 'visible',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ef4444',
    borderRadius: 9,
    // "99+" at 10pt bold needs ~21pt of text plus the padding. minWidth is a
    // floor, not a cap, so a 1- or 2-digit badge still renders as a circle and
    // only the 3-glyph case grows. Previously 18/4/11pt, which cut the "+".
    minWidth: 20,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    // Android adds vertical font padding that pushes the glyph off-centre in a
    // box this small.
    includeFontPadding: false,
  },
});
