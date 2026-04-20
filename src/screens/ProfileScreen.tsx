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
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const HELP_URL = 'https://thryvyng.com/help';
const TERMS_URL = 'https://thryvyng.com/terms';
const PRIVACY_URL = 'https://thryvyng.com/privacy';

type HubRowProps = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  showChevron?: boolean;
  isLast?: boolean;
};

function HubRow({ icon, label, onPress, showChevron = true, isLast = false }: HubRowProps) {
  return (
    <TouchableOpacity
      style={[styles.hubRow, !isLast && styles.hubRowDivider]}
      onPress={onPress}
      activeOpacity={0.65}
    >
      <Feather name={icon} size={20} color="#8b5cf6" style={styles.hubRowIcon} />
      <Text style={styles.hubRowLabel}>{label}</Text>
      {showChevron ? (
        <Feather name="chevron-right" size={18} color="#6B7280" />
      ) : (
        <View style={styles.hubRowChevronSpacer} />
      )}
    </TouchableOpacity>
  );
}

export default function ProfileScreen({ navigation }: any) {
  const { user, profile, currentRole, signOut } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasRegistrations, setHasRegistrations] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setHasRegistrations(false);
      return;
    }
    (async () => {
      const { count, error } = await supabase
        .from('program_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', user.id);
      if (!error && count != null) {
        setHasRegistrations(count > 0);
      } else {
        setHasRegistrations(false);
      }
    })();
  }, [user?.id]);

  const showMyFamilyRow = currentRole?.role === 'parent' || hasRegistrations;
  const showPaymentsRow = currentRole?.role === 'parent';

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
      Alert.alert('Error', 'Failed to sign out');
    }
  };

  const handleDeleteAccountConfirmed = async () => {
    try {
      setIsDeleting(true);

      const { error } = await supabase.functions.invoke('delete-account');

      if (error) {
        Alert.alert('Error', 'Failed to delete account. Please try again or contact support.');
        return;
      }

      await supabase.auth.signOut();
      const rootNav = navigation.getParent?.()?.getParent?.();
      if (rootNav?.reset) {
        rootNav.reset({ index: 0, routes: [{ name: 'Welcome' }] });
      }
    } catch {
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
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open link'));
  };

  const openLegal = () => {
    Alert.alert('Terms & Privacy', undefined, [
      { text: 'Terms of Service', onPress: () => openUrl(TERMS_URL) },
      { text: 'Privacy Policy', onPress: () => openUrl(PRIVACY_URL) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const phoneDisplay = profile?.phone?.trim();

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerCard}>
          <View style={styles.avatarWrap}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarLarge} />
            ) : (
              <View style={styles.avatarPlaceholderLarge}>
                <Text style={styles.avatarLetterLarge}>
                  {profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.headerName}>{profile?.full_name || 'User'}</Text>
          <Text style={styles.headerEmail}>{user?.email}</Text>
          {phoneDisplay ? <Text style={styles.headerPhone}>{phoneDisplay}</Text> : null}
          <TouchableOpacity
            style={styles.editPill}
            onPress={() => navigation.navigate('EditProfile')}
            activeOpacity={0.8}
          >
            <Feather name="edit-2" size={18} color="#8b5cf6" />
            <Text style={styles.editPillText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.hubCard}>
          {(() => {
            const actions: {
              key: string;
              icon: keyof typeof Feather.glyphMap;
              label: string;
              onPress: () => void;
            }[] = [];
            if (showMyFamilyRow) {
              actions.push({
                key: 'family',
                icon: 'users',
                label: 'My Family',
                onPress: () => navigation.navigate('MyFamily'),
              });
            }
            actions.push({
              key: 'regs',
              icon: 'clipboard',
              label: 'My Registrations',
              onPress: () => navigation.navigate('MyRegistrations'),
            });
            if (showPaymentsRow) {
              actions.push({
                key: 'payments',
                icon: 'credit-card',
                label: 'Payments',
                onPress: () => navigation.navigate('ParentPayments'),
              });
            }
            actions.push({
              key: 'purchaseHistory',
              icon: 'shopping-bag',
              label: 'Purchase History',
              onPress: () => navigation.navigate('PaymentHistory'),
            });
            return actions.map((a, idx) => (
              <HubRow
                key={a.key}
                icon={a.icon}
                label={a.label}
                onPress={a.onPress}
                isLast={idx === actions.length - 1}
              />
            ));
          })()}
        </View>

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.hubCard}>
          <HubRow
            icon="bell"
            label="Notification Settings"
            onPress={() => navigation.navigate('NotificationSettings')}
          />
          <HubRow
            icon="lock"
            label="Change Password"
            onPress={() => navigation.navigate('ChangePassword')}
            isLast
          />
        </View>

        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.hubCard}>
          <HubRow
            icon="help-circle"
            label="Help & Support"
            onPress={() => openUrl(HELP_URL)}
          />
          <HubRow
            icon="file-text"
            label="Terms & Privacy"
            onPress={openLegal}
            showChevron={false}
            isLast
          />
        </View>

        <Text style={styles.versionText}>
          {`Version ${Constants.expoConfig?.version ?? '1.0.0'}`}
        </Text>

        <View style={styles.footerButtons}>
          <TouchableOpacity
            style={[styles.outlineButton, styles.deleteOutline, isDeleting && styles.buttonDisabled]}
            onPress={handleDeleteAccountPress}
            disabled={isDeleting}
            activeOpacity={0.75}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color="#f87171" />
            ) : (
              <Text style={styles.deleteOutlineText}>Delete Account</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.outlineButton, styles.signOutOutline]}
            onPress={() => void handleSignOut()}
            activeOpacity={0.75}
          >
            <Text style={styles.signOutOutlineText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
    flexGrow: 1,
  },
  headerCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  avatarWrap: {
    marginBottom: 12,
  },
  avatarLarge: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarPlaceholderLarge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetterLarge: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
  },
  headerName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  headerEmail: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 6,
  },
  headerPhone: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 4,
  },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  editPillText: {
    color: '#8b5cf6',
    fontSize: 15,
    fontWeight: '600',
  },
  hubCard: {
    backgroundColor: '#1e1e3a',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  hubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 16,
  },
  hubRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a4e',
  },
  hubRowIcon: {
    marginRight: 12,
  },
  hubRowLabel: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  hubRowChevronSpacer: {
    width: 18,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 16,
  },
  versionText: {
    color: '#4b5563',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  footerButtons: {
    flexDirection: 'row',
    marginHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  outlineButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  deleteOutline: {
    borderColor: '#dc2626',
    backgroundColor: 'transparent',
  },
  deleteOutlineText: {
    color: '#f87171',
    fontSize: 15,
    fontWeight: '600',
  },
  signOutOutline: {
    borderColor: '#6b7280',
    backgroundColor: 'transparent',
  },
  signOutOutlineText: {
    color: '#9ca3af',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});
