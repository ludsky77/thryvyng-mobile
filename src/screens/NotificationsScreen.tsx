import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotifications, Notification } from '../hooks/useNotifications';

function getNotificationIcon(type: string): string {
  const icons: Record<string, string> = {
    message: '💬',
    event: '📅',
    poll: '📊',
    rsvp_reminder: '⏰',
    push: '🔔',
  };
  return icons[type] || '🔔';
}

function getNotificationColor(type: string): string {
  const colors: Record<string, string> = {
    message: '#3B82F6',
    event: '#10B981',
    poll: '#8B5CF6',
    rsvp_reminder: '#F59E0B',
    push: '#6B7280',
  };
  return colors[type] || '#6B7280';
}

function getTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function groupNotificationsByDate(
  notifications: Notification[]
): { title: string; data: Notification[] }[] {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: { title: string; data: Notification[] }[] = [
    { title: 'Today', data: [] },
    { title: 'Yesterday', data: [] },
    { title: 'This Week', data: [] },
    { title: 'Earlier', data: [] },
  ];

  notifications.forEach((notif) => {
    const date = new Date(notif.created_at);
    if (date.toDateString() === today.toDateString()) {
      groups[0].data.push(notif);
    } else if (date.toDateString() === yesterday.toDateString()) {
      groups[1].data.push(notif);
    } else if (date > weekAgo) {
      groups[2].data.push(notif);
    } else {
      groups[3].data.push(notif);
    }
  });

  return groups.filter((g) => g.data.length > 0);
}

function NotificationItem({
  item,
  onPress,
}: {
  item: Notification;
  onPress: () => void;
}) {
  const color = getNotificationColor(item.notification_type);
  return (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        !item.is_read && styles.notificationUnread,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: color + '20' },
        ]}
      >
        <Text style={styles.icon}>
          {getNotificationIcon(item.notification_type)}
        </Text>
      </View>
      <View style={styles.notificationContent}>
        <Text
          style={[
            styles.notificationTitle,
            !item.is_read && styles.notificationTitleUnread,
          ]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        {item.body && (
          <Text style={styles.notificationBody} numberOfLines={2}>
            {item.body}
          </Text>
        )}
      </View>
      <View style={styles.notificationMeta}>
        <Text style={styles.timeAgo}>{getTimeAgo(item.created_at)}</Text>
        {!item.is_read && <View style={styles.unreadDot} />}
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen({ navigation }: any) {
  const {
    notifications,
    loading,
    markAsRead,
    markAllAsRead,
    refetch,
  } = useNotifications();

  const [refreshing, setRefreshing] = React.useState(false);

  const sections = useMemo(
    () => groupNotificationsByDate(notifications),
    [notifications]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleNotificationPress = useCallback(
    async (notification: Notification) => {
      // Mark as read first (updates context → badge updates immediately)
      if (!notification.is_read) {
        await markAsRead(notification.id);
      }

      const refType = notification.reference_type;
      const refId = notification.reference_id;

      if (!refType || !refId) return;

      // Get tab navigator (parent of this stack) to switch tabs and push screen
      const tabNav = navigation.getParent();
      switch (refType) {
        case 'cal_events':
          tabNav?.navigate('CalendarTab', {
            screen: 'EventDetail',
            params: { eventId: refId },
          });
          break;
        case 'comm_messages':
        case 'comm_polls':
          tabNav?.navigate('ChatTab');
          break;
        default:
          break;
      }
    },
    [markAsRead, navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => (
      <NotificationItem
        item={item}
        onPress={() => handleNotificationPress(item)}
      />
    ),
    [handleNotificationPress]
  );

  const renderSectionHeader = useCallback(
    ({ section: { title } }: { section: { title: string } }) => (
      <Text style={styles.sectionHeader}>{title}</Text>
    ),
    []
  );

  const ListEmptyComponent = useCallback(
    () =>
      !loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyTitle}>No Notifications</Text>
          <Text style={styles.emptyText}>You're all caught up!</Text>
        </View>
      ) : null,
    [loading]
  );

  const keyExtractor = useCallback((item: Notification) => item.id, []);

  if (loading && notifications.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={styles.markAllButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity
          onPress={markAllAsRead}
          style={styles.markAllButton}
        >
          <Text style={styles.markAllText}>Mark All Read</Text>
        </TouchableOpacity>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#10B981"
          />
        }
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={
          notifications.length === 0 ? styles.emptyContainer : styles.listContent
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 20,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  markAllButton: {
    padding: 8,
    minWidth: 90,
    alignItems: 'flex-end',
  },
  markAllText: {
    color: '#10B981',
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 16,
  },
  listContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0f172a',
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1e293b',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  notificationUnread: {
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },
  notificationContent: {
    flex: 1,
    minWidth: 0,
  },
  notificationTitle: {
    color: '#9CA3AF',
    fontSize: 15,
    marginBottom: 2,
  },
  notificationTitleUnread: {
    color: '#fff',
    fontWeight: '600',
  },
  notificationBody: {
    color: '#6B7280',
    fontSize: 13,
  },
  notificationMeta: {
    alignItems: 'flex-end',
  },
  timeAgo: {
    color: '#6B7280',
    fontSize: 12,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
  },
  emptyContainer: {
    flexGrow: 1,
  },
});
