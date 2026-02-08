import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SmartRegistrationToggleProps {
  mode: 'new' | 'existing';
  onModeChange: (mode: 'new' | 'existing') => void;
  disabled?: boolean;
}

export const SmartRegistrationToggle: React.FC<SmartRegistrationToggleProps> = ({
  mode,
  onModeChange,
  disabled = false,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Do you have a Thryvyng account?</Text>

      <TouchableOpacity
        style={[
          styles.option,
          mode === 'new' && styles.optionSelected,
          disabled && styles.optionDisabled,
        ]}
        onPress={() => !disabled && onModeChange('new')}
        activeOpacity={disabled ? 1 : 0.7}
      >
        <View style={styles.optionContent}>
          <Ionicons
            name="person-add"
            size={24}
            color={mode === 'new' ? '#3B82F6' : '#6B7280'}
          />
          <View style={styles.optionText}>
            <Text style={[styles.optionTitle, mode === 'new' && styles.optionTitleSelected]}>
              I'm new to Thryvyng
            </Text>
            <Text style={styles.optionSubtitle}>Create a new account</Text>
          </View>
        </View>
        <View style={[styles.radio, mode === 'new' && styles.radioSelected]}>
          {mode === 'new' && <View style={styles.radioInner} />}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.option,
          mode === 'existing' && styles.optionSelected,
          disabled && styles.optionDisabled,
        ]}
        onPress={() => !disabled && onModeChange('existing')}
        activeOpacity={disabled ? 1 : 0.7}
      >
        <View style={styles.optionContent}>
          <Ionicons
            name="log-in"
            size={24}
            color={mode === 'existing' ? '#3B82F6' : '#6B7280'}
          />
          <View style={styles.optionText}>
            <Text style={[styles.optionTitle, mode === 'existing' && styles.optionTitleSelected]}>
              I already have an account
            </Text>
            <Text style={styles.optionSubtitle}>Sign in to continue</Text>
          </View>
        </View>
        <View style={[styles.radio, mode === 'existing' && styles.radioSelected]}>
          {mode === 'existing' && <View style={styles.radioInner} />}
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 16,
    textAlign: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#374151',
    padding: 16,
    marginBottom: 12,
  },
  optionSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#1E3A5F',
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionText: {
    marginLeft: 12,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D1D5DB',
  },
  optionTitleSelected: {
    color: '#FFFFFF',
  },
  optionSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#3B82F6',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
  },
});

export default SmartRegistrationToggle;
