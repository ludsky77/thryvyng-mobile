import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../lib/supabase';

// Values must match the coparent_invitations_invitee_relationship_check
// constraint exactly: lowercase, no hyphen. Labels are display-only.
const RELATIONSHIP_OPTIONS: { value: string; label: string }[] = [
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'stepparent', label: 'Step-parent' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'other', label: 'Other' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface InviteCoParentModalProps {
  visible: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;
  teamName: string;
  invitedBy: string;
}

export default function InviteCoParentModal({
  visible,
  onClose,
  playerId,
  playerName,
  teamName,
  invitedBy,
}: InviteCoParentModalProps) {
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState<string | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [emailFailed, setEmailFailed] = useState(false);

  const sent = !!inviteLink;

  const resetAndClose = () => {
    setEmail('');
    setRelationship(null);
    setEmailFocused(false);
    setSending(false);
    setErrorMessage('');
    setInviteLink('');
    setEmailFailed(false);
    onClose();
  };

  const handleSend = async () => {
    const emailNorm = email.trim().toLowerCase();

    if (!EMAIL_RE.test(emailNorm)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!relationship) {
      setErrorMessage('Please select a relationship.');
      return;
    }

    setErrorMessage('');
    setSending(true);

    try {
      // Duplicate check: a pending invite to this email for this player already exists.
      const { data: existing, error: existingError } = await supabase
        .from('coparent_invitations')
        .select('id,status')
        .eq('player_id', playerId)
        .eq('invitee_email', emailNorm)
        .eq('status', 'pending')
        .maybeSingle();

      if (existingError) {
        setErrorMessage(existingError.message || 'Could not check existing invitations.');
        setSending(false);
        return;
      }

      if (existing) {
        setErrorMessage('An invitation to this email is already pending');
        setSending(false);
        return;
      }

      const { data: code, error: codeError } = await supabase.rpc('generate_coparent_code');

      if (codeError || !code) {
        setErrorMessage(codeError?.message || 'Could not generate an invitation code.');
        setSending(false);
        return;
      }

      const { error: insertError } = await supabase.from('coparent_invitations').insert({
        player_id: playerId,
        invited_by: invitedBy,
        invitee_email: emailNorm,
        invitee_relationship: relationship,
        invitation_code: code,
        status: 'pending',
      });

      if (insertError) {
        setErrorMessage(
          (insertError as any).code === '23505'
            ? 'An invitation to this email already exists'
            : insertError.message || 'Could not create the invitation.'
        );
        setSending(false);
        return;
      }

      const link = `https://thryvyng.com/accept-coparent/${code}`;

      // invoke() resolves with an error field instead of throwing, so check it explicitly.
      const { error: emailError } = await supabase.functions.invoke('send-email', {
        body: {
          to: emailNorm,
          subject: `You've been invited to join ${playerName}'s account - ${teamName}`,
          template: 'coparent-invitation',
          data: {
            playerName,
            teamName,
            inviteLink: link,
            relationship,
          },
        },
      });

      // The invitation row exists either way, so the success state still shows the link.
      setEmailFailed(!!emailError);
      setInviteLink(link);
      setSending(false);
    } catch (e: any) {
      setErrorMessage(e?.message ?? 'Something went wrong. Please try again.');
      setSending(false);
    }
  };

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(inviteLink);
      Alert.alert('Copied!', 'Invitation link copied to clipboard.');
    } catch {
      Alert.alert('Copy failed', 'Please select the link and copy it manually.');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={resetAndClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={resetAndClose} disabled={sending}>
            <Text style={styles.cancelText}>{sent ? 'Close' : 'Cancel'}</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Invite Co-Parent</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {sent ? (
            <View style={styles.card}>
              <View style={styles.successIconWrap}>
                <Feather
                  name={emailFailed ? 'alert-circle' : 'check-circle'}
                  size={48}
                  color={emailFailed ? '#F59E0B' : '#10B981'}
                />
              </View>
              <Text style={styles.successTitle}>
                {emailFailed ? 'Invitation Created' : 'Invitation Sent!'}
              </Text>
              <Text style={styles.successSubtitle}>
                {emailFailed
                  ? 'Invitation created but email failed to send. Share the link below.'
                  : `We emailed an invitation to ${email.trim().toLowerCase()}. You can also share the link below.`}
              </Text>

              <Text style={[styles.label, styles.labelSpaced]}>Invitation link</Text>
              <Text style={styles.linkText} selectable>
                {inviteLink}
              </Text>

              <TouchableOpacity style={styles.copyButton} onPress={() => void handleCopy()}>
                <Feather name="copy" size={16} color="#8b5cf6" />
                <Text style={styles.copyButtonText}>Copy Link</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.primaryButton} onPress={resetAndClose}>
                <Text style={styles.primaryButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.introText}>
                Invite another parent or guardian to access {playerName}'s account.
              </Text>

              <Text style={[styles.label, styles.labelSpaced]}>Email address</Text>
              <TextInput
                style={[styles.input, emailFocused && styles.inputFocused]}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                placeholder="coparent@example.com"
                placeholderTextColor="#64748b"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!sending}
              />

              <Text style={[styles.label, styles.labelSpaced]}>Relationship to player</Text>
              <View style={styles.optionGroup}>
                {RELATIONSHIP_OPTIONS.map((opt) => {
                  const selected = relationship === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.optionBtn, selected && styles.optionBtnSelected]}
                      onPress={() => setRelationship(opt.value)}
                      disabled={sending}
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

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <TouchableOpacity
                style={[styles.primaryButton, sending && styles.primaryButtonDisabled]}
                onPress={() => void handleSend()}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Send Invitation</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={resetAndClose}
                disabled={sending}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.bottomPad} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    // Clears the iOS status bar: fullScreen modals in this repo pad the header
    // rather than wrapping in a SafeAreaView (CreateEventModal, EditEventModal).
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0a0a1a',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  cancelText: { color: '#8b5cf6', fontSize: 16, fontWeight: '600' },
  headerSpacer: { width: 52 },
  scroll: { flex: 1, backgroundColor: '#0a0a1a' },
  scrollContent: { padding: 16, paddingBottom: 40, backgroundColor: '#0a0a1a' },
  card: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  introText: { color: '#cbd5e1', fontSize: 14, lineHeight: 20 },
  label: { color: '#e2e8f0', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  labelSpaced: { marginTop: 16 },
  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
  },
  inputFocused: { borderColor: '#8b5cf6' },
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
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#8b5cf6',
  },
  optionText: { color: '#e2e8f0', fontSize: 15 },
  optionTextSelected: { color: '#fff', fontWeight: '600' },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
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
  primaryButtonDisabled: { opacity: 0.75 },
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
  successIconWrap: { alignItems: 'center', marginBottom: 12 },
  successTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  successSubtitle: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  linkText: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#8b5cf6',
    fontSize: 14,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#8b5cf6',
    minHeight: 48,
  },
  copyButtonText: { color: '#8b5cf6', fontSize: 15, fontWeight: '600' },
  bottomPad: { height: 24 },
});
