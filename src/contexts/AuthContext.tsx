import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserRole } from '../types';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: any;
  roles: any[];
  currentRole: any;
  allRoles: UserRole[];
  loading: boolean;
  switchRole: (role: any) => Promise<void>;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [currentRole, setCurrentRole] = useState<any>(null);
  const [allRoles, setAllRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const enrichRolesWithEntityNames = async (roles: UserRole[]): Promise<any[]> => {
    return await Promise.all(roles.map(async (role) => {
      let entityName = '';
      let team: { id: string; name: string; club_id?: string } | null = null;
      let club: { id: string; name: string } | null = null;
      let player: { id: string; first_name: string; last_name: string } | null = null;

      if (!role.entity_id) {
        return { ...role, entityName, team, club, player };
      }

      // Team-related roles
      if (['team_manager', 'head_coach', 'assistant_coach'].includes(role.role)) {
        const { data: teamData } = await supabase
          .from('teams')
          .select('id, name, club_id')
          .eq('id', role.entity_id)
          .single();
        if (teamData) {
          team = teamData;
          entityName = teamData.name || '';
        }
      }
      // Club admin
      else if (role.role === 'club_admin') {
        const { data: clubData } = await supabase
          .from('clubs')
          .select('id, name')
          .eq('id', role.entity_id)
          .single();
        if (clubData) {
          club = clubData;
          entityName = clubData.name || '';
        }
      }
      // Parent role - show child's name and team
      else if (role.role === 'parent') {
        const { data: playerData } = await supabase
          .from('players')
          .select('id, first_name, last_name, teams(id, name, club_id)')
          .eq('id', role.entity_id)
          .single();
        if (playerData) {
          player = {
            id: playerData.id,
            first_name: playerData.first_name,
            last_name: playerData.last_name,
          };
          const teamData = (playerData as any).teams;
          if (teamData) {
            team = { id: teamData.id, name: teamData.name, club_id: teamData.club_id };
            entityName = `${playerData.first_name} ${playerData.last_name} (${teamData.name})`;
          } else {
            entityName = `${playerData.first_name} ${playerData.last_name}`;
          }
        }
      }

      return { ...role, entityName, team, club, player };
    }));
  };

  const fetchUserRoles = async (userId: string) => {
    const { data: roles, error } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching roles:', error);
      return [];
    }

    const enrichedRoles = await enrichRolesWithEntityNames(roles || []);
    return enrichedRoles;
  };

  const refreshRoles = async () => {
    if (!user) return;
    const roles = await fetchUserRoles(user.id);
    setAllRoles(roles);

    const savedRoleId = await AsyncStorage.getItem('lastRoleId') ?? await AsyncStorage.getItem('currentRoleId');
    const role = savedRoleId
      ? roles.find((r) => r.id === savedRoleId) || roles[0]
      : roles[0];
    setCurrentRole(role);
  };

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          setProfile(profileData ?? null);

          const roles = await fetchUserRoles(session.user.id);
          setAllRoles(roles);

          const savedRoleId = await AsyncStorage.getItem('lastRoleId') ?? await AsyncStorage.getItem('currentRoleId');
          const role = savedRoleId
            ? roles.find((r) => r.id === savedRoleId) || roles[0]
            : roles[0];
          setCurrentRole(role);
          setLoading(false);
        } else {
          setProfile(null);
          setAllRoles([]);
          setCurrentRole(null);
          setLoading(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        setProfile(profileData ?? null);

        const roles = await fetchUserRoles(session.user.id);
        setAllRoles(roles);

        const savedRoleId = await AsyncStorage.getItem('lastRoleId') ?? await AsyncStorage.getItem('currentRoleId');
        const role = savedRoleId
          ? roles.find((r) => r.id === savedRoleId) || roles[0]
          : roles[0];
        setCurrentRole(role);
        setLoading(false);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const switchRole = async (role: any) => {
    const roleId = typeof role === 'string' ? role : role?.id;
    const resolvedRole = typeof role === 'object' ? role : allRoles.find((r) => r.id === roleId);
    if (resolvedRole) {
      setCurrentRole(resolvedRole);
      await AsyncStorage.setItem('lastRoleId', resolvedRole.id);
      await AsyncStorage.setItem('currentRoleId', resolvedRole.id);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setCurrentRole(null);
    setAllRoles([]);
    await AsyncStorage.removeItem('currentRoleId');
    await AsyncStorage.removeItem('lastRoleId');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles: allRoles,
        currentRole,
        allRoles,
        loading,
        switchRole,
        signOut,
        refreshRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};