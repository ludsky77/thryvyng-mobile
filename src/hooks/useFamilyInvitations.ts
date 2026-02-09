import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type {
  InvitationData,
  InvitationPackage,
  FamilyInvitationState,
  ProgramQuestion,
  VolunteerPosition,
} from '../types/invitation';

interface UseFamilyInvitationsResult {
  invitations: InvitationData[];
  loading: boolean;
  error: string | null;
  state: FamilyInvitationState;
  updateSelection: (
    placementId: string,
    updates: Partial<FamilyInvitationState['selections'][string]>
  ) => void;
  setDonationAmount: (amount: number | null) => void;
  setFinancialAidRequested: (requested: boolean) => void;
  setFamilyQuestionAnswer: (questionId: string, answer: unknown) => void;
  calculateTotals: () => {
    subtotal: number;
    siblingDiscount: number;
    volunteerDiscount: number;
    total: number;
    dueToday: number;
  };
  refetch: () => Promise<void>;
}

export function useFamilyInvitations(
  parentEmail: string,
  token?: string
): UseFamilyInvitationsResult {
  const [invitations, setInvitations] = useState<InvitationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<FamilyInvitationState>({
    invitations: [],
    selections: {},
    familyQuestionAnswers: {},
    donationAmount: null,
    financialAidRequested: false,
  });

  const fetchFamilyInvitations = async () => {
    let emailToUse = parentEmail;

    // If no parentEmail but we have a token, fetch the email from the token
    if (!emailToUse && token) {
      try {
        const { data: placement } = await supabase
          .from('player_placements')
          .select('player_id')
          .eq('invitation_token', token)
          .single();

        if (placement?.player_id) {
          const { data: player } = await supabase
            .from('players')
            .select('parent_email')
            .eq('id', placement.player_id)
            .single();

          emailToUse = player?.parent_email || '';
        }
      } catch (err) {
        console.error('Error fetching parent email from token:', err);
      }
    }

    if (!emailToUse) {
      // No error - just no data yet, stay in loading state if token provided
      if (!token) {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: players } = await supabase
        .from('players')
        .select('id')
        .eq('parent_email', emailToUse);

      if (!players || players.length === 0) {
        setInvitations([]);
        setLoading(false);
        return;
      }

      const playerIds = players.map((p) => p.id);

      const { data: placements } = await supabase
        .from('player_placements')
        .select(
          `
          *,
          player:players!player_placements_player_id_fkey (
            id, first_name, last_name, date_of_birth, photo_url, parent_email
          ),
          team:teams!player_placements_assigned_team_id_fkey (
            id, name, age_group, gender,
            club:clubs (id, name, logo_url)
          ),
          assignment:team_assignments!player_placements_team_assignment_id_fkey (
            id, name, destination_program_id, invitation_deadline
          )
        `
        )
        .in('player_id', playerIds)
        .eq('status', 'invited');

      if (!placements || placements.length === 0) {
        setInvitations([]);
        setLoading(false);
        return;
      }

      const fullInvitations: InvitationData[] = [];

      for (const placement of placements) {
        const assignment = placement.assignment as {
          id: string;
          name: string;
          destination_program_id: string;
          invitation_deadline: string | null;
        };
        const team = placement.team as {
          id: string;
          name: string;
          age_group: string | null;
          gender: string | null;
          club: { id: string; name: string; logo_url: string | null };
        };

        const { data: program } = await supabase
          .from('programs')
          .select('id, name, description')
          .eq('id', assignment.destination_program_id)
          .single();

        const { data: teamPackageLinks } = await supabase
          .from('package_team_assignments')
          .select('package_id')
          .eq('team_id', placement.assigned_team_id);

        const packageIds =
          teamPackageLinks?.map((tp: { package_id: string }) => tp.package_id) || [];

        const packages: InvitationPackage[] = [];
        if (packageIds.length > 0) {
          const { data: packagesData } = await supabase
            .from('packages')
            .select('*')
            .eq('program_id', assignment.destination_program_id)
            .eq('is_active', true)
            .in('id', packageIds)
            .order('sort_order');

          for (const pkg of packagesData || []) {
            const { data: plans } = await supabase
              .from('payment_plan_options')
              .select('*')
              .eq('package_id', pkg.id)
              .eq('is_active', true)
              .order('sort_order');

            packages.push({ ...pkg, payment_plans: plans || [] });
          }
        }

        const { data: questions } = await supabase
          .from('program_questions')
          .select('*')
          .eq('program_id', assignment.destination_program_id)
          .order('sort_order');

        const rawQuestions = (questions || []) as (ProgramQuestion & { applies_to_teams?: string[] })[];
        const filteredQuestions = rawQuestions.filter((q) => {
          if (!q.applies_to_teams || q.applies_to_teams.length === 0) return true;
          return q.applies_to_teams.includes(placement.assigned_team_id);
        });

        const { data: volunteerPositions } = await supabase
          .from('volunteer_positions')
          .select('*')
          .eq('program_id', assignment.destination_program_id);

        const rawVolunteers = (volunteerPositions || []) as (VolunteerPosition & { assigned_team_ids?: string[] })[];
        const filteredVolunteers = rawVolunteers.filter((v) => {
          if (!v.assigned_team_ids || v.assigned_team_ids.length === 0) return true;
          return v.assigned_team_ids.includes(placement.assigned_team_id);
        });

        fullInvitations.push({
          placement,
          player: placement.player,
          team: { id: team.id, name: team.name, age_group: team.age_group, gender: team.gender },
          club: team.club,
          assignment,
          program: program || { id: '', name: '', description: null },
          packages,
          questions: filteredQuestions,
          volunteer_positions: filteredVolunteers,
          program_settings: {
            donations_enabled: true,
            financial_aid_enabled: true,
            min_donation_amount: 5,
            donation_presets: [25, 50, 100],
          },
        });
      }

      setInvitations(fullInvitations);

      const initialSelections: FamilyInvitationState['selections'] = {};
      for (const inv of fullInvitations) {
        const defaultPackage = inv.packages[0];
        const defaultPlan =
          defaultPackage?.payment_plans.find((p) => p.is_default) ||
          defaultPackage?.payment_plans[0];

        initialSelections[inv.placement.id] = {
          selected: true,
          packageId: defaultPackage?.id || null,
          paymentPlanId: defaultPlan?.id || null,
          questionAnswers: {},
          volunteerPositionIds: [],
        };
      }

      setState((prev) => ({
        ...prev,
        invitations: fullInvitations,
        selections: initialSelections,
      }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load invitations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFamilyInvitations();
  }, [parentEmail, token]);

  const updateSelection = (
    placementId: string,
    updates: Partial<FamilyInvitationState['selections'][string]>
  ) => {
    setState((prev) => ({
      ...prev,
      selections: {
        ...prev.selections,
        [placementId]: {
          ...prev.selections[placementId],
          ...updates,
        },
      },
    }));
  };

  const setDonationAmount = (amount: number | null) => {
    setState((prev) => ({ ...prev, donationAmount: amount }));
  };

  const setFinancialAidRequested = (requested: boolean) => {
    setState((prev) => ({ ...prev, financialAidRequested: requested }));
  };

  const setFamilyQuestionAnswer = (questionId: string, answer: unknown) => {
    setState((prev) => ({
      ...prev,
      familyQuestionAnswers: {
        ...prev.familyQuestionAnswers,
        [questionId]: answer,
      },
    }));
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let dueToday = 0;

    const selectedPlacements = Object.entries(state.selections).filter(
      ([, sel]) => sel.selected && sel.packageId && sel.paymentPlanId
    );

    for (const [placementId, selection] of selectedPlacements) {
      const invitation = invitations.find((i) => i.placement.id === placementId);
      if (!invitation) continue;

      const pkg = invitation.packages.find((p) => p.id === selection.packageId);
      if (!pkg) continue;

      const plan = pkg.payment_plans.find((p) => p.id === selection.paymentPlanId);
      if (!plan) continue;

      subtotal += plan.total_amount;

      if (plan.initial_payment_amount) {
        dueToday += plan.initial_payment_amount;
      } else if (plan.num_installments === 0 || plan.num_installments === 1) {
        dueToday += plan.total_amount;
      }
    }

    const siblingDiscount = selectedPlacements.length > 1 ? 25 : 0;

    let volunteerDiscount = 0;
    for (const [placementId, selection] of selectedPlacements) {
      const invitation = invitations.find((i) => i.placement.id === placementId);
      if (!invitation) continue;

      for (const posId of selection.volunteerPositionIds) {
        const position = invitation.volunteer_positions.find((v) => v.id === posId);
        if (position?.discount_amount) {
          volunteerDiscount += position.discount_amount;
        }
      }
    }

    const total =
      subtotal -
      siblingDiscount -
      volunteerDiscount +
      (state.donationAmount || 0);

    return {
      subtotal,
      siblingDiscount,
      volunteerDiscount,
      total,
      dueToday:
        dueToday -
        siblingDiscount -
        volunteerDiscount +
        (state.donationAmount || 0),
    };
  };

  return {
    invitations,
    loading,
    error,
    state,
    updateSelection,
    setDonationAmount,
    setFinancialAidRequested,
    setFamilyQuestionAnswer,
    calculateTotals,
    refetch: fetchFamilyInvitations,
  };
}
