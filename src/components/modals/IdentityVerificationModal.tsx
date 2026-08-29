import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormInput, PasswordInput } from '../forms';
import { CaptchaWebView } from '../CaptchaModal';
import { CaptchaTimeoutError, CAPTCHA_TIMEOUT_MESSAGE } from '../../lib/captcha';

interface IdentityVerificationModalProps {
  visible: boolean;
  onClose: () => void;
  onVerified: (userId: string, email: string) => void;
  teamName?: string;
  /**
   * Optional: prefill the email field when the sheet opens, for callers that
   * already asked for the address (the JoinTeam entry gate). The field stays
   * editable. Omitting it leaves the previous behaviour untouched — the field
   * simply opens empty.
   */
  initialEmail?: string;
}

export const IdentityVerificationModal: React.FC<IdentityVerificationModalProps> = ({
  visible,
  onClose,
  onVerified,
  teamName,
  initialEmail,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const [captchaVisible, setCaptchaVisible] = useState(false);

  // Seed on the closed -> open transition only. Depending on `visible` alone
  // keeps a later change to initialEmail from overwriting what the user typed,
  // and the guard means callers that omit the prop are entirely unaffected.
  useEffect(() => {
    if (visible && initialEmail) {
      setEmail(initialEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  /**
   * iOS presents one Modal at a time, so the app-root CaptchaHost can never
   * appear over this sheet — `getCaptchaToken()` would just time out. The
   * widget is therefore hosted inline here and the sign-in waits on its token.
   */
  const handleVerify = () => {
    if (!email.trim() || !password) {
      setError('Please enter both email and password');
      return;
    }

    setError('');
    setIsVerifying(true);
    setCaptchaVisible(true);
  };

  const signInWithCaptchaToken = async (captchaToken: string) => {
    try {
      const { supabase } = await import('../../lib/supabase');

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: { captchaToken: captchaToken ?? undefined },
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      if (data.user) {
        onVerified(data.user.id, data.user.email || email);
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch (err) {
      // Residual path: nothing here calls getCaptchaToken() any more, but a
      // helper further down could still surface one.
      if (err instanceof CaptchaTimeoutError) {
        setError(CAPTCHA_TIMEOUT_MESSAGE);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // Keep the spinner running: the sign-in is what finally clears it.
  const handleCaptchaToken = (captchaToken: string) => {
    setCaptchaVisible(false);
    void signInWithCaptchaToken(captchaToken);
  };

  const handleCaptchaError = (reason: string) => {
    if (__DEV__) console.warn('[IdentityVerification] Captcha error:', reason);
    setCaptchaVisible(false);
    setIsVerifying(false);
    setError(CAPTCHA_TIMEOUT_MESSAGE);
  };

  const handleCaptchaCancel = () => {
    setCaptchaVisible(false);
    setIsVerifying(false);
  };

  const handleClose = () => {
    setCaptchaVisible(false);
    setIsVerifying(false);
    setEmail('');
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.header}>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.iconContainer}>
              <Ionicons name="shield-checkmark" size={48} color="#8B5CF6" />
            </View>

            <Text style={styles.title}>Verify Your Identity</Text>
            <Text style={styles.subtitle}>
              {teamName ? `Sign in to continue joining ${teamName}` : 'Sign in to continue'}
            </Text>

            <View style={styles.form}>
              <FormInput
                label="Email"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setError('');
                }}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <PasswordInput
                label="Password"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setError('');
                }}
                placeholder="Enter your password"
                showValidation={false}
              />

              {error && (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={16} color="#EF4444" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.verifyButton, isVerifying && styles.verifyButtonDisabled]}
              onPress={handleVerify}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.verifyButtonText}>Verify & Continue</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => Linking.openURL('https://thryvyng.com/forgot-password')}
              activeOpacity={0.7}
            >
              <Text style={styles.helpText}>
                Forgot your password?{' '}
                <Text style={styles.helpLink}>Reset it here</Text>
              </Text>
            </TouchableOpacity>
          </View>

          {captchaVisible && (
            <View style={styles.captchaOverlay}>
              <View style={styles.captchaIcon}>
                <Ionicons name="shield-checkmark" size={40} color="#8B5CF6" />
              </View>
              <Text style={styles.captchaTitle}>Quick security check</Text>
              <Text style={styles.captchaSubtitle}>
                Confirm you&apos;re human to continue. This usually takes a second.
              </Text>

              <CaptchaWebView
                active={captchaVisible}
                onToken={handleCaptchaToken}
                onError={handleCaptchaError}
                onCancel={handleCaptchaCancel}
              />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalContent: {
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  closeButton: {
    padding: 4,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  form: {
    marginBottom: 24,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7F1D1D',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 14,
    flex: 1,
  },
  verifyButton: {
    backgroundColor: '#8B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  helpText: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 16,
  },
  helpLink: {
    color: '#8B5CF6',
    fontWeight: '600',
  },
  captchaOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    justifyContent: 'center',
  },
  captchaIcon: {
    alignItems: 'center',
  },
  captchaTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  captchaSubtitle: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
});

export default IdentityVerificationModal;
