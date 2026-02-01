import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface ClubAdminDashboardProps {
  clubId: string | null;
  navigation: any;
}

interface Club {
  id: string;
  name: string;
  available_balance: number | null;
  lifetime_earned: number | null;
}

interface Team {
  id: string;
  name: string;
  status: string | null;
}

export default function ClubAdminDashboard({
  clubId,
  navigation,
}: ClubAdminDashboardProps) {
  const [club, setClub] = useState<Club | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!clubId) {
      setLoading(false);
      return;
    }

    try {
      const { data: clubData, error: clubError } = await supabase
        .from('clubs')
        .select('id, name, available_balance, lifetime_earned')
        .eq('id', clubId)
        .single();

      if (clubError || !clubData) throw new Error('Club not found');
      setClub(clubData as Club);

      const { data: teamsData } = await supabase
        .from('teams')
        .select('id, name, status')
        .eq('club_id', clubId)
        .order('name', { ascending: true });

      setTeams((teamsData || []) as Team[]);

      const { count } = await supabase
        .from('teams')
        .select('*', { count: 'exact', head: true })
        .eq('club_id', clubId)
        .eq('status', 'pending');

      setPendingCount(count || 0);
    } catch (err) {
      console.error('Error fetching club dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  if (!club) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Club not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.clubLogoPlaceholder}>
          <Text style={styles.clubLogoText}>
            {club.name.slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.clubName}>{club.name}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>
            ${(club.available_balance ?? 0).toFixed(0)}
          </Text>
          <Text style={styles.statLabel}>Club Balance</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>
            ${(club.lifetime_earned ?? 0).toFixed(0)}
          </Text>
          <Text style={styles.statLabel}>Lifetime</Text>
        </View>
      </View>

      {pendingCount > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Team Approvals</Text>
          <View style={styles.pendingBanner}>
            <Text style={styles.pendingText}>
              {pendingCount} team(s) pending approval
            </Text>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Teams</Text>
        {teams.length === 0 ? (
          <Text style={styles.emptyText}>No teams yet</Text>
        ) : (
          teams.map((team) => (
            <TouchableOpacity
              key={team.id}
              style={styles.teamCard}
              onPress={() =>
                navigation.getParent()?.getParent()?.navigate('TeamsTab', {
                  screen: 'Roster',
                  params: { team_id: team.id },
                })
              }
            >
              <View style={styles.teamInfo}>
                <Text style={styles.teamName}>{team.name}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    team.status === 'approved'
                      ? styles.statusApproved
                      : styles.statusPending,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {team.status === 'approved' ? 'Approved' : 'Pending'}
                  </Text>
                </View>
              </View>
              <Text style={styles.teamArrow}>›</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() =>
            navigation.getParent()?.getParent()?.navigate('TeamsTab')
          }
        >
          <Text style={styles.actionButtonText}>👥 Manage Teams</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>📊 Revenue Reports</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#2a2a4e',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  clubLogo: {
    width: 80,
    height: 80,
    borderRadius: 16,
    marginBottom: 12,
  },
  clubLogoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  clubLogoText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  clubName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: -20,
    backgroundColor: '#2a2a4e',
    borderRadius: 16,
    padding: 16,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    color: '#888',
    fontSize: 11,
    marginTop: 4,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  pendingBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    padding: 14,
    borderRadius: 12,
  },
  pendingText: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
  },
  teamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusApproved: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  statusPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  teamArrow: {
    color: '#666',
    fontSize: 20,
  },
  quickActions: {
    padding: 16,
  },
  actionButton: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
  },
  bottomPadding: {
    height: 40,
  },
});
