import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useUserTeams } from '../hooks/useUserTeams';
import { supabase } from '../lib/supabase';
import { formatRoleLabel, getRolePriority, getTimeAgo } from '../lib/chatHelpers';
import { NotificationBell } from '../components/NotificationBell';
import { useFocusEffect } from '@react-navigation/native';
import { subscribeToMessageInserts } from '../lib/realtimeHub';

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
  /** Channel is muted for this user. Counted in the card badge, excluded from the tab total. */
  isMuted?: boolean;
  channel_type?: string;
  team_id?: string | null;
  team?: { id: string; name: string; color?: string } | null;
  name?: string;
}

function getChannelColor(conversation: EnrichedConversation): string {
  if (conversation.team?.color) {
    return conversation.team.color;
  }
  if (conversation.team_id) {
    return '#5B7BB5';
  }
  if (conversation.displayType === 'dm' || conversation.channel_type === 'dm') {
    return '#8B6BAD';
  }
  if (conversation.channel_type === 'group_dm') {
    return '#9B7BB5';
  }
  const name = (conversation.name || conversation.displayName || '').toLowerCase();
  if (
    name.includes('announcement') ||
    name.includes('club') ||
    conversation.channel_type === 'club' ||
    conversation.channel_type === 'broadcast'
  ) {
    return '#C4976D';
  }
  if (name.includes('coach') || name.includes('lounge')) {
    return '#7B6BAD';
  }
  if (name.includes('manager')) {
    return '#8B6BAD';
  }
  return '#8B6BAD';
}

function ConversationItem({
  conversation,
  onPress,
  muted = false,
}: {
  conversation: EnrichedConversation;
  onPress: () => void;
  muted?: boolean;
}) {
  const borderColor = getChannelColor(conversation);

  // Determine badge content based on type
  const renderBadge = () => {
    // DM: Show avatar or initials
    if (conversation.displayType === 'dm' || conversation.channel_type === 'dm') {
      if (conversation.displayAvatar) {
        return (
          <Image
            source={{ uri: conversation.displayAvatar }}
            style={styles.badgeAvatar}
          />
        );
      }
      // Generate initials from name (e.g., "Manuel Vega" → "MV")
      const nameParts = (conversation.displayName || '').split(' ');
      const initials = nameParts.length >= 2
        ? `${nameParts[0].charAt(0)}${nameParts[nameParts.length - 1].charAt(0)}`.toUpperCase()
        : (conversation.displayName || '?').charAt(0).toUpperCase();

      return (
        <View style={[styles.badgeCircle, { backgroundColor: borderColor }]}>
          <Text style={styles.badgeInitials}>{initials}</Text>
        </View>
      );
    }

    // Group: Show people icon
    if (conversation.channel_type === 'group_dm') {
      return (
        <View style={[styles.badgeCircle, { backgroundColor: '#9B7BB5' }]}>
          <Text style={styles.badgeEmoji}>👥</Text>
        </View>
      );
    }

    // Team: Show colored circle with team icon or first letter
    const teamColor = conversation.team?.color || borderColor;
    return (
      <View style={[styles.badgeCircle, { backgroundColor: teamColor }]}>
        <Text style={styles.badgeTeamIcon}>⚽</Text>
      </View>
    );
  };

  return (
    <TouchableOpacity
      style={[
        styles.conversationCard,
        { borderLeftColor: borderColor },
        muted && styles.conversationCardPast,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {muted && (
        <Feather
          name="archive"
          size={16}
          color="#888"
          style={styles.pastChannelPrefixIcon}
        />
      )}
      <View style={styles.conversationIcon}>
        {renderBadge()}
      </View>

      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text
            style={[
              styles.conversationName,
              muted && styles.conversationNamePast,
              conversation.unreadCount > 0 && styles.conversationNameUnread,
            ]}
            numberOfLines={1}
          >
            {conversation.displayName}
          </Text>
          {!muted && (
            <Text style={styles.conversationTime}>
              {getTimeAgo(conversation.lastMessageTime)}
            </Text>
          )}
        </View>

        {muted ? (
          <Text style={styles.archivedSubtitle} numberOfLines={1}>
            Archived
          </Text>
        ) : conversation.displaySubtitle ? (
          <Text
            style={[styles.conversationSubtitle, { color: borderColor }]}
            numberOfLines={1}
          >
            {conversation.displaySubtitle}
          </Text>
        ) : null}

        {conversation.lastMessage ? (
          <Text
            style={[
              styles.lastMessage,
              conversation.unreadCount > 0 && styles.lastMessageUnread,
            ]}
            numberOfLines={1}
          >
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
  const { teams, activeTeams, pastTeams, loading: teamsLoading } = useUserTeams();
  const allTeams = useMemo(() => [...activeTeams, ...pastTeams], [activeTeams, pastTeams]);

  const [conversations, setConversations] = useState<EnrichedConversation[]>([]);
  const [pastConversations, setPastConversations] = useState<EnrichedConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // First fetch has resolved (success or failure). Until it does we must not
  // claim the user has no conversations.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  // ensure_team_channel_membership is a one-time repair, not a per-fetch step.
  const membershipEnsuredRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'recent' | 'byTeam' | 'past'>('recent');
  const [teamSearchQuery, setTeamSearchQuery] = useState('');

  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatStep, setNewChatStep] = useState<NewChatStep>('choose');
  const [isClubAdmin, setIsClubAdmin] = useState(false);
  const [clubId, setClubId] = useState<string | null>(null);

  const [dmSearchQuery, setDmSearchQuery] = useState('');
  const [dmSearchResults, setDmSearchResults] = useState<ProfileResult[]>([]);
  const [isSearchingDm, setIsSearchingDm] = useState(false);
  const dmSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [existingDMs, setExistingDMs] = useState<Map<string, string>>(new Map());

  const [groupName, setGroupName] = useState('');
  const [selectedGroupUsers, setSelectedGroupUsers] = useState<ProfileResult[]>([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [groupSearchResults, setGroupSearchResults] = useState<ProfileResult[]>([]);
  const [isSearchingGroup, setIsSearchingGroup] = useState(false);
  const groupSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      setPastConversations([]);
      setLoading(false);
      setHasLoadedOnce(true);
      return;
    }
    // Wait for the teams hook: ensure_team_channel_membership must run before
    // get_my_conversations, or a freshly-added member's team channel is missing
    // from the very first result and the screen briefly claims "no conversations".
    if (teamsLoading) {
      setLoading(true);
      return;
    }
    setLoading(true);
    try {
      // One-time membership repair, in parallel, and only on the first load of
      // the session -- it used to run serially before every single refetch.
      if (!membershipEnsuredRef.current && activeTeams.length > 0) {
        membershipEnsuredRef.current = true;
        await Promise.all(
          activeTeams.map(async (team) => {
            try {
              await supabase.rpc('ensure_team_channel_membership', { p_team_id: team.id });
            } catch (err) {
              console.warn(`ensure_team_channel_membership failed for team ${team.id}:`, err);
            }
          })
        );
      }

      // One server-side call replaces the former 3 serial stages + 7-query
      // parallel batch + client-side joins. Unread counting, muting, archiving
      // and last-message resolution now all happen in the database.
      const { data, error } = await supabase.rpc('get_my_conversations');
      if (error) {
        if (__DEV__) {
          console.error('[ChatScreen] get_my_conversations failed:', error);
        }
        // Keep whatever is already on screen rather than blanking the list.
        return;
      }

      const activeTeamIds = new Set(activeTeams.map((t) => t.id));
      const pastTeamIds = new Set(pastTeams.map((t) => t.id));

      const toConversation = (row: any): EnrichedConversation => {
        const lastMessageTime = row.last_message_at ?? null;
        const unreadCount = row.unread_count ?? 0;
        const isMuted = row.is_muted === true;

        if (row.is_direct_message) {
          const otherName = row.other_user_name || 'Unknown User';
          return {
            id: row.channel_id,
            displayType: 'dm',
            displayName: otherName,
            displaySubtitle: '',
            displayAvatar: row.other_user_avatar || null,
            displayInitial: otherName.charAt(0)?.toUpperCase() || '?',
            lastMessage: row.last_message_content || null,
            lastMessageTime,
            unreadCount,
            isMuted,
            channel_type: row.channel_type,
            name: row.name,
          };
        }
        if (row.channel_type === 'group_dm') {
          return {
            id: row.channel_id,
            displayType: 'group',
            displayName: row.name || 'Group Chat',
            displaySubtitle: `${row.member_count || 0} members`,
            displayAvatar: null,
            displayInitial: '👥',
            lastMessage: row.last_message_content || null,
            lastMessageTime,
            unreadCount,
            isMuted,
            channel_type: row.channel_type,
            name: row.name,
          };
        }
        const team = allTeams.find((t) => t.id === row.team_id);
        return {
          id: row.channel_id,
          displayType: 'team',
          displayName: row.name || 'Team Chat',
          displaySubtitle: row.team_name || team?.name || '',
          displayAvatar: null,
          displayInitial: '#',
          lastMessage: row.last_message_content || null,
          lastMessageTime,
          unreadCount,
          isMuted,
          channel_type: row.channel_type,
          team_id: row.team_id,
          team: row.team_id
            ? { id: row.team_id, name: row.team_name || team?.name || '', color: team?.color }
            : null,
          name: row.name,
        };
      };

      // Archived channels never reach the list, matching the previous query.
      const rows = (data || []).filter((r: any) => r?.channel_id && !r.is_archived);
      const activeRows = rows.filter(
        (r: any) => !r.team_id || activeTeamIds.has(r.team_id)
      );
      const pastRows = rows.filter(
        (r: any) => r.team_id && pastTeamIds.has(r.team_id)
      );

      const sortByRecent = (list: EnrichedConversation[]) =>
        [...list].sort((a, b) => {
          const tA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
          const tB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
          return tB - tA;
        });

      setConversations(sortByRecent(activeRows.map(toConversation)));
      setPastConversations(sortByRecent(pastRows.map(toConversation)));
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
    setLoading(false);
    setRefreshing(false);
    setHasLoadedOnce(true);
  }, [user?.id, teamsLoading, activeTeams, pastTeams, allTeams]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Refresh unread counts when user returns to the conversation list
  useFocusEffect(
    useCallback(() => {
      fetchConversations();
    }, [fetchConversations])
  );

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
          setClubId(clubStaff[0].club_id);
          return;
        }
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('id, entity_id')
          .eq('user_id', user.id)
          .eq('role', 'club_admin')
          .limit(1);
        if (userRoles && userRoles.length > 0 && userRoles[0].entity_id) {
          setIsClubAdmin(true);
          setClubId(userRoles[0].entity_id);
          return;
        }
        const { data: clubAdmin } = await supabase
          .from('clubs')
          .select('id')
          .eq('admin_id', user.id)
          .limit(1);
        if (clubAdmin && clubAdmin.length > 0) {
          setIsClubAdmin(true);
          setClubId(clubAdmin[0].id);
          return;
        }
      } catch (_) {
        // Tables may not exist
      }
      setIsClubAdmin(false);
      setClubId(null);
    };
    checkClubAdmin();
  }, [user?.id]);

  const fetchExistingDMs = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('comm_channels')
      .select('id, dm_participant_1, dm_participant_2')
      .eq('is_direct_message', true)
      .eq('is_archived', false)
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
      // Membership-gated RPC: caps at 20, drops self, and only returns people
      // who share a team with the caller. Under 2 characters it returns nothing,
      // which lands here as an empty list -- the same as "no matches".
      const { data: contacts, error } = await supabase.rpc('search_chat_contacts', {
        p_query: query,
      });
      if (error) {
        if (__DEV__) {
          console.error('[ChatScreen] search_chat_contacts (DM) failed:', error);
        }
        setDmSearchResults([]);
        return;
      }
      const profiles = (contacts || []).map((c: any) => ({
        id: c.user_id,
        full_name: c.display_name ?? null,
        avatar_url: c.avatar_url ?? null,
      }));
      const userIds = profiles.map((p: any) => p.id);
      const roleMap = new Map<string, string>();
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
      const enriched = profiles.map((p: any) => ({
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

      const { data: channelId, error } = await supabase.rpc(
        'get_or_create_dm_channel',
        {
          user1_id: user.id,
          user2_id: selectedUser.id,
          p_team_id: null,
          p_club_id: null,
        }
      );

      if (error || !channelId) {
        console.error('get_or_create_dm_channel failed:', error);
        Alert.alert('Error', 'Could not open conversation');
        return;
      }

      setShowNewChatModal(false);
      setNewChatStep('choose');
      navigation.navigate('DMChat', { channelId });
    },
    [user?.id, navigation]
  );

  const searchUsersForGroup = useCallback(
    async (query: string) => {
      if (!query.trim() || !user?.id) {
        setGroupSearchResults([]);
        return;
      }
      // Same membership-gated RPC as the DM picker -- see searchUsersForDM.
      const { data: contacts, error } = await supabase.rpc('search_chat_contacts', {
        p_query: query,
      });
      if (error) {
        if (__DEV__) {
          console.error('[ChatScreen] search_chat_contacts (group) failed:', error);
        }
        setGroupSearchResults([]);
        return;
      }
      const filtered = (contacts || [])
        .map((c: any) => ({
          id: c.user_id,
          full_name: c.display_name ?? null,
          avatar_url: c.avatar_url ?? null,
        }))
        .filter(
          (p: any) => !selectedGroupUsers.some((s) => s.id === p.id)
        ) as ProfileResult[];
      setGroupSearchResults(filtered);
    },
    [user?.id, selectedGroupUsers]
  );

  // 300 ms debounce: the pickers fire on every keystroke, and each keystroke is
  // an RPC round trip. isSearching drives the spinner between keystroke and result.
  const DEBOUNCE_MS = 300;

  const queueDmSearch = useCallback(
    (text: string) => {
      if (dmSearchTimerRef.current) clearTimeout(dmSearchTimerRef.current);
      if (!text.trim()) {
        setIsSearchingDm(false);
        setDmSearchResults([]);
        return;
      }
      setIsSearchingDm(true);
      dmSearchTimerRef.current = setTimeout(async () => {
        try {
          await searchUsersForDM(text);
        } finally {
          setIsSearchingDm(false);
        }
      }, DEBOUNCE_MS);
    },
    [searchUsersForDM]
  );

  const queueGroupSearch = useCallback(
    (text: string) => {
      if (groupSearchTimerRef.current) clearTimeout(groupSearchTimerRef.current);
      if (!text.trim()) {
        setIsSearchingGroup(false);
        setGroupSearchResults([]);
        return;
      }
      setIsSearchingGroup(true);
      groupSearchTimerRef.current = setTimeout(async () => {
        try {
          await searchUsersForGroup(text);
        } finally {
          setIsSearchingGroup(false);
        }
      }, DEBOUNCE_MS);
    },
    [searchUsersForGroup]
  );

  useEffect(() => {
    return () => {
      if (dmSearchTimerRef.current) clearTimeout(dmSearchTimerRef.current);
      if (groupSearchTimerRef.current) clearTimeout(groupSearchTimerRef.current);
    };
  }, []);

  const checkForExistingGroup = useCallback(
    async (users: ProfileResult[]) => {
      if (users.length < 2 || !user?.id) {
        setExistingGroupMatch(null);
        return;
      }
      const memberIds = [user.id, ...users.map((u) => u.id)].sort();
      const { data: memberships, error: membershipsError } = await supabase
        .from('comm_channel_members')
        .select('channel_id')
        .eq('user_id', user.id);
      if (membershipsError && __DEV__) {
        console.warn('[ChatScreen] dup-check memberships read failed:', membershipsError);
      }
      const channelIds = (memberships || []).map((m: any) => m.channel_id);
      if (channelIds.length === 0) {
        setExistingGroupMatch(null);
        return;
      }
      const { data: groups, error: groupsError } = await supabase
        .from('comm_channels')
        .select('id, name')
        .in('id', channelIds)
        .eq('channel_type', 'group_dm');
      if (groupsError && __DEV__) {
        console.warn('[ChatScreen] dup-check groups read failed:', groupsError);
      }
      for (const g of groups || []) {
        const { data: members, error: membersError } = await supabase
          .from('comm_channel_members')
          .select('user_id')
          .eq('channel_id', g.id);
        if (membersError && __DEV__) {
          console.warn('[ChatScreen] dup-check members read failed:', membersError);
        }
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
    // The creator is NOT inserted here: the DB trigger already adds them as
    // admin, and UNIQUE (channel_id, user_id) would fail the whole batch.
    const memberInserts = selectedGroupUsers
      .filter((u) => u.id !== user.id)
      .map((u) => ({
        channel_id: newChannel.id,
        user_id: u.id,
        role: 'member',
      }));
    const { error: memberError } = await supabase
      .from('comm_channel_members')
      .insert(memberInserts);
    if (memberError) {
      // Roll the channel back so a failed create leaves no orphan behind.
      const { error: rollbackError } = await supabase
        .from('comm_channels')
        .delete()
        .eq('id', newChannel.id)
        .select('id');
      if (rollbackError && __DEV__) {
        console.warn('[ChatScreen] group rollback failed:', rollbackError);
      }
      Alert.alert('Error', 'Could not create group');
      return;
    }
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
    // Shared hub channel; status is logged once by the hub itself.
    const unsubscribe = subscribeToMessageInserts((row: any) => {
      if (__DEV__) {
        console.log('[ChatScreen] INSERT event', row?.id);
      }
      fetchConversations();
    });
    return () => {
      unsubscribe();
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

  // Block the screen only before the first fetch resolves. Refetches (focus,
  // realtime, pull-to-refresh) keep the existing rows on screen and show a thin
  // top bar instead of blanking the list.
  const hasRows = conversations.length > 0 || pastConversations.length > 0;
  const teamsLoaded = !teamsLoading;
  if ((loading || teamsLoading) && !hasRows && !hasLoadedOnce) {
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
                <TouchableOpacity
                  style={styles.typeOption}
                  onPress={() => {
                    if (clubId) {
                      closeModal();
                      navigation.navigate('StaffMessage', { clubId });
                    } else {
                      Alert.alert(
                        'Unable to Load',
                        'Club information could not be loaded. Please try again.'
                      );
                    }
                  }}
                >
                  <View style={[styles.typeIconContainer, { backgroundColor: '#f59e0b' }]}>
                    <Feather name="users" size={24} color="#fff" />
                  </View>
                  <View style={styles.typeContent}>
                    <Text style={styles.typeTitle}>Staff Message</Text>
                    <Text style={styles.typeDescription}>Message coaches & managers</Text>
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
              queueDmSearch(text);
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
              isSearchingDm ? (
                <View style={styles.searchSpinner}>
                  <ActivityIndicator size="small" color="#8b5cf6" />
                </View>
              ) : dmSearchQuery.trim().length >= 2 ? (
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
              queueGroupSearch(text);
            }}
          />
          <FlatList
            data={groupSearchResults}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={{ minHeight: 120, maxHeight: 180 }}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              isSearchingGroup ? (
                <View style={styles.searchSpinner}>
                  <ActivityIndicator size="small" color="#8b5cf6" />
                </View>
              ) : groupSearchQuery.trim().length >= 2 ? (
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <NotificationBell />
          <TouchableOpacity
            style={styles.newButton}
            onPress={() => setShowNewChatModal(true)}
          >
            <Text style={styles.newButtonText}>+ New</Text>
          </TouchableOpacity>
        </View>
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
        <TouchableOpacity
          style={[styles.tab, styles.tabPast, activeTab === 'past' && styles.tabActive]}
          onPress={() => setActiveTab('past')}
        >
          <Text style={[styles.tabText, activeTab === 'past' && styles.tabTextActive]}>
            Past
          </Text>
        </TouchableOpacity>
      </View>

      {loading && hasRows && !refreshing ? (
        <View style={styles.refreshBar}>
          <ActivityIndicator size="small" color="#8b5cf6" />
        </View>
      ) : null}

      {teamsLoaded && hasLoadedOnce && !hasRows ? (
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
      ) : activeTab === 'past' ? (
        pastConversations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📁</Text>
            <Text style={styles.emptyTitle}>No past team chats</Text>
          </View>
        ) : (
          <FlatList
            data={pastConversations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ConversationItem
                conversation={item}
                onPress={() => handleConversationPress(item)}
                muted
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
        )
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
  refreshBar: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  searchSpinner: {
    paddingVertical: 16,
    alignItems: 'center',
  },
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
  tabPast: {
    flex: 0.85,
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
  conversationCardPast: {
    opacity: 0.6,
  },
  pastChannelPrefixIcon: {
    marginRight: 6,
  },
  conversationNamePast: {
    fontSize: 14,
  },
  archivedSubtitle: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
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
  badgeCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  badgeInitials: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  badgeEmoji: {
    fontSize: 18,
  },
  badgeTeamIcon: {
    fontSize: 16,
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
    color: '#cbd5e1',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  conversationNameUnread: {
    color: '#fff',
    fontWeight: '700',
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
    color: '#6B7280',
    fontSize: 13,
    marginTop: 4,
  },
  lastMessageUnread: {
    color: '#94a3b8',
    fontWeight: '500',
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
  chipSelected: {
    backgroundColor: '#8B5CF6',
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
