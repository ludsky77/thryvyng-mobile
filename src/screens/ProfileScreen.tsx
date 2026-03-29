import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const SHOW_LINEUP_WIDGET_KEY = 'show_lineup_widget';

const HELP_URL = 'https://thryvyng.com/help';
const TERMS_URL = 'https://thryvyng.com/terms';
const PRIVACY_URL = 'https://thryvyng.com/privacy';
const SUPPORT_URL = 'mailto:support@thryvyng.com';

export default function ProfileScreen({ navigation }: any) {
  const { user, profile, currentRole, signOut } = useAuth();
  const [showLineupWidget, setShowLineupWidget] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SHOW_LINEUP_WIDGET_KEY).then((val) => {
      setShowLineupWidget(val !== 'false');
    });
  }, []);

  const handleLineupWidgetToggle = async (value: boolean) => {
    setShowLineupWidget(value);
    await AsyncStorage.setItem(SHOW_LINEUP_WIDGET_KEY, String(value));
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      // Auth state change (user=null) causes AppNavigator to show AuthStack/Login
    } catch (error) {
      console.error('Sign out error:', error);
      Alert.alert('Error', 'Failed to sign out');
    }
  };

  const handleDeleteAccountConfirmed = async () => {
    try {
      setIsDeleting(true);

      const { data, error } = await supabase.functions.invoke('delete-account');

      if (error) {
        Alert.alert('Error', 'Failed to delete account. Please try again or contact support.');
        return;
      }

      await supabase.auth.signOut();
      const rootNav = navigation.getParent?.()?.getParent?.();
      if (rootNav?.reset) {
        rootNav.reset({ index: 0, routes: [{ name: 'Welcome' }] });
      }
    } catch (err) {
      Alert.alert(
        'Error',
        'An unexpected error occurred. Please contact support at support@thryvyng.com'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAccountPress = () => {
    Alert.alert(
      'Delete account?',
      'This will permanently delete your account. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void handleDeleteAccountConfirmed();
          },
        },
      ]
    );
  };

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() =>
      Alert.alert('Error', 'Could not open link')
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>

      {/* ── Profile Header ── */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.userName}>{profile?.full_name || 'User'}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
        {currentRole && (
          <View style={styles.currentRoleBadge}>
            <Text style={styles.currentRoleText}>
              {currentRole.role?.replace(/_/g, ' ')}
              {currentRole.entityName ? ` • ${currentRole.entityName}` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* ── ACCOUNT ── */}
      <Text style={styles.sectionHeader}>Account</Text>
      <View style={styles.sectionGroup}>
        {currentRole?.role === 'parent' && (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('ParentPayments')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#8b5cf622' }]}>
              <Ionicons name="card-outline" size={20} color="#8b5cf6" />
            </View>
            <View style={styles.rowLabelWrap}>
              <Text style={styles.rowLabel}>My Payments</Text>
              <Text style={styles.rowSubtitle}>Registration plans, balances & cards</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#4b5563" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('PaymentHistory')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#f59e0b22' }]}>
            <Ionicons name="receipt-outline" size={20} color="#f59e0b" />
          </View>
          <View style={styles.rowLabelWrap}>
            <Text style={styles.rowLabel}>Purchase History</Text>
            <Text style={styles.rowSubtitle}>Courses, store & evaluation orders</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#4b5563" />
        </TouchableOpacity>
      </View>

      {/* ── PREFERENCES ── */}
      <Text style={styles.sectionHeader}>Preferences</Text>
      <View style={styles.sectionGroup}>
        <View style={[styles.row, styles.rowToggle]}>
          <View style={[styles.iconCircle, { backgroundColor: '#06b6d422' }]}>
            <Ionicons name="calendar-outline" size={20} color="#06b6d4" />
          </View>
          <View style={styles.rowLabelWrap}>
            <Text style={styles.rowLabel}>Show Lineup on Dashboard</Text>
            <Text style={styles.rowSubtitle}>
              Display your upcoming lineup position on the home screen
            </Text>
          </View>
          <Switch
            value={showLineupWidget}
            onValueChange={handleLineupWidgetToggle}
            trackColor={{ false: '#334155', true: '#8b5cf6' }}
            thumbColor="#fff"
          />
        </View>
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('NotificationSettings')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#8b5cf622' }]}>
            <Ionicons name="notifications-outline" size={20} color="#8b5cf6" />
          </View>
          <Text style={styles.rowLabel}>Notification Settings</Text>
          <Ionicons name="chevron-forward" size={18} color="#4b5563" />
        </TouchableOpacity>
      </View>

      {/* ── SUPPORT ── */}
      <Text style={styles.sectionHeader}>Support</Text>
      <View style={styles.sectionGroup}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => openUrl(HELP_URL)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#10b98122' }]}>
            <Ionicons name="help-circle-outline" size={20} color="#10b981" />
          </View>
          <View style={styles.rowLabelWrap}>
            <Text style={styles.rowLabel}>Help & Support</Text>
            <Text style={styles.rowSubtitle}>support@thryvyng.com</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#4b5563" />
        </TouchableOpacity>
      </View>

      {/* ── LEGAL ── */}
      <Text style={styles.sectionHeader}>Legal</Text>
      <View style={styles.sectionGroup}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => openUrl(TERMS_URL)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#64748b33' }]}>
            <Ionicons name="document-text-outline" size={20} color="#94a3b8" />
          </View>
          <Text style={styles.rowLabel}>Terms of Service</Text>
          <Ionicons name="chevron-forward" size={18} color="#4b5563" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, styles.rowLast]}
          onPress={() => openUrl(PRIVACY_URL)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#64748b33' }]}>
            <Ionicons name="document-text-outline" size={20} color="#94a3b8" />
          </View>
          <Text style={styles.rowLabel}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={18} color="#4b5563" />
        </TouchableOpacity>
      </View>

      {/* ── Bottom ── */}
      <Text style={styles.versionText}>Version 1.0.0</Text>

      <TouchableOpacity
        style={[styles.deleteAccountButton, isDeleting && styles.deleteAccountButtonDisabled]}
        onPress={handleDeleteAccountPress}
        disabled={isDeleting}
      >
        {isDeleting ? (
          <ActivityIndicator size="small" color="#fecaca" />
        ) : (
          <Ionicons name="trash-outline" size={18} color="#fecaca" />
        )}
        <Text style={styles.deleteAccountText}>
          {isDeleting ? 'Deleting…' : 'Delete Account'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={18} color="#fff" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Profile header
  profileHeader: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#1e293b',
    borderRadius: 16,
  },
  avatarContainer: {
    marginBottom: 8,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: '#94a3b8',
  },
  currentRoleBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginTop: 8,
  },
  currentRoleText: {
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },

  // Section headers
  sectionHeader: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 16,
  },

  // Section group card
  sectionGroup: {
    marginHorizontal: 16,
    backgroundColor: '#1e293b',
    borderRadius: 14,
    overflow: 'hidden',
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
    gap: 12,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowToggle: {
    justifyContent: 'space-between',
  },
  rowLabelWrap: {
    flex: 1,
  },
  rowLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  rowSubtitle: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },

  // Icon circle
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Version
  versionText: {
    color: '#4b5563',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 8,
  },

  // Delete account
  deleteAccountButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 15,
    borderRadius: 12,
  },
  deleteAccountButtonDisabled: {
    opacity: 0.7,
  },
  deleteAccountText: {
    color: '#fecaca',
    fontSize: 16,
    fontWeight: '600',
  },

  // Sign out
  signOutButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ef4444',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 15,
    borderRadius: 12,
  },
  signOutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
