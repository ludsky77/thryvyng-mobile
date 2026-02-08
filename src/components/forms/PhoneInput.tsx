import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';

interface PhoneInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
}

// Format phone: (123) 456-7890
export const formatPhone = (value: string): string => {
  const numbers = value.replace(/\D/g, '').slice(0, 10);
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 6) return `(${numbers.slice(0, 3)}) ${numbers.slice(3)}`;
  return `(${numbers.slice(0, 3)}) ${numbers.slice(3, 6)}-${numbers.slice(6)}`;
};

// Validate: exactly 10 digits
export const isPhoneValid = (phone: string): boolean => {
  const numbers = phone.replace(/\D/g, '');
  return numbers.length === 10;
};

// Get raw 10 digits for database
export const getRawPhone = (phone: string): string => {
  return phone.replace(/\D/g, '');
};

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChangeText,
  placeholder = '(555) 123-4567',
  label = 'Phone Number',
  error,
}) => {
  const handleChange = (text: string) => {
    onChangeText(formatPhone(text));
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[styles.input, error && styles.inputError]}
        value={value}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor="#6B7280"
        keyboardType="phone-pad"
        maxLength={14}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
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
  input: {
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
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
  },
});

export default PhoneInput;
