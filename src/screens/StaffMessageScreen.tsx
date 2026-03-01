import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type StaffFilter = 'all' | 'head_coaches' | 'all_coaches' | 'managers';

interface StaffMember {
  id: string;
  user_id: string;
  full_name: string;
  role: string;
  team_name: string;
}

export default function StaffMessageScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { clubId } = (route.params as { clubId: string }) || {};
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<StaffFilter>('all');
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (clubId) {
      fetchClubStaff();
    } else {
      setLoading(false);
    }
  }, [clubId]);

  const fetchClubStaff = async () => {
    if (!clubId) return;
    setLoading(true);
    try {
      const { data: teams } = await supabase
        .from('teams')
        .select('id, name')
        .eq('club_id', clubId);

      if (!teams?.length) {
        setAllStaff([]);
        setLoading(false);
        return;
      }

      const teamIds = teams.map((t) => t.id);
      const teamMap = new Map(teams.map((t) => [t.id, t.name]));

      const { data: staffData } = await supabase
        .from('team_staff')
        .select('id, user_id, staff_role, team_id')
        .in('team_id', teamIds);

      if (!staffData?.length) {
        setAllStaff([]);
        setLoading(false);
        return;
      }

      const userIds = [...new Set(staffData.map((s: any) => s.user_id))];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      const staffList: StaffMember[] = staffData.map((s: any) => ({
        id: s.id,
        user_id: s.user_id,
        full_name: profileMap.get(s.user_id)?.full_name || 'Unknown',
        role: s.staff_role || '',
        team_name: teamMap.get(s.team_id) || '',
      }));

      const uniqueStaff = Array.from(
        new Map(staffList.map((s) => [s.user_id, s])).values()
      );

      setAllStaff(uniqueStaff);
    } catch (err) {
      console.error('Error fetching staff:', err);
      setAllStaff([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredStaff = allStaff.filter((s) => {
    switch (selectedFilter) {
      case 'head_coaches':
        return s.role === 'head_coach';
      case 'all_coaches':
        return s.role === 'head_coach' || s.role === 'assistant_coach';
      case 'managers':
        return s.role === 'team_manager';
      default:
        return true;
    }
  });

  const filterOptions: { key: StaffFilter; label: string }[] = [
    { key: 'all', label: 'All Staff' },
    { key: 'head_coaches', label: 'Head Coaches Only' },
    { key: 'all_coaches', label: 'All Coaches' },
    { key: 'managers', label: 'Team Managers Only' },
  ];

  const handleStartConversation = async () => {
    if (filteredStaff.length === 0) return;

    setCreating(true);
    try {
      const memberIds = filteredStaff.map((s) => s.user_id);

      if (user?.id && !memberIds.includes(user.id)) {
        memberIds.push(user.id);
      }

      const channelName =
        selectedFilter === 'all'
          ? 'All Staff'
          : selectedFilter === 'head_coaches'
            ? 'Head Coaches'
            : selectedFilter === 'all_coaches'
              ? 'Coaches'
              : 'Team Managers';

      const { data: channel, error: channelError } = await supabase
        .from('comm_channels')
        .insert({
          name: channelName,
          channel_type: 'group_dm',
          club_id: clubId,
          created_by: user?.id,
        })
        .select()
        .single();

      if (channelError) throw channelError;

      const memberInserts = memberIds.map((userId) => ({
        channel_id: channel.id,
        user_id: userId,
      }));

      await supabase.from('comm_channel_members').insert(memberInserts);

      navigation.replace('TeamChatRoom' as never, {
        channelId: channel.id,
        channelName,
        channelType: 'group_dm',
      } as never);
    } catch (err) {
      console.error('Error creating staff channel:', err);
    } finally {
      setCreating(false);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'head_coach':
        return 'Head Coach';
      case 'assistant_coach':
        return 'Asst. Coach';
      case 'team_manager':
        return 'Manager';
      default:
        return role;
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getFilterCount = (key: StaffFilter) => {
    switch (key) {
      case 'head_coaches':
        return allStaff.filter((s) => s.role === 'head_coach').length;
      case 'all_coaches':
        return allStaff.filter(
          (s) => s.role === 'head_coach' || s.role === 'assistant_coach'
        ).length;
      case 'managers':
        return allStaff.filter((s) => s.role === 'team_manager').length;
      default:
        return allStaff.length;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Staff Message</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Select recipients:</Text>
        {filterOptions.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.filterOption,
              selectedFilter === option.key && styles.filterOptionSelected,
            ]}
            onPress={() => setSelectedFilter(option.key)}
          >
            <View style={styles.radioOuter}>
              {selectedFilter === option.key && (
                <View style={styles.radioInner} />
              )}
            </View>
            <Text
              style={[
                styles.filterOptionText,
                selectedFilter === option.key && styles.filterOptionTextSelected,
              ]}
            >
              {option.label}
            </Text>
            <Text style={styles.filterCount}>{getFilterCount(option.key)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.previewSection}>
        <Text style={styles.previewTitle}>
          Preview: {filteredStaff.length} staff members
        </Text>
        <FlatList
          data={filteredStaff.slice(0, 10)}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.staffRow}>
              <View style={styles.staffAvatar}>
                <Text style={styles.staffInitials}>
                  {getInitials(item.full_name)}
                </Text>
              </View>
              <View style={styles.staffInfo}>
                <Text style={styles.staffName}>{item.full_name}</Text>
                <Text style={styles.staffRole}>{getRoleLabel(item.role)}</Text>
              </View>
            </View>
          )}
          ListFooterComponent={
            filteredStaff.length > 10 ? (
              <Text style={styles.moreText}>
                +{filteredStaff.length - 10} more
              </Text>
            ) : null
          }
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.startButton,
            (filteredStaff.length === 0 || creating) && styles.startButtonDisabled,
          ]}
          onPress={handleStartConversation}
          disabled={filteredStaff.length === 0 || creating}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.startButtonText}>
              Start Conversation ({filteredStaff.length})
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  filterSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  filterLabel: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 12,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    marginBottom: 8,
  },
  filterOptionSelected: {
    backgroundColor: '#2d2a5e',
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#8b5cf6',
  },
  filterOptionText: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
  filterOptionTextSelected: {
    fontWeight: '600',
  },
  filterCount: {
    fontSize: 14,
    color: '#64748b',
  },
  previewSection: {
    flex: 1,
    padding: 16,
  },
  previewTitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 12,
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  staffAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffInitials: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  staffInfo: {
    marginLeft: 12,
  },
  staffName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  staffRole: {
    fontSize: 12,
    color: '#64748b',
  },
  moreText: {
    fontSize: 13,
    color: '#64748b',
    paddingVertical: 8,
    paddingLeft: 48,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  startButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButtonDisabled: {
    backgroundColor: '#475569',
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
