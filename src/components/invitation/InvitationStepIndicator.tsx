import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Step {
  number: number;
  label: string;
  enabled: boolean;
}

interface Props {
  currentStep: number;
  steps: Step[];
}

export default function InvitationStepIndicator({ currentStep, steps }: Props) {
  const enabledSteps = steps.filter(s => s.enabled);

  return (
    <View style={styles.container}>
      {enabledSteps.map((step, index) => {
        const isCompleted = step.number < currentStep;
        const isCurrent = step.number === currentStep;

        return (
          <React.Fragment key={step.number}>
            <View style={styles.stepItem}>
              <View style={[
                styles.stepCircle,
                isCompleted && styles.stepCompleted,
                isCurrent && styles.stepCurrent,
              ]}>
                {isCompleted ? (
                  <Ionicons name="checkmark" size={10} color="#000" />
                ) : (
                  <Text style={[
                    styles.stepNumber,
                    isCurrent && styles.stepNumberCurrent,
                  ]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text 
                style={[
                  styles.stepLabel,
                  isCurrent && styles.stepLabelCurrent,
                  isCompleted && styles.stepLabelCompleted,
                ]}
                numberOfLines={1}
              >
                {step.label}
              </Text>
            </View>

            {index < enabledSteps.length - 1 && (
              <View style={[
                styles.connector,
                isCompleted && styles.connectorCompleted,
              ]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#0a0a0a',
    height: 50, // FIXED HEIGHT - critical fix
  },
  stepItem: {
    alignItems: 'center',
    width: 42,
  },
  stepCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#444',
    backgroundColor: 'transparent',
  },
  stepCompleted: {
    backgroundColor: '#4ade80',
    borderColor: '#4ade80',
  },
  stepCurrent: {
    backgroundColor: '#4ade80',
    borderColor: '#4ade80',
  },
  stepNumber: {
    color: '#666',
    fontSize: 8,
    fontWeight: '600',
  },
  stepNumberCurrent: {
    color: '#000',
  },
  stepLabel: {
    color: '#555',
    fontSize: 7,
    marginTop: 2,
    textAlign: 'center',
  },
  stepLabelCurrent: {
    color: '#4ade80',
    fontWeight: '600',
  },
  stepLabelCompleted: {
    color: '#888',
  },
  connector: {
    width: 6,
    height: 1,
    backgroundColor: '#333',
    marginBottom: 10,
  },
  connectorCompleted: {
    backgroundColor: '#4ade80',
  },
});

