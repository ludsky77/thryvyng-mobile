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
import { useEmailAvailability } from '../../hooks/useEmailAvailability';
import { IdentityVerificationModal } from '../../components/modals';
import type { RootStackParamList } from '../../navigation/linking';

type JoinTeamRouteProp = RouteProp<RootStackParamList, 'JoinTeam'>;
type JoinTeamNavigationProp = NativeStackNavigationProp<RootStackParamList, 'JoinTeam'>;

interface TeamInfo {
  id: string;
  name: string;
  age_group: string | null;
  gender: string | null;
  invitation_code: string;
  status: string;
  club: {
    id: string;
    name: string;
    logo_url: string | null;
  } | null;
}

type ScreenState = 'loading' | 'valid' | 'invalid' | 'expired' | 'error';

// Generate unique referral code (8 characters, uppercase alphanumeric)
// Matches web app format
const generateReferralCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const JoinTeamScreen: React.FC = () => {
  const route = useRoute<JoinTeamRouteProp>();
  const navigation = useNavigation<JoinTeamNavigationProp>();
  const { user } = useAuth();
  const { setRegistrationData, clearRegistrationData } = useRegistration();

  const code = route.params?.code ?? '';

  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Registration flow state
  const [step, setStep] = useState<
    'team-info' | 'mode-select' | 'player-select' | 'parent-form'
  >('team-info');
  const [registrationMode, setRegistrationMode] = useState<'new' | 'existing'>('new');

  // Player selection state
  const [existingPlayers, setExistingPlayers] = useState<any[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playerLinkMode, setPlayerLinkMode] = useState<'existing' | 'new'>('new');

  // New player form state
  const [playerFirstName, setPlayerFirstName] = useState('');
  const [playerLastName, setPlayerLastName] = useState('');
  const [playerDOB, setPlayerDOB] = useState('');
  const [playerJersey, setPlayerJersey] = useState('');

  // DOB verification state (for linking to existing player)
  const [dobVerifyAttempts, setDobVerifyAttempts] = useState(0);
  const [dobVerifyError, setDobVerifyError] = useState('');

  // Parent form state (for new users)
  const [parentFirstName, setParentFirstName] = useState('');
  const [parentLastName, setParentLastName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Form validation state
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success state
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [createdPlayer, setCreatedPlayer] = useState<any>(null);

  // Email availability hook
  const {
    isChecking: isCheckingEmail,
    isAvailable: isEmailAvailable,
    checkEmail,
  } = useEmailAvailability();

  // Identity verification state (for existing users)
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (code) {
      validateInvitationCode(code);
      setRegistrationData({
        teamInviteCode: code,
        activeFlow: 'join-team',
      });
    } else {
      setScreenState('invalid');
      setErrorMessage('No invitation code provided');
    }
  }, [code]);

  // Check email availability when email changes (for new users)
  useEffect(() => {
    if (registrationMode === 'new' && parentEmail && isEmailValid(parentEmail)) {
      checkEmail(parentEmail);
    }
  }, [parentEmail, registrationMode]);

  // Auto-detect if user is already logged in (for existing user mode)
  useEffect(() => {
    if (user && registrationMode === 'existing') {
      setVerifiedUserId(user.id);
      setVerifiedEmail(user.email || null);
      if (__DEV__) {
        console.log('[JoinTeam] User already logged in, skipping verification');
      }
    }
  }, [user, registrationMode]);

  const validateInvitationCode = async (inviteCode: string) => {
    try {
      if (__DEV__) {
        console.log('[JoinTeam] Validating invitation code:', inviteCode);
      }

      const { data: team, error } = await supabase
        .from('teams')
        .select(
          `
          id,
          name,
          age_group,
          gender,
          invitation_code,
          status,
          club:clubs (
            id,
            name,
            logo_url
          )
        `
        )
        .eq('invitation_code', inviteCode)
        .single();

      if (error || !team) {
        if (__DEV__) {
          console.log('[JoinTeam] Team not found:', error);
        }
        setScreenState('invalid');
        setErrorMessage(
          'This invitation link is not valid. Please check with your team manager.'
        );
        return;
      }

      if (team.status !== 'approved') {
        if (__DEV__) {
          console.log('[JoinTeam] Team not approved:', team.status);
        }
        setScreenState('expired');
        setErrorMessage(
          'This team is not yet approved. Please contact your club administrator.'
        );
        return;
      }

      if (__DEV__) {
        console.log('[JoinTeam] Team found:', team.name);
      }

      setTeamInfo(team as TeamInfo);
      setScreenState('valid');
    } catch (err) {
      if (__DEV__) {
        console.error('[JoinTeam] Error validating code:', err);
      }
      setScreenState('error');
      setErrorMessage('Something went wrong. Please try again later.');
    }
  };

  const fetchTeamPlayers = async (teamId: string) => {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('id, first_name, last_name, date_of_birth, jersey_number, parent_email')
        .eq('team_id', teamId)
        .is('parent_email', null)
        .order('last_name');

      if (error) {
        if (__DEV__) console.log('[JoinTeam] Error fetching players:', error);
        return;
      }

      if (__DEV__) console.log('[JoinTeam] Found unclaimed players:', data?.length);
      setExistingPlayers(data || []);
    } catch (err) {
      if (__DEV__) console.error('[JoinTeam] Error:', err);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!playerFirstName.trim()) errors.playerFirstName = 'Player first name is required';
    if (!playerLastName.trim()) errors.playerLastName = 'Player last name is required';
    if (!playerDOB) errors.playerDOB = 'Date of birth is required';

    if (registrationMode === 'new') {
      if (!parentFirstName.trim()) errors.parentFirstName = 'Your first name is required';
      if (!parentLastName.trim()) errors.parentLastName = 'Your last name is required';
      if (!parentEmail.trim()) errors.parentEmail = 'Email is required';
      else if (!isEmailValid(parentEmail)) errors.parentEmail = 'Please enter a valid email';
      else if (isEmailAvailable === false)
        errors.parentEmail = 'This email is already registered';
      if (!parentPhone.trim()) errors.parentPhone = 'Phone number is required';
      else if (!isPhoneValid(parentPhone))
        errors.parentPhone = 'Please enter a valid 10-digit phone';
      if (!password) errors.password = 'Password is required';
      else if (!isPasswordValid(password))
        errors.password = 'Password does not meet requirements';
      if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
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

      if (registrationMode === 'new') {
        if (__DEV__) console.log('[JoinTeam] Creating new user account...');

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: parentEmail.trim(),
          password: password,
          options: {
            data: {
              full_name: `${parentFirstName.trim()} ${parentLastName.trim()}`,
            },
          },
        });

        if (authError) {
          if (__DEV__) console.error('[JoinTeam] Auth error:', authError);
          setFormErrors({ submit: authError.message });
          return;
        }

        if (!authData.user) {
          setFormErrors({ submit: 'Failed to create account. Please try again.' });
          return;
        }

        userId = authData.user.id;
        userEmail = parentEmail.trim();

        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            phone: parentPhone.replace(/\D/g, ''),
            full_name: `${parentFirstName.trim()} ${parentLastName.trim()}`,
          })
          .eq('id', userId);

        if (profileError && __DEV__) {
          console.log('[JoinTeam] Profile update warning:', profileError);
        }
      } else {
        userId = verifiedUserId || user?.id || '';
        userEmail = verifiedEmail || user?.email || '';

        if (!userId) {
          setFormErrors({ submit: 'User verification failed. Please try again.' });
          return;
        }
      }

      if (__DEV__) console.log('[JoinTeam] Creating player for user:', userId);

      let playerData: any;

      if (playerLinkMode === 'existing' && selectedPlayerId) {
        const { error: updateError } = await supabase
          .from('players')
          .update({
            parent_email: userEmail,
            parent_first_name:
              registrationMode === 'new' ? parentFirstName.trim() : undefined,
            parent_last_name:
              registrationMode === 'new' ? parentLastName.trim() : undefined,
            parent_phone:
              registrationMode === 'new'
                ? parentPhone.replace(/\D/g, '')
                : undefined,
          })
          .eq('id', selectedPlayerId);

        if (updateError) {
          if (__DEV__) console.error('[JoinTeam] Player update error:', updateError);
          setFormErrors({ submit: 'Failed to link player. Please try again.' });
          return;
        }

        const { data: linkedPlayer } = await supabase
          .from('players')
          .select('*')
          .eq('id', selectedPlayerId)
          .single();

        playerData = linkedPlayer;
      } else {
        const { data: newPlayer, error: playerError } = await supabase
          .from('players')
          .insert({
            team_id: teamInfo?.id,
            first_name: playerFirstName.trim(),
            last_name: playerLastName.trim(),
            date_of_birth: playerDOB,
            jersey_number: playerJersey || null,
            parent_email: userEmail,
            parent_first_name:
              registrationMode === 'new' ? parentFirstName.trim() : null,
            parent_last_name:
              registrationMode === 'new' ? parentLastName.trim() : null,
            parent_phone:
              registrationMode === 'new'
                ? parentPhone.replace(/\D/g, '')
                : null,
            status: 'active',
            referral_code: generateReferralCode(),
          })
          .select()
          .single();

        if (playerError) {
          if (__DEV__)
            console.error('[JoinTeam] Player creation error:', playerError);
          setFormErrors({
            submit:
              playerError.message || 'Failed to create player. Please try again.',
          });
          return;
        }

        playerData = newPlayer;
      }

      if (__DEV__) console.log('[JoinTeam] Player created/linked:', playerData?.id);

      const { error: roleError } = await supabase.from('user_roles').insert({
        user_id: userId,
        role: 'parent',
        entity_id: playerData.id,
        entity_type: 'player',
      });

      if (roleError) {
        if (roleError.code === '23505') {
          if (__DEV__)
            console.log(
              '[JoinTeam] User already has parent role for this player'
            );
        } else {
          if (__DEV__) console.error('[JoinTeam] Role creation error:', roleError);
        }
      }

      try {
        await supabase.functions.invoke('send-email', {
          body: {
            to: userEmail,
            template: 'player-registration',
            data: {
              parentName:
                registrationMode === 'new'
                  ? `${parentFirstName} ${parentLastName}`
                  : 'Parent',
              playerName: `${playerData.first_name} ${playerData.last_name}`,
              teamName: teamInfo?.name,
              clubName: teamInfo?.club?.name,
            },
          },
        });
        if (__DEV__) console.log('[JoinTeam] Confirmation email sent');
      } catch (emailErr) {
        if (__DEV__) console.log('[JoinTeam] Email send warning:', emailErr);
      }

      setCreatedPlayer(playerData);
      setRegistrationComplete(true);
      clearRegistrationData();

      if (__DEV__) console.log('[JoinTeam] Registration complete!');
    } catch (err) {
      if (__DEV__) console.error('[JoinTeam] Unexpected error:', err);
      setFormErrors({
        submit: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerificationSuccess = (userId: string, email: string) => {
    setVerifiedUserId(userId);
    setVerifiedEmail(email);
    setShowVerificationModal(false);

    if (__DEV__) {
      console.log('[JoinTeam] Identity verified:', { userId, email });
    }

    setStep('player-select');
  };

  const handleContinue = async () => {
    if (step === 'team-info') {
      if (teamInfo?.id) {
        fetchTeamPlayers(teamInfo.id);
      }
      setStep('mode-select');
    } else if (step === 'mode-select') {
      if (registrationMode === 'existing') {
        if (user || verifiedUserId) {
          setStep('player-select');
        } else {
          setShowVerificationModal(true);
        }
      } else {
        setStep('player-select');
      }
    } else if (step === 'player-select') {
      const errors: Record<string, string> = {};
      if (playerLinkMode === 'new' || existingPlayers.length === 0) {
        if (!playerFirstName.trim()) errors.playerFirstName = 'Player first name is required';
        if (!playerLastName.trim()) errors.playerLastName = 'Player last name is required';
        if (!playerDOB) errors.playerDOB = 'Date of birth is required';
      } else if (playerLinkMode === 'existing' && selectedPlayerId) {
        const isValid = await verifyPlayerDOB(selectedPlayerId, playerDOB);
        if (!isValid) return;
      }

      if (Object.keys(errors).length > 0) {
        setFormErrors(errors);
        return;
      }

      if (registrationMode === 'new') {
        setStep('parent-form');
      } else {
        await submitRegistration();
      }
    } else if (step === 'parent-form') {
      if (!validateForm()) return;
      await submitRegistration();
    }
  };

  const verifyPlayerDOB = async (playerId: string, enteredDOB: string) => {
    const player = existingPlayers.find((p) => p.id === playerId);
    if (!player) return false;

    const playerDOBFormatted = player.date_of_birth?.split('T')[0];
    const match = playerDOBFormatted === enteredDOB;

    if (!match) {
      const attempts = dobVerifyAttempts + 1;
      setDobVerifyAttempts(attempts);

      if (attempts >= 3) {
        setDobVerifyError(
          'Too many failed attempts. Please contact your team manager.'
        );
      } else {
        setDobVerifyError(
          `Incorrect date of birth. ${3 - attempts} attempts remaining.`
        );
      }
      return false;
    }

    setDobVerifyError('');
    return true;
  };

  const handleBack = () => {
    if (step === 'parent-form') {
      setStep('player-select');
    } else if (step === 'player-select') {
      setStep('mode-select');
    } else if (step === 'mode-select') {
      setStep('team-info');
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

  if (screenState === 'loading') {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Validating invitation...</Text>
      </View>
    );
  }

  if (screenState === 'invalid' || screenState === 'expired' || screenState === 'error') {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorCard}>
          <Ionicons
            name={screenState === 'expired' ? 'time-outline' : 'alert-circle-outline'}
            size={64}
            color="#EF4444"
          />
          <Text style={styles.errorTitle}>
            {screenState === 'expired' ? 'Team Pending Approval' : 'Invalid Invitation'}
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
  if (registrationComplete && createdPlayer) {
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
            {createdPlayer.first_name} has been registered to {teamInfo?.name}
          </Text>

          <View style={styles.playerCard}>
            <View style={styles.playerAvatar}>
              <Text style={styles.playerAvatarText}>
                {createdPlayer.first_name?.[0]}
                {createdPlayer.last_name?.[0]}
              </Text>
            </View>
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>
                {createdPlayer.first_name} {createdPlayer.last_name}
              </Text>
              <Text style={styles.playerTeam}>{teamInfo?.name}</Text>
              {createdPlayer.jersey_number && (
                <Text style={styles.playerJersey}>
                  #{createdPlayer.jersey_number}
                </Text>
              )}
            </View>
          </View>

          {createdPlayer.referral_code && (
            <View style={styles.referralCard}>
              <Text style={styles.referralLabel}>Your Fundraising Code</Text>
              <Text style={styles.referralCode}>
                {createdPlayer.referral_code}
              </Text>
              <Text style={styles.referralHint}>
                Share this code when purchasing courses to support your team!
              </Text>
            </View>
          )}

          <View style={styles.nextStepsCard}>
            <Text style={styles.nextStepsTitle}>What's Next?</Text>
            <View style={styles.nextStep}>
              <Ionicons name="chatbubbles-outline" size={20} color="#8B5CF6" />
              <Text style={styles.nextStepText}>
                Check team chat for updates
              </Text>
            </View>
            <View style={styles.nextStep}>
              <Ionicons name="calendar-outline" size={20} color="#8B5CF6" />
              <Text style={styles.nextStepText}>
                View upcoming events & practices
              </Text>
            </View>
            <View style={styles.nextStep}>
              <Ionicons name="school-outline" size={20} color="#8B5CF6" />
              <Text style={styles.nextStepText}>
                Browse courses to boost skills
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

          <TouchableOpacity
            style={styles.addAnotherLink}
            onPress={() => {
              setRegistrationComplete(false);
              setCreatedPlayer(null);
              setStep('team-info');
              setPlayerFirstName('');
              setPlayerLastName('');
              setPlayerDOB('');
              setPlayerJersey('');
              setSelectedPlayerId(null);
              setPlayerLinkMode('new');
            }}
          >
            <Ionicons name="add-circle-outline" size={18} color="#8B5CF6" />
            <Text style={styles.addAnotherText}>Register Another Child</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // Valid team - show multi-step flow
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {step !== 'team-info' && (
        <TouchableOpacity style={styles.backNav} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color="#9CA3AF" />
          <Text style={styles.backNavText}>Back</Text>
        </TouchableOpacity>
      )}

      <View style={styles.stepIndicator}>
        <View style={[styles.stepDot, step === 'team-info' && styles.stepDotActive]} />
        <View style={styles.stepLine} />
        <View style={[styles.stepDot, step === 'mode-select' && styles.stepDotActive]} />
        <View style={styles.stepLine} />
        <View style={[styles.stepDot, step === 'player-select' && styles.stepDotActive]} />
        <View style={styles.stepLine} />
        <View style={[styles.stepDot, step === 'parent-form' && styles.stepDotActive]} />
      </View>

      {step === 'team-info' && (
        <>
          <View style={styles.headerCard}>
            {teamInfo?.club?.logo_url ? (
              <Image
                source={{ uri: teamInfo.club.logo_url }}
                style={styles.clubLogo}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.clubLogoPlaceholder}>
                <Ionicons name="shield-outline" size={48} color="#6B7280" />
              </View>
            )}

            <Text style={styles.clubName}>{teamInfo?.club?.name ?? 'Club'}</Text>
            <Text style={styles.teamName}>{teamInfo?.name}</Text>

            {(teamInfo?.age_group || teamInfo?.gender) && (
              <View style={styles.teamBadges}>
                {teamInfo?.age_group && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{teamInfo.age_group}</Text>
                  </View>
                )}
                {teamInfo?.gender && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{teamInfo.gender}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <View style={styles.welcomeCard}>
            <Ionicons name="people-outline" size={32} color="#8B5CF6" />
            <Text style={styles.welcomeTitle}>Join the Team!</Text>
            <Text style={styles.welcomeText}>
              You've been invited to join {teamInfo?.name}. Complete the registration to
              connect with your team.
            </Text>
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
                You're logged in as {user.email}. We'll add this player to your
                account.
              </Text>
            </View>
          )}

          {!user && registrationMode === 'existing' && verifiedUserId && (
            <View style={styles.infoBox}>
              <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
              <Text style={styles.infoText}>
                Verified as {verifiedEmail}. Continue to add your player.
              </Text>
            </View>
          )}

          {!user && registrationMode === 'existing' && !verifiedUserId && (
            <View style={styles.warningBox}>
              <Ionicons name="information-circle" size={20} color="#FBBF24" />
              <Text style={styles.warningText}>
                You'll need to verify your identity on the next step.
              </Text>
            </View>
          )}
        </>
      )}

      {step === 'player-select' && (
        <>
          <Text style={styles.stepTitle}>Player Information</Text>

          {existingPlayers.length > 0 && (
            <View style={styles.playerModeToggle}>
              <TouchableOpacity
                style={[
                  styles.playerModeOption,
                  playerLinkMode === 'existing' && styles.playerModeActive,
                ]}
                onPress={() => setPlayerLinkMode('existing')}
              >
                <Text
                  style={[
                    styles.playerModeText,
                    playerLinkMode === 'existing' && styles.playerModeTextActive,
                  ]}
                >
                  Select from Roster
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.playerModeOption,
                  playerLinkMode === 'new' && styles.playerModeActive,
                ]}
                onPress={() => setPlayerLinkMode('new')}
              >
                <Text
                  style={[
                    styles.playerModeText,
                    playerLinkMode === 'new' && styles.playerModeTextActive,
                  ]}
                >
                  Add New Player
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {playerLinkMode === 'existing' && existingPlayers.length > 0 && (
            <View style={styles.playerList}>
              <Text style={styles.playerListLabel}>Select your child:</Text>
              {existingPlayers.map((player) => (
                <TouchableOpacity
                  key={player.id}
                  style={[
                    styles.playerItem,
                    selectedPlayerId === player.id && styles.playerItemSelected,
                  ]}
                  onPress={() => setSelectedPlayerId(player.id)}
                >
                  <View style={styles.playerItemContent}>
                    <Text style={styles.playerItemName}>
                      {player.first_name} {player.last_name}
                    </Text>
                    {player.jersey_number && (
                      <Text style={styles.playerItemJersey}>
                        #{player.jersey_number}
                      </Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.radioCircle,
                      selectedPlayerId === player.id && styles.radioCircleSelected,
                    ]}
                  >
                    {selectedPlayerId === player.id && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                </TouchableOpacity>
              ))}

              {selectedPlayerId && (
                <View style={styles.dobVerifySection}>
                  <Text style={styles.dobVerifyLabel}>
                    Verify by entering your child's date of birth:
                  </Text>
                  <FormInput
                    label="Date of Birth"
                    value={playerDOB}
                    onChangeText={setPlayerDOB}
                    placeholder="YYYY-MM-DD"
                    keyboardType="numbers-and-punctuation"
                    error={dobVerifyError}
                  />
                </View>
              )}
            </View>
          )}

          {(playerLinkMode === 'new' || existingPlayers.length === 0) && (
            <View style={styles.newPlayerForm}>
              <FormInput
                label="Player First Name"
                value={playerFirstName}
                onChangeText={setPlayerFirstName}
                placeholder="First name"
                autoCapitalize="words"
              />
              <FormInput
                label="Player Last Name"
                value={playerLastName}
                onChangeText={setPlayerLastName}
                placeholder="Last name"
                autoCapitalize="words"
              />
              <FormInput
                label="Date of Birth"
                value={playerDOB}
                onChangeText={setPlayerDOB}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
              />
              <FormInput
                label="Jersey Number (Optional)"
                value={playerJersey}
                onChangeText={setPlayerJersey}
                placeholder="00"
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>
          )}
        </>
      )}

      {step === 'parent-form' && (
        <>
          <Text style={styles.stepTitle}>Your Information</Text>
          <Text style={styles.stepSubtitle}>Create your parent account</Text>

          <View style={styles.formSection}>
            <Text style={styles.formSectionTitle}>About You</Text>

            <FormInput
              label="Your First Name"
              value={parentFirstName}
              onChangeText={(text) => {
                setParentFirstName(text);
                setFormErrors((prev) => ({ ...prev, parentFirstName: '' }));
              }}
              placeholder="First name"
              autoCapitalize="words"
              error={formErrors.parentFirstName}
            />

            <FormInput
              label="Your Last Name"
              value={parentLastName}
              onChangeText={(text) => {
                setParentLastName(text);
                setFormErrors((prev) => ({ ...prev, parentLastName: '' }));
              }}
              placeholder="Last name"
              autoCapitalize="words"
              error={formErrors.parentLastName}
            />

            <EmailInput
              label="Email Address"
              value={parentEmail}
              onChangeText={(text) => {
                setParentEmail(text);
                setFormErrors((prev) => ({ ...prev, parentEmail: '' }));
              }}
              placeholder="you@example.com"
              error={formErrors.parentEmail}
              isChecking={isCheckingEmail}
              isAvailable={isEmailAvailable}
            />

            <PhoneInput
              label="Phone Number"
              value={parentPhone}
              onChangeText={(text) => {
                setParentPhone(text);
                setFormErrors((prev) => ({ ...prev, parentPhone: '' }));
              }}
              error={formErrors.parentPhone}
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

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Registering Player</Text>
            <Text style={styles.summaryText}>
              {playerLinkMode === 'existing' && selectedPlayerId
                ? (() => {
                    const p = existingPlayers.find((p) => p.id === selectedPlayerId);
                    return p ? `${p.first_name} ${p.last_name}` : '';
                  })()
                : `${playerFirstName} ${playerLastName}`}
            </Text>
            <Text style={styles.summarySubtext}>to {teamInfo?.name}</Text>
          </View>

          {formErrors.submit && (
            <View style={styles.submitErrorContainer}>
              <Ionicons name="alert-circle" size={20} color="#EF4444" />
              <Text style={styles.submitErrorText}>{formErrors.submit}</Text>
            </View>
          )}
        </>
      )}

      <TouchableOpacity
        style={[
          styles.continueButton,
          (step === 'player-select' &&
            playerLinkMode === 'existing' &&
            !selectedPlayerId) &&
            styles.continueButtonDisabled,
          isSubmitting && styles.continueButtonDisabled,
        ]}
        onPress={handleContinue}
        disabled={
          (step === 'player-select' &&
            playerLinkMode === 'existing' &&
            !selectedPlayerId) ||
          isSubmitting
        }
      >
        <Text style={styles.continueButtonText}>
          {step === 'parent-form'
            ? 'Complete Registration'
            : step === 'player-select' && registrationMode === 'existing'
              ? 'Verify Account'
              : step === 'player-select'
                ? 'Continue to Your Info'
                : 'Continue'}
        </Text>
        {isSubmitting ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
        )}
      </TouchableOpacity>

      <Text style={styles.helpText}>
        Need help? Contact your team manager or coach.
      </Text>

      <IdentityVerificationModal
        visible={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        onVerified={handleVerificationSuccess}
        teamName={teamInfo?.name}
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
  welcomeCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 12,
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 22,
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
    marginBottom: 20,
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
    marginTop: -12,
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
  summaryCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#374151',
  },
  summaryTitle: {
    fontSize: 12,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  summarySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 2,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#1E3A5F',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    alignItems: 'center',
  },
  infoText: {
    color: '#93C5FD',
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
  playerModeToggle: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 4,
    marginBottom: 20,
  },
  playerModeOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  playerModeActive: {
    backgroundColor: '#374151',
  },
  playerModeText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
  },
  playerModeTextActive: {
    color: '#FFFFFF',
  },
  playerList: {
    marginBottom: 20,
  },
  playerListLabel: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#374151',
  },
  playerItemSelected: {
    borderColor: '#8B5CF6',
    backgroundColor: '#2D2050',
  },
  playerItemContent: {
    flex: 1,
  },
  playerItemName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  playerItemJersey: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 2,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: '#8B5CF6',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#8B5CF6',
  },
  dobVerifySection: {
    marginTop: 16,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 16,
  },
  dobVerifyLabel: {
    color: '#D1D5DB',
    fontSize: 14,
    marginBottom: 12,
  },
  newPlayerForm: {
    marginBottom: 20,
  },
  continueButtonDisabled: {
    backgroundColor: '#4B5563',
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
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 20,
  },
  playerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  playerInfo: {
    marginLeft: 16,
    flex: 1,
  },
  playerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  playerTeam: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 2,
  },
  playerJersey: {
    fontSize: 13,
    color: '#8B5CF6',
    marginTop: 2,
  },
  referralCard: {
    backgroundColor: '#1E3A5F',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  referralLabel: {
    fontSize: 12,
    color: '#93C5FD',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  referralCode: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 2,
    marginBottom: 8,
  },
  referralHint: {
    fontSize: 13,
    color: '#93C5FD',
    textAlign: 'center',
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
    marginBottom: 16,
  },
  goToDashboardText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  addAnotherLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
  },
  addAnotherText: {
    color: '#8B5CF6',
    fontSize: 15,
    fontWeight: '500',
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
});

export default JoinTeamScreen;
