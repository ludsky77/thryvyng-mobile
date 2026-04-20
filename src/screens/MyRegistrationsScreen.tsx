import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

function formatUsd(amount: number | null | undefined): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export default function MyRegistrationsScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRegistrations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const fetchRegistrations = async () => {
      const { data } = await supabase
        .from('program_registrations')
        .select(
          `
          id, status, payment_status, total_amount, amount_paid, created_at,
          players(first_name, last_name),
          programs(name, clubs(name, logo_url))
        `
        )
        .eq('parent_id', user.id)
        .order('created_at', { ascending: false });
      setRegistrations(data || []);
      setLoading(false);
    };
    void fetchRegistrations();
  }, [user?.id]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Registrations</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      ) : registrations.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="clipboard" size={48} color="#4b5563" />
          <Text style={styles.emptyText}>No program registrations yet</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {registrations.map((r) => {
            const player = Array.isArray(r.players) ? r.players[0] : r.players;
            const program = Array.isArray(r.programs) ? r.programs[0] : r.programs;
            const clubRaw = program?.clubs;
            const club = Array.isArray(clubRaw) ? clubRaw[0] : clubRaw;
            const playerName = [player?.first_name, player?.last_name].filter(Boolean).join(' ') || 'Player';
            const total = r.total_amount;
            const paid = r.amount_paid;
            const isPaid = r.payment_status === 'paid';
            const paidNum = Number(paid);
            const totalNum = Number(total);
            const isPartial =
              !isPaid &&
              !Number.isNaN(paidNum) &&
              !Number.isNaN(totalNum) &&
              totalNum > 0 &&
              paidNum < totalNum;
            const amountLine = isPartial
              ? `${formatUsd(paid)} / ${formatUsd(total)}`
              : `${formatUsd(isPaid ? (paid ?? total) : paid ?? 0)} paid`;
            const created = r.created_at ? new Date(r.created_at) : null;
            const dateStr =
              created && !Number.isNaN(created.getTime())
                ? created.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : '';

            return (
              <TouchableOpacity
                key={r.id}
                style={styles.registrationCardTouchable}
                onPress={() => navigation.navigate('RegistrationDetail', { registrationId: r.id })}
                activeOpacity={0.75}
              >
                <View style={styles.registrationCardBody}>
                  <Text style={styles.registrationPlayerName}>{playerName}</Text>
                  {program?.name ? (
                    <Text style={styles.registrationSecondary}>{program.name}</Text>
                  ) : null}
                  {club?.name ? (
                    <Text style={styles.registrationSecondary}>{club.name}</Text>
                  ) : null}
                  <View style={styles.registrationFooterRow}>
                    <View
                      style={[
                        styles.registrationPaymentBadge,
                        isPaid ? styles.registrationBadgePaid : styles.registrationBadgePending,
                      ]}
                    >
                      <Text
                        style={
                          isPaid
                            ? styles.registrationBadgeTextPaid
                            : styles.registrationBadgeTextPending
                        }
                      >
                        {isPaid ? 'Paid' : 'Pending'}
                      </Text>
                    </View>
                    <Text style={styles.registrationAmount}>{amountLine}</Text>
                  </View>
                  {dateStr ? <Text style={styles.registrationDate}>{dateStr}</Text> : null}
                </View>
                <Feather name="chevron-right" size={20} color="#6B7280" style={styles.registrationChevron} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0a0a1a',
  },
  headerButton: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  headerSpacer: { width: 32 },
  scroll: { flex: 1, backgroundColor: '#0a0a1a' },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#0a0a1a',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
    backgroundColor: '#0a0a1a',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
  },
  registrationCardTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  registrationCardBody: {
    flex: 1,
  },
  registrationChevron: {
    marginLeft: 8,
    opacity: 0.85,
  },
  registrationPlayerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  registrationSecondary: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 2,
  },
  registrationFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 12,
  },
  registrationPaymentBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  registrationBadgePaid: {
    backgroundColor: '#22c55e',
  },
  registrationBadgePending: {
    backgroundColor: '#f59e0b',
  },
  registrationBadgeTextPaid: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
  },
  registrationBadgeTextPending: {
    color: '#92400e',
    fontSize: 12,
    fontWeight: '700',
  },
  registrationAmount: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  registrationDate: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 8,
  },
});
