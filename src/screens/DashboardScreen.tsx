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

export default function DashboardScreen() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserData();
  }, []);

  async function loadUserData() {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        // Get profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        setProfile(profileData);

        // Get roles
        const { data: rolesData } = await supabase
          .from('user_roles')
          .select('*')
          .eq('user_id', user.id);
        setRoles(rolesData || []);

        // If user is a parent, get their players
        const parentRole = rolesData?.find(r => r.role === 'parent');
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
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  // Check if user has a specific role
  const hasRole = (roleName: string) => {
    return roles.some(r => r.role === roleName);
  };

  if (loading) {
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

      {/* Role Badges */}
      <View style={styles.rolesContainer}>
        {roles.map((role, index) => (
          <View key={index} style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>
              {role.role.replace('_', ' ')}
            </Text>
          </View>
        ))}
      </View>

      {/* Parent Section - Show Players */}
      {players.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎽 Your Players</Text>
          {players.map((player, index) => (
            <View key={index} style={styles.playerCard}>
              <Text style={styles.playerName}>
                {player.first_name} {player.last_name}
              </Text>
              {player.teams && (
                <>
                  <Text style={styles.teamName}>
                    ⚽ {player.teams.name}
                  </Text>
                  {player.teams.clubs && (
                    <Text style={styles.clubName}>
                      🏆 {player.teams.clubs.name}
                    </Text>
                  )}
                </>
              )}
              {player.position && (
                <Text style={styles.position}>Position: {player.position}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚡ Quick Actions</Text>
        
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>📚 Browse Courses</Text>
        </TouchableOpacity>
        
        {players.length > 0 && (
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>📊 View Evaluations</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>💬 Team Chat</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>📅 Calendar</Text>
        </TouchableOpacity>
      </View>

      {/* Admin Section */}
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

      {/* Sign Out */}
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
  playerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
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
  position: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
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
  signOutButton: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    padding: 16,
    margin: 16,
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