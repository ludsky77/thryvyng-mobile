import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

const HELP_URL = 'https://thryvyng.com/help';
const TERMS_URL = 'https://thryvyng.com/terms';
const PRIVACY_URL = 'https://thryvyng.com/privacy';
const SUPPORT_URL = 'mailto:support@thryvyng.com';

export default function ProfileScreen({ navigation }: any) {
  const { user, profile, currentRole, signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      // Auth state change (user=null) causes AppNavigator to show AuthStack/Login
    } catch (error) {
      console.error('Sign out error:', error);
      Alert.alert('Error', 'Failed to sign out');
    }
  };

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() =>
      Alert.alert('Error', 'Could not open link')
    );
  };

  return (
    <ScrollView style={styles.container}>
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

      <View style={styles.menuSection}>
        <Text style={styles.menuSectionTitle}>Account</Text>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('EditProfile')}
        >
          <Text style={styles.menuIcon}>👤</Text>
          <Text style={styles.menuItemText}>Edit Profile</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('Notifications')}
        >
          <View style={styles.menuIconWrap}>
            <Feather name="bell" size={22} color="#8B5CF6" />
          </View>
          <Text style={styles.menuItemText}>Notifications</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('PaymentMethods')}
        >
          <Text style={styles.menuIcon}>💳</Text>
          <Text style={styles.menuItemText}>Payment Methods</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('PaymentHistory')}
        >
          <Text style={styles.menuIcon}>📜</Text>
          <Text style={styles.menuItemText}>Payment History</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.menuSection}>
        <Text style={styles.menuSectionTitle}>Support</Text>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => openUrl(HELP_URL)}
        >
          <Text style={styles.menuIcon}>❓</Text>
          <Text style={styles.menuItemText}>Help Center</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => openUrl(SUPPORT_URL)}
        >
          <Text style={styles.menuIcon}>📧</Text>
          <Text style={styles.menuItemText}>Contact Support</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.menuSection}>
        <Text style={styles.menuSectionTitle}>About</Text>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => openUrl(TERMS_URL)}
        >
          <Text style={styles.menuIcon}>📄</Text>
          <Text style={styles.menuItemText}>Terms of Service</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => openUrl(PRIVACY_URL)}
        >
          <Text style={styles.menuIcon}>🔒</Text>
          <Text style={styles.menuItemText}>Privacy Policy</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <View style={styles.menuItem}>
          <Text style={styles.menuIcon}>📱</Text>
          <Text style={styles.menuItemText}>App Version</Text>
          <Text style={styles.menuVersion}>1.0.0</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: '#2a2a4e',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '700',
    color: '#fff',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
  },
  currentRoleBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  currentRoleText: {
    color: '#a78bfa',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  menuSection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  menuSectionTitle: {
    color: '#666',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a4e',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  menuIcon: {
    fontSize: 20,
    marginRight: 14,
  },
  menuIconWrap: {
    marginRight: 14,
  },
  menuItemText: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  menuArrow: {
    color: '#666',
    fontSize: 20,
  },
  menuVersion: {
    color: '#666',
    fontSize: 14,
  },
  signOutButton: {
    backgroundColor: '#ef4444',
    marginHorizontal: 16,
    marginTop: 30,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  signOutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 40,
  },
});
