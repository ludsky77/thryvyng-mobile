import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

function formatUsd(amount: number | null | undefined): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function ageFromDob(dob: string | null | undefined): string {
  if (!dob) return '';
  const dayPart = String(dob).split('T')[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayPart);
  let birth: Date | null = null;
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const dt = new Date(y, mo, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d) birth = dt;
  }
  if (!birth) {
    const dt = new Date(dob);
    if (Number.isNaN(dt.getTime())) return '';
    birth = dt;
  }
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const md = today.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age -= 1;
  if (age < 0) return '';
  return `Age ${age}`;
}

function formatProgramTypeLabel(t: string | null | undefined): string {
  if (!t) return 'Program';
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type TryoutParsed =
  | { kind: 'array'; rows: any[] }
  | { kind: 'string'; text: string }
  | { kind: 'raw'; text: string };

function parseTryoutSchedule(raw: unknown): TryoutParsed | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s);
      return parseTryoutSchedule(parsed);
    } catch {
      return { kind: 'string', text: s };
    }
  }
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    return { kind: 'array', rows: raw as any[] };
  }
  if (typeof raw === 'object') {
    try {
      return { kind: 'raw', text: JSON.stringify(raw, null, 2) };
    } catch {
      return { kind: 'raw', text: String(raw) };
    }
  }
  return { kind: 'raw', text: String(raw) };
}

export default function RegistrationDetailScreen({ navigation }: { navigation: any }) {
  const route = useRoute<any>();
  const registrationId = route.params?.registrationId as string | undefined;
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<any | null>(null);

  useEffect(() => {
    if (!registrationId) {
      setLoading(false);
      setRow(null);
      Alert.alert('Error', 'Missing registration.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('program_registrations')
        .select(
          `
          id, status, payment_status, total_amount, amount_paid,
          created_at, checked_in, checked_in_at,
          players(id, first_name, last_name, date_of_birth, photo_url),
          packages(name, price),
          programs(
            id, name, type, description, tryout_schedule,
            clubs(name, logo_url)
          )
        `
        )
        .eq('id', registrationId)
        .single();
      if (cancelled) return;
      if (error || !data) {
        setRow(null);
        setLoading(false);
        Alert.alert('Error', 'Registration not found.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
        return;
      }
      setRow(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [registrationId, navigation]);

  if (loading || !row) {
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
          <Text style={styles.headerTitle}>Registration Details</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centered}>
          {loading ? <ActivityIndicator size="large" color="#8b5cf6" /> : null}
        </View>
      </SafeAreaView>
    );
  }

  const player = firstOf(row.players);
  const pkg = firstOf(row.packages);
  const program = firstOf(row.programs);
  const clubRaw = program?.clubs;
  const club = firstOf(clubRaw);

  const playerName =
    [player?.first_name, player?.last_name].filter(Boolean).join(' ') || 'Player';
  const isPaid = row.payment_status === 'paid';
  const paidNum = Number(row.amount_paid);
  const totalNum = Number(row.total_amount);
  const isPartial =
    !isPaid &&
    !Number.isNaN(paidNum) &&
    !Number.isNaN(totalNum) &&
    totalNum > 0 &&
    paidNum < totalNum;
  const progressPct =
    isPartial && totalNum > 0 ? Math.min(100, Math.max(0, (paidNum / totalNum) * 100)) : 0;

  const created = row.created_at ? new Date(row.created_at) : null;
  const regDateStr =
    created && !Number.isNaN(created.getTime())
      ? created.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';

  const checkedAt = row.checked_in_at ? new Date(row.checked_in_at) : null;
  const checkedStr =
    checkedAt && !Number.isNaN(checkedAt.getTime())
      ? checkedAt.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : '';

  let tryoutParsed: TryoutParsed | null = null;
  try {
    tryoutParsed = parseTryoutSchedule(program?.tryout_schedule);
  } catch {
    tryoutParsed =
      program?.tryout_schedule != null
        ? { kind: 'raw', text: String(program.tryout_schedule) }
        : null;
  }

  const hasSchedule =
    tryoutParsed != null &&
    (tryoutParsed.kind !== 'array' || tryoutParsed.rows.length > 0) &&
    (tryoutParsed.kind !== 'string' || tryoutParsed.text.trim().length > 0) &&
    (tryoutParsed.kind !== 'raw' || tryoutParsed.text.trim().length > 0);

  const hasClubContact =
    !!(club?.contact_email?.trim() || club?.contact_phone?.trim());

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
        <Text style={styles.headerTitle}>Registration Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Program</Text>
        <View style={styles.card}>
          <View style={styles.clubRow}>
            {club?.logo_url ? (
              <Image source={{ uri: club.logo_url }} style={styles.clubLogo} resizeMode="contain" />
            ) : (
              <View style={styles.clubLogoPlaceholder}>
                <Feather name="shield" size={18} color="#6b7280" />
              </View>
            )}
            <Text style={styles.clubName}>{club?.name || 'Club'}</Text>
          </View>
          <Text style={styles.programTitle}>{program?.name || 'Program'}</Text>
          <View style={styles.badgeRow}>
            {program?.type ? (
              <View style={styles.typePill}>
                <Text style={styles.typePillText}>{formatProgramTypeLabel(program.type)}</Text>
              </View>
            ) : null}
          </View>
          {program?.description ? (
            <Text style={styles.description}>{program.description}</Text>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>Player</Text>
        <View style={styles.card}>
          <View style={styles.playerRow}>
            {player?.photo_url ? (
              <Image source={{ uri: player.photo_url }} style={styles.playerPhoto} />
            ) : (
              <View style={styles.playerPhotoPlaceholder}>
                <Text style={styles.playerInitial}>{playerName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.playerTextCol}>
              <Text style={styles.playerName}>{playerName}</Text>
              <Text style={styles.secondary}>{ageFromDob(player?.date_of_birth)}</Text>
            </View>
          </View>
          {row.checked_in ? (
            <View style={styles.checkedBadge}>
              <Text style={styles.checkedBadgeText}>Checked In{checkedStr ? ` · ${checkedStr}` : ''}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>Payment</Text>
        <View style={styles.card}>
          <View style={styles.payHeader}>
            <View style={[styles.payBadge, isPaid ? styles.badgePaid : styles.badgePending]}>
              <Text style={[styles.payBadgeText, isPaid ? styles.payBadgeTextPaid : styles.payBadgeTextPending]}>
                {isPaid ? 'Paid' : 'Pending'}
              </Text>
            </View>
          </View>
          {pkg?.name ? (
            <Text style={styles.bodyWhite}>
              {pkg.name}
              {pkg.price != null ? ` · ${formatUsd(pkg.price)}` : ''}
            </Text>
          ) : null}
          <Text style={styles.secondary}>Amount paid: {formatUsd(row.amount_paid)}</Text>
          {isPartial ? (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
              </View>
              <Text style={styles.secondarySmall}>
                {formatUsd(row.amount_paid)} of {formatUsd(row.total_amount)}
              </Text>
            </View>
          ) : (
            <Text style={styles.secondarySmall}>Total: {formatUsd(row.total_amount)}</Text>
          )}
          {regDateStr ? <Text style={styles.secondarySmall}>Registered: {regDateStr}</Text> : null}
        </View>

        {hasSchedule && tryoutParsed ? (
          <>
            <Text style={styles.sectionLabel}>Schedule</Text>
            <View style={styles.card}>
              {tryoutParsed.kind === 'array' ? (
                tryoutParsed.rows.map((entry: any, idx: number) => (
                  <View key={idx} style={[styles.scheduleRow, idx > 0 && styles.scheduleRowBorder]}>
                    <Text style={styles.scheduleDateBold}>{entry?.date ?? '—'}</Text>
                    <Text style={styles.secondary}>{entry?.time ?? ''}</Text>
                    <Text style={styles.secondary}>{entry?.location ?? ''}</Text>
                    <Text style={styles.secondary}>{entry?.age_group ?? ''}</Text>
                  </View>
                ))
              ) : tryoutParsed.kind === 'string' ? (
                <Text style={styles.bodyMuted}>{tryoutParsed.text}</Text>
              ) : (
                <Text style={styles.bodyMuted}>{tryoutParsed.text}</Text>
              )}
            </View>
          </>
        ) : null}

        {hasClubContact ? (
          <>
            <Text style={styles.sectionLabel}>Club Contact</Text>
            <View style={styles.card}>
              {club?.contact_email?.trim() ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`mailto:${club.contact_email.trim()}`)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.linkText}>{club.contact_email.trim()}</Text>
                </TouchableOpacity>
              ) : null}
              {club?.contact_phone?.trim() ? (
                <TouchableOpacity
                  style={club?.contact_email?.trim() ? { marginTop: 10 } : undefined}
                  onPress={() => {
                    const tel = (club?.contact_phone ?? '').replace(/[^\d+]/g, '');
                    if (tel) void Linking.openURL(`tel:${tel}`);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.linkText}>{club.contact_phone.trim()}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        ) : null}

        <View style={styles.bottomPad} />
      </ScrollView>
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
  scrollContent: { padding: 16, paddingBottom: 32, backgroundColor: '#0a0a1a' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a1a',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  clubLogo: { width: 40, height: 40, borderRadius: 8 },
  clubLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clubName: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 },
  programTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 10 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  typePill: {
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  typePillText: { color: '#c4b5fd', fontSize: 12, fontWeight: '700' },
  seasonPill: {
    backgroundColor: '#374151',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  seasonPillText: { color: '#d1d5db', fontSize: 12, fontWeight: '600' },
  description: { color: '#9ca3af', fontSize: 14, lineHeight: 20, marginTop: 4 },
  secondary: { color: '#9ca3af', fontSize: 14, marginTop: 4 },
  secondarySmall: { color: '#9ca3af', fontSize: 12, marginTop: 6 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playerPhoto: { width: 56, height: 56, borderRadius: 28 },
  playerPhotoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerInitial: { color: '#fff', fontSize: 22, fontWeight: '700' },
  playerTextCol: { flex: 1 },
  playerName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  checkedBadge: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: '#22c55e',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  checkedBadgeText: { color: '#166534', fontSize: 12, fontWeight: '700' },
  payHeader: { marginBottom: 8 },
  payBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  badgePaid: { backgroundColor: '#22c55e' },
  badgePending: { backgroundColor: '#f59e0b' },
  payBadgeText: { fontSize: 12, fontWeight: '700' },
  payBadgeTextPaid: { color: '#166534' },
  payBadgeTextPending: { color: '#92400e' },
  bodyWhite: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 4 },
  bodyMuted: { color: '#9ca3af', fontSize: 14, lineHeight: 20 },
  progressWrap: { marginTop: 12 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1e293b',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#8b5cf6',
  },
  scheduleRow: { paddingVertical: 8 },
  scheduleRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#374151' },
  scheduleDateBold: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  linkText: { color: '#a78bfa', fontSize: 15, textDecorationLine: 'underline' },
  bottomPad: { height: 24 },
});
