import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PaymentInstallment {
  id: string;
  registration_id: string;
  due_date: string;
  amount: number;
  status: 'succeeded' | 'pending' | 'overdue' | 'upcoming';
  paid_at: string | null;
}

interface Registration {
  id: string;
  parent_id: string;
  player_id: string;
  program_id: string;
  status: string;
  total_amount: number;
  amount_paid: number;
  auto_pay_enabled: boolean;
  player: {
    id: string;
    first_name: string;
    last_name: string;
    photo_url: string | null;
  } | null;
  program: { name: string } | null;
}

interface PaymentMethod {
  id: string;
  parent_id: string;
  card_brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
  is_active: boolean;
}

interface ChildGroup {
  playerId: string;
  playerName: string;
  photoUrl: string | null;
  teamName: string | null;
  registrations: Registration[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function fmtMoney(n: number) {
  return `$${n.toFixed(2)}`;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={[styles.summaryValue, valueColor ? { color: valueColor } : undefined]}>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function InstallmentRow({ item }: { item: PaymentInstallment }) {
  const isOverdue = item.status === 'overdue';
  const isPaid = item.status === 'succeeded';
  const icon = isPaid
    ? 'checkmark-circle'
    : isOverdue
    ? 'warning'
    : 'time-outline';
  const iconColor = isPaid ? '#4ade80' : isOverdue ? '#ef4444' : '#f59e0b';

  return (
    <View style={[styles.installmentRow, isOverdue && styles.installmentRowOverdue]}>
      <Text style={styles.installmentDate}>{fmtShortDate(item.due_date)}</Text>
      <Text style={styles.installmentAmount}>{fmtMoney(item.amount)}</Text>
      <Ionicons name={icon as any} size={18} color={iconColor} />
    </View>
  );
}

function RegistrationCard({
  reg,
  installments,
}: {
  reg: Registration;
  installments: PaymentInstallment[];
}) {
  const [expanded, setExpanded] = useState(false);
  const myInstallments = installments.filter((i) => i.registration_id === reg.id);
  const remaining = reg.total_amount - reg.amount_paid;
  const isPaidOff = remaining <= 0;
  const pct = reg.total_amount > 0 ? Math.min(reg.amount_paid / reg.total_amount, 1) : 1;

  const nextDue = myInstallments
    .filter((i) => i.status === 'pending' || i.status === 'upcoming')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

  const hasOverdue = myInstallments.some((i) => i.status === 'overdue');
  const statusLabel = hasOverdue ? 'Overdue' : isPaidOff ? 'Paid' : 'On Track';
  const statusColor = hasOverdue ? '#ef4444' : isPaidOff ? '#4ade80' : '#f59e0b';

  if (isPaidOff) {
    return (
      <View style={styles.regRowPaid}>
        <Text style={styles.regRowPaidName} numberOfLines={1}>
          {reg.program?.name || 'Program'}
        </Text>
        <Text style={styles.regRowPaidAmount}>
          {fmtMoney(reg.amount_paid)}/{fmtMoney(reg.total_amount)}
        </Text>
        <View style={[styles.badge, { backgroundColor: '#4ade8022' }]}>
          <Text style={[styles.badgeText, { color: '#4ade80' }]}>Paid</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.regCard}>
      {/* Header row */}
      <View style={styles.regCardHeader}>
        <Text style={styles.regCardName} numberOfLines={1}>
          {reg.program?.name || 'Program'}
        </Text>
        <View style={[styles.badge, { backgroundColor: `${statusColor}22` }]}>
          <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
      </View>
      <View style={styles.progressLabels}>
        <Text style={styles.progressLeft}>{Math.round(pct * 100)}% paid</Text>
        {nextDue && (
          <Text style={styles.progressRight}>
            Next: {fmtMoney(nextDue.amount)} on {fmtShortDate(nextDue.due_date)}
          </Text>
        )}
      </View>

      {/* Auto-pay badge */}
      <View style={styles.autoPayRow}>
        <Ionicons
          name={reg.auto_pay_enabled ? 'refresh-circle' : 'refresh-circle-outline'}
          size={15}
          color={reg.auto_pay_enabled ? '#4ade80' : '#666'}
        />
        <Text style={[styles.autoPayText, { color: reg.auto_pay_enabled ? '#4ade80' : '#666' }]}>
          Auto-pay {reg.auto_pay_enabled ? 'ON' : 'OFF'}
        </Text>

        {myInstallments.length > 0 && (
          <TouchableOpacity
            style={styles.viewScheduleBtn}
            onPress={() => setExpanded((v) => !v)}
          >
            <Text style={styles.viewScheduleText}>View Schedule</Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color="#8b5cf6"
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Installments list */}
      {expanded && (
        <View style={styles.installmentsList}>
          {myInstallments
            .sort((a, b) => a.due_date.localeCompare(b.due_date))
            .map((item) => (
              <InstallmentRow key={item.id} item={item} />
            ))}
        </View>
      )}
    </View>
  );
}

function SavedCardRow({
  card,
  onSetDefault,
  onRemove,
}: {
  card: PaymentMethod;
  onSetDefault: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <View style={styles.cardRow}>
      <Ionicons name="card-outline" size={22} color="#8b5cf6" />
      <View style={styles.cardInfo}>
        <Text style={styles.cardLast4}>
          {card.card_brand ? `${card.card_brand} ` : ''}•••• {card.last4}
        </Text>
        <Text style={styles.cardExpiry}>
          Exp {card.exp_month}/{card.exp_year}
        </Text>
      </View>
      {card.is_default && (
        <View style={[styles.badge, { backgroundColor: '#4ade8022', marginRight: 8 }]}>
          <Text style={[styles.badgeText, { color: '#4ade80' }]}>Default</Text>
        </View>
      )}
      {!card.is_default && (
        <TouchableOpacity
          style={styles.cardActionBtn}
          onPress={() => onSetDefault(card.id)}
        >
          <Text style={styles.cardActionText}>Set Default</Text>
        </TouchableOpacity>
      )}
      {!card.is_default && (
        <TouchableOpacity onPress={() => onRemove(card.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ParentPaymentsScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [installments, setInstallments] = useState<PaymentInstallment[]>([]);
  const [cards, setCards] = useState<PaymentMethod[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<string>('all');

  const [cardSetupWebViewVisible, setCardSetupWebViewVisible] = useState(false);
  const [cardSetupUrl, setCardSetupUrl] = useState<string | null>(null);
  const [cardSetupConfirming, setCardSetupConfirming] = useState(false);
  const cardSetupHandledRef = useRef(false);
  const cardSetupSessionIdRef = useRef<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;

    try {
      const [regRes, payRes, cardRes] = await Promise.all([
        supabase
          .from('program_registrations')
          .select(
            '*, player:players(id, first_name, last_name, photo_url), program:programs(name)',
          )
          .eq('parent_id', user.id)
          .in('status', ['completed', 'active']),

        supabase
          .from('registration_payments')
          .select('*, registration:program_registrations!inner(parent_id)')
          .eq('registration.parent_id', user.id)
          .order('due_date', { ascending: true }),

        supabase
          .from('parent_payment_methods')
          .select('*')
          .eq('parent_id', user.id)
          .eq('is_active', true),
      ]);

      setRegistrations((regRes.data as Registration[]) || []);
      setInstallments((payRes.data as PaymentInstallment[]) || []);
      setCards((cardRes.data as PaymentMethod[]) || []);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // ── Derived data ──────────────────────────────────────────────────────────

  const programOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { id: string; name: string }[] = [];
    registrations.forEach((r) => {
      if (r.program?.name && !seen.has(r.program_id)) {
        seen.add(r.program_id);
        opts.push({ id: r.program_id, name: r.program.name });
      }
    });
    return opts;
  }, [registrations]);

  const filteredRegs = useMemo(() => {
    if (selectedProgram === 'all') return registrations;
    return registrations.filter((r) => r.program_id === selectedProgram);
  }, [registrations, selectedProgram]);

  const childGroups = useMemo((): ChildGroup[] => {
    const map = new Map<string, ChildGroup>();
    filteredRegs.forEach((r) => {
      if (!r.player) return;
      const pid = r.player.id;
      if (!map.has(pid)) {
        map.set(pid, {
          playerId: pid,
          playerName: `${r.player.first_name} ${r.player.last_name}`,
          photoUrl: r.player.photo_url,
          teamName: null,
          registrations: [],
        });
      }
      map.get(pid)!.registrations.push(r);
    });
    return Array.from(map.values());
  }, [filteredRegs]);

  const summary = useMemo(() => {
    const totalOwed = registrations.reduce((s, r) => s + (r.total_amount || 0), 0);
    const totalPaid = registrations.reduce((s, r) => s + (r.amount_paid || 0), 0);
    const remaining = Math.max(0, totalOwed - totalPaid);
    const nextDue = installments
      .filter((i) => i.status === 'pending' || i.status === 'upcoming')
      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    return { totalOwed, totalPaid, remaining, nextDue };
  }, [registrations, installments]);

  const paidHistory = useMemo(() => {
    return installments
      .filter((i) => i.status === 'succeeded')
      .sort((a, b) => (b.paid_at || '').localeCompare(a.paid_at || ''))
      .slice(0, 20);
  }, [installments]);

  // ── Card actions ──────────────────────────────────────────────────────────

  const handleSetDefault = async (cardId: string) => {
    const prev = [...cards];
    setCards((c) => c.map((m) => ({ ...m, is_default: m.id === cardId })));
    await supabase
      .from('parent_payment_methods')
      .update({ is_default: false })
      .eq('parent_id', user!.id);
    const { error } = await supabase
      .from('parent_payment_methods')
      .update({ is_default: true })
      .eq('id', cardId);
    if (error) {
      setCards(prev);
      Alert.alert('Error', 'Could not update default card.');
    } else {
      await fetchData();
    }
  };

  const handleRemoveCard = (cardId: string) => {
    Alert.alert('Remove this card?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('parent_payment_methods')
            .update({ is_active: false })
            .eq('id', cardId);
          if (!error) {
            await fetchData();
          } else {
            Alert.alert('Error', 'Could not remove card.');
          }
        },
      },
    ]);
  };

  const closeCardSetupWebView = useCallback(() => {
    setCardSetupWebViewVisible(false);
    setCardSetupUrl(null);
    cardSetupSessionIdRef.current = null;
  }, []);

  const dismissCardSetupWebView = useCallback(() => {
    closeCardSetupWebView();
    cardSetupHandledRef.current = false;
  }, [closeCardSetupWebView]);

  const handleConfirmCardSetup = useCallback(
    async (sessionId: string) => {
      if (!sessionId) return;
      setCardSetupConfirming(true);
      closeCardSetupWebView();
      try {
        const { data: confirmData, error } = await supabase.functions.invoke('confirm-card-setup', {
          body: { session_id: sessionId, set_as_default: true },
        });
        if (error || !confirmData?.success) {
          Alert.alert('Error', 'Failed to save card. Please try again.');
          cardSetupHandledRef.current = false;
          return;
        }
        const brand = confirmData.card?.brand ?? 'Card';
        const last4 = confirmData.card?.last4 ?? '****';
        Alert.alert(
          'Card Added',
          `${brand} ending in ${last4} has been saved as your default payment method.`,
        );
        await fetchData();
      } catch {
        Alert.alert('Error', 'Failed to save card. Please try again.');
        cardSetupHandledRef.current = false;
      } finally {
        setCardSetupConfirming(false);
      }
    },
    [closeCardSetupWebView, fetchData],
  );

  const handleWebViewNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const url = navState.url || '';
      if (url.includes('card-setup-cancel')) {
        dismissCardSetupWebView();
        return;
      }
      if (!url.includes('card-setup-success')) return;
      if (cardSetupHandledRef.current) return;

      let sessionIdFromUrl = '';
      try {
        const u = new URL(url);
        sessionIdFromUrl = u.searchParams.get('session_id') || '';
      } catch {
        /* ignore */
      }
      const sessionId = sessionIdFromUrl || cardSetupSessionIdRef.current || '';
      if (!sessionId) return;

      cardSetupHandledRef.current = true;
      void handleConfirmCardSetup(sessionId);
    },
    [dismissCardSetupWebView, handleConfirmCardSetup],
  );

  const handleAddCard = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase.functions.invoke('create-card-setup-session', {
        body: {
          success_url: 'https://thryvyng.com/card-setup-success',
          cancel_url: 'https://thryvyng.com/card-setup-cancel',
        },
      });
      if (error) {
        Alert.alert('Error', error.message || 'Could not start card setup.');
        return;
      }
      const url = (data as { url?: string })?.url;
      const sessionId = (data as { session_id?: string })?.session_id;
      if (!url || !sessionId) {
        Alert.alert('Error', 'Could not start card setup.');
        return;
      }
      cardSetupHandledRef.current = false;
      cardSetupSessionIdRef.current = sessionId;
      setCardSetupUrl(url);
      setCardSetupWebViewVisible(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not start card setup.');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payments</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b5cf6" />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Summary Row ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.summaryRow}
          contentContainerStyle={styles.summaryRowContent}
        >
          <SummaryCard label="Total Owed" value={fmtMoney(summary.totalOwed)} />
          <SummaryCard label="Total Paid" value={fmtMoney(summary.totalPaid)} valueColor="#4ade80" />
          <SummaryCard
            label="Remaining"
            value={fmtMoney(summary.remaining)}
            valueColor={summary.remaining > 0 ? '#f59e0b' : '#4ade80'}
          />
          {summary.nextDue ? (
            <SummaryCard
              label={`Next Due · ${fmtShortDate(summary.nextDue.due_date)}`}
              value={fmtMoney(summary.nextDue.amount)}
              valueColor="#f59e0b"
            />
          ) : (
            <SummaryCard label="Next Due" value="—" valueColor="#888" />
          )}
        </ScrollView>

        {/* ── 2. Program Filter ── */}
        {programOptions.length > 1 && (
          <View style={styles.filterSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.filterPill, selectedProgram === 'all' && styles.filterPillActive]}
                onPress={() => setSelectedProgram('all')}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    selectedProgram === 'all' && styles.filterPillTextActive,
                  ]}
                >
                  All Programs
                </Text>
              </TouchableOpacity>
              {programOptions.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.filterPill,
                    selectedProgram === p.id && styles.filterPillActive,
                  ]}
                  onPress={() => setSelectedProgram(p.id)}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      selectedProgram === p.id && styles.filterPillTextActive,
                    ]}
                  >
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── 3. Per-Child Sections ── */}
        {childGroups.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={40} color="#444" />
            <Text style={styles.emptyText}>No registrations found</Text>
          </View>
        ) : (
          childGroups.map((child) => (
            <View key={child.playerId} style={styles.childSection}>
              {/* Child header */}
              <View style={styles.childHeader}>
                {child.photoUrl ? (
                  <Image source={{ uri: child.photoUrl }} style={styles.childAvatar} />
                ) : (
                  <View style={styles.childAvatarFallback}>
                    <Text style={styles.childAvatarInitials}>
                      {getInitials(child.playerName)}
                    </Text>
                  </View>
                )}
                <View>
                  <Text style={styles.childName}>{child.playerName}</Text>
                  {child.teamName && (
                    <Text style={styles.childTeam}>{child.teamName}</Text>
                  )}
                </View>
              </View>

              {child.registrations.map((reg) => (
                <RegistrationCard
                  key={reg.id}
                  reg={reg}
                  installments={installments}
                />
              ))}
            </View>
          ))
        )}

        {/* ── 4. Saved Cards ── */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>Saved Cards</Text>
          {cards.length === 0 ? (
            <Text style={styles.emptyMuted}>No saved payment methods</Text>
          ) : (
            <View style={styles.cardsContainer}>
              {cards.map((card) => (
                <SavedCardRow
                  key={card.id}
                  card={card}
                  onSetDefault={handleSetDefault}
                  onRemove={handleRemoveCard}
                />
              ))}
            </View>
          )}
          <TouchableOpacity
            style={styles.addCardBtn}
            onPress={handleAddCard}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle-outline" size={20} color="#8b5cf6" />
            <Text style={styles.addCardText}>Add Card</Text>
          </TouchableOpacity>
        </View>

        {/* ── 5. Payment History ── */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>Payment History</Text>
          {paidHistory.length === 0 ? (
            <Text style={styles.emptyMuted}>No payment history</Text>
          ) : (
            <View style={styles.cardsContainer}>
              {paidHistory.map((item) => {
                const reg = registrations.find((r) => r.id === item.registration_id);
                const playerName = reg?.player
                  ? `${reg.player.first_name} ${reg.player.last_name}`
                  : '';
                return (
                  <View key={item.id} style={styles.historyRow}>
                    <View style={styles.historyLeft}>
                      <Text style={styles.historyDate}>
                        {fmtDate(item.paid_at || item.due_date)}
                      </Text>
                      {playerName ? (
                        <Text style={styles.historyPlayer}>{playerName}</Text>
                      ) : null}
                      {reg?.program?.name ? (
                        <Text style={styles.historyProgram}>{reg.program.name}</Text>
                      ) : null}
                    </View>
                    <View style={styles.historyRight}>
                      <Text style={styles.historyAmount}>{fmtMoney(item.amount)}</Text>
                      <View style={[styles.badge, { backgroundColor: '#4ade8022' }]}>
                        <Text style={[styles.badgeText, { color: '#4ade80' }]}>Paid</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {cardSetupConfirming && (
        <View style={styles.cardSetupConfirmingOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      )}

      <Modal
        visible={cardSetupWebViewVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={dismissCardSetupWebView}
      >
        <SafeAreaView style={styles.cardSetupModalSafe} edges={['top']}>
          <View style={styles.cardSetupModalHeader}>
            <TouchableOpacity onPress={dismissCardSetupWebView} style={styles.cardSetupModalClose} hitSlop={12}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.cardSetupModalTitle}>Add payment method</Text>
            <View style={{ width: 40 }} />
          </View>
          {cardSetupUrl ? (
            <WebView
              source={{ uri: cardSetupUrl }}
              style={styles.cardSetupWebView}
              onNavigationStateChange={handleWebViewNavigationStateChange}
              startInLoadingState
              renderLoading={() => (
                <View style={styles.cardSetupWebViewLoading}>
                  <ActivityIndicator size="large" color="#8b5cf6" />
                </View>
              )}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 40 },
  headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 17, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // Summary
  summaryRow: { flexGrow: 0, marginTop: 8 },
  summaryRowContent: { paddingHorizontal: 16, gap: 10 },
  summaryCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    minWidth: 110,
    alignItems: 'center',
  },
  summaryValue: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  summaryLabel: { color: '#888', fontSize: 11 },

  // Filter pills
  filterSection: { marginTop: 16, paddingHorizontal: 16 },
  filterPill: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#1a1a1a',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  filterPillActive: { backgroundColor: '#8b5cf622', borderColor: '#8b5cf6' },
  filterPillText: { color: '#888', fontSize: 13 },
  filterPillTextActive: { color: '#8b5cf6', fontWeight: '600' },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: { color: '#555', fontSize: 14 },
  emptyMuted: { color: '#555', fontSize: 13, paddingVertical: 8, paddingHorizontal: 16 },

  // Child section
  childSection: { marginTop: 20, paddingHorizontal: 16 },
  childHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  childAvatar: { width: 40, height: 40, borderRadius: 20 },
  childAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8b5cf622',
    justifyContent: 'center',
    alignItems: 'center',
  },
  childAvatarInitials: { color: '#c4b5fd', fontSize: 14, fontWeight: '700' },
  childName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  childTeam: { color: '#888', fontSize: 12 },

  // Paid registration (compact row)
  regRowPaid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  regRowPaidName: { color: '#aaa', fontSize: 13, flex: 1 },
  regRowPaidAmount: { color: '#888', fontSize: 12 },

  // Pending registration card
  regCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  regCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  regCardName: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },

  // Progress bar
  progressTrack: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: 6,
    backgroundColor: '#8b5cf6',
    borderRadius: 3,
  },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressLeft: { color: '#888', fontSize: 11 },
  progressRight: { color: '#888', fontSize: 11 },

  // Auto-pay
  autoPayRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  autoPayText: { fontSize: 12, fontWeight: '500' },
  viewScheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  viewScheduleText: { color: '#8b5cf6', fontSize: 12, fontWeight: '600' },

  // Installments
  installmentsList: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#2a2a2a', paddingTop: 8 },
  installmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 6,
    gap: 8,
  },
  installmentRowOverdue: { backgroundColor: 'rgba(239, 68, 68, 0.06)' },
  installmentDate: { color: '#aaa', fontSize: 12, width: 70 },
  installmentAmount: { color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 },

  // Badge
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },

  // Section block
  sectionBlock: { marginTop: 24, paddingHorizontal: 16 },
  sectionTitle: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  cardsContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Saved card row
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  cardInfo: { flex: 1 },
  cardLast4: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cardExpiry: { color: '#888', fontSize: 12 },
  cardActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#8b5cf622',
    borderRadius: 6,
    marginRight: 4,
  },
  cardActionText: { color: '#8b5cf6', fontSize: 12, fontWeight: '600' },
  addCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#8b5cf655',
  },
  addCardText: { color: '#8b5cf6', fontSize: 14, fontWeight: '600' },

  cardSetupConfirmingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  cardSetupModalSafe: { flex: 1, backgroundColor: '#0a0a0a' },
  cardSetupModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  cardSetupModalClose: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  cardSetupModalTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: '600' },
  cardSetupWebView: { flex: 1, backgroundColor: '#0a0a0a' },
  cardSetupWebViewLoading: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },

  // Payment history row
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  historyLeft: { flex: 1 },
  historyDate: { color: '#aaa', fontSize: 11, marginBottom: 2 },
  historyPlayer: { color: '#fff', fontSize: 13, fontWeight: '500' },
  historyProgram: { color: '#888', fontSize: 11 },
  historyRight: { alignItems: 'flex-end', gap: 4 },
  historyAmount: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
