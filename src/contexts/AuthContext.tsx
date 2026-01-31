import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  currentRole: UserRole | null;
  allRoles: UserRole[];
  loading: boolean;
  switchRole: (roleId: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const [allRoles, setAllRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  const enrichRolesWithEntityNames = async (roles: UserRole[]): Promise<UserRole[]> => {
    return await Promise.all(roles.map(async (role) => {
      let entityName = '';
      
      if (!role.entity_id) {
        return { ...role, entityName };
      }
      
      // Team-related roles
      if (['team_manager', 'head_coach', 'assistant_coach'].includes(role.role)) {
        const { data: team } = await supabase
          .from('teams')
          .select('name')
          .eq('id', role.entity_id)
          .single();
        entityName = team?.name || '';
      }
      // Club admin
      else if (role.role === 'club_admin') {
        const { data: club } = await supabase
          .from('clubs')
          .select('name')
          .eq('id', role.entity_id)
          .single();
        entityName = club?.name || '';
      }
      // Parent role - show child's name and team
      else if (role.role === 'parent') {
        const { data: player } = await supabase
          .from('players')
          .select('first_name, last_name, teams(name)')
          .eq('id', role.entity_id)
          .single();
        if (player) {
          const teamName = (player.teams as any)?.name;
          entityName = `${player.first_name} ${player.last_name}${teamName ? ` (${teamName})` : ''}`;
        }
      }
      
      return { ...role, entityName };
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
    
    // Set current role if not already set
    if (!currentRole && roles.length > 0) {
      const savedRoleId = await AsyncStorage.getItem('currentRoleId');
      const role = savedRoleId 
        ? roles.find(r => r.id === savedRoleId) || roles[0]
        : roles[0];
      setCurrentRole(role);
    }
  };

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Fetch user roles
          const roles = await fetchUserRoles(session.user.id);
          setAllRoles(roles);
          
          // Set current role
          const savedRoleId = await AsyncStorage.getItem('currentRoleId');
          const role = savedRoleId 
            ? roles.find(r => r.id === savedRoleId) || roles[0]
            : roles[0];
          setCurrentRole(role);
          setLoading(false);
        } else {
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
        const roles = await fetchUserRoles(session.user.id);
        setAllRoles(roles);
        
        const savedRoleId = await AsyncStorage.getItem('currentRoleId');
        const role = savedRoleId 
          ? roles.find(r => r.id === savedRoleId) || roles[0]
          : roles[0];
        setCurrentRole(role);
        setLoading(false);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const switchRole = async (roleId: string) => {
    const role = allRoles.find(r => r.id === roleId);
    if (role) {
      setCurrentRole(role);
      await AsyncStorage.setItem('currentRoleId', roleId);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setCurrentRole(null);
    setAllRoles([]);
    await AsyncStorage.removeItem('currentRoleId');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
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