import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  // Must be a physical device
  if (!Device.isDevice) {
    console.log('[Notifications] Must use physical device for push notifications');
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Notifications] Permission not granted');
      return null;
    }

    // Get the Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId,
    });

    const pushToken = tokenData.data;
    console.log('[Notifications] Push token:', pushToken);

    // Save to database
    await savePushToken(userId, pushToken);

    // Android needs a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#8b5cf6',
      });
    }

    return pushToken;
  } catch (error) {
    console.error('[Notifications] Error registering:', error);
    return null;
  }
}

async function savePushToken(userId: string, pushToken: string): Promise<void> {
  try {
    const deviceType = Platform.OS as 'ios' | 'android';
    const deviceName = Device.deviceName || `${Device.brand} ${Device.modelName}`;

    // Upsert the token (insert or update if exists)
    const { error } = await supabase
      .from('user_push_tokens')
      .upsert(
        {
          user_id: userId,
          push_token: pushToken,
          device_type: deviceType,
          device_name: deviceName,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,push_token',
        }
      );

    if (error) {
      console.error('[Notifications] Error saving token:', error);
    } else {
      console.log('[Notifications] Token saved successfully');
    }
  } catch (error) {
    console.error('[Notifications] Error in savePushToken:', error);
  }
}

export async function deactivatePushToken(userId: string): Promise<void> {
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData.data;

    await supabase
      .from('user_push_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('push_token', pushToken);

    console.log('[Notifications] Token deactivated');
  } catch (error) {
    console.error('[Notifications] Error deactivating token:', error);
  }
}

// Listen for incoming notifications
export function addNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
) {
  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    console.log('[Notifications] Received:', notification);
    onNotificationReceived?.(notification);
  });

  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('[Notifications] User tapped:', response);
    onNotificationResponse?.(response);
  });

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

// Get unread notification count
export async function getUnreadCount(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('[Notifications] Error getting unread count:', error);
    return 0;
  }
}

// Mark notification as read
export async function markAsRead(notificationId: string): Promise<void> {
  try {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
  } catch (error) {
    console.error('[Notifications] Error marking as read:', error);
  }
}

// Mark all notifications as read
export async function markAllAsRead(userId: string): Promise<void> {
  try {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
  } catch (error) {
    console.error('[Notifications] Error marking all as read:', error);
  }
}
