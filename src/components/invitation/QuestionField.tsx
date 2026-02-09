import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ProgramQuestion } from '../../types/invitation';

type QuestionWithDbFields = ProgramQuestion & {
  label?: string;
  field_type?: string;
  placeholder?: string;
  description?: string;
};

interface Props {
  question: QuestionWithDbFields;
  value: any;
  onChange: (value: any) => void;
  error?: string;
}

export default function QuestionField({ question, value, onChange, error }: Props) {
  const fieldType = question.field_type ?? question.question_type;

  const renderField = () => {
    switch (fieldType) {
      case 'short_text':
      case 'text':
        return (
          <TextInput
            style={[styles.textInput, error && styles.inputError]}
            value={value || ''}
            onChangeText={onChange}
            placeholder={question.placeholder || 'Enter your answer'}
            placeholderTextColor="#666"
          />
        );

      case 'long_text':
      case 'textarea':
        return (
          <TextInput
            style={[styles.textArea, error && styles.inputError]}
            value={value || ''}
            onChangeText={onChange}
            placeholder={question.placeholder || 'Enter your answer'}
            placeholderTextColor="#666"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        );

      case 'select':
      case 'radio':
      case 'dropdown':
        return (
          <View style={styles.optionsContainer}>
            {(question.options || []).map((option, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.radioOption,
                  value === option && styles.radioOptionSelected,
                ]}
                onPress={() => onChange(option)}
              >
                <View
                  style={[
                    styles.radioCircle,
                    value === option && styles.radioCircleSelected,
                  ]}
                >
                  {value === option && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.optionText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'checkbox': {
        if (!question.options || question.options.length === 0) {
          const isChecked = value === true || value === 'true';
          return (
            <TouchableOpacity
              style={[
                styles.checkboxOption,
                isChecked && styles.checkboxOptionSelected,
              ]}
              onPress={() => onChange(!isChecked)}
            >
              <View
                style={[
                  styles.checkbox,
                  isChecked && styles.checkboxChecked,
                ]}
              >
                {isChecked && (
                  <Ionicons name="checkmark" size={14} color="#000" />
                )}
              </View>
              <Text style={styles.optionText}>
                {question.description || 'Yes, I agree'}
              </Text>
            </TouchableOpacity>
          );
        }

        const selectedValues = Array.isArray(value) ? value : [];
        return (
          <View style={styles.optionsContainer}>
            {(question.options || []).map((option, index) => {
              const isChecked = selectedValues.includes(option);
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.checkboxOption,
                    isChecked && styles.checkboxOptionSelected,
                  ]}
                  onPress={() => {
                    if (isChecked) {
                      onChange(selectedValues.filter((v: string) => v !== option));
                    } else {
                      onChange([...selectedValues, option]);
                    }
                  }}
                >
                  <View
                    style={[
                      styles.checkbox,
                      isChecked && styles.checkboxChecked,
                    ]}
                  >
                    {isChecked && (
                      <Ionicons name="checkmark" size={14} color="#000" />
                    )}
                  </View>
                  <Text style={styles.optionText}>{option}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      }

      case 'multi_select': {
        const selectedValues = Array.isArray(value) ? value : [];
        return (
          <View style={styles.optionsContainer}>
            {(question.options || []).map((option, index) => {
              const isChecked = selectedValues.includes(option);
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.checkboxOption,
                    isChecked && styles.checkboxOptionSelected,
                  ]}
                  onPress={() => {
                    if (isChecked) {
                      onChange(selectedValues.filter((v: string) => v !== option));
                    } else {
                      onChange([...selectedValues, option]);
                    }
                  }}
                >
                  <View
                    style={[
                      styles.checkbox,
                      isChecked && styles.checkboxChecked,
                    ]}
                  >
                    {isChecked && (
                      <Ionicons name="checkmark" size={14} color="#000" />
                    )}
                  </View>
                  <Text style={styles.optionText}>{option}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      }

      default:
        return (
          <TextInput
            style={[styles.textInput, error && styles.inputError]}
            value={value || ''}
            onChangeText={onChange}
            placeholder={question.placeholder || 'Enter your answer'}
            placeholderTextColor="#666"
          />
        );
    }
  };

  const label = question.label ?? question.question_text;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {question.is_required && <Text style={styles.required}>*</Text>}
      </View>
      {question.description && (
        <Text style={styles.description}>{question.description}</Text>
      )}
      {renderField()}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  required: {
    color: '#ef4444',
    fontSize: 14,
    marginLeft: 4,
  },
  description: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  textArea: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
    minHeight: 100,
  },
  inputError: {
    borderColor: '#ef4444',
  },
  optionsContainer: {
    gap: 8,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  radioOptionSelected: {
    borderColor: '#4ade80',
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radioCircleSelected: {
    borderColor: '#4ade80',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4ade80',
  },
  checkboxOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  checkboxOptionSelected: {
    borderColor: '#4ade80',
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#4ade80',
    borderColor: '#4ade80',
  },
  optionText: {
    color: '#fff',
    fontSize: 14,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
});

