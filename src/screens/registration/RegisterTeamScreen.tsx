import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useRegistration } from '../../contexts/RegistrationContext';
import type { RootStackParamList } from '../../navigation/linking';
import {
  FormInput,
  SmartRegistrationToggle,
  PasswordInput,
  PhoneInput,
  EmailInput,
  isPasswordValid,
  isPhoneValid,
  isEmailValid,
} from '../../components/forms';
import { IdentityVerificationModal } from '../../components/modals';
import { useEmailAvailability } from '../../hooks/useEmailAvailability';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'RegisterTeam'>;

interface Club {
  id: string;
  name: string;
  logo_url: string | null;
}

const AGE_GROUPS = [
  'U6',
  'U7',
  'U8',
  'U9',
  'U10',
  'U11',
  'U12',
  'U13',
  'U14',
  'U15',
  'U16',
  'U17',
  'U18',
  'U19',
  'Adult',
  'Senior',
];

const GENDERS = [
  { value: 'male', label: 'Boys' },
  { value: 'female', label: 'Girls' },
  { value: 'coed', label: 'Coed' },
];

const ROLES = [
  { value: 'head_coach', label: 'Head Coach' },
  { value: 'team_manager', label: 'Team Manager' },
];

export const RegisterTeamScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { setRegistrationData } = useRegistration();

  const [step, setStep] = useState<'team-info' | 'user-info'>('team-info');
  const [isLoading, setIsLoading] = useState(true);

  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [showClubPicker, setShowClubPicker] = useState(false);

  const [teamName, setTeamName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [gender, setGender] = useState('');
  const [showAgeGroupPicker, setShowAgeGroupPicker] = useState(false);
  const [showGenderPicker, setShowGenderPicker] = useState(false);

  const [registrantRole, setRegistrantRole] = useState('head_coach');
  const [showRolePicker, setShowRolePicker] = useState(false);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [registrationMode, setRegistrationMode] = useState<'new' | 'existing'>(
    'new'
  );

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [createdTeamName, setCreatedTeamName] = useState('');

  const {
    isChecking: isCheckingEmail,
    isAvailable: isEmailAvailable,
    checkEmail,
  } = useEmailAvailability();

  useEffect(() => {
    fetchApprovedClubs();
    setRegistrationData({
      activeFlow: 'register-team',
    });
  }, []);

  useEffect(() => {
    if (registrationMode === 'new' && email && isEmailValid(email)) {
      checkEmail(email);
    }
  }, [email, registrationMode]);

  useEffect(() => {
    if (user) {
      setRegistrationMode('existing');
      setVerifiedUserId(user.id);
      setVerifiedEmail(user.email || null);
      if (__DEV__) console.log('[RegisterTeam] User already logged in');
    }
  }, [user]);

  const generateInvitationCode = (): string => {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const prefix = teamName
      .substring(0, 3)
      .toUpperCase()
      .replace(/[^A-Z]/g, 'X')
      .padEnd(3, 'X');
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}-${suffix}`;
  };

  const fetchApprovedClubs = async () => {
    try {
      if (__DEV__) console.log('[RegisterTeam] Fetching approved clubs...');

      const { data, error } = await supabase
        .from('clubs')
        .select('id, name, logo_url')
        .eq('status', 'approved')
        .order('name');

      if (error) {
        if (__DEV__) console.error('[RegisterTeam] Error fetching clubs:', error);
        return;
      }

      if (__DEV__) console.log('[RegisterTeam] Found clubs:', data?.length);
      setClubs(data || []);
    } catch (err) {
      if (__DEV__) console.error('[RegisterTeam] Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const validateTeamInfo = (): boolean => {
    const errors: Record<string, string> = {};

    if (!selectedClub) errors.club = 'Please select a club';
    if (!teamName.trim()) errors.teamName = 'Team name is required';
    if (!ageGroup) errors.ageGroup = 'Please select an age group';
    if (!gender) errors.gender = 'Please select gender';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateUserInfo = (): boolean => {
    const errors: Record<string, string> = {};

    if (registrationMode === 'new') {
      if (!fullName.trim()) errors.fullName = 'Full name is required';
      if (!email.trim()) errors.email = 'Email is required';
      else if (!isEmailValid(email)) errors.email = 'Please enter a valid email';
      else if (isEmailAvailable === false)
        errors.email = 'This email is already registered';
      if (!phone.trim()) errors.phone = 'Phone number is required';
      else if (!isPhoneValid(phone))
        errors.phone = 'Please enter a valid 10-digit phone';
      if (!password) errors.password = 'Password is required';
      else if (!isPasswordValid(password))
        errors.password = 'Password does not meet requirements';
      if (password !== confirmPassword)
        errors.confirmPassword = 'Passwords do not match';
    } else {
      if (!verifiedUserId && !user) {
        errors.verification = 'Please verify your identity';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleVerificationSuccess = (
    userId: string,
    verifiedEmailAddr: string
  ) => {
    setVerifiedUserId(userId);
    setVerifiedEmail(verifiedEmailAddr);
    setShowVerificationModal(false);
    if (__DEV__)
      console.log('[RegisterTeam] Identity verified:', verifiedEmailAddr);
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
        if (__DEV__)
          console.log('[RegisterTeam] Creating new user account...');

        const { data: authData, error: authError } = await supabase.auth.signUp(
          {
            email: email.trim(),
            password: password,
            options: {
              data: {
                full_name: fullName.trim(),
              },
            },
          }
        );

        if (authError) {
          if (__DEV__) console.error('[RegisterTeam] Auth error:', authError);
          setFormErrors({ submit: authError.message });
          return;
        }

        if (!authData.user) {
          setFormErrors({
            submit: 'Failed to create account. Please try again.',
          });
          return;
        }

        const { error: signInError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password,
          });

        if (signInError) {
          if (__DEV__)
            console.error('[RegisterTeam] Sign in error:', signInError);
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

        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            phone: userPhone,
            full_name: userName,
          })
          .eq('id', userId);

        if (profileError && __DEV__) {
          console.log(
            '[RegisterTeam] Profile update warning:',
            profileError
          );
        }
      } else {
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
        console.log('[RegisterTeam] Creating team for user:', userId);

      const invitationCode = generateInvitationCode();

      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .insert({
          club_id: selectedClub?.id,
          name: teamName.trim(),
          age_group: ageGroup,
          gender: gender,
          status: 'pending',
          invitation_code: invitationCode,
        })
        .select()
        .single();

      if (teamError) {
        if (__DEV__)
          console.error(
            '[RegisterTeam] Team creation error:',
            JSON.stringify(teamError)
          );
        setFormErrors({
          submit:
            'Failed to create team: ' + (teamError.message || 'Unknown error'),
        });
        return;
      }

      if (__DEV__) console.log('[RegisterTeam] Team created:', teamData.id);

      const { error: staffError } = await supabase.from('team_staff').insert({
        team_id: teamData.id,
        user_id: userId,
        staff_role: registrantRole,
        full_name: userName,
        email: userEmail,
        phone: userPhone,
        is_primary: true,
      }).select().single();

      if (staffError) {
        if (__DEV__)
          console.error(
            '[RegisterTeam] Staff creation error:',
            JSON.stringify(staffError)
          );
      } else {
        if (__DEV__) console.log('[RegisterTeam] Team staff created');
      }

      const { error: roleError } = await supabase.from('user_roles').insert({
        user_id: userId,
        role: registrantRole,
        entity_id: teamData.id,
      }).select().single();

      if (roleError) {
        if (roleError.code === '23505') {
          if (__DEV__)
            console.log('[RegisterTeam] User already has this role');
        } else {
          if (__DEV__)
            console.error(
              '[RegisterTeam] Role creation error:',
              JSON.stringify(roleError)
            );
        }
      } else {
        if (__DEV__) console.log('[RegisterTeam] User role created');
      }

      try {
        await supabase.functions.invoke('send-email', {
          body: {
            to: userEmail,
            template: 'team-registration',
            data: {
              userName: userName,
              teamName: teamName.trim(),
              clubName: selectedClub?.name,
              role: ROLES.find((r) => r.value === registrantRole)?.label,
            },
          },
        });
        if (__DEV__) console.log('[RegisterTeam] Confirmation email sent');
      } catch (emailErr) {
        if (__DEV__) console.log('[RegisterTeam] Email warning:', emailErr);
      }

      setCreatedTeamName(teamName.trim());
      setRegistrationComplete(true);

      if (__DEV__) console.log('[RegisterTeam] Registration complete!');
    } catch (err) {
      if (__DEV__) console.error('[RegisterTeam] Unexpected error:', err);
      setFormErrors({
        submit: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = async () => {
    if (step === 'team-info') {
      if (!validateTeamInfo()) return;
      setStep('user-info');
    } else if (step === 'user-info') {
      if (
        registrationMode === 'existing' &&
        !verifiedUserId &&
        !user
      ) {
        setShowVerificationModal(true);
        return;
      }

      if (!validateUserInfo()) return;

      await submitRegistration();
    }
  };

  const handleBack = () => {
    if (step === 'user-info') {
      setStep('team-info');
    } else {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Welcome');
      }
    }
  };

  const PickerModal = ({
    visible,
    onClose,
    title,
    options,
    selectedValue,
    onSelect,
    renderItem,
  }: {
    visible: boolean;
    onClose: () => void;
    title: string;
    options: any[];
    selectedValue: any;
    onSelect: (value: any) => void;
    renderItem?: (item: any) => React.ReactNode;
  }) => (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={options}
            keyExtractor={(item, index) =>
              typeof item === 'string'
                ? item
                : (item as Club).id || (item as { value: string }).value || String(index)
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.pickerItem,
                  (typeof item === 'string'
                    ? item === selectedValue
                    : (item as Club).id === (selectedValue as Club)?.id ||
                      (item as { value: string }).value === selectedValue) &&
                    styles.pickerItemSelected,
                ]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                {renderItem ? (
                  renderItem(item)
                ) : (
                  <Text style={styles.pickerItemText}>
                    {typeof item === 'string'
                      ? item
                      : (item as { label?: string; name?: string }).label ||
                        (item as Club).name}
                  </Text>
                )}
                {(typeof item === 'string'
                  ? item === selectedValue
                  : (item as Club).id === (selectedValue as Club)?.id ||
                    (item as { value: string }).value === selectedValue) && (
                  <Ionicons name="checkmark" size={20} color="#8B5CF6" />
                )}
              </TouchableOpacity>
            )}
            style={styles.pickerList}
          />
        </View>
      </View>
    </Modal>
  );

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading clubs...</Text>
      </View>
    );
  }

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

          <Text style={styles.successTitle}>Team Registered!</Text>
          <Text style={styles.successSubtitle}>
            Your team is pending approval from {selectedClub?.name}
          </Text>

          <View style={styles.successTeamCard}>
            {selectedClub?.logo_url ? (
              <Image
                source={{ uri: selectedClub.logo_url }}
                style={styles.successClubLogo}
              />
            ) : (
              <View style={styles.successClubLogoPlaceholder}>
                <Ionicons name="shield-outline" size={32} color="#6B7280" />
              </View>
            )}
            <View style={styles.successTeamInfo}>
              <Text style={styles.successTeamName}>{createdTeamName}</Text>
              <Text style={styles.successClubName}>{selectedClub?.name}</Text>
              <View style={styles.successBadges}>
                <View style={styles.successBadge}>
                  <Text style={styles.successBadgeText}>{ageGroup}</Text>
                </View>
                <View style={styles.successBadge}>
                  <Text style={styles.successBadgeText}>
                    {GENDERS.find((g) => g.value === gender)?.label || gender}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.statusCard}>
            <Ionicons name="time-outline" size={24} color="#FBBF24" />
            <View style={styles.statusInfo}>
              <Text style={styles.statusTitle}>Pending Approval</Text>
              <Text style={styles.statusText}>
                The club administrator will review your team registration.
                You'll receive an email once approved.
              </Text>
            </View>
          </View>

          <View style={styles.nextStepsCard}>
            <Text style={styles.nextStepsTitle}>What Happens Next?</Text>
            <View style={styles.nextStep}>
              <View style={styles.nextStepNumber}>
                <Text style={styles.nextStepNumberText}>1</Text>
              </View>
              <Text style={styles.nextStepText}>
                Club admin reviews your registration
              </Text>
            </View>
            <View style={styles.nextStep}>
              <View style={styles.nextStepNumber}>
                <Text style={styles.nextStepNumberText}>2</Text>
              </View>
              <Text style={styles.nextStepText}>
                You'll receive approval notification
              </Text>
            </View>
            <View style={styles.nextStep}>
              <View style={styles.nextStepNumber}>
                <Text style={styles.nextStepNumberText}>3</Text>
              </View>
              <Text style={styles.nextStepText}>
                Start inviting players and staff!
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() =>
              navigation.reset({
                index: 0,
                routes: [{ name: 'Main' }],
              })
            }
          >
            <Text style={styles.primaryButtonText}>Go to Dashboard</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              setRegistrationComplete(false);
              setStep('team-info');
              setTeamName('');
              setAgeGroup('');
              setGender('');
            }}
          >
            <Text style={styles.secondaryButtonText}>
              Register Another Team
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <TouchableOpacity style={styles.backNav} onPress={handleBack}>
        <Ionicons name="arrow-back" size={24} color="#9CA3AF" />
        <Text style={styles.backNavText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.stepIndicator}>
        <View
          style={[styles.stepDot, step === 'team-info' && styles.stepDotActive]}
        />
        <View style={styles.stepLine} />
        <View
          style={[styles.stepDot, step === 'user-info' && styles.stepDotActive]}
        />
      </View>

      <Text style={styles.screenTitle}>Register Your Team</Text>
      <Text style={styles.screenSubtitle}>
        Join an existing club and create your team
      </Text>

      {step === 'team-info' && (
        <>
          <View style={styles.formSection}>
            <Text style={styles.formSectionTitle}>Team Information</Text>

            <Text style={styles.inputLabel}>Select Club *</Text>
            <TouchableOpacity
              style={[styles.selector, formErrors.club && styles.selectorError]}
              onPress={() => setShowClubPicker(true)}
            >
              {selectedClub ? (
                <View style={styles.selectedClub}>
                  {selectedClub.logo_url ? (
                    <Image
                      source={{ uri: selectedClub.logo_url }}
                      style={styles.clubLogoSmall}
                    />
                  ) : (
                    <View style={styles.clubLogoPlaceholderSmall}>
                      <Ionicons
                        name="shield-outline"
                        size={20}
                        color="#6B7280"
                      />
                    </View>
                  )}
                  <Text style={styles.selectorText}>{selectedClub.name}</Text>
                </View>
              ) : (
                <Text style={styles.selectorPlaceholder}>Choose club</Text>
              )}
              <Ionicons name="chevron-down" size={20} color="#6B7280" />
            </TouchableOpacity>
            {formErrors.club && (
              <Text style={styles.errorText}>{formErrors.club}</Text>
            )}

            <FormInput
              label="Team Name *"
              value={teamName}
              onChangeText={(text) => {
                setTeamName(text);
                setFormErrors((prev) => ({ ...prev, teamName: '' }));
              }}
              placeholder="e.g., Lightning U12 Boys"
              error={formErrors.teamName}
            />

            <Text style={styles.inputLabel}>Age Group *</Text>
            <TouchableOpacity
              style={[
                styles.selector,
                formErrors.ageGroup && styles.selectorError,
              ]}
              onPress={() => setShowAgeGroupPicker(true)}
            >
              <Text
                style={
                  ageGroup ? styles.selectorText : styles.selectorPlaceholder
                }
              >
                {ageGroup || 'Select age group'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#6B7280" />
            </TouchableOpacity>
            {formErrors.ageGroup && (
              <Text style={styles.errorText}>{formErrors.ageGroup}</Text>
            )}

            <Text style={styles.inputLabel}>Gender *</Text>
            <TouchableOpacity
              style={[styles.selector, formErrors.gender && styles.selectorError]}
              onPress={() => setShowGenderPicker(true)}
            >
              <Text
                style={
                  gender ? styles.selectorText : styles.selectorPlaceholder
                }
              >
                {GENDERS.find((g) => g.value === gender)?.label || 'Select gender'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#6B7280" />
            </TouchableOpacity>
            {formErrors.gender && (
              <Text style={styles.errorText}>{formErrors.gender}</Text>
            )}
          </View>

          <View style={styles.formSection}>
            <Text style={styles.formSectionTitle}>Your Role</Text>
            <Text style={styles.inputLabel}>You will be registered as *</Text>
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setShowRolePicker(true)}
            >
              <Text style={styles.selectorText}>
                {ROLES.find((r) => r.value === registrantRole)?.label}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#60A5FA" />
            <Text style={styles.infoText}>
              Your team will be pending until the club administrator approves
              it.
            </Text>
          </View>
        </>
      )}

      {step === 'user-info' && (
        <>
          <Text style={styles.stepTitle}>Your Information</Text>
          <Text style={styles.stepSubtitle}>
            You'll be registered as{' '}
            {ROLES.find((r) => r.value === registrantRole)?.label}
          </Text>

          {!user && (
            <SmartRegistrationToggle
              mode={registrationMode}
              onModeChange={setRegistrationMode}
              disabled={false}
            />
          )}

          {user && (
            <View style={styles.verifiedBannerWithAction}>
              <View style={styles.verifiedBannerContent}>
                <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                <Text style={styles.verifiedText}>
                  Logged in as {user.email}
                </Text>
              </View>
              <TouchableOpacity
                onPress={async () => {
                  await supabase.auth.signOut();
                  setVerifiedUserId(null);
                  setVerifiedEmail(null);
                  setRegistrationMode('new');
                }}
              >
                <Text style={styles.notYouText}>Not you?</Text>
              </TouchableOpacity>
            </View>
          )}

          {!user &&
            verifiedUserId &&
            registrationMode === 'existing' && (
              <View style={styles.verifiedBanner}>
                <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                <Text style={styles.verifiedText}>
                  Verified as {verifiedEmail}
                </Text>
              </View>
            )}

          {!user &&
            !verifiedUserId &&
            registrationMode === 'existing' && (
              <View style={styles.warningBox}>
                <Ionicons
                  name="information-circle"
                  size={20}
                  color="#FBBF24"
                />
                <Text style={styles.warningText}>
                  Tap "Register Team" to verify your identity
                </Text>
              </View>
            )}

          {registrationMode === 'new' && (
            <View style={styles.formSection}>
              <FormInput
                label="Full Name *"
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
                label="Email Address *"
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
                label="Phone Number *"
                value={phone}
                onChangeText={(text) => {
                  setPhone(text);
                  setFormErrors((prev) => ({ ...prev, phone: '' }));
                }}
                error={formErrors.phone}
              />

              <View style={styles.passwordSection}>
                <Text style={styles.formSectionTitle}>Create Password</Text>

                <PasswordInput
                  label="Password *"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    setFormErrors((prev) => ({ ...prev, password: '' }));
                  }}
                  showValidation={true}
                  error={formErrors.password}
                />

                <PasswordInput
                  label="Confirm Password *"
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    setFormErrors((prev) => ({ ...prev, confirmPassword: '' }));
                  }}
                  error={formErrors.confirmPassword}
                />
              </View>
            </View>
          )}

          {registrationMode === 'existing' &&
            (verifiedUserId || user) && (
              <View style={styles.readyCard}>
                <Ionicons
                  name="checkmark-circle"
                  size={48}
                  color="#22C55E"
                />
                <Text style={styles.readyTitle}>Ready to Register!</Text>
                <Text style={styles.readyText}>
                  Your team will be created under {selectedClub?.name}
                </Text>
              </View>
            )}

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Team Summary</Text>
            <View style={styles.summaryRow}>
              <Ionicons name="shield-outline" size={18} color="#9CA3AF" />
              <Text style={styles.summaryLabel}>Club:</Text>
              <Text style={styles.summaryValue}>{selectedClub?.name}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Ionicons name="people-outline" size={18} color="#9CA3AF" />
              <Text style={styles.summaryLabel}>Team:</Text>
              <Text style={styles.summaryValue}>{teamName}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Ionicons name="calendar-outline" size={18} color="#9CA3AF" />
              <Text style={styles.summaryLabel}>Age/Gender:</Text>
              <Text style={styles.summaryValue}>
                {ageGroup}{' '}
                {GENDERS.find((g) => g.value === gender)?.label || gender}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Ionicons name="person-outline" size={18} color="#9CA3AF" />
              <Text style={styles.summaryLabel}>Your Role:</Text>
              <Text style={styles.summaryValue}>
                {ROLES.find((r) => r.value === registrantRole)?.label}
              </Text>
            </View>
          </View>

          {formErrors.submit && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={20} color="#EF4444" />
              <Text style={styles.errorBoxText}>{formErrors.submit}</Text>
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
              {step === 'team-info' ? 'Continue' : 'Register Team'}
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </>
        )}
      </TouchableOpacity>

      <PickerModal
        visible={showClubPicker}
        onClose={() => setShowClubPicker(false)}
        title="Select Club"
        options={clubs}
        selectedValue={selectedClub}
        onSelect={setSelectedClub}
        renderItem={(club: Club) => (
          <View style={styles.clubPickerItem}>
            {club.logo_url ? (
              <Image
                source={{ uri: club.logo_url }}
                style={styles.clubLogoSmall}
              />
            ) : (
              <View style={styles.clubLogoPlaceholderSmall}>
                <Ionicons
                  name="shield-outline"
                  size={20}
                  color="#6B7280"
                />
              </View>
            )}
            <Text style={styles.pickerItemText}>{club.name}</Text>
          </View>
        )}
      />

      <PickerModal
        visible={showAgeGroupPicker}
        onClose={() => setShowAgeGroupPicker(false)}
        title="Select Age Group"
        options={AGE_GROUPS}
        selectedValue={ageGroup}
        onSelect={setAgeGroup}
      />

      <PickerModal
        visible={showGenderPicker}
        onClose={() => setShowGenderPicker(false)}
        title="Select Gender"
        options={GENDERS}
        selectedValue={gender}
        onSelect={(g: { value: string }) => setGender(g.value)}
      />

      <PickerModal
        visible={showRolePicker}
        onClose={() => setShowRolePicker(false)}
        title="Select Your Role"
        options={ROLES}
        selectedValue={registrantRole}
        onSelect={(role: { value: string }) => setRegistrantRole(role.value)}
      />

      <IdentityVerificationModal
        visible={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        onVerified={handleVerificationSuccess}
        teamName={teamName}
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
  screenTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  screenSubtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 32,
  },
  formSection: {
    marginBottom: 24,
  },
  formSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#D1D5DB',
    marginBottom: 8,
    marginTop: 12,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  selectorError: {
    borderColor: '#EF4444',
  },
  selectorText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  selectorPlaceholder: {
    fontSize: 16,
    color: '#6B7280',
  },
  selectedClub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clubLogoSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  clubLogoPlaceholderSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    marginTop: 4,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#1E3A5F',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    alignItems: 'center',
    marginBottom: 24,
  },
  infoText: {
    color: '#93C5FD',
    fontSize: 14,
    flex: 1,
  },
  placeholderStep: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    marginBottom: 24,
  },
  placeholderText: {
    color: '#6B7280',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  continueButton: {
    backgroundColor: '#8B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
  },
  verifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#14532D',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  verifiedText: {
    color: '#86EFAC',
    fontSize: 14,
    fontWeight: '500',
  },
  verifiedBannerWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#14532D',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  verifiedBannerContent: {
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
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#422006',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  warningText: {
    color: '#FCD34D',
    fontSize: 14,
    flex: 1,
  },
  passwordSection: {
    marginTop: 24,
  },
  readyCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  readyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  readyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    width: 80,
  },
  summaryValue: {
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
  },
  errorBox: {
    flexDirection: 'row',
    backgroundColor: '#7F1D1D',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  errorBoxText: {
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
  successTeamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 20,
  },
  successClubLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  successClubLogoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successTeamInfo: {
    marginLeft: 16,
    flex: 1,
  },
  successTeamName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  successClubName: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 2,
  },
  successBadges: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  successBadge: {
    backgroundColor: '#374151',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  successBadgeText: {
    fontSize: 12,
    color: '#D1D5DB',
  },
  statusCard: {
    flexDirection: 'row',
    backgroundColor: '#422006',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 20,
    gap: 12,
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FCD34D',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 14,
    color: '#FDE68A',
    lineHeight: 20,
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
  nextStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextStepNumberText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  nextStepText: {
    fontSize: 14,
    color: '#D1D5DB',
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#8B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 8,
    width: '100%',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#8B5CF6',
    fontSize: 16,
    fontWeight: '500',
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
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pickerList: {
    padding: 8,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 8,
  },
  pickerItemSelected: {
    backgroundColor: '#2D2050',
  },
  pickerItemText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  clubPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});

export default RegisterTeamScreen;
