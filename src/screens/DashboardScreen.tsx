import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { RoleSwitcher } from '../components/RoleSwitcher';
import { NotificationBell } from '../components/NotificationBell';
import PlayerDashboard from '../components/dashboards/PlayerDashboard';
import CoachDashboard from '../components/dashboards/CoachDashboard';
import ClubAdminDashboard from '../components/dashboards/ClubAdminDashboard';
import SurveyPopupModal from '../components/SurveyPopupModal';

const SHOW_LINEUP_WIDGET_KEY = 'show_lineup_widget';

function playerNameFromRow(row: any): string {
  const p = row?.players;
  if (Array.isArray(p)) {
    const x = p[0];
    return [x?.first_name, x?.last_name].filter(Boolean).join(' ').trim() || 'Player';
  }
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || 'Player';
}

function programClubFromRow(row: any): { programName: string; clubName: string } {
  const pr = row?.programs;
  const program = Array.isArray(pr) ? pr[0] : pr;
  const programName = program?.name ?? 'Program';
  const c = program?.clubs;
  const club = Array.isArray(c) ? c[0] : c;
  const clubName = club?.name ?? '';
  return { programName, clubName };
}

function NoRoleDashboard(_props: { navigation: any }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [registrations, setRegistrations] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user?.id) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('program_registrations')
        .select(
          `
          id, 
          status, 
          payment_status,
          players(first_name, last_name),
          programs(name, clubs(name, logo_url))
        `
        )
        .eq('parent_id', user.id)
        .order('created_at', { ascending: false });
      if (!cancelled) {
        setRegistrations(data || []);
        setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (loading) {
    return (
      <View style={noRoleStyles.loadingWrap}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const paidRegs = registrations.filter((r) => r.payment_status === 'paid');
  const unpaidRegs = registrations.filter((r) => r.payment_status !== 'paid');

  if (registrations.length === 0) {
    return (
      <ScrollView
        style={noRoleStyles.scroll}
        contentContainerStyle={noRoleStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={noRoleStyles.card}>
          <Feather name="user-plus" size={40} color="#8b5cf6" style={noRoleStyles.iconTop} />
          <Text style={noRoleStyles.heading}>Welcome to Thryvyng</Text>
          <Text style={noRoleStyles.bodyMuted}>
            {`You're not part of a team yet.`}
          </Text>
          <Text style={noRoleStyles.bodyMuted}>
            If you have a team invitation link, open it to join your team.
          </Text>
          <Text style={noRoleStyles.bodyMuted}>
            Contact your club to register for a program or tryout.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={noRoleStyles.scroll}
      contentContainerStyle={noRoleStyles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {paidRegs.length > 0 && (
        <View style={noRoleStyles.card}>
          <Feather name="check-circle" size={40} color="#22c55e" style={noRoleStyles.iconTop} />
          <Text style={noRoleStyles.heading}>Registration confirmed</Text>
          {paidRegs.map((row) => {
            const name = playerNameFromRow(row);
            const { programName, clubName } = programClubFromRow(row);
            return (
              <View key={row.id} style={noRoleStyles.regRow}>
                <Text style={noRoleStyles.playerTitle}>{name}</Text>
                <Text style={noRoleStyles.meta}>{programName}</Text>
                {clubName ? <Text style={noRoleStyles.meta}>{clubName}</Text> : null}
                <View style={noRoleStyles.badgePaid}>
                  <Text style={noRoleStyles.badgePaidText}>Paid</Text>
                </View>
              </View>
            );
          })}
          <Text style={noRoleStyles.bodyMuted}>
            {`You'll receive a team invitation after evaluations are complete.`}
          </Text>
          <Text style={noRoleStyles.bodyMuted}>
            If you have questions, contact your club directly.
          </Text>
        </View>
      )}

      {unpaidRegs.length > 0 && (
        <View style={[noRoleStyles.card, paidRegs.length > 0 && noRoleStyles.cardSpaced]}>
          <Feather name="alert-circle" size={40} color="#f59e0b" style={noRoleStyles.iconTop} />
          <Text style={noRoleStyles.heading}>Complete your registration</Text>
          {unpaidRegs.map((row) => {
            const name = playerNameFromRow(row);
            const { programName, clubName } = programClubFromRow(row);
            return (
              <View key={row.id} style={noRoleStyles.regRow}>
                <Text style={noRoleStyles.playerTitle}>{name}</Text>
                <Text style={noRoleStyles.meta}>{programName}</Text>
                {clubName ? <Text style={noRoleStyles.meta}>{clubName}</Text> : null}
                <View style={noRoleStyles.badgePending}>
                  <Text style={noRoleStyles.badgePendingText}>Payment pending</Text>
                </View>
              </View>
            );
          })}
          <Text style={noRoleStyles.bodyMuted}>
            Complete your payment to secure your tryout spot.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const noRoleStyles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  card: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardSpaced: {
    marginTop: 16,
  },
  iconTop: {
    alignSelf: 'center',
    marginBottom: 12,
  },
  heading: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  playerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  meta: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 2,
  },
  bodyMuted: {
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
    textAlign: 'center',
  },
  regRow: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#374151',
  },
  badgePaid: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },
  badgePaidText: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '600',
  },
  badgePending: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },
  badgePendingText: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default function DashboardScreen({ navigation }: any) {
  const { user, profile, currentRole, loading: authLoading } = useAuth();
  const [showLineupWidget, setShowLineupWidget] = useState(true);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(SHOW_LINEUP_WIDGET_KEY).then((val) => {
        setShowLineupWidget(val !== 'false');
      });
    }, [])
  );

  const renderDashboard = () => {
    const role = currentRole?.role;
    const entityId = currentRole?.entity_id;

    switch (role) {
      case 'player':
      case 'parent':
        return (
          <PlayerDashboard
            playerId={entityId}
            navigation={navigation}
            showLineupWidget={showLineupWidget}
          />
        );
      case 'head_coach':
      case 'assistant_coach':
      case 'team_manager':
        return <CoachDashboard teamId={entityId} />;
      case 'club_admin':
        return <ClubAdminDashboard clubId={entityId} navigation={navigation} />;
      default:
        return <NoRoleDashboard navigation={navigation} />;
    }
  };

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.brandHeader}>
        <View style={styles.brandLeft}>
          <Text style={styles.brandText}>⚽ Thryvyng</Text>
        </View>
        <NotificationBell />
      </View>

      <View style={styles.roleSwitcherCard}>
        <RoleSwitcher embedded />
      </View>

      <View style={styles.dashboardContent}>
        {renderDashboard()}
      </View>

      <SurveyPopupModal navigation={navigation} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  dashboardContent: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 10,
    fontSize: 16,
  },
  brandHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: 'transparent',
  },
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#a78bfa',
  },
  notificationButton: {
    position: 'relative',
    padding: 8,
  },
  bellIcon: {
    fontSize: 24,
  },
  notificationBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  roleSwitcherCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
  },
  rolesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 8,
  },
  roleBadge: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  selectRoleContainer: {
    padding: 24,
    alignItems: 'center',
  },
  selectRoleText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  selectRoleHint: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
  section: {
    padding: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    marginTop: 12,
  },
  playerCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  playerCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  playerArrow: {
    color: '#666',
    fontSize: 24,
    marginLeft: 12,
  },
  teamName: {
    fontSize: 14,
    color: '#8b5cf6',
    marginTop: 4,
  },
  clubName: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  actionButton: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  adminButton: {
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  bottomPadding: {
    height: 24,
  },
});