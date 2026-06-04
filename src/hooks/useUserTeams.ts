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
  team_status?: string | null;
  is_test?: boolean | null;
  season_id?: string | null;
}

type TeamBucket = 'active' | 'past' | 'hidden';

function getTeamBucket(team: UserTeam): TeamBucket {
  if (team.is_test === true) return 'hidden';
  const status = team.team_status;
  const known =
    status === 'active' || status === 'archived' || status === 'inactive';
  if (!status || !known) return 'hidden';
  if (status === 'archived' || status === 'inactive') return 'past';
  return 'active';
}

function bucketTeams(allTeams: UserTeam[]): { active: UserTeam[]; past: UserTeam[] } {
  const active: UserTeam[] = [];
  const past: UserTeam[] = [];
  for (const t of allTeams) {
    const b = getTeamBucket(t);
    if (b === 'active') active.push(t);
    else if (b === 'past') past.push(t);
  }
  return { active, past };
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

function mapTeamFromRow(
  teamsRow: any,
  access_type: 'staff' | 'parent',
  extras: Partial<UserTeam>,
  colorIndex: number
): UserTeam {
  return {
    id: teamsRow.id,
    name: teamsRow.name,
    age_group: teamsRow.age_group,
    gender: teamsRow.gender,
    club_id: teamsRow.club_id,
    club_name: teamsRow.clubs?.name || null,
    access_type,
    color: teamsRow.color || TEAM_COLORS[colorIndex % TEAM_COLORS.length],
    team_status: teamsRow.team_status ?? null,
    is_test: teamsRow.is_test ?? null,
    season_id: teamsRow.season_id ?? null,
    ...extras,
  };
}

export function useUserTeams() {
  const { user, currentRole } = useAuth();
  const [activeTeams, setActiveTeams] = useState<UserTeam[]>([]);
  const [pastTeams, setPastTeams] = useState<UserTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    if (!user?.id || !user?.email) {
      setActiveTeams([]);
      setPastTeams([]);
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
            team_status,
            is_test,
            season_id,
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
          teamMap.set(
            item.teams.id,
            mapTeamFromRow(
              item.teams,
              'staff',
              { staff_role: item.staff_role },
              colorIndex++
            )
          );
        }
      });

      // 2. Fetch teams from players (parent access) — active players only
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
            team_status,
            is_test,
            season_id,
            clubs (
              id,
              name
            )
          )
        `
        )
        .eq('status', 'active')
        .or(`parent_email.eq.${user.email},secondary_parent_email.eq.${user.email}`);

      if (playerError) throw playerError;

      playerData?.forEach((item: any) => {
        if (item.teams) {
          const existingTeam = teamMap.get(item.teams.id);
          if (!existingTeam) {
            teamMap.set(
              item.teams.id,
              mapTeamFromRow(
                item.teams,
                'parent',
                {
                  player_id: item.id,
                  player_name: `${item.first_name} ${item.last_name}`,
                },
                colorIndex++
              )
            );
          }
        }
      });

      const { active, past } = bucketTeams(Array.from(teamMap.values()));
      setActiveTeams(active);
      setPastTeams(past);
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

  const teams = activeTeams;

  // Get the default team based on currentRole (active teams only)
  const getDefaultTeam = useCallback((): UserTeam | null => {
    if (teams.length === 0) return null;

    if (currentRole?.team?.id) {
      const match = teams.find((t) => t.id === currentRole.team.id);
      if (match) return match;
    }

    if (currentRole?.entity_id) {
      const match = teams.find((t) => t.id === currentRole.entity_id);
      if (match) return match;
    }

    if (currentRole?.player?.team?.id) {
      const match = teams.find((t) => t.id === currentRole.player.team.id);
      if (match) return match;
    }

    return teams[0];
  }, [teams, currentRole]);

  const canManageTeam = useCallback(
    (teamId: string): boolean => {
      const team = teams.find((t) => t.id === teamId);
      return team?.access_type === 'staff';
    },
    [teams]
  );

  const getTeamsByAccess = useCallback(() => {
    const staffTeams = teams.filter((t) => t.access_type === 'staff');
    const parentTeams = teams.filter((t) => t.access_type === 'parent');
    return { staffTeams, parentTeams };
  }, [teams]);

  return {
    teams,
    activeTeams: teams,
    pastTeams,
    loading,
    error,
    refetch: fetchTeams,
    getDefaultTeam,
    canManageTeam,
    getTeamsByAccess,
  };
}
