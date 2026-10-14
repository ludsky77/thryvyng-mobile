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
import {
  fetchChannelMemberLabels,
  fetchChatProfileNames,
  CHAT_FALLBACK_NAME,
} from '../lib/memberNames';
import {
  canLeaveChannel,
  isDefaultClubChannel,
  type LeavableChannel,
  leaveChannel,
  leaveConfirmTitle,
  LEAVE_ACTION_LABEL,
  LEAVE_CONFIRM_BODY,
  LEAVE_FAILED_MESSAGE,
  LEAVE_REFUSED_MESSAGE,
} from '../lib/channelLeave';
import {
  forgetChatChannel,
  requestChatUnreadRefresh,
} from '../contexts/ChatUnreadContext';
import { logError } from '../utils/logError';

interface Member {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  role:
    | 'head_coach'
    | 'assistant_coach'
    | 'team_manager'
    | 'staff'
    | 'parent'
    | 'player'
    | 'member';
  role_label: string;
}

interface ChannelRecord {
  id: string;
  name?: string | null;
  channel_type?: string | null;
  is_default?: boolean | null;
  is_direct_message?: boolean | null;
  dm_participant_1?: string | null;
  dm_participant_2?: string | null;
  created_by?: string | null;
}

/** Every role that belongs under the "Staff" section header. */
const STAFF_ROLES: Member['role'][] = [
  'head_coach',
  'assistant_coach',
  'team_manager',
  'staff',
];

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
  const [isLeaving, setIsLeaving] = useState(false);
  const [pollsCount, setPollsCount] = useState(0);
  const [filesCount, setFilesCount] = useState(0);
  const [linksCount, setLinksCount] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  // Counted separately from the list: club-announcements shows a count and NO
  // list, so the count cannot be `members.length`.
  const [memberCount, setMemberCount] = useState(0);
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

    // Existence check, not a row fetch: a user can hold several team_staff
    // rows on one team (e.g. Head Coach + Team Manager), and maybeSingle()
    // errors on 2+ rows -- which silently stripped staff UI from exactly the
    // most senior staff.
    const { count, error } = await supabase
      .from('team_staff')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('user_id', user.id);

    if (error) {
      if (__DEV__) console.warn('[ChatInfo] staff check failed:', error);
      setIsStaffInTeam(false);
      return;
    }

    setIsStaffInTeam((count ?? 0) > 0);
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

      // `channel_type` and `name` come from the row on purpose: the route
      // param `channelType` is undefined on a push-opened room and 'direct'
      // from a DM, so the leave gate cannot be built on it (see channelLeave).
      const { data: channelData } = await supabase
        .from('comm_channels')
        .select(
          'name, channel_type, allow_member_text, is_default, is_direct_message, dm_participant_1, dm_participant_2, created_by'
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

      await fetchMembers(channelData);
    } catch (err) {
      console.error('Error fetching chat info:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async (channelRow?: LeavableChannel | null) => {
    if (!channelId) return;

    const { data: memberRows } = await supabase
      .from('comm_channel_members')
      .select('user_id')
      .eq('channel_id', channelId);

    if (!memberRows?.length) {
      setMembers([]);
      setMemberCount(0);
      return;
    }

    const userIds = memberRows.map((m: any) => m.user_id);
    setMemberCount(userIds.length);

    // Club-announcements shows a count, not a roster, so stop here: resolving
    // names and labels for a whole club is work nothing would render. The row
    // is passed in because `channel` state is not readable synchronously here.
    if (isDefaultClubChannel(channelRow ?? channel)) {
      setMembers([]);
      return;
    }

    // Names come from the CHANNEL-gated RPC, not the team-gated one. The
    // team-gated resolver had no team id to work with inside a club channel
    // (comm_channels.team_id is NULL there), returned an empty map, and every
    // row rendered as 'Unknown'. get_chat_profiles is gated on sharing a
    // channel with the viewer and carries the S1 name ladder, which ends at
    // 'Thryvyng member' rather than NULL -- and never at an email address.
    //
    // Roles come from the channel-gated label RPC. They cannot be derived
    // here: `team_staff` is readable only by that team's own staff and
    // `players` is team-scoped, so a parent viewer read zero rows from both
    // and EVERY member fell through to a hard-coded 'Parent' default.
    const [profileMap, labelMap] = await Promise.all([
      fetchChatProfileNames(userIds),
      fetchChannelMemberLabels(channelId),
    ]);

    // Granular staff titles (Head Coach / Asst. Coach / Team Manager) only
    // when the viewer is allowed to read them. When the read comes back empty
    // the label RPC's 'staff' still shows, as plain "Staff" -- a less precise
    // truth, never a wrong one.
    let staffMap = new Map<string, string>();

    if (teamId) {
      const { data: staffData } = await supabase
        .from('team_staff')
        .select('user_id, staff_role')
        .eq('team_id', teamId);

      staffMap = new Map(staffData?.map((s: any) => [s.user_id, s.staff_role]) || []);
    }

    const membersList: Member[] = userIds.map((userId) => {
      const resolved = profileMap.get(userId);
      const label = labelMap.get(userId);
      const staffRole = staffMap.get(userId);

      let role: Member['role'] = 'member';
      let role_label = 'Member';

      if (staffRole === 'head_coach') {
        role = 'head_coach';
        role_label = 'Head Coach';
      } else if (staffRole === 'assistant_coach') {
        role = 'assistant_coach';
        role_label = 'Asst. Coach';
      } else if (staffRole === 'team_manager') {
        role = 'team_manager';
        role_label = 'Team Manager';
      } else if (label?.kind === 'staff') {
        role = 'staff';
        role_label = 'Staff';
      } else if (label?.kind === 'player') {
        role = 'player';
        role_label = 'Player';
      } else if (label?.kind === 'parent') {
        role = 'parent';
        // Only a parent carries a child suffix, same wording as GroupInfo.
        role_label = label.childNames ? `Parent of ${label.childNames}` : 'Parent';
      }

      return {
        id: userId,
        user_id: userId,
        full_name: resolved?.name || CHAT_FALLBACK_NAME,
        avatar_url: resolved?.avatar ?? null,
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

  /**
   * Group chats and non-default team / club channels only. A default team or
   * club chat and a 1-on-1 DM show no Leave control at all -- the rule itself
   * lives in src/lib/channelLeave.ts and is shared with GroupInfoScreen.
   */
  const canLeave = useMemo(() => canLeaveChannel(channel), [channel]);

  /**
   * Club-announcements hides its roster: it carries the whole club, so a list
   * of hundreds of names is noise, and a club-wide roster is not this screen's
   * job. Identified by the ROW -- channel_type 'club' AND is_default -- never
   * by the name, so coaches-lounge and every other channel keep their list.
   */
  const hideMemberList = useMemo(
    () => isDefaultClubChannel(channel),
    [channel]
  );

  const sections = useMemo(() => {
    if (hideMemberList) return [];

    if (sortBy === 'alpha') {
      return [
        {
          title: `All Members (${memberCount})`,
          data: [...members].sort((a, b) => a.full_name.localeCompare(b.full_name)),
        },
      ];
    }

    const staff = members.filter((m) => STAFF_ROLES.includes(m.role));
    const parents = members.filter((m) => m.role === 'parent');
    const players = members.filter((m) => m.role === 'player');
    const others = members.filter(
      (m) =>
        !STAFF_ROLES.includes(m.role) &&
        m.role !== 'parent' &&
        m.role !== 'player'
    );

    return [
      { title: `Staff (${staff.length})`, data: staff },
      { title: `Parents (${parents.length})`, data: parents },
      { title: `Players (${players.length})`, data: players },
      { title: `Members (${others.length})`, data: others },
    ].filter((s) => s.data.length > 0);
  }, [members, memberCount, sortBy, hideMemberList]);

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

  const performLeave = async () => {
    if (!channelId || !user?.id || isLeaving) return;
    setIsLeaving(true);
    try {
      const result = await leaveChannel(channelId, user.id);

      if (result.status === 'refused') {
        // The DB said no. Change nothing locally -- dropping the row here
        // would hide a chat the user is still a member of. Worth recording:
        // a refusal here means this gate and the DB rule disagree.
        logError('ChatInfo.leaveChannel', 'refused', { channelId });
        Alert.alert('Error', LEAVE_REFUSED_MESSAGE);
        return;
      }

      if (result.status === 'error') {
        logError('ChatInfo.leaveChannel', result.error, { channelId });
        Alert.alert('Error', LEAVE_FAILED_MESSAGE);
        return;
      }

      // Membership is gone: drop the row now, then let the next read confirm.
      forgetChatChannel(channelId);
      requestChatUnreadRefresh();
      navigation.navigate('Conversations' as never);
    } finally {
      setIsLeaving(false);
    }
  };

  const handleLeavePress = () => {
    if (isLeaving) return;

    Alert.alert(
      leaveConfirmTitle(channel?.name || channelName),
      LEAVE_CONFIRM_BODY,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: performLeave },
      ]
    );
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
                • {memberCount} members
              </Text>
            </View>

            <View style={styles.quickAccessRow}>
              <TouchableOpacity style={styles.quickTile} onPress={handlePollsPress}>
                <Ionicons name="stats-chart" size={24} color="#8b5cf6" />
                <Text style={styles.quickTileCount}>{pollsCount}</Text>
                <Text style={styles.quickTileLabel}>Polls</Text>
              </TouchableOpacity>

              {/* Files and Links tiles are hidden: they advertised real counts
                  but navigated to placeholder stubs ("Files list coming soon").
                  The counts are still fetched and the handlers still exist --
                  restore these two tiles when the screens are built. */}
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

            {hideMemberList ? (
              /* Club-announcements: the count, in place of the roster. The
                 member rows and the sort control are both ABSENT -- there is
                 no list here to sort. */
              <View style={styles.membersHeader}>
                <Text style={styles.membersTitle}>
                  {memberCount} {memberCount === 1 ? 'member' : 'members'}
                </Text>
              </View>
            ) : (
              <View style={styles.membersHeader}>
                <Text style={styles.membersTitle}>Members ({memberCount})</Text>
                <TouchableOpacity
                  style={styles.sortButton}
                  onPress={() => setSortBy(sortBy === 'role' ? 'alpha' : 'role')}
                >
                  <Feather name="filter" size={16} color="#8b5cf6" />
                  <Text style={styles.sortText}>
                    {sortBy === 'role' ? 'By Role' : 'A-Z'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          canArchive || canLeave ? (
            <View style={styles.archiveSection}>
              {canLeave && (
                <TouchableOpacity
                  style={[
                    styles.archiveButton,
                    isLeaving && styles.archiveButtonDisabled,
                  ]}
                  onPress={handleLeavePress}
                  disabled={isLeaving}
                  activeOpacity={0.7}
                >
                  <Feather name="log-out" size={20} color="#ef4444" />
                  <Text style={styles.archiveButtonText}>
                    {isLeaving ? 'Leaving...' : LEAVE_ACTION_LABEL}
                  </Text>
                </TouchableOpacity>
              )}

              {canArchive && (
                <TouchableOpacity
                  style={[
                    styles.archiveButton,
                    canLeave && styles.archiveButtonStacked,
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
              )}
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
  /** Only applied when Leave sits above Archive, so neither moves alone. */
  archiveButtonStacked: {
    marginTop: 12,
  },
  archiveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
});
