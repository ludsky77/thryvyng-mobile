import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
  Image,
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface ClubAdminDashboardProps {
  clubId: string | null;
  navigation: any;
}

interface Club {
  id: string;
  name: string;
  available_balance?: number | null;
  lifetime_earned?: number | null;
  logo_url?: string | null;
}

interface Team {
  id: string;
  name: string;
  status: string | null;
  available_balance?: number | null;
  manager_name?: string | null;
}

export default function ClubAdminDashboard({
  clubId,
  navigation,
}: ClubAdminDashboardProps) {
  const [club, setClub] = useState<Club | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!clubId) {
      setLoading(false);
      return;
    }

    try {
      const { data: clubData, error: clubError } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
        .single();

      if (clubError || !clubData) throw new Error('Club not found');
      setClub(clubData as Club);

      const { data: teamsData } = await supabase
        .from('teams')
        .select('id, name, status')
        .eq('club_id', clubId)
        .order('name', { ascending: true });

      const teamsList = (teamsData || []) as Team[];

      for (const team of teamsList) {
        const { data: staffList } = await supabase
          .from('team_staff')
          .select('user_id')
          .eq('team_id', team.id)
          .or('staff_role.eq.team_manager,staff_role.eq.head_coach')
          .limit(1);

        const firstStaff = Array.isArray(staffList) ? staffList[0] : staffList;

        let managerName: string | null = null;
        if (firstStaff?.user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', firstStaff.user_id)
            .single();
          managerName = (profile as any)?.full_name ?? null;
        }
        (team as any).manager_name = managerName;
      }

      setTeams(teamsList);
    } catch (err) {
      console.error('Error fetching club dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pendingTeams = teams.filter((t) => t.status === 'pending');
  const approvedTeams = teams.filter((t) => t.status === 'approved');
  const pendingPayouts = 0;
  const registrationUrl = clubId
    ? `https://thryvyng.com/team-register?club_id=${clubId}`
    : 'https://thryvyng.com/team-register';

  const handleApproveTeam = async (teamId: string) => {
    try {
      const { error } = await supabase
        .from('teams')
        .update({ status: 'approved' })
        .eq('id', teamId);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to approve team');
    }
  };

  const handleShareRegistration = async () => {
    try {
      await Share.share({
        message: `Register your team on Thryvyng: ${registrationUrl}`,
        url: registrationUrl,
        title: 'Team Registration',
      });
    } catch (err: any) {
      if (err.message !== 'User did not share') {
        Alert.alert('Link', registrationUrl);
      }
    }
  };

  const handleCopyLink = async () => {
    try {
      await Share.share({
        message: registrationUrl,
        title: 'Copy Link',
      });
    } catch (err: any) {
      Alert.alert('Link', registrationUrl);
    }
  };

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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {club.logo_url ? (
            <Image source={{ uri: club.logo_url }} style={styles.clubLogo} />
          ) : (
            <View style={styles.clubLogoPlaceholder}>
              <Text style={styles.clubLogoText}>
                {club.name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.clubName}>{club.name}</Text>
            <Text style={styles.clubSubtitle}>Club Admin Dashboard</Text>
          </View>
        </View>
      </View>

      {/* 💰 FINANCES */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💰 FINANCES</Text>
        <View style={styles.financeRow}>
          <View style={styles.financeBox}>
            <Text style={styles.financeValue}>
              ${(club.available_balance ?? 0).toFixed(2)}
            </Text>
            <Text style={styles.financeLabel}>Balance</Text>
          </View>
          <View style={styles.financeBox}>
            <Text style={styles.financeValue}>
              ${pendingPayouts.toFixed(2)}
            </Text>
            <Text style={styles.financeLabel}>Payouts Pending</Text>
          </View>
          <View style={styles.financeBox}>
            <Text style={styles.financeValue}>
              ${(club.lifetime_earned ?? 0).toFixed(2)}
            </Text>
            <Text style={styles.financeLabel}>Lifetime Earned</Text>
          </View>
        </View>
      </View>

      {/* ✅ TEAM APPROVALS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>✅ TEAM APPROVALS</Text>
        {pendingTeams.length === 0 ? (
          <Text style={styles.emptyText}>No pending team approvals</Text>
        ) : (
          pendingTeams.map((team) => (
            <View key={team.id} style={styles.approvalCard}>
              <View style={styles.approvalInfo}>
                <Text style={styles.teamName}>{team.name}</Text>
                <Text style={styles.managerName}>
                  Manager: {team.manager_name || '—'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.approveButton}
                onPress={() => handleApproveTeam(team.id)}
              >
                <Text style={styles.approveText}>Approve</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* 🏟️ TEAMS */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>
            🏟️ TEAMS
          </Text>
          {approvedTeams.length > 0 && (
            <TouchableOpacity
              onPress={() =>
                navigation.getParent()?.getParent()?.navigate('TeamsTab')
              }
            >
              <Text style={styles.viewAll}>View All →</Text>
            </TouchableOpacity>
          )}
        </View>
        {approvedTeams.length === 0 ? (
          <Text style={styles.emptyText}>No approved teams yet</Text>
        ) : (
          approvedTeams.slice(0, 5).map((team) => (
            <TouchableOpacity
              key={team.id}
              style={styles.teamCard}
              onPress={() =>
                navigation.getParent()?.getParent()?.navigate('TeamsTab', {
                  screen: 'Roster',
                  params: {
                    team_id: team.id,
                    teamId: team.id,
                    teamName: team.name,
                  },
                })
              }
            >
              <Text style={styles.teamName}>{team.name}</Text>
              <Text style={styles.teamBalance}>Available: $0.00</Text>
              <Text style={styles.teamArrow}>›</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* 🔗 TEAM REGISTRATION LINK */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔗 TEAM REGISTRATION LINK</Text>
        <View style={styles.registrationCard}>
          <Text style={styles.registrationDescription}>
            Share with team managers to register
          </Text>
          <Text style={styles.registrationLink} numberOfLines={1}>
            {registrationUrl}
          </Text>
          <View style={styles.registrationButtons}>
            <TouchableOpacity
              style={styles.copyButton}
              onPress={handleCopyLink}
            >
              <Text style={styles.copyButtonText}>📋 Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShareRegistration}
            >
              <Text style={styles.shareButtonText}>📤 Share</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#2a2a4e',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clubLogo: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginRight: 16,
  },
  clubLogoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  clubLogoText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  headerInfo: {
    flex: 1,
  },
  clubName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  clubSubtitle: {
    color: '#a78bfa',
    fontSize: 14,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 1,
    marginBottom: 12,
  },
  sectionTitleInline: {
    marginBottom: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  viewAll: {
    color: '#a78bfa',
    fontSize: 14,
    fontWeight: '600',
  },
  financeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  financeBox: {
    flex: 1,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    padding: 14,
    borderRadius: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  financeValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  financeLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
    textAlign: 'center',
  },
  approvalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  approvalInfo: {
    flex: 1,
  },
  managerName: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
  approveButton: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  approveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  teamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  teamName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  teamBalance: {
    color: '#888',
    fontSize: 13,
    marginRight: 8,
  },
  teamArrow: {
    color: '#666',
    fontSize: 20,
  },
  registrationCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
  },
  registrationDescription: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  registrationLink: {
    color: '#a78bfa',
    fontSize: 12,
    marginBottom: 12,
  },
  registrationButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  copyButton: {
    flex: 1,
    backgroundColor: '#3a3a6e',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  shareButton: {
    flex: 1,
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 40,
  },
});
