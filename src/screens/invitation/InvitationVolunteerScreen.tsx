import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
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
  planId?: string;
  planName?: string;
  dueToday?: number;
}

interface RouteParams {
  token: string;
  packageId: string;
  selectedPlayers?: SelectedPlayer[];
  answers?: Record<string, any>;
}

export default function InvitationVolunteerScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { token, packageId, selectedPlayers: passedPlayers, answers = {} } = route.params as RouteParams;

  const { invitation, loading: invLoading } = useInvitation(token);

  const players = useMemo(() => {
    if (passedPlayers && passedPlayers.length > 0) {
      return passedPlayers;
    }
    if (invitation) {
      return [{
        placementId: invitation.placement?.id || '',
        playerId: invitation.player?.id || '',
        playerName: `${invitation.player?.first_name || ''} ${invitation.player?.last_name || ''}`.trim(),
        teamId: invitation.team?.id || '',
        teamName: invitation.team?.name || '',
        packageId: invitation.packages?.[0]?.id || packageId,
        packageName: invitation.packages?.[0]?.name || '',
        packagePrice: invitation.packages?.[0]?.price || 0,
      }];
    }
    return [];
  }, [passedPlayers, invitation, packageId]);

  const teamIds = useMemo(() => {
    return [...new Set(players.map(p => p.teamId).filter(Boolean))];
  }, [players]);

  const [allPositions, setAllPositions] = useState<any[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);

  useEffect(() => {
    const fetchPositions = async () => {
      if (teamIds.length === 0) {
        setPositionsLoading(false);
        return;
      }

      try {
        const programId = invitation?.assignment?.destination_program_id || invitation?.program?.id;
        if (programId) {
          const { data, error } = await supabase
            .from('volunteer_positions')
            .select('*')
            .eq('program_id', programId);

          if (!error && data) {
            const filtered = data.filter((p: any) => {
              const assigned = p.assigned_team_ids as string[] | null;
              if (!assigned || assigned.length === 0) return true;
              return assigned.some((tid: string) => teamIds.includes(tid));
            });
            setAllPositions(filtered);
          }
        } else {
          setAllPositions(invitation?.volunteer_positions || []);
        }
      } catch (err) {
        console.error('Error fetching positions:', err);
      }
      setPositionsLoading(false);
    };

    fetchPositions();
  }, [teamIds, invitation?.assignment?.destination_program_id, invitation?.program?.id, invitation?.volunteer_positions]);

  const teamPositions = useMemo(() => {
    const result: { teamId: string; teamName: string; playerName: string; positions: any[] }[] = [];
    const seenTeamIds = new Set<string>();

    players.forEach(player => {
      if (!player.teamId || seenTeamIds.has(player.teamId)) return;

      const positions = allPositions.filter((p: any) => {
        const assigned = p.assigned_team_ids as string[] | null;
        if (!assigned || assigned.length === 0) return true;
        return assigned.includes(player.teamId);
      });
      if (positions.length > 0) {
        seenTeamIds.add(player.teamId);
        const firstName = player.playerName.split(' ')[0] || 'Player';
        result.push({
          teamId: player.teamId,
          teamName: player.teamName,
          playerName: `${firstName}'s Team`,
          positions,
        });
      }
    });

    return result;
  }, [players, allPositions]);

  const steps = [
    { number: 1, label: 'Review', enabled: true },
    { number: 2, label: 'Questions', enabled: (invitation?.questions?.length || 0) > 0 },
    { number: 3, label: 'Payment', enabled: true },
    { number: 4, label: 'Volunteer', enabled: true },
    { number: 5, label: 'Donate', enabled: invitation?.program_settings?.donations_enabled || false },
    { number: 6, label: 'Aid', enabled: invitation?.program_settings?.financial_aid_enabled || false },
    { number: 7, label: 'Checkout', enabled: true },
  ];

  const togglePosition = (positionId: string) => {
    setSelectedPositions(prev =>
      prev.includes(positionId)
        ? prev.filter(id => id !== positionId)
        : [...prev, positionId]
    );
  };

  const totalDiscount = useMemo(() => {
    return allPositions
      .filter((p: any) => selectedPositions.includes(p.id))
      .reduce((sum: number, p: any) => sum + (p.discount_amount || 0), 0);
  }, [selectedPositions, allPositions]);

  const getNextStep = () => {
    if (invitation?.program_settings?.donations_enabled) return 'InvitationDonate';
    if (invitation?.program_settings?.financial_aid_enabled) return 'InvitationAid';
    return 'InvitationCheckout';
  };

  const handleContinue = () => {
    (navigation as any).navigate(getNextStep(), {
      token,
      packageId,
      selectedPlayers: players,
      answers,
      volunteerPositionIds: selectedPositions,
    });
  };

  const handleSkip = () => {
    (navigation as any).navigate(getNextStep(), {
      token,
      packageId,
      selectedPlayers: players,
      answers,
      volunteerPositionIds: [],
    });
  };

  if (invLoading || positionsLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ade80" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!invitation) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Unable to load invitation</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={{ color: '#4ade80', marginTop: 12 }}>Go Back</Text>
          </TouchableOpacity>
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
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Volunteer</Text>
          <Text style={styles.headerSub}>{invitation?.club?.name}</Text>
        </View>
        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <InvitationStepIndicator currentStep={4} steps={steps} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Info */}
        <View style={styles.infoBox}>
          <Ionicons name="hand-left" size={24} color="#4ade80" />
          <Text style={styles.infoTitle}>We Need Your Help!</Text>
          <Text style={styles.infoText}>
            Volunteer positions help our team run smoothly. Some positions include registration discounts.
          </Text>
        </View>

        {/* Volunteer Positions by Team */}
        {teamPositions.length > 0 ? (
          teamPositions.map(teamData => (
            <View key={teamData.teamId} style={styles.teamSection}>
              <View style={styles.teamHeader}>
                <Text style={styles.teamLabel}>{teamData.teamName}</Text>
                <Text style={styles.teamPlayerLabel}>({teamData.playerName})</Text>
              </View>

              {teamData.positions.map((position: any) => (
                <TouchableOpacity
                  key={position.id}
                  style={[
                    styles.positionCard,
                    selectedPositions.includes(position.id) && styles.positionCardSelected,
                  ]}
                  onPress={() => togglePosition(position.id)}
                >
                  <View style={styles.positionCheckbox}>
                    {selectedPositions.includes(position.id) && (
                      <Ionicons name="checkmark" size={16} color="#000" />
                    )}
                  </View>
                  <View style={styles.positionInfo}>
                    <Text style={styles.positionName}>{position.name}</Text>
                    {position.description ? (
                      <Text style={styles.positionDesc}>{position.description}</Text>
                    ) : null}
                    {position.max_volunteers ? (
                      <Text style={styles.positionSpots}>
                        {position.max_volunteers === 999 ? 'Unlimited' : position.max_volunteers} spots available
                      </Text>
                    ) : null}
                  </View>
                  {position.discount_amount && position.discount_amount > 0 ? (
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountText}>-${position.discount_amount}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          ))
        ) : (
          <Text style={styles.noPositions}>No volunteer positions available</Text>
        )}

        {/* Discount Summary */}
        {totalDiscount > 0 && (
          <View style={styles.discountSummary}>
            <Ionicons name="pricetag" size={18} color="#4ade80" />
            <Text style={styles.discountSummaryText}>
              You'll save ${totalDiscount.toFixed(2)} by volunteering!
            </Text>
          </View>
        )}

        {/* Optional Note */}
        <Text style={styles.optionalNote}>
          Volunteering is optional. You can skip this step if you prefer.
        </Text>
      </ScrollView>

      {/* Bottom */}
      <View style={styles.bottom}>
        <TouchableOpacity style={styles.continueBtn} onPress={handleContinue}>
          <Text style={styles.continueBtnText}>
            {selectedPositions.length > 0 ? 'Continue' : 'Skip & Continue'}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#000" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  headerSub: {
    color: '#888',
    fontSize: 12,
  },
  skipBtn: {
    padding: 4,
  },
  skipText: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  infoBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  infoTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  infoText: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
  },
  teamSection: {
    marginBottom: 20,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  teamLabel: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  teamPlayerLabel: {
    color: '#888',
    fontSize: 12,
  },
  positionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  positionCardSelected: {
    borderColor: '#4ade80',
    backgroundColor: 'rgba(74, 222, 128, 0.05)',
  },
  positionCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#444',
    backgroundColor: '#4ade80',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  positionInfo: {
    flex: 1,
  },
  positionName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  positionDesc: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  positionSpots: {
    color: '#666',
    fontSize: 11,
    marginTop: 4,
  },
  discountBadge: {
    backgroundColor: '#4ade80',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  discountText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  noPositions: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 20,
  },
  discountSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  discountSummaryText: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '500',
  },
  optionalNote: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
  },
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
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  continueBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});

