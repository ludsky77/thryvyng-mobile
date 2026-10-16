/**
 * The add-people picker for an EXISTING chat, shared by Group Info and
 * team-channel Info.
 *
 * Lifted verbatim out of GroupInfoScreen (Stone F, commit 03b44ab) when Phase C
 * gave team channels the same control: the debounce, the latest-wins sequence
 * guard, the keyboard-safe top-anchored sheet and the role chips are all that
 * screen's, unchanged, so the two entry points cannot drift apart.
 *
 * It owns the search and the INSERT and nothing else. It holds NO permission
 * logic: the caller decides whether to render it at all, and the DB decides
 * whether the insert lands. Current RLS on comm_channel_members INSERT
 * (web repo 20261013013626_stone_b2_s1_chat_permissions_leave.sql:151-168)
 * admits a channel admin, or team staff where the channel is tied to their
 * team -- so a staff member's add succeeds on a team channel and is refused on
 * a group chat, with no client-side rule needed.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Pressable,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import {
  SAME_CLUB_MESSAGE,
  describeAddMemberFailure,
} from '../../lib/clubRule';
import {
  CONTACT_ROLE_GROUP_LABELS,
  contactRoleGroup,
  fetchContactRoles,
  presentRoleGroups,
  type ContactRoleGroup,
} from '../../lib/contactRoles';

/** One candidate from search_chat_contacts, shaped like the new-chat picker. */
export interface ContactResult {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  /** Highest-priority structural role string, e.g. 'head_coach'. */
  role?: string | null;
  /** Which filter chip this candidate belongs under, if any. */
  roleGroup?: ContactRoleGroup | null;
}

/** The picker fires on every keystroke, and each keystroke is an RPC round trip. */
const SEARCH_DEBOUNCE_MS = 300;

interface AddMembersModalProps {
  visible: boolean;
  channelId: string;
  /** Already-in-the-chat user ids, filtered out of the results. */
  existingUserIds: string[];
  onClose: () => void;
  /** Called after a successful insert so the caller can refetch its roster. */
  onAdded: () => void;
}

export default function AddMembersModal({
  visible,
  channelId,
  existingUserIds,
  onClose,
  onAdded,
}: AddMembersModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ContactResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  // 'all' is the default and the only chip that is always offered.
  const [roleFilter, setRoleFilter] = useState<ContactRoleGroup | 'all'>('all');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest-wins: a slower earlier keystroke must not overwrite a newer result.
  const searchSeqRef = useRef(0);

  const existingKey = existingUserIds.join(',');

  const searchUsersToAdd = useCallback(
    async (query: string, seq: number) => {
      // Membership-gated RPC, same as the new-chat pickers: caps at 20, drops
      // self, and only returns people who share a team with the caller.
      const { data: contacts, error } = await supabase.rpc('search_chat_contacts', {
        p_query: query,
      });

      // A response that is no longer the newest request is dropped outright.
      if (seq !== searchSeqRef.current) return;

      if (error) {
        if (__DEV__) {
          console.error('[AddMembersModal] search_chat_contacts failed:', error);
        }
        setSearchResults([]);
        setSearchError('Search unavailable');
        return;
      }

      const existingIds = new Set(existingUserIds);
      const filtered = (contacts || [])
        .map((c: any) => ({
          id: c.user_id,
          full_name: c.display_name ?? null,
          avatar_url: c.avatar_url ?? null,
        }))
        .filter((p: ContactResult) => !existingIds.has(p.id));

      // Role comes from role COLUMNS, resolved here at fetch time -- the
      // search RPC returns no role, and the display string must never be
      // pattern-matched for one.
      const roleMap = await fetchContactRoles(filtered.map((p: ContactResult) => p.id));
      if (seq !== searchSeqRef.current) return;

      const tagged: ContactResult[] = filtered.map((p: ContactResult) => {
        const role = roleMap.get(p.id) ?? null;
        return { ...p, role, roleGroup: contactRoleGroup(role) };
      });

      setSearchError(null);
      setSearchResults(tagged);
    },
    // existingKey, not the array: a fresh array identity every render would
    // rebuild this callback (and cancel the debounce) on every keystroke.
    [existingKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Debounced entry point: one RPC 300 ms after the last keystroke.
  const queueUserSearch = useCallback(
    (text: string) => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
      // Bumping the counter also invalidates whatever is already in flight.
      const seq = ++searchSeqRef.current;

      if (!text.trim()) {
        setSearchResults([]);
        setSearchError(null);
        return;
      }

      searchTimerRef.current = setTimeout(() => {
        searchUsersToAdd(text, seq);
      }, SEARCH_DEBOUNCE_MS);
    },
    [searchUsersToAdd]
  );

  // Closing the picker cancels the pending debounce, invalidates any in-flight
  // response, and drops the error banner so reopening never shows a stale one.
  useEffect(() => {
    if (visible) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = null;
    searchSeqRef.current += 1;
    setSearchError(null);
    setRoleFilter('all');
    setSearchQuery('');
    setSearchResults([]);
  }, [visible]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const addMember = async (newMember: ContactResult) => {
    const { error } = await supabase.from('comm_channel_members').insert({
      channel_id: channelId,
      user_id: newMember.id,
      role: 'member',
    });

    if (error) {
      // BF-8 made 42501 ambiguous on this policy: it is now either "you are not
      // allowed to add people here" or "they are not in this chat's club".
      // describeAddMemberFailure asks the server which, using the policy's own
      // predicate, so the sentence cannot contradict the refusal.
      const message = await describeAddMemberFailure(
        error,
        channelId,
        newMember.id
      );
      if (__DEV__) {
        console.error('[AddMembersModal] add member failed:', error);
      }
      Alert.alert(
        message === SAME_CLUB_MESSAGE ? 'Different clubs' : 'Error',
        message
      );
      return;
    }

    onClose();
    setSearchQuery('');
    setSearchResults([]);
    onAdded();
  };

  // Chips describe the list in front of the user: a group with nobody in it
  // gets no chip, and a chip that vanishes mid-search cannot leave the list
  // filtered to an empty set -- the filter falls back to All.
  const availableRoleGroups = presentRoleGroups(searchResults);
  const activeRoleFilter =
    roleFilter !== 'all' && availableRoleGroups.includes(roleFilter)
      ? roleFilter
      : 'all';
  const visibleSearchResults =
    activeRoleFilter === 'all'
      ? searchResults
      : searchResults.filter((c) => c.roleGroup === activeRoleFilter);

  const dismiss = () => {
    Keyboard.dismiss();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={dismiss}
    >
      <View style={styles.modalOverlay}>
        {/* Escape route: the dim area outside the sheet dismisses the keyboard
            and closes the picker. Without it the overlay swallowed every tap. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Close add members"
          onPress={dismiss}
        />
        {/* Top-anchored: the sheet grows down from the top strip and the
            keyboard shrinks it from below, so input and results stay visible.
            box-none lets taps in the padding fall through to the backdrop. */}
        <KeyboardAvoidingView
          style={styles.modalKeyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Members</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder="Search by name..."
              placeholderTextColor="#6B7280"
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                queueUserSearch(text);
              }}
            />

            {searchError ? (
              <Text style={styles.errorText}>{searchError}</Text>
            ) : null}

            {/* Client-side only: these chips filter the rows already loaded,
                they never re-query. "All" shows whenever any group does. */}
            {availableRoleGroups.length > 0 ? (
              <View style={styles.roleChipRow}>
                <TouchableOpacity
                  style={[
                    styles.roleChip,
                    activeRoleFilter === 'all' && styles.roleChipActive,
                  ]}
                  onPress={() => setRoleFilter('all')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activeRoleFilter === 'all' }}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      activeRoleFilter === 'all' && styles.roleChipTextActive,
                    ]}
                  >
                    All
                  </Text>
                </TouchableOpacity>

                {availableRoleGroups.map((group) => (
                  <TouchableOpacity
                    key={group}
                    style={[
                      styles.roleChip,
                      activeRoleFilter === group && styles.roleChipActive,
                    ]}
                    onPress={() => setRoleFilter(group)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: activeRoleFilter === group }}
                  >
                    <Text
                      style={[
                        styles.roleChipText,
                        activeRoleFilter === group && styles.roleChipTextActive,
                      ]}
                    >
                      {CONTACT_ROLE_GROUP_LABELS[group]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <FlatList
              data={visibleSearchResults}
              style={styles.searchResultsList}
              contentContainerStyle={styles.searchResultsContent}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.searchResultItem}
                  onPress={() => addMember(item)}
                >
                  <View style={styles.resultAvatar}>
                    <Text style={styles.resultInitial}>
                      {item.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </Text>
                  </View>
                  <Text style={styles.resultName}>{item.full_name}</Text>
                  <Text style={styles.addIcon}>+</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                searchQuery.trim() ? null : (
                  <Text style={styles.hintText}>Search to add people</Text>
                )
              }
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// Lifted verbatim from GroupInfoScreen (the chip rules and the sheet rules)
// so the two pickers stay pixel-identical.
const styles = StyleSheet.create({
  // The sheet already pads 20 all round, so the row only needs its own
  // bottom gap. Inactive chips sit a shade darker than the sheet, like the
  // search field above them -- on the sheet colour they were invisible.
  roleChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
  },
  roleChipActive: {
    borderColor: '#8b5cf6',
    backgroundColor: '#8b5cf6',
  },
  roleChipText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  roleChipTextActive: {
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
  },
  // Leaves a dim strip above the sheet that the keyboard can never cover, so
  // the backdrop stays tappable and the sheet clears the notch.
  modalKeyboardView: {
    flex: 1,
    paddingTop: 56,
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    padding: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalClose: {
    color: '#fff',
    fontSize: 20,
    lineHeight: 22,
  },
  searchInput: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    marginBottom: 12,
  },
  searchResultsList: {
    flex: 1,
  },
  searchResultsContent: {
    paddingBottom: 12,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
  },
  resultAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  resultInitial: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  resultName: {
    color: '#fff',
    fontSize: 15,
    flex: 1,
  },
  addIcon: {
    color: '#10B981',
    fontSize: 20,
    fontWeight: '600',
  },
  errorText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 12,
  },
  hintText: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
