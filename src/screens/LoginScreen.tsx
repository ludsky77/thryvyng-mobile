import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import {
  getCaptchaToken,
  CaptchaTimeoutError,
  CAPTCHA_TIMEOUT_MESSAGE,
} from '../lib/captcha';
import { useAuth } from '../contexts/AuthContext';
import { useRegistration } from '../contexts/RegistrationContext';
import type { RootStackParamList } from '../navigation/linking';

type LoginRouteProps = RouteProp<RootStackParamList, 'Login'>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMEMBER_EMAIL_KEY = 'thryvyng_remember_email';

interface LoginRouteParams {
  mode?: 'signin' | 'signup';
  returnTo?: string;
  returnParams?: Record<string, any>;
}

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<LoginRouteProps>();
  const initialMode = route.params?.mode ?? 'signin';
  const { user } = useAuth();
  const { pendingProgramId, setPendingProgramId } = useRegistration();
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberEmail, setRememberEmail] = useState(false);

  useEffect(() => {
    if (route.params?.mode) {
      setAuthMode(route.params.mode);
    }
  }, [route.params?.mode]);

  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_EMAIL_KEY).then((saved) => {
      if (saved) {
        setEmail(saved);
        setRememberEmail(true);
      }
    });
  }, []);

  async function handleLogin() {
    setError('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError('Please enter email and password');
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    let captchaToken: string | null;
    try {
      captchaToken = await getCaptchaToken();
    } catch (captchaErr) {
      // No token means the sign-in would be rejected server-side anyway.
      setLoading(false);
      if (captchaErr instanceof CaptchaTimeoutError) {
        setError(CAPTCHA_TIMEOUT_MESSAGE);
      }
      return;
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
      options: { captchaToken: captchaToken ?? undefined },
    });

    setLoading(false);

    if (signInError) {
      const signInMsg = (signInError.message || '').toLowerCase();
      if (signInMsg.includes('invalid login credentials')) {
        setError(
          'Incorrect email or password. Please try again or use Forgot Password to reset.'
        );
      } else {
        setError(signInError.message);
      }
      return;
    }

    if (rememberEmail) {
      await AsyncStorage.setItem(REMEMBER_EMAIL_KEY, trimmedEmail);
    } else {
      await AsyncStorage.removeItem(REMEMBER_EMAIL_KEY);
    }

    // Check if there's a pending program registration
    if (pendingProgramId) {
      const returnProgramId = pendingProgramId;
      setPendingProgramId(null);
      navigation.reset({
        index: 0,
        routes: [
          { name: 'ProgramRegistration', params: { programId: returnProgramId } },
        ],
      });
      return;
    }

    const params = route.params as LoginRouteParams | undefined;
    if (params?.returnTo) {
      navigation.navigate(params.returnTo as never, params.returnParams as never);
      return;
    }

    navigation.reset({
      index: 0,
      routes: [{ name: 'Main' }],
    });
  }

  const handleEmailChange = (text: string) => {
    setEmail(text.toLowerCase());
    if (error) setError('');
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (error) setError('');
  };

  const handleSignup = async () => {
    if (!firstName.trim()) {
      setError('Please enter your first name');
      return;
    }
    if (!lastName.trim()) {
      setError('Please enter your last name');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }
    if (!password) {
      setError('Please enter a password');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let captchaToken: string | null;
      try {
        captchaToken = await getCaptchaToken();
      } catch (captchaErr) {
        if (captchaErr instanceof CaptchaTimeoutError) {
          setError(CAPTCHA_TIMEOUT_MESSAGE);
        }
        return;
      }

      const { data: signupData, error: signupError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          captchaToken: captchaToken ?? undefined,
          data: {
            full_name: `${firstName.trim()} ${lastName.trim()}`,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
      });

      if (signupError) {
        const signupMsg = (signupError.message || '').toLowerCase();
        const signupDuplicate =
          signupMsg.includes('already registered') ||
          signupMsg.includes('already been registered') ||
          signupMsg.includes('user already') ||
          signupMsg.includes('email address is already') ||
          signupMsg.includes('email is already') ||
          signupMsg.includes('invalid login credentials') ||
          signupMsg.includes('invalid credentials');
        setError(
          signupDuplicate
            ? 'This email already has an account. Please sign in instead.'
            : signupError.message
        );
        return;
      }

      // Supabase anti-enumeration: signUp "succeeds" for existing emails
      // but returns empty identities array
      if (signupData?.user?.identities?.length === 0) {
        setError('This email already has an account. Please sign in instead.');
        setAuthMode('signin');
        setLoading(false);
        return;
      }

      // Hydrate the session from the signUp response instead of a second
      // password sign-in. If the tokens aren't returned (e.g. email confirmation
      // is required) there is no session to continue with, so hard-stop here.
      const accessToken = signupData?.session?.access_token;
      const refreshToken = signupData?.session?.refresh_token;
      if (!accessToken || !refreshToken) {
        setError('Account created! Please sign in.');
        setAuthMode('signin');
        return;
      }

      const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (setSessionError || !sessionData?.session) {
        if (__DEV__) {
          console.warn('[Login] setSession after signup failed:', setSessionError?.message);
        }
        setError('Account created! Please sign in.');
        setAuthMode('signin');
        return;
      }

      if (pendingProgramId) {
        const returnProgramId = pendingProgramId;
        setPendingProgramId(null);
        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'ProgramRegistration',
              params: { programId: returnProgramId },
            },
          ],
        });
        return;
      }

      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.inner}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.navigate('Welcome')}
        >
          <Ionicons name="arrow-back" size={24} color="#9CA3AF" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>🏆 Thryvyng</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        {user && (
          <View style={styles.alreadyLoggedInCard}>
            <Ionicons name="person-circle" size={48} color="#8B5CF6" />
            <Text style={styles.alreadyLoggedInTitle}>Welcome back!</Text>
            <Text style={styles.alreadyLoggedInEmail}>{user.email}</Text>

            <TouchableOpacity
              style={styles.continueAsButton}
              onPress={() =>
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Main' }],
                })
              }
            >
              <Text style={styles.continueAsButtonText}>
                Continue to Dashboard
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchAccountButton}
              onPress={async () => {
                await supabase.auth.signOut();
              }}
            >
              <Text style={styles.switchAccountText}>
                Sign in with different account
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {!user && (
          <>
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            {authMode === 'signin' ? (
              <>
                <View style={styles.emailFieldWrapper}>
                  <TextInput
                    style={[styles.input, styles.emailInputWithClear]}
                    placeholder="Email"
                    placeholderTextColor="#666"
                    value={email}
                    onChangeText={handleEmailChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoComplete="email"
                  />
                  {email.length > 0 ? (
                    <TouchableOpacity
                      style={styles.emailClearButton}
                      onPress={() => handleEmailChange('')}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel="Clear email"
                    >
                      <Ionicons name="close-circle" size={24} color="#9CA3AF" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Password"
                    placeholderTextColor="#666"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={handlePasswordChange}
                    textContentType="password"
                    autoComplete="password"
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Text style={styles.eyeText}>
                      {showPassword ? '👁️' : '👁️‍🗨️'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.forgotPassword}
                  onPress={() =>
                    Linking.openURL('https://thryvyng.com/forgot-password')
                  }
                >
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.rememberRow}
                  onPress={() => setRememberEmail(!rememberEmail)}
                >
                  <Text style={styles.checkbox}>
                    {rememberEmail ? '☑' : '☐'}
                  </Text>
                  <Text style={styles.rememberText}>Remember my email</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Sign In</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setAuthMode('signup')}
                  style={{ marginTop: 16 }}
                >
                  <Text
                    style={{
                      color: '#9CA3AF',
                      textAlign: 'center',
                    }}
                  >
                    Don't have an account?{' '}
                    <Text style={{ color: '#8B5CF6' }}>Sign Up</Text>
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.inputLabel}>Name</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First name"
                    placeholderTextColor="#6B7280"
                    autoCapitalize="words"
                    textContentType="givenName"
                    autoComplete="name-given"
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last name"
                    placeholderTextColor="#6B7280"
                    autoCapitalize="words"
                    textContentType="familyName"
                    autoComplete="name-family"
                  />
                </View>

                <Text style={styles.inputLabel}>Email</Text>
                <View style={styles.emailFieldWrapper}>
                  <TextInput
                    style={[styles.input, styles.emailInputWithClear]}
                    value={email}
                    onChangeText={handleEmailChange}
                    placeholder="you@example.com"
                    placeholderTextColor="#6B7280"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="emailAddress"
                    autoComplete="email"
                  />
                  {email.length > 0 ? (
                    <TouchableOpacity
                      style={styles.emailClearButton}
                      onPress={() => handleEmailChange('')}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel="Clear email"
                    >
                      <Ionicons name="close-circle" size={24} color="#9CA3AF" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Min 8 characters"
                  placeholderTextColor="#6B7280"
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="password-new"
                />

                <Text style={styles.inputLabel}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm your password"
                  placeholderTextColor="#6B7280"
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="password-new"
                />

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleSignup}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Create Account</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setAuthMode('signin')}
                  style={{ marginTop: 16 }}
                >
                  <Text
                    style={{
                      color: '#9CA3AF',
                      textAlign: 'center',
                    }}
                  >
                    Already have an account?{' '}
                    <Text style={{ color: '#8B5CF6' }}>Sign In</Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 40,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    color: '#D1D5DB',
    marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#3a3a5e',
  },
  emailFieldWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  emailInputWithClear: {
    marginBottom: 0,
    paddingRight: 44,
  },
  emailClearButton: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: -12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#3a3a5e',
  },
  passwordInput: {
    flex: 1,
    padding: 14,
    color: '#fff',
    fontSize: 16,
  },
  eyeIcon: {
    padding: 14,
  },
  eyeText: {
    fontSize: 20,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 20,
  },
  forgotText: {
    color: '#a78bfa',
    fontSize: 14,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkbox: {
    fontSize: 18,
    marginRight: 8,
    color: '#a78bfa',
  },
  rememberText: {
    color: '#888',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  backButtonText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
  alreadyLoggedInCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  alreadyLoggedInTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 12,
  },
  alreadyLoggedInEmail: {
    fontSize: 16,
    color: '#9CA3AF',
    marginTop: 4,
    marginBottom: 24,
  },
  continueAsButton: {
    backgroundColor: '#8B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    gap: 8,
    width: '100%',
    marginBottom: 16,
  },
  continueAsButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  switchAccountButton: {
    paddingVertical: 8,
  },
  switchAccountText: {
    color: '#8B5CF6',
    fontSize: 14,
  },
});