import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchTeamMemberNamesForTeams,
  CHAT_FALLBACK_NAME,
} from '../lib/memberNames';
import {
  buildMemberInserts,
  checkedRecipientIds,
  formatRoleLabel,
  pickHighestRole,
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

  /** Picking a different group starts that group fully checked. */
  const selectFilter = (key: StaffFilter) => {
    setSelectedFilter(key);
    setExcludedIds(new Set());
  };

  const toggleRecipient = (userId: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const filterOptions: { key: StaffFilter; label: string }[] = [
    { key: 'all', label: 'All Staff' },
    { key: 'head_coaches', label: 'Head Coaches Only' },
    { key: 'all_coaches', label: 'All Coaches' },
    { key: 'managers', label: 'Team Managers Only' },
  ];

  const handleStartConversation = async () => {
    // Send is already disabled at zero; this is the guard for the programmatic
    // path so an empty group can never be created.
    if (recipientCount === 0 || !user?.id) return;

    setCreating(true);
    try {
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

      // FND-A. The creator is NOT inserted here: trigger_add_creator_to_members
      // already added them as 'admin' on the comm_channels INSERT, and
      // comm_channel_members carries UNIQUE (channel_id, user_id). A multi-row
      // INSERT is one statement, so including the creator failed the WHOLE
      // batch and the room opened with nobody in it. Same shape as
      // ChatScreen.createGroup, which has always done this correctly.
      const memberInserts = buildMemberInserts(
        channel.id,
        recipientIds,
        user.id
      );

      const { error: memberError } = await supabase
        .from('comm_channel_members')
        .insert(memberInserts);

      if (memberError) {
        // Roll the channel back so a failed create leaves no orphan behind.
        const { error: rollbackError } = await supabase
          .from('comm_channels')
          .delete()
          .eq('id', channel.id)
          .select('id');
        if (rollbackError && __DEV__) {
          console.warn('[StaffMessage] rollback failed:', rollbackError);
        }
        Alert.alert('Error', 'Could not start the conversation');
        return;
      }

      // Only on success. A failed member insert used to navigate anyway, into
      // a room the recipients were never added to.
      navigation.replace('TeamChatRoom', {
        channelId: channel.id,
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

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Select recipients:</Text>
        {filterOptions.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.filterOption,
              selectedFilter === option.key && styles.filterOptionSelected,
            ]}
            onPress={() => selectFilter(option.key)}
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

      {/* The group is a starting point, not the send list: every row is
          checked when a group is picked and the sender can uncheck anyone.
          The whole group is listed -- the old slice(0, 10) + "+N more" could
          not be a checklist, because the people it hid were unreachable. */}
      <View style={styles.previewSection}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle}>
            {recipientCount} {recipientCount === 1 ? 'recipient' : 'recipients'}
          </Text>
          {excludedIds.size > 0 ? (
            <TouchableOpacity
              onPress={() => setExcludedIds(new Set())}
              accessibilityRole="button"
            >
              <Text style={styles.selectAllText}>Select all</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <FlatList
          data={filteredStaff}
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
              No staff match this group.
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
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
