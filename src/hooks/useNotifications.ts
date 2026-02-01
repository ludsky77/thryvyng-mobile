import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type NotificationType =
  | 'message'
  | 'event'
  | 'poll'
  | 'rsvp_reminder'
  | 'push';

export interface Notification {
  id: string;
  user_id: string;
  notification_type: NotificationType;
  title: string;
  body: string | null;
  reference_type: string | null;
  reference_id: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notif_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setNotifications((data || []) as Notification[]);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notif_history',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchNotifications]);

  const markAsRead = useCallback(
    async (id: string) => {
      if (!user?.id) return;

      await supabase
        .from('notif_history')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id);

      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        )
      );
    },
    [user?.id]
  );

  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;

    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    await supabase
      .from('notif_history')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .in('id', unreadIds);

    setNotifications((prev) =>
      prev.map((n) =>
        !n.is_read ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
      )
    );
  }, [user?.id, notifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}
