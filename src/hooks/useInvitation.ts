import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type {
  InvitationData,
  InvitationPackage,
  ProgramQuestion,
  VolunteerPosition,
} from '../types/invitation';

interface UseInvitationResult {
  invitation: InvitationData | null;
  loading: boolean;
  error: string | null;
  isExpired: boolean;
  isAlreadyResponded: boolean;
  refetch: () => Promise<void>;
}

export function useInvitation(token: string): UseInvitationResult {
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvitation = async () => {
    if (!token) {
      setError('No invitation token provided');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: placement, error: placementError } = await supabase
        .from('player_placements')
        .select('*')
        .eq('invitation_token', token)
        .single();

      if (placementError || !placement) {
        setError('Invitation not found');
        setLoading(false);
        return;
      }

      // 2. Fetch player separately
      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('id, first_name, last_name, date_of_birth, photo_url, parent_email')
        .eq('id', placement.player_id)
        .single();

      if (playerError || !player) {
        setError(playerError?.message ?? 'Player not found');
        setLoading(false);
        return;
      }

      // 3. Fetch team only when placement has assigned_team_id
      let team: { id: string; name: string; age_group: string | null; gender: string | null; club_id: string } | null = null;
      if (placement.assigned_team_id) {
        const result = await supabase
          .from('teams')
          .select('id, name, age_group, gender, club_id')
          .eq('id', placement.assigned_team_id)
          .single();
        team = result.data;
      }

      // 4. Fetch club only when team has club_id
      let club: { id: string; name: string; logo_url: string | null } | null = null;
      if (team?.club_id) {
        const result = await supabase
          .from('clubs')
          .select('id, name, logo_url')
          .eq('id', team.club_id)
          .single();
        club = result.data;
      }

      // 5. Fetch assignment separately
      const { data: assignment, error: assignmentError } = await supabase
        .from('team_assignments')
        .select('id, name, destination_program_id, invitation_deadline')
        .eq('id', placement.team_assignment_id)
        .single();

      if (!assignment?.destination_program_id) {
        setError('Assignment or program missing');
        setLoading(false);
        return;
      }
      // #endregion

      // Parallel fetch: program, team package links, questions, volunteers
      const [programRes, teamPkgRes, questionsRes, volunteersRes] = await Promise.all([
        supabase
          .from('programs')
          .select('id, name, description')
          .eq('id', assignment.destination_program_id)
          .single(),
        supabase
          .from('package_team_assignments')
          .select('package_id')
          .eq('team_id', placement.assigned_team_id),
        supabase
          .from('program_questions')
          .select('*')
          .eq('program_id', assignment.destination_program_id)
          .order('sort_order'),
        supabase
          .from('volunteer_positions')
          .select('*')
          .eq('program_id', assignment.destination_program_id),
      ]);

      const program = programRes.data;
      const teamPackageLinks = teamPkgRes.data;
      const questions = questionsRes.data;
      const volunteerPositions = volunteersRes.data;

      const packageIds = teamPackageLinks?.map((tp: { package_id: string }) => tp.package_id) || [];

      // Fetch packages and ALL payment plans in parallel
      let packages: InvitationPackage[] = [];
      if (packageIds.length > 0) {
        const [packagesRes, plansRes] = await Promise.all([
          supabase
            .from('packages')
            .select('id, program_id, name, description, price, is_active, sort_order')
            .eq('program_id', assignment.destination_program_id)
            .eq('is_active', true)
            .in('id', packageIds)
            .order('sort_order'),
          supabase
            .from('payment_plan_options')
            .select('*')
            .in('package_id', packageIds)
            .eq('is_active', true)
            .order('sort_order'),
        ]);

        const packagesData = packagesRes.data || [];
        const allPlans = plansRes.data || [];

        packages = packagesData.map((pkg: any) => ({
          ...pkg,
          payment_plans: allPlans.filter((plan: any) => plan.package_id === pkg.id),
        }));
      }

      const rawQuestions = (questions || []) as (ProgramQuestion & { applies_to_teams?: string[] })[];
      const filteredQuestions = rawQuestions.filter((q) => {
        if (!q.applies_to_teams || q.applies_to_teams.length === 0) return true;
        return q.applies_to_teams.includes(placement.assigned_team_id);
      });

      const rawVolunteers = (volunteerPositions || []) as (VolunteerPosition & { assigned_team_ids?: string[] })[];
      const filteredVolunteers = rawVolunteers.filter((v) => {
        if (!v.assigned_team_ids || v.assigned_team_ids.length === 0) return true;
        return v.assigned_team_ids.includes(placement.assigned_team_id);
      });

      const programSettings = {
        donations_enabled: true,
        financial_aid_enabled: true,
        min_donation_amount: 5,
        donation_presets: [25, 50, 100],
      };

      setInvitation({
        placement,
        player: player || { id: '', first_name: '', last_name: '', date_of_birth: null, photo_url: null, parent_email: '' },
        team: team ? { id: team.id, name: team.name, age_group: team.age_group, gender: team.gender } : { id: '', name: '', age_group: null, gender: null },
        club: club || { id: '', name: '', logo_url: null },
        assignment: assignment || { id: '', name: '', destination_program_id: '', invitation_deadline: null },
        program: program || { id: '', name: '', description: null },
        packages,
        questions: filteredQuestions,
        volunteer_positions: filteredVolunteers,
        program_settings: programSettings,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load invitation');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvitation();
  }, [token]);

  const isExpired = invitation?.placement.invitation_expires_at
    ? new Date(invitation.placement.invitation_expires_at) < new Date()
    : false;

  const isAlreadyResponded = invitation?.placement.status
    ? ['accepted', 'declined', 'rostered'].includes(invitation.placement.status)
    : false;

  return {
    invitation,
    loading,
    error,
    isExpired,
    isAlreadyResponded,
    refetch: fetchInvitation,
  };
}
