import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  parent: 'Parent',
  player: 'Player',
  head_coach: 'Head Coach',
  assistant_coach: 'Assistant Coach',
  team_manager: 'Team Manager',
  club_admin: 'Club Admin',
  club_director: 'Club Director',
  platform_admin: 'Platform Admin',
  content_creator: 'Content Creator',
  sales_director: 'Sales Director',
  evaluator: 'Evaluator',
};

interface RoleIconConfig {
  name: string;
  color: string;
}

const ROLE_ICON_MAP: Record<string, RoleIconConfig> = {
  head_coach:       { name: 'megaphone',            color: '#c4b5fd' },
  assistant_coach:  { name: 'flag',                 color: '#a78bfa' },
  club_admin:       { name: 'business',             color: '#8b5cf6' },
  club_director:    { name: 'star',                 color: '#7c3aed' },
  team_manager:     { name: 'clipboard',            color: '#6d28d9' },
  parent:           { name: 'heart',                color: '#ddd6fe' },
  player:           { name: 'football',             color: '#ede9fe' },
  platform_admin:   { name: 'settings',             color: '#a855f7' },
  content_creator:  { name: 'brush',                color: '#a78bfa' },
  sales_director:   { name: 'trending-up',          color: '#a78bfa' },
  evaluator:        { name: 'document-text',        color: '#a78bfa' },
};

const DEFAULT_ICON: RoleIconConfig = { name: 'person-outline', color: '#a78bfa' };

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function RoleIconCircle({ role, size = 40 }: { role: string; size?: number }) {
  const config = ROLE_ICON_MAP[role] ?? DEFAULT_ICON;
  return (
    <View
      style={[
        styles.iconCircle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: hexToRgba(config.color, 0.15),
        },
      ]}
    >
      <Ionicons name={config.name as any} size={size * 0.55} color={config.color} />
    </View>
  );
}

interface RoleSwitcherProps {
  embedded?: boolean;
}

export function RoleSwitcher({ embedded }: RoleSwitcherProps) {
  const { roles, currentRole, switchRole } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);

  if (!currentRole || roles.length <= 1) {
    return null;
  }

  const getRoleDisplayName = (role: any) => {
    const label = ROLE_LABELS[role.role] || role.role;
    if (role.entityName) return `${label} - ${role.entityName}`;
    if (role.team?.name) return `${label} - ${role.team.name}`;
    if (role.club?.name) return `${label} - ${role.club.name}`;
    if (role.player) return `${label} - ${role.player.first_name} ${role.player.last_name}`;
    return label;
  };

  const handleSelectRole = (role: any) => {
    switchRole(role);
    setModalVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.currentRoleButton,
          embedded && styles.currentRoleButtonEmbedded,
        ]}
        onPress={() => setModalVisible(true)}
      >
        <RoleIconCircle role={currentRole.role} size={40} />
        <View style={styles.roleInfo}>
          <Text style={styles.roleLabel}>
            {ROLE_LABELS[currentRole.role] || currentRole.role}
          </Text>
          <Text style={styles.roleEntity} numberOfLines={1}>
            {currentRole.entityName || currentRole.team?.name || currentRole.club?.name || ''}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={14} color="#8b5cf6" style={styles.chevron} />
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
                  <RoleIconCircle role={item.role} size={40} />
                  <Text
                    style={[
                      styles.roleOptionText,
                      currentRole.id === item.id && styles.roleOptionTextActive,
                    ]}
                  >
                    {getRoleDisplayName(item)}
                  </Text>
                  {currentRole.id === item.id && (
                    <Ionicons name="checkmark" size={18} color="#fff" />
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
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 4,
  },
  currentRoleButtonEmbedded: {
    marginHorizontal: 0,
    marginVertical: 0,
  },
  iconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
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
  chevron: {
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#2a2a4e',
  },
  roleOptionActive: {
    backgroundColor: '#8b5cf6',
  },
  roleOptionText: {
    color: '#fff',
    fontSize: 15,
    flex: 1,
    marginLeft: 4,
  },
  roleOptionTextActive: {
    fontWeight: '600',
  },
});
