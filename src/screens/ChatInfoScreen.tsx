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
  TextInput,
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
import { isChannelStaff } from '../lib/channelStaff';
import {
  ANNOUNCEMENT_SET_FAILED_MESSAGE,
  ANNOUNCEMENT_TOGGLE_HINT,
  ANNOUNCEMENT_TOGGLE_LABEL,
  setAnnouncementOnly,
} from '../lib/announcementChannel';
import {
  buildRoleMap,
  CHANNEL_NAME_MAX,
  formatRoleLabel,
} from '../lib/chatHelpers';
import AddMembersModal from '../components/chat/AddMembersModal';

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
  const navigation = useNavigation<any>();
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
  /**
   * Phase D slice 4b, ruling Q5 B: who may turn an announcement channel on is
   * CHANNEL STAFF — `public.is_channel_staff`, ruling Q3 B as amended by Q3 B+.
   *
   * This is a SECOND staff flag on purpose and `isStaffInTeam` above is left
   * exactly as it was. They are different questions with different answers:
   * `isStaffInTeam` is a team_staff existence check and is FALSE for any chat
   * with no team, which is why club-announcements could never be switched to
   * announcement-only from either app; and it still gates Add Members, which
   * mirrors a different policy (the comm_channel_members INSERT arms) and was
   * not part of this ruling. Only the Staff Controls section moved.
   */
  const [isStaffHere, setIsStaffHere] = useState(false);
  const [savingStaffOnly, setSavingStaffOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'role' | 'alpha'>('role');
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  // Rename, admin-only. `nameError` is rendered inline under the field rather
  // than alerted: an empty name is a correction to make in place, not an
  // interruption, and a refused write belongs next to the field that caused it.
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (channelId) {
      fetchChatInfo();
      checkStaffStatus();
    } else {
      setLoading(false);
    }
  }, [channelId, teamId, user?.id]);

  // 4b: the announcement-toggle gate, asked of the server. Keyed on the chat
  // rather than the team, because a club chat and a group chat have no team and
  // still have staff.
  useEffect(() => {
    if (!channelId) {
      setIsStaffHere(false);
      return;
    }
    let cancelled = false;
    isChannelStaff(channelId).then((answer) => {
      if (!cancelled) setIsStaffHere(answer);
    });
    return () => {
      cancelled = true;
    };
  }, [channelId, user?.id]);

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

      // `new Map(rows.map(...))` kept the LAST row for a duplicate user id, and
      // this read has no ORDER BY -- so a coach holding both head_coach and
      // team_manager on one team was labelled by whichever row came back
      // second. buildRoleMap collects every role per person and tie-breaks on
      // getRolePriority, so the answer no longer depends on row order.
      // (docs/recon/phaseC-audit.md item 6.)
      staffMap = buildRoleMap(staffData as any[]);
    }

    const membersList: Member[] = userIds.map((userId) => {
      const resolved = profileMap.get(userId);
      const label = labelMap.get(userId);
      const staffRole = staffMap.get(userId);

      let role: Member['role'] = 'member';
      let role_label = 'Member';

      // Granular staff titles come from the ONE label function. The three
      // hard-coded strings here were a fourth role vocabulary; formatRoleLabel
      // owns the wording now (note: 'Assistant Coach', not 'Asst. Coach').
      if (
        staffRole === 'head_coach' ||
        staffRole === 'assistant_coach' ||
        staffRole === 'team_manager'
      ) {
        role = staffRole;
        role_label = formatRoleLabel(staffRole);
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

  /**
   * Turn announcement-only on or off. Optimistic, then corrected by the
   * server's answer -- and a REFUSAL puts the switch back.
   *
   * It used to write `.update()` inline and ignore the result, which was the
   * live bug: `comm_channels_update` admits only the chat's creator and its
   * channel admins, an UPDATE matching no row is NOT an error, so a coach moved
   * the switch, saw it stay moved, and nothing had changed. It now goes through
   * `setAnnouncementOnly`, which calls the `set_channel_announcement_mode` RPC
   * -- ruling Q5 B-setter = Option B (Lu, 2026-10-17 03:56 MDT): one SECURITY
   * DEFINER door gated on `is_channel_staff`, so the coach the ruling meant can
   * actually switch it, and anybody else is refused OUT LOUD with ERRCODE P0024
   * and a hint sentinel.
   */
  const toggleStaffOnly = async (value: boolean) => {
    if (!channelId) return;
    const previous = staffOnlyMessaging;
    setStaffOnlyMessaging(value);
    setSavingStaffOnly(true);

    const result = await setAnnouncementOnly(channelId, value);

    setSavingStaffOnly(false);

    if (result.status === 'ok') {
      setStaffOnlyMessaging(result.announcementOnly);
      return;
    }

    setStaffOnlyMessaging(previous);
    if (result.status === 'error') {
      logError('ChatInfo.toggleStaffOnly', result.error, { channelId });
    }
    Alert.alert(
      'Not changed',
      result.status === 'refused' ? result.message : ANNOUNCEMENT_SET_FAILED_MESSAGE
    );
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

  /**
   * Membership management is offered on CUSTOM team channels only.
   *
   * Excluded, and why:
   *   * the default team chat and club-announcements -- membership is
   *     maintained server-side (ensure_team_channel_membership re-adds members
   *     on the next chat load, and the S4 club sync owns the club channel), so
   *     a client add or remove would be undone or would fight the trigger;
   *   * DMs -- a two-person channel has no roster to manage;
   *   * group chats -- those have their own screen, GroupInfoScreen.
   */
  const isCustomTeamChannel = useMemo(() => {
    if (!channel) return false;
    if (channel.is_direct_message === true) return false;
    if (channel.is_default === true) return false;
    return channel.channel_type === 'team' || channel.channel_type === 'club';
  }, [channel]);

  /**
   * The OTHER manageable shape: a group chat. `channel_type` is 'group_dm'
   * for both ways one is made -- Chat > + > New Group (ChatScreen.createGroup,
   * ChatScreen.tsx:783-791) and Chat > + > Staff Message
   * (StaffMessageScreen.tsx:238-247, which additionally sets `club_id` and
   * leaves `team_id` NULL). A Staff-Message chat therefore failed
   * `isCustomTeamChannel` on its channel_type alone, which is why "U40 mens"
   * showed no Add, no Remove and no Rename.
   *
   * Both are included, not just the club-level one: they are the same row
   * shape under the same policies, and splitting them on `club_id` would be a
   * UI rule with no DB rule behind it. The admin gate below is what limits it.
   *
   * `is_default` is still excluded -- a default channel's membership is
   * server-maintained -- and so is a DM, which has no roster to manage.
   */
  const isManageableGroupChat = useMemo(() => {
    if (!channel) return false;
    if (channel.is_direct_message === true) return false;
    if (channel.is_default === true) return false;
    return channel.channel_type === 'group_dm';
  }, [channel]);

  /**
   * ADD: team staff or a channel admin. Mirrors the two live arms of the
   * comm_channel_members INSERT policy -- `is_channel_admin(auth.uid(),
   * channel_id)` OR a `team_staff` row for the channel's team (web repo
   * 20261013013626_stone_b2_s1_chat_permissions_leave.sql:151-168). No new
   * rule: `isStaffInTeam` is the existence check this screen already ran for
   * its Staff Controls, and `myMembershipRole` is already loaded.
   *
   * A group chat has no team, so only the admin arm can ever be true there --
   * `isStaffInTeam` is false whenever the route carries no teamId. The team
   * arm is left written out rather than folded in, so the team-channel gate
   * below reads exactly as it did before this change.
   */
  const canAddMembers =
    (isCustomTeamChannel && (isStaffInTeam || myMembershipRole === 'admin')) ||
    (isManageableGroupChat && myMembershipRole === 'admin');

  /**
   * REMOVE: the channel admin ONLY. The DELETE policy's other-person arm is
   * `user_id <> auth.uid() AND is_channel_admin(auth.uid(), channel_id)`
   * (same migration, :191-200) -- team staff are NOT admitted, so showing
   * Remove to a coach would offer a button the DB silently refuses.
   *
   * Removing someone here removes exactly one `comm_channel_members` row. It
   * does not touch the team roster, club membership, the player or parent
   * record, invitations, registration or payments -- re-adding is one tap of
   * Add. The confirm copy says so.
   */
  const canRemoveMembers =
    (isCustomTeamChannel || isManageableGroupChat) &&
    myMembershipRole === 'admin';

  /**
   * RENAME: group chats only, admin only -- the same gate GroupInfoScreen has
   * always used for the same write (GroupInfoScreen.tsx:117-119). Team and
   * club channels are deliberately NOT offered a rename here: their names are
   * part of the team's structure, and nothing about them changes in this
   * build.
   */
  const canRenameChannel = isManageableGroupChat && myMembershipRole === 'admin';

  /** The row's name wins over the route param, so a rename shows immediately. */
  const displayChannelName = channel?.name || channelName || 'Chat';

  const startRename = () => {
    setNameDraft(channel?.name || channelName || '');
    setNameError(null);
    setEditingName(true);
  };

  const cancelRename = () => {
    setEditingName(false);
    setNameError(null);
  };

  const saveChannelName = async () => {
    if (savingName) return;

    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameError('Enter a chat name.');
      return;
    }

    setSavingName(true);
    try {
      // `.select('id')` is the refusal check: RLS filters a denied update out
      // silently -- PostgREST returns no error and no rows -- so an empty
      // result is a refusal, not a success. Same pattern as the member delete
      // below and as GroupInfoScreen.updateGroupName.
      const { data, error } = await supabase
        .from('comm_channels')
        .update({ name: trimmed })
        .eq('id', channelId)
        .select('id');

      if (error || !data || data.length === 0) {
        logError('ChatInfo.renameChannel', error ?? 'refused', { channelId });
        setNameError('Could not rename this chat.');
        return;
      }

      setChannel((prev) => (prev ? { ...prev, name: trimmed } : prev));
      setEditingName(false);
      setNameError(null);
    } finally {
      setSavingName(false);
    }
  };

  const removeMember = (target: Member) => {
    // The copy states the blast radius because the old wording ("from this
    // channel?") left it open. Removing here deletes ONE
    // comm_channel_members row -- team roster, club membership, player and
    // parent records, invitations, registration and payments are all
    // untouched, and Add puts the person back.
    Alert.alert(
      'Remove from this chat?',
      `${target.full_name} will lose access to this chat. They stay on their team — nothing else changes, and you can add them back.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            // `.select()` is the refusal check: RLS filters a denied delete out
            // silently -- no error, no rows -- so an empty result is a refusal,
            // not a success. Same pattern as GroupInfoScreen.
            const { data, error } = await supabase
              .from('comm_channel_members')
              .delete()
              .eq('channel_id', channelId)
              .eq('user_id', target.user_id)
              .select('user_id');

            if (error || !data || data.length === 0) {
              logError('ChatInfo.removeMember', error ?? 'refused', {
                channelId,
                targetUserId: target.user_id,
              });
              Alert.alert('Error', 'Could not remove member');
              return;
            }

            await fetchChatInfo();
          },
        },
      ]
    );
  };

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
      {/* Never on your own row: the DELETE policy's admin arm is explicitly
          `user_id <> auth.uid()`, and leaving is the Leave button's job. */}
      {canRemoveMembers && item.user_id !== user?.id ? (
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => removeMember(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.full_name}`}
        >
          <Text style={styles.removeButtonText}>Remove</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const handlePollsPress = () => {
    navigation.navigate('ChannelPolls', { channelId });
  };

  const handleFilesPress = () => {
    navigation.navigate('ChannelFiles', { channelId });
  };

  const handleLinksPress = () => {
    navigation.navigate('ChannelLinks', { channelId });
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
          onPress: () => navigation.navigate('Conversations'),
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
      navigation.navigate('Conversations');
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
              {canRenameChannel && editingName ? (
                <View style={styles.renameBlock}>
                  <TextInput
                    style={styles.nameInput}
                    value={nameDraft}
                    onChangeText={(text) => {
                      setNameDraft(text);
                      if (nameError) setNameError(null);
                    }}
                    maxLength={CHANNEL_NAME_MAX}
                    placeholder="Chat name"
                    placeholderTextColor="#64748b"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={saveChannelName}
                    accessibilityLabel="Chat name"
                  />
                  {nameError ? (
                    <Text style={styles.nameError}>{nameError}</Text>
                  ) : null}
                  <View style={styles.renameActions}>
                    <TouchableOpacity
                      onPress={cancelRename}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel rename"
                    >
                      <Text style={styles.renameCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={saveChannelName}
                      disabled={savingName}
                      accessibilityRole="button"
                      accessibilityLabel="Save chat name"
                    >
                      <Text
                        style={[
                          styles.renameSave,
                          savingName && styles.renameSaveDisabled,
                        ]}
                      >
                        {savingName ? 'Saving...' : 'Save'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : canRenameChannel ? (
                <TouchableOpacity
                  style={styles.nameRow}
                  onPress={startRename}
                  accessibilityRole="button"
                  accessibilityLabel="Rename chat"
                >
                  <Text
                    style={styles.channelName}
                    numberOfLines={3}
                    ellipsizeMode="tail"
                  >
                    {displayChannelName}
                  </Text>
                  <Feather name="edit-2" size={14} color="#8b5cf6" />
                </TouchableOpacity>
              ) : (
                <Text
                  style={styles.channelName}
                  numberOfLines={3}
                  ellipsizeMode="tail"
                >
                  {displayChannelName}
                </Text>
              )}
              <Text style={styles.channelMeta}>
                {channelType === 'team'
                  ? 'Team Chat'
                  : channelType === 'group_dm'
                    ? 'Group Chat'
                    : 'Channel'}{' '}
                • {memberCount} members
              </Text>
            </View>

            {/* A3 (Lu, 2026-10-20): NO Polls tile on a DM. A DM cannot create
                a poll -- DMChatScreen passes no `onPollPress` to its composer
                -- so the tile could only ever open an empty list with no way
                to fill it. Identified by the ROW (`is_direct_message`), the
                same test lines 421 / 465 / 488 use; the route param is
                'direct' on a DM and undefined on a push-opened room, so it
                cannot carry this gate. The whole row goes, not just the tile:
                Files and Links are already hidden, so a DM would be left with
                an empty bar. */}
            {channel?.is_direct_message === true ? null : (
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
            )}

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

            {/* 4b, ruling Q5 B: gated on is_channel_staff, not isStaffInTeam.
                The old gate was false for every chat with no team, so
                club-announcements -- the one chat whose name says it -- could
                never be switched, from either app. */}
            {isStaffHere && (
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>Staff Controls</Text>
                <View style={styles.settingRow}>
                  <View style={[styles.settingLeft, styles.settingLeftGrow]}>
                    <Feather name="shield" size={20} color="#94a3b8" />
                    <View style={styles.settingLabelBlock}>
                      <Text style={styles.settingLabel}>
                        {ANNOUNCEMENT_TOGGLE_LABEL}
                      </Text>
                      <Text style={styles.settingHint}>
                        {ANNOUNCEMENT_TOGGLE_HINT}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={staffOnlyMessaging}
                    onValueChange={toggleStaffOnly}
                    disabled={savingStaffOnly}
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
                <View style={styles.membersActions}>
                  {canAddMembers ? (
                    <TouchableOpacity
                      onPress={() => setShowAddMemberModal(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Add members"
                    >
                      <Text style={styles.addButton}>+ Add</Text>
                    </TouchableOpacity>
                  ) : null}
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

      {/* Same picker as Group Info. It carries no permission logic of its own:
          it is rendered only when canAddMembers, and the INSERT policy is the
          real gate. */}
      <AddMembersModal
        visible={showAddMemberModal}
        channelId={channelId}
        existingUserIds={members.map((m) => m.user_id)}
        onClose={() => setShowAddMemberModal(false)}
        onAdded={fetchChatInfo}
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
    // A 100-char name with no spaces has no break opportunity, so without a
    // horizontal bound it ran off both edges of the screen.
    paddingHorizontal: 24,
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
    // flexShrink lets the name yield to the pencil inside nameRow; without it
    // the Text claimed its full intrinsic width and pushed the pencil off
    // screen. Centred because the block is centred.
    flexShrink: 1,
    textAlign: 'center',
  },
  // Tap target for the rename affordance: the name and its pencil read as one
  // control, centred like the plain name it replaces.
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // Bounds the row so a long name wraps instead of growing the row past
    // the screen. The pencil is never pushed out.
    maxWidth: '100%',
  },
  renameBlock: {
    width: '100%',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  nameInput: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#8B5CF6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  nameError: {
    marginTop: 6,
    fontSize: 13,
    color: '#EF4444',
    textAlign: 'center',
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 10,
  },
  renameCancel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },
  renameSave: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8B5CF6',
  },
  renameSaveDisabled: {
    color: '#64748b',
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
  // The announcement row carries a second line, so its label and hint stack
  // while every other settingLeft stays a single centred line, and only this
  // row's left side grows so the hint wraps instead of pushing the switch off.
  settingLeftGrow: {
    flex: 1,
    alignItems: 'flex-start',
  },
  settingLabelBlock: {
    flex: 1,
    paddingRight: 8,
  },
  settingLabel: {
    fontSize: 15,
    color: '#fff',
  },
  settingHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  membersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  // "+ Add" and the sort toggle share the right-hand side of the header.
  membersActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  // Same three rules as GroupInfoScreen:429-433, so the two Add affordances
  // read identically.
  addButton: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '600',
  },
  // Same as GroupInfoScreen:504-517: an outlined destructive chip, never a
  // filled button -- it sits inside a scrolling roster.
  removeButton: {
    marginLeft: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#7F1D1D',
  },
  removeButtonText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
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
