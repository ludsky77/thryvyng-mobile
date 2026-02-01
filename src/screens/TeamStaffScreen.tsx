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
  phone: string | null;
}

interface StaffMember {
  id: string;
  user_id: string;
  team_id: string;
  role: string;
  profile: Profile | Profile[] | null;
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
  const { team_id } = route.params;
  const [team, setTeam] = useState<{ id: string; name: string } | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!team_id) {
      setLoading(false);
      return;
    }

    try {
      const { data: teamData } = await supabase
        .from('teams')
        .select('id, name')
        .eq('id', team_id)
        .single();

      setTeam(teamData as any);

      const { data: staffData, error } = await supabase
        .from('team_staff')
        .select('id, user_id, team_id, role')
        .eq('team_id', team_id);

      if (error) throw error;

      const staffList = staffData || [];
      const userIds = staffList.map((s: any) => s.user_id).filter(Boolean);

      let profilesMap: Record<string, Profile> = {};
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url, phone')
          .in('id', userIds);

        (profilesData || []).forEach((p: any) => {
          profilesMap[p.id] = p;
        });
      }

      const staffWithProfiles = staffList.map((s: any) => ({
        ...s,
        profile: profilesMap[s.user_id] || null,
      }));

      setStaff(staffWithProfiles);
    } catch (err) {
      console.error('Error fetching staff:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [team_id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    navigation.setOptions({
      title: team ? `${team.name} Staff` : 'Team Staff',
    });
  }, [team?.name, navigation]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleStaffPress = (member: StaffMember) => {
    const profile = member.profile as Profile | null;
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
    if (profile.phone) {
      buttons.push({
        text: 'Call',
        onPress: () => Linking.openURL(`tel:${profile.phone}`),
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
        <Text style={styles.teamName}>{team.name}</Text>
        <Text style={styles.staffCount}>
          {staff.length} {staff.length === 1 ? 'staff member' : 'staff members'}
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
            const profile = member.profile as Profile | null;
            const name = profile?.full_name || 'Unknown';
            const config = ROLE_CONFIG[member.role] || {
              label: member.role?.replace(/_/g, ' ') || 'Staff',
              color: '#8b5cf6',
            };

            return (
              <TouchableOpacity
                key={member.id}
                style={styles.staffCard}
                onPress={() => handleStaffPress(member)}
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
                  {profile?.phone && (
                    <Text style={styles.staffDetail}>📞 {profile.phone}</Text>
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
    padding: 20,
    backgroundColor: '#2a2a4e',
    marginBottom: 12,
  },
  teamName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
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
