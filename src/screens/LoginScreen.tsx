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
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMEMBER_EMAIL_KEY = 'thryvyng_remember_email';

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberEmail, setRememberEmail] = useState(false);

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
    // #region agent log
    const _log1 = { location: 'LoginScreen.tsx:handleLogin:beforeSignIn', message: 'Before signInWithPassword', data: { emailLen: trimmedEmail.length, passwordLen: password.length }, hypothesisId: 'H1' };
    console.log('[DEBUG]', JSON.stringify(_log1));
    fetch('http://127.0.0.1:7242/ingest/d8dadf68-0309-483d-b3ac-248851d8ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({..._log1,timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    // #region agent log
    const _log2 = { location: 'LoginScreen.tsx:handleLogin:afterSignIn', message: 'After signInWithPassword', data: { hasError: !!signInError, errorMessage: signInError?.message, hasSession: !!signInData?.session, hasUser: !!signInData?.user?.id }, hypothesisId: 'H1' };
    console.log('[DEBUG]', JSON.stringify(_log2));
    fetch('http://127.0.0.1:7242/ingest/d8dadf68-0309-483d-b3ac-248851d8ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({..._log2,timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    // #region agent log
    const _log3 = { location: 'LoginScreen.tsx:handleLogin:successPath', message: 'Login success path, no error', data: { userId: signInData?.user?.id }, hypothesisId: 'H4' };
    console.log('[DEBUG]', JSON.stringify(_log3));
    fetch('http://127.0.0.1:7242/ingest/d8dadf68-0309-483d-b3ac-248851d8ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({..._log3,timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (rememberEmail) {
      await AsyncStorage.setItem(REMEMBER_EMAIL_KEY, trimmedEmail);
    } else {
      await AsyncStorage.removeItem(REMEMBER_EMAIL_KEY);
    }
  }

  const handleEmailChange = (text: string) => {
    setEmail(text.toLowerCase());
    if (error) setError('');
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (error) setError('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>🏆 Thryvyng</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#666"
          value={email}
          onChangeText={handleEmailChange}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />

        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            placeholderTextColor="#666"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={handlePasswordChange}
          />
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Text style={styles.eyeText}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.forgotPassword}
          onPress={() => Linking.openURL('https://thryvyng.com/forgot-password')}
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

        {__DEV__ && (
          <View style={{ marginTop: 20, borderTopWidth: 1, borderTopColor: '#374151', paddingTop: 20 }}>
            <Text style={{ color: '#6B7280', fontSize: 12, textAlign: 'center', marginBottom: 10 }}>
              🧪 DEBUG: Test Registration Flows
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: '#374151', padding: 12, borderRadius: 8, marginBottom: 8 }}
              onPress={() => navigation.navigate('JoinTeam', { code: 'UPS-RV2RLR' })}
            >
              <Text style={{ color: '#9CA3AF', textAlign: 'center' }}>Test Join Team</Text>
            </TouchableOpacity>
          </View>
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
});