import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  FlatList,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  parent: 'Parent',
  player: 'Player',
  head_coach: 'Head Coach',
  assistant_coach: 'Assistant Coach',
  team_manager: 'Team Manager',
  club_admin: 'Club Admin',
  platform_admin: 'Platform Admin',
  content_creator: 'Content Creator',
  sales_director: 'Sales Director',
  evaluator: 'Evaluator',
};

const ROLE_ICONS: Record<string, string> = {
  parent: '👨‍👩‍👧',
  player: '⚽',
  head_coach: '📋',
  assistant_coach: '🏃',
  team_manager: '📊',
  club_admin: '🏢',
  platform_admin: '👑',
  content_creator: '🎬',
  sales_director: '💼',
  evaluator: '📝',
};

export function RoleSwitcher() {
  const { roles, currentRole, switchRole } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);

  if (!currentRole || roles.length <= 1) {
    return null;
  }

  const getRoleDisplayName = (role: any) => {
    const label = ROLE_LABELS[role.role] || role.role;
    if (role.team?.name) return `${label} - ${role.team.name}`;
    if (role.club?.name) return `${label} - ${role.club.name}`;
    if (role.player) return `${label} - ${role.player.first_name}`;
    return label;
  };

  const handleSelectRole = (role: any) => {
    switchRole(role);
    setModalVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.currentRoleButton}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.roleIcon}>
          {ROLE_ICONS[currentRole.role] || '👤'}
        </Text>
        <View style={styles.roleInfo}>
          <Text style={styles.roleLabel}>
            {ROLE_LABELS[currentRole.role] || currentRole.role}
          </Text>
          <Text style={styles.roleEntity} numberOfLines={1}>
            {currentRole.team?.name || currentRole.club?.name || ''}
          </Text>
        </View>
        <Text style={styles.switchIcon}>▼</Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.modalTitle}>Switch Role</Text>

            <FlatList
              data={roles}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.roleOption,
                    currentRole.id === item.id && styles.roleOptionActive,
                  ]}
                  onPress={() => handleSelectRole(item)}
                >
                  <Text style={styles.roleOptionIcon}>
                    {ROLE_ICONS[item.role] || '👤'}
                  </Text>
                  <Text
                    style={[
                      styles.roleOptionText,
                      currentRole.id === item.id && styles.roleOptionTextActive,
                    ]}
                  >
                    {getRoleDisplayName(item)}
                  </Text>
                  {currentRole.id === item.id && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  currentRoleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a4e',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  roleIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  roleInfo: {
    flex: 1,
  },
  roleLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  roleEntity: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  switchIcon: {
    color: '#8b5cf6',
    fontSize: 12,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    width: '85%',
    maxHeight: '70%',
    padding: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#2a2a4e',
  },
  roleOptionActive: {
    backgroundColor: '#8b5cf6',
  },
  roleOptionIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  roleOptionText: {
    color: '#fff',
    fontSize: 15,
    flex: 1,
  },
  roleOptionTextActive: {
    fontWeight: '600',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
