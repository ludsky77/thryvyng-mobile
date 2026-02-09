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
  donationAmount?: number | null;
}

export default function InvitationAidScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const {
    token,
    packageId,
    planId,
    selectedPlayers,
    answers = {},
    volunteerPositionIds = [],
    donationAmount = null,
  } = route.params as RouteParams;

  const { invitation, loading } = useInvitation(token);

  const [requestAid, setRequestAid] = useState(false);
  const [reason, setReason] = useState('');

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
    {
      number: 5,
      label: 'Donate',
      enabled: invitation?.program_settings.donations_enabled || false,
    },
    { number: 6, label: 'Aid', enabled: true },
    { number: 7, label: 'Checkout', enabled: true },
  ];

  const handleContinue = () => {
    (navigation as any).navigate('InvitationCheckout', {
      token,
      packageId,
      planId,
      selectedPlayers,
      answers,
      volunteerPositionIds,
      donationAmount,
      financialAidRequested: requestAid,
      financialAidReason: requestAid ? reason : null,
    });
  };

  const handleSkip = () => {
    (navigation as any).navigate('InvitationCheckout', {
      token,
      packageId,
      planId,
      selectedPlayers,
      answers,
      volunteerPositionIds,
      donationAmount,
      financialAidRequested: false,
      financialAidReason: null,
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
          <Text style={styles.headerTitle}>Financial Aid</Text>
          <Text style={styles.headerSub}>{invitation?.club.name}</Text>
        </View>
        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <InvitationStepIndicator currentStep={6} steps={steps} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Info */}
        <View style={styles.infoBox}>
          <View style={styles.iconCircle}>
            <Ionicons name="help-buoy" size={28} color="#4ade80" />
          </View>
          <Text style={styles.infoTitle}>Need Assistance?</Text>
          <Text style={styles.infoText}>
            We believe every player deserves the opportunity to play. Financial
            aid is available for families who need assistance.
          </Text>
        </View>

        {/* Request Option */}
        <TouchableOpacity
          style={[styles.optionCard, requestAid && styles.optionCardSelected]}
          onPress={() => setRequestAid(true)}
        >
          <View style={[styles.radio, requestAid && styles.radioSelected]}>
            {requestAid && <View style={styles.radioInner} />}
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>
              Yes, I'd like to request financial aid
            </Text>
            <Text style={styles.optionDesc}>
              Your request will be reviewed by the club administrator
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.optionCard, !requestAid && styles.optionCardSelected]}
          onPress={() => setRequestAid(false)}
        >
          <View style={[styles.radio, !requestAid && styles.radioSelected]}>
            {!requestAid && <View style={styles.radioInner} />}
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>
              No, I don't need assistance
            </Text>
            <Text style={styles.optionDesc}>
              Continue to checkout with full payment
            </Text>
          </View>
        </TouchableOpacity>

        {/* Reason Field (if requesting) */}
        {requestAid && (
          <View style={styles.reasonContainer}>
            <Text style={styles.reasonLabel}>
              Please briefly describe your situation (optional)
            </Text>
            <TextInput
              style={styles.reasonInput}
              value={reason}
              onChangeText={setReason}
              placeholder="This helps the club understand your needs..."
              placeholderTextColor="#666"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Text style={styles.privacyNote}>
              <Ionicons name="lock-closed" size={12} color="#888" /> Your
              information is kept confidential
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom */}
      <View style={styles.bottom}>
        <TouchableOpacity style={styles.continueBtn} onPress={handleContinue}>
          <Text style={styles.continueBtnText}>Continue to Checkout</Text>
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
    marginBottom: 20,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
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
    lineHeight: 18,
  },
  optionCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  optionCardSelected: {
    borderColor: '#4ade80',
    backgroundColor: 'rgba(74, 222, 128, 0.05)',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  radioSelected: {
    borderColor: '#4ade80',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4ade80',
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  optionDesc: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  reasonContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    marginTop: 10,
  },
  reasonLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
  },
  reasonInput: {
    backgroundColor: '#0f0f0f',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#333',
  },
  privacyNote: {
    color: '#888',
    fontSize: 11,
    marginTop: 8,
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

