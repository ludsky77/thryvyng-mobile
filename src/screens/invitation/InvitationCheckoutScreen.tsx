import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useInvitation } from '../../hooks/useInvitation';
import InvitationStepIndicator from '../../components/invitation/InvitationStepIndicator';
import { supabase } from '../../lib/supabase';

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
  financialAidRequested?: boolean;
  financialAidReason?: string | null;
}

export default function InvitationCheckoutScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params as RouteParams;
  const {
    token,
    packageId: paramPackageId,
    planId: paramPlanId,
    selectedPlayers: passedPlayers,
    answers = {},
    volunteerPositionIds = [],
    donationAmount = null,
    financialAidRequested = false,
    financialAidReason = null,
  } = params;

  const { invitation, loading } = useInvitation(token);
  const [processing, setProcessing] = useState(false);

  // Build players list from params or single player from invitation
  const players = useMemo((): SelectedPlayer[] => {
    if (passedPlayers && passedPlayers.length > 0) {
      return passedPlayers;
    }
    // Fallback to single player mode (legacy)
    if (invitation && paramPackageId) {
      const pkg = invitation.packages?.find((p) => p.id === paramPackageId);
      const plan = pkg?.payment_plans?.find((p) => p.id === paramPlanId);
      return [
        {
          placementId: invitation.placement.id,
          playerId: invitation.player.id,
          playerName: `${invitation.player.first_name} ${invitation.player.last_name}`,
          teamId: invitation.team.id,
          teamName: invitation.team.name,
          packageId: paramPackageId,
          packageName: pkg?.name || '',
          packagePrice: pkg?.price || 0,
          planId: paramPlanId,
          planName: plan?.name || 'Pay in Full',
          dueToday: plan
            ? plan.initial_payment_amount ||
              plan.total_amount / (plan.num_installments || 1)
            : pkg?.price || 0,
        },
      ];
    }
    return [];
  }, [passedPlayers, invitation, paramPackageId, paramPlanId]);

  const selectedVolunteers = useMemo(() => {
    return (invitation?.volunteer_positions || []).filter((v) =>
      volunteerPositionIds.includes(v.id),
    );
  }, [invitation?.volunteer_positions, volunteerPositionIds]);

  const calculations = useMemo(() => {
    const subtotal = players.reduce((sum, p) => sum + p.packagePrice, 0);
    const dueToday = players.reduce(
      (sum, p) => sum + (p.dueToday || p.packagePrice),
      0,
    );

    const volunteerDiscount = selectedVolunteers.reduce(
      (sum, v) => sum + (v.discount_amount || 0),
      0,
    );

    // Sibling discount for 2+ players
    const siblingDiscount = players.length >= 2 ? 25 : 0;

    const total =
      subtotal -
      volunteerDiscount -
      siblingDiscount +
      (donationAmount || 0);
    const finalDueToday =
      dueToday -
      volunteerDiscount -
      siblingDiscount +
      (donationAmount || 0);

    return {
      subtotal,
      volunteerDiscount,
      siblingDiscount,
      donation: donationAmount || 0,
      total: Math.max(0, total),
      dueToday: Math.max(0, finalDueToday),
    };
  }, [players, selectedVolunteers, donationAmount]);

  const steps = [
    { number: 1, label: 'Review', enabled: true },
    {
      number: 2,
      label: 'Questions',
      enabled: (invitation?.questions?.length || 0) > 0,
    },
    { number: 3, label: 'Payment', enabled: true },
    {
      number: 4,
      label: 'Volunteer',
      enabled: (invitation?.volunteer_positions?.length || 0) > 0,
    },
    {
      number: 5,
      label: 'Donate',
      enabled: invitation?.program_settings?.donations_enabled || false,
    },
    {
      number: 6,
      label: 'Aid',
      enabled: invitation?.program_settings?.financial_aid_enabled || false,
    },
    { number: 7, label: 'Checkout', enabled: true },
  ];

  const handleCheckout = async () => {
    if (!invitation || players.length === 0) {
      Alert.alert('Error', 'Missing required information');
      return;
    }

    setProcessing(true);

    try {
      // Build placements array for all selected players
      const placements = players.map((player) => ({
        placementId: player.placementId,
        packageId: player.packageId,
        playerId: player.playerId,
        paymentPlanId: player.planId || null,
      }));

      const checkoutData = {
        placements,
        programId: invitation.assignment.destination_program_id,
        customAnswers: answers,
        volunteerPositionIds,
        donationAmount: donationAmount || 0,
        financialAidRequested,
        financialAidReason,
        successUrl: 'thryvyng://invitation-success',
        cancelUrl: 'thryvyng://invitation-cancel',
      };

      console.log('Checkout data:', JSON.stringify(checkoutData, null, 2));

      const { data, error } = await supabase.functions.invoke(
        'create-family-checkout',
        { body: checkoutData },
      );

      if (error) {
        console.error('Checkout error:', error);
        Alert.alert(
          'Checkout Error',
          (error as any).message || 'Failed to create checkout session',
        );
        setProcessing(false);
        return;
      }

      if (data?.url) {
        const canOpen = await Linking.canOpenURL(data.url);
        if (canOpen) {
          await Linking.openURL(data.url);
        } else {
          Alert.alert('Error', 'Unable to open payment page');
        }
      } else {
        Alert.alert('Error', 'No checkout URL received');
      }
    } catch (err: any) {
      console.error('Checkout exception:', err);
      Alert.alert('Error', err.message || 'An unexpected error occurred');
    } finally {
      setProcessing(false);
    }
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

  if (!invitation || players.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorText}>Unable to load checkout</Text>
          <TouchableOpacity
            style={styles.goBackBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.goBackText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Checkout</Text>
          <Text style={styles.headerSub}>{invitation?.club?.name || ''}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <InvitationStepIndicator currentStep={7} steps={steps} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Registration Section - Show each player */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Registration</Text>

          {players.map((player, index) => (
            <View
              key={player.playerId}
              style={[styles.card, index > 0 && { marginTop: 10 }]}
            >
              <View style={styles.playerRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {player.playerName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </Text>
                </View>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>{player.playerName}</Text>
                  <Text style={styles.teamName}>{player.teamName}</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Package</Text>
                <Text style={styles.detailValue}>{player.packageName}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Payment Plan</Text>
                <Text style={styles.detailValue}>
                  {player.planName || 'Pay in Full'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Due Today</Text>
                <Text style={styles.detailValueGreen}>
                  $
                  {(player.dueToday || player.packagePrice).toFixed(2)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Volunteer Section */}
        {selectedVolunteers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Volunteer Commitments</Text>
            <View style={styles.card}>
              {selectedVolunteers.map((vol) => (
                <View key={vol.id} style={styles.volunteerRow}>
                  <Ionicons name="hand-left" size={16} color="#4ade80" />
                  <Text style={styles.volunteerName}>{vol.name}</Text>
                  {vol.discount_amount && vol.discount_amount > 0 ? (
                    <Text style={styles.volunteerDiscount}>
                      -${vol.discount_amount}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Financial Aid Banner */}
        {financialAidRequested && (
          <View style={styles.section}>
            <View style={styles.aidBanner}>
              <Ionicons
                name="information-circle"
                size={18}
                color="#f59e0b"
              />
              <Text style={styles.aidText}>
                Financial aid requested. The club will review your request.
              </Text>
            </View>
          </View>
        )}

        {/* Order Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <View style={styles.summaryCard}>
            {players.map((player) => (
              <View key={player.playerId} style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{player.playerName}</Text>
                <Text style={styles.summaryValue}>
                  ${player.packagePrice.toFixed(2)}
                </Text>
              </View>
            ))}

            <View style={styles.totalDivider} />

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>
                ${calculations.subtotal.toFixed(2)}
              </Text>
            </View>

            {calculations.siblingDiscount > 0 && (
              <View style={styles.summaryRow}>
                <View style={styles.discountLabel}>
                  <Ionicons name="people" size={14} color="#4ade80" />
                  <Text style={styles.discountText}>2+ Players Discount</Text>
                </View>
                <Text style={styles.discountValue}>
                  -${calculations.siblingDiscount.toFixed(2)}
                </Text>
              </View>
            )}

            {calculations.volunteerDiscount > 0 && (
              <View style={styles.summaryRow}>
                <View style={styles.discountLabel}>
                  <Ionicons name="hand-left" size={14} color="#4ade80" />
                  <Text style={styles.discountText}>Volunteer Discount</Text>
                </View>
                <Text style={styles.discountValue}>
                  -${calculations.volunteerDiscount.toFixed(2)}
                </Text>
              </View>
            )}

            {calculations.donation > 0 && (
              <View style={styles.summaryRow}>
                <View style={styles.discountLabel}>
                  <Ionicons name="heart" size={14} color="#ec4899" />
                  <Text style={styles.donationText}>Donation</Text>
                </View>
                <Text style={styles.summaryValue}>
                  ${calculations.donation.toFixed(2)}
                </Text>
              </View>
            )}

            <View style={styles.totalDivider} />

            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>
                ${calculations.total.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Due Today Card */}
        <View style={styles.dueTodayCard}>
          <View>
            <Text style={styles.dueTodayLabel}>Due Today</Text>
            <Text style={styles.dueTodayNote}>
              {players.length > 1
                ? `${players.length} players`
                : 'Based on selected plan'}
            </Text>
          </View>
          <Text style={styles.dueTodayAmount}>
            ${calculations.dueToday.toFixed(2)}
          </Text>
        </View>

        <Text style={styles.terms}>
          By completing this registration, you agree to the club's terms and
          conditions.
        </Text>
      </ScrollView>

      {/* Bottom Button */}
      <View style={styles.bottom}>
        <TouchableOpacity
          style={[styles.payBtn, processing && styles.payBtnDisabled]}
          onPress={handleCheckout}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <Ionicons name="lock-closed" size={18} color="#000" />
              <Text style={styles.payBtnText}>
                Pay ${calculations.dueToday.toFixed(2)}
              </Text>
            </>
          )}
        </TouchableOpacity>
        <View style={styles.secureRow}>
          <Ionicons name="shield-checkmark" size={14} color="#888" />
          <Text style={styles.secureText}>Secure payment powered by Stripe</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { color: '#888', marginTop: 12 },
  errorText: { color: '#fff', fontSize: 16, marginTop: 12 },
  goBackBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#333',
    borderRadius: 8,
  },
  goBackText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  headerSub: { color: '#888', fontSize: 12 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 120 },
  section: { marginBottom: 20 },
  sectionTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  card: { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 14 },
  playerRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  playerInfo: { flex: 1 },
  playerName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  teamName: { color: '#4ade80', fontSize: 13 },
  divider: { height: 1, backgroundColor: '#333', marginVertical: 12 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  detailLabel: { color: '#888', fontSize: 13 },
  detailValue: { color: '#fff', fontSize: 13 },
  detailValueGreen: { color: '#4ade80', fontSize: 13, fontWeight: '600' },
  volunteerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  volunteerName: { color: '#fff', fontSize: 14, flex: 1 },
  volunteerDiscount: { color: '#4ade80', fontSize: 14, fontWeight: '600' },
  aidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  aidText: { color: '#f59e0b', fontSize: 13, flex: 1 },
  summaryCard: { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 14 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: { color: '#888', fontSize: 14 },
  summaryValue: { color: '#fff', fontSize: 14 },
  discountLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  discountText: { color: '#4ade80', fontSize: 14 },
  discountValue: { color: '#4ade80', fontSize: 14, fontWeight: '600' },
  donationText: { color: '#ec4899', fontSize: 14 },
  totalDivider: { height: 1, backgroundColor: '#333', marginVertical: 10 },
  totalLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  totalValue: { color: '#fff', fontSize: 20, fontWeight: '700' },
  dueTodayCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f2419',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#4ade80',
    marginBottom: 16,
  },
  dueTodayLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  dueTodayNote: { color: '#888', fontSize: 12 },
  dueTodayAmount: { color: '#4ade80', fontSize: 28, fontWeight: '700' },
  terms: { color: '#666', fontSize: 11, textAlign: 'center' },
  bottom: {
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  payBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#4ade80',
    paddingVertical: 16,
    borderRadius: 10,
    gap: 8,
  },
  payBtnDisabled: { opacity: 0.7 },
  payBtnText: { color: '#000', fontSize: 18, fontWeight: '700' },
  secureRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
  },
  secureText: { color: '#888', fontSize: 12 },
});
