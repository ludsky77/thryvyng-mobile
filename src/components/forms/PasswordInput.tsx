import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PasswordInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  showValidation?: boolean;
  error?: string;
}

// Password validation rules (must match web app)
const PASSWORD_RULES = {
  minLength: 8,
  hasUppercase: /[A-Z]/,
  hasLowercase: /[a-z]/,
  hasNumber: /[0-9]/,
  hasSpecial: /[!@#$%^&*(),.?":{}|<>]/,
};

export const validatePassword = (password: string) => {
  return {
    minLength: password.length >= PASSWORD_RULES.minLength,
    hasUppercase: PASSWORD_RULES.hasUppercase.test(password),
    hasLowercase: PASSWORD_RULES.hasLowercase.test(password),
    hasNumber: PASSWORD_RULES.hasNumber.test(password),
    hasSpecial: PASSWORD_RULES.hasSpecial.test(password),
  };
};

export const isPasswordValid = (password: string): boolean => {
  const validation = validatePassword(password);
  return Object.values(validation).every(Boolean);
};

export const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChangeText,
  placeholder = 'Enter password',
  label = 'Password',
  showValidation = false,
  error,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const validation = validatePassword(value);

  const ValidationItem = ({ met, text }: { met: boolean; text: string }) => (
    <View style={styles.validationItem}>
      <Ionicons
        name={met ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={met ? '#22C55E' : '#6B7280'}
      />
      <Text style={[styles.validationText, met && styles.validationMet]}>
        {text}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#6B7280"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowPassword(!showPassword)}
        >
          <Ionicons
            name={showPassword ? 'eye-off' : 'eye'}
            size={22}
            color="#9CA3AF"
          />
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {showValidation && value.length > 0 && (
        <View style={styles.validationContainer}>
          <ValidationItem met={validation.minLength} text="At least 8 characters" />
          <ValidationItem met={validation.hasUppercase} text="One uppercase letter" />
          <ValidationItem met={validation.hasLowercase} text="One lowercase letter" />
          <ValidationItem met={validation.hasNumber} text="One number" />
          <ValidationItem met={validation.hasSpecial} text="One special character" />
        </View>
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
    backgroundColor: '#1F2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#FFFFFF',
  },
  eyeButton: {
    paddingHorizontal: 16,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
  },
  validationContainer: {
    marginTop: 12,
    gap: 6,
  },
  validationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  validationText: {
    fontSize: 13,
    color: '#6B7280',
  },
  validationMet: {
    color: '#22C55E',
  },
});

export default PasswordInput;
