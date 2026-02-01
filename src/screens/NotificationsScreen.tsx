import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { useNotifications, Notification } from '../hooks/useNotifications';

const NOTIFICATION_ICONS: Record<string, string> = {
  message: '💬',
  event: '📅',
  poll: '📊',
  rsvp_reminder: '⏰',
  push: '🔔',
};

export default function NotificationsScreen({ navigation }: any) {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refetch,
  } = useNotifications();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleNotificationPress = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    const refType = notification.reference_type;
    const refId = notification.reference_id;

    if (!refType || !refId) return;

    const tabNav = navigation.getParent()?.getParent?.();

    if (refType === 'cal_events') {
      tabNav?.navigate('CalendarTab', {
        screen: 'EventDetail',
        params: { eventId: refId, onRefetch: () => {} },
      });
    } else if (refType === 'comm_messages' || refType === 'comm_polls') {
      tabNav?.navigate('ChatTab');
    }
  };

  const renderItem = ({ item }: { item: Notification }) => {
    const icon = NOTIFICATION_ICONS[item.notification_type] || '🔔';

    return (
      <TouchableOpacity
        style={styles.notificationItem}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <Text style={styles.notificationIcon}>{icon}</Text>
        <View style={styles.notificationContent}>
          <Text
            style={[styles.notificationTitle, !item.is_read && styles.unreadTitle]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {item.body && (
            <Text style={styles.notificationBody} numberOfLines={1}>
              {item.body}
            </Text>
          )}
          <Text style={styles.notificationTime}>
            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
          </Text>
        </View>
        {!item.is_read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markAllButton}
            onPress={markAllAsRead}
          >
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyTitle}>No notifications</Text>
          <Text style={styles.emptyText}>
            You're all caught up! New notifications will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#8b5cf6"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#2a2a4e',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  markAllButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  markAllText: {
    color: '#8b5cf6',
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  notificationIcon: {
    fontSize: 24,
    marginRight: 14,
  },
  notificationContent: {
    flex: 1,
    minWidth: 0,
  },
  notificationTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  unreadTitle: {
    fontWeight: '700',
  },
  notificationBody: {
    color: '#888',
    fontSize: 13,
    marginBottom: 4,
  },
  notificationTime: {
    color: '#666',
    fontSize: 12,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
    marginLeft: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
  },
});
