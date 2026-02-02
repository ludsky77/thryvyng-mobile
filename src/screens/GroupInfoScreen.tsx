import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatRoleLabel } from '../lib/chatHelpers';

interface MemberProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role?: string;
}

export default function GroupInfoScreen({ route, navigation }: any) {
  const { channelId } = route.params;
  const { user } = useAuth();

  const [channel, setChannel] = useState<any>(null);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemberProfile[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');

  const fetchGroupInfo = useCallback(async () => {
    const { data: channelData } = await supabase
      .from('comm_channels')
      .select('*')
      .eq('id', channelId)
      .single();

    setChannel(channelData);
    setNewName(channelData?.name || '');

    const { data: memberData } = await supabase
      .from('comm_channel_members')
      .select('user_id')
      .eq('channel_id', channelId);

    const userIds = (memberData || []).map((m: any) => m.user_id);
    if (userIds.length === 0) {
      setMembers([]);
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds);

    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', userIds);

    const roleMap = new Map<string, string>();
    (roles || []).forEach((r: any) => {
      roleMap.set(r.user_id, r.role);
    });

    const profileMap = new Map(
      (profiles || []).map((p: any) => [p.id, { ...p, role: roleMap.get(p.id) }])
    );

    const enrichedMembers = userIds.map(
      (uid) => profileMap.get(uid) || { id: uid, full_name: 'Unknown', avatar_url: null, role: undefined }
    );
    setMembers(enrichedMembers);
  }, [channelId]);

  useEffect(() => {
    fetchGroupInfo();
  }, [fetchGroupInfo]);

  const searchUsersToAdd = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .ilike('full_name', `%${query}%`)
      .limit(20);

    const existingIds = members.map((m) => m.id);
    const filtered = (data || []).filter((p: any) => !existingIds.includes(p.id));
    setSearchResults(filtered);
  };

  const addMember = async (newMember: MemberProfile) => {
    const { error } = await supabase.from('comm_channel_members').insert({
      channel_id: channelId,
      user_id: newMember.id,
    });

    if (!error) {
      setMembers((prev) => [...prev, { ...newMember, role: undefined }]);
      setShowAddMemberModal(false);
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  const updateGroupName = async () => {
    if (!newName.trim()) return;

    const { error } = await supabase
      .from('comm_channels')
      .update({ name: newName.trim() })
      .eq('id', channelId);

    if (!error) {
      setChannel((prev: any) => ({ ...prev, name: newName.trim() }));
      setEditingName(false);
    }
  };

  const leaveGroup = () => {
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await supabase
              .from('comm_channel_members')
              .delete()
              .eq('channel_id', channelId)
              .eq('user_id', user?.id);
            navigation.getParent()?.goBack();
            navigation.goBack();
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
          {editingName ? (
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
          ) : (
            <TouchableOpacity onPress={() => setEditingName(true)} style={styles.nameRow}>
              <Text style={styles.groupName}>{channel?.name}</Text>
              <Text style={styles.editIcon}>✏️</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.memberCount}>{members.length} members</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Members</Text>
          <TouchableOpacity onPress={() => setShowAddMemberModal(true)}>
            <Text style={styles.addButton}>+ Add</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.memberItem}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberInitial}>
                  {item.full_name?.charAt(0)?.toUpperCase() || '?'}
                </Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{item.full_name}</Text>
                {item.role ? (
                  <Text style={styles.memberRole}>{formatRoleLabel(item.role)}</Text>
                ) : null}
              </View>
              {item.id === channel?.created_by ? (
                <Text style={styles.adminBadge}>Admin</Text>
              ) : null}
            </View>
          )}
        />
      </View>

      <TouchableOpacity style={styles.leaveButton} onPress={leaveGroup}>
        <Text style={styles.leaveButtonText}>Leave Group</Text>
      </TouchableOpacity>

      <Modal visible={showAddMemberModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Members</Text>
              <TouchableOpacity onPress={() => setShowAddMemberModal(false)}>
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
                searchUsersToAdd(text);
              }}
            />

            <FlatList
              data={searchResults}
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
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
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
  modalClose: {
    color: '#9CA3AF',
    fontSize: 24,
  },
  searchInput: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    marginBottom: 12,
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
});
