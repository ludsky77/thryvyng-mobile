import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface NotificationPreferences {
  id?: string;
  user_id: string;
  push_new_events: boolean;
  push_event_changes: boolean;
  push_event_reminders: boolean;
  push_chat_messages: boolean;
  push_announcements: boolean;
  email_weekly_summary: boolean;
  email_evaluations: boolean;
  email_courses: boolean;
  sms_enabled: boolean;
  sms_phone: string | null;
  sms_cancellations: boolean;
  sms_reminders: boolean;
  sms_announcements: boolean;
}

const defaultPreferences: Omit<NotificationPreferences, 'user_id'> = {
  push_new_events: true,
  push_event_changes: true,
  push_event_reminders: true,
  push_chat_messages: true,
  push_announcements: true,
  email_weekly_summary: true,
  email_evaluations: true,
  email_courses: true,
  sms_enabled: false,
  sms_phone: null,
  sms_cancellations: true,
  sms_reminders: false,
  sms_announcements: false,
};

export default function NotificationSettingsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPreferences = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('[NotificationSettings] Error:', error);
      }

      if (data) {
        setPreferences(data);
      } else {
        setPreferences({ ...defaultPreferences, user_id: user.id });
      }
    } catch (err) {
      console.error('[NotificationSettings] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const updatePreference = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!preferences || !user?.id) return;

    const updated = { ...preferences, [key]: value };
    setPreferences(updated);

    setSaving(true);
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: user.id,
            ...updated,
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;
    } catch (err) {
      console.error('[NotificationSettings] Save error:', err);
      Alert.alert('Error', 'Failed to save preference');
      setPreferences(preferences);
    } finally {
      setSaving(false);
    }
  };

  const renderToggle = (
    label: string,
    description: string,
    key: keyof NotificationPreferences,
    icon: string
  ) => (
    <View style={styles.settingItem}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon as any} size={22} color="#8b5cf6" />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <Switch
        value={(preferences?.[key] as boolean) ?? false}
        onValueChange={(value) => updatePreference(key, value)}
        trackColor={{ false: '#374151', true: '#7c3aed' }}
        thumbColor={preferences?.[key] ? '#a78bfa' : '#6b7280'}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Settings</Text>
        {saving && <ActivityIndicator size="small" color="#8b5cf6" />}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Push Notifications</Text>
        <View style={styles.section}>
          {renderToggle('New Events', 'When new events are added to your teams', 'push_new_events', 'calendar-outline')}
          {renderToggle('Event Changes', 'When event time or location changes', 'push_event_changes', 'create-outline')}
          {renderToggle('Event Reminders', '24hr and 2hr reminders before events', 'push_event_reminders', 'alarm-outline')}
          {renderToggle('Chat Messages', 'New messages in your conversations', 'push_chat_messages', 'chatbubble-outline')}
          {renderToggle('Announcements', 'Important updates from coaches and club', 'push_announcements', 'megaphone-outline')}
        </View>

        <Text style={styles.sectionTitle}>Email</Text>
        <View style={styles.section}>
          {renderToggle('Weekly Summary', 'Recap of upcoming events and activities', 'email_weekly_summary', 'mail-outline')}
          {renderToggle('Evaluations', 'When new evaluations are available', 'email_evaluations', 'clipboard-outline')}
          {renderToggle('Courses', 'New course recommendations and updates', 'email_courses', 'school-outline')}
        </View>

        <Text style={styles.sectionTitle}>SMS (Text Messages)</Text>
        <View style={styles.section}>
          {renderToggle('Enable SMS', 'Receive critical updates via text', 'sms_enabled', 'phone-portrait-outline')}
          {preferences?.sms_enabled && (
            <>
              {renderToggle('Cancellations', 'Immediate alert when events are cancelled', 'sms_cancellations', 'close-circle-outline')}
              {renderToggle('Reminders', 'Text reminders before events', 'sms_reminders', 'time-outline')}
            </>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Push notifications require app permission. Go to your device settings if notifications aren't appearing.
          </Text>
        </View>
      </ScrollView>
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
    gap: 12,
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
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 10,
    marginLeft: 4,
  },
  section: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  settingDescription: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  footer: {
    padding: 20,
    marginTop: 20,
    marginBottom: 40,
  },
  footerText: {
    color: '#475569',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
