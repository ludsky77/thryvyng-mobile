import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Share,
  TextInput,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons, Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import {
  getCaptchaToken,
  CaptchaTimeoutError,
  CAPTCHA_TIMEOUT_MESSAGE,
} from '../../lib/captcha';
import { mapJoinError } from '../../lib/joinErrors';
import { useAuth } from '../../contexts/AuthContext';
import { useRegistration } from '../../contexts/RegistrationContext';
import {
  SmartRegistrationToggle,
  FormInput,
  PasswordInput,
  PhoneInput,
  formatPhone,
  EmailInput,
  isPasswordValid,
  isPhoneValid,
  isEmailValid,
} from '../../components/forms';
import { useEmailAvailability } from '../../hooks/useEmailAvailability';
import { IdentityVerificationModal } from '../../components/modals';
import type { RootStackParamList } from '../../navigation/linking';
import * as Clipboard from 'expo-clipboard';
import { slugify } from '../../utils/slugify';

const colors = {
  text: '#ffffff',
};

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

const MIN_PLAYER_DOB = new Date(2005, 0, 1);
const MIN_SELF_REGISTER_DOB = new Date(1970, 0, 1);

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmdLocal(s: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const mo = Number(match[2]) - 1;
  const d = Number(match[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

function clampDate(d: Date, min: Date, max: Date): Date {
  const t = d.getTime();
  if (t < min.getTime()) return new Date(min);
  if (t > max.getTime()) return new Date(max);
  return d;
}

/** Team invite: digits-only, dashed XXX-XXX-XXX, and raw trimmed for DB lookup */
function normalizeTeamInviteCandidates(inviteCode: string): string[] {
  const trimmed = inviteCode.trim();
  const digits = trimmed.replace(/\D/g, '').slice(0, 9);
  let formatted = '';
  if (digits.length <= 3) formatted = digits;
  else if (digits.length <= 6)
    formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
  else formatted = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
  return [...new Set([trimmed, digits, formatted].filter((c) => c.length > 0))];
}

/**
 * Optional phone field: blank is allowed, but anything entered must be exactly
 * 10 digits. Returns '' when valid, otherwise the inline error to display.
 */
function validateOptionalPhone(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return '';
  if (trimmed.includes('@')) return 'Enter a phone number, not an email.';
  if (trimmed.replace(/\D/g, '').length !== 10) {
    return 'Enter a valid 10-digit phone number.';
  }
  return '';
}

/**
 * Supabase auth errors carry their own vocabulary, which the RPC-oriented
 * join mapper flattens to the generic text. Catch the duplicate-account case
 * before delegating; everything else stays with mapJoinError.
 */
const mapAuthOrJoinError = (err: any): string => {
  const raw = String(err?.message || '').toLowerCase();
  if (raw.includes('already registered') || raw.includes('already exists')) {
    return 'An account with this email already exists. Please sign in instead.';
  }
  return mapJoinError(err);
};

/** Auto-format team code as user types (max 9 digits + 2 dashes) */
function formatTeamInviteInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
}

export const JoinTeamScreen: React.FC = () => {
  const route = useRoute<JoinTeamRouteProp>();
  const navigation = useNavigation<JoinTeamNavigationProp>();

  const { user, session, refreshRoles, signOut } = useAuth();

  // Without a session, resetting to 'Main' drops the user into an empty app
  // shell. Send logged-out users to the entry route instead.
  // ('Welcome' — RootStack.Screen, AppNavigator.tsx:686)
  const exitToMain = () => {
    if (user) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    } else {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Welcome' }],
      });
    }
  };
  const { setRegistrationData, clearRegistrationData } = useRegistration();

  const code = route.params?.code ?? '';
  const slug = route.params?.slug;
  // Backward compat: if code is empty, the slug IS the code (old URL format)
  const invitationCode = code || slug || '';
  const role = route.params?.role;

  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [manualInviteCode, setManualInviteCode] = useState('');

  const [playerDobPickerVisible, setPlayerDobPickerVisible] = useState(false);
  const [playerDobPickerDate, setPlayerDobPickerDate] = useState(
    () => new Date(2012, 5, 15)
  );
  const [claimDobPickerVisible, setClaimDobPickerVisible] = useState(false);
  const [claimDobPickerDate, setClaimDobPickerDate] = useState(
    () => new Date(2012, 5, 15)
  );

  // Registration flow state
  const [step, setStep] = useState<
    'team-info' | 'role-select' | 'mode-select' | 'player-select' | 'parent-form'
  >('team-info');
  const [joinRole, setJoinRole] = useState<'parent' | 'player' | 'staff' | null>(null);
  const [registrationMode, setRegistrationMode] = useState<'new' | 'existing'>('new');

  // Player selection state
  const [existingPlayers, setExistingPlayers] = useState<any[]>([]);
  const [rosterLoadFailed, setRosterLoadFailed] = useState(false);
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
  const [showParent2, setShowParent2] = useState(false);
  const [parent2FirstName, setParent2FirstName] = useState('');
  const [parent2LastName, setParent2LastName] = useState('');
  const [parent2Email, setParent2Email] = useState('');
  const [parent2Phone, setParent2Phone] = useState('');
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

  // Player self-claim state
  const [playerClaimStep, setPlayerClaimStep] = useState<'age_gate' | 'find_self' | 'create_account'>('age_gate');
  const [playerClaimDob, setPlayerClaimDob] = useState('');
  const [playerClaimAge, setPlayerClaimAge] = useState<number | null>(null);
  const [playerClaimAgeError, setPlayerClaimAgeError] = useState('');
  const [claimablePlayer, setClaimablePlayer] = useState<any>(null);
  const [claimRosterPlayers, setClaimRosterPlayers] = useState<any[]>([]);
  const [playerClaimEmail, setPlayerClaimEmail] = useState('');
  const [playerClaimPassword, setPlayerClaimPassword] = useState('');
  const [playerClaimConfirmPassword, setPlayerClaimConfirmPassword] = useState('');
  const [playerClaimPasswordError, setPlayerClaimPasswordError] = useState('');
  const [playerClaimMode, setPlayerClaimMode] = useState<'new' | 'existing' | null>(null);
  const [playerClaimSubmitting, setPlayerClaimSubmitting] = useState(false);
  const [playerClaimComplete, setPlayerClaimComplete] = useState(false);
  const [showPlayerClaimVerificationModal, setShowPlayerClaimVerificationModal] = useState(false);

  // Player self-registration (teams with player_join_mode 'open' only)
  const [selfCreateMode, setSelfCreateMode] = useState(false);
  const [selfCreateFirstName, setSelfCreateFirstName] = useState('');
  const [selfCreateLastName, setSelfCreateLastName] = useState('');
  const [selfCreateEmail, setSelfCreateEmail] = useState('');
  const [selfCreatePassword, setSelfCreatePassword] = useState('');
  const [selfCreateJersey, setSelfCreateJersey] = useState('');
  const [selfCreatePhone, setSelfCreatePhone] = useState('');
  const [selfCreateDupMatch, setSelfCreateDupMatch] = useState<any>(null);
  const [selfCreateChecking, setSelfCreateChecking] = useState(false);
  const [selfCreateSubmitting, setSelfCreateSubmitting] = useState(false);
  const [selfCreateError, setSelfCreateError] = useState('');
  // Set once the signup + session are established (or immediately for logged-in users).
  // Presence enables the "Try again" retry path so we don't re-run signup.
  const [selfCreatePending, setSelfCreatePending] = useState<{ userId: string; email: string } | null>(null);

  // Staff self-registration state
  const [staffClaimStep, setStaffClaimStep] = useState<'role_pick' | 'account' | null>(null);
  const [selectedStaffRole, setSelectedStaffRole] = useState<
    'head_coach' | 'assistant_coach' | 'team_manager' | null
  >(null);
  const [staffFullName, setStaffFullName] = useState('');
  const [staffFirstName, setStaffFirstName] = useState('');
  const [staffLastName, setStaffLastName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffConfirmPassword, setStaffConfirmPassword] = useState('');
  const [staffPasswordError, setStaffPasswordError] = useState('');
  const [staffMode, setStaffMode] = useState<'new' | 'existing' | null>(null);
  const [staffSubmitting, setStaffSubmitting] = useState(false);
  const [staffComplete, setStaffComplete] = useState(false);
  // What process_staff_join actually did. Defaults to 'pending' so a missing/garbled
  // RPC result can never render the "you're on the team" screen for someone who isn't.
  const [staffJoinStatus, setStaffJoinStatus] = useState<'active' | 'pending'>('pending');
  const [showStaffVerificationModal, setShowStaffVerificationModal] = useState(false);
  // Set once the account exists and the session is established (or immediately for
  // logged-in / already-verified users). Presence enables the "Try again" retry path so we
  // don't re-run signup or identity verification. fullName carries the resolved display
  // name when it came from a profile lookup rather than the form fields.
  const [staffJoinPending, setStaffJoinPending] = useState<{
    userId: string;
    email: string;
    fullName?: string;
  } | null>(null);

  useEffect(() => {
    if (invitationCode) {
      validateInvitationCode(invitationCode);
      setRegistrationData({
        teamInviteCode: invitationCode,
        activeFlow: 'join-team',
      });
    } else {
      setScreenState('invalid');
      setErrorMessage('No invitation code provided');
    }
  }, [invitationCode]);

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
      if (user.email) {
        setParentEmail(user.email.trim().toLowerCase());
      }
      const metaFirst = user.user_metadata?.first_name;
      const metaLast = user.user_metadata?.last_name;
      if (typeof metaFirst === 'string' && metaFirst.trim()) {
        setParentFirstName(metaFirst.trim());
      }
      if (typeof metaLast === 'string' && metaLast.trim()) {
        setParentLastName(metaLast.trim());
      }
      const metaPhone = user.user_metadata?.phone;
      if (typeof metaPhone === 'string' && metaPhone.trim()) {
        setParentPhone(formatPhone(metaPhone));
      }
      if (__DEV__) {
        console.log('[JoinTeam] User already logged in, skipping verification');
      }
    }
  }, [user, registrationMode]);

  // Auto-switch to existing-user mode when the user is already authed
  useEffect(() => {
    if (user) {
      setRegistrationMode((prev) => (prev === 'new' ? 'existing' : prev));
    }
  }, [user]);

  // Auto-switch to existing-player picker when roster has at least one player
  useEffect(() => {
    if (existingPlayers.length > 0) {
      setPlayerLinkMode((prev) => (prev === 'new' ? 'existing' : prev));
    }
  }, [existingPlayers.length]);

  // Pre-fill and lock the self-create email to the current session email when logged in
  useEffect(() => {
    if (user?.email) {
      setSelfCreateEmail(user.email.trim().toLowerCase());
    }
  }, [user?.email]);

  useEffect(() => {
    const isAuthed = !!user?.id || !!verifiedUserId;
    if (
      isAuthed &&
      joinRole === 'parent' &&
      teamInfo?.id &&
      existingPlayers.length === 0
    ) {
      if (__DEV__) console.log('[JoinTeam] Auth ready — re-fetching roster');
      fetchTeamPlayers(teamInfo.id);
    }
  }, [user?.id, verifiedUserId, joinRole, teamInfo?.id]);

  const validateInvitationCode = async (inviteCode: string) => {
    try {
      setScreenState('loading');

      if (__DEV__) {
        console.log('[JoinTeam] Validating invitation code:', inviteCode);
      }

      const candidates = normalizeTeamInviteCandidates(inviteCode);
      if (candidates.length === 0) {
        setScreenState('invalid');
        setErrorMessage(
          'This invitation link is not valid. Please check with your team manager.'
        );
        return;
      }

      // Only feed the .or() filter values that cannot alter its grammar: the
      // filter string is parsed by PostgREST, where ',' separates conditions.
      const safeCandidates = candidates.filter((c) => /^[A-Za-z0-9-]+$/.test(c));
      if (safeCandidates.length === 0) {
        if (__DEV__) {
          console.log('[JoinTeam] Team not found: no safe candidates');
        }
        setScreenState('invalid');
        setErrorMessage(
          'This invitation link is not valid. Please check with your team manager.'
        );
        return;
      }

      const { data: teams, error } = await supabase
        .from('teams')
        .select(
          `
          id,
          name,
          age_group,
          gender,
          invitation_code,
          status,
          player_join_mode,
          club:clubs (
            id,
            name,
            logo_url
          )
        `
        )
        .or(safeCandidates.map((c) => `invitation_code.ilike.${c}`).join(','))
        .limit(1);

      const team = teams?.[0];

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

      const teamInfo = {
        ...team,
        club: Array.isArray(team.club) ? team.club[0] : team.club,
      };
      setTeamInfo(teamInfo as TeamInfo);
      setRegistrationData({
        teamInviteCode: team.invitation_code,
        activeFlow: 'join-team',
      });
      setScreenState('valid');

      // Auto-select role if provided via deep link
      if (role === 'parent' || role === 'player' || role === 'staff') {
        setJoinRole(role);
        if (role === 'parent' && team.id) {
          fetchTeamPlayers(team.id);
          setStep('mode-select');
        } else {
          setStep('role-select');
        }
      }
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
      setRosterLoadFailed(false);
      const { data, error } = await (supabase as any).rpc('get_team_roster_for_join', {
        p_team_id: teamId,
      });
      if (error) {
        if (__DEV__) console.log('[JoinTeam] Error fetching team roster:', error);
        setRosterLoadFailed(true);
        return;
      }
      if (__DEV__) console.log('[JoinTeam] Team roster size:', data?.length);
      setExistingPlayers(data || []);
    } catch (err) {
      if (__DEV__) console.error('[JoinTeam] Error:', err);
      setRosterLoadFailed(true);
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

        let captchaToken: string | null;
        try {
          captchaToken = await getCaptchaToken();
        } catch (captchaErr) {
          if (captchaErr instanceof CaptchaTimeoutError) {
            setFormErrors({ submit: CAPTCHA_TIMEOUT_MESSAGE });
          }
          return;
        }
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: parentEmail.trim(),
          password: password,
          options: {
            captchaToken: captchaToken ?? undefined,
            data: {
              full_name: `${parentFirstName.trim()} ${parentLastName.trim()}`,
              first_name: parentFirstName.trim(),
              last_name: parentLastName.trim(),
            },
          },
        });

        if (authError) {
          if (__DEV__) console.error('[JoinTeam] Auth error:', authError);
          // Duplicate-account only: every other auth message is more useful raw
          // (password length, email format) than anything a mapper would give.
          const rawAuth = String(authError.message || '').toLowerCase();
          const isDuplicate =
            rawAuth.includes('already registered') || rawAuth.includes('already exists');
          setFormErrors({
            submit: isDuplicate
              ? 'An account with this email already exists. Please sign in instead.'
              : authError.message,
          });
          return;
        }

        if (!authData.user) {
          setFormErrors({ submit: 'Failed to create account. Please try again.' });
          return;
        }

        // Hydrate the session from the signUp response. If the tokens aren't returned
        // (e.g. email confirmation is required) the follow-up RPCs would fire with the
        // wrong auth uid, so hard-stop here.
        const accessToken = authData.session?.access_token;
        const refreshToken = authData.session?.refresh_token;
        if (!accessToken || !refreshToken) {
          setFormErrors({
            submit:
              'Account created. Please sign in and reopen the team link to finish registering.',
          });
          return;
        }
        const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (setSessionError || !sessionData?.session) {
          if (__DEV__) {
            console.warn(
              '[JoinTeam] setSession after parent signup failed:',
              setSessionError?.message
            );
          }
          setFormErrors({
            submit:
              'Account created. Please sign in and reopen the team link to finish registering.',
          });
          return;
        }

        userId = authData.user.id;
        userEmail = parentEmail.trim();

        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            phone: parentPhone.replace(/\D/g, ''),
            full_name: `${parentFirstName.trim()} ${parentLastName.trim()}`,
            first_name: parentFirstName.trim(),
            last_name: parentLastName.trim(),
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

      // For existing users, get their name from profile
      let existingParentFirstName = parentFirstName;
      let existingParentLastName = parentLastName;
      if (registrationMode === 'existing' && userId) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', userId)
            .single();
          if (profile?.full_name) {
            const nameParts = profile.full_name.split(' ');
            existingParentFirstName = nameParts[0] || '';
            existingParentLastName = nameParts.slice(1).join(' ') || '';
          }
        } catch (err) {
          if (__DEV__) console.log('[JoinTeam] Profile fetch for parent name failed:', err);
        }
      }

      if (__DEV__) console.log('[JoinTeam] Creating player for user:', userId);

      let playerData: any;

      if (playerLinkMode === 'existing' && selectedPlayerId) {
        const { data: linkResult, error: linkError } = await supabase.rpc('link_parent_to_player', {
          p_player_id: selectedPlayerId,
          p_user_id: userId,
          p_user_email: userEmail,
          p_verified_dob: playerDOB,
          p_parent_first_name:
            (registrationMode === 'new'
              ? parentFirstName.trim()
              : existingParentFirstName) || null,
          p_parent_last_name:
            (registrationMode === 'new'
              ? parentLastName.trim()
              : existingParentLastName) || null,
          p_parent_phone:
            (registrationMode === 'new'
              ? parentPhone.replace(/\D/g, '')
              : null) || null,
        });

        if (linkError) {
          if (__DEV__) console.error('link_parent_to_player error:', linkError);
          setFormErrors({ submit: mapJoinError(linkError) });
          return;
        }

        if (!linkResult?.success) {
          setFormErrors({ submit: 'Failed to link to player' });
          return;
        }

        const { data: linkedPlayer } = await supabase
          .from('players')
          .select('*')
          .eq('id', selectedPlayerId)
          .single();

        playerData = linkedPlayer;
      } else {
        const { data: registeredPlayerId, error: playerError } =
          await supabase.rpc('register_player', {
            p_first_name: playerFirstName.trim(),
            p_last_name: playerLastName.trim(),
            p_date_of_birth: playerDOB,
            p_gender: null,
            p_parent_email: userEmail?.toLowerCase() || user?.email || '',
            p_parent_first_name:
              registrationMode === 'new'
                ? parentFirstName.trim()
                : existingParentFirstName,
            p_parent_last_name:
              registrationMode === 'new'
                ? parentLastName.trim()
                : existingParentLastName,
            p_parent_phone:
              registrationMode === 'new'
                ? parentPhone.replace(/\D/g, '') || null
                : null,
            p_player_email: null,
            p_jersey_number: playerJersey || null,
            p_team_id: teamInfo?.id || null,
            p_allergies: null,
            p_medical_notes: null,
            p_emergency_contact_name: null,
            p_emergency_contact_phone: null,
            p_emergency_contact_relationship: null,
            p_city: null,
            p_status: 'active',
            p_secondary_parent_name:
              registrationMode === 'new' && playerLinkMode === 'new' && showParent2 && parent2FirstName.trim()
                ? `${parent2FirstName.trim()} ${parent2LastName.trim()}`.trim()
                : null,
            p_secondary_parent_email:
              registrationMode === 'new' && playerLinkMode === 'new' && showParent2 && parent2Email.trim()
                ? parent2Email.trim().toLowerCase()
                : null,
            p_secondary_parent_phone:
              registrationMode === 'new' && playerLinkMode === 'new' && showParent2 && parent2Phone
                ? parent2Phone.replace(/\D/g, '') || null
                : null,
          });

        if (playerError) {
          if (__DEV__)
            console.error('[JoinTeam] Player creation error:', playerError);
          setFormErrors({ submit: mapJoinError(playerError) });
          return;
        }

        playerData = {
          id: registeredPlayerId as string,
          first_name: playerFirstName.trim(),
          last_name: playerLastName.trim(),
        };

        if (__DEV__) console.log('[JoinTeam] Player created:', playerData?.id);

        const { error: roleError } = await supabase.from('user_roles').insert({
          user_id: userId,
          role: 'parent',
          entity_id: playerData.id,
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
      }

      if (__DEV__) console.log('[JoinTeam] Player created/linked:', playerData?.id);

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
      await refreshRoles(session?.user?.id || user?.id || userId);
      setRegistrationComplete(true);
      clearRegistrationData();

      if (__DEV__) console.log('[JoinTeam] Registration complete!');
    } catch (error: any) {
      console.error('[JoinTeam] Registration error:', error);
      const message = mapJoinError(error);
      Alert.alert('Registration Failed', message);
      setFormErrors({ submit: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerificationSuccess = (userId: string, email: string) => {
    setVerifiedUserId(userId);
    setVerifiedEmail(email);
    setShowVerificationModal(false);

    if (registrationMode === 'existing') {
      setParentEmail((email || user?.email || '').trim().toLowerCase());
      const metaFirst = user?.user_metadata?.first_name;
      const metaLast = user?.user_metadata?.last_name;
      if (typeof metaFirst === 'string' && metaFirst.trim()) {
        setParentFirstName(metaFirst.trim());
      }
      if (typeof metaLast === 'string' && metaLast.trim()) {
        setParentLastName(metaLast.trim());
      }
      const metaPhone = user?.user_metadata?.phone;
      if (typeof metaPhone === 'string' && metaPhone.trim()) {
        setParentPhone(formatPhone(metaPhone));
      }
    }

    if (__DEV__) {
      console.log('[JoinTeam] Identity verified:', { userId, email });
    }

    setStep('player-select');
  };

  const calculateAge = (dob: string): number => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const resetPlayerClaimState = () => {
    setPlayerClaimStep('age_gate');
    setPlayerClaimDob('');
    setPlayerClaimAge(null);
    setPlayerClaimAgeError('');
    setClaimablePlayer(null);
    setClaimRosterPlayers([]);
    setPlayerClaimEmail('');
    setPlayerClaimPassword('');
    setPlayerClaimConfirmPassword('');
    setPlayerClaimPasswordError('');
    setPlayerClaimMode(null);
    setPlayerClaimSubmitting(false);
    setPlayerClaimComplete(false);
    setShowPlayerClaimVerificationModal(false);
  };

  const fetchRosterForClaim = async (teamId: string) => {
    try {
      const { data, error } = await supabase
        .from('team_players_for_registration')
        .select('id, first_name, last_name, birth_year, jersey_number')
        .eq('team_id', teamId)
        .order('last_name', { ascending: true });
      if (error) throw error;
      setClaimRosterPlayers(data || []);
    } catch (err) {
      if (__DEV__) console.error('[JoinTeam] Error fetching roster for claim:', err);
      setClaimRosterPlayers([]);
    }
  };

  const handlePlayerClaimAgeCheck = () => {
    if (!playerClaimDob) {
      setPlayerClaimAgeError('Please enter your date of birth');
      return;
    }
    const age = calculateAge(playerClaimDob);
    setPlayerClaimAge(age);
    const isSelfCreateTeam = (teamInfo as any)?.player_join_mode === 'open';
    const minAge = isSelfCreateTeam ? 16 : 11;
    if (age < minAge) {
      setPlayerClaimAgeError(
        `You must be at least ${minAge} years old to create your own account. Please ask your parent or guardian to register you using this same team link — they should select "Parent / Guardian."`
      );
    } else {
      setPlayerClaimAgeError('');
      if (teamInfo?.id) {
        fetchRosterForClaim(teamInfo.id);
      }
      setPlayerClaimStep('find_self');
    }
  };

  const handleSelectSelfFromRoster = async (player: any) => {
    try {
      const { data: isMatch, error: dobError } = await supabase.rpc('verify_player_dob', {
        player_id: player.id,
        provided_dob: playerClaimDob,
      });

      if (dobError) {
        if (__DEV__) console.error('[JoinTeam] DOB verify error:', dobError);
        setFormErrors({ submit: 'Unable to verify. Please try again.' });
        return;
      }

      if (!isMatch) {
        setFormErrors({
          submit:
            "That doesn't match our records. Make sure you entered your correct date of birth on the previous screen.",
        });
        return;
      }

      const { data: fullPlayer, error: claimError } = await supabase.rpc('check_player_claim_status', {
        target_player_id: player.id,
      });

      if (claimError) {
        if (__DEV__) console.error('[JoinTeam] Claim check error:', claimError);
        setFormErrors({ submit: 'Unable to verify player status. Please try again.' });
        return;
      }

      if (fullPlayer?.claimed_at) {
        // Allow rightful claimant to re-enter — already linked, just exit to main app
        const callerEmail = user?.email?.toLowerCase();
        const claimantEmail = (fullPlayer.email as string | null | undefined)?.toLowerCase();
        if (callerEmail && claimantEmail && callerEmail === claimantEmail) {
          exitToMain();
          return;
        }
        setFormErrors({
          submit:
            'This player account has already been claimed. If this is a mistake, please contact your team manager.',
        });
        return;
      }

      if (!fullPlayer?.allow_self_registration) {
        setFormErrors({
          submit:
            'Self-registration has been disabled for your account by your coach. Please contact your team manager.',
        });
        return;
      }

      setFormErrors({});
      setClaimablePlayer(fullPlayer);
      setPlayerClaimStep('create_account');
    } catch (err) {
      if (__DEV__) console.error('[JoinTeam] Select self error:', err);
      setFormErrors({ submit: 'Something went wrong. Please try again.' });
    }
  };

  // Check for an existing player before creating a new one (teams with player_join_mode 'open' only)
  const handleSelfCreateDupCheck = async () => {
    setSelfCreateError('');
    if (!selfCreateFirstName.trim() || !selfCreateLastName.trim() || !selfCreateEmail.trim()) {
      setSelfCreateError('Please fill in your name and email.');
      return;
    }
    setSelfCreateChecking(true);
    try {
      const { data, error } = await supabase.rpc('check_self_register_duplicate', {
        p_email: selfCreateEmail.trim().toLowerCase(),
        p_first_name: selfCreateFirstName.trim(),
        p_last_name: selfCreateLastName.trim(),
        p_date_of_birth: playerClaimDob,
      });
      if (error) throw error;
      setSelfCreateDupMatch(data);
    } catch (err: any) {
      if (__DEV__) console.error('[JoinTeam] Self-create dup check error:', err);
      setSelfCreateError('Could not check for an existing account. Please try again.');
    } finally {
      setSelfCreateChecking(false);
    }
  };

  const runSelfRegisterRpc = async (userId: string, email: string): Promise<void> => {
    if (!teamInfo?.id) throw new Error('Team not found. Please reopen the invite link.');
    const { data: result, error: rpcError } = await supabase.rpc('self_register_player_for_team', {
      p_team_id: teamInfo.id,
      p_user_id: userId,
      p_email: email,
      p_first_name: selfCreateFirstName.trim(),
      p_last_name: selfCreateLastName.trim(),
      p_date_of_birth: playerClaimDob,
      p_jersey_number: selfCreateJersey.trim() || null,
      p_gender: null,
      p_phone: selfCreatePhone.trim() || null,
    });
    if (rpcError) throw rpcError;
    if (!(result as any)?.success) throw new Error('Registration failed. Please try again.');

    // Pass the user id explicitly: refreshRoles reads session?.user?.id from context,
    // which may not have committed yet right after setSession, so a bare call no-ops.
    try {
      await refreshRoles(userId);
    } catch {
      // Non-fatal
    }

    setSelfCreatePending(null);
    setClaimablePlayer({
      first_name: selfCreateFirstName.trim(),
      last_name: selfCreateLastName.trim(),
    });
    setPlayerClaimComplete(true);
  };

  // Create the auth account (or reuse the existing session), then create/attach the player row
  const handleSelfCreateSubmit = async () => {
    setSelfCreateError('');
    if (!teamInfo?.id) {
      setSelfCreateError('Team not found. Please reopen the invite link.');
      return;
    }
    const isLoggedIn = !!user;
    if (!isLoggedIn && (!selfCreatePassword || selfCreatePassword.length < 6)) {
      setSelfCreateError('Password must be at least 6 characters.');
      return;
    }
    const selfCreatePhoneError = validateOptionalPhone(selfCreatePhone);
    if (selfCreatePhoneError) {
      setSelfCreateError(selfCreatePhoneError);
      return;
    }
    setSelfCreateSubmitting(true);
    try {
      let userId: string;
      let email: string;

      if (isLoggedIn) {
        userId = user!.id;
        email = (user!.email || selfCreateEmail).trim().toLowerCase();
        setSelfCreatePending({ userId, email });
      } else {
        const emailLower = selfCreateEmail.trim().toLowerCase();
        let captchaToken: string | null;
        try {
          captchaToken = await getCaptchaToken();
        } catch (captchaErr) {
          if (captchaErr instanceof CaptchaTimeoutError) {
            setSelfCreateError(CAPTCHA_TIMEOUT_MESSAGE);
          }
          return;
        }
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: emailLower,
          password: selfCreatePassword,
          options: {
            captchaToken: captchaToken ?? undefined,
            data: {
              full_name: `${selfCreateFirstName.trim()} ${selfCreateLastName.trim()}`.trim(),
              first_name: selfCreateFirstName.trim(),
              last_name: selfCreateLastName.trim(),
              role: 'player',
            },
          },
        });
        if (signUpError) throw signUpError;
        if (!authData.user) throw new Error('Account creation failed. Please try again.');

        // Mirror the web app: hydrate the session from the signUp response.
        // If the tokens aren't returned (e.g. email confirmation is required) the
        // subsequent RPC would fire with the wrong auth uid, so hard-stop here.
        const accessToken = authData.session?.access_token;
        const refreshToken = authData.session?.refresh_token;
        if (!accessToken || !refreshToken) {
          setSelfCreateError('Account created. Please sign in and reopen the team link to finish joining.');
          return;
        }
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (setSessionError) {
          if (__DEV__) console.warn('[JoinTeam] setSession after self-create signup failed:', setSessionError.message);
          setSelfCreateError('Account created. Please sign in and reopen the team link to finish joining.');
          return;
        }

        userId = authData.user.id;
        email = emailLower;
        setSelfCreatePending({ userId, email });
      }

      await runSelfRegisterRpc(userId, email);
    } catch (err: any) {
      if (__DEV__) console.error('[JoinTeam] Self-create submit error:', err);
      setSelfCreateError(mapAuthOrJoinError(err));
    } finally {
      setSelfCreateSubmitting(false);
    }
  };

  // Retry only the RPC. The session stays alive; the RPC is idempotent.
  const handleSelfCreateRetry = async () => {
    if (!selfCreatePending) return;
    setSelfCreateError('');
    setSelfCreateSubmitting(true);
    try {
      await runSelfRegisterRpc(selfCreatePending.userId, selfCreatePending.email);
    } catch (err: any) {
      if (__DEV__) console.error('[JoinTeam] Self-create retry error:', err);
      setSelfCreateError(mapJoinError(err));
    } finally {
      setSelfCreateSubmitting(false);
    }
  };

  // Sign out and clear the self-create form so the user can register with a different account
  const handleSelfCreateSignOut = async () => {
    try {
      await signOut();
    } catch {
      // Non-fatal — the useEffect that mirrors user.email will clear regardless
    }
    setSelfCreateEmail('');
    setSelfCreatePassword('');
    setSelfCreateFirstName('');
    setSelfCreateLastName('');
    setSelfCreateJersey('');
    setSelfCreatePhone('');
    setSelfCreateDupMatch(null);
    setSelfCreateError('');
    setSelfCreatePending(null);
  };

  const handlePlayerClaimSubmit = async () => {
    if (!claimablePlayer) return;

    const isLoggedIn = !!user;
    const sessionEmail = (user?.email || '').trim().toLowerCase();

    if (isLoggedIn) {
      // The session owns the identity here: no email to type, no password to set.
      if (!sessionEmail) {
        setPlayerClaimPasswordError('Please enter your email');
        return;
      }

      if (sessionEmail === claimablePlayer.parent_email?.toLowerCase()) {
        setPlayerClaimPasswordError("Please use your own email address, not your parent's");
        return;
      }
    } else {
      if (!playerClaimEmail.trim()) {
        setPlayerClaimPasswordError('Please enter your email');
        return;
      }

      if (playerClaimEmail.trim().toLowerCase() === claimablePlayer.parent_email?.toLowerCase()) {
        setPlayerClaimPasswordError("Please use your own email address, not your parent's");
        return;
      }

      if (playerClaimMode === 'new') {
        if (!playerClaimPassword) {
          setPlayerClaimPasswordError('Password is required');
          return;
        }
        if (!isPasswordValid(playerClaimPassword)) {
          setPlayerClaimPasswordError('Password does not meet requirements');
          return;
        }
        if (playerClaimPassword !== playerClaimConfirmPassword) {
          setPlayerClaimPasswordError('Passwords do not match');
          return;
        }
      }
    }

    setPlayerClaimSubmitting(true);
    setPlayerClaimPasswordError('');

    try {
      if (playerClaimMode === 'new') {
        let claimUserId: string;
        let claimEmail: string;

        if (isLoggedIn) {
          // Already authenticated — no signUp, no setSession: swapping the live
          // session out from under the user is exactly what this guard prevents.
          claimUserId = user!.id;
          claimEmail = sessionEmail;
        } else {
          const emailAvailable = await new Promise<boolean>((resolve) => {
            supabase.functions
              .invoke('check-email-exists', {
                body: { email: playerClaimEmail.trim().toLowerCase() },
              })
              .then(({ data }) => resolve(!data?.exists))
              .catch(() => resolve(true));
          });

          if (!emailAvailable) {
            setPlayerClaimPasswordError(
              'This email already has an account. Select "I already have an account" instead.'
            );
            setPlayerClaimSubmitting(false);
            return;
          }

          let captchaToken: string | null;
          try {
            captchaToken = await getCaptchaToken();
          } catch (captchaErr) {
            if (captchaErr instanceof CaptchaTimeoutError) {
              setPlayerClaimPasswordError(CAPTCHA_TIMEOUT_MESSAGE);
            }
            return;
          }
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: playerClaimEmail.trim(),
            password: playerClaimPassword,
            options: {
              captchaToken: captchaToken ?? undefined,
              data: {
                full_name: `${claimablePlayer.first_name} ${claimablePlayer.last_name}`,
                first_name: claimablePlayer.first_name,
                last_name: claimablePlayer.last_name,
                role: 'player',
              },
            },
          });

          if (authError) throw authError;
          if (!authData.user) throw new Error('Failed to create account');

          // Hydrate the session from the signUp response. If the tokens aren't returned
          // (e.g. email confirmation is required) the claim RPC would fire with the wrong
          // auth uid, so hard-stop here.
          const accessToken = authData.session?.access_token;
          const refreshToken = authData.session?.refresh_token;
          if (!accessToken || !refreshToken) {
            setPlayerClaimPasswordError(
              'Account created. Please sign in and reopen the team link to finish claiming your account.'
            );
            return;
          }
          const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setSessionError || !sessionData?.session) {
            if (__DEV__) {
              console.warn(
                '[JoinTeam] setSession after player claim signup failed:',
                setSessionError?.message
              );
            }
            setPlayerClaimPasswordError(
              'Account created. Please sign in and reopen the team link to finish claiming your account.'
            );
            return;
          }

          claimUserId = authData.user.id;
          claimEmail = playerClaimEmail.trim().toLowerCase();
        }

        const { data: claimResult, error: claimError } = await supabase.rpc('claim_player_for_team', {
          p_player_id: claimablePlayer.id,
          p_user_id: claimUserId,
          p_user_email: claimEmail,
          p_verified_dob: playerClaimDob,
        });

        if (claimError) {
          if (__DEV__) console.error('claim_player_for_team error:', claimError);
          setPlayerClaimPasswordError(mapJoinError(claimError));
          setPlayerClaimSubmitting(false);
          return;
        }

        if (!claimResult?.success) {
          setPlayerClaimPasswordError('Failed to claim account');
          setPlayerClaimSubmitting(false);
          return;
        }

        try {
          await supabase.functions.invoke('send-email', {
            body: {
              to: isLoggedIn ? sessionEmail : playerClaimEmail.trim(),
              template: 'player-registration',
              data: {
                playerName: `${claimablePlayer.first_name} ${claimablePlayer.last_name}`,
                teamName: teamInfo?.name,
              },
            },
          });
        } catch (emailErr) {
          if (__DEV__) console.log('[JoinTeam] Email warning:', emailErr);
        }

        setPlayerClaimComplete(true);
      } else if (playerClaimMode === 'existing') {
        setShowPlayerClaimVerificationModal(true);
        setPlayerClaimSubmitting(false);
        return;
      }
    } catch (err: any) {
      if (__DEV__) console.error('[JoinTeam] Claim submit error:', err);
      setPlayerClaimPasswordError(mapAuthOrJoinError(err));
    } finally {
      setPlayerClaimSubmitting(false);
    }
  };

  const handlePlayerClaimVerified = async (userId: string, email: string) => {
    setShowPlayerClaimVerificationModal(false);
    setPlayerClaimSubmitting(true);

    try {
      const { data: claimResult, error: claimError } = await supabase.rpc('claim_player_for_team', {
        p_player_id: claimablePlayer.id,
        p_user_id: userId,
        p_user_email: playerClaimEmail.trim().toLowerCase(),
        p_verified_dob: playerClaimDob,
      });

      if (claimError) {
        if (__DEV__) console.error('claim_player_for_team error:', claimError);
        setPlayerClaimPasswordError(mapJoinError(claimError));
        setPlayerClaimSubmitting(false);
        return;
      }

      if (!claimResult?.success) {
        setPlayerClaimPasswordError('Failed to claim account');
        setPlayerClaimSubmitting(false);
        return;
      }

      try {
        await supabase.functions.invoke('send-email', {
          body: {
            to: playerClaimEmail.trim(),
            template: 'player-registration',
            data: {
              playerName: `${claimablePlayer.first_name} ${claimablePlayer.last_name}`,
              teamName: teamInfo?.name,
            },
          },
        });
      } catch (emailErr) {
        if (__DEV__) console.log('[JoinTeam] Email warning:', emailErr);
      }

      setPlayerClaimComplete(true);
    } catch (err: any) {
      if (__DEV__) console.error('[JoinTeam] Claim verify error:', err);
      setPlayerClaimPasswordError(mapJoinError(err));
    } finally {
      setPlayerClaimSubmitting(false);
    }
  };

  const resetStaffState = () => {
    setStaffClaimStep(null);
    setSelectedStaffRole(null);
    setStaffFullName('');
    setStaffEmail('');
    setStaffPhone('');
    setStaffPassword('');
    setStaffConfirmPassword('');
    setStaffPasswordError('');
    setStaffMode(null);
    setStaffSubmitting(false);
    setStaffComplete(false);
    setStaffJoinStatus('pending');
    setShowStaffVerificationModal(false);
    setStaffJoinPending(null);
  };

  const getStaffRoleDisplay = (role: string | null) => {
    if (role === 'head_coach') return 'Head Coach';
    if (role === 'assistant_coach') return 'Assistant Coach';
    if (role === 'team_manager') return 'Team Manager';
    return '';
  };

  // Runs process_staff_join and follows whichever branch the server took.
  // Staff self-joins land in 'pending_approval' — the RPC ignores p_auto_approve — so the
  // role only exists when it answers status 'active'. Safe to re-run on its own: the
  // account and session already exist by this point, and a repeat join answers
  // { status: 'active', already_member: true }.
  const runStaffJoinRpc = async (
    userId: string,
    email: string,
    fullNameOverride?: string
  ): Promise<void> => {
    if (!selectedStaffRole || !teamInfo) throw new Error('Missing role or team info');

    const fullName =
      fullNameOverride ||
      `${staffFirstName.trim()} ${staffLastName.trim()}`.trim() ||
      staffFullName.trim() ||
      email.split('@')[0];

    const { data: joinData, error: joinError } = await supabase.rpc('process_staff_join', {
      p_team_id: teamInfo.id,
      p_user_id: userId,
      p_staff_role: selectedStaffRole,
      p_full_name: fullName,
      p_email: email,
      p_phone: staffPhone.trim() || null,
      p_auto_approve: true,
    });

    if (joinError) throw joinError;

    // The RPC returns json, which reaches the client as an object or as a raw string
    // depending on how it is serialized. Accept both; anything unparseable stays {}.
    let parsed: Record<string, any> = {};
    if (typeof joinData === 'string') {
      try {
        parsed = JSON.parse(joinData) ?? {};
      } catch {
        parsed = {};
      }
    } else if (joinData && typeof joinData === 'object') {
      parsed = joinData as Record<string, any>;
    }

    // A transport-level success can still carry a business-level failure.
    if (parsed.success === false) {
      throw new Error(parsed.error || 'Failed to join team. Please try again.');
    }

    // Fail safe: only an explicit 'active' means a usable role exists right now.
    const isActive = parsed.status === 'active';

    if (isActive) {
      // Pass the user id explicitly: refreshRoles reads session?.user?.id from context,
      // which may not have committed yet right after setSession, so a bare call no-ops.
      try {
        await refreshRoles(userId);
      } catch {
        // Non-fatal
      }

      try {
        await supabase.functions.invoke('send-email', {
          body: {
            to: email,
            template: 'staff-welcome',
            data: {
              staffName: fullName,
              teamName: teamInfo.name,
              role: getStaffRoleDisplay(selectedStaffRole),
            },
          },
        });
      } catch (emailErr) {
        if (__DEV__) console.log('[JoinTeam] Staff email warning:', emailErr);
      }
    } else {
      // Pending approval: there is no role row to fetch, so refreshRoles would churn the
      // auth context for nothing. Confirm the request instead of welcoming them aboard.
      try {
        await supabase.functions.invoke('send-email', {
          body: {
            to: email,
            template: 'staff-pending',
            subject: `Your request to join ${teamInfo.name} is pending review`,
            data: {
              staffName: fullName,
              teamName: teamInfo.name,
              role: getStaffRoleDisplay(selectedStaffRole),
            },
          },
        });
      } catch (emailErr) {
        if (__DEV__) console.log('[JoinTeam] Staff pending email warning:', emailErr);
      }

      // Alerts the approvers. Non-fatal: the request row already exists either way.
      try {
        await supabase.functions.invoke('notify-staff-request', {
          body: { join_request_id: parsed.join_request_id },
        });
      } catch (notifyErr) {
        if (__DEV__) console.log('[JoinTeam] Staff request notify warning:', notifyErr);
      }
    }

    setStaffJoinPending(null);
    setStaffJoinStatus(isActive ? 'active' : 'pending');
    setStaffComplete(true);
  };

  const handleStaffSubmitNew = async () => {
    if (!selectedStaffRole || !teamInfo) return;

    const isLoggedIn = !!session?.user;

    if (!staffFirstName.trim()) {
      setStaffPasswordError('Please enter your first name');
      return;
    }
    if (!staffLastName.trim()) {
      setStaffPasswordError('Please enter your last name');
      return;
    }
    if (!isLoggedIn) {
      if (!staffEmail.trim() || !isEmailValid(staffEmail)) {
        setStaffPasswordError('Please enter a valid email');
        return;
      }
      if (!isPasswordValid(staffPassword)) {
        setStaffPasswordError('Password does not meet requirements');
        return;
      }
      if (staffPassword !== staffConfirmPassword) {
        setStaffPasswordError('Passwords do not match');
        return;
      }
    }
    const staffPhoneError = validateOptionalPhone(staffPhone);
    if (staffPhoneError) {
      setStaffPasswordError(staffPhoneError);
      return;
    }

    setStaffSubmitting(true);
    setStaffPasswordError('');

    try {
      // Already authenticated — no signup, just attach this session's user to the team.
      if (isLoggedIn) {
        const userId = session!.user.id;
        const email = (session!.user.email || staffEmail).trim().toLowerCase();
        setStaffJoinPending({ userId, email });
        await runStaffJoinRpc(userId, email);
        return;
      }

      const { data: emailCheck } = await supabase.functions.invoke('check-email-exists', {
        body: { email: staffEmail.trim().toLowerCase() },
      });

      if (emailCheck?.exists) {
        setStaffPasswordError(
          'This email already has an account. Select "Existing Account" instead.'
        );
        return;
      }

      const emailLower = staffEmail.trim().toLowerCase();
      const staffComputedFullName = `${staffFirstName.trim()} ${staffLastName.trim()}`;
      let captchaToken: string | null;
      try {
        captchaToken = await getCaptchaToken();
      } catch (captchaErr) {
        if (captchaErr instanceof CaptchaTimeoutError) {
          setStaffPasswordError(CAPTCHA_TIMEOUT_MESSAGE);
        }
        return;
      }
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: emailLower,
        password: staffPassword,
        options: {
          captchaToken: captchaToken ?? undefined,
          data: {
            full_name: staffComputedFullName,
            first_name: staffFirstName.trim(),
            last_name: staffLastName.trim(),
            role: selectedStaffRole,
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Failed to create account');

      // Mirror the player self-create path: hydrate the session from the signUp response.
      // If the tokens aren't returned (e.g. email confirmation is required) the RPC would
      // fire with the wrong auth uid, so hard-stop here.
      const accessToken = authData.session?.access_token;
      const refreshToken = authData.session?.refresh_token;
      if (!accessToken || !refreshToken) {
        setStaffPasswordError(
          'Account created. Please sign in and reopen the team link to finish joining.'
        );
        return;
      }
      const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (setSessionError || !sessionData?.session) {
        if (__DEV__) {
          console.warn(
            '[JoinTeam] setSession after staff signup failed:',
            setSessionError?.message
          );
        }
        setStaffPasswordError(
          'Account created. Please sign in and reopen the team link to finish joining.'
        );
        return;
      }

      setStaffJoinPending({
        userId: authData.user.id,
        email: emailLower,
        fullName: staffComputedFullName,
      });
      await runStaffJoinRpc(authData.user.id, emailLower, staffComputedFullName);
    } catch (err: any) {
      if (__DEV__) console.error('[JoinTeam] Staff submit error:', err);
      setStaffPasswordError(mapAuthOrJoinError(err));
    } finally {
      setStaffSubmitting(false);
    }
  };

  // Retry only the RPC. The session stays alive; no need to re-run signup.
  const handleStaffJoinRetry = async () => {
    if (!staffJoinPending) return;
    setStaffPasswordError('');
    setStaffSubmitting(true);
    try {
      await runStaffJoinRpc(
        staffJoinPending.userId,
        staffJoinPending.email,
        staffJoinPending.fullName
      );
    } catch (err: any) {
      if (__DEV__) console.error('[JoinTeam] Staff join retry error:', err);
      setStaffPasswordError(mapJoinError(err));
    } finally {
      setStaffSubmitting(false);
    }
  };

  // Sign out and clear the staff form so the user can join with a different account
  const handleStaffSignOut = async () => {
    try {
      await signOut();
    } catch {
      // Non-fatal
    }
    setStaffEmail('');
    setStaffPassword('');
    setStaffConfirmPassword('');
    setStaffPasswordError('');
    setStaffJoinPending(null);
  };

  const handleStaffSubmitExisting = async () => {
    if (!staffEmail.trim() || !isEmailValid(staffEmail)) {
      setStaffPasswordError('Please enter a valid email');
      return;
    }
    const staffPhoneError = validateOptionalPhone(staffPhone);
    if (staffPhoneError) {
      setStaffPasswordError(staffPhoneError);
      return;
    }

    setStaffSubmitting(true);
    setStaffPasswordError('');

    try {
      const { data: emailCheck } = await supabase.functions.invoke('check-email-exists', {
        body: { email: staffEmail.trim().toLowerCase() },
      });

      if (!emailCheck?.exists) {
        setStaffPasswordError(
          'No account found with this email. Select "New Account" instead.'
        );
        setStaffSubmitting(false);
        return;
      }

      setStaffSubmitting(false);
      setShowStaffVerificationModal(true);
    } catch (err: any) {
      if (__DEV__) console.error('[JoinTeam] Staff email check error:', err);
      setStaffPasswordError('Something went wrong. Please try again.');
      setStaffSubmitting(false);
    }
  };

  const handleStaffVerified = async (userId: string, email: string) => {
    setShowStaffVerificationModal(false);
    setStaffSubmitting(true);

    try {
      if (!selectedStaffRole || !teamInfo) throw new Error('Missing role or team info');

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single();

      const name = profile?.full_name || staffFullName.trim() || email.split('@')[0];

      // Identity is already verified at this point — a failed RPC should retry the RPC
      // alone, not send the user back through the verification modal.
      setStaffJoinPending({ userId, email, fullName: name });
      await runStaffJoinRpc(userId, email, name);
    } catch (err: any) {
      if (__DEV__) console.error('[JoinTeam] Staff verified error:', err);
      setStaffPasswordError(mapJoinError(err));
    } finally {
      setStaffSubmitting(false);
    }
  };

  const handleContinue = async () => {
    if (step === 'team-info') {
      setStep('role-select');
    } else if (step === 'role-select') {
      if (joinRole === 'parent') {
        if (teamInfo?.id) {
          fetchTeamPlayers(teamInfo.id);
        }
        setStep('mode-select');
      }
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
    try {
      const { data: isMatch, error } = await supabase.rpc('verify_player_dob', {
        player_id: playerId,
        provided_dob: enteredDOB,
      });

      if (error) {
        if (__DEV__) console.error('[JoinTeam] verify_player_dob error:', error);
        setDobVerifyError('Unable to verify date of birth. Please try again.');
        return false;
      }

      if (!isMatch) {
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
    } catch (e) {
      if (__DEV__) console.error('[JoinTeam] verify_player_dob exception:', e);
      setDobVerifyError('Unable to verify date of birth. Please try again.');
      return false;
    }
  };

  const handleBack = () => {
    if (step === 'parent-form') {
      setStep('player-select');
    } else if (step === 'player-select') {
      setStep('mode-select');
    } else if (step === 'mode-select') {
      setStep('role-select');
    } else if (step === 'role-select') {
      setJoinRole(null);
      setStep('team-info');
    } else {
      exitToMain();
    }
  };

  const handleGoBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      exitToMain();
    }
  };

  const openPlayerDobPicker = () => {
    const maxDob = new Date();
    const parsed = parseYmdLocal(playerDOB);
    const initial = parsed
      ? clampDate(parsed, MIN_PLAYER_DOB, maxDob)
      : clampDate(new Date(2012, 5, 15), MIN_PLAYER_DOB, maxDob);
    setPlayerDobPickerDate(initial);
    setPlayerDobPickerVisible(true);
  };

  const onPlayerDobPickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setPlayerDobPickerVisible(false);
    }
    if (event.type === 'dismissed') {
      if (Platform.OS === 'ios') {
        setPlayerDobPickerVisible(false);
      }
      return;
    }
    if (date) {
      const maxDob = new Date();
      const clamped = clampDate(date, MIN_PLAYER_DOB, maxDob);
      const ymd = formatYmd(clamped);
      setPlayerDOB(ymd);
      setDobVerifyError('');
      setFormErrors((prev) => ({ ...prev, playerDOB: '' }));
    }
  };

  const openClaimDobPicker = () => {
    const maxDob = new Date();
    const parsed = parseYmdLocal(playerClaimDob);
    const initial = parsed
      ? clampDate(parsed, MIN_SELF_REGISTER_DOB, maxDob)
      : clampDate(new Date(2012, 5, 15), MIN_SELF_REGISTER_DOB, maxDob);
    setClaimDobPickerDate(initial);
    setClaimDobPickerVisible(true);
  };

  const onClaimDobPickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setClaimDobPickerVisible(false);
    }
    if (event.type === 'dismissed') {
      if (Platform.OS === 'ios') {
        setClaimDobPickerVisible(false);
      }
      return;
    }
    if (date) {
      const maxDob = new Date();
      const clamped = clampDate(date, MIN_SELF_REGISTER_DOB, maxDob);
      setPlayerClaimDob(formatYmd(clamped));
      setPlayerClaimAgeError('');
    }
  };

  if (screenState === 'loading') {
    return (
      <SafeAreaView style={styles.safeAreaRoot} edges={['top', 'left', 'right']}>
        <View style={styles.regHeaderBar}>
          <View style={styles.regHeaderSideSpacer} />
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.regHeaderHit}
            onPress={exitToMain}
            accessibilityLabel="Close and return home"
          >
            <Feather name="x" size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Validating invitation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (screenState === 'invalid' || screenState === 'expired' || screenState === 'error') {
    return (
      <SafeAreaView style={styles.safeAreaRoot} edges={['top', 'left', 'right']}>
        <View style={styles.regHeaderBar}>
          <View style={styles.regHeaderSideSpacer} />
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.regHeaderHit}
            onPress={exitToMain}
            accessibilityLabel="Close and return home"
          >
            <Feather name="x" size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
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
          <Text style={styles.retryCodeLabel}>Team invitation code</Text>
          <TextInput
            style={styles.retryCodeInput}
            value={manualInviteCode}
            onChangeText={(t) => setManualInviteCode(formatTeamInviteInput(t))}
            placeholder="e.g. 691-911-933"
            placeholderTextColor="#6B7280"
            keyboardType="number-pad"
            maxLength={11}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.retryCodeButton}
            onPress={() => validateInvitationCode(manualInviteCode)}
          >
            <Text style={styles.retryCodeButtonText}>Try this code</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
        </View>
      </SafeAreaView>
    );
  }

  // SUCCESS SCREEN
  if (registrationComplete && createdPlayer) {
    const referralCode = createdPlayer.referral_code;
    const nameSlug = referralCode
      ? slugify(`${createdPlayer.first_name}-${createdPlayer.last_name}`)
      : '';
    const supportLink = referralCode
      ? nameSlug
        ? `https://thryvyng.com/support/${nameSlug}/${referralCode}`
        : `https://thryvyng.com/support/${referralCode}`
      : '';
    const teamName = teamInfo?.name || 'the team';
    const shareMessage = `Support ${createdPlayer.first_name} and ${teamName} by shopping through Thryvyng! ${supportLink}`;

    return (
      <SafeAreaView style={styles.safeAreaRoot} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.successContainer}
      >
        <View style={styles.regHeaderBar}>
          <View style={styles.regHeaderSideSpacer} />
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.regHeaderHit}
            onPress={exitToMain}
            accessibilityLabel="Close and return home"
          >
            <Feather name="x" size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
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

          {supportLink ? (
            <View style={styles.referralCard}>
              <Text style={styles.referralLabel}>Share & earn</Text>
              <Text style={styles.referralLinkText} selectable>
                {supportLink}
              </Text>
              <Text style={styles.referralHint}>
                Friends who shop through your link help fund {teamName}.
              </Text>
              <View style={styles.referralActionsRow}>
                <TouchableOpacity
                  style={styles.referralCopyButton}
                  onPress={async () => {
                    try {
                      await Clipboard.setStringAsync(supportLink);
                      Alert.alert('Copied!', 'Link copied to clipboard.');
                    } catch {
                      Alert.alert('Copy', supportLink);
                    }
                  }}
                >
                  <Ionicons name="copy-outline" size={18} color="#93C5FD" />
                  <Text style={styles.referralCopyButtonText}>Copy Link</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.referralShareButton}
                  onPress={async () => {
                    try {
                      await Share.share({ message: shareMessage });
                    } catch (err: any) {
                      if (err?.message !== 'User did not share') {
                        Alert.alert('Share', shareMessage);
                      }
                    }
                  }}
                >
                  <Ionicons name="share-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.referralShareButtonText}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

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
            onPress={exitToMain}
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
      </SafeAreaView>
    );
  }

  // Valid team - show multi-step flow
  return (
    <SafeAreaView style={styles.safeAreaRoot} edges={['top', 'left', 'right']}>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.regHeaderBar}>
        <TouchableOpacity
          style={styles.regHeaderHit}
          onPress={handleBack}
          accessibilityLabel={
            step === 'team-info' ? 'Close and return home' : 'Back'
          }
        >
          <Ionicons name="arrow-back" size={24} color="#9CA3AF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.regHeaderHit}
          onPress={exitToMain}
          accessibilityLabel="Close and return home"
        >
          <Feather name="x" size={24} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      <View style={styles.stepIndicator}>
        <View style={[styles.stepDot, step === 'team-info' && styles.stepDotActive]} />
        <View style={styles.stepLine} />
        <View style={[styles.stepDot, step === 'role-select' && styles.stepDotActive]} />
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

      {step === 'role-select' && (
        <>
          <Text style={styles.stepTitle}>How are you joining?</Text>
          <Text style={styles.stepSubtitle}>Select your role for {teamInfo?.name}</Text>

          <TouchableOpacity
            style={[styles.roleCard, { borderColor: '#22C55E' }]}
            onPress={() => {
              setJoinRole('parent');
              if (teamInfo?.id) {
                fetchTeamPlayers(teamInfo.id);
              }
              setStep('mode-select');
            }}
          >
            <View style={[styles.roleIconContainer, { backgroundColor: '#14532D' }]}>
              <Ionicons name="people-outline" size={28} color="#22C55E" />
            </View>
            <View style={styles.roleTextContainer}>
              <Text style={styles.roleTitle}>I'm a Parent / Guardian</Text>
              <Text style={styles.roleDescription}>Register or link my child to this team</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleCard, { borderColor: '#3B82F6' }]}
            onPress={() => {
              setJoinRole('player');
            }}
          >
            <View style={[styles.roleIconContainer, { backgroundColor: '#1E3A5F' }]}>
              <Ionicons name="football-outline" size={28} color="#3B82F6" />
            </View>
            <View style={styles.roleTextContainer}>
              <Text style={styles.roleTitle}>I'm a Player</Text>
              <Text style={styles.roleDescription}>I'm 11+ and joining with my own phone</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleCard, { borderColor: '#8B5CF6' }]}
            onPress={() => {
              setJoinRole('staff');
            }}
          >
            <View style={[styles.roleIconContainer, { backgroundColor: '#2D2050' }]}>
              <Ionicons name="clipboard-outline" size={28} color="#8B5CF6" />
            </View>
            <View style={styles.roleTextContainer}>
              <Text style={styles.roleTitle}>I'm joining as Staff</Text>
              <Text style={styles.roleDescription}>Coach, manager, or team admin</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>

          {/* Player Claim Flow */}
          {joinRole === 'player' && !playerClaimComplete && (
            <>
              {/* AGE GATE */}
              {playerClaimStep === 'age_gate' && (
                <View style={styles.placeholderCard}>
                  <Ionicons name="football-outline" size={48} color="#3B82F6" />
                  <Text style={styles.placeholderTitle}>Player Registration</Text>
                  <Text style={styles.placeholderText}>Enter your date of birth to get started</Text>

                  <View style={{ width: '100%', marginTop: 8 }}>
                    <View style={styles.dobPickerBlock}>
                      <Text style={styles.dobPickerLabel}>Date of Birth</Text>
                      <TouchableOpacity
                        style={[
                          styles.dobPickerField,
                          playerClaimAgeError ? styles.dobPickerFieldError : null,
                        ]}
                        onPress={openClaimDobPicker}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={
                            playerClaimDob
                              ? styles.dobPickerFieldText
                              : styles.dobPickerPlaceholder
                          }
                        >
                          {playerClaimDob || 'Select date of birth'}
                        </Text>
                      </TouchableOpacity>
                      {playerClaimAgeError ? (
                        <Text style={styles.dobPickerErrorText}>{playerClaimAgeError}</Text>
                      ) : null}
                    </View>
                    {claimDobPickerVisible ? (
                      <DateTimePicker
                        value={claimDobPickerDate}
                        mode="date"
                        textColor={colors.text}
                        themeVariant="dark"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        maximumDate={new Date()}
                        minimumDate={MIN_SELF_REGISTER_DOB}
                        onChange={onClaimDobPickerChange}
                      />
                    ) : null}
                    {Platform.OS === 'ios' && claimDobPickerVisible ? (
                      <TouchableOpacity style={styles.dobDone} onPress={() => setClaimDobPickerVisible(false)}>
                        <Text style={styles.dobDoneText}>Done</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    style={[styles.continueButton, { marginTop: 16, width: '100%' }]}
                    onPress={handlePlayerClaimAgeCheck}
                  >
                    <Text style={styles.continueButtonText}>Continue</Text>
                    <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.placeholderBackButton}
                    onPress={() => {
                      resetPlayerClaimState();
                      setJoinRole(null);
                    }}
                  >
                    <Text style={styles.placeholderBackText}>← Choose a different role</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* FIND YOURSELF ON ROSTER */}
              {playerClaimStep === 'find_self' && (
                <View style={{ width: '100%' }}>
                  <Text style={styles.stepTitle}>Find Yourself</Text>
                  <Text style={styles.stepSubtitle}>Select your name from the team roster</Text>

                  {formErrors.submit && (
                    <View style={styles.submitErrorContainer}>
                      <Ionicons name="alert-circle" size={20} color="#EF4444" />
                      <Text style={styles.submitErrorText}>{formErrors.submit}</Text>
                    </View>
                  )}

                  {claimRosterPlayers.length === 0 ? (
                    <View style={styles.placeholderCard}>
                      <Text style={styles.placeholderText}>
                        No players found on this team. Your parent or guardian needs to register
                        you first. Ask them to use this same team link and select "Parent /
                        Guardian."
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.playerList}>
                      {claimRosterPlayers.map((player) => (
                        <TouchableOpacity
                          key={player.id}
                          style={[styles.playerItem]}
                          onPress={() => {
                            setFormErrors({});
                            handleSelectSelfFromRoster(player);
                          }}
                        >
                          <View style={styles.playerItemContent}>
                            <Text style={styles.playerItemName}>
                              {player.first_name} {player.last_name}
                            </Text>
                            <Text style={styles.playerItemJersey}>
                              Born: {player.birth_year}
                              {player.jersey_number ? ` · #${player.jersey_number}` : ''}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

    {(teamInfo as any)?.player_join_mode === 'open' && !selfCreateMode && (
      <View style={{ width: '100%', marginTop: 16 }}>
        <Text style={styles.stepSubtitle}>Not on the list?</Text>
        <TouchableOpacity
          style={[styles.continueButton, { width: '100%', marginTop: 8 }]}
          onPress={() => {
            setSelfCreateMode(true);
            setSelfCreateError('');
            setSelfCreateDupMatch(null);
          }}
        >
          <Text style={styles.continueButtonText}>Register Yourself</Text>
          <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    )}

    {(teamInfo as any)?.player_join_mode === 'open' && selfCreateMode && (
      <View style={{ width: '100%', marginTop: 16 }}>
        <Text style={styles.stepTitle}>Register Yourself</Text>

        {selfCreateError ? (
          <View style={styles.submitErrorContainer}>
            <Ionicons name="alert-circle" size={20} color="#EF4444" />
            <Text style={styles.submitErrorText}>{selfCreateError}</Text>
          </View>
        ) : null}

        {!selfCreateDupMatch && (
          <View style={styles.newPlayerForm}>
            <FormInput
              label="First Name"
              value={selfCreateFirstName}
              onChangeText={setSelfCreateFirstName}
              placeholder="First name"
              autoCapitalize="words"
              error=""
            />
            <FormInput
              label="Last Name"
              value={selfCreateLastName}
              onChangeText={setSelfCreateLastName}
              placeholder="Last name"
              autoCapitalize="words"
              error=""
            />
            {user ? (
              <>
                <FormInput
                  label="Your Email"
                  value={selfCreateEmail || user.email || ''}
                  onChangeText={() => { /* locked to session email */ }}
                  editable={false}
                  style={{ opacity: 0.7 }}
                />
                <TouchableOpacity
                  onPress={handleSelfCreateSignOut}
                  style={{ marginTop: -8, marginBottom: 16, alignSelf: 'flex-end' }}
                >
                  <Text style={{ color: '#60A5FA', fontSize: 12, fontWeight: '600' }}>
                    Not you? Sign out
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <EmailInput
                label="Your Email"
                value={selfCreateEmail}
                onChangeText={setSelfCreateEmail}
                placeholder="your.email@example.com"
                error=""
              />
            )}
            <TouchableOpacity
              style={[styles.continueButton, selfCreateChecking && styles.continueButtonDisabled, { width: '100%' }]}
              onPress={handleSelfCreateDupCheck}
              disabled={selfCreateChecking}
            >
              <Text style={styles.continueButtonText}>
                {selfCreateChecking ? 'Checking...' : 'Continue'}
              </Text>
              {selfCreateChecking ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.placeholderBackButton}
              onPress={() => setSelfCreateMode(false)}
            >
              <Text style={styles.placeholderBackText}>← Back to roster</Text>
            </TouchableOpacity>
          </View>
        )}

        {selfCreateDupMatch?.match_type === 'email' && (
          <View style={styles.placeholderCard}>
            <Text style={styles.placeholderText}>
              You already have an account with this email. Please sign in to join this team.
            </Text>
            <TouchableOpacity
              style={[styles.continueButton, { width: '100%', marginTop: 16 }]}
              onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })}
            >
              <Text style={styles.continueButtonText}>Sign In</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.placeholderBackButton}
              onPress={() => setSelfCreateDupMatch(null)}
            >
              <Text style={styles.placeholderBackText}>← Use a different email</Text>
            </TouchableOpacity>
          </View>
        )}

        {selfCreateDupMatch?.match_type === 'name_dob' && (
          <View style={styles.placeholderCard}>
            <Text style={styles.placeholderText}>
              We found an existing player with your name and date of birth. If that's you, sign in to link your account. If not, continue and we'll create a new one.
            </Text>
            <TouchableOpacity
              style={[styles.continueButton, { width: '100%', marginTop: 16 }]}
              onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })}
            >
              <Text style={styles.continueButtonText}>Sign In</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.placeholderBackButton}
              onPress={() => setSelfCreateDupMatch({ match_type: 'none' })}
            >
              <Text style={styles.placeholderBackText}>Not me — continue</Text>
            </TouchableOpacity>
          </View>
        )}

        {selfCreateDupMatch?.match_type === 'none' && (
          <View style={styles.newPlayerForm}>
            <FormInput
              label="Jersey Number (optional)"
              value={selfCreateJersey}
              onChangeText={setSelfCreateJersey}
              placeholder="e.g. 10"
              keyboardType="number-pad"
              error=""
            />
            <FormInput
              label="Phone (optional)"
              value={selfCreatePhone}
              onChangeText={setSelfCreatePhone}
              placeholder="Phone number"
              keyboardType="phone-pad"
              error=""
            />
            {!user && (
              <PasswordInput
                label="Create a Password"
                value={selfCreatePassword}
                onChangeText={setSelfCreatePassword}
                showValidation={true}
                error=""
              />
            )}
            {selfCreatePending && selfCreateError ? (
              <TouchableOpacity
                style={[styles.continueButton, selfCreateSubmitting && styles.continueButtonDisabled, { width: '100%' }]}
                onPress={handleSelfCreateRetry}
                disabled={selfCreateSubmitting}
              >
                <Text style={styles.continueButtonText}>
                  {selfCreateSubmitting ? 'Retrying...' : 'Try again'}
                </Text>
                {selfCreateSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="refresh" size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.continueButton, selfCreateSubmitting && styles.continueButtonDisabled, { width: '100%' }]}
                onPress={handleSelfCreateSubmit}
                disabled={selfCreateSubmitting}
              >
                <Text style={styles.continueButtonText}>
                  {selfCreateSubmitting
                    ? (user ? 'Joining...' : 'Creating account...')
                    : (user ? 'Join Team' : 'Create Account & Join Team')}
                </Text>
                {selfCreateSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    )}

                  <TouchableOpacity
                    style={styles.placeholderBackButton}
                    onPress={() => setPlayerClaimStep('age_gate')}
                  >
                    <Text style={styles.placeholderBackText}>← Back to date of birth</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* CREATE YOUR ACCOUNT */}
              {playerClaimStep === 'create_account' && claimablePlayer && (
                <View style={{ width: '100%' }}>
                  <Text style={styles.stepTitle}>Create Your Account</Text>

                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>Claiming Account For</Text>
                    <Text style={styles.summaryText}>
                      {claimablePlayer.first_name} {claimablePlayer.last_name}
                    </Text>
                    <Text style={styles.summarySubtext}>{teamInfo?.name}</Text>
                  </View>

                  <View style={styles.playerModeToggle}>
                    <TouchableOpacity
                      style={[
                        styles.playerModeOption,
                        playerClaimMode === 'new' && styles.playerModeActive,
                      ]}
                      onPress={() => setPlayerClaimMode('new')}
                    >
                      <Text
                        style={[
                          styles.playerModeText,
                          playerClaimMode === 'new' && styles.playerModeTextActive,
                        ]}
                      >
                        New Account
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.playerModeOption,
                        playerClaimMode === 'existing' && styles.playerModeActive,
                      ]}
                      onPress={() => setPlayerClaimMode('existing')}
                    >
                      <Text
                        style={[
                          styles.playerModeText,
                          playerClaimMode === 'existing' && styles.playerModeTextActive,
                        ]}
                      >
                        Existing Account
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {playerClaimMode === 'new' && (
                    <View style={styles.newPlayerForm}>
                      {user ? (
                        <>
                          <FormInput
                            label="Your Email (not your parent's)"
                            value={user.email || ''}
                            onChangeText={() => { /* locked to session email */ }}
                            editable={false}
                            style={{ opacity: 0.7 }}
                          />
                          <TouchableOpacity
                            onPress={handleSelfCreateSignOut}
                            style={{ marginTop: -8, marginBottom: 16, alignSelf: 'flex-end' }}
                          >
                            <Text style={{ color: '#60A5FA', fontSize: 12, fontWeight: '600' }}>
                              Logged in as {user.email} — Not you? Sign out
                            </Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <EmailInput
                          label="Your Email (not your parent's)"
                          value={playerClaimEmail}
                          onChangeText={(text) => {
                            setPlayerClaimEmail(text);
                            setPlayerClaimPasswordError('');
                          }}
                          placeholder="your.email@example.com"
                          error=""
                        />
                      )}
                      {!user && (
                        <>
                          <PasswordInput
                            label="Password"
                            value={playerClaimPassword}
                            onChangeText={(text) => {
                              setPlayerClaimPassword(text);
                              setPlayerClaimPasswordError('');
                            }}
                            showValidation={true}
                            error=""
                          />
                          <PasswordInput
                            label="Confirm Password"
                            value={playerClaimConfirmPassword}
                            onChangeText={(text) => {
                              setPlayerClaimConfirmPassword(text);
                              setPlayerClaimPasswordError('');
                            }}
                            error=""
                          />
                        </>
                      )}
                    </View>
                  )}

                  {playerClaimMode === 'existing' && (
                    <View style={styles.newPlayerForm}>
                      <EmailInput
                        label="Your Email"
                        value={playerClaimEmail}
                        onChangeText={(text) => {
                          setPlayerClaimEmail(text);
                          setPlayerClaimPasswordError('');
                        }}
                        placeholder="your.email@example.com"
                        error=""
                      />
                    </View>
                  )}

                  {playerClaimPasswordError ? (
                    <View style={styles.submitErrorContainer}>
                      <Ionicons name="alert-circle" size={20} color="#EF4444" />
                      <Text style={styles.submitErrorText}>{playerClaimPasswordError}</Text>
                    </View>
                  ) : null}

                  {playerClaimMode && (
                    <TouchableOpacity
                      style={[styles.continueButton, playerClaimSubmitting && styles.continueButtonDisabled]}
                      onPress={handlePlayerClaimSubmit}
                      disabled={playerClaimSubmitting}
                    >
                      <Text style={styles.continueButtonText}>
                        {playerClaimSubmitting
                          ? 'Processing...'
                          : playerClaimMode === 'new'
                            ? 'Create My Account'
                            : 'Continue'}
                      </Text>
                      {playerClaimSubmitting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.placeholderBackButton}
                    onPress={() => {
                      setClaimablePlayer(null);
                      setPlayerClaimStep('find_self');
                    }}
                  >
                    <Text style={styles.placeholderBackText}>← Back to roster</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {/* Player Claim / Self-Register Success */}
          {joinRole === 'player' && playerClaimComplete && claimablePlayer && (
            <View style={styles.placeholderCard}>
              <Ionicons name="checkmark-circle" size={64} color="#22C55E" />
              <Text style={[styles.placeholderTitle, { marginTop: 16 }]}>
                {selfCreateMode ? "You're on the team!" : 'Account Claimed!'}
              </Text>
              <Text style={styles.placeholderText}>
                {selfCreateMode
                  ? `Welcome, ${claimablePlayer.first_name}! You're now part of ${teamInfo?.name}.`
                  : `Welcome, ${claimablePlayer.first_name}! Your player account is now active on ${teamInfo?.name}.`}
              </Text>
              <TouchableOpacity
                style={[styles.continueButton, { width: '100%', marginTop: 16 }]}
                onPress={exitToMain}
              >
                <Text style={styles.continueButtonText}>Go to Dashboard</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}

          {/* Staff Registration Flow */}
          {joinRole === 'staff' && !staffComplete && (
            <>
              {/* ROLE PICKER */}
              {!staffClaimStep && (
                <View style={{ width: '100%' }}>
                  <Text style={styles.stepTitle}>Select Your Role</Text>
                  <Text style={styles.stepSubtitle}>Choose your position on {teamInfo?.name}</Text>

                  <TouchableOpacity
                    style={[styles.roleCard, { borderColor: '#F59E0B' }]}
                    onPress={() => {
                      setSelectedStaffRole('head_coach');
                      setStaffClaimStep('account');
                    }}
                  >
                    <View style={[styles.roleIconContainer, { backgroundColor: '#422006' }]}>
                      <Ionicons name="shield-outline" size={28} color="#F59E0B" />
                    </View>
                    <View style={styles.roleTextContainer}>
                      <Text style={styles.roleTitle}>Head Coach</Text>
                      <Text style={styles.roleDescription}>Primary coach responsible for the team</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.roleCard, { borderColor: '#3B82F6' }]}
                    onPress={() => {
                      setSelectedStaffRole('assistant_coach');
                      setStaffClaimStep('account');
                    }}
                  >
                    <View style={[styles.roleIconContainer, { backgroundColor: '#1E3A5F' }]}>
                      <Ionicons name="people-outline" size={28} color="#3B82F6" />
                    </View>
                    <View style={styles.roleTextContainer}>
                      <Text style={styles.roleTitle}>Assistant Coach</Text>
                      <Text style={styles.roleDescription}>Supporting coach on the team</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.roleCard, { borderColor: '#22C55E' }]}
                    onPress={() => {
                      setSelectedStaffRole('team_manager');
                      setStaffClaimStep('account');
                    }}
                  >
                    <View style={[styles.roleIconContainer, { backgroundColor: '#14532D' }]}>
                      <Ionicons name="clipboard-outline" size={28} color="#22C55E" />
                    </View>
                    <View style={styles.roleTextContainer}>
                      <Text style={styles.roleTitle}>Team Manager</Text>
                      <Text style={styles.roleDescription}>
                        Handles logistics, communication, and operations
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.placeholderBackButton}
                    onPress={() => {
                      resetStaffState();
                      setJoinRole(null);
                    }}
                  >
                    <Text style={styles.placeholderBackText}>← Choose a different role</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ACCOUNT CREATION */}
              {staffClaimStep === 'account' && (
                <View style={{ width: '100%' }}>
                  <Text style={styles.stepTitle}>Create Your Account</Text>

                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>Joining As</Text>
                    <Text style={styles.summaryText}>{getStaffRoleDisplay(selectedStaffRole)}</Text>
                    <Text style={styles.summarySubtext}>{teamInfo?.name}</Text>
                  </View>

                  <View style={styles.playerModeToggle}>
                    <TouchableOpacity
                      style={[
                        styles.playerModeOption,
                        staffMode === 'new' && styles.playerModeActive,
                      ]}
                      onPress={() => setStaffMode('new')}
                    >
                      <Text
                        style={[
                          styles.playerModeText,
                          staffMode === 'new' && styles.playerModeTextActive,
                        ]}
                      >
                        New Account
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.playerModeOption,
                        staffMode === 'existing' && styles.playerModeActive,
                      ]}
                      onPress={() => setStaffMode('existing')}
                    >
                      <Text
                        style={[
                          styles.playerModeText,
                          staffMode === 'existing' && styles.playerModeTextActive,
                        ]}
                      >
                        Existing Account
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {staffMode === 'new' && (
                    <View style={styles.newPlayerForm}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <FormInput
                            label="First Name"
                            value={staffFirstName}
                            onChangeText={(text) => {
                              setStaffFirstName(text);
                              setStaffPasswordError('');
                            }}
                            placeholder="Jane"
                            autoCapitalize="words"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <FormInput
                            label="Last Name"
                            value={staffLastName}
                            onChangeText={(text) => {
                              setStaffLastName(text);
                              setStaffPasswordError('');
                            }}
                            placeholder="Doe"
                            autoCapitalize="words"
                          />
                        </View>
                      </View>
                      {user ? (
                        <>
                          <FormInput
                            label="Email (this will be your login)"
                            value={staffEmail || user.email || ''}
                            onChangeText={() => { /* locked to session email */ }}
                            editable={false}
                            style={{ opacity: 0.7 }}
                          />
                          <TouchableOpacity
                            onPress={handleStaffSignOut}
                            style={{ marginTop: -8, marginBottom: 16, alignSelf: 'flex-end' }}
                          >
                            <Text style={{ color: '#60A5FA', fontSize: 12, fontWeight: '600' }}>
                              Logged in as {user.email} — Not you? Sign out
                            </Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <EmailInput
                          label="Email (this will be your login)"
                          value={staffEmail}
                          onChangeText={(text) => {
                            setStaffEmail(text);
                            setStaffPasswordError('');
                          }}
                          placeholder="coach@email.com"
                          error=""
                        />
                      )}
                      <PhoneInput
                        label="Phone (optional)"
                        value={staffPhone}
                        onChangeText={(text) => {
                          setStaffPhone(text);
                          setStaffPasswordError('');
                        }}
                        error=""
                      />
                      {!user && (
                        <>
                          <PasswordInput
                            label="Password"
                            value={staffPassword}
                            onChangeText={(text) => {
                              setStaffPassword(text);
                              setStaffPasswordError('');
                            }}
                            showValidation={true}
                            error=""
                          />
                          <PasswordInput
                            label="Confirm Password"
                            value={staffConfirmPassword}
                            onChangeText={(text) => {
                              setStaffConfirmPassword(text);
                              setStaffPasswordError('');
                            }}
                            error=""
                          />
                        </>
                      )}
                    </View>
                  )}

                  {staffMode === 'existing' && (
                    <View style={styles.newPlayerForm}>
                      <EmailInput
                        label="Your Email"
                        value={staffEmail}
                        onChangeText={(text) => {
                          setStaffEmail(text);
                          setStaffPasswordError('');
                        }}
                        placeholder="coach@email.com"
                        error=""
                      />
                    </View>
                  )}

                  {staffPasswordError ? (
                    <View style={styles.submitErrorContainer}>
                      <Ionicons name="alert-circle" size={20} color="#EF4444" />
                      <Text style={styles.submitErrorText}>{staffPasswordError}</Text>
                    </View>
                  ) : null}

                  {staffMode && staffJoinPending && staffPasswordError ? (
                    <TouchableOpacity
                      style={[styles.continueButton, staffSubmitting && styles.continueButtonDisabled]}
                      onPress={handleStaffJoinRetry}
                      disabled={staffSubmitting}
                    >
                      <Text style={styles.continueButtonText}>
                        {staffSubmitting ? 'Retrying...' : 'Try again'}
                      </Text>
                      {staffSubmitting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Ionicons name="refresh" size={20} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                  ) : staffMode ? (
                    <TouchableOpacity
                      style={[styles.continueButton, staffSubmitting && styles.continueButtonDisabled]}
                      onPress={
                        staffMode === 'new' ? handleStaffSubmitNew : handleStaffSubmitExisting
                      }
                      disabled={staffSubmitting}
                    >
                      <Text style={styles.continueButtonText}>
                        {staffSubmitting
                          ? 'Processing...'
                          : staffMode === 'new'
                            ? 'Join Team'
                            : 'Continue'}
                      </Text>
                      {staffSubmitting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={styles.placeholderBackButton}
                    onPress={() => {
                      setStaffClaimStep(null);
                      setSelectedStaffRole(null);
                      setStaffMode(null);
                      setStaffPasswordError('');
                    }}
                  >
                    <Text style={styles.placeholderBackText}>← Back to role selection</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {/* Staff Success */}
          {joinRole === 'staff' && staffComplete && staffJoinStatus === 'active' && (
            <View style={styles.placeholderCard}>
              <Ionicons name="checkmark-circle" size={64} color="#22C55E" />
              <Text style={[styles.placeholderTitle, { marginTop: 16 }]}>
                Welcome to {teamInfo?.name}!
              </Text>
              <Text style={styles.placeholderText}>
                You've been added as {getStaffRoleDisplay(selectedStaffRole)}.
              </Text>
              <TouchableOpacity
                style={[styles.continueButton, { width: '100%', marginTop: 16 }]}
                onPress={exitToMain}
              >
                <Text style={styles.continueButtonText}>Go to Dashboard</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}

          {joinRole === 'staff' && staffComplete && staffJoinStatus === 'pending' && (
            <View style={styles.placeholderCard}>
              <Ionicons name="time-outline" size={64} color="#F59E0B" />
              <Text style={[styles.placeholderTitle, { marginTop: 16 }]}>
                Request submitted
              </Text>
              <Text style={styles.placeholderText}>
                Your request to join {teamInfo?.name} as{' '}
                {getStaffRoleDisplay(selectedStaffRole)} is pending approval. The head coach
                or club admin will review it — you'll get an email when it's decided.
              </Text>
              <TouchableOpacity
                style={[
                  styles.continueButton,
                  { width: '100%', marginTop: 16, backgroundColor: '#F59E0B' },
                ]}
                onPress={exitToMain}
              >
                <Text style={styles.continueButtonText}>Done</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
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

          {rosterLoadFailed && (
            <View style={styles.rosterRetryCard}>
              <Ionicons name="alert-circle" size={20} color="#FCA5A5" />
              <View style={styles.rosterRetryBody}>
                <Text style={styles.rosterRetryText}>
                  We couldn't load the team roster. Please try again.
                </Text>
                <TouchableOpacity
                  style={styles.rosterRetryButton}
                  onPress={() => {
                    if (teamInfo?.id) fetchTeamPlayers(teamInfo.id);
                  }}
                >
                  <Ionicons name="refresh" size={16} color="#FFFFFF" />
                  <Text style={styles.rosterRetryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

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
                  <View style={styles.dobPickerBlock}>
                    <Text style={styles.dobPickerLabel}>Date of Birth</Text>
                    <TouchableOpacity
                      style={[
                        styles.dobPickerField,
                        dobVerifyError ? styles.dobPickerFieldError : null,
                      ]}
                      onPress={openPlayerDobPicker}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={
                          playerDOB ? styles.dobPickerFieldText : styles.dobPickerPlaceholder
                        }
                      >
                        {playerDOB || 'Select date of birth'}
                      </Text>
                    </TouchableOpacity>
                    {dobVerifyError ? (
                      <Text style={styles.dobPickerErrorText}>{dobVerifyError}</Text>
                    ) : null}
                  </View>
                  {playerDobPickerVisible ? (
                    <DateTimePicker
                      value={playerDobPickerDate}
                      mode="date"
                      textColor={colors.text}
                      themeVariant="dark"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      maximumDate={new Date()}
                      minimumDate={MIN_PLAYER_DOB}
                      onChange={onPlayerDobPickerChange}
                    />
                  ) : null}
                  {Platform.OS === 'ios' && playerDobPickerVisible ? (
                    <TouchableOpacity style={styles.dobDone} onPress={() => setPlayerDobPickerVisible(false)}>
                      <Text style={styles.dobDoneText}>Done</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
            </View>
          )}

          {!rosterLoadFailed &&
            (playerLinkMode === 'new' || existingPlayers.length === 0) && (
            <View style={styles.newPlayerForm}>
              <FormInput
                label="Player First Name"
                value={playerFirstName}
                onChangeText={setPlayerFirstName}
                placeholder="First name"
                autoCapitalize="words"
                error={formErrors.playerFirstName}
              />
              <FormInput
                label="Player Last Name"
                value={playerLastName}
                onChangeText={setPlayerLastName}
                placeholder="Last name"
                autoCapitalize="words"
                error={formErrors.playerLastName}
              />
              <View style={styles.dobPickerBlock}>
                <Text style={styles.dobPickerLabel}>Date of Birth</Text>
                <TouchableOpacity
                  style={[
                    styles.dobPickerField,
                    formErrors.playerDOB ? styles.dobPickerFieldError : null,
                  ]}
                  onPress={openPlayerDobPicker}
                  activeOpacity={0.8}
                >
                  <Text
                    style={
                      playerDOB ? styles.dobPickerFieldText : styles.dobPickerPlaceholder
                    }
                  >
                    {playerDOB || 'Select date of birth'}
                  </Text>
                </TouchableOpacity>
                {formErrors.playerDOB ? (
                  <Text style={styles.dobPickerErrorText}>{formErrors.playerDOB}</Text>
                ) : null}
              </View>
              {playerDobPickerVisible ? (
                <DateTimePicker
                  value={playerDobPickerDate}
                  mode="date"
                  textColor={colors.text}
                  themeVariant="dark"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  maximumDate={new Date()}
                  minimumDate={MIN_PLAYER_DOB}
                  onChange={onPlayerDobPickerChange}
                />
              ) : null}
              {Platform.OS === 'ios' && playerDobPickerVisible ? (
                <TouchableOpacity style={styles.dobDone} onPress={() => setPlayerDobPickerVisible(false)}>
                  <Text style={styles.dobDoneText}>Done</Text>
                </TouchableOpacity>
              ) : null}
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

            {!user && registrationMode === 'new' && isEmailAvailable === false && isEmailValid(parentEmail) && (
              <TouchableOpacity
                style={styles.signInPromptBox}
                onPress={() => {
                  setRegistrationMode('existing');
                  setShowVerificationModal(true);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="log-in-outline" size={20} color="#8B5CF6" />
                <Text style={styles.signInPromptText}>
                  This email is already registered.{' '}
                  <Text style={styles.signInPromptLink}>Sign in instead →</Text>
                </Text>
              </TouchableOpacity>
            )}

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

          {registrationMode === 'new' && playerLinkMode === 'new' && (
            <View style={styles.formSection}>
              <TouchableOpacity
                style={styles.parent2Toggle}
                onPress={() => setShowParent2((v) => !v)}
                activeOpacity={0.7}
              >
                <View style={styles.parent2ToggleCheckbox}>
                  {showParent2 ? (
                    <Ionicons name="checkbox" size={22} color="#8B5CF6" />
                  ) : (
                    <Ionicons name="square-outline" size={22} color="#94A3B8" />
                  )}
                </View>
                <Text style={styles.parent2ToggleLabel}>
                  Add second parent / guardian (optional)
                </Text>
              </TouchableOpacity>

              {showParent2 && (
                <View style={styles.parent2Fields}>
                  <FormInput
                    label="Second Parent First Name"
                    value={parent2FirstName}
                    onChangeText={setParent2FirstName}
                    placeholder="First name"
                    autoCapitalize="words"
                  />
                  <FormInput
                    label="Second Parent Last Name"
                    value={parent2LastName}
                    onChangeText={setParent2LastName}
                    placeholder="Last name"
                    autoCapitalize="words"
                  />
                  <EmailInput
                    label="Second Parent Email"
                    value={parent2Email}
                    onChangeText={setParent2Email}
                    placeholder="parent2@example.com"
                  />
                  <PhoneInput
                    label="Second Parent Phone"
                    value={parent2Phone}
                    onChangeText={setParent2Phone}
                  />
                  <Text style={styles.parent2HelpText}>
                    We'll send them an invite to join {teamInfo?.name} once your registration is complete.
                  </Text>
                </View>
              )}
            </View>
          )}

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

      {step === 'player-select' && formErrors.submit && (
        <View style={styles.submitErrorContainer}>
          <Ionicons name="alert-circle" size={20} color="#EF4444" />
          <Text style={styles.submitErrorText}>{formErrors.submit}</Text>
        </View>
      )}

      {step !== 'role-select' && (
        <TouchableOpacity
          style={[
            styles.continueButton,
            (step === 'player-select' &&
              playerLinkMode === 'existing' &&
              !selectedPlayerId) &&
              styles.continueButtonDisabled,
            step === 'player-select' && rosterLoadFailed && styles.continueButtonDisabled,
            isSubmitting && styles.continueButtonDisabled,
          ]}
          onPress={handleContinue}
          disabled={
            (step === 'player-select' &&
              playerLinkMode === 'existing' &&
              !selectedPlayerId) ||
            (step === 'player-select' && rosterLoadFailed) ||
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
      )}

      {step !== 'role-select' && (
        <Text style={styles.helpText}>
          Need help? Contact your team manager or coach.
        </Text>
      )}

      <IdentityVerificationModal
        visible={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        onVerified={handleVerificationSuccess}
        teamName={teamInfo?.name}
      />

      <IdentityVerificationModal
        visible={showPlayerClaimVerificationModal}
        onClose={() => setShowPlayerClaimVerificationModal(false)}
        onVerified={handlePlayerClaimVerified}
        teamName={teamInfo?.name}
      />

      <IdentityVerificationModal
        visible={showStaffVerificationModal}
        onClose={() => setShowStaffVerificationModal(false)}
        onVerified={handleStaffVerified}
        teamName={teamInfo?.name}
      />
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeAreaRoot: {
    flex: 1,
    backgroundColor: '#121212',
  },
  regHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  regHeaderHit: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  regHeaderSideSpacer: {
    minWidth: 44,
    minHeight: 44,
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
  retryCodeLabel: {
    alignSelf: 'stretch',
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  retryCodeInput: {
    alignSelf: 'stretch',
    backgroundColor: '#1F2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 12,
  },
  retryCodeButton: {
    alignSelf: 'stretch',
    backgroundColor: '#8B5CF6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  retryCodeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dobPickerBlock: {
    marginBottom: 16,
  },
  dobPickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  dobPickerField: {
    backgroundColor: '#1F2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
    justifyContent: 'center',
  },
  dobPickerFieldError: {
    borderColor: '#EF4444',
  },
  dobPickerFieldText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  dobPickerPlaceholder: {
    fontSize: 16,
    color: '#6B7280',
  },
  dobPickerErrorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
  },
  dobDone: { alignSelf: 'flex-end', marginTop: 8 },
  dobDoneText: { color: '#8b5cf6', fontSize: 16, fontWeight: '600' },
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
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#374151',
  },
  roleIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  roleTextContainer: {
    flex: 1,
  },
  roleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  roleDescription: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  placeholderCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginTop: 12,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 12,
    marginBottom: 8,
  },
  placeholderText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  placeholderBackButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  placeholderBackText: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '500',
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
  parent2Toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  parent2ToggleCheckbox: {
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  parent2ToggleLabel: {
    fontSize: 15,
    color: '#E2E8F0',
    fontWeight: '500',
    flex: 1,
  },
  parent2Fields: {
    marginTop: 12,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#334155',
    gap: 8,
  },
  parent2HelpText: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    fontStyle: 'italic',
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
  signInPromptBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1E1B3A',
    borderWidth: 1,
    borderColor: '#8B5CF6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  signInPromptText: {
    color: '#D1D5DB',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  signInPromptLink: {
    color: '#8B5CF6',
    fontWeight: '600',
  },
  warningText: {
    color: '#FCD34D',
    fontSize: 14,
    flex: 1,
  },
  playerModeToggle: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#374151',
  },
  playerModeOption: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  playerModeActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#A78BFA',
  },
  playerModeText: {
    color: '#9CA3AF',
    fontSize: 15,
    fontWeight: '600',
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
  referralLinkText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 20,
  },
  referralHint: {
    fontSize: 13,
    color: '#93C5FD',
    textAlign: 'center',
    marginBottom: 16,
  },
  referralActionsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  referralCopyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3B82F6',
    backgroundColor: 'transparent',
  },
  referralCopyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#93C5FD',
  },
  referralShareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#3B82F6',
  },
  referralShareButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
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
  rosterRetryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#7F1D1D',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 20,
  },
  rosterRetryBody: {
    flex: 1,
    gap: 10,
  },
  rosterRetryText: {
    color: '#FCA5A5',
    fontSize: 14,
  },
  rosterRetryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 6,
  },
  rosterRetryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default JoinTeamScreen;
