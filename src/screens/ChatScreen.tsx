import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SectionList,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useUserTeams } from '../hooks/useUserTeams';
import { supabase } from '../lib/supabase';
import { formatRoleLabel, getRolePriority, getTimeAgo } from '../lib/chatHelpers';

interface EnrichedConversation {
  id: string;
  displayType: 'dm' | 'group' | 'team';
  displayName: string;
  displaySubtitle: string;
  displayAvatar: string | null;
  displayInitial: string;
  lastMessage: string | null;
  lastMessageTime: string | null;
  unreadCount: number;
  channel_type?: string;
  team_id?: string | null;
  name?: string;
}

function getChannelColor(conversation: EnrichedConversation): string {
  if (conversation.displayType === 'dm' || conversation.channel_type === 'dm') {
    return '#3B82F6';
  }
  if (conversation.channel_type === 'group_dm') {
    return '#8B5CF6';
  }
  if (
    conversation.channel_type === 'club' ||
    conversation.channel_type === 'broadcast'
  ) {
    return '#F59E0B';
  }
  return '#10B981';
}

function ConversationItem({
  conversation,
  onPress,
}: {
  conversation: EnrichedConversation;
  onPress: () => void;
}) {
  const borderColor = getChannelColor(conversation);

  return (
    <TouchableOpacity
      style={[styles.conversationCard, { borderLeftColor: borderColor }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.conversationIcon}>
        {conversation.displayAvatar ? (
          <Image
            source={{ uri: conversation.displayAvatar }}
            style={styles.avatar}
          />
        ) : (
          <Text style={styles.chatIcon}>{conversation.displayInitial}</Text>
        )}
      </View>

      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={styles.conversationName} numberOfLines={1}>
            {conversation.displayName}
          </Text>
          <Text style={styles.conversationTime}>
            {getTimeAgo(conversation.lastMessageTime)}
          </Text>
        </View>

        {conversation.displaySubtitle ? (
          <Text
            style={[styles.conversationSubtitle, { color: borderColor }]}
            numberOfLines={1}
          >
            {conversation.displaySubtitle}
          </Text>
        ) : null}

        {conversation.lastMessage ? (
          <Text style={styles.lastMessage} numberOfLines={1}>
            {conversation.lastMessage}
          </Text>
        ) : null}
      </View>

      <View style={styles.conversationRight}>
        {conversation.unreadCount > 0 ? (
          <View
            style={[styles.unreadBadge, { backgroundColor: borderColor }]}
          >
            <Text style={styles.unreadText}>
              {conversation.unreadCount > 99
                ? '99+'
                : conversation.unreadCount}
            </Text>
          </View>
        ) : null}
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

type NewChatStep = 'choose' | 'dm' | 'group' | 'team' | 'club';

interface ProfileResult {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role?: string;
  existingChannelId?: string;
}

interface TeamChannelOption {
  id: string;
  name: string;
  channel_type?: string;
  team_id?: string | null;
  team?: { id: string; name: string } | null;
}

export default function ChatScreen({ navigation, route }: any) {
  const { user } = useAuth();
  const { teams } = useUserTeams();

  const [conversations, setConversations] = useState<EnrichedConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'recent' | 'byTeam'>('recent');
  const [teamSearchQuery, setTeamSearchQuery] = useState('');

  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatStep, setNewChatStep] = useState<NewChatStep>('choose');
  const [isClubAdmin, setIsClubAdmin] = useState(false);

  const [dmSearchQuery, setDmSearchQuery] = useState('');
  const [dmSearchResults, setDmSearchResults] = useState<ProfileResult[]>([]);
  const [existingDMs, setExistingDMs] = useState<Map<string, string>>(new Map());

  const [groupName, setGroupName] = useState('');
  const [selectedGroupUsers, setSelectedGroupUsers] = useState<ProfileResult[]>([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [groupSearchResults, setGroupSearchResults] = useState<ProfileResult[]>([]);
  const [existingGroupMatch, setExistingGroupMatch] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [teamChannels, setTeamChannels] = useState<TeamChannelOption[]>([]);
  const [teamChannelSearch, setTeamChannelSearch] = useState('');

  const [clubWideMode, setClubWideMode] = useState<'all' | 'filter'>('all');
  const [filterType, setFilterType] = useState<'age' | 'gender' | 'team' | null>(null);
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [clubTeams, setClubTeams] = useState<any[]>([]);

  const fetchConversations = useCallback(async () => {
    if (!user?.id) {
      setConversations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: memberships } = await supabase
        .from('comm_channel_members')
        .select('channel_id')
        .eq('user_id', user.id);

      const channelIds = memberships?.map((m: any) => m.channel_id) || [];
      if (channelIds.length === 0) {
        setConversations([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const { data: channels, error: channelsError } = await supabase
        .from('comm_channels')
        .select('*')
        .in('id', channelIds)
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

      if (channelsError || !channels?.length) {
        setConversations([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const dmChannels = channels.filter((c: any) => c.is_direct_message);
      const otherUserIds = dmChannels
        .map((c: any) =>
          c.dm_participant_1 === user.id ? c.dm_participant_2 : c.dm_participant_1
        )
        .filter(Boolean);

      let profileMap = new Map<string, { id: string; full_name: string | null; avatar_url: string | null }>();
      let roleMap = new Map<string, string>();

      if (otherUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', otherUserIds);
        (profiles || []).forEach((p: any) => profileMap.set(p.id, p));

        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', otherUserIds);
        (userRoles || []).forEach((r: any) => {
          const existing = roleMap.get(r.user_id);
          if (
            !existing ||
            getRolePriority(r.role) > getRolePriority(existing)
          ) {
            roleMap.set(r.user_id, r.role);
          }
        });

        const { data: staffRoles } = await supabase
          .from('team_staff')
          .select('user_id, staff_role')
          .in('user_id', otherUserIds);
        (staffRoles || []).forEach((r: any) => {
          const existing = roleMap.get(r.user_id);
          if (
            !existing ||
            getRolePriority(r.staff_role) > getRolePriority(existing)
          ) {
            roleMap.set(r.user_id, r.staff_role);
          }
        });
      }

      const { data: lastMessages } = await supabase
        .from('comm_messages')
        .select('channel_id, content, created_at')
        .in('channel_id', channelIds)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      const lastMessageMap = new Map<string, { content: string; created_at: string }>();
      (lastMessages || []).forEach((msg: any) => {
        if (!lastMessageMap.has(msg.channel_id)) {
          lastMessageMap.set(msg.channel_id, {
            content: msg.content,
            created_at: msg.created_at,
          });
        }
      });

      const groupChannels = channels.filter((c: any) => c.channel_type === 'group_dm');
      let memberCountMap = new Map<string, number>();
      if (groupChannels.length > 0) {
        const { data: memberRows } = await supabase
          .from('comm_channel_members')
          .select('channel_id')
          .in('channel_id', groupChannels.map((c: any) => c.id));
        (memberRows || []).forEach((m: any) => {
          memberCountMap.set(
            m.channel_id,
            (memberCountMap.get(m.channel_id) || 0) + 1
          );
        });
      }

      const lastReadMap = new Map<string, string>();
      const { data: memberData } = await supabase
        .from('comm_channel_members')
        .select('channel_id, last_read_at')
        .eq('user_id', user.id)
        .in('channel_id', channelIds);
      (memberData || []).forEach((m: any) => {
        if (m.last_read_at) lastReadMap.set(m.channel_id, m.last_read_at);
      });

      const enriched: EnrichedConversation[] = channels.map((channel: any) => {
        const lastMsg = lastMessageMap.get(channel.id);
        const lastRead = lastReadMap.get(channel.id);
        let unreadCount = 0;
        if (lastMsg) {
          if (!lastRead) unreadCount = 1;
          else if (new Date(lastMsg.created_at) > new Date(lastRead)) unreadCount = 1;
        }

        if (channel.is_direct_message) {
          const otherUserId =
            channel.dm_participant_1 === user.id
              ? channel.dm_participant_2
              : channel.dm_participant_1;
          const otherPerson = profileMap.get(otherUserId);
          const role = roleMap.get(otherUserId);
          return {
            id: channel.id,
            displayType: 'dm',
            displayName: otherPerson?.full_name || 'Unknown User',
            displaySubtitle: formatRoleLabel(role),
            displayAvatar: otherPerson?.avatar_url || null,
            displayInitial: otherPerson?.full_name?.charAt(0)?.toUpperCase() || '?',
            lastMessage: lastMsg?.content || null,
            lastMessageTime: lastMsg?.created_at || channel.created_at,
            unreadCount,
            channel_type: channel.channel_type,
            name: channel.name,
          };
        }
        if (channel.channel_type === 'group_dm') {
          return {
            id: channel.id,
            displayType: 'group',
            displayName: channel.name || 'Group Chat',
            displaySubtitle: `${memberCountMap.get(channel.id) || 0} members`,
            displayAvatar: null,
            displayInitial: '👥',
            lastMessage: lastMsg?.content || null,
            lastMessageTime: lastMsg?.created_at || channel.created_at,
            unreadCount,
            channel_type: channel.channel_type,
            name: channel.name,
          };
        }
        const team = teams.find((t) => t.id === channel.team_id);
        return {
          id: channel.id,
          displayType: 'team',
          displayName: channel.name || 'Team Chat',
          displaySubtitle: team?.name || '',
          displayAvatar: null,
          displayInitial: '#',
          lastMessage: lastMsg?.content || null,
          lastMessageTime: lastMsg?.created_at || channel.created_at,
          unreadCount,
          channel_type: channel.channel_type,
          team_id: channel.team_id,
          name: channel.name,
        };
      });

      enriched.sort((a, b) => {
        const tA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
        const tB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
        return tB - tA;
      });

      setConversations(enriched);
    } catch (err) {
      console.error('Error fetching conversations:', err);
      setConversations([]);
    }
    setLoading(false);
    setRefreshing(false);
  }, [user?.id, teams]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (route.params?.openNewModal) {
      setShowNewChatModal(true);
      setNewChatStep('choose');
      navigation.setParams({ openNewModal: undefined });
    }
  }, [route.params?.openNewModal, navigation]);

  useEffect(() => {
    const checkClubAdmin = async () => {
      if (!user?.id) return;
      try {
        const { data: clubStaff } = await supabase
          .from('club_staff')
          .select('id, club_id')
          .eq('user_id', user.id);
        if (clubStaff && clubStaff.length > 0) {
          setIsClubAdmin(true);
          return;
        }
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', user.id)
          .eq('role', 'club_admin')
          .limit(1);
        if (userRoles && userRoles.length > 0) {
          setIsClubAdmin(true);
          return;
        }
        const { data: clubAdmin } = await supabase
          .from('clubs')
          .select('id')
          .eq('admin_id', user.id)
          .limit(1);
        if (clubAdmin && clubAdmin.length > 0) {
          setIsClubAdmin(true);
          return;
        }
      } catch (_) {
        // Tables may not exist
      }
      setIsClubAdmin(false);
    };
    checkClubAdmin();
  }, [user?.id]);

  const fetchExistingDMs = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('comm_channels')
      .select('id, dm_participant_1, dm_participant_2')
      .eq('is_direct_message', true)
      .or(`dm_participant_1.eq.${user.id},dm_participant_2.eq.${user.id}`);
    const map = new Map<string, string>();
    (data || []).forEach((dm: any) => {
      const other =
        dm.dm_participant_1 === user.id
          ? dm.dm_participant_2
          : dm.dm_participant_1;
      map.set(other, dm.id);
    });
    setExistingDMs(map);
  }, [user?.id]);

  const searchUsersForDM = useCallback(
    async (query: string) => {
      if (!query.trim() || !user?.id) {
        setDmSearchResults([]);
        return;
      }
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .neq('id', user.id)
        .ilike('full_name', `%${query}%`)
        .limit(20);
      const userIds = (profiles || []).map((p: any) => p.id);
      let roleMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', userIds);
        (roles || []).forEach((r: any) => {
          const cur = roleMap.get(r.user_id);
          if (
            !cur ||
            getRolePriority(r.role) > getRolePriority(cur)
          ) {
            roleMap.set(r.user_id, r.role);
          }
        });
        const { data: staffRoles } = await supabase
          .from('team_staff')
          .select('user_id, staff_role')
          .in('user_id', userIds);
        (staffRoles || []).forEach((r: any) => {
          const cur = roleMap.get(r.user_id);
          if (
            !cur ||
            getRolePriority(r.staff_role) > getRolePriority(cur)
          ) {
            roleMap.set(r.user_id, r.staff_role);
          }
        });
      }
      const enriched = (profiles || []).map((p: any) => ({
        ...p,
        role: roleMap.get(p.id),
        existingChannelId: existingDMs.get(p.id),
      }));
      setDmSearchResults(enriched);
    },
    [user?.id, existingDMs]
  );

  const handleSelectDMUser = useCallback(
    async (selectedUser: ProfileResult) => {
      if (!user?.id) return;
      if (selectedUser.existingChannelId) {
        setShowNewChatModal(false);
        setNewChatStep('choose');
        navigation.navigate('DMChat', {
          channelId: selectedUser.existingChannelId,
        });
        return;
      }
      const { data: newChannel, error } = await supabase
        .from('comm_channels')
        .insert({
          name: 'Direct Message',
          channel_type: 'dm',
          is_direct_message: true,
          dm_participant_1: user.id,
          dm_participant_2: selectedUser.id,
          created_by: user.id,
        })
        .select()
        .single();
      if (error || !newChannel) {
        Alert.alert('Error', 'Could not create conversation');
        return;
      }
      await supabase.from('comm_channel_members').insert([
        { channel_id: newChannel.id, user_id: user.id },
        { channel_id: newChannel.id, user_id: selectedUser.id },
      ]);
      setShowNewChatModal(false);
      setNewChatStep('choose');
      navigation.navigate('DMChat', { channelId: newChannel.id });
    },
    [user?.id, navigation]
  );

  const searchUsersForGroup = useCallback(
    async (query: string) => {
      if (!query.trim() || !user?.id) {
        setGroupSearchResults([]);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .neq('id', user.id)
        .ilike('full_name', `%${query}%`)
        .limit(20);
      const filtered =
        (data || []).filter(
          (p: any) => !selectedGroupUsers.some((s) => s.id === p.id)
        ) as ProfileResult[];
      setGroupSearchResults(filtered);
    },
    [user?.id, selectedGroupUsers]
  );

  const checkForExistingGroup = useCallback(
    async (users: ProfileResult[]) => {
      if (users.length < 2 || !user?.id) {
        setExistingGroupMatch(null);
        return;
      }
      const memberIds = [user.id, ...users.map((u) => u.id)].sort();
      const { data: memberships } = await supabase
        .from('comm_channel_members')
        .select('channel_id')
        .eq('user_id', user.id);
      const channelIds = (memberships || []).map((m: any) => m.channel_id);
      if (channelIds.length === 0) {
        setExistingGroupMatch(null);
        return;
      }
      const { data: groups } = await supabase
        .from('comm_channels')
        .select('id, name')
        .in('id', channelIds)
        .eq('channel_type', 'group_dm');
      for (const g of groups || []) {
        const { data: members } = await supabase
          .from('comm_channel_members')
          .select('user_id')
          .eq('channel_id', g.id);
        const groupIds = (members || []).map((m: any) => m.user_id).sort();
        if (
          groupIds.length === memberIds.length &&
          groupIds.every((id, i) => id === memberIds[i])
        ) {
          setExistingGroupMatch({ id: g.id, name: g.name || 'Group' });
          return;
        }
      }
      setExistingGroupMatch(null);
    },
    [user?.id]
  );

  const addUserToGroup = useCallback((selectedUser: ProfileResult) => {
    setSelectedGroupUsers((prev) => {
      const next = [...prev, selectedUser];
      return next;
    });
    setGroupSearchQuery('');
    setGroupSearchResults([]);
  }, []);

  useEffect(() => {
    checkForExistingGroup(selectedGroupUsers);
  }, [selectedGroupUsers, checkForExistingGroup]);

  const removeUserFromGroup = useCallback((userId: string) => {
    setSelectedGroupUsers((prev) => prev.filter((u) => u.id !== userId));
  }, []);

  const createGroup = useCallback(async () => {
    if (!groupName.trim() || selectedGroupUsers.length < 1 || !user?.id) {
      Alert.alert('Error', 'Enter a group name and add at least one person');
      return;
    }
    const { data: newChannel, error } = await supabase
      .from('comm_channels')
      .insert({
        name: groupName.trim(),
        channel_type: 'group_dm',
        is_direct_message: false,
        created_by: user.id,
      })
      .select()
      .single();
    if (error || !newChannel) {
      Alert.alert('Error', 'Could not create group');
      return;
    }
    const memberInserts = [
      user.id,
      ...selectedGroupUsers.map((u) => u.id),
    ].map((uid) => ({ channel_id: newChannel.id, user_id: uid }));
    await supabase.from('comm_channel_members').insert(memberInserts);
    setShowNewChatModal(false);
    setNewChatStep('choose');
    setGroupName('');
    setSelectedGroupUsers([]);
    setExistingGroupMatch(null);
    navigation.navigate('TeamChatRoom', {
      channelId: newChannel.id,
      channelName: newChannel.name,
      teamName: undefined,
      channelType: 'group_dm',
    });
  }, [user?.id, groupName, selectedGroupUsers, navigation]);

  const fetchTeamChannels = useCallback(async () => {
    if (!user?.id) return;
    const { data: memberships } = await supabase
      .from('comm_channel_members')
      .select('channel_id')
      .eq('user_id', user.id);
    const channelIds = (memberships || []).map((m: any) => m.channel_id);
    if (channelIds.length === 0) {
      setTeamChannels([]);
      return;
    }
    const { data } = await supabase
      .from('comm_channels')
      .select('id, name, channel_type, team_id')
      .in('id', channelIds)
      .in('channel_type', ['team', 'broadcast', 'club'])
      .order('name');
    const withTeams: TeamChannelOption[] = (data || []).map((c: any) => ({
      ...c,
      team: null,
    }));
    const teamIds = [
      ...new Set(
        (data || []).map((c: any) => c.team_id).filter(Boolean)
      ),
    ] as string[];
    if (teamIds.length > 0) {
      const { data: teamsData } = await supabase
        .from('teams')
        .select('id, name')
        .in('id', teamIds);
      const teamMap = new Map(
        (teamsData || []).map((t: any) => [t.id, t])
      );
      withTeams.forEach((ch) => {
        if (ch.team_id) ch.team = teamMap.get(ch.team_id) || null;
      });
    }
    setTeamChannels(withTeams);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('chat-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comm_messages' },
        () => fetchConversations()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchConversations]);

  const closeModal = useCallback(() => {
    setShowNewChatModal(false);
    setNewChatStep('choose');
    setDmSearchQuery('');
    setDmSearchResults([]);
    setGroupName('');
    setSelectedGroupUsers([]);
    setGroupSearchQuery('');
    setGroupSearchResults([]);
    setExistingGroupMatch(null);
    setTeamChannelSearch('');
    setClubWideMode('all');
    setFilterType(null);
    setSelectedAgeGroups([]);
    setSelectedGenders([]);
    setSelectedTeamIds([]);
    Keyboard.dismiss();
  }, []);

  useEffect(() => {
    if (showNewChatModal) {
      fetchExistingDMs();
    }
  }, [showNewChatModal, fetchExistingDMs]);

  useEffect(() => {
    if (showNewChatModal && newChatStep === 'team') {
      fetchTeamChannels();
    }
  }, [showNewChatModal, newChatStep, fetchTeamChannels]);

  const fetchClubTeams = useCallback(async () => {
    if (!user?.id) return;
    const { data: clubStaff } = await supabase
      .from('club_staff')
      .select('club_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!clubStaff?.club_id) {
      setClubTeams([]);
      return;
    }
    const { data: teams } = await supabase
      .from('teams')
      .select('id, name, age_group, gender')
      .eq('club_id', clubStaff.club_id)
      .order('name');
    setClubTeams(teams || []);
  }, [user?.id]);

  useEffect(() => {
    if (showNewChatModal && newChatStep === 'club') {
      fetchClubTeams();
    }
  }, [showNewChatModal, newChatStep, fetchClubTeams]);

  const filteredTeamChannels = teamChannels.filter(
    (ch) =>
      (ch.name || '')
        .toLowerCase()
        .includes(teamChannelSearch.toLowerCase()) ||
      (ch.team?.name || '')
        .toLowerCase()
        .includes(teamChannelSearch.toLowerCase())
  );

  const normalizeGender = (gender: string | null): string | null => {
    if (!gender) return null;
    const lower = gender.toLowerCase().trim();
    if (['male', 'boys', 'boy', 'm'].includes(lower)) return 'male';
    if (['female', 'girls', 'girl', 'f'].includes(lower)) return 'female';
    if (['coed', 'co-ed', 'mixed'].includes(lower)) return 'coed';
    return null;
  };

  const getGenderLabel = (normalized: string): string => {
    if (normalized === 'male') return 'Boys';
    if (normalized === 'female') return 'Girls';
    if (normalized === 'coed') return 'Coed';
    return normalized;
  };

  const ageGroups = [...new Set(clubTeams.map((t: any) => t.age_group).filter(Boolean))].sort();
  const genders = [
    ...new Set(
      clubTeams
        .map((t: any) => normalizeGender(t.gender))
        .filter((g): g is string => g != null)
    ),
  ] as string[];

  const matchingTeams =
    selectedAgeGroups.length > 0 || selectedGenders.length > 0
      ? clubTeams.filter(
          (t: any) =>
            (selectedAgeGroups.length === 0 || selectedAgeGroups.includes(t.age_group)) &&
            (selectedGenders.length === 0 ||
              selectedGenders.includes(normalizeGender(t.gender) ?? ''))
        )
      : clubTeams;

  const canSendClubWide = () => {
    if (clubWideMode === 'all') return clubTeams.length > 0;
    return selectedTeamIds.length > 0;
  };

  const getSelectedTeamCount = () => {
    if (clubWideMode === 'all') return clubTeams.length;
    return selectedTeamIds.length;
  };

  const sendClubWideMessage = async () => {
    const targetTeamIds =
      clubWideMode === 'all'
        ? clubTeams.map((t: any) => t.id)
        : selectedTeamIds;
    const { data: clubChannel } = await supabase
      .from('comm_channels')
      .select('id')
      .eq('channel_type', 'broadcast')
      .limit(1)
      .maybeSingle();
    if (clubChannel) {
      closeModal();
      navigation.navigate('TeamChatRoom', {
        channelId: clubChannel.id,
        channelName: 'Club-Wide',
        teamName: undefined,
        channelType: 'broadcast',
        broadcastToTeams: targetTeamIds,
      });
    } else {
      Alert.alert('Info', 'Club broadcast channel not found. Contact admin.');
    }
  };

  const conversationsByTeam = conversations
    .filter((c) => c.displayType === 'team' || c.channel_type === 'group_dm')
    .reduce<Record<string, EnrichedConversation[]>>((acc, c) => {
      const key =
        c.channel_type === 'group_dm' ? 'Groups' : (c.displaySubtitle || 'Other');
      if (!acc[key]) acc[key] = [];
      acc[key].push(c);
      return acc;
    }, {});
  const teamSections = Object.entries(conversationsByTeam)
    .filter(([teamName]) =>
      teamName.toLowerCase().includes(teamSearchQuery.toLowerCase())
    )
    .map(([title, data]) => ({ title, data }));

  const handleRefresh = () => {
    setRefreshing(true);
    fetchConversations();
  };

  const handleConversationPress = (conversation: EnrichedConversation) => {
    if (conversation.displayType === 'dm') {
      navigation.navigate('DMChat', { channelId: conversation.id });
    } else {
      navigation.navigate('TeamChatRoom', {
        channelId: conversation.id,
        channelName: conversation.displayName,
        teamName: conversation.displaySubtitle || undefined,
        channelType: conversation.channel_type,
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading conversations...</Text>
      </View>
    );
  }

  const renderModalContent = () => {
    if (newChatStep === 'choose') {
      return (
        <View style={styles.modalInner}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choose Message Type</Text>
            <TouchableOpacity onPress={closeModal}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={true}
          >
            <TouchableOpacity
              style={styles.typeOption}
              onPress={() => {
                setNewChatStep('dm');
                setDmSearchQuery('');
                setDmSearchResults([]);
              }}
            >
              <View style={[styles.typeIconContainer, { backgroundColor: '#3B82F620' }]}>
                <Text style={styles.typeIcon}>👤</Text>
              </View>
              <View style={styles.typeContent}>
                <Text style={styles.typeTitle}>Direct Message</Text>
                <Text style={styles.typeDescription}>Message one person privately</Text>
              </View>
              <Text style={styles.typeArrow}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.typeOption}
              onPress={() => {
                setNewChatStep('group');
                setGroupName('');
                setSelectedGroupUsers([]);
                setExistingGroupMatch(null);
              }}
            >
              <View style={[styles.typeIconContainer, { backgroundColor: '#8B5CF620' }]}>
                <Text style={styles.typeIcon}>👥</Text>
              </View>
              <View style={styles.typeContent}>
                <Text style={styles.typeTitle}>Group Message</Text>
                <Text style={styles.typeDescription}>Create a named group with selected people</Text>
              </View>
              <Text style={styles.typeArrow}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.typeOption}
              onPress={() => setNewChatStep('team')}
            >
              <View style={[styles.typeIconContainer, { backgroundColor: '#10B98120' }]}>
                <Text style={styles.typeIcon}>📢</Text>
              </View>
              <View style={styles.typeContent}>
                <Text style={styles.typeTitle}>Team Channel</Text>
                <Text style={styles.typeDescription}>Open an existing team channel</Text>
              </View>
              <Text style={styles.typeArrow}>→</Text>
            </TouchableOpacity>
            {isClubAdmin && (
              <>
                <View style={styles.divider} />
                <Text style={styles.adminLabel}>👑 Club Admin</Text>
                <TouchableOpacity
                  style={styles.typeOption}
                  onPress={() => {
                    fetchClubTeams();
                    setNewChatStep('club');
                    setClubWideMode('all');
                    setFilterType(null);
                    setSelectedAgeGroups([]);
                    setSelectedGenders([]);
                    setSelectedTeamIds([]);
                  }}
                >
                  <View style={[styles.typeIconContainer, { backgroundColor: '#F59E0B20' }]}>
                    <Text style={styles.typeIcon}>📣</Text>
                  </View>
                  <View style={styles.typeContent}>
                    <Text style={styles.typeTitle}>Club-Wide Message</Text>
                    <Text style={styles.typeDescription}>Send to all members of your club</Text>
                  </View>
                  <Text style={styles.typeArrow}>→</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      );
    }

    if (newChatStep === 'dm') {
      return (
        <View style={styles.modalInner}>
          <View style={styles.stepHeader}>
            <TouchableOpacity onPress={() => setNewChatStep('choose')}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.stepTitle}>New Direct Message</Text>
            <View style={{ width: 50 }} />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name..."
            placeholderTextColor="#6B7280"
            value={dmSearchQuery}
            onChangeText={(text) => {
              setDmSearchQuery(text);
              searchUsersForDM(text);
            }}
            autoFocus={false}
            returnKeyType="search"
          />
          <FlatList
            data={dmSearchResults}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={styles.modalFlatList}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.searchResultItem}
                onPress={() => handleSelectDMUser(item)}
              >
                <View style={[styles.resultAvatar, { backgroundColor: '#3B82F6' }]}>
                  <Text style={styles.resultInitial}>
                    {item.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </Text>
                </View>
                <View style={styles.resultContent}>
                  <Text style={styles.resultName}>{item.full_name}</Text>
                  {item.role ? (
                    <Text style={styles.resultRole}>{formatRoleLabel(item.role)}</Text>
                  ) : null}
                </View>
                {item.existingChannelId ? (
                  <Text style={styles.existingBadge}>Open Chat →</Text>
                ) : null}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              dmSearchQuery.length > 0 ? (
                <Text style={styles.emptyText}>No users found</Text>
              ) : (
                <Text style={styles.hintText}>Type a name to search</Text>
              )
            }
          />
        </View>
      );
    }

    if (newChatStep === 'group') {
      return (
        <View style={styles.modalInner}>
          <View style={styles.stepHeader}>
            <TouchableOpacity onPress={() => setNewChatStep('choose')}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.stepTitle}>New Group</Text>
            <View style={{ width: 50 }} />
          </View>
          <Text style={styles.inputLabel}>Group Name</Text>
          <TextInput
            style={[styles.searchInput, { borderColor: '#8B5CF6', borderWidth: 1 }]}
            placeholder="e.g., Defenders, Parents, Coaches"
            placeholderTextColor="#6B7280"
            value={groupName}
            onChangeText={setGroupName}
          />
          {selectedGroupUsers.length > 0 && (
            <View style={styles.chipsSection}>
              <Text style={styles.chipsLabel}>
                Selected ({selectedGroupUsers.length}):
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipsScrollView}
                contentContainerStyle={styles.chipsScrollContent}
              >
                {selectedGroupUsers.map((u) => (
                  <View key={u.id} style={styles.chipCompact}>
                    <Text style={styles.chipTextCompact} numberOfLines={1}>
                      {u.full_name?.split(' ')[0]}
                    </Text>
                    <TouchableOpacity onPress={() => removeUserFromGroup(u.id)}>
                      <Text style={styles.chipRemoveCompact}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
          {existingGroupMatch && (
            <View style={styles.existingGroupWarning}>
              <Text style={styles.warningText}>
                ℹ️ A group with these members exists: "{existingGroupMatch.name}"
              </Text>
              <View style={styles.warningButtons}>
                <TouchableOpacity
                  style={styles.warningButtonPrimary}
                  onPress={() => {
                    closeModal();
                    navigation.navigate('TeamChatRoom', {
                      channelId: existingGroupMatch.id,
                      channelName: existingGroupMatch.name,
                      teamName: undefined,
                      channelType: 'group_dm',
                    });
                  }}
                >
                  <Text style={styles.warningButtonText}>Open Existing</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.warningButtonSecondary}
                  onPress={() => setExistingGroupMatch(null)}
                >
                  <Text style={styles.warningButtonTextSecondary}>Create New Anyway</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <Text style={styles.inputLabel}>Add People</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name..."
            placeholderTextColor="#6B7280"
            value={groupSearchQuery}
            onChangeText={(text) => {
              setGroupSearchQuery(text);
              searchUsersForGroup(text);
            }}
          />
          <FlatList
            data={groupSearchResults}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={{ minHeight: 120, maxHeight: 180 }}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              groupSearchQuery.length > 0 ? (
                <Text style={styles.emptyText}>No results</Text>
              ) : (
                <Text style={styles.hintText}>Search to add people</Text>
              )
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.searchResultItem}
                onPress={() => addUserToGroup(item)}
              >
                <View style={[styles.resultAvatar, { backgroundColor: '#8B5CF6' }]}>
                  <Text style={styles.resultInitial}>
                    {item.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </Text>
                </View>
                <Text style={styles.resultName}>{item.full_name}</Text>
                <Text style={styles.addIcon}>+</Text>
              </TouchableOpacity>
            )}
          />
          {selectedGroupUsers.length >= 1 && groupName.trim() && !existingGroupMatch && (
            <TouchableOpacity style={styles.createButton} onPress={createGroup}>
              <Text style={styles.createButtonText}>
                Create Group ({selectedGroupUsers.length + 1} members)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (newChatStep === 'club') {
      const toggleGender = (g: string) => {
        setSelectedGenders((prev) =>
          prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
        );
      };
      const toggleAge = (age: string) => {
        setSelectedAgeGroups((prev) =>
          prev.includes(age) ? prev.filter((a) => a !== age) : [...prev, age]
        );
      };
      const selectAllTeams = () => {
        const matchingIds = matchingTeams.map((t: any) => t.id);
        const allSelected = matchingIds.every((id: string) =>
          selectedTeamIds.includes(id)
        );
        if (allSelected) {
          setSelectedTeamIds((prev) =>
            prev.filter((id) => !matchingIds.includes(id))
          );
        } else {
          setSelectedTeamIds((prev) => [
            ...new Set([...prev, ...matchingIds]),
          ]);
        }
      };
      const toggleTeam = (id: string) => {
        setSelectedTeamIds((prev) =>
          prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
        );
      };

      return (
        <View style={styles.fullScreenContainer}>
          <View style={styles.clubHeader}>
            <TouchableOpacity
              onPress={() => setNewChatStep('choose')}
              style={styles.backButton}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.clubTitle}>Club-Wide Message</Text>
          </View>

          <FlatList
            data={clubWideMode === 'filter' ? matchingTeams : []}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={styles.clubListContent}
            ListHeaderComponent={() => (
              <View>
                <Text style={styles.sectionLabel}>Send to:</Text>

                <TouchableOpacity
                  style={[
                    styles.optionCard,
                    clubWideMode === 'all' && styles.optionCardSelected,
                  ]}
                  onPress={() => {
                    setClubWideMode('all');
                    setSelectedTeamIds(clubTeams.map((t: any) => t.id));
                  }}
                >
                  <View style={styles.optionContent}>
                    <Text style={styles.optionTitle}>All Club Members</Text>
                    <Text style={styles.optionSubtitle}>
                      {clubTeams.length} teams, all members
                    </Text>
                  </View>
                  {clubWideMode === 'all' && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.optionCard,
                    clubWideMode === 'filter' && styles.optionCardSelected,
                  ]}
                  onPress={() => {
                    setClubWideMode('filter');
                    setSelectedTeamIds([]);
                  }}
                >
                  <View style={styles.optionContent}>
                    <Text style={styles.optionTitle}>Filter Recipients</Text>
                    <Text style={styles.optionSubtitle}>
                      By age group, gender, or specific teams
                    </Text>
                  </View>
                  {clubWideMode === 'filter' && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>

                {clubWideMode === 'filter' && (
                  <View style={styles.filtersContainer}>
                    <Text style={styles.filterTitle}>GENDER</Text>
                    <View style={styles.chipRow}>
                      {['male', 'female', 'coed'].map((g) => (
                        <TouchableOpacity
                          key={g}
                          style={[
                            styles.chip,
                            selectedGenders.includes(g) && styles.chipSelected,
                          ]}
                          onPress={() => toggleGender(g)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              selectedGenders.includes(g) && styles.chipTextSelected,
                            ]}
                          >
                            {g === 'male' ? 'Boys' : g === 'female' ? 'Girls' : 'Coed'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.filterTitle}>AGE GROUP</Text>
                    <View style={styles.chipRow}>
                      {ageGroups.map((age: string) => (
                        <TouchableOpacity
                          key={age}
                          style={[
                            styles.chip,
                            selectedAgeGroups.includes(age) && styles.chipSelected,
                          ]}
                          onPress={() => toggleAge(age)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              selectedAgeGroups.includes(age) && styles.chipTextSelected,
                            ]}
                          >
                            {age}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={styles.teamsHeader}>
                      <Text style={styles.filterTitle}>
                        TEAMS ({matchingTeams.length})
                      </Text>
                      <TouchableOpacity onPress={selectAllTeams}>
                        <Text style={styles.clubSelectAllText}>
                          {matchingTeams.every((t: any) =>
                            selectedTeamIds.includes(t.id)
                          )
                            ? 'Deselect All'
                            : 'Select All'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
            renderItem={({ item: team }: { item: any }) => (
              <TouchableOpacity
                style={styles.teamRow}
                onPress={() => toggleTeam(team.id)}
              >
                <View
                  style={[
                    styles.clubCheckbox,
                    selectedTeamIds.includes(team.id) && styles.clubCheckboxSelected,
                  ]}
                >
                  {selectedTeamIds.includes(team.id) && (
                    <Text style={styles.clubCheckmark}>✓</Text>
                  )}
                </View>
                <View style={styles.teamInfo}>
                  <Text style={styles.teamName}>{team.name}</Text>
                  <Text style={styles.teamMeta}>
                    {team.age_group} •{' '}
                    {getGenderLabel(normalizeGender(team.gender) ?? '')}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={() =>
              clubWideMode === 'filter' ? (
                <Text style={styles.emptyText}>No teams match your filters</Text>
              ) : null
            }
          />

          <View style={styles.fixedBottom}>
            <TouchableOpacity
              style={[
                styles.sendButton,
                !canSendClubWide() && styles.sendButtonDisabled,
              ]}
              onPress={sendClubWideMessage}
              disabled={!canSendClubWide()}
            >
              <Text style={styles.sendButtonText}>
                {clubWideMode === 'all'
                  ? `Send to All (${clubTeams.length} teams)`
                  : `Send to ${getSelectedTeamCount()} teams`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (newChatStep === 'team') {
      return (
        <View style={styles.modalInner}>
          <View style={styles.stepHeader}>
            <TouchableOpacity onPress={() => setNewChatStep('choose')}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.stepTitle}>Select Team Channel</Text>
            <View style={{ width: 50 }} />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search teams..."
            placeholderTextColor="#6B7280"
            value={teamChannelSearch}
            onChangeText={setTeamChannelSearch}
          />
          <FlatList
            data={filteredTeamChannels}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={styles.modalFlatList}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.teamChannelItem}
                onPress={() => {
                  closeModal();
                  navigation.navigate('TeamChatRoom', {
                    channelId: item.id,
                    channelName: item.name,
                    teamName: item.team?.name || undefined,
                    channelType: item.channel_type,
                  });
                }}
              >
                <Text style={styles.hashIcon}>#</Text>
                <View style={styles.teamChannelContent}>
                  <Text style={styles.teamChannelName}>{item.name}</Text>
                  <Text style={styles.teamChannelTeam}>
                    {item.team?.name || 'Club Channel'}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No channels found</Text>
            }
          />
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conversations</Text>
        <TouchableOpacity
          style={styles.newButton}
          onPress={() => setShowNewChatModal(true)}
        >
          <Text style={styles.newButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'recent' && styles.tabActive]}
          onPress={() => setActiveTab('recent')}
        >
          <Text style={[styles.tabText, activeTab === 'recent' && styles.tabTextActive]}>
            Recent
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'byTeam' && styles.tabActive]}
          onPress={() => setActiveTab('byTeam')}
        >
          <Text style={[styles.tabText, activeTab === 'byTeam' && styles.tabTextActive]}>
            By Team
          </Text>
        </TouchableOpacity>
      </View>

      {conversations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyTitle}>No Conversations</Text>
          <Text style={styles.emptyText}>
            Tap "+ New" to start a direct message, group chat, or open a team channel.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => setShowNewChatModal(true)}
          >
            <Text style={styles.emptyButtonText}>Start a conversation</Text>
          </TouchableOpacity>
        </View>
      ) : activeTab === 'recent' ? (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConversationItem
              conversation={item}
              onPress={() => handleConversationPress(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#8b5cf6"
            />
          }
        />
      ) : (
        <SectionList
          sections={teamSections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search teams..."
                placeholderTextColor="#6B7280"
                value={teamSearchQuery}
                onChangeText={setTeamSearchQuery}
              />
            </View>
          }
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.teamSectionHeader}>
              <Text style={styles.teamSectionTitle}>{title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <ConversationItem
              conversation={item}
              onPress={() => handleConversationPress(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#8b5cf6"
            />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No conversations match your search</Text>
          }
        />
      )}

      <Modal
        visible={showNewChatModal}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <TouchableWithoutFeedback onPress={closeModal}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardAvoidingView}
                keyboardVerticalOffset={0}
              >
                <View style={styles.modalContent}>
                  {renderModalContent()}
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 16,
    paddingTop: 60,
    backgroundColor: '#1a1a2e',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  newButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  newButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 8,
    marginBottom: 16,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: '#8B5CF6',
  },
  tabText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#fff',
  },
  searchContainer: {
    marginHorizontal: 8,
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 15,
  },
  listContent: {
    paddingHorizontal: 8,
    paddingBottom: 100,
  },
  sectionHeader: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    paddingLeft: 4,
  },
  teamSectionHeader: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 10,
    marginTop: 8,
  },
  teamSectionTitle: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  conversationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  conversationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  chatIcon: {
    fontSize: 18,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  conversationContent: {
    flex: 1,
    minWidth: 0,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conversationName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  conversationTime: {
    color: '#6B7280',
    fontSize: 12,
  },
  conversationSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  lastMessage: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 4,
  },
  conversationRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginBottom: 4,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  chevron: {
    color: '#6B7280',
    fontSize: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
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
    color: '#6B7280',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#8B5CF6',
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  keyboardAvoidingView: {
    width: '100%',
    height: '95%',
    maxHeight: '95%',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    height: '95%',
    maxHeight: '95%',
  },
  modalInner: {
    flex: 1,
    padding: 20,
    paddingBottom: 0,
  },
  fixedBottomButton: {
    padding: 16,
    paddingBottom: 24,
    backgroundColor: '#1F2937',
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  modalClose: {
    color: '#9CA3AF',
    fontSize: 28,
    padding: 4,
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  typeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  typeIcon: {
    fontSize: 22,
  },
  typeContent: {
    flex: 1,
  },
  typeTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  typeDescription: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 2,
  },
  typeArrow: {
    color: '#6B7280',
    fontSize: 20,
  },
  divider: {
    height: 1,
    backgroundColor: '#374151',
    marginVertical: 16,
  },
  adminLabel: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backText: {
    color: '#8B5CF6',
    fontSize: 16,
  },
  stepTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  inputLabel: {
    color: '#9CA3AF',
    fontSize: 13,
    marginBottom: 8,
    marginTop: 12,
  },
  modalFlatList: {
    minHeight: 150,
    maxHeight: 250,
  },
  modalFlatListShort: {
    minHeight: 150,
    maxHeight: 200,
  },
  searchResultsList: {
    minHeight: 150,
    maxHeight: 300,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  resultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  resultInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultContent: {
    flex: 1,
  },
  resultName: {
    color: '#fff',
    fontSize: 15,
  },
  resultRole: {
    color: '#10B981',
    fontSize: 12,
    marginTop: 2,
  },
  existingBadge: {
    color: '#8B5CF6',
    fontSize: 12,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  chipsSection: {
    marginVertical: 8,
  },
  chipsLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 6,
  },
  chipsScrollView: {
    maxHeight: 40,
  },
  chipsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 20,
  },
  chipCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF620',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    maxWidth: 120,
  },
  chipTextCompact: {
    color: '#8B5CF6',
    fontSize: 13,
    maxWidth: 80,
  },
  chipRemoveCompact: {
    color: '#8B5CF6',
    marginLeft: 6,
    fontSize: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF620',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    color: '#8B5CF6',
    fontSize: 13,
    fontWeight: '500',
  },
  chipRemove: {
    color: '#8B5CF6',
    marginLeft: 8,
    fontSize: 14,
  },
  existingGroupWarning: {
    backgroundColor: '#F59E0B20',
    padding: 14,
    borderRadius: 10,
    marginVertical: 12,
  },
  warningText: {
    color: '#F59E0B',
    fontSize: 13,
    marginBottom: 10,
  },
  warningButtons: {
    flexDirection: 'row',
  },
  warningButtonPrimary: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 10,
  },
  warningButtonText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '600',
  },
  warningButtonSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  warningButtonTextSecondary: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  createButton: {
    backgroundColor: '#8B5CF6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  teamChannelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  hashIcon: {
    color: '#10B981',
    fontSize: 20,
    fontWeight: '700',
    marginRight: 12,
  },
  teamChannelContent: {
    flex: 1,
  },
  teamChannelName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  teamChannelTeam: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  hintText: {
    color: '#6B7280',
    textAlign: 'center',
    padding: 30,
  },
  addIcon: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: '600',
  },
  sectionLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 12,
    marginTop: 8,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardSelected: {
    borderColor: '#8B5CF6',
  },
  optionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  optionSubtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 2,
  },
  checkmark: {
    color: '#8B5CF6',
    fontSize: 20,
    fontWeight: '700',
  },
  filterSection: {
    flex: 1,
    marginTop: 16,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  clubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  backButton: {
    marginRight: 12,
  },
  backButtonText: {
    color: '#8B5CF6',
    fontSize: 16,
  },
  clubTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  clubListContent: {
    padding: 16,
    paddingBottom: 100,
  },
  filtersContainer: {
    marginTop: 16,
  },
  filterTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#374151',
    marginBottom: 8,
  },
  chipSelected: {
    backgroundColor: '#8B5CF6',
  },
  chipText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  teamsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  clubSelectAllText: {
    color: '#8B5CF6',
    fontSize: 14,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  clubCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#6B7280',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clubCheckboxSelected: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  clubCheckmark: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  teamMeta: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 24,
  },
  fixedBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 24,
    backgroundColor: '#1a1a2e',
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  filterLabel: {
    color: '#9CA3AF',
    fontSize: 13,
    marginBottom: 10,
  },
  filterRowLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterSectionTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 4,
    gap: 8,
  },
  ageChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  filterChipSelected: {
    backgroundColor: '#8B5CF620',
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  filterChipText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginLeft: 4,
  },
  filterChipTextSelected: {
    color: '#8B5CF6',
    fontWeight: '600',
  },
  filterDivider: {
    height: 1,
    backgroundColor: '#374151',
    marginVertical: 16,
  },
  matchingTeamsHeader: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterTabs: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  filterTabActive: {
    backgroundColor: '#8B5CF6',
  },
  filterTabText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  checkboxList: {
    marginTop: 8,
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  checkboxCheck: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  checkboxLabel: {
    color: '#fff',
    fontSize: 15,
    flex: 1,
  },
  checkboxCount: {
    color: '#6B7280',
    fontSize: 12,
  },
  selectAllButton: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  selectAllText: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '600',
  },
  sendButton: {
    backgroundColor: '#F59E0B',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  sendButtonDisabled: {
    backgroundColor: '#374151',
  },
  sendButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});
