import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Animated,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '../contexts/NotificationContext';

const DELETE_THRESHOLD = 80;

function SwipeableRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) translateX.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -DELETE_THRESHOLD) {
          Animated.timing(translateX, {
            toValue: -400,
            duration: 200,
            useNativeDriver: true,
          }).start(() => onDelete());
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const deleteOpacity = translateX.interpolate({
    inputRange: [-DELETE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={swipeStyles.container}>
      <Animated.View style={[swipeStyles.deleteReveal, { opacity: deleteOpacity }]}>
        <Ionicons name="trash-outline" size={22} color="#fff" />
      </Animated.View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

type NotifItem = ReturnType<typeof useNotifications>['notifications'][number];

function NotificationRow({
  item,
  onPress,
  getIcon,
  formatTime,
}: {
  item: NotifItem;
  onPress: () => void;
  getIcon: (type: string) => { name: string; color: string };
  formatTime: (d: string) => string;
}) {
  const icon = getIcon(item.type);
  return (
    <TouchableOpacity
      style={[styles.notificationItem, !item.is_read && styles.unreadItem]}
      onPress={onPress}
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
}

const swipeStyles = StyleSheet.create({
  container: {
    marginBottom: 10,
    overflow: 'hidden',
    borderRadius: 12,
  },
  deleteReveal: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 72,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default function NotificationsScreen({ navigation }: any) {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead: contextMarkAsRead,
    markAllAsRead: contextMarkAllAsRead,
    deleteNotification,
    clearAllNotifications,
    refetch,
  } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const markAsRead = (notificationId: string) => contextMarkAsRead(notificationId);
  const markAllAsRead = () => contextMarkAllAsRead();

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Notifications',
      'Are you sure? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear All', style: 'destructive', onPress: clearAllNotifications },
      ]
    );
  };

  const handleNotificationPress = (notification: ReturnType<typeof useNotifications>['notifications'][number]) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    const { type, data } = notification;

    // Chat / message notifications
    if (type === 'chat_message' || type === 'chat' || type === 'message') {
      const channelId = data?.channel_id ?? data?.chat_id;
      if (channelId) {
        navigation.navigate('TeamChatRoom', { channelId });
      } else {
        navigation.navigate('Conversations');
      }
      return;
    }

    // Event notifications
    if (
      type === 'event_reminder' ||
      type === 'event_created' ||
      type === 'event_changed' ||
      type === 'event_cancelled' ||
      type === 'event'
    ) {
      const eventId = data?.event_id ?? data?.reference_id;
      if (eventId) {
        navigation.navigate('EventDetail', { eventId, onRefetch: () => {} });
      }
      return;
    }

    // Survey notifications
    if (type === 'survey' || type === 'survey_reminder') {
      const surveyId = data?.survey_id;
      const slug = data?.slug ?? data?.public_slug;
      if (surveyId || slug) {
        navigation.navigate('SurveyResponse', { surveyId, slug });
      }
      return;
    }

    // Lineup notifications
    if (type === 'lineup_published') {
      if (data?.event_id) {
        navigation.navigate('EventDetail', { eventId: data.event_id, onRefetch: () => {} });
      } else if (data?.team_id) {
        navigation.navigate('LineupList', { teamId: data.team_id });
      }
      return;
    }

    // Evaluation notifications
    if (type === 'evaluation') {
      const evaluationId = data?.evaluation_id ?? data?.reference_id;
      if (evaluationId) {
        navigation.navigate('EvaluationDetail', { evaluationId });
      }
      return;
    }

    // Course notifications
    if (data?.course_id) {
      navigation.navigate('CourseDetail', { courseId: data.course_id });
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
      case 'chat':
      case 'message':
        return { name: 'chatbubble-outline', color: '#3b82f6' };
      case 'survey':
      case 'survey_reminder':
        return { name: 'clipboard-outline', color: '#f59e0b' };
      case 'lineup_published':
        return { name: 'git-network-outline', color: '#f59e0b' };
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

  const renderNotification = ({ item }: { item: ReturnType<typeof useNotifications>['notifications'][number] }) => {
    return (
      <SwipeableRow
        key={item.id}
        onDelete={() => deleteNotification(item.id)}
      >
        <NotificationRow
          item={item}
          onPress={() => handleNotificationPress(item)}
          getIcon={getNotificationIcon}
          formatTime={formatTime}
        />
      </SwipeableRow>
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
        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <TouchableOpacity style={styles.markAllButton} onPress={markAllAsRead}>
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity style={styles.clearAllButton} onPress={handleClearAll}>
              <Text style={styles.clearAllText}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  markAllButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  markAllText: {
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: '600',
  },
  clearAllButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  clearAllText: {
    color: '#f87171',
    fontSize: 12,
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
