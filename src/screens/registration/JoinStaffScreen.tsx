import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useRegistration } from '../../contexts/RegistrationContext';
import {
  SmartRegistrationToggle,
  FormInput,
  PasswordInput,
  PhoneInput,
  EmailInput,
  isPasswordValid,
  isPhoneValid,
  isEmailValid,
} from '../../components/forms';
import { IdentityVerificationModal } from '../../components/modals';
import { useEmailAvailability } from '../../hooks/useEmailAvailability';
import type { RootStackParamList } from '../../navigation/linking';

type JoinStaffRouteProp = RouteProp<RootStackParamList, 'JoinStaff'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'JoinStaff'>;

interface InvitationInfo {
  id: string;
  team_id: string;
  code: string;
  invited_role: 'head_coach' | 'assistant_coach' | 'team_manager';
  expires_at: string | null;
  used_at: string | null;
  team: {
    id: string;
    name: string;
    age_group: string | null;
    gender: string | null;
    club: {
      id: string;
      name: string;
      logo_url: string | null;
    } | null;
  } | null;
}

type ScreenState = 'loading' | 'valid' | 'invalid' | 'expired' | 'used' | 'error';

const ROLE_DISPLAY: Record<
  string,
  { title: string; icon: string; description: string }
> = {
  head_coach: {
    title: 'Head Coach',
    icon: 'shield',
    description: 'Lead the team with full management access',
  },
  assistant_coach: {
    title: 'Assistant Coach',
    icon: 'people',
    description: 'Support the team with coaching responsibilities',
  },
  team_manager: {
    title: 'Team Manager',
    icon: 'clipboard',
    description: 'Handle team logistics and communication',
  },
};

export const JoinStaffScreen: React.FC = () => {
  const route = useRoute<JoinStaffRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { setRegistrationData, clearRegistrationData } = useRegistration();

  const { code } = route.params;

  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [invitationInfo, setInvitationInfo] = useState<InvitationInfo | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Registration flow state
  const [step, setStep] = useState<
    'invitation-info' | 'mode-select' | 'registration-form'
  >('invitation-info');
  const [registrationMode, setRegistrationMode] = useState<'new' | 'existing'>(
    'new'
  );

  // Staff form state (for new users)
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Form validation state
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Identity verification state (for existing users)
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

  // Success state
  const [registrationComplete, setRegistrationComplete] = useState(false);

  // Email availability hook
  const {
    isChecking: isCheckingEmail,
    isAvailable: isEmailAvailable,
    checkEmail,
  } = useEmailAvailability();

  useEffect(() => {
    if (code) {
      validateInvitationCode(code);
      setRegistrationData({
        staffInviteCode: code,
        activeFlow: 'join-staff',
      });
    } else {
      setScreenState('invalid');
      setErrorMessage('No invitation code provided');
    }
  }, [code]);

  // Check email availability when email changes (for new users)
  useEffect(() => {
    if (registrationMode === 'new' && email && isEmailValid(email)) {
      checkEmail(email);
    }
  }, [email, registrationMode]);

  // Auto-detect if user is already logged in
  useEffect(() => {
    if (user && registrationMode === 'existing') {
      setVerifiedUserId(user.id);
      setVerifiedEmail(user.email || null);
      if (__DEV__) {
        console.log('[JoinStaff] User already logged in, skipping verification');
      }
    }
  }, [user, registrationMode]);

  const validateInvitationCode = async (inviteCode: string) => {
    try {
      if (__DEV__) {
        console.log('[JoinStaff] Validating invitation code:', inviteCode);
      }

      const { data: invitation, error } = await supabase
        .from('team_staff_invitations')
        .select(
          `
          id,
          team_id,
          code,
          invited_role,
          expires_at,
          used_at,
          team:teams (
            id,
            name,
            age_group,
            gender,
            club:clubs (
              id,
              name,
              logo_url
            )
          )
        `
        )
        .eq('code', inviteCode)
        .single();

      if (error || !invitation) {
        if (__DEV__) {
          console.log('[JoinStaff] Invitation not found:', error);
        }
        setScreenState('invalid');
        setErrorMessage(
          'This invitation link is not valid. Please contact your team administrator.'
        );
        return;
      }

      if (invitation.used_at !== null) {
        if (__DEV__) {
          console.log('[JoinStaff] Invitation already used');
        }
        setScreenState('used');
        setErrorMessage(
          'This invitation has already been used. Please request a new invitation.'
        );
        return;
      }

      if (
        invitation.expires_at &&
        new Date(invitation.expires_at) < new Date()
      ) {
        if (__DEV__) {
          console.log('[JoinStaff] Invitation expired');
        }
        setScreenState('expired');
        setErrorMessage(
          'This invitation has expired. Please request a new invitation.'
        );
        return;
      }

      if (__DEV__) {
        console.log(
          '[JoinStaff] Invitation valid:',
          invitation.invited_role,
          'for team:',
          invitation.team?.name
        );
      }

      setInvitationInfo(invitation as InvitationInfo);
      setScreenState('valid');
    } catch (err) {
      if (__DEV__) {
        console.error('[JoinStaff] Error validating code:', err);
      }
      setScreenState('error');
      setErrorMessage('Something went wrong. Please try again later.');
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (registrationMode === 'new') {
      if (!fullName.trim()) errors.fullName = 'Full name is required';
      if (!email.trim()) errors.email = 'Email is required';
      else if (!isEmailValid(email)) errors.email = 'Please enter a valid email';
      else if (isEmailAvailable === false)
        errors.email =
          'This email is already registered. Use "I already have an account" instead.';
      if (!phone.trim()) errors.phone = 'Phone number is required';
      else if (!isPhoneValid(phone))
        errors.phone = 'Please enter a valid 10-digit phone';
      if (!password) errors.password = 'Password is required';
      else if (!isPasswordValid(password))
        errors.password = 'Password does not meet requirements';
      if (password !== confirmPassword)
        errors.confirmPassword = 'Passwords do not match';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitRegistration = async () => {
    setIsSubmitting(true);
    setFormErrors({});

    try {
      let userId: string;
      let userEmail: string;
      let userName: string;
      let userPhone: string | null = null;

      if (registrationMode === 'new') {
        // NEW USER: Create auth account first
        if (__DEV__) console.log('[JoinStaff] Creating new user account...');

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });

        if (authError) {
          if (__DEV__) console.error('[JoinStaff] Auth error:', authError);
          setFormErrors({ submit: authError.message });
          return;
        }

        if (!authData.user) {
          setFormErrors({ submit: 'Failed to create account. Please try again.' });
          return;
        }

        // IMPORTANT: Sign in immediately after signup to establish session
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (signInError) {
          if (__DEV__)
            console.error('[JoinStaff] Sign in after signup error:', signInError);
          setFormErrors({
            submit:
              'Account created but sign in failed. Please try logging in.',
          });
          return;
        }

        userId = authData.user.id;
        userEmail = email.trim();
        userName = fullName.trim();
        userPhone = phone.replace(/\D/g, '');

        // Update profile with phone
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            phone: userPhone,
            full_name: userName,
          })
          .eq('id', userId);

        if (profileError) {
          if (__DEV__)
            console.log('[JoinStaff] Profile update warning:', profileError);
        }
      } else {
        // EXISTING USER: Use verified user ID
        userId = verifiedUserId || user?.id || '';
        userEmail = verifiedEmail || user?.email || '';
        userName = user?.user_metadata?.full_name || userEmail;

        if (!userId) {
          setFormErrors({
            submit: 'User verification failed. Please try again.',
          });
          return;
        }
      }

      if (__DEV__)
        console.log(
          '[JoinStaff] Creating team_staff for user:',
          userId,
          'team:',
          invitationInfo?.team_id
        );

      // CREATE TEAM_STAFF RECORD
      const { data: staffData, error: staffError } = await supabase
        .from('team_staff')
        .insert({
          team_id: invitationInfo?.team_id,
          user_id: userId,
          staff_role: invitationInfo?.invited_role,
          full_name: userName,
          email: userEmail,
          phone: userPhone,
          is_primary: false,
        })
        .select()
        .single();

      if (staffError) {
        if (__DEV__)
          console.error(
            '[JoinStaff] Staff creation error:',
            JSON.stringify(staffError)
          );

        if (staffError.code === '23505') {
          setFormErrors({
            submit: 'You are already a staff member of this team.',
          });
        } else {
          setFormErrors({
            submit:
              'Failed to join team: ' +
              (staffError.message || 'Unknown error'),
          });
        }
        return;
      }

      if (__DEV__) console.log('[JoinStaff] Team staff created:', staffData?.id);

      // CREATE USER_ROLES ENTRY (NO entity_type column!)
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: invitationInfo?.invited_role,
          entity_id: invitationInfo?.team_id,
        })
        .select()
        .single();

      if (roleError) {
        if (roleError.code === '23505') {
          if (__DEV__)
            console.log('[JoinStaff] User already has this role - continuing');
        } else {
          if (__DEV__)
            console.error(
              '[JoinStaff] Role creation error:',
              JSON.stringify(roleError)
            );
          setFormErrors({
            submit: 'Failed to assign role. Please contact support.',
          });
          return;
        }
      } else {
        if (__DEV__) console.log('[JoinStaff] User role created:', roleData?.id);
      }

      // MARK INVITATION AS USED
      const { error: inviteError } = await supabase
        .from('team_staff_invitations')
        .update({
          used_at: new Date().toISOString(),
          used_by: userId,
        })
        .eq('id', invitationInfo?.id);

      if (inviteError) {
        if (__DEV__)
          console.error(
            '[JoinStaff] Invitation update error:',
            JSON.stringify(inviteError)
          );
      } else {
        if (__DEV__) console.log('[JoinStaff] Invitation marked as used');
      }

      // SEND WELCOME EMAIL (non-blocking)
      try {
        await supabase.functions.invoke('send-email', {
          body: {
            to: userEmail,
            template: 'staff-welcome',
            data: {
              staffName: userName,
              role: roleInfo?.title || invitationInfo?.invited_role,
              teamName: invitationInfo?.team?.name,
              clubName: invitationInfo?.team?.club?.name,
            },
          },
        });
        if (__DEV__) console.log('[JoinStaff] Welcome email sent');
      } catch (emailErr) {
        if (__DEV__) console.log('[JoinStaff] Email send warning:', emailErr);
      }

      // SUCCESS!
      setRegistrationComplete(true);
      clearRegistrationData();

      if (__DEV__) console.log('[JoinStaff] Registration complete!');
    } catch (err) {
      if (__DEV__) console.error('[JoinStaff] Unexpected error:', err);
      setFormErrors({
        submit: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerificationSuccess = (
    userId: string,
    verifiedEmailAddr: string
  ) => {
    setVerifiedUserId(userId);
    setVerifiedEmail(verifiedEmailAddr);
    setShowVerificationModal(false);

    if (__DEV__) {
      console.log('[JoinStaff] Identity verified:', {
        userId,
        email: verifiedEmailAddr,
      });
    }

    setStep('registration-form');
  };

  const handleContinue = async () => {
    if (step === 'invitation-info') {
      setStep('mode-select');
    } else if (step === 'mode-select') {
      if (registrationMode === 'existing') {
        if (user || verifiedUserId) {
          setStep('registration-form');
        } else {
          setShowVerificationModal(true);
        }
      } else {
        setStep('registration-form');
      }
    } else if (step === 'registration-form') {
      if (registrationMode === 'new') {
        if (!validateForm()) return;
      }
      await submitRegistration();
    }
  };

  const handleBack = () => {
    if (step === 'registration-form') {
      setStep('mode-select');
    } else if (step === 'mode-select') {
      setStep('invitation-info');
    } else {
      handleGoBack();
    }
  };

  const handleGoBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Welcome');
    }
  };

  const roleInfo = invitationInfo?.invited_role
    ? ROLE_DISPLAY[invitationInfo.invited_role]
    : null;

  if (screenState === 'loading') {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Validating invitation...</Text>
      </View>
    );
  }

  if (
    screenState === 'invalid' ||
    screenState === 'expired' ||
    screenState === 'used' ||
    screenState === 'error'
  ) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorCard}>
          <Ionicons
            name={
              screenState === 'expired'
                ? 'time-outline'
                : screenState === 'used'
                  ? 'checkmark-done-outline'
                  : 'alert-circle-outline'
            }
            size={64}
            color={screenState === 'used' ? '#F59E0B' : '#EF4444'}
          />
          <Text style={styles.errorTitle}>
            {screenState === 'expired'
              ? 'Invitation Expired'
              : screenState === 'used'
                ? 'Already Used'
                : 'Invalid Invitation'}
          </Text>
          <Text style={styles.errorMessage}>{errorMessage}</Text>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // SUCCESS SCREEN
  if (registrationComplete) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.successContainer}
      >
        <View style={styles.successCard}>
          <View style={styles.successIconContainer}>
            <Ionicons name="checkmark-circle" size={80} color="#22C55E" />
          </View>

          <Text style={styles.successTitle}>Welcome to the Team!</Text>
          <Text style={styles.successSubtitle}>
            You've joined {invitationInfo?.team?.name} as {roleInfo?.title}
          </Text>

          <View style={styles.successRoleCard}>
            <View style={styles.successRoleIcon}>
              <Ionicons
                name={(roleInfo?.icon as any) || 'person'}
                size={32}
                color="#8B5CF6"
              />
            </View>
            <View style={styles.successRoleInfo}>
              <Text style={styles.successRoleName}>{roleInfo?.title}</Text>
              <Text style={styles.successTeamName}>
                {invitationInfo?.team?.name}
              </Text>
              <Text style={styles.successClubName}>
                {invitationInfo?.team?.club?.name}
              </Text>
            </View>
          </View>

          <View style={styles.nextStepsCard}>
            <Text style={styles.nextStepsTitle}>What's Next?</Text>
            <View style={styles.nextStep}>
              <Ionicons name="people-outline" size={20} color="#8B5CF6" />
              <Text style={styles.nextStepText}>
                View and manage your team roster
              </Text>
            </View>
            <View style={styles.nextStep}>
              <Ionicons name="calendar-outline" size={20} color="#8B5CF6" />
              <Text style={styles.nextStepText}>
                Schedule practices and games
              </Text>
            </View>
            <View style={styles.nextStep}>
              <Ionicons name="chatbubbles-outline" size={20} color="#8B5CF6" />
              <Text style={styles.nextStepText}>
                Connect with players and parents
              </Text>
            </View>
            <View style={styles.nextStep}>
              <Ionicons name="star-outline" size={20} color="#8B5CF6" />
              <Text style={styles.nextStepText}>
                Create player evaluations
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.goToDashboardButton}
            onPress={() =>
              navigation.reset({
                index: 0,
                routes: [{ name: 'Main' }],
              })
            }
          >
            <Text style={styles.goToDashboardText}>Go to Dashboard</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // Valid invitation - show multi-step flow
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {step !== 'invitation-info' && (
        <TouchableOpacity style={styles.backNav} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color="#9CA3AF" />
          <Text style={styles.backNavText}>Back</Text>
        </TouchableOpacity>
      )}

      <View style={styles.stepIndicator}>
        <View
          style={[
            styles.stepDot,
            step === 'invitation-info' && styles.stepDotActive,
          ]}
        />
        <View style={styles.stepLine} />
        <View
          style={[styles.stepDot, step === 'mode-select' && styles.stepDotActive]}
        />
        <View style={styles.stepLine} />
        <View
          style={[
            styles.stepDot,
            step === 'registration-form' && styles.stepDotActive,
          ]}
        />
      </View>

      {step === 'invitation-info' && (
        <>
          <View style={styles.headerCard}>
            {invitationInfo?.team?.club?.logo_url ? (
              <Image
                source={{ uri: invitationInfo.team.club.logo_url }}
                style={styles.clubLogo}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.clubLogoPlaceholder}>
                <Ionicons name="shield-outline" size={48} color="#6B7280" />
              </View>
            )}

            <Text style={styles.clubName}>
              {invitationInfo?.team?.club?.name || 'Club'}
            </Text>
            <Text style={styles.teamName}>{invitationInfo?.team?.name}</Text>

            {(invitationInfo?.team?.age_group ||
              invitationInfo?.team?.gender) && (
              <View style={styles.teamBadges}>
                {invitationInfo?.team?.age_group && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {invitationInfo.team.age_group}
                    </Text>
                  </View>
                )}
                {invitationInfo?.team?.gender && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {invitationInfo.team.gender}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <View style={styles.roleCard}>
            <View style={styles.roleIconContainer}>
              <Ionicons
                name={(roleInfo?.icon as any) || 'person'}
                size={32}
                color="#8B5CF6"
              />
            </View>
            <Text style={styles.roleTitle}>You're invited as</Text>
            <Text style={styles.roleName}>
              {roleInfo?.title || invitationInfo?.invited_role}
            </Text>
            <Text style={styles.roleDescription}>{roleInfo?.description}</Text>
          </View>

          {user && (
            <View style={styles.loggedInBannerWithAction}>
              <View style={styles.loggedInBannerContent}>
                <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                <Text style={styles.loggedInText}>
                  Logged in as {user.email}
                </Text>
              </View>
              <TouchableOpacity
                onPress={async () => {
                  await supabase.auth.signOut();
                }}
              >
                <Text style={styles.notYouText}>Not you?</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {step === 'mode-select' && (
        <>
          <Text style={styles.stepTitle}>Account Setup</Text>
          <SmartRegistrationToggle
            mode={registrationMode}
            onModeChange={setRegistrationMode}
            disabled={!!user}
          />

          {user && (
            <View style={styles.infoBox}>
              <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
              <Text style={styles.infoText}>
                You're logged in as {user.email}. We'll add you as{' '}
                {roleInfo?.title} to this team.
              </Text>
            </View>
          )}

          {!user &&
            registrationMode === 'existing' &&
            verifiedUserId && (
              <View style={styles.infoBox}>
                <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                <Text style={styles.infoText}>
                  Verified as {verifiedEmail}. Continue to join the team.
                </Text>
              </View>
            )}

          {!user &&
            registrationMode === 'existing' &&
            !verifiedUserId && (
              <View style={styles.warningBox}>
                <Ionicons
                  name="information-circle"
                  size={20}
                  color="#FBBF24"
                />
                <Text style={styles.warningText}>
                  You'll need to verify your identity on the next step.
                </Text>
              </View>
            )}

          <View style={styles.roleReminderCard}>
            <Ionicons
              name={(roleInfo?.icon as any) || 'person'}
              size={24}
              color="#8B5CF6"
            />
            <View style={styles.roleReminderText}>
              <Text style={styles.roleReminderTitle}>
                Joining as {roleInfo?.title}
              </Text>
              <Text style={styles.roleReminderTeam}>
                {invitationInfo?.team?.name}
              </Text>
            </View>
          </View>
        </>
      )}

      {step === 'registration-form' && (
        <>
          {registrationMode === 'new' ? (
            <>
              <Text style={styles.stepTitle}>Your Information</Text>
              <Text style={styles.stepSubtitle}>
                Create your staff account
              </Text>

              <View style={styles.formSection}>
                <FormInput
                  label="Full Name"
                  value={fullName}
                  onChangeText={(text) => {
                    setFullName(text);
                    setFormErrors((prev) => ({ ...prev, fullName: '' }));
                  }}
                  placeholder="John Smith"
                  autoCapitalize="words"
                  error={formErrors.fullName}
                />

                <EmailInput
                  label="Email Address"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    setFormErrors((prev) => ({ ...prev, email: '' }));
                  }}
                  placeholder="you@example.com"
                  error={formErrors.email}
                  isChecking={isCheckingEmail}
                  isAvailable={isEmailAvailable}
                />

                <PhoneInput
                  label="Phone Number"
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(text);
                    setFormErrors((prev) => ({ ...prev, phone: '' }));
                  }}
                  error={formErrors.phone}
                />
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Create Password</Text>

                <PasswordInput
                  label="Password"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    setFormErrors((prev) => ({ ...prev, password: '' }));
                  }}
                  showValidation={true}
                  error={formErrors.password}
                />

                <PasswordInput
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    setFormErrors((prev) => ({ ...prev, confirmPassword: '' }));
                  }}
                  error={formErrors.confirmPassword}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.stepTitle}>Ready to Join!</Text>
              <Text style={styles.stepSubtitle}>
                You'll be added as {roleInfo?.title} to{' '}
                {invitationInfo?.team?.name}
              </Text>

              <View style={styles.confirmationCard}>
                <Ionicons
                  name="checkmark-circle"
                  size={48}
                  color="#22C55E"
                />
                <Text style={styles.confirmationEmail}>
                  {verifiedEmail || user?.email}
                </Text>
                <Text style={styles.confirmationText}>
                  Your account is verified and ready
                </Text>
              </View>
            </>
          )}

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Joining As</Text>
            <View style={styles.summaryRow}>
              <Ionicons
                name={(roleInfo?.icon as any) || 'person'}
                size={20}
                color="#8B5CF6"
              />
              <Text style={styles.summaryRole}>{roleInfo?.title}</Text>
            </View>
            <Text style={styles.summaryTeam}>{invitationInfo?.team?.name}</Text>
            <Text style={styles.summaryClub}>
              {invitationInfo?.team?.club?.name}
            </Text>
          </View>

          {formErrors.submit && (
            <View style={styles.submitErrorContainer}>
              <Ionicons name="alert-circle" size={20} color="#EF4444" />
              <Text style={styles.submitErrorText}>
                {formErrors.submit}
              </Text>
            </View>
          )}
        </>
      )}

      <TouchableOpacity
        style={[
          styles.continueButton,
          isSubmitting && styles.continueButtonDisabled,
        ]}
        onPress={handleContinue}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Text style={styles.continueButtonText}>
              {step === 'invitation-info'
                ? 'Accept Invitation'
                : step === 'mode-select'
                  ? 'Continue'
                  : 'Join Team Staff'}
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.helpText}>
        {step === 'invitation-info'
          ? `By accepting, you'll gain access to manage ${invitationInfo?.team?.name}.`
          : 'Need help? Contact your team administrator.'}
      </Text>

      <IdentityVerificationModal
        visible={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        onVerified={handleVerificationSuccess}
        teamName={invitationInfo?.team?.name}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
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
    marginBottom: 20,
  },
  clubLogo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 16,
  },
  clubLogoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  clubName: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  teamName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  teamBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    backgroundColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeText: {
    fontSize: 13,
    color: '#D1D5DB',
    fontWeight: '500',
  },
  roleCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  roleIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2D2050',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  roleTitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  roleName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8B5CF6',
    marginBottom: 8,
  },
  roleDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  loggedInBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#14532D',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  loggedInText: {
    color: '#86EFAC',
    fontSize: 14,
    fontWeight: '500',
  },
  loggedInBannerWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#14532D',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  loggedInBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  notYouText: {
    color: '#86EFAC',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  continueButton: {
    backgroundColor: '#8B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  helpText: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
  },
  backNav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  backNavText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#374151',
  },
  stepDotActive: {
    backgroundColor: '#8B5CF6',
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: '#374151',
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#14532D',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  infoText: {
    color: '#86EFAC',
    fontSize: 14,
    flex: 1,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#422006',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  warningText: {
    color: '#FCD34D',
    fontSize: 14,
    flex: 1,
  },
  roleReminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    gap: 12,
  },
  roleReminderText: {
    flex: 1,
  },
  roleReminderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  roleReminderTeam: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 2,
  },
  formSection: {
    marginBottom: 24,
  },
  formSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D1D5DB',
    marginBottom: 16,
  },
  confirmationCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  confirmationEmail: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  confirmationText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  summaryCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#374151',
  },
  summaryTitle: {
    fontSize: 12,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  summaryRole: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#8B5CF6',
  },
  summaryTeam: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 4,
  },
  summaryClub: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 2,
  },
  submitErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7F1D1D',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 20,
  },
  submitErrorText: {
    color: '#FCA5A5',
    fontSize: 14,
    flex: 1,
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  successContainer: {
    padding: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  successCard: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  successIconContainer: {
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 32,
  },
  successRoleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  successRoleIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2D2050',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successRoleInfo: {
    marginLeft: 16,
    flex: 1,
  },
  successRoleName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8B5CF6',
  },
  successTeamName: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 2,
  },
  successClubName: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 2,
  },
  nextStepsCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 24,
  },
  nextStepsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  nextStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  nextStepText: {
    fontSize: 15,
    color: '#D1D5DB',
  },
  goToDashboardButton: {
    backgroundColor: '#8B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 8,
    width: '100%',
  },
  goToDashboardText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default JoinStaffScreen;
