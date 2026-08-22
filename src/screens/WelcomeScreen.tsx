import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../lib/supabase';
import type { RootStackParamList } from '../navigation/linking';

const escapeIlike = (s: string) => s.replace(/[%_\\]/g, (m) => '\\' + m);

// Accept a bare code (e.g. "upsl-premier-0F05E4") or a full share URL
// (e.g. "https://thryvyng.com/join-team/upsl-premier/upsl-premier-0F05E4")
// and return the last non-scheme path segment.
const extractCodeFromInput = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withoutQuery = trimmed.split(/[?#]/)[0];
  const segments = withoutQuery
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.includes(':'));
  return (segments[segments.length - 1] || withoutQuery).trim();
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Welcome'>;

export const WelcomeScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  const [showCodeModal, setShowCodeModal] = useState(false);
  const [invitationCode, setInvitationCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [codeError, setCodeError] = useState('');
  const codeInputRef = useRef<TextInput>(null);

  // Auto-focus the code input when the modal opens. A small delay lets the
  // slide-in animation settle before the keyboard is requested.
  useEffect(() => {
    if (!showCodeModal) return;
    const t = setTimeout(() => codeInputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [showCodeModal]);

  const handlePasteCode = async () => {
    try {
      const clip = await Clipboard.getStringAsync();
      const extracted = extractCodeFromInput(clip);
      if (!extracted) return;
      setInvitationCode(extracted);
      setCodeError('');
    } catch (err) {
      if (__DEV__) console.warn('[Welcome] Clipboard read failed:', err);
    }
  };

  const validateAndRouteCode = async () => {
    // Normalize once more in case the user typed or OS-pasted a full URL
    // directly into the field. Bare codes pass through unchanged.
    const code = extractCodeFromInput(invitationCode).trim();

    if (!code) {
      setCodeError('Please enter an invitation code');
      return;
    }

    setIsValidating(true);
    setCodeError('');

    try {
      if (__DEV__) console.log('[Welcome] Validating code:', code);

      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('id, invitation_code, status')
        .ilike('invitation_code', escapeIlike(code))
        .single();

      if (teamData && !teamError) {
        if (__DEV__) console.log('[Welcome] Found team invitation');
        setShowCodeModal(false);
        setInvitationCode('');
        navigation.navigate('JoinTeam', { code });
        return;
      }

      const { data: staffData, error: staffError } = await supabase
        .from('team_staff_invitations')
        .select('id, code, used_at')
        .ilike('code', escapeIlike(code))
        .single();

      if (staffData && !staffError) {
        if (staffData.used_at) {
          setCodeError('This invitation has already been used');
          return;
        }
        if (__DEV__) console.log('[Welcome] Found staff invitation');
        setShowCodeModal(false);
        setInvitationCode('');
        navigation.navigate('JoinStaff', { code });
        return;
      }

      setCodeError('Invalid invitation code. Please check and try again.');
    } catch (err) {
      if (__DEV__) console.error('[Welcome] Code validation error:', err);
      setCodeError('Something went wrong. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.logoSection}>
          <Text style={styles.logoEmoji}>🏆</Text>
          <Text style={styles.logoText}>Thryvyng</Text>
          <Text style={styles.tagline}>Elevating Youth Soccer</Text>
        </View>

        <View style={styles.optionsSection}>
        <TouchableOpacity
          style={styles.primaryOptionCard}
          onPress={() => setShowCodeModal(true)}
        >
          <View style={styles.primaryOptionIcon}>
            <Ionicons name="ticket" size={26} color="#FFFFFF" />
          </View>
          <View style={styles.primaryOptionContent}>
            <Text style={styles.primaryOptionTitle}>I have an invitation code</Text>
            <Text style={styles.primaryOptionDescription}>
              Tapped a team link before installing? Enter or paste your code here.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.secondaryButtonText}>Sign In</Text>
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>New to Thryvyng?</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate('RegisterTeam')}
        >
          <View style={styles.optionIcon}>
            <Ionicons name="people-outline" size={24} color="#8B5CF6" />
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>Register a Team</Text>
            <Text style={styles.optionDescription}>
              I'm a coach or team manager
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate('RegisterClub')}
        >
          <View style={styles.optionIcon}>
            <Ionicons name="shield-outline" size={24} color="#8B5CF6" />
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>For Club Owners</Text>
            <Text style={styles.optionDescription}>Partner with Thryvyng</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6B7280" />
        </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By continuing, you agree to our Terms of Service and Privacy Policy
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={showCodeModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCodeModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enter Invitation Code</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowCodeModal(false);
                  setInvitationCode('');
                  setCodeError('');
                }}
              >
                <Ionicons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDescription}>
              Enter the code from your team manager or coach
            </Text>

            <View style={styles.inputRow}>
              <TextInput
                ref={codeInputRef}
                style={[styles.codeInput, { flex: 1 }, codeError && styles.codeInputError]}
                value={invitationCode}
                onChangeText={(text) => {
                  setInvitationCode(text);
                  setCodeError('');
                }}
                placeholder="e.g., UPS-RV2RLR"
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={120}
                returnKeyType="go"
                onSubmitEditing={validateAndRouteCode}
              />
              <TouchableOpacity
                style={styles.pasteButton}
                onPress={handlePasteCode}
                accessibilityLabel="Paste invitation code from clipboard"
              >
                <Ionicons name="clipboard-outline" size={18} color="#A78BFA" />
                <Text style={styles.pasteButtonText}>Paste</Text>
              </TouchableOpacity>
            </View>

            {codeError ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color="#EF4444" />
                <Text style={styles.errorText}>{codeError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.validateButton,
                isValidating && styles.validateButtonDisabled,
              ]}
              onPress={validateAndRouteCode}
              disabled={isValidating}
            >
              {isValidating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.validateButtonText}>Continue</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.modalHelp}>
              Don't have a code? Contact your team manager or coach to receive an
              invitation.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    padding: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  logoSection: {
    flexShrink: 0,
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 8,
    marginBottom: 32,
  },
  logoEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  logoText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 18,
    color: '#9CA3AF',
  },
  optionsSection: {
    flex: 1,
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  primaryOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF6',
    borderRadius: 14,
    padding: 18,
    marginTop: 8,
    marginBottom: 16,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  primaryOptionContent: {
    flex: 1,
  },
  primaryOptionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  primaryOptionDescription: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 18,
  },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#8B5CF6',
    backgroundColor: 'transparent',
    marginBottom: 24,
  },
  secondaryButtonText: {
    color: '#A78BFA',
    fontSize: 17,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#374151',
  },
  dividerText: {
    color: '#6B7280',
    fontSize: 14,
    marginHorizontal: 16,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2D2050',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  footer: {
    paddingVertical: 16,
  },
  footerText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 24,
  },
  codeInput: {
    backgroundColor: '#374151',
    borderRadius: 12,
    padding: 16,
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 2,
    borderWidth: 2,
    borderColor: '#374151',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  pasteButton: {
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4B5563',
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  pasteButtonText: {
    color: '#A78BFA',
    fontSize: 14,
    fontWeight: '600',
  },
  codeInputError: {
    borderColor: '#EF4444',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
  },
  validateButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  validateButtonDisabled: {
    opacity: 0.6,
  },
  validateButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  modalHelp: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
});

export default WelcomeScreen;
