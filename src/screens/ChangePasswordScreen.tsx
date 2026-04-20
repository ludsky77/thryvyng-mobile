import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const MIN_LENGTH = 8;

export default function ChangePasswordScreen({ navigation }: { navigation: any }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [newFocused, setNewFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);
  const [newError, setNewError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const validate = (): boolean => {
    let ok = true;
    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedNew) {
      setNewError('New password is required.');
      ok = false;
    } else if (trimmedNew.length < MIN_LENGTH) {
      setNewError(`Password must be at least ${MIN_LENGTH} characters.`);
      ok = false;
    } else {
      setNewError('');
    }

    if (!trimmedConfirm) {
      setConfirmError('Confirm password is required.');
      ok = false;
    } else if (trimmedConfirm.length < MIN_LENGTH) {
      setConfirmError(`Password must be at least ${MIN_LENGTH} characters.`);
      ok = false;
    } else if (trimmedNew.length >= MIN_LENGTH && trimmedNew !== trimmedConfirm) {
      setConfirmError('Passwords do not match.');
      ok = false;
    } else {
      setConfirmError('');
    }

    return ok;
  };

  const handleSubmit = async () => {
    setSubmitError('');
    setNewError('');
    setConfirmError('');
    if (!validate()) return;

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword.trim() });
      if (error) {
        setSubmitError(error.message || 'Could not update password.');
        return;
      }
      Alert.alert('Password updated', '', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      setSubmitError(e?.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Password</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.label}>New Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, newFocused && styles.inputFocused]}
              value={newPassword}
              onChangeText={(t) => {
                setNewPassword(t);
                if (newError) setNewError('');
                if (submitError) setSubmitError('');
              }}
              onFocus={() => setNewFocused(true)}
              onBlur={() => setNewFocused(false)}
              placeholder="Enter new password"
              placeholderTextColor="#64748b"
              secureTextEntry={!showNew}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowNew((v) => !v)}
              accessibilityLabel={showNew ? 'Hide password' : 'Show password'}
            >
              <Feather name={showNew ? 'eye-off' : 'eye'} size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          {newError ? <Text style={styles.fieldError}>{newError}</Text> : null}

          <Text style={[styles.label, styles.labelSpacing]}>Confirm Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, confirmFocused && styles.inputFocused]}
              value={confirmPassword}
              onChangeText={(t) => {
                setConfirmPassword(t);
                if (confirmError) setConfirmError('');
                if (submitError) setSubmitError('');
              }}
              onFocus={() => setConfirmFocused(true)}
              onBlur={() => setConfirmFocused(false)}
              placeholder="Confirm new password"
              placeholderTextColor="#64748b"
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirm((v) => !v)}
              accessibilityLabel={showConfirm ? 'Hide password' : 'Show password'}
            >
              <Feather name={showConfirm ? 'eye-off' : 'eye'} size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          {confirmError ? <Text style={styles.fieldError}>{confirmError}</Text> : null}

          <TouchableOpacity
            style={[styles.submitButton, saving && styles.submitButtonDisabled]}
            onPress={() => void handleSubmit()}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Update Password</Text>
            )}
          </TouchableOpacity>

          {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0a0a1a',
  },
  headerButton: {
    padding: 4,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 32,
  },
  scroll: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#0a0a1a',
  },
  card: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
  },
  label: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  labelSpacing: {
    marginTop: 16,
  },
  inputRow: {
    position: 'relative',
  },
  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingRight: 48,
    color: '#fff',
    fontSize: 16,
  },
  inputFocused: {
    borderColor: '#8b5cf6',
  },
  eyeButton: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  fieldError: {
    color: '#EF4444',
    fontSize: 13,
    marginTop: 6,
  },
  submitButton: {
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 52,
  },
  submitButtonDisabled: {
    opacity: 0.75,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  submitError: {
    color: '#EF4444',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
});
