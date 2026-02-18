import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '../contexts/NotificationContext';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: any;
  is_read: boolean;
  created_at: string;
}

function mapContextNotificationToItem(n: {
  id: string;
  notification_type: string;
  title: string;
  body: string | null;
  reference_type: string | null;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}): NotificationItem {
  const data: any = {};
  if (n.reference_type === 'player_evaluation' && n.reference_id) {
    data.evaluation_id = n.reference_id;
  } else if (n.reference_type === 'event' && n.reference_id) {
    data.event_id = n.reference_id;
  } else if (n.reference_id) {
    data.reference_id = n.reference_id;
    data.reference_type = n.reference_type;
  }
  return {
    id: n.id,
    type: n.notification_type,
    title: n.title,
    body: n.body,
    data,
    is_read: n.is_read,
    created_at: n.created_at,
  };
}

export default function NotificationsScreen({ navigation }: any) {
  const { notifications: contextNotifications, unreadCount, loading, markAsRead: contextMarkAsRead, markAllAsRead: contextMarkAllAsRead, refetch } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  const notifications: NotificationItem[] = contextNotifications.map(mapContextNotificationToItem);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const markAsRead = async (notificationId: string) => {
    await contextMarkAsRead(notificationId);
  };

  const markAllAsRead = async () => {
    await contextMarkAllAsRead();
  };

  const handleNotificationPress = (notification: NotificationItem) => {
    // Mark as read first
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    const { type, data } = notification;
    const referenceId = data?.evaluation_id ?? data?.reference_id;

    switch (type) {
      case 'event':
      case 'event_created':
      case 'event_cancelled':
      case 'event_changed':
        if (data?.event_id) {
          navigation.navigate('EventDetail', {
            eventId: data.event_id,
            onRefetch: () => {},
          });
        }
        break;
      case 'evaluation':
        if (referenceId) {
          navigation.navigate('EvaluationDetail', {
            evaluationId: referenceId,
          });
        } else {
          navigation.navigate('Evaluations');
        }
        break;
      case 'chat':
      case 'message':
        if (data?.chat_id || data?.team_id) {
          navigation.navigate('Chat', {
            chatId: data.chat_id,
            teamId: data.team_id,
          });
        }
        break;
      default:
        if (data?.course_id) {
          navigation.navigate('CourseDetail', { courseId: data.course_id });
        }
        break;
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'event':
      case 'event_created':
        return { name: 'calendar', color: '#22c55e' };
      case 'event_cancelled':
        return { name: 'calendar-outline', color: '#ef4444' };
      case 'event_changed':
        return { name: 'create-outline', color: '#f59e0b' };
      case 'event_reminder':
        return { name: 'alarm-outline', color: '#8b5cf6' };
      case 'evaluation':
        return { name: 'document-text-outline', color: '#8b5cf6' };
      case 'chat_message':
      case 'message':
        return { name: 'chatbubble-outline', color: '#3b82f6' };
      case 'announcement':
        return { name: 'megaphone-outline', color: '#ec4899' };
      default:
        return { name: 'notifications-outline', color: '#64748b' };
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderNotification = ({ item }: { item: NotificationItem }) => {
    const icon = getNotificationIcon(item.type);

    return (
      <TouchableOpacity
        style={[styles.notificationItem, !item.is_read && styles.unreadItem]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconContainer, { backgroundColor: icon.color + '20' }]}>
          <Ionicons name={icon.name as any} size={22} color={icon.color} />
        </View>
        <View style={styles.contentContainer}>
          <Text style={[styles.title, !item.is_read && styles.unreadTitle]}>
            {item.title}
          </Text>
          {item.body && (
            <Text style={styles.body} numberOfLines={2}>
              {item.body}
            </Text>
          )}
          <Text style={styles.time}>{formatTime(item.created_at)}</Text>
        </View>
        {!item.is_read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity style={styles.markAllButton} onPress={markAllAsRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="notifications-off-outline" size={64} color="#334155" />
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptySubtitle}>
            You'll see updates about events, messages, and more here
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#8b5cf6"
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#1e293b',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 12,
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  markAllText: {
    color: '#a78bfa',
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  unreadItem: {
    backgroundColor: '#1e3a5f',
    borderLeftWidth: 3,
    borderLeftColor: '#8b5cf6',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contentContainer: {
    flex: 1,
  },
  title: {
    color: '#cbd5e1',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  unreadTitle: {
    color: '#fff',
    fontWeight: '600',
  },
  body: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
  },
  time: {
    color: '#475569',
    fontSize: 12,
    marginTop: 4,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#8b5cf6',
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: '#94a3b8',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
