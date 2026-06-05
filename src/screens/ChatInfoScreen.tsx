import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  SectionList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Member {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  role: 'head_coach' | 'assistant_coach' | 'team_manager' | 'parent' | 'player' | 'member';
  role_label: string;
}

interface ChannelRecord {
  id: string;
  is_default?: boolean | null;
  is_direct_message?: boolean | null;
  dm_participant_1?: string | null;
  dm_participant_2?: string | null;
  created_by?: string | null;
}

function mapArchiveError(code: string): string {
  switch (code) {
    case 'not_authenticated':
      return 'Please sign in again';
    case 'channel_not_found':
      return 'This chat no longer exists';
    case 'already_archived':
      return 'This chat is already archived';
    case 'default_channel_protected':
      return 'Default team chats cannot be archived';
    case 'permission_denied':
      return "You don't have permission to archive this chat";
    default:
      return code;
  }
}

export default function ChatInfoScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { channelId, channelName, teamId, channelType } = (route.params as any) || {};
  const { user, roles, currentRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<ChannelRecord | null>(null);
  const [myMembershipRole, setMyMembershipRole] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [pollsCount, setPollsCount] = useState(0);
  const [filesCount, setFilesCount] = useState(0);
  const [linksCount, setLinksCount] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [staffOnlyMessaging, setStaffOnlyMessaging] = useState(false);
  const [isStaffInTeam, setIsStaffInTeam] = useState(false);
  const [sortBy, setSortBy] = useState<'role' | 'alpha'>('role');

  useEffect(() => {
    if (channelId) {
      fetchChatInfo();
      checkStaffStatus();
    } else {
      setLoading(false);
    }
  }, [channelId, teamId, user?.id]);

  const checkStaffStatus = async () => {
    if (!teamId || !user?.id) return;

    const { data } = await supabase
      .from('team_staff')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .maybeSingle();

    setIsStaffInTeam(!!data);
  };

  const fetchChatInfo = async () => {
    if (!channelId) return;
    setLoading(true);
    try {
      const [pollsRes, filesRes, linksRes] = await Promise.all([
        supabase
          .from('comm_polls')
          .select('id', { count: 'exact', head: true })
          .eq('channel_id', channelId),
        supabase
          .from('comm_messages')
          .select('id', { count: 'exact', head: true })
          .eq('channel_id', channelId)
          .not('attachment_url', 'is', null),
        supabase
          .from('comm_messages')
          .select('id', { count: 'exact', head: true })
          .eq('channel_id', channelId)
          .ilike('content', '%http%'),
      ]);

      setPollsCount(pollsRes.count ?? 0);
      setFilesCount(filesRes.count ?? 0);
      setLinksCount(linksRes.count ?? 0);

      const { data: channelData } = await supabase
        .from('comm_channels')
        .select(
          'allow_member_text, is_default, is_direct_message, dm_participant_1, dm_participant_2, created_by'
        )
        .eq('id', channelId)
        .single();

      setStaffOnlyMessaging(channelData?.allow_member_text === false);
      if (channelData) {
        setChannel({ id: channelId, ...channelData });
      }

      const { data: memberData } = await supabase
        .from('comm_channel_members')
        .select('is_muted, role')
        .eq('channel_id', channelId)
        .eq('user_id', user?.id)
        .maybeSingle();

      setIsMuted(memberData?.is_muted ?? false);
      setMyMembershipRole(memberData?.role ?? null);

      await fetchMembers();
    } catch (err) {
      console.error('Error fetching chat info:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    if (!channelId) return;

    const { data: memberRows } = await supabase
      .from('comm_channel_members')
      .select('user_id')
      .eq('channel_id', channelId);

    if (!memberRows?.length) {
      setMembers([]);
      return;
    }

    const userIds = memberRows.map((m: any) => m.user_id);

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    let staffMap = new Map<string, string>();
    let playerUserIds = new Set<string>();

    if (teamId) {
      const { data: staffData } = await supabase
        .from('team_staff')
        .select('user_id, staff_role')
        .eq('team_id', teamId);

      staffMap = new Map(staffData?.map((s: any) => [s.user_id, s.staff_role]) || []);

      const { data: playersData } = await supabase
        .from('players')
        .select('user_id')
        .eq('team_id', teamId)
        .not('user_id', 'is', null);

      playerUserIds = new Set(playersData?.map((p: any) => p.user_id) || []);
    }

    const membersList: Member[] = userIds.map((userId) => {
      const profile = profileMap.get(userId);
      const staffRole = staffMap.get(userId);
      const isPlayer = playerUserIds.has(userId);

      let role: Member['role'] = 'member';
      let role_label = 'Member';

      if (staffRole) {
        role = staffRole as Member['role'];
        role_label =
          staffRole === 'head_coach'
            ? 'Head Coach'
            : staffRole === 'assistant_coach'
              ? 'Asst. Coach'
              : 'Team Manager';
      } else if (isPlayer) {
        role = 'player';
        role_label = 'Player';
      } else if (channelType === 'group_dm') {
        role = 'member';
        role_label = 'Member';
      } else {
        role = 'parent';
        role_label = 'Parent';
      }

      return {
        id: userId,
        user_id: userId,
        full_name: profile?.full_name || 'Unknown',
        avatar_url: profile?.avatar_url ?? null,
        role,
        role_label,
      };
    });

    setMembers(membersList);
  };

  const toggleMute = async (value: boolean) => {
    setIsMuted(value);
    await supabase
      .from('comm_channel_members')
      .update({ is_muted: value })
      .eq('channel_id', channelId)
      .eq('user_id', user?.id);
  };

  const toggleStaffOnly = async (value: boolean) => {
    setStaffOnlyMessaging(value);
    await supabase
      .from('comm_channels')
      .update({ allow_member_text: !value })
      .eq('id', channelId);
  };

  const isPlatformAdmin = useMemo(
    () =>
      currentRole?.role === 'platform_admin' ||
      (roles || []).some((r: any) => r.role === 'platform_admin'),
    [currentRole, roles]
  );

  const canArchive = useMemo(() => {
    if (!channel || !user?.id) return false;
    if (channel.is_default === true) return false;

    if (channel.is_direct_message === true) {
      return (
        user.id === channel.dm_participant_1 || user.id === channel.dm_participant_2
      );
    }

    return (
      channel.created_by === user.id ||
      myMembershipRole === 'admin' ||
      isPlatformAdmin
    );
  }, [channel, user?.id, myMembershipRole, isPlatformAdmin]);

  const sections = useMemo(() => {
    if (sortBy === 'alpha') {
      return [
        {
          title: `All Members (${members.length})`,
          data: [...members].sort((a, b) => a.full_name.localeCompare(b.full_name)),
        },
      ];
    }

    const staff = members.filter((m) =>
      ['head_coach', 'assistant_coach', 'team_manager'].includes(m.role)
    );
    const parents = members.filter((m) => m.role === 'parent');
    const players = members.filter((m) => m.role === 'player');
    const others = members.filter(
      (m) => !['head_coach', 'assistant_coach', 'team_manager', 'parent', 'player'].includes(m.role)
    );

    return [
      { title: `Staff (${staff.length})`, data: staff },
      { title: `Parents (${parents.length})`, data: parents },
      { title: `Players (${players.length})`, data: players },
      { title: `Members (${others.length})`, data: others },
    ].filter((s) => s.data.length > 0);
  }, [members, sortBy]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const renderMember = ({ item }: { item: Member }) => (
    <View style={styles.memberRow}>
      <View style={styles.memberAvatar}>
        <Text style={styles.memberInitials}>{getInitials(item.full_name)}</Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{item.full_name}</Text>
        {(sortBy === 'alpha' || item.role !== 'member') && (
          <Text style={styles.memberRole}>{item.role_label}</Text>
        )}
      </View>
    </View>
  );

  const handlePollsPress = () => {
    navigation.navigate('ChannelPolls' as never, { channelId } as never);
  };

  const handleFilesPress = () => {
    navigation.navigate('ChannelFiles' as never, { channelId } as never);
  };

  const handleLinksPress = () => {
    navigation.navigate('ChannelLinks' as never, { channelId } as never);
  };

  const performArchive = async () => {
    if (!channelId || isArchiving) return;
    setIsArchiving(true);
    try {
      const { data, error } = await supabase.rpc('archive_channel', {
        p_channel_id: channelId,
      });

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        Alert.alert('Error', mapArchiveError(result?.error || 'Unknown error'));
        return;
      }

      Alert.alert('Chat archived', 'This chat has been archived.', [
        {
          text: 'OK',
          onPress: () => navigation.navigate('Conversations' as never),
        },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to archive chat');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleArchivePress = () => {
    if (isArchiving) return;

    const isDm = channel?.is_direct_message === true;
    Alert.alert(
      'Archive this chat?',
      isDm
        ? 'This chat will be removed from both your chat lists. If either of you starts a new DM with the same person, the conversation will reappear with full history.'
        : 'All members will lose access to this chat. History stays preserved. To chat with the same people, create a new group.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: performArchive },
      ]
    );
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
        <Text style={styles.headerTitle}>Chat Info</Text>
        <View style={{ width: 24 }} />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
        )}
        ListHeaderComponent={
          <>
            <View style={styles.channelInfo}>
              <View style={styles.channelAvatar}>
                <Feather name="hash" size={28} color="#8b5cf6" />
              </View>
              <Text style={styles.channelName}>{channelName || 'Chat'}</Text>
              <Text style={styles.channelMeta}>
                {channelType === 'team'
                  ? 'Team Chat'
                  : channelType === 'group_dm'
                    ? 'Group Chat'
                    : 'Channel'}{' '}
                • {members.length} members
              </Text>
            </View>

            <View style={styles.quickAccessRow}>
              <TouchableOpacity style={styles.quickTile} onPress={handlePollsPress}>
                <Ionicons name="stats-chart" size={24} color="#8b5cf6" />
                <Text style={styles.quickTileCount}>{pollsCount}</Text>
                <Text style={styles.quickTileLabel}>Polls</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.quickTile} onPress={handleFilesPress}>
                <Feather name="file" size={24} color="#8b5cf6" />
                <Text style={styles.quickTileCount}>{filesCount}</Text>
                <Text style={styles.quickTileLabel}>Files</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.quickTile} onPress={handleLinksPress}>
                <Feather name="link" size={24} color="#8b5cf6" />
                <Text style={styles.quickTileCount}>{linksCount}</Text>
                <Text style={styles.quickTileLabel}>Links</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Notifications</Text>
              <View style={styles.settingRow}>
                <View style={styles.settingLeft}>
                  <Feather name="bell-off" size={20} color="#94a3b8" />
                  <Text style={styles.settingLabel}>Mute Conversation</Text>
                </View>
                <Switch
                  value={isMuted}
                  onValueChange={toggleMute}
                  trackColor={{ false: '#475569', true: '#8b5cf6' }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {isStaffInTeam && (
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>Staff Controls</Text>
                <View style={styles.settingRow}>
                  <View style={styles.settingLeft}>
                    <Feather name="shield" size={20} color="#94a3b8" />
                    <Text style={styles.settingLabel}>Staff-only messaging</Text>
                  </View>
                  <Switch
                    value={staffOnlyMessaging}
                    onValueChange={toggleStaffOnly}
                    trackColor={{ false: '#475569', true: '#8b5cf6' }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            )}

            <View style={styles.membersHeader}>
              <Text style={styles.membersTitle}>Members ({members.length})</Text>
              <TouchableOpacity
                style={styles.sortButton}
                onPress={() => setSortBy(sortBy === 'role' ? 'alpha' : 'role')}
              >
                <Feather name="filter" size={16} color="#8b5cf6" />
                <Text style={styles.sortText}>{sortBy === 'role' ? 'By Role' : 'A-Z'}</Text>
              </TouchableOpacity>
            </View>
          </>
        }
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          canArchive ? (
            <View style={styles.archiveSection}>
              <TouchableOpacity
                style={[
                  styles.archiveButton,
                  isArchiving && styles.archiveButtonDisabled,
                ]}
                onPress={handleArchivePress}
                disabled={isArchiving}
                activeOpacity={0.7}
              >
                <Feather name="archive" size={20} color="#ef4444" />
                <Text style={styles.archiveButtonText}>
                  {isArchiving ? 'Archiving...' : 'Archive chat'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
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
  listContent: {
    paddingBottom: 40,
  },
  channelInfo: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  channelAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  channelName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  channelMeta: {
    fontSize: 14,
    color: '#64748b',
  },
  quickAccessRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  quickTile: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    minWidth: 90,
  },
  quickTileCount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginTop: 8,
  },
  quickTileLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  settingsSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  settingsSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingLabel: {
    fontSize: 15,
    color: '#fff',
  },
  membersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  membersTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sortText: {
    fontSize: 13,
    color: '#8b5cf6',
  },
  sectionHeader: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitials: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  memberInfo: {
    marginLeft: 12,
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  memberRole: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  archiveSection: {
    marginTop: 24,
    paddingTop: 24,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  archiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  archiveButtonDisabled: {
    opacity: 0.5,
  },
  archiveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
});
