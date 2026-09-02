import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/** Per-channel role from comm_channel_members.role -- not the global app role. */
type ChannelRole = 'admin' | 'member';
type MemberLabelKind = 'staff' | 'player' | 'parent' | null;

/** One row of get_channel_members(p_channel_id). */
interface ChannelMemberRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  channel_role: ChannelRole;
  joined_at: string | null;
  label_kind: MemberLabelKind;
  child_names: string | null;
}

/** One candidate from search_chat_contacts, shaped like the new-chat picker. */
interface ContactResult {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

/** The picker fires on every keystroke, and each keystroke is an RPC round trip. */
const SEARCH_DEBOUNCE_MS = 300;

/** Row subtitle. Only a parent carries a child suffix; staff and players never do. */
function memberSubtitle(row: ChannelMemberRow): string | null {
  switch (row.label_kind) {
    case 'staff':
      return 'Staff';
    case 'player':
      return 'Player';
    case 'parent':
      return row.child_names ? `Parent of ${row.child_names}` : 'Parent';
    default:
      return null;
  }
}

export default function GroupInfoScreen({ route, navigation }: any) {
  const { channelId } = route.params;
  const { user } = useAuth();

  const [channel, setChannel] = useState<any>(null);
  const [members, setMembers] = useState<ChannelMemberRow[]>([]);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ContactResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest-wins: a slower earlier keystroke must not overwrite a newer result.
  const searchSeqRef = useRef(0);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');

  // Membership comes from one SECURITY DEFINER RPC: RLS does not let a regular
  // parent/player read another member's profile or channel row directly, which
  // is why the old four-query version rendered "Unknown" and no roles.
  const fetchGroupInfo = useCallback(async () => {
    const failures: string[] = [];

    const { data: channelData, error: channelError } = await supabase
      .from('comm_channels')
      .select('*')
      .eq('id', channelId)
      .single();

    if (channelError) {
      if (__DEV__) {
        console.error('[GroupInfoScreen] channel read failed:', channelError);
      }
      failures.push('group details');
    } else {
      setChannel(channelData);
      setNewName(channelData?.name || '');
    }

    const { data, error } = await supabase.rpc('get_channel_members', {
      p_channel_id: channelId,
    });

    if (error) {
      if (__DEV__) {
        console.error('[GroupInfoScreen] get_channel_members failed:', error);
      }
      setMembers([]);
      setMembersError('Could not load members.');
      failures.push('members');
    } else {
      setMembers((data || []) as ChannelMemberRow[]);
      setMembersError(null);
    }

    if (failures.length > 0) {
      Alert.alert('Error', `Could not load ${failures.join(' and ')}.`);
    }
  }, [channelId]);

  useEffect(() => {
    fetchGroupInfo();
  }, [fetchGroupInfo]);

  // Only a channel admin may rename the group or change its membership.
  const isAdmin =
    members.find((r) => r.user_id === user?.id)?.channel_role === 'admin';

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
          console.error('[GroupInfoScreen] search_chat_contacts failed:', error);
        }
        setSearchResults([]);
        setSearchError('Search unavailable');
        return;
      }

      const existingIds = new Set(members.map((m) => m.user_id));
      const filtered = (contacts || [])
        .map((c: any) => ({
          id: c.user_id,
          full_name: c.display_name ?? null,
          avatar_url: c.avatar_url ?? null,
        }))
        .filter((p: ContactResult) => !existingIds.has(p.id));
      setSearchError(null);
      setSearchResults(filtered);
    },
    [members]
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
    if (showAddMemberModal) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = null;
    searchSeqRef.current += 1;
    setSearchError(null);
  }, [showAddMemberModal]);

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
      if (__DEV__) {
        console.error('[GroupInfoScreen] add member failed:', error);
      }
      Alert.alert('Error', 'Could not add member');
      return;
    }

    setShowAddMemberModal(false);
    setSearchQuery('');
    setSearchResults([]);
    fetchGroupInfo();
  };

  const updateGroupName = async () => {
    if (!newName.trim()) return;

    const { data, error } = await supabase
      .from('comm_channels')
      .update({ name: newName.trim() })
      .eq('id', channelId)
      .select('id');

    // RLS filters a denied write out silently: PostgREST returns no error and
    // no rows. An empty result is a refusal, not a success.
    if (error || !data || data.length === 0) {
      if (__DEV__) {
        console.error('[GroupInfoScreen] rename failed:', error);
      }
      Alert.alert('Error', 'Could not rename group');
      return;
    }

    setEditingName(false);
    fetchGroupInfo();
  };

  const removeMember = (target: ChannelMemberRow) => {
    Alert.alert(
      'Remove Member',
      `Remove ${target.full_name || 'this member'} from the group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const { data, error } = await supabase
              .from('comm_channel_members')
              .delete()
              .eq('channel_id', channelId)
              .eq('user_id', target.user_id)
              .select('user_id');

            if (error || !data || data.length === 0) {
              if (__DEV__) {
                console.error('[GroupInfoScreen] remove member failed:', error);
              }
              Alert.alert('Error', 'Could not remove member');
              return;
            }

            fetchGroupInfo();
          },
        },
      ]
    );
  };

  const leaveGroup = () => {
    if (!user?.id) {
      Alert.alert('Error', 'Could not leave group');
      return;
    }

    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            const { data, error } = await supabase
              .from('comm_channel_members')
              .delete()
              .eq('channel_id', channelId)
              .eq('user_id', user.id)
              .select('user_id');

            // Navigating away on a denied delete makes a failure look like a
            // success -- the user stays in the group but never sees it again.
            if (error || !data || data.length === 0) {
              if (__DEV__) {
                console.error('[GroupInfoScreen] leave failed:', error);
              }
              Alert.alert('Error', 'Could not leave group');
              return;
            }

            // GroupInfo sits on ChatStack above TeamChatRoom, so a plain
            // goBack() lands on the room they just left. Popping the stack
            // lands on Conversations -- the chat list -- instead.
            if (navigation.canGoBack()) {
              navigation.popToTop();
            } else {
              navigation.navigate('Main', {
                screen: 'ChatTab',
                params: { screen: 'Conversations' },
              });
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Info</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.section}>
        <View style={styles.groupNameContainer}>
          {isAdmin && editingName ? (
            <View style={styles.editNameRow}>
              <TextInput
                style={styles.nameInput}
                value={newName}
                onChangeText={setNewName}
                placeholderTextColor="#6B7280"
                autoFocus
              />
              <TouchableOpacity onPress={updateGroupName}>
                <Text style={styles.saveButton}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : isAdmin ? (
            <TouchableOpacity onPress={() => setEditingName(true)} style={styles.nameRow}>
              <Text style={styles.groupName}>{channel?.name}</Text>
              <Text style={styles.editIcon}>✏️</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.groupName}>{channel?.name}</Text>
          )}
          <Text style={styles.memberCount}>{members.length} members</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Members</Text>
          {isAdmin ? (
            <TouchableOpacity onPress={() => setShowAddMemberModal(true)}>
              <Text style={styles.addButton}>+ Add</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {membersError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{membersError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchGroupInfo}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={members}
            keyExtractor={(item) => item.user_id}
            renderItem={({ item }) => {
              const subtitle = memberSubtitle(item);
              return (
                <View style={styles.memberItem}>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberInitial}>
                      {item.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{item.full_name}</Text>
                    {subtitle ? (
                      <Text style={styles.memberRole}>{subtitle}</Text>
                    ) : null}
                  </View>
                  {item.channel_role === 'admin' ? (
                    <Text style={styles.adminBadge}>Admin</Text>
                  ) : null}
                  {isAdmin && item.user_id !== user?.id ? (
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeMember(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.removeButtonText}>Remove</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            }}
          />
        )}
      </View>

      <TouchableOpacity style={styles.leaveButton} onPress={leaveGroup}>
        <Text style={styles.leaveButtonText}>Leave Group</Text>
      </TouchableOpacity>

      <Modal
        visible={showAddMemberModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          Keyboard.dismiss();
          setShowAddMemberModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          {/* Escape route: the dim area outside the sheet dismisses the keyboard
              and closes the picker. Without it the overlay swallowed every tap. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close add members"
            onPress={() => {
              Keyboard.dismiss();
              setShowAddMemberModal(false);
            }}
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
                  onPress={() => setShowAddMemberModal(false)}
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

              <FlatList
                data={searchResults}
                style={styles.searchResultsList}
                contentContainerStyle={styles.searchResultsContent}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
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
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 20,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  section: {
    padding: 16,
  },
  groupNameContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginRight: 8,
  },
  editIcon: {
    fontSize: 16,
  },
  memberCount: {
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 4,
  },
  editNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameInput: {
    backgroundColor: '#1e293b',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    fontSize: 18,
    flex: 1,
    marginRight: 8,
  },
  saveButton: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  addButton: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '600',
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    color: '#fff',
    fontSize: 15,
  },
  memberRole: {
    color: '#10B981',
    fontSize: 12,
    marginTop: 2,
  },
  adminBadge: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '600',
  },
  leaveButton: {
    margin: 16,
    padding: 16,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    alignItems: 'center',
  },
  leaveButtonText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
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
  errorBox: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  errorText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 12,
  },
  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: '#1e293b',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '600',
  },
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
});
