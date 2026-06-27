import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../navigation/linking';
import { FormInput, PasswordInput, validatePassword } from '../../components/forms';

type AcceptCoParentRouteProp = RouteProp<RootStackParamList, 'AcceptCoParent'>;
type AcceptCoParentNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'AcceptCoParent'
>;

interface InvitationData {
  id: string;
  player_id: string;
  invitee_email: string;
  invitee_relationship: string | null;
  status: string;
  expires_at: string | null;
  players: {
    id: string;
    first_name: string;
    last_name: string;
    team_id: string;
    teams: {
      name: string;
      clubs: { name: string } | null;
    } | null;
  };
}

type ScreenState = 'loading' | 'valid' | 'invalid' | 'expired' | 'used' | 'error' | 'success';

const AcceptCoParentScreen: React.FC = () => {
  const route = useRoute<AcceptCoParentRouteProp>();
  const navigation = useNavigation<AcceptCoParentNavigationProp>();

  const { code } = route.params;

  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [accountMode, setAccountMode] = useState<'new' | 'existing' | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [linkedPlayerName, setLinkedPlayerName] = useState('');

  const goHome = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Welcome' }],
      });
    }
  }, [navigation]);

  useEffect(() => {
    const fetchInvitation = async () => {
      if (!code) {
        setErrorMessage(
          'This invitation is invalid. Please contact the person who invited you.'
        );
        setScreenState('invalid');
        return;
      }

      try {
        setScreenState('loading');
        setErrorMessage('');

        const { data: row, error } = await supabase
          .from('coparent_invitations')
          .select(
            `
            *,
            players (
              id,
              first_name,
              last_name,
              team_id,
              teams (
                name,
                clubs (
                  name
                )
              )
            )
          `
          )
          .eq('invitation_code', code)
          .maybeSingle();

        if (error || !row) {
          setErrorMessage(
            'This invitation is invalid. Please contact the person who invited you.'
          );
          setScreenState('invalid');
          return;
        }

        if (row.status === 'accepted') {
          setErrorMessage(
            'This invitation has already been accepted. If this is your account, sign in to continue.'
          );
          setScreenState('used');
          return;
        }

        if (row.expires_at && new Date(row.expires_at) < new Date()) {
          setErrorMessage(
            'This invitation has expired. Please ask the person who invited you to send a new one.'
          );
          setScreenState('expired');
          return;
        }

        const playersRaw = row.players as
          | InvitationData['players']
          | InvitationData['players'][]
          | null;
        const players = Array.isArray(playersRaw) ? playersRaw[0] : playersRaw;

        if (!players) {
          setErrorMessage(
            'This invitation is invalid. Please contact the person who invited you.'
          );
          setScreenState('invalid');
          return;
        }

        let teams = players.teams;
        if (Array.isArray(teams)) {
          teams = teams[0] ?? null;
        }
        if (teams?.clubs && Array.isArray(teams.clubs)) {
          teams = { ...teams, clubs: teams.clubs[0] ?? null };
        }

        setInvitation({
          ...(row as Omit<InvitationData, 'players'>),
          players: { ...players, teams: teams ?? null },
        });
        setScreenState('valid');
      } catch (err) {
        if (__DEV__) console.error('[AcceptCoParent] fetch error:', err);
        setErrorMessage('Something went wrong. Please try again later.');
        setScreenState('error');
      }
    };

    fetchInvitation();
  }, [code]);

  const handleNewUserSignup = async () => {
    if (!invitation) return;

    if (!name.trim() || !password || !confirmPassword) {
      setPasswordError('Please fill in all fields');
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!Object.values(passwordValidation).every(Boolean)) {
      setPasswordError('Password requirements not met');
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setPasswordError('');
    setSubmitting(true);

    const emailNorm = invitation.invitee_email.trim().toLowerCase();
    const firstName = name.trim().split(' ')[0] || name.trim();
    const lastName = name.trim().split(' ').slice(1).join(' ') || '';

    try {
      if (__DEV__) console.log('[AcceptCoParent] Creating new user account...');
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: emailNorm,
        password: password,
        options: {
          data: {
            full_name: name.trim(),
            first_name: firstName,
            last_name: lastName,
          },
        },
      });

      if (authError) {
        if (__DEV__) console.error('[AcceptCoParent] Auth error:', authError);
        if (authError.message?.toLowerCase().includes('already')) {
          setPasswordError(
            'An account already exists with this email. Please choose "I have an account" instead.'
          );
        } else {
          setPasswordError(authError.message || 'Failed to create account');
        }
        setSubmitting(false);
        return;
      }

      if (!authData.user) {
        setPasswordError('Failed to create account. Please try again.');
        setSubmitting(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: emailNorm,
        password: password,
      });

      if (signInError) {
        if (__DEV__) console.error('[AcceptCoParent] Sign in after signup error:', signInError);
        setPasswordError('Account created but sign in failed. Please try logging in.');
        setSubmitting(false);
        return;
      }

      const { data: linkResult, error: linkError } = await supabase.rpc('link_parent_to_player', {
        p_player_id: invitation.players.id,
        p_user_id: authData.user.id,
        p_user_email: emailNorm,
        p_invitation_code: route.params.code,
        p_parent_first_name: firstName || null,
        p_parent_last_name: lastName || null,
        p_parent_phone: null,
      });

      if (linkError) {
        if (__DEV__) console.error('[AcceptCoParent] link_parent_to_player error:', linkError);
        const hint = (linkError as any).hint || (linkError as any).details;
        const message =
          hint === 'invitation_invalid' ? 'This invitation is invalid or has expired.' :
          hint === 'invitation_email_mismatch' ? 'This invitation was sent to a different email address.' :
          hint === 'max_parents_reached' ? 'This player already has two parents linked. Please contact your team manager.' :
          hint === 'player_not_found' ? 'Player record not found.' :
          hint === 'auth_mismatch' ? 'Authentication mismatch. Please log in again.' :
          linkError.message || 'Failed to link account';
        setPasswordError(message);
        setSubmitting(false);
        return;
      }

      if (!linkResult?.success) {
        setPasswordError('Failed to link account');
        setSubmitting(false);
        return;
      }

      if (__DEV__) console.log('[AcceptCoParent] Link successful, showing success state');
      setLinkedPlayerName(`${invitation.players.first_name} ${invitation.players.last_name}`);
      setScreenState('success');
      setSubmitting(false);
    } catch (e: any) {
      if (__DEV__) console.error('[AcceptCoParent] Unexpected error:', e);
      setPasswordError(e.message || 'Failed to create account');
      setSubmitting(false);
    }
  };

  const handleExistingUserSignIn = async () => {
    if (!invitation) return;

    if (!password) {
      setPasswordError('Please enter your password');
      return;
    }

    setPasswordError('');
    setSubmitting(true);

    const emailNorm = invitation.invitee_email.trim().toLowerCase();

    try {
      if (__DEV__) console.log('[AcceptCoParent] Signing in existing user...');
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: emailNorm,
        password: password,
      });

      if (signInError) {
        if (__DEV__) console.error('[AcceptCoParent] Sign in error:', signInError);
        if (signInError.message?.toLowerCase().includes('invalid')) {
          setPasswordError(
            'Incorrect password. Please try again or use "Forgot password" from the login screen.'
          );
        } else {
          setPasswordError(signInError.message || 'Sign in failed');
        }
        setSubmitting(false);
        return;
      }

      if (!authData.user) {
        setPasswordError('Sign in failed. Please try again.');
        setSubmitting(false);
        return;
      }

      const { data: linkResult, error: linkError } = await supabase.rpc('link_parent_to_player', {
        p_player_id: invitation.players.id,
        p_user_id: authData.user.id,
        p_user_email: emailNorm,
        p_invitation_code: route.params.code,
        p_parent_first_name: null,
        p_parent_last_name: null,
        p_parent_phone: null,
      });

      if (linkError) {
        if (__DEV__) console.error('[AcceptCoParent] link_parent_to_player error:', linkError);
        const hint = (linkError as any).hint || (linkError as any).details;
        const message =
          hint === 'invitation_invalid' ? 'This invitation is invalid or has expired.' :
          hint === 'invitation_email_mismatch' ? 'This invitation was sent to a different email address.' :
          hint === 'max_parents_reached' ? 'This player already has two parents linked. Please contact your team manager.' :
          hint === 'player_not_found' ? 'Player record not found.' :
          hint === 'auth_mismatch' ? 'Authentication mismatch. Please log in again.' :
          linkError.message || 'Failed to link account';
        setPasswordError(message);
        setSubmitting(false);
        return;
      }

      if (!linkResult?.success) {
        setPasswordError('Failed to link account');
        setSubmitting(false);
        return;
      }

      if (__DEV__) console.log('[AcceptCoParent] Existing-user link successful, showing success state');
      setLinkedPlayerName(`${invitation.players.first_name} ${invitation.players.last_name}`);
      setScreenState('success');
      setSubmitting(false);
    } catch (e: any) {
      if (__DEV__) console.error('[AcceptCoParent] Unexpected error:', e);
      setPasswordError(e.message || 'Sign in failed');
      setSubmitting(false);
    }
  };

  const renderStatusCard = (
    iconName: keyof typeof Ionicons.glyphMap,
    iconColor: string,
    title: string,
    body: string
  ) => (
    <View style={styles.errorCard}>
      <Ionicons name={iconName} size={64} color={iconColor} />
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorMessage}>{body}</Text>
      <TouchableOpacity style={styles.backButton} onPress={goHome}>
        <Text style={styles.backButtonText}>Go to Home</Text>
      </TouchableOpacity>
    </View>
  );

  if (screenState === 'loading') {
    return (
      <SafeAreaView style={styles.safeAreaRoot} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.centerContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Validating invitation...</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screenState === 'invalid') {
    return (
      <SafeAreaView style={styles.safeAreaRoot} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.centerContainer}>
          {renderStatusCard(
            'close-circle',
            '#EF4444',
            'Invitation Not Found',
            errorMessage ||
              'This invitation is invalid. Please contact the person who invited you.'
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screenState === 'expired') {
    return (
      <SafeAreaView style={styles.safeAreaRoot} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.centerContainer}>
          {renderStatusCard(
            'time-outline',
            '#F59E0B',
            'Invitation Expired',
            errorMessage ||
              'This invitation has expired. Please ask the person who invited you to send a new one.'
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screenState === 'used') {
    return (
      <SafeAreaView style={styles.safeAreaRoot} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.centerContainer}>
          {renderStatusCard(
            'checkmark-circle-outline',
            '#9CA3AF',
            'Already Accepted',
            errorMessage ||
              'This invitation has already been accepted. If this is your account, sign in to continue.'
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screenState === 'error') {
    return (
      <SafeAreaView style={styles.safeAreaRoot} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.centerContainer}>
          {renderStatusCard(
            'alert-circle-outline',
            '#EF4444',
            'Something Went Wrong',
            errorMessage || 'Something went wrong. Please try again later.'
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screenState === 'success') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.successScroll}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={64} color="#10B981" />
            </View>
            <Text style={styles.successTitle}>You're linked!</Text>
            <Text style={styles.successSubtitle}>
              You now have access to {linkedPlayerName}'s dashboard, chat, and calendar.
            </Text>
            <TouchableOpacity
              style={styles.successButton}
              onPress={() => {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Dashboard' }],
                });
              }}
            >
              <Text style={styles.successButtonText}>Continue to Dashboard</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const player = invitation!.players;
  const teamName = player.teams?.name;
  const clubName = player.teams?.clubs?.name;
  const subtitleParts = [
    `You've been invited to access ${player.first_name} ${player.last_name}'s dashboard`,
    teamName ? ` for ${teamName}` : '',
    clubName ? ` (${clubName})` : '',
    '.',
  ];

  return (
    <SafeAreaView style={styles.safeAreaRoot} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.headerCard}>
          <Ionicons name="people-circle-outline" size={64} color="#22C55E" />
          <Text style={styles.validTitle}>Join {player.first_name}'s Account</Text>
          <Text style={styles.validSubtitle}>{subtitleParts.join('')}</Text>
        </View>

        <Text style={styles.sectionLabel}>Do you already have a Thryvyng account?</Text>

        <TouchableOpacity
          style={[
            styles.modeCard,
            accountMode === 'new' && styles.modeCardActive,
          ]}
          onPress={() => setAccountMode('new')}
        >
          <Text
            style={[
              styles.modeCardTitle,
              accountMode === 'new' && styles.modeCardTitleActive,
            ]}
          >
            No, create a new account
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeCard,
            accountMode === 'existing' && styles.modeCardActive,
          ]}
          onPress={() => setAccountMode('existing')}
        >
          <Text
            style={[
              styles.modeCardTitle,
              accountMode === 'existing' && styles.modeCardTitleActive,
            ]}
          >
            Yes, I have an account
          </Text>
          <Text style={styles.modeCardSubtitle}>Sign in to link to this player</Text>
        </TouchableOpacity>

        {accountMode === 'new' && (
          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>Email</Text>
            <View style={styles.emailDisplay}>
              <Text style={styles.emailDisplayText}>{invitation!.invitee_email}</Text>
            </View>

            <FormInput
              label="Full Name"
              value={name}
              onChangeText={setName}
              placeholder="Jane Doe"
              autoCapitalize="words"
            />

            <PasswordInput
              label="Password (minimum 8 characters)"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
            />

            <PasswordInput
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm password"
            />

            {passwordError ? (
              <Text style={styles.passwordErrorText}>{passwordError}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleNewUserSignup}
              disabled={submitting}
            >
              {submitting ? (
                <View style={styles.submitButtonInner}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.submitButtonText}>Creating Account...</Text>
                </View>
              ) : (
                <Text style={styles.submitButtonText}>Create Account & Link</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {accountMode === 'existing' && (
          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>Email</Text>
            <View style={styles.emailDisplay}>
              <Text style={styles.emailDisplayText}>{invitation!.invitee_email}</Text>
            </View>

            <PasswordInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
            />

            {passwordError ? (
              <Text style={styles.passwordErrorText}>{passwordError}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleExistingUserSignIn}
              disabled={submitting}
            >
              {submitting ? (
                <View style={styles.submitButtonInner}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.submitButtonText}>Linking...</Text>
                </View>
              ) : (
                <Text style={styles.submitButtonText}>Sign In & Link Account</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.forgotPasswordHint}>
              If you forgot your password, please use the Login screen's password reset, then return
              to this link.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeAreaRoot: {
    flex: 1,
    backgroundColor: '#121212',
  },
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  centerContainer: {
    flexGrow: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 16,
    marginTop: 16,
  },
  errorCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  backButton: {
    backgroundColor: '#374151',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  validTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  validSubtitle: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 22,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  modeCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modeCardActive: {
    borderColor: '#8B5CF6',
    backgroundColor: '#2D2050',
  },
  modeCardDisabled: {
    opacity: 0.6,
  },
  modeCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D1D5DB',
  },
  modeCardTitleActive: {
    color: '#FFFFFF',
  },
  modeCardTitleDisabled: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  modeCardSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  formSection: {
    marginTop: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D1D5DB',
    marginBottom: 8,
  },
  emailDisplay: {
    backgroundColor: '#374151',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  emailDisplayText: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  passwordErrorText: {
    color: '#EF4444',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 8,
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  forgotPasswordHint: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  successScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  successCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  successIconWrap: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 16,
    color: '#CBD5E1',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  successButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    gap: 8,
  },
  successButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  existingPlaceholder: {
    marginTop: 8,
  },
  continueButtonDisabled: {
    backgroundColor: '#374151',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    opacity: 0.7,
  },
  continueButtonDisabledText: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '600',
  },
  placeholderNote: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },
});

export default AcceptCoParentScreen;
