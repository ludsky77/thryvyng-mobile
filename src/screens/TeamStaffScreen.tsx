import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface StaffMember {
  id: string;
  role: string;
  user_id: string;
  entity_id: string | null;
  profiles?: Profile | Profile[] | null;
}

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  head_coach: { label: 'Head Coach', color: '#f59e0b' },
  assistant_coach: { label: 'Assistant Coach', color: '#3b82f6' },
  team_manager: { label: 'Team Manager', color: '#22c55e' },
};

function getInitials(name: string | null): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function TeamStaffScreen({ route, navigation }: any) {
  const { team_id, teamId } = route.params || {};
  const actualTeamId = team_id || teamId;
  const [team, setTeam] = useState<{ id: string; name: string } | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!actualTeamId) {
      setLoading(false);
      return;
    }

    try {
      const { data: teamData } = await supabase
        .from('teams')
        .select('id, name')
        .eq('id', actualTeamId)
        .single();

      setTeam(teamData as any);

      const { data: staffData, error } = await supabase
        .from('user_roles')
        .select(`
          id,
          role,
          user_id,
          entity_id,
          profiles (
            id,
            full_name,
            email,
            avatar_url
          )
        `)
        .eq('entity_id', actualTeamId)
        .in('role', ['head_coach', 'assistant_coach', 'team_manager']);

      if (error) throw error;

      const staffList = (staffData || []).map((m: any) => ({
        ...m,
        profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
      }));

      setStaff(staffList);
    } catch (err) {
      console.error('Error fetching staff:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [actualTeamId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleStaffPress = (member: StaffMember) => {
    const profile = member.profiles as Profile | null;
    if (!profile) return;

    const buttons: { text: string; onPress?: () => void; style?: 'cancel' }[] = [
      { text: 'Cancel', style: 'cancel' },
    ];

    if (profile.email) {
      buttons.push({
        text: 'Email',
        onPress: () => Linking.openURL(`mailto:${profile.email}`),
      });
    }

    if (buttons.length <= 1) return;

    Alert.alert('Contact', 'Choose an option', buttons);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading staff...</Text>
      </View>
    );
  }

  if (!team) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Team not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Team Staff</Text>
        <View style={styles.headerRight} />
      </View>
      <View style={styles.headerSubtitleRow}>
        <Text style={styles.staffCount}>
          {team.name} • {staff.length} {staff.length === 1 ? 'staff member' : 'staff members'}
        </Text>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#8b5cf6"
          />
        }
      >
        {staff.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>👔</Text>
            <Text style={styles.emptyTitle}>No staff yet</Text>
            <Text style={styles.emptyText}>
              Staff members will appear here when added to the team
            </Text>
          </View>
        ) : (
          staff.map((member) => {
            const profile = member.profiles as Profile | null;
            const name = profile?.full_name || 'Unknown';
            const config = ROLE_CONFIG[member.role] || {
              label: (member.role || 'Staff')?.replace(/_/g, ' '),
              color: '#8b5cf6',
            };

            return (
              <TouchableOpacity
                key={member.id}
                style={styles.staffCard}
                onPress={() => handleStaffPress({ ...member, profile: member.profiles })}
                activeOpacity={0.7}
              >
                <View style={styles.avatarContainer}>
                  {profile?.avatar_url ? (
                    <Image
                      source={{ uri: profile.avatar_url }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarText}>
                        {getInitials(profile?.full_name || null)}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.staffInfo}>
                  <Text style={styles.staffName}>{name}</Text>
                  <View
                    style={[
                      styles.roleBadge,
                      { backgroundColor: config.color + '33' },
                    ]}
                  >
                    <Text
                      style={[styles.roleBadgeText, { color: config.color }]}
                    >
                      {config.label}
                    </Text>
                  </View>
                  {profile?.email && (
                    <Text style={styles.staffDetail}>📧 {profile.email}</Text>
                  )}
                </View>
                <Text style={styles.staffArrow}>›</Text>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
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
    marginTop: 12,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  headerSubtitleRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0f172a',
  },
  staffCount: {
    color: '#888',
    fontSize: 14,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  avatarContainer: {
    marginRight: 14,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  staffInfo: {
    flex: 1,
    minWidth: 0,
  },
  staffName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 6,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  staffDetail: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  staffArrow: {
    color: '#666',
    fontSize: 22,
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
  },
});
