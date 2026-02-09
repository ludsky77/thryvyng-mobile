import React, { useMemo, useState } from 'react';
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
import { useFamilyInvitations } from '../../hooks/useFamilyInvitations';
import InvitationStepIndicator from '../../components/invitation/InvitationStepIndicator';

interface RouteParams {
  token: string;
}

export default function InvitationScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { token } = route.params as RouteParams;

  // Use the WORKING hook for primary invitation
  const { invitation, loading, error } = useInvitation(token);

  // Track if other family members are selected
  const [otherPlayersSelected, setOtherPlayersSelected] = useState<string[]>(
    [],
  );

  // Get family invitations - pass token so it can start immediately
  const parentEmail = invitation?.player?.parent_email;
  const { invitations: familyInvitations, loading: familyLoading } =
    useFamilyInvitations(parentEmail || '', token);

  // Filter out current player from family list
  const otherFamilyMembers = useMemo(() => {
    if (!familyInvitations || !invitation) return [];
    return familyInvitations.filter(
      (inv) => inv.placement.id !== invitation.placement.id,
    );
  }, [familyInvitations, invitation]);

  const selectedPackage = useMemo(() => {
    return invitation?.packages?.[0];
  }, [invitation?.packages]);

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
        enabled:
          invitation?.program_settings?.donations_enabled || false,
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

  const lowestPaymentInfo = useMemo(() => {
    const plans = invitation?.packages?.[0]?.payment_plans || [];
    if (plans.length === 0) return null;

    const planWithMostInstallments = plans.reduce((best: any, plan: any) => {
      if (!best) return plan;
      const bestInstallments = best.num_installments || 1;
      const planInstallments = plan.num_installments || 1;
      return planInstallments > bestInstallments ? plan : best;
    }, null as any);

    if (
      !planWithMostInstallments ||
      !planWithMostInstallments.num_installments ||
      planWithMostInstallments.num_installments <= 1
    ) {
      return null;
    }

    const perPayment =
      planWithMostInstallments.total_amount /
      planWithMostInstallments.num_installments;
    return {
      installments: planWithMostInstallments.num_installments,
      perPayment,
    };
  }, [invitation?.packages]);

  const handleToggleOtherPlayer = (placementId: string) => {
    setOtherPlayersSelected((prev) =>
      prev.includes(placementId)
        ? prev.filter((id) => id !== placementId)
        : [...prev, placementId],
    );
  };

  const handleContinue = () => {
    if (!invitation || !selectedPackage) return;

    // Build selected players array
    const selectedPlayersData = [
      // Primary player (always included)
      {
        placementId: invitation.placement.id,
        playerId: invitation.player.id,
        playerName: `${invitation.player.first_name} ${invitation.player.last_name}`,
        teamId: invitation.team.id,
        teamName: invitation.team.name,
        packageId: selectedPackage.id,
        packageName: selectedPackage.name,
        packagePrice: selectedPackage.price,
      },
      // Other selected family members
      ...otherFamilyMembers
        .filter((inv) => otherPlayersSelected.includes(inv.placement.id))
        .map((inv) => ({
          placementId: inv.placement.id,
          playerId: inv.player.id,
          playerName: `${inv.player.first_name} ${inv.player.last_name}`,
          teamId: inv.team.id,
          teamName: inv.team.name,
          packageId: inv.packages?.[0]?.id || '',
          packageName: inv.packages?.[0]?.name || '',
          packagePrice: inv.packages?.[0]?.price || 0,
        })),
    ];

    const nextScreen =
      (invitation.questions?.length || 0) > 0
        ? 'InvitationQuestions'
        : 'InvitationPayment';

    (navigation as any).navigate(nextScreen, {
      token,
      packageId: selectedPackage.id,
      selectedPlayers: selectedPlayersData,
    });
  };

  // Calculate totals
  const primaryPrice = selectedPackage?.price || 0;
  const otherPlayersTotal = otherFamilyMembers
    .filter((inv) => otherPlayersSelected.includes(inv.placement.id))
    .reduce((sum, inv) => sum + (inv.packages?.[0]?.price || 0), 0);
  const subtotal = primaryPrice + otherPlayersTotal;
  const siblingDiscount = otherPlayersSelected.length > 0 ? 25 : 0;
  const total = subtotal - siblingDiscount;

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ade80" />
          <Text style={styles.loadingText}>Loading invitation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !invitation) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorText}>{error || 'Invitation not found'}</Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>Go Back</Text>
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
          <Text style={styles.headerTitle}>Team Invitation</Text>
          <Text style={styles.headerSub}>{invitation.club?.name}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <InvitationStepIndicator currentStep={1} steps={steps} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Primary Player Card */}
        <View style={styles.playerCard}>
          <View style={styles.playerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {invitation.player?.first_name?.[0]}
                {invitation.player?.last_name?.[0]}
              </Text>
            </View>
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>
                {invitation.player?.first_name}{' '}
                {invitation.player?.last_name}
              </Text>
              <View style={styles.teamBadge}>
                <Ionicons name="shield" size={14} color="#4ade80" />
                <Text style={styles.teamName}>{invitation.team?.name}</Text>
              </View>
            </View>
            <View style={styles.priceCol}>
              <Text style={styles.priceLabel}>Package Price</Text>
              <Text style={styles.priceValue}>
                ${primaryPrice.toFixed(2)}
              </Text>
              {lowestPaymentInfo && (
                <Text style={styles.paymentTeaser}>
                  or ${lowestPaymentInfo.perPayment.toFixed(0)}/mo
                </Text>
              )}
            </View>
          </View>

          <View style={styles.packageRow}>
            <Ionicons name="pricetag" size={14} color="#888" />
            <Text style={styles.packageName}>{selectedPackage?.name}</Text>
          </View>
        </View>

        {/* Other Family Members - Selectable */}
        {otherFamilyMembers.length > 0 && (
          <View style={styles.otherSection}>
            <Text style={styles.sectionTitle}>
              Also Invited - Register Together?
            </Text>

            {otherFamilyMembers.map((inv) => {
              const isSelected = otherPlayersSelected.includes(
                inv.placement.id,
              );
              const pkg = inv.packages?.[0];

              return (
                <TouchableOpacity
                  key={inv.placement.id}
                  style={[
                    styles.otherPlayerCard,
                    isSelected && styles.otherPlayerCardSelected,
                  ]}
                  onPress={() => handleToggleOtherPlayer(inv.placement.id)}
                >
                  <View
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxSelected,
                    ]}
                  >
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color="#000"
                      />
                    )}
                  </View>
                  <View style={styles.otherPlayerInfo}>
                    <Text style={styles.otherPlayerName}>
                      {inv.player.first_name} {inv.player.last_name}
                    </Text>
                    <Text style={styles.otherTeamName}>
                      {inv.team.name}
                    </Text>
                  </View>
                  <Text style={styles.otherPrice}>
                    ${pkg?.price?.toFixed(2) || '0.00'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Order Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Order Summary</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {invitation.player?.first_name}{' '}
              {invitation.player?.last_name}
            </Text>
            <Text style={styles.summaryValue}>
              ${primaryPrice.toFixed(2)}
            </Text>
          </View>

          {otherFamilyMembers
            .filter((inv) => otherPlayersSelected.includes(inv.placement.id))
            .map((inv) => (
              <View key={inv.placement.id} style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {inv.player.first_name} {inv.player.last_name}
                </Text>
                <Text style={styles.summaryValue}>
                  ${inv.packages?.[0]?.price?.toFixed(2) || '0.00'}
                </Text>
              </View>
            ))}

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>${subtotal.toFixed(2)}</Text>
          </View>

          {siblingDiscount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.discountLabel}>
                2+ Players Discount
              </Text>
              <Text style={styles.discountValue}>
                -${siblingDiscount.toFixed(2)}
              </Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>

          <View style={styles.dueTodayCard}>
            <View>
              <Text style={styles.dueTodayLabel}>Today's Payment</Text>
              <Text style={styles.dueTodayNote}>
                {lowestPaymentInfo
                  ? 'Payment plans available in next step'
                  : 'Based on selected plan'}
              </Text>
            </View>
            <Text style={styles.dueTodayAmount}>
              ${total.toFixed(2)}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Button */}
      <View style={styles.bottom}>
        <TouchableOpacity style={styles.continueBtn} onPress={handleContinue}>
          <Text style={styles.continueBtnText}>Accept & Continue</Text>
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
  errorText: { color: '#fff', fontSize: 16, marginTop: 12 },
  backLink: { marginTop: 20 },
  backLinkText: { color: '#4ade80', fontSize: 14 },
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
  playerCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: '#4ade80',
  },
  playerRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  playerInfo: { flex: 1 },
  playerName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  teamBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  teamName: { color: '#4ade80', fontSize: 14 },
  priceCol: { alignItems: 'flex-end' },
  priceLabel: { color: '#888', fontSize: 11 },
  priceValue: { color: '#fff', fontSize: 20, fontWeight: '700' },
  paymentTeaser: {
    color: '#4ade80',
    fontSize: 12,
    marginTop: 2,
  },
  packageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
    gap: 6,
  },
  packageName: { color: '#888', fontSize: 13 },
  otherSection: { marginTop: 20 },
  sectionTitle: { color: '#888', fontSize: 13, marginBottom: 10 },
  otherPlayerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#333',
  },
  otherPlayerCardSelected: { borderColor: '#4ade80' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxSelected: {
    backgroundColor: '#4ade80',
    borderColor: '#4ade80',
  },
  otherPlayerInfo: { flex: 1 },
  otherPlayerName: { color: '#fff', fontSize: 15, fontWeight: '500' },
  otherTeamName: { color: '#4ade80', fontSize: 13 },
  otherPrice: { color: '#fff', fontSize: 16, fontWeight: '600' },
  summaryCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  summaryTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: { color: '#888', fontSize: 14 },
  summaryValue: { color: '#fff', fontSize: 14 },
  divider: { height: 1, backgroundColor: '#333', marginVertical: 10 },
  discountLabel: { color: '#4ade80', fontSize: 14 },
  discountValue: { color: '#4ade80', fontSize: 14, fontWeight: '600' },
  totalLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  totalValue: { color: '#fff', fontSize: 20, fontWeight: '700' },
  dueTodayCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f2419',
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  dueTodayLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  dueTodayNote: { color: '#888', fontSize: 11 },
  dueTodayAmount: { color: '#4ade80', fontSize: 24, fontWeight: '700' },
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
