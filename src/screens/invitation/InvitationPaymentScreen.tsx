import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
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
}

interface RouteParams {
  token: string;
  packageId: string;
  selectedPlayers?: SelectedPlayer[];
  answers?: Record<string, any>;
}

interface PaymentPlan {
  id: string;
  name: string;
  total_amount: number;
  num_installments: number;
  initial_payment_amount: number | null;
  is_default: boolean;
}

export default function InvitationPaymentScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const {
    token,
    packageId,
    selectedPlayers: passedPlayers,
    answers = {},
  } = route.params as RouteParams;

  const { invitation, loading: invLoading } = useInvitation(token);

  // Build players list from route params or fallback to single player
  const [players, setPlayers] = useState<SelectedPlayer[]>([]);
  const [paymentPlans, setPaymentPlans] = useState<
    Record<string, PaymentPlan[]>
  >({});
  const [selectedPlans, setSelectedPlans] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Initialize players from route params or invitation
  useEffect(() => {
    if (passedPlayers && passedPlayers.length > 0) {
      setPlayers(passedPlayers);
    } else if (invitation) {
      const pkg = invitation.packages?.[0];
      setPlayers([
        {
          placementId: invitation.placement.id,
          playerId: invitation.player.id,
          playerName: `${invitation.player.first_name} ${invitation.player.last_name}`,
          teamId: invitation.team.id,
          teamName: invitation.team.name,
          packageId: pkg?.id || packageId,
          packageName: pkg?.name || '',
          packagePrice: pkg?.price || 0,
        },
      ]);
    }
  }, [passedPlayers, invitation, packageId]);

  // Fetch payment plans for each player's package
  useEffect(() => {
    const fetchPlans = async () => {
      if (players.length === 0) return;

      setLoading(true);
      const plans: Record<string, PaymentPlan[]> = {};
      const defaults: Record<string, string> = {};

      for (const player of players) {
        if (player.packageId) {
          const { data } = await supabase
            .from('payment_plan_options')
            .select('*')
            .eq('package_id', player.packageId)
            .eq('is_active', true)
            .order('sort_order');

          if (data && data.length > 0) {
            plans[player.playerId] = data;
            const defaultPlan = data.find((p) => p.is_default) || data[0];
            defaults[player.playerId] = defaultPlan.id;
          }
        }
      }

      setPaymentPlans(plans);
      setSelectedPlans(defaults);
      setLoading(false);
    };

    fetchPlans();
  }, [players]);

  const steps = useMemo(
    () => [
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
        enabled:
          invitation?.program_settings?.financial_aid_enabled || false,
      },
      { number: 7, label: 'Checkout', enabled: true },
    ],
    [invitation],
  );

  const calculateDueToday = (plan: PaymentPlan): number => {
    if (!plan.num_installments || plan.num_installments <= 1) {
      return plan.total_amount;
    }
    if (plan.initial_payment_amount) {
      return plan.initial_payment_amount;
    }
    return plan.total_amount / plan.num_installments;
  };

  const totalDueToday = useMemo(() => {
    let total = 0;
    players.forEach((player) => {
      const planId = selectedPlans[player.playerId];
      const plans = paymentPlans[player.playerId] || [];
      const plan = plans.find((p) => p.id === planId);
      if (plan) {
        total += calculateDueToday(plan);
      } else {
        total += player.packagePrice;
      }
    });
    // Apply sibling discount if 2+ players
    const siblingDiscount = players.length >= 2 ? 25 : 0;
    return Math.max(0, total - siblingDiscount);
  }, [players, selectedPlans, paymentPlans]);

  const handleSelectPlan = (playerId: string, planId: string) => {
    setSelectedPlans((prev) => ({ ...prev, [playerId]: planId }));
  };

  const handleContinue = () => {
    // Build updated players with plan info
    const updatedPlayers = players.map((player) => {
      const planId = selectedPlans[player.playerId];
      const plans = paymentPlans[player.playerId] || [];
      const plan = plans.find((p) => p.id === planId);
      return {
        ...player,
        planId: planId || null,
        planName: plan?.name || 'Pay in Full',
        dueToday: plan ? calculateDueToday(plan) : player.packagePrice,
      };
    });

    // Navigate to next step
    const nextScreen =
      (invitation?.volunteer_positions?.length || 0) > 0
        ? 'InvitationVolunteer'
        : invitation?.program_settings?.donations_enabled
          ? 'InvitationDonate'
          : invitation?.program_settings?.financial_aid_enabled
            ? 'InvitationAid'
            : 'InvitationCheckout';

    (navigation as any).navigate(nextScreen, {
      token,
      packageId,
      selectedPlayers: updatedPlayers,
      answers,
    });
  };

  if (loading || invLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ade80" />
          <Text style={styles.loadingText}>Loading payment options...</Text>
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
          <Text style={styles.headerTitle}>Payment Plan</Text>
          <Text style={styles.headerSub}>{invitation?.club?.name}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <InvitationStepIndicator currentStep={3} steps={steps} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {players.map((player) => {
          const plans = paymentPlans[player.playerId] || [];
          const selectedPlanId = selectedPlans[player.playerId];

          return (
            <View key={player.playerId} style={styles.playerSection}>
              {/* Player Header */}
              <View style={styles.playerHeader}>
                <View>
                  <Text style={styles.playerName}>{player.playerName}</Text>
                  <Text style={styles.teamName}>{player.teamName}</Text>
                </View>
                <View style={styles.priceCol}>
                  <Text style={styles.priceLabel}>Package</Text>
                  <Text style={styles.priceValue}>
                    ${player.packagePrice.toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* Payment Plans */}
              {plans.length > 0 ? (
                plans.map((plan) => {
                  const isSelected = selectedPlanId === plan.id;
                  const dueToday = calculateDueToday(plan);
                  const isPayInFull =
                    !plan.num_installments || plan.num_installments <= 1;

                  return (
                    <TouchableOpacity
                      key={plan.id}
                      style={[
                        styles.planCard,
                        isSelected && styles.planCardSelected,
                      ]}
                      onPress={() =>
                        handleSelectPlan(player.playerId, plan.id)
                      }
                    >
                      <View style={styles.planRow}>
                        <View
                          style={[
                            styles.radio,
                            isSelected && styles.radioSelected,
                          ]}
                        >
                          {isSelected && <View style={styles.radioDot} />}
                        </View>
                        <View style={styles.planInfo}>
                          <View style={styles.planNameRow}>
                            <Text style={styles.planName}>{plan.name}</Text>
                            {isPayInFull && (
                              <View style={styles.bestValueBadge}>
                                <Ionicons
                                  name="checkmark-circle"
                                  size={12}
                                  color="#000"
                                />
                                <Text style={styles.bestValueText}>
                                  Best Value
                                </Text>
                              </View>
                            )}
                          </View>
                          {!isPayInFull && plan.num_installments && (
                            <Text style={styles.planDetails}>
                              {plan.num_installments} × $
                              {(
                                plan.total_amount / plan.num_installments
                              ).toFixed(2)}
                            </Text>
                          )}
                        </View>
                        <View style={styles.todayCol}>
                          <Text style={styles.todayLabel}>Today:</Text>
                          <Text
                            style={[
                              styles.todayAmount,
                              isSelected && styles.todayAmountSelected,
                            ]}
                          >
                            ${dueToday.toFixed(2)}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.noPlanCard}>
                  <Text style={styles.noPlanText}>
                    Pay in Full: ${player.packagePrice.toFixed(2)}
                  </Text>
                </View>
              )}
            </View>
          );
        })}

        {/* Total Due Today */}
        <View style={styles.totalCard}>
          <View>
            <Text style={styles.totalLabel}>Due Today</Text>
            {players.length >= 2 && (
              <Text style={styles.discountNote}>
                Includes $25 multi-player discount
              </Text>
            )}
          </View>
          <Text style={styles.totalAmount}>
            ${totalDueToday.toFixed(2)}
          </Text>
        </View>
      </ScrollView>

      <View style={styles.bottom}>
        <TouchableOpacity style={styles.continueBtn} onPress={handleContinue}>
          <Text style={styles.continueBtnText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color="#000" />
        </TouchableOpacity>
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
  scrollContent: { padding: 16, paddingBottom: 100 },
  playerSection: { marginBottom: 24 },
  playerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  playerName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  teamName: { color: '#4ade80', fontSize: 13, marginTop: 2 },
  priceCol: { alignItems: 'flex-end' },
  priceLabel: { color: '#888', fontSize: 11 },
  priceValue: { color: '#fff', fontSize: 18, fontWeight: '700' },
  planCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#333',
  },
  planCardSelected: { borderColor: '#4ade80' },
  planRow: { flexDirection: 'row', alignItems: 'center' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radioSelected: { borderColor: '#4ade80' },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4ade80',
  },
  planInfo: { flex: 1 },
  planNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  planDetails: { color: '#888', fontSize: 13, marginTop: 2 },
  bestValueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4ade80',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  bestValueText: { color: '#000', fontSize: 10, fontWeight: '600' },
  todayCol: { alignItems: 'flex-end' },
  todayLabel: { color: '#888', fontSize: 11 },
  todayAmount: { color: '#fff', fontSize: 16, fontWeight: '600' },
  todayAmountSelected: { color: '#4ade80' },
  noPlanCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 2,
    borderColor: '#4ade80',
  },
  noPlanText: { color: '#fff', fontSize: 15 },
  totalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f2419',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  totalLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  discountNote: { color: '#4ade80', fontSize: 11, marginTop: 2 },
  totalAmount: { color: '#4ade80', fontSize: 28, fontWeight: '700' },
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
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  continueBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
