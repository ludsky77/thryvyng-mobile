import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useInvitation } from '../../hooks/useInvitation';
import InvitationStepIndicator from '../../components/invitation/InvitationStepIndicator';

interface SelectedPlayer {
  placementId: string;
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  packageId: string;
  packageName: string;
  packagePrice: number;
  planId?: string;
  planName?: string;
  dueToday?: number;
}

interface RouteParams {
  token: string;
  packageId?: string;
  planId?: string;
  selectedPlayers?: SelectedPlayer[];
  answers?: Record<string, any>;
  volunteerPositionIds?: string[];
}

export default function InvitationDonateScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const {
    token,
    packageId,
    planId,
    selectedPlayers,
    answers = {},
    volunteerPositionIds = [],
  } = route.params as RouteParams;

  const { invitation, loading } = useInvitation(token);

  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');

  const presets = invitation?.program_settings.donation_presets || [25, 50, 100];
  const minAmount = invitation?.program_settings.min_donation_amount || 5;

  const steps = [
    { number: 1, label: 'Review', enabled: true },
    {
      number: 2,
      label: 'Questions',
      enabled: (invitation?.questions.length || 0) > 0,
    },
    { number: 3, label: 'Payment', enabled: true },
    {
      number: 4,
      label: 'Volunteer',
      enabled: (invitation?.volunteer_positions.length || 0) > 0,
    },
    { number: 5, label: 'Donate', enabled: true },
    {
      number: 6,
      label: 'Aid',
      enabled: invitation?.program_settings.financial_aid_enabled || false,
    },
    { number: 7, label: 'Checkout', enabled: true },
  ];

  const getDonationAmount = (): number | null => {
    if (selectedPreset) return selectedPreset;
    if (customAmount) {
      const amount = parseFloat(customAmount);
      return Number.isNaN(amount) ? null : amount;
    }
    return null;
  };

  const getNextStep = () => {
    if (invitation?.program_settings.financial_aid_enabled) {
      return 'InvitationAid';
    }
    return 'InvitationCheckout';
  };

  const handleSelectPreset = (amount: number) => {
    setSelectedPreset(amount);
    setCustomAmount('');
  };

  const handleCustomAmountChange = (text: string) => {
    setCustomAmount(text);
    setSelectedPreset(null);
  };

  const handleContinue = () => {
    (navigation as any).navigate(getNextStep(), {
      token,
      packageId,
      planId,
      selectedPlayers,
      answers,
      volunteerPositionIds,
      donationAmount: getDonationAmount(),
    });
  };

  const handleSkip = () => {
    (navigation as any).navigate(getNextStep(), {
      token,
      packageId,
      planId,
      selectedPlayers,
      answers,
      volunteerPositionIds,
      donationAmount: null,
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ade80" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!invitation) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Unable to load invitation</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={{ color: '#4ade80', marginTop: 12 }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Support the Program</Text>
          <Text style={styles.headerSub}>{invitation?.club.name}</Text>
        </View>
        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <InvitationStepIndicator currentStep={5} steps={steps} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Heart Icon & Message */}
        <View style={styles.infoBox}>
          <View style={styles.heartIcon}>
            <Ionicons name="heart" size={32} color="#ec4899" />
          </View>
          <Text style={styles.infoTitle}>Support the Program</Text>
          <Text style={styles.infoText}>
            Your donation helps fund equipment, facilities, and player
            scholarships.
          </Text>
        </View>

        {/* Preset Amounts */}
        <View style={styles.presetsRow}>
          {presets.map((amount) => (
            <TouchableOpacity
              key={amount}
              style={[
                styles.presetBtn,
                selectedPreset === amount && styles.presetBtnSelected,
              ]}
              onPress={() => handleSelectPreset(amount)}
            >
              <Text
                style={[
                  styles.presetText,
                  selectedPreset === amount && styles.presetTextSelected,
                ]}
              >
                ${amount}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Custom Amount */}
        <View style={styles.customAmountContainer}>
          <Text style={styles.customLabel}>Custom Amount</Text>
          <View style={styles.customInputRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.customInput}
              value={customAmount}
              onChangeText={handleCustomAmountChange}
              placeholder="0.00"
              placeholderTextColor="#666"
              keyboardType="decimal-pad"
            />
          </View>
          <Text style={styles.minNote}>Minimum ${minAmount}</Text>
        </View>

        {/* Skip Option */}
        <TouchableOpacity style={styles.skipOption} onPress={handleSkip}>
          <Text style={styles.skipOptionText}>No thanks, skip donation</Text>
        </TouchableOpacity>

        {/* Optional Note */}
        <Text style={styles.optionalNote}>
          Donations are optional and greatly appreciated.
        </Text>
      </ScrollView>

      {/* Bottom */}
      <View style={styles.bottom}>
        <TouchableOpacity style={styles.continueBtn} onPress={handleContinue}>
          <Text style={styles.continueBtnText}>
            {getDonationAmount()
              ? `Donate $${getDonationAmount()?.toFixed(2)}`
              : 'Continue'}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#000" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  headerSub: {
    color: '#888',
    fontSize: 12,
  },
  skipBtn: {
    padding: 4,
  },
  skipText: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  infoBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  heartIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(236, 72, 153, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoText: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
  },
  presetsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 10,
  },
  presetBtn: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  presetBtnSelected: {
    borderColor: '#ec4899',
    backgroundColor: 'rgba(236, 72, 153, 0.1)',
  },
  presetText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  presetTextSelected: {
    color: '#ec4899',
  },
  customAmountContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  customLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dollarSign: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginRight: 4,
  },
  customInput: {
    flex: 1,
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    padding: 0,
  },
  minNote: {
    color: '#666',
    fontSize: 11,
    marginTop: 6,
  },
  skipOption: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  skipOptionText: {
    color: '#888',
    fontSize: 14,
  },
  optionalNote: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
  },
  bottom: {
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  continueBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#4ade80',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  continueBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});

