import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  subtotal: number;
  siblingDiscount: number;
  volunteerDiscount: number;
  payInFullDiscount: number;
  donationAmount: number;
  total: number;
  dueToday: number;
  playerCount: number;
}

export default function OrderSummary({
  subtotal,
  siblingDiscount,
  volunteerDiscount,
  payInFullDiscount,
  donationAmount,
  total,
  dueToday,
  playerCount,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Order Summary</Text>

      {/* Subtotal */}
      <View style={styles.row}>
        <Text style={styles.label}>Subtotal</Text>
        <Text style={styles.value}>${subtotal.toFixed(2)}</Text>
      </View>

      {/* Discounts */}
      {siblingDiscount > 0 && (
        <View style={styles.row}>
          <View style={styles.discountLabel}>
            <Ionicons name="people" size={14} color="#4ade80" />
            <Text style={styles.discountText}>2+ Players Discount</Text>
          </View>
          <Text style={styles.discountValue}>-${siblingDiscount.toFixed(2)}</Text>
        </View>
      )}

      {payInFullDiscount > 0 && (
        <View style={styles.row}>
          <View style={styles.discountLabel}>
            <Ionicons name="checkmark-circle" size={14} color="#4ade80" />
            <Text style={styles.discountText}>Pay-in-Full Savings</Text>
          </View>
          <Text style={styles.discountValue}>-${payInFullDiscount.toFixed(2)}</Text>
        </View>
      )}

      {volunteerDiscount > 0 && (
        <View style={styles.row}>
          <View style={styles.discountLabel}>
            <Ionicons name="hand-left" size={14} color="#4ade80" />
            <Text style={styles.discountText}>Volunteer Discount</Text>
          </View>
          <Text style={styles.discountValue}>-${volunteerDiscount.toFixed(2)}</Text>
        </View>
      )}

      {donationAmount > 0 && (
        <View style={styles.row}>
          <View style={styles.discountLabel}>
            <Ionicons name="heart" size={14} color="#ec4899" />
            <Text style={styles.discountText}>Donation</Text>
          </View>
          <Text style={styles.value}>${donationAmount.toFixed(2)}</Text>
        </View>
      )}

      {/* Divider */}
      <View style={styles.divider} />

      {/* Total */}
      <View style={styles.row}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
      </View>

      {/* Due Today (highlighted) */}
      <View style={styles.dueTodayBox}>
        <View>
          <Text style={styles.dueTodayLabel}>Today's Payment</Text>
          <Text style={styles.dueTodaySubLabel}>
            {playerCount > 1 ? 'Full payment' : 'Based on selected plan'}
          </Text>
        </View>
        <Text style={styles.dueTodayValue}>${dueToday.toFixed(2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    color: '#888',
    fontSize: 14,
  },
  value: {
    color: '#fff',
    fontSize: 14,
  },
  discountLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  discountText: {
    color: '#4ade80',
    fontSize: 14,
    marginLeft: 6,
  },
  discountValue: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 12,
  },
  totalLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  totalValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  dueTodayBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  dueTodayLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  dueTodaySubLabel: {
    color: '#888',
    fontSize: 12,
  },
  dueTodayValue: {
    color: '#4ade80',
    fontSize: 24,
    fontWeight: '700',
  },
});
