import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { getUnreadCount } from '../services/notifications';
import { logError } from '../utils/logError';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, any> | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  refetch: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  /**
   * The badge number, counted server-side with count: 'exact' and no limit.
   * getUnreadCount already existed in services/notifications and was unused.
   */
  const refreshUnreadCount = useCallback(async () => {
    if (!user?.id) {
      setUnreadCount(0);
      return;
    }
    setUnreadCount(await getUnreadCount(user.id));
  }, [user?.id]);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // The LIST stays paged at the newest 100 -- that is a display decision.
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        logError('NotificationContext.fetchNotifications', error, {
          userId: user.id,
        });
      } else if (data) {
        setNotifications((data as Notification[]) || []);
      }

      // R4: the BADGE is the exact unread count. Deriving it from the page
      // above undercounted anyone whose unread sat outside the newest 100.
      await refreshUnreadCount();
    } catch (err) {
      logError('NotificationContext.fetchNotifications', err, {
        userId: user.id,
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, refreshUnreadCount]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!user?.id) return;

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (!error) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, is_read: true } : n
          )
        );
        // Optimistic so the row restyles instantly, then reconciled against
        // the exact count -- the badge must not drift away from the truth.
        setUnreadCount((prev) => Math.max(0, prev - 1));
        void refreshUnreadCount();
      }
    },
    [user?.id, refreshUnreadCount]
  );

  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true }))
      );
      setUnreadCount(0);
      // Rows older than the newest 100 were also marked read server-side;
      // re-count rather than trust the page we can see.
      void refreshUnreadCount();
    }
  }, [user?.id, refreshUnreadCount]);

  const deleteNotification = useCallback(
    async (notificationId: string) => {
      if (!user?.id) return;

      const target = notifications.find((n) => n.id === notificationId);
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (!error) {
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
        if (target && !target.is_read) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
          void refreshUnreadCount();
        }
      }
    },
    [user?.id, notifications, refreshUnreadCount]
  );

  const clearAllNotifications = useCallback(async () => {
    if (!user?.id) return;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user.id);

    if (!error) {
      setNotifications([]);
      setUnreadCount(0);
      void refreshUnreadCount();
    }
  }, [user?.id, refreshUnreadCount]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notif-context-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev]);
          setUnreadCount((prev) => prev + 1);
          void refreshUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refreshUnreadCount]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAllNotifications,
        refetch: fetchNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error(
      'useNotifications must be used within a NotificationProvider'
    );
  }
  return context;
}
