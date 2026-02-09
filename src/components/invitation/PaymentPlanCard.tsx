import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PaymentPlanOption } from '../../types/invitation';

interface Props {
  plan: PaymentPlanOption;
  isSelected: boolean;
  onSelect: () => void;
  packagePrice: number;
}

export default function PaymentPlanCard({
  plan,
  isSelected,
  onSelect,
  packagePrice,
}: Props) {
  const isPayInFull = plan.num_installments === 0 || plan.num_installments === 1;
  const initialPayment =
    plan.initial_payment_amount || (isPayInFull ? plan.total_amount : 0);

  const remainingAmount = plan.total_amount - (plan.initial_payment_amount || 0);
  const perInstallmentAmount =
    plan.num_installments > 1
      ? remainingAmount /
        (plan.num_installments - (plan.initial_payment_amount ? 1 : 0))
      : 0;

  const hasDiscount = isPayInFull && plan.total_amount < packagePrice;
  const discountAmount = hasDiscount ? packagePrice - plan.total_amount : 0;

  return (
    <TouchableOpacity
      style={[styles.card, isSelected && styles.cardSelected]}
      onPress={onSelect}
      activeOpacity={0.7}
    >
      <View style={[styles.radio, isSelected && styles.radioSelected]}>
        {isSelected && <View style={styles.radioInner} />}
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.planName}>{plan.name}</Text>
          {isPayInFull && (
            <View style={styles.badge}>
              <Ionicons name="checkmark-circle" size={12} color="#000" />
              <Text style={styles.badgeText}>Best Value</Text>
            </View>
          )}
        </View>

        <View style={styles.details}>
          {isPayInFull ? (
            <>
              <Text style={styles.totalAmount}>
                ${plan.total_amount.toFixed(2)}
              </Text>
              <Text style={styles.todayLabel}>due today</Text>
              {hasDiscount && (
                <View style={styles.discountRow}>
                  <Ionicons name="pricetag" size={14} color="#4ade80" />
                  <Text style={styles.discountText}>
                    Save ${discountAmount.toFixed(2)} with Pay-in-Full
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              <View style={styles.installmentInfo}>
                <Text style={styles.installmentCount}>
                  {plan.num_installments} payments
                </Text>
                {plan.initial_payment_amount &&
                plan.initial_payment_amount > 0 ? (
                  <Text style={styles.installmentDetail}>
                    ${plan.initial_payment_amount.toFixed(2)} down +{' '}
                    {plan.num_installments - 1} × $
                    {perInstallmentAmount.toFixed(2)}
                  </Text>
                ) : (
                  <Text style={styles.installmentDetail}>
                    {plan.num_installments} × $
                    {(
                      plan.total_amount / plan.num_installments
                    ).toFixed(2)}
                  </Text>
                )}
              </View>
              <View style={styles.todayRow}>
                <Text style={styles.todayLabel}>Today:</Text>
                <Text style={styles.todayAmount}>
                  $
                  {(
                    plan.initial_payment_amount ||
                    plan.total_amount / plan.num_installments
                  ).toFixed(2)}
                </Text>
              </View>
            </>
          )}
        </View>

        {!isPayInFull && plan.num_installments > 1 && (
          <View style={styles.schedulePreview}>
            <Ionicons name="calendar-outline" size={14} color="#888" />
            <Text style={styles.scheduleText}>Payments due monthly</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#333',
  },
  cardSelected: {
    borderColor: '#4ade80',
    backgroundColor: 'rgba(74, 222, 128, 0.05)',
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4ade80',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  planName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4ade80',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
  },
  details: {
    gap: 4,
  },
  totalAmount: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  todayLabel: {
    color: '#888',
    fontSize: 14,
  },
  discountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  discountText: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '500',
  },
  installmentInfo: {
    marginBottom: 2,
  },
  installmentCount: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  installmentDetail: {
    color: '#888',
    fontSize: 14,
    marginTop: 2,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  todayAmount: {
    color: '#4ade80',
    fontSize: 18,
    fontWeight: '700',
  },
  schedulePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  scheduleText: {
    color: '#888',
    fontSize: 12,
  },
});
