import React from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface EmailInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  isChecking?: boolean;
  isAvailable?: boolean | null;
}

// Basic email validation
export const isEmailValid = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const EmailInput: React.FC<EmailInputProps> = ({
  value,
  onChangeText,
  placeholder = 'email@example.com',
  label = 'Email',
  error,
  isChecking = false,
  isAvailable = null,
}) => {
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputContainer}>
        <TextInput
          style={[styles.input, error && styles.inputError]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#6B7280"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.statusContainer}>
          {isChecking && (
            <ActivityIndicator size="small" color="#60A5FA" />
          )}
          {!isChecking && isAvailable === true && (
            <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
          )}
          {!isChecking && isAvailable === false && (
            <Ionicons name="close-circle" size={20} color="#EF4444" />
          )}
        </View>
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {!isChecking && isAvailable === false && !error && (
        <Text style={styles.errorText}>This email is already registered</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#FFFFFF',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  statusContainer: {
    position: 'absolute',
    right: 16,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
  },
});

export default EmailInput;
