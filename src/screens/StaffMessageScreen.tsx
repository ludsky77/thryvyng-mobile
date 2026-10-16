import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Keyboard,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { SAME_CLUB_MESSAGE, isSameClubRefusal } from '../lib/clubRule';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchTeamMemberNamesForTeams,
  CHAT_FALLBACK_NAME,
} from '../lib/memberNames';
import {
  // buildMemberInserts is no longer imported: the server builds the member rows
  // now (create_group_channel). The helper and its tests stay in chatHelpers --
  // see docs/recon/phaseD-BF.md FND-BF14 -- but nothing in the app calls it.
  CHANNEL_NAME_MAX,
  chatNameOnEdit,
  chatNameOnGroupChange,
  checkedRecipientIds,
  filterByNameQuery,
  formatRoleLabel,
  initialChatName,
  pickHighestRole,
  selectAllLabel,
  toggleWholeGroup,
  type ChatNameState,
} from '../lib/chatHelpers';

type StaffFilter = 'all' | 'head_coaches' | 'all_coaches' | 'managers';

interface StaffMember {
  id: string;
  user_id: string;
  full_name: string;
  /**
   * EVERY staff role this person holds across the club's teams. A club staffer
   * can be head_coach on one team and team_manager on another, so "Team
   * Managers Only" has to test the whole set -- the old single `role` field was
   * whichever row the dedupe Map happened to keep last, which both mislabelled
   * them and silently dropped them from a filter they belonged in.
   */
  roles: string[];
  /** Display role only: the highest of `roles`, via the shared resolver. */
  role: string;
  team_name: string;
}

/**
 * The ONE group predicate, shared by the list and by the per-group counts.
 * Tests the whole role set, so someone who is head_coach on one team and
 * team_manager on another appears under both "All Coaches" and
 * "Team Managers Only" -- the old version tested a single arbitrary role and
 * dropped them from one of the two.
 */
/**
 * The groups, in display order. Module scope because the default chat name is
 * derived from the SAME label the radio shows -- two lists would drift.
 */
const FILTER_OPTIONS: { key: StaffFilter; label: string }[] = [
  { key: 'all', label: 'All Staff' },
  { key: 'head_coaches', label: 'Head Coaches Only' },
  { key: 'all_coaches', label: 'All Coaches' },
  { key: 'managers', label: 'Team Managers Only' },
];

/** The picked group's label = the chat's default name. */
function groupLabel(filter: StaffFilter): string {
  return FILTER_OPTIONS.find((o) => o.key === filter)?.label ?? 'All Staff';
}

function matchesFilter(staff: StaffMember, filter: StaffFilter): boolean {
  switch (filter) {
    case 'head_coaches':
      return staff.roles.includes('head_coach');
    case 'all_coaches':
      return (
        staff.roles.includes('head_coach') ||
        staff.roles.includes('assistant_coach')
      );
    case 'managers':
      return staff.roles.includes('team_manager');
    default:
      return true;
  }
}

export default function StaffMessageScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { clubId } = (route.params as { clubId: string }) || {};
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<StaffFilter>('all');
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [creating, setCreating] = useState(false);
  // Unchecked people, by user id. Everyone in the picked group starts CHECKED,
  // so this holds the exceptions rather than the selection -- switching groups
  // then cannot leave a stale "selected" set behind.
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  // The chat's name, and whether the sender owns it yet. Starts as the default
  // group's label and follows the group until they type their own.
  const [chatName, setChatName] = useState<ChatNameState>(() =>
    initialChatName(groupLabel('all'))
  );
  // Hides rows in the checklist. Never touches who is checked.
  const [recipientQuery, setRecipientQuery] = useState('');
  // An empty chat name blocks CREATE, the same way it blocks rename in Chat
  // Info and Group Info (Lu, Oct 14 -- one rule for every chat-name field).
  // Inline under the field, never an alert; cleared on the next keystroke.
  const [nameError, setNameError] = useState<string | null>(null);

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

      // Staff names used to come from a direct `profiles` read, blocked by RLS
      // for a non-staff viewer. This list spans a whole club, and the RPC is
      // gated one team at a time, so ask per team and merge.
      const memberNames = await fetchTeamMemberNamesForTeams(teamIds);

      // One entry per PERSON, accumulating every staff role they hold. The
      // previous `new Map(list.map(s => [s.user_id, s]))` kept the last row for
      // a duplicate id and threw the others away.
      const byUser = new Map<string, StaffMember>();
      staffData.forEach((s: any) => {
        const role = s.staff_role || '';
        const existing = byUser.get(s.user_id);
        if (existing) {
          if (role && !existing.roles.includes(role)) existing.roles.push(role);
          return;
        }
        byUser.set(s.user_id, {
          id: s.id,
          user_id: s.user_id,
          full_name: memberNames.get(s.user_id)?.name || CHAT_FALLBACK_NAME,
          roles: role ? [role] : [],
          role: '',
          team_name: teamMap.get(s.team_id) || '',
        });
      });

      const uniqueStaff = Array.from(byUser.values()).map((s) => ({
        ...s,
        // The ONE resolver. Order-independent, so two staff rows for the same
        // person always produce the same label.
        role: pickHighestRole(s.roles) ?? '',
      }));

      setAllStaff(uniqueStaff);
    } catch (err) {
      console.error('Error fetching staff:', err);
      setAllStaff([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredStaff = allStaff.filter((s) => matchesFilter(s, selectedFilter));

  // Who the message will actually reach. `filteredStaff` is the group; this is
  // the group minus whatever the sender unchecked.
  const recipientIds = checkedRecipientIds(filteredStaff, excludedIds);
  const recipientCount = recipientIds.length;

  // The rows the FlatList shows. Deliberately NOT fed to recipientIds, the
  // count, or the select-all toggle -- searching must not change the send list.
  const visibleStaff = filterByNameQuery(filteredStaff, recipientQuery);

  const defaultChatName = groupLabel(selectedFilter);
  const toggleLabel = selectAllLabel(filteredStaff, excludedIds);

  /** Picking a different group starts that group fully checked. */
  const selectFilter = (key: StaffFilter) => {
    // Picking a group is a tap outside the two text fields, so the keyboard
    // goes. It used to stay up and cover the recipient list the tap was
    // meant to change.
    Keyboard.dismiss();
    setSelectedFilter(key);
    setExcludedIds(new Set());
    setChatName((prev) => chatNameOnGroupChange(prev, groupLabel(key)));
    // A query typed against the old group would silently hide most of the new
    // one, and the list would read as empty when it is not.
    setRecipientQuery('');
  };

  const toggleRecipient = (userId: string) => {
    Keyboard.dismiss();
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleStartConversation = async () => {
    // Send is already disabled at zero; this is the guard for the programmatic
    // path so an empty group can never be created.
    if (recipientCount === 0 || !user?.id) return;

    // One rule for every chat-name field: empty or whitespace blocks the
    // write. This used to fall back to the group's label via resolveChatName,
    // so clearing the field silently created a chat named after a group the
    // sender had deliberately renamed away from. The preset auto-fill still
    // populates the field (chatNameOnGroupChange) -- this only catches a field
    // the sender emptied by hand.
    const trimmedName = chatName.value.trim();
    if (!trimmedName) {
      setNameError('Enter a chat name.');
      return;
    }

    setCreating(true);
    try {
      const channelName = trimmedName;

      // Created SERVER-SIDE since ruling BF-2, and it has to be since BF-8:
      // the comm_channels_insert policy no longer lets a client insert a
      // group_dm at all, so the direct insert this screen used to do would now
      // be refused outright. One RPC is one transaction — the channel, every
      // recipient and the club land together or not at all.
      //
      // p_club_id is passed EXPLICITLY, unlike ChatScreen.createGroup. This
      // screen knows exactly which club it is messaging (clubId is a required
      // route param), and a staff broadcast must not have its club guessed: if
      // the recipients happened to share two clubs, first_shared_club could
      // pick the other one. The server still checks every recipient is in it
      // (BF-8) and refuses otherwise.
      //
      // THE ORPHAN ROLLBACK IS GONE WITH IT. This used to insert the channel,
      // then the members in a second round trip, and DELETE the channel by hand
      // if that failed. A function body cannot half-succeed.
      //   WEB: supabase/migrations/20261016120000_bf_club_id_on_every_chat.sql
      //   recon: docs/recon/phaseD-BF.md -- rulings: docs/recon/phaseD-rulings.md
      const { data: channelId, error: channelError } = await supabase.rpc(
        'create_group_channel',
        {
          p_name: channelName,
          // The creator is NOT in this list: the server adds them as admin.
          p_user_ids: recipientIds.filter((id) => id && id !== user?.id),
          p_club_id: clubId,
        }
      );

      if (channelError || !channelId) {
        // BF-8: a recipient outside this club is a rule, not a fault.
        if (isSameClubRefusal(channelError)) {
          Alert.alert('Different clubs', SAME_CLUB_MESSAGE);
          return;
        }
        throw channelError ?? new Error('create_group_channel returned no id');
      }

      // Only on success. A failed member insert used to navigate anyway, into
      // a room the recipients were never added to.
      navigation.replace('TeamChatRoom', {
        channelId,
        channelName,
        channelType: 'group_dm',
      });
    } catch (err) {
      if (__DEV__) {
        console.error('Error creating staff channel:', err);
      }
      Alert.alert('Error', 'Could not start the conversation');
    } finally {
      setCreating(false);
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

  const getFilterCount = (key: StaffFilter) =>
    allStaff.filter((s) => matchesFilter(s, key)).length;

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

      {/* Two columns, not four stacked rows. Four 44pt rows cost ~200pt of a
          701pt screen (the tab bar is on this route, see styles.filterGrid),
          which left room for two recipients. The radio is gone -- the filled
          pill and its border already say which group is picked -- but the
          44pt tap target and the 15pt label are unchanged. */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Select recipients:</Text>
        <View style={styles.filterGrid}>
          {FILTER_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.filterOption,
                selectedFilter === option.key && styles.filterOptionSelected,
              ]}
              onPress={() => selectFilter(option.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedFilter === option.key }}
              accessibilityLabel={option.label}
            >
              <Text
                style={[
                  styles.filterOptionText,
                  selectedFilter === option.key &&
                    styles.filterOptionTextSelected,
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
              <Text style={styles.filterCount}>
                {getFilterCount(option.key)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Item 1. Defaults to the picked group's label and follows the group
          until the sender types their own name, then stays as typed
          (`chatNameOnGroupChange`). */}
      <View style={styles.nameSection}>
        <Text style={styles.filterLabel}>Chat name</Text>
        <TextInput
          style={styles.textInput}
          value={chatName.value}
          onChangeText={(text) => {
            setChatName((prev) => chatNameOnEdit(prev, text));
            if (nameError) setNameError(null);
          }}
          placeholder={defaultChatName}
          placeholderTextColor="#64748b"
          returnKeyType="done"
          accessibilityLabel="Chat name"
          maxLength={CHANNEL_NAME_MAX}
        />
        {nameError ? <Text style={styles.nameError}>{nameError}</Text> : null}
      </View>

      {/* The group is a starting point, not the send list: every row is
          checked when a group is picked and the sender can uncheck anyone.
          The whole group is listed -- the old slice(0, 10) + "+N more" could
          not be a checklist, because the people it hid were unreachable. */}
      <View style={styles.previewSection}>
        {/* Item 2. Hides rows only -- the count below and the send list are
            both computed from the whole group. */}
        <TextInput
          style={styles.searchInput}
          value={recipientQuery}
          onChangeText={setRecipientQuery}
          placeholder="Search by name..."
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search recipients"
        />
        <View style={styles.previewHeader}>
          {/* Every checked person, visible or hidden by the search. */}
          <Text style={styles.previewTitle}>
            {recipientCount} {recipientCount === 1 ? 'recipient' : 'recipients'}
          </Text>
          {/* Item 3. Acts on the whole group, not the visible rows. */}
          {filteredStaff.length > 0 ? (
            <TouchableOpacity
              onPress={() => {
                Keyboard.dismiss();
                setExcludedIds((prev) => toggleWholeGroup(filteredStaff, prev));
              }}
              accessibilityRole="button"
              accessibilityLabel={toggleLabel}
            >
              <Text style={styles.selectAllText}>{toggleLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <FlatList
          data={visibleStaff}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          keyExtractor={(item) => item.user_id}
          renderItem={({ item }) => {
            const checked = !excludedIds.has(item.user_id);
            const roleLabel = formatRoleLabel(item.role);
            return (
              <TouchableOpacity
                style={styles.staffRow}
                onPress={() => toggleRecipient(item.user_id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={item.full_name}
              >
                <View
                  style={[styles.checkbox, checked && styles.checkboxChecked]}
                >
                  {checked ? (
                    <Feather name="check" size={14} color="#fff" />
                  ) : null}
                </View>
                <View style={styles.staffAvatar}>
                  <Text style={styles.staffInitials}>
                    {getInitials(item.full_name)}
                  </Text>
                </View>
                <View style={styles.staffInfo}>
                  <Text
                    style={[
                      styles.staffName,
                      !checked && styles.staffNameUnchecked,
                    ]}
                  >
                    {item.full_name}
                  </Text>
                  {roleLabel ? (
                    <Text style={styles.staffRole}>{roleLabel}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.moreText}>
              {recipientQuery.trim()
                ? 'No one in this group matches that search.'
                : 'No staff match this group.'}
            </Text>
          }
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.startButton,
            (recipientCount === 0 || creating) && styles.startButtonDisabled,
          ]}
          onPress={handleStartConversation}
          disabled={recipientCount === 0 || creating}
          accessibilityRole="button"
          accessibilityState={{ disabled: recipientCount === 0 || creating }}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.startButtonText}>
              Start Conversation ({recipientCount})
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
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  filterLabel: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 6,
  },
  // Two per row: 49% + space-between leaves an 8pt gutter at 402pt wide, and
  // 181pt of cell holds the longest label ("Team Managers Only") at 15pt with
  // room for a two-digit count. rowGap, not marginBottom, so the last row
  // adds no trailing space.
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 6,
  },
  filterOption: {
    width: '49%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    // 12 + 18 (15pt line) + 12 + 2 border = 44pt, the minimum tap target.
    minHeight: 44,
    // The border is always present and only changes COLOUR on selection --
    // adding it on select used to make the picked row 2pt taller and shuffle
    // the grid.
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterOptionSelected: {
    backgroundColor: '#2d2a5e',
    borderColor: '#8b5cf6',
  },
  filterOptionText: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    marginRight: 6,
  },
  filterOptionTextSelected: {
    fontWeight: '600',
  },
  filterCount: {
    fontSize: 14,
    color: '#64748b',
  },
  nameSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  // Same wording, colour and placement as the rename errors in ChatInfoScreen
  // and GroupInfoScreen.
  nameError: {
    marginTop: 6,
    fontSize: 13,
    color: '#EF4444',
  },
  textInput: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
  },
  previewSection: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    // No bottom padding: the footer's own border and padding already separate
    // the list from the button, and this is the cheapest 16pt on the screen.
    paddingBottom: 0,
  },
  searchInput: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#fff',
    marginBottom: 6,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  previewTitle: {
    fontSize: 14,
    color: '#94a3b8',
  },
  selectAllText: {
    fontSize: 14,
    color: '#8b5cf6',
    fontWeight: '600',
  },
  // 22x22 with a 2px border reads as a checkbox at a glance and gives the
  // 44pt row a comfortable hit target without its own hitSlop -- the whole
  // row is the control.
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#475569',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    borderColor: '#8b5cf6',
    backgroundColor: '#8b5cf6',
  },
  staffNameUnchecked: {
    color: '#64748b',
    textDecorationLine: 'line-through',
  },
  // 7 + 32 + 7 = 46pt: above the 44pt tap target, 6pt shorter than before.
  // Name 14pt and role 12pt are unchanged -- only the avatar and the padding
  // came down.
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
  },
  staffAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    paddingHorizontal: 16,
    paddingVertical: 10,
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
