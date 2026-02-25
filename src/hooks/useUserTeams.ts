import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface UserTeam {
  id: string;
  name: string;
  age_group: string | null;
  gender: string | null;
  club_id: string | null;
  club_name: string | null;
  access_type: 'staff' | 'parent'; // How user accesses this team
  staff_role?: string; // head_coach, assistant_coach, team_manager
  player_id?: string; // If parent, which player
  player_name?: string; // If parent, player's name
  color?: string; // For visual distinction
}

// Team colors for "All Teams" view
const TEAM_COLORS = [
  '#8b5cf6', // Purple
  '#10b981', // Green
  '#f59e0b', // Orange
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#f97316', // Orange
];

export function useUserTeams() {
  const { user, currentRole } = useAuth();
  const [teams, setTeams] = useState<UserTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    if (!user?.id || !user?.email) {
      setTeams([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const teamMap = new Map<string, UserTeam>();
      let colorIndex = 0;

      // 1. Fetch teams from team_staff (coach/manager access)
      const { data: staffData, error: staffError } = await supabase
        .from('team_staff')
        .select(
          `
          team_id,
          staff_role,
          teams (
            id,
            name,
            age_group,
            gender,
            club_id,
            color,
            clubs (
              id,
              name
            )
          )
        `
        )
        .eq('user_id', user.id);

      if (staffError) throw staffError;

      staffData?.forEach((item: any) => {
        if (item.teams && !teamMap.has(item.teams.id)) {
          teamMap.set(item.teams.id, {
            id: item.teams.id,
            name: item.teams.name,
            age_group: item.teams.age_group,
            gender: item.teams.gender,
            club_id: item.teams.club_id,
            club_name: item.teams.clubs?.name || null,
            access_type: 'staff',
            staff_role: item.staff_role,
            color: item.teams.color || TEAM_COLORS[colorIndex++ % TEAM_COLORS.length],
          });
        }
      });

      // 2. Fetch teams from players (parent access)
      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .select(
          `
          id,
          first_name,
          last_name,
          team_id,
          teams (
            id,
            name,
            age_group,
            gender,
            club_id,
            color,
            clubs (
              id,
              name
            )
          )
        `
        )
        .or(`parent_email.eq.${user.email},secondary_parent_email.eq.${user.email}`);

      if (playerError) throw playerError;

      playerData?.forEach((item: any) => {
        if (item.teams) {
          const existingTeam = teamMap.get(item.teams.id);
          if (!existingTeam) {
            // New team via parent access
            teamMap.set(item.teams.id, {
              id: item.teams.id,
              name: item.teams.name,
              age_group: item.teams.age_group,
              gender: item.teams.gender,
              club_id: item.teams.club_id,
              club_name: item.teams.clubs?.name || null,
              access_type: 'parent',
              player_id: item.id,
              player_name: `${item.first_name} ${item.last_name}`,
              color: item.teams.color || TEAM_COLORS[colorIndex++ % TEAM_COLORS.length],
            });
          } else if (existingTeam.access_type === 'parent') {
            // Already have parent access, maybe multiple kids on same team
            // Keep existing, just note we have access
          }
          // If already have staff access, don't downgrade to parent
        }
      });

      setTeams(Array.from(teamMap.values()));
    } catch (err: any) {
      console.error('Error fetching user teams:', err);
      setError(err.message || 'Failed to fetch teams');
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.email]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  // Get the default team based on currentRole
  const getDefaultTeam = useCallback((): UserTeam | null => {
    if (teams.length === 0) return null;

    // Try to match currentRole's team
    if (currentRole?.team?.id) {
      const match = teams.find((t) => t.id === currentRole.team.id);
      if (match) return match;
    }

    // Try to match currentRole's entity_id
    if (currentRole?.entity_id) {
      const match = teams.find((t) => t.id === currentRole.entity_id);
      if (match) return match;
    }

    // Try to match player's team for parent role
    if (currentRole?.player?.team?.id) {
      const match = teams.find((t) => t.id === currentRole.player.team.id);
      if (match) return match;
    }

    // Fallback to first team
    return teams[0];
  }, [teams, currentRole]);

  // Check if user can create events/channels for a specific team
  const canManageTeam = useCallback(
    (teamId: string): boolean => {
      const team = teams.find((t) => t.id === teamId);
      return team?.access_type === 'staff';
    },
    [teams]
  );

  // Get teams grouped by access type
  const getTeamsByAccess = useCallback(() => {
    const staffTeams = teams.filter((t) => t.access_type === 'staff');
    const parentTeams = teams.filter((t) => t.access_type === 'parent');
    return { staffTeams, parentTeams };
  }, [teams]);

  return {
    teams,
    loading,
    error,
    refetch: fetchTeams,
    getDefaultTeam,
    canManageTeam,
    getTeamsByAccess,
  };
}
