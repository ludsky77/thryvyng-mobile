import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { RoleSwitcher } from '../components/RoleSwitcher';
import PlayerDashboard from '../components/dashboards/PlayerDashboard';
import CoachDashboard from '../components/dashboards/CoachDashboard';
import ClubAdminDashboard from '../components/dashboards/ClubAdminDashboard';

export default function DashboardScreen({ navigation }: any) {
  const { user, profile, currentRole, loading: authLoading } = useAuth();
  const { unreadCount } = useNotifications();

  const renderDashboard = () => {
    const role = currentRole?.role;
    const entityId = currentRole?.entity_id;

    switch (role) {
      case 'player':
      case 'parent':
        return <PlayerDashboard playerId={entityId} navigation={navigation} />;
      case 'head_coach':
      case 'assistant_coach':
      case 'team_manager':
        return <CoachDashboard teamId={entityId} />;
      case 'club_admin':
        return <ClubAdminDashboard clubId={entityId} navigation={navigation} />;
      default:
        return (
          <View style={styles.selectRoleContainer}>
            <Text style={styles.selectRoleText}>Select a role</Text>
            <Text style={styles.selectRoleHint}>
              Use the role switcher above to view your dashboard
            </Text>
          </View>
        );
    }
  };

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.brandHeader}>
        <View style={styles.brandLeft}>
          <Text style={styles.brandText}>⚽ Thryvyng</Text>
        </View>
        <TouchableOpacity
          style={styles.notificationButton}
          onPress={() => navigation.navigate('Notifications')}
        >
          <View style={{ position: 'relative' }}>
            <Feather name="bell" size={24} color="#8B5CF6" />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.roleSwitcherCard}>
        <RoleSwitcher embedded />
      </View>

      <View style={styles.dashboardContent}>
        {renderDashboard()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  dashboardContent: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 10,
    fontSize: 16,
  },
  brandHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: 'transparent',
  },
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#a78bfa',
  },
  notificationButton: {
    position: 'relative',
    padding: 8,
  },
  bellIcon: {
    fontSize: 24,
  },
  notificationBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  roleSwitcherCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
  },
  rolesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 8,
  },
  roleBadge: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  selectRoleContainer: {
    padding: 40,
    alignItems: 'center',
  },
  selectRoleText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  selectRoleHint: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  playerCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  playerCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  playerArrow: {
    color: '#666',
    fontSize: 24,
    marginLeft: 12,
  },
  teamName: {
    fontSize: 14,
    color: '#8b5cf6',
    marginTop: 4,
  },
  clubName: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  actionButton: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  adminButton: {
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  bottomPadding: {
    height: 40,
  },
});