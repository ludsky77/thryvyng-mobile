import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface PendingAttachment {
  id: string;
  player_id: string;
  match_reason: 'secondary_parent_email' | 'pending_coparent_invitation';
  players: {
    first_name: string;
    last_name: string;
    teams: {
      name: string;
      clubs: {
        name: string;
      } | null;
    } | null;
  } | null;
}

export const PendingAttachmentsBanner: React.FC = () => {
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [resultMessage, setResultMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('pending_attachments')
        .select(`
          id,
          player_id,
          match_reason,
          players (
            first_name,
            last_name,
            teams (
              name,
              clubs (
                name
              )
            )
          )
        `)
        .eq('profile_id', user.id)
        .eq('status', 'pending');

      if (cancelled) return;
      if (error) {
        if (__DEV__) console.error('[PendingAttachmentsBanner] fetch error:', error);
        return;
      }
      setAttachments((data || []) as PendingAttachment[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setResultMessage({ text, type });
    setTimeout(() => setResultMessage(null), 3000);
  };

  const handleConfirm = async (attachment: PendingAttachment) => {
    setProcessing((prev) => new Set(prev).add(attachment.id));
    try {
      const { data, error } = await supabase.rpc('accept_pending_attachment', {
        p_attachment_id: attachment.id,
      });

      if (error) {
        const hint = (error as any).hint || (error as any).details;
        const message =
          hint === 'auth_required' ? 'Please log in again.' :
          hint === 'attachment_not_found' ? 'This invitation is no longer available.' :
          hint === 'not_attachment_owner' ? 'This invitation is not for your account.' :
          hint === 'attachment_already_resolved' ? 'This invitation was already handled.' :
          hint === 'player_not_found' ? 'The player record no longer exists.' :
          hint === 'unique_violation' ? 'Already linked.' :
          error.message || 'Could not confirm attachment.';
        showMessage(message, 'error');
        return;
      }

      if (!data?.success) {
        showMessage('Could not confirm attachment.', 'error');
        return;
      }

      const playerName = attachment.players
        ? `${attachment.players.first_name} ${attachment.players.last_name}`
        : 'your player';
      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
      showMessage(`Linked to ${playerName}`, 'success');
    } catch (e: any) {
      if (__DEV__) console.error('[PendingAttachmentsBanner] confirm exception:', e);
      showMessage(e.message || 'Could not confirm attachment.', 'error');
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(attachment.id);
        return next;
      });
    }
  };

  const handleDismiss = async (attachment: PendingAttachment) => {
    setProcessing((prev) => new Set(prev).add(attachment.id));
    try {
      const { error } = await supabase
        .from('pending_attachments')
        .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
        .eq('id', attachment.id);

      if (error) {
        if (__DEV__) console.error('[PendingAttachmentsBanner] dismiss error:', error);
        showMessage('Could not dismiss.', 'error');
        return;
      }

      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
    } catch (e: any) {
      if (__DEV__) console.error('[PendingAttachmentsBanner] dismiss exception:', e);
      showMessage(e.message || 'Could not dismiss.', 'error');
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(attachment.id);
        return next;
      });
    }
  };

  if (attachments.length === 0 && !resultMessage) return null;

  return (
    <View style={styles.container}>
      {resultMessage && (
        <View
          style={[
            styles.toast,
            resultMessage.type === 'success' ? styles.toastSuccess : styles.toastError,
          ]}
        >
          <Text style={styles.toastText}>{resultMessage.text}</Text>
        </View>
      )}
      {attachments.map((attachment) => {
        const playerName = attachment.players
          ? `${attachment.players.first_name} ${attachment.players.last_name}`
          : 'a player';
        const teamName = attachment.players?.teams?.name || '';
        const clubName = attachment.players?.teams?.clubs?.name || '';
        const reasonCopy =
          attachment.match_reason === 'pending_coparent_invitation'
            ? 'You have a pending co-parent invitation'
            : 'You were listed as a parent or guardian';
        const isProcessing = processing.has(attachment.id);

        return (
          <View key={attachment.id} style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="person-add" size={22} color="#8B5CF6" />
            </View>
            <View style={styles.content}>
              <Text style={styles.reasonText}>{reasonCopy}</Text>
              <Text style={styles.playerName}>
                {playerName}
                {teamName ? (
                  <Text style={styles.teamText}>
                    {' — '}
                    {teamName}
                    {clubName ? ` (${clubName})` : ''}
                  </Text>
                ) : null}
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.confirmButton, isProcessing && styles.buttonDisabled]}
                  onPress={() => handleConfirm(attachment)}
                  disabled={isProcessing}
                  activeOpacity={0.8}
                >
                  {isProcessing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  )}
                  <Text style={styles.confirmButtonText}>Confirm — this is mine</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dismissButton}
                  onPress={() => handleDismiss(attachment)}
                  disabled={isProcessing}
                  activeOpacity={0.8}
                >
                  <Text style={styles.dismissButtonText}>Not me</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#8B5CF6',
    padding: 14,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  reasonText: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 4,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  teamText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#CBD5E1',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#8B5CF6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  dismissButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  dismissButtonText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  toast: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 4,
  },
  toastSuccess: {
    backgroundColor: '#16A34A',
  },
  toastError: {
    backgroundColor: '#DC2626',
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default PendingAttachmentsBanner;
