import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { RoleSwitcher } from '../components/RoleSwitcher';

export default function DashboardScreen({ navigation }: any) {
  const { user, profile, roles, loading: authLoading } = useAuth();
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserData();
  }, [user, roles]);

  async function loadUserData() {
    try {
      if (!user) return;

      const parentRole = roles?.find((r: any) => r.role === 'parent');
      if (parentRole || user.email) {
        const { data: playersData } = await supabase
            .from('players')
            .select(`
              *,
              teams (
                id,
                name,
                clubs (
                  id,
                  name
                )
              )
            `)
            .or(`parent_email.eq.${user.email},secondary_parent_email.eq.${user.email}`);
        setPlayers(playersData || []);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  }

  const hasRole = (roleName: string) => {
    return (roles || []).some((r: any) => r.role === roleName);
  };

  if (authLoading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>
          Hello, {profile?.full_name?.split(' ')[0] || 'there'}! 👋
        </Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <RoleSwitcher />

      {/* Show unique role types only */}
      <View style={styles.rolesContainer}>
        {[...new Set((roles || []).map((r: any) => r.role))].map((roleType, index) => (
          <View key={index} style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>
              {String(roleType).replace(/_/g, ' ')}
            </Text>
          </View>
        ))}
      </View>

      {players.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎽 Your Players</Text>
          {players.map((player, index) => (
            <TouchableOpacity
              key={index}
              style={styles.playerCard}
              onPress={() =>
                navigation.navigate('PlayerProfile', {
                  playerId: player.id,
                  playerName: `${player.first_name} ${player.last_name}`,
                })
              }
              activeOpacity={0.7}
            >
              <View style={styles.playerCardContent}>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>
                    {player.first_name} {player.last_name}
                  </Text>
                  {player.teams && (
                    <>
                      <Text style={styles.teamName}>⚽ {player.teams.name}</Text>
                      {player.teams.clubs && (
                        <Text style={styles.clubName}>🏆 {player.teams.clubs.name}</Text>
                      )}
                    </>
                  )}
                </View>
                <Text style={styles.playerArrow}>›</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚡ Quick Actions</Text>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.getParent()?.navigate('CalendarTab')}
        >
          <Text style={styles.actionButtonText}>📅 View Upcoming Events</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>📚 Browse Courses</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>🔗 Share Referral Link</Text>
        </TouchableOpacity>
      </View>

      {(hasRole('platform_admin') || hasRole('club_admin') || hasRole('team_manager')) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔧 Admin Tools</Text>
          
          {hasRole('platform_admin') && (
            <TouchableOpacity style={[styles.actionButton, styles.adminButton]}>
              <Text style={styles.actionButtonText}>🏢 Manage Platform</Text>
            </TouchableOpacity>
          )}
          
          {hasRole('club_admin') && (
            <TouchableOpacity style={[styles.actionButton, styles.adminButton]}>
              <Text style={styles.actionButtonText}>⚽ Manage Club</Text>
            </TouchableOpacity>
          )}
          
          {hasRole('team_manager') && (
            <TouchableOpacity style={[styles.actionButton, styles.adminButton]}>
              <Text style={styles.actionButtonText}>👥 Manage Team</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
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
  header: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#2a2a4e',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  email: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
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