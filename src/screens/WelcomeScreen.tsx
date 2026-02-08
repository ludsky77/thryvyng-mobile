import React, { useState } from 'react';
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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import type { RootStackParamList } from '../navigation/linking';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Welcome'>;

export const WelcomeScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  const [showCodeModal, setShowCodeModal] = useState(false);
  const [invitationCode, setInvitationCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [codeError, setCodeError] = useState('');

  const validateAndRouteCode = async () => {
    const code = invitationCode.trim().toUpperCase();

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
        .eq('invitation_code', code)
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
        .eq('code', code)
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
      <View style={styles.logoSection}>
        <Text style={styles.logoEmoji}>🏆</Text>
        <Text style={styles.logoText}>Thryvyng</Text>
        <Text style={styles.tagline}>Elevating Youth Soccer</Text>
      </View>

      <View style={styles.optionsSection}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.primaryButtonText}>Sign In</Text>
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>New to Thryvyng?</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => setShowCodeModal(true)}
        >
          <View style={styles.optionIcon}>
            <Ionicons name="ticket-outline" size={24} color="#8B5CF6" />
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>I have an invitation code</Text>
            <Text style={styles.optionDescription}>
              Join a team as player or staff
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6B7280" />
        </TouchableOpacity>

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

            <TextInput
              style={[styles.codeInput, codeError && styles.codeInputError]}
              value={invitationCode}
              onChangeText={(text) => {
                setInvitationCode(text.toUpperCase());
                setCodeError('');
              }}
              placeholder="e.g., UPS-RV2RLR"
              placeholderTextColor="#6B7280"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
            />

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
  logoSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
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
    flex: 2,
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
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
