import React, { useState, useEffect, useCallback } from 'react';
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
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: any;
  is_read: boolean;
  created_at: string;
}

export default function NotificationsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);
    } catch (err) {
      console.error('[Notifications] Error fetching:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.error('[Notifications] Error marking as read:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!user?.id) return;

    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('[Notifications] Error marking all as read:', err);
    }
  };

  const handleNotificationPress = (notification: Notification) => {
    // DEBUG: Log notification data
    console.log('[Notifications] Pressed notification:', {
      id: notification.id,
      type: notification.type,
      data: notification.data,
      hasEventId: !!notification.data?.event_id,
    });

    // Mark as read first
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    // Navigate based on notification type and data
    const { data } = notification;

    if (data?.event_id) {
      // Navigate to event detail at root level
      navigation.navigate('EventDetail', {
        eventId: data.event_id,
        onRefetch: () => {},
      });
    } else if (data?.chat_id || data?.team_id) {
      // Navigate to chat
      navigation.navigate('Chat', {
        chatId: data.chat_id,
        teamId: data.team_id,
      });
    } else if (data?.course_id) {
      // Navigate to course
      navigation.navigate('CourseDetail', {
        courseId: data.course_id,
      });
    } else if (data?.evaluation_id) {
      // Navigate to evaluation
      navigation.navigate('EvaluationDetail', {
        evaluationId: data.evaluation_id,
      });
    }
    // If no specific destination, just mark as read (already done above)
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'event_created':
        return { name: 'calendar', color: '#22c55e' };
      case 'event_cancelled':
        return { name: 'calendar-outline', color: '#ef4444' };
      case 'event_changed':
        return { name: 'create-outline', color: '#f59e0b' };
      case 'event_reminder':
        return { name: 'alarm-outline', color: '#8b5cf6' };
      case 'chat_message':
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

  const renderNotification = ({ item }: { item: Notification }) => {
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

  const unreadCount = notifications.filter(n => !n.is_read).length;

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
