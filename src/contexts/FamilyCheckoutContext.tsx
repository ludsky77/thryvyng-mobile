import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Types
export interface PlayerSelection {
  placementId: string;
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  token: string;
  selected: boolean;
  packageId: string | null;
  packageName: string | null;
  packagePrice: number;
  paymentPlanId: string | null;
  paymentPlanName: string | null;
  dueToday: number;
  answers: Record<string, any>;
}

interface FamilyCheckoutState {
  // Players
  players: PlayerSelection[];
  primaryToken: string | null;

  // Shared data
  programId: string | null;
  clubId: string | null;
  clubName: string | null;

  // Questions & volunteers from program
  questions: any[];
  volunteerPositions: any[];

  // Program settings
  programSettings: {
    donations_enabled: boolean;
    financial_aid_enabled: boolean;
  };

  // Family-level selections
  volunteerPositionIds: string[];
  donationAmount: number | null;
  financialAidRequested: boolean;
  financialAidReason: string | null;

  // Loading state
  loading: boolean;
  error: string | null;
}

export interface FamilyCheckoutContextType extends FamilyCheckoutState {
  // Actions
  initializeFromToken: (token: string) => Promise<void>;
  togglePlayerSelection: (placementId: string) => void;
  updatePlayerPackage: (
    placementId: string,
    packageId: string,
    packageName: string,
    price: number,
  ) => void;
  updatePlayerPlan: (
    placementId: string,
    planId: string,
    planName: string,
    dueToday: number,
  ) => void;
  updatePlayerAnswers: (placementId: string, answers: Record<string, any>) => void;
  setVolunteerPositions: (ids: string[]) => void;
  setDonation: (amount: number | null) => void;
  setFinancialAid: (requested: boolean, reason: string | null) => void;

  // Computed
  selectedPlayers: PlayerSelection[];
  totalSubtotal: number;
  totalDueToday: number;
  siblingDiscount: number;
}

const FamilyCheckoutContext = createContext<FamilyCheckoutContextType | null>(null);

export function FamilyCheckoutProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FamilyCheckoutState>({
    players: [],
    primaryToken: null,
    programId: null,
    clubId: null,
    clubName: null,
    questions: [],
    volunteerPositions: [],
    programSettings: {
      donations_enabled: true,
      financial_aid_enabled: true,
    },
    volunteerPositionIds: [],
    donationAmount: null,
    financialAidRequested: false,
    financialAidReason: null,
    loading: false,
    error: null,
  });

  const initializeFromToken = useCallback(async (token: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null, primaryToken: token }));

    try {
      console.log('=== FAMILY CHECKOUT INIT ===');
      console.log('Token:', token);

      // 1. Get primary placement - SIMPLIFIED QUERY (no joins)
      const { data: primaryPlacement, error: placementError } = await supabase
        .from('player_placements')
        .select('*')
        .eq('invitation_token', token)
        .single();

      console.log('Placement result:', { primaryPlacement, placementError });

      if (placementError || !primaryPlacement) {
        console.error('Placement error:', placementError);
        throw new Error('Invitation not found');
      }

      // 2. Get player separately
      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('id, first_name, last_name, parent_email')
        .eq('id', primaryPlacement.player_id)
        .single();

      console.log('Player result:', { player, playerError });

      if (playerError || !player) {
        throw new Error('Player not found');
      }

      // 3. Get team separately
      let team: { id: string; name: string; club_id: string } | null = null;
      if (primaryPlacement.assigned_team_id) {
        const { data: teamData, error: teamError } = await supabase
          .from('teams')
          .select('id, name, club_id')
          .eq('id', primaryPlacement.assigned_team_id)
          .single();

        console.log('Team result:', { team: teamData, teamError });
        team = teamData;
      }

      const parentEmail = player.parent_email;
      const clubId = team?.club_id;
      if (!clubId) {
        throw new Error('Team or club not found');
      }

      // 4. Get club info
      const { data: club } = await supabase
        .from('clubs')
        .select('id, name')
        .eq('id', clubId)
        .single();

      // 5. Get assignment and program info
      const { data: assignment } = await supabase
        .from('team_assignments')
        .select('id, destination_program_id')
        .eq('id', primaryPlacement.team_assignment_id)
        .single();

      if (!assignment?.destination_program_id) {
        throw new Error('Program not found');
      }

      const programId = assignment.destination_program_id;

      // 4. Get ALL family placements (same parent email, pending status)
      const { data: familyPlayers } = await supabase
        .from('players')
        .select('id')
        .eq('parent_email', parentEmail);

      const playerIds = (familyPlayers || []).map((p) => p.id);
      if (playerIds.length === 0) {
        throw new Error('No family players found');
      }

      const { data: familyPlacements } = await supabase
        .from('player_placements')
        .select(
          `
          id,
          invitation_token,
          player_id,
          assigned_team_id,
          status,
          players!inner (id, first_name, last_name, parent_email),
          teams!inner (id, name, club_id)
        `,
        )
        .in('player_id', playerIds)
        .eq('status', 'pending');

      // 5. Get program questions and volunteers
      const [questionsRes, volunteersRes] = await Promise.all([
        supabase
          .from('program_questions')
          .select('*')
          .eq('program_id', programId)
          .order('sort_order'),
        supabase.from('volunteer_positions').select('*').eq('program_id', programId),
      ]);

      // 6. Get packages for each team
      const placementsList = familyPlacements || [];
      const teamIds = [...new Set(placementsList.map((p) => p.assigned_team_id))];
      const { data: teamPackages } = await supabase
        .from('package_team_assignments')
        .select(
          `
          team_id,
          package_id,
          packages!inner (id, name, price, is_active)
        `,
        )
        .in('team_id', teamIds);

      const teamPackagesList = (teamPackages || []).filter(
        (tp: any) => tp.packages?.is_active !== false,
      );

      // 7. Build player selections
      const players: PlayerSelection[] = placementsList.map((placement) => {
        const player = placement.players as any;
        const team = placement.teams as any;
        const isPrimary = placement.invitation_token === token;

        const teamPkg = teamPackagesList.find(
          (tp: any) => tp.team_id === placement.assigned_team_id,
        );
        const pkg = teamPkg?.packages as any;

        return {
          placementId: placement.id,
          playerId: player.id,
          playerName: `${player.first_name} ${player.last_name}`,
          teamId: team.id,
          teamName: team.name,
          token: placement.invitation_token || '',
          selected: isPrimary,
          packageId: pkg?.id || null,
          packageName: pkg?.name || null,
          packagePrice: pkg?.price || 0,
          paymentPlanId: null,
          paymentPlanName: null,
          dueToday: pkg?.price || 0,
          answers: {},
        };
      });

      setState((prev) => ({
        ...prev,
        players,
        programId,
        clubId,
        clubName: club?.name || '',
        questions: questionsRes.data || [],
        volunteerPositions: volunteersRes.data || [],
        loading: false,
      }));
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'Failed to load invitation',
      }));
    }
  }, []);

  const togglePlayerSelection = useCallback((placementId: string) => {
    setState((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.placementId === placementId ? { ...p, selected: !p.selected } : p,
      ),
    }));
  }, []);

  const updatePlayerPackage = useCallback(
    (placementId: string, packageId: string, packageName: string, price: number) => {
      setState((prev) => ({
        ...prev,
        players: prev.players.map((p) =>
          p.placementId === placementId
            ? { ...p, packageId, packageName, packagePrice: price, dueToday: price }
            : p,
        ),
      }));
    },
    [],
  );

  const updatePlayerPlan = useCallback(
    (placementId: string, planId: string, planName: string, dueToday: number) => {
      setState((prev) => ({
        ...prev,
        players: prev.players.map((p) =>
          p.placementId === placementId
            ? { ...p, paymentPlanId: planId, paymentPlanName: planName, dueToday }
            : p,
        ),
      }));
    },
    [],
  );

  const updatePlayerAnswers = useCallback(
    (placementId: string, answers: Record<string, any>) => {
      setState((prev) => ({
        ...prev,
        players: prev.players.map((p) =>
          p.placementId === placementId
            ? { ...p, answers: { ...p.answers, ...answers } }
            : p,
        ),
      }));
    },
    [],
  );

  const setVolunteerPositions = useCallback((ids: string[]) => {
    setState((prev) => ({ ...prev, volunteerPositionIds: ids }));
  }, []);

  const setDonation = useCallback((amount: number | null) => {
    setState((prev) => ({ ...prev, donationAmount: amount }));
  }, []);

  const setFinancialAid = useCallback((requested: boolean, reason: string | null) => {
    setState((prev) => ({
      ...prev,
      financialAidRequested: requested,
      financialAidReason: reason,
    }));
  }, []);

  // Computed values
  const selectedPlayers = state.players.filter((p) => p.selected);
  const totalSubtotal = selectedPlayers.reduce((sum, p) => sum + p.packagePrice, 0);
  const siblingDiscount = selectedPlayers.length >= 2 ? 25 : 0;
  const totalDueToday =
    selectedPlayers.reduce((sum, p) => sum + p.dueToday, 0) - siblingDiscount;

  const value: FamilyCheckoutContextType = {
    ...state,
    initializeFromToken,
    togglePlayerSelection,
    updatePlayerPackage,
    updatePlayerPlan,
    updatePlayerAnswers,
    setVolunteerPositions,
    setDonation,
    setFinancialAid,
    selectedPlayers,
    totalSubtotal,
    totalDueToday,
    siblingDiscount,
  };

  return (
    <FamilyCheckoutContext.Provider value={value}>
      {children}
    </FamilyCheckoutContext.Provider>
  );
}

export function useFamilyCheckout() {
  const context = useContext(FamilyCheckoutContext);
  if (!context) {
    throw new Error('useFamilyCheckout must be used within FamilyCheckoutProvider');
  }
  return context;
}
