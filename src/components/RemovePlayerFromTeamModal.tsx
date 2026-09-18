import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';

/**
 * Every user-facing string for this flow, in one place. The app has no i18n
 * system (no dependency, no resource files, no t() helper), so these are plain
 * English literals; keeping them collected here means a future i18n pass swaps
 * this one object for lookups instead of hunting the JSX.
 */
export const COPY = {
  title: 'Remove from Team',
  checking: 'Checking player records…',

  confirmIntro: (playerName: string, teamName: string) =>
    `Remove ${playerName} from ${teamName}?`,
  confirmBody:
    "They lose access to this team's roster, schedule, and chat. Their player profile and history stay intact.",

  reasonLabel: 'Reason for removal',
  reasonRequired: 'Please select a reason.',

  warnTitle: 'This player has active money records',
  warnBody:
    'There is a balance due and/or a payment still pending, processing, or failed. Removing this player from the team does NOT cancel, refund, or otherwise change any money record — those must be handled separately in billing.',

  blockedTitle: 'An admin is required',
  blockedBody:
    'This player has a balance due and/or an active payment. Only a club admin or platform admin can remove a player with active money records. Please contact your club admin.',

  cancel: 'Cancel',
  remove: 'Remove',
  removeAnyway: 'Remove anyway',
  close: 'Close',

  serverBlocked:
    'The server blocked this removal: the player still has active money records, and an admin is required.',
  serverWarn: 'The server reported active money records for this player.',
  genericError: 'Could not remove the player. Please try again.',
} as const;

/**
 * Values are stable English slugs written to the database by
 * remove_player_from_team; labels are display-only and safe to reword.
 */
export const REMOVAL_REASONS: { value: string; label: string }[] = [
  { value: 'duplicate', label: 'Duplicate player record' },
  { value: 'stopped_attending', label: 'Stopped attending' },
  { value: 'non_payment', label: 'Non-payment' },
  { value: 'guest_tournament_ended', label: 'Guest player — tournament ended' },
  { value: 'other', label: 'Other' },
];

/** Payment rows in any of these states count as active money. */
const ACTIVE_PAYMENT_STATUSES = ['pending', 'processing', 'failed'];

/** Raised by remove_player_from_team when active money blocks the removal. */
const MONEY_BLOCK_CODE = 'P0014';

type FlowState = 'checking' | 'clean' | 'warn' | 'blocked';

interface RemovePlayerFromTeamModalProps {
  visible: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;
  teamName: string;
  /** platform_admin, or club_admin for this team's club. Resolved by the caller. */
  isAdmin: boolean;
  /** Called after a successful RPC so the caller can refetch the roster. */
  onRemoved: () => void;
}

export default function RemovePlayerFromTeamModal({
  visible,
  onClose,
  playerId,
  playerName,
  teamName,
  isAdmin,
  onRemoved,
}: RemovePlayerFromTeamModalProps) {
  const [flowState, setFlowState] = useState<FlowState>('checking');
  const [reason, setReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  /**
   * Client-side money pre-check, used only to pick which of the three states to
   * show. It is deliberately fail-permissive: RLS may hide these tables from
   * team staff entirely, and a hidden row must not masquerade as a hard block.
   * The RPC is the real enforcer -- a removal that should not happen comes back
   * as P0014 and is handled at submit time.
   */
  const hasActiveMoney = useCallback(async (): Promise<boolean> => {
    try {
      const { data: regs, error: regError } = await supabase
        .from('program_registrations')
        .select('id, total_amount, amount_paid')
        .eq('player_id', playerId);

      if (regError || !regs) return false;

      const balanceDue = (regs as any[]).some(
        (r) => Number(r.total_amount ?? 0) - Number(r.amount_paid ?? 0) > 0
      );
      if (balanceDue) return true;

      const registrationIds = (regs as any[]).map((r) => r.id).filter(Boolean);
      if (registrationIds.length === 0) return false;

      const { data: payments, error: payError } = await supabase
        .from('registration_payments')
        .select('id')
        .in('registration_id', registrationIds)
        .in('status', ACTIVE_PAYMENT_STATUSES);

      if (payError || !payments) return false;

      return (payments as any[]).length > 0;
    } catch {
      return false;
    }
  }, [playerId]);

  // Re-run the pre-check each time the sheet opens for a player.
  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setFlowState('checking');
    setReason(null);
    setSubmitting(false);
    setErrorMessage('');

    void (async () => {
      const money = await hasActiveMoney();
      if (cancelled) return;
      if (!money) {
        setFlowState('clean');
        return;
      }
      setFlowState(isAdmin ? 'warn' : 'blocked');
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, isAdmin, hasActiveMoney]);

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleRemove = async () => {
    if (!reason) {
      setErrorMessage(COPY.reasonRequired);
      return;
    }

    setErrorMessage('');
    setSubmitting(true);

    try {
      const { error } = await supabase.rpc('remove_player_from_team', {
        p_player_id: playerId,
        p_reason: reason,
      });

      if (error) {
        // P0014 means the pre-check was wrong (or blind): the server found
        // active money. Fall back to the state the money status implies and
        // leave the flow open so the message is read in place.
        if ((error as any).code === MONEY_BLOCK_CODE) {
          setFlowState(isAdmin ? 'warn' : 'blocked');
          setErrorMessage(isAdmin ? COPY.serverWarn : COPY.serverBlocked);
        } else {
          setErrorMessage(error.message || COPY.genericError);
        }
        setSubmitting(false);
        return;
      }

      setSubmitting(false);
      onRemoved();
    } catch (e: any) {
      setErrorMessage(e?.message ?? COPY.genericError);
      setSubmitting(false);
    }
  };

  const renderReasonPicker = () => (
    <>
      <Text style={styles.label}>{COPY.reasonLabel}</Text>
      <View style={styles.optionGroup}>
        {REMOVAL_REASONS.map((opt) => {
          const selected = reason === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.optionBtn, selected && styles.optionBtnSelected]}
              onPress={() => setReason(opt.value)}
              disabled={submitting}
              activeOpacity={0.7}
            >
              <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                {selected ? <View style={styles.radioInner} /> : null}
              </View>
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  const renderBody = () => {
    if (flowState === 'checking') {
      return (
        <View style={styles.checkingWrap}>
          <ActivityIndicator color="#8b5cf6" />
          <Text style={styles.checkingText}>{COPY.checking}</Text>
        </View>
      );
    }

    if (flowState === 'blocked') {
      return (
        <>
          <View style={styles.noticeBlocked}>
            <Text style={styles.noticeTitle}>{COPY.blockedTitle}</Text>
            <Text style={styles.noticeBody}>{COPY.blockedBody}</Text>
          </View>
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          <TouchableOpacity style={styles.primaryButton} onPress={handleClose}>
            <Text style={styles.primaryButtonText}>{COPY.close}</Text>
          </TouchableOpacity>
        </>
      );
    }

    // 'clean' and 'warn' both allow removal, so both require a reason.
    return (
      <>
        <Text style={styles.confirmIntro}>{COPY.confirmIntro(playerName, teamName)}</Text>
        <Text style={styles.confirmBody}>{COPY.confirmBody}</Text>

        {flowState === 'warn' ? (
          <View style={styles.noticeWarn}>
            <Text style={styles.noticeTitle}>{COPY.warnTitle}</Text>
            <Text style={styles.noticeBody}>{COPY.warnBody}</Text>
          </View>
        ) : null}

        {renderReasonPicker()}

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <TouchableOpacity
          style={[styles.destructiveButton, submitting && styles.buttonDisabled]}
          onPress={() => void handleRemove()}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {flowState === 'warn' ? COPY.removeAnyway : COPY.remove}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleClose}
          disabled={submitting}
        >
          <Text style={styles.secondaryButtonText}>{COPY.cancel}</Text>
        </TouchableOpacity>
      </>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={handleClose}>
        <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{COPY.title}</Text>
            <TouchableOpacity onPress={handleClose} disabled={submitting}>
              <Text style={styles.modalClose}>{'✕'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {renderBody()}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  modalClose: { fontSize: 20, color: '#9CA3AF', padding: 4 },
  scroll: { flexGrow: 0 },
  scrollContent: { padding: 16 },
  checkingWrap: { paddingVertical: 32, alignItems: 'center' },
  checkingText: { color: '#cbd5e1', fontSize: 14, marginTop: 12 },
  confirmIntro: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  confirmBody: { color: '#cbd5e1', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  noticeWarn: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  noticeBlocked: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  noticeTitle: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 6 },
  noticeBody: { color: '#e2e8f0', fontSize: 14, lineHeight: 20 },
  label: { color: '#e2e8f0', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  optionGroup: { marginTop: 2 },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    minHeight: 48,
  },
  optionBtnSelected: { borderColor: '#8b5cf6' },
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
  radioOuterSelected: { borderColor: '#8b5cf6' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#8b5cf6' },
  optionText: { color: '#e2e8f0', fontSize: 15 },
  optionTextSelected: { color: '#fff', fontWeight: '600' },
  errorText: { color: '#EF4444', fontSize: 14, marginTop: 12, textAlign: 'center' },
  destructiveButton: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    minHeight: 52,
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    minHeight: 52,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.75 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  secondaryButtonText: { color: '#94a3b8', fontSize: 16, fontWeight: '600' },
});
