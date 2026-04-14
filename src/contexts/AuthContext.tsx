import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserRole } from '../types';
import { registerForPushNotifications, deactivatePushToken } from '../services/notifications';
import Constants from 'expo-constants';

const withTimeout = <T,>(promise: Promise<T>, ms: number = 10000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), ms)
    )
  ]);
};

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
  refreshRoles: (overrideUserId?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [currentRole, setCurrentRole] = useState<any>(null);
  const [allRoles, setAllRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const lastProcessedSessionRef = React.useRef<string | null>(null);

  const fetchUserRoles = async (userId: string) => {
    try {
      const { data, error } = await withTimeout(
        supabase.rpc('get_enriched_roles_v2', { p_user_id: userId }) as unknown as Promise<{ data: any; error: any }>,
        10000
      );
      if (error) {
        console.error('Error fetching roles:', error);
        return [];
      }
      // Map RPC response to match the shape the app expects
      return (data || []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        role: r.role,
        entity_id: r.entity_id,
        entityName: r.entity_name || '',
        role_metadata: r.role_metadata,
        created_at: r.created_at,
        team: r.team_id ? { id: r.team_id, name: r.team_name, club_id: r.team_club_id } : null,
        club: r.club_id ? { id: r.club_id, name: r.club_name } : null,
        player: r.player_first_name ? { id: r.entity_id, first_name: r.player_first_name, last_name: r.player_last_name } : null,
      }));
    } catch (err) {
      console.error('fetchUserRoles timeout:', err);
      return [];
    }
  };

  const refreshRoles = async (overrideUserId?: string) => {
    const userId = overrideUserId || session?.user?.id;
    if (!userId) return;
    const roles = await fetchUserRoles(userId);
    setAllRoles(roles);
    if (roles.length === 1) {
      setCurrentRole(roles[0]);
    } else if (roles.length > 0 && !currentRole) {
      setCurrentRole(roles[0]);
    }
  };

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Skip if we already processed this exact session token
        const sessionToken = session?.access_token;
        if (sessionToken && sessionToken === lastProcessedSessionRef.current) {
          return;
        }
        if (sessionToken) {
          lastProcessedSessionRef.current = sessionToken;
        }

        if (session?.user) {
          try {
            // Run profile, roles, and saved role ID fetches in parallel
            const [profileResult, roles, savedRoleId] = await Promise.all([
              withTimeout(supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single() as unknown as Promise<{ data: any }>),
              fetchUserRoles(session.user.id),
              AsyncStorage.getItem('lastRoleId').then((id) => id ?? AsyncStorage.getItem('currentRoleId')),
            ]);
            setProfile((profileResult as any).data ?? null);
            setAllRoles(roles);

            // Auto-select if user has exactly one role
            if (roles.length === 1 && !currentRole) {
              setCurrentRole(roles[0]);
            } else {
              const role = savedRoleId
                ? roles.find((r: any) => r.id === savedRoleId) || roles[0]
                : roles[0];
              setCurrentRole(role);
            }
            setLoading(false);
            // Register for push notifications (skip in Expo Go)
            if (session?.user?.id && Constants.appOwnership !== 'expo') {
              registerForPushNotifications(session.user.id);
            }
          } catch (err) {
            setLoading(false);
          }
        } else {
          setProfile(null);
          setAllRoles([]);
          setCurrentRole(null);
          setLoading(false);
        }
      }
    );

    // Check for existing session - this triggers onAuthStateChange which handles fetching
    supabase.auth.getSession();

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Remove all realtime subscriptions when app goes to background
        supabase.removeAllChannels();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
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
    // Deactivate push token before logout
    if (user?.id) {
      await deactivatePushToken(user.id);
    }
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