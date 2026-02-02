/**
 * Re-export from NotificationContext so all consumers share the same
 * notification state (badge updates immediately when marking as read).
 */
export {
  useNotifications,
  type Notification,
  type NotificationType,
} from '../contexts/NotificationContext';
