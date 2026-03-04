import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import type { BoardVoteParticipant } from '../../hooks/useBoardVoteView';

const STATUS_COLORS = {
  yes: '#10b981',
  no: '#ef4444',
  pending: '#f59e0b',
  unread: '#475569',
} as const;

const STATUS_LABELS = {
  yes: 'Yes',
  no: 'No',
  pending: 'Pending',
  unread: 'Unread',
} as const;

interface VoterSeatProps {
  participant: BoardVoteParticipant;
  size?: 'normal' | 'small';
  isSelected: boolean;
  onPress: () => void;
}

export function VoterSeat({
  participant,
  size = 'normal',
  isSelected,
  onPress,
}: VoterSeatProps) {
  const color = STATUS_COLORS[participant.status];
  const sizeNum = size === 'small' ? 36 : 48;
  const fontSize = size === 'small' ? 12 : 16;

  return (
    <>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={[
          styles.seat,
          {
            width: sizeNum,
            height: sizeNum,
            borderRadius: sizeNum / 2,
            backgroundColor: color,
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: isSelected ? 12 : 8,
            elevation: isSelected ? 8 : 4,
            transform: [{ scale: isSelected ? 1.1 : 1 }],
          },
        ]}
      >
        <Text
          style={[styles.initials, { fontSize }]}
        >
          {participant.initials}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={isSelected}
        transparent
        animationType="fade"
        onRequestClose={onPress}
      >
        <Pressable style={styles.modalOverlay} onPress={onPress}>
          <Pressable style={styles.popupCard} onPress={(e) => e.stopPropagation()}>
            <View
              style={[
                styles.popupBadge,
                { backgroundColor: STATUS_COLORS[participant.status] },
              ]}
            >
              <Text style={styles.popupInitials}>{participant.initials}</Text>
            </View>
            <Text style={styles.popupName}>{participant.name}</Text>
            <Text style={styles.popupRole}>{participant.role}</Text>
            <View
              style={[
                styles.popupStatus,
                { backgroundColor: STATUS_COLORS[participant.status] },
              ]}
            >
              <Text style={styles.popupStatusText}>
                {STATUS_LABELS[participant.status]}
                {participant.optionText &&
                  participant.status !== 'pending' &&
                  participant.status !== 'unread' &&
                  ` (${participant.optionText})`}
              </Text>
            </View>
            {participant.comment ? (
              <View style={styles.popupComment}>
                <Text style={styles.popupCommentLabel}>Comment</Text>
                <Text style={styles.popupCommentText}>{participant.comment}</Text>
              </View>
            ) : null}
            <TouchableOpacity style={styles.popupClose} onPress={onPress}>
              <Text style={styles.popupCloseText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  seat: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  initials: {
    fontWeight: '700',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    width: 280,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  popupBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  popupInitials: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  popupName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  popupRole: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 12,
  },
  popupStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  popupStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  popupComment: {
    alignSelf: 'stretch',
    backgroundColor: '#334155',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  popupCommentLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 4,
  },
  popupCommentText: {
    fontSize: 14,
    color: '#e2e8f0',
  },
  popupClose: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
  },
  popupCloseText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
