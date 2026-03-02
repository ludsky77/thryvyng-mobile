import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type {
  WellnessCategory,
  WellnessTopic,
  WellnessEngagementSummary,
} from '../types/wellness';

export function useWellness(userId: string | undefined, playerId?: string) {
  const [categories, setCategories] = useState<WellnessCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAcceptedDisclaimer, setHasAcceptedDisclaimer] = useState(false);
  const [checkingDisclaimer, setCheckingDisclaimer] = useState(true);

  // Check if user has accepted disclaimer
  const checkDisclaimer = useCallback(async () => {
    if (!userId) return;
    setCheckingDisclaimer(true);
    try {
      const { data } = await supabase
        .from('wellness_disclaimer_acceptances')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      setHasAcceptedDisclaimer(!!data);
    } catch (err) {
      console.error('Error checking disclaimer:', err);
    } finally {
      setCheckingDisclaimer(false);
    }
  }, [userId]);

  // Accept disclaimer
  const acceptDisclaimer = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    try {
      const { error } = await supabase
        .from('wellness_disclaimer_acceptances')
        .insert({
          user_id: userId,
          player_id: playerId || null,
          disclaimer_version: '1.0',
        });
      if (error) throw error;
      setHasAcceptedDisclaimer(true);
      return true;
    } catch (err) {
      console.error('Error accepting disclaimer:', err);
      return false;
    }
  }, [userId, playerId]);

  // Fetch categories with approval status
  const fetchCategories = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      if (playerId) {
        const { data, error } = await supabase.rpc(
          'get_wellness_categories_for_player',
          { _player_id: playerId }
        );
        if (error) throw error;
        setCategories(data || []);
      } else {
        const { data, error } = await supabase
          .from('wellness_categories')
          .select('*')
          .eq('is_active', true)
          .order('display_order');
        if (error) throw error;
        setCategories(data || []);
      }
    } catch (err: any) {
      console.error('Error fetching categories:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId, playerId]);

  // Fetch topics for a category
  const fetchTopics = useCallback(
    async (categoryId: string): Promise<WellnessTopic[]> => {
      try {
        const { data, error } = await supabase
          .from('wellness_topics')
          .select('*')
          .eq('category_id', categoryId)
          .eq('is_active', true)
          .order('display_order');
        if (error) throw error;
        return data || [];
      } catch (err) {
        console.error('Error fetching topics:', err);
        return [];
      }
    },
    []
  );

  // Record view start
  const startView = useCallback(
    async (topicId: string): Promise<string | null> => {
      if (!userId) return null;
      try {
        const { data, error } = await supabase.rpc('start_wellness_view', {
          _user_id: userId,
          _player_id: playerId || null,
          _topic_id: topicId,
        });
        if (error) throw error;
        return data;
      } catch (err) {
        console.error('Error starting view:', err);
        return null;
      }
    },
    [userId, playerId]
  );

  // Record view end
  const endView = useCallback(async (engagementId: string) => {
    try {
      await supabase.rpc('end_wellness_view', {
        _engagement_id: engagementId,
      });
    } catch (err) {
      console.error('Error ending view:', err);
    }
  }, []);

  // Request parent approval for locked category
  const requestApproval = useCallback(
    async (categoryId: string): Promise<boolean> => {
      if (!playerId) return false;
      try {
        const { error } = await supabase.rpc('request_wellness_approval', {
          _player_id: playerId,
          _category_id: categoryId,
        });
        if (error) throw error;
        await fetchCategories();
        return true;
      } catch (err) {
        console.error('Error requesting approval:', err);
        return false;
      }
    },
    [playerId, fetchCategories]
  );

  useEffect(() => {
    checkDisclaimer();
  }, [checkDisclaimer]);

  useEffect(() => {
    if (hasAcceptedDisclaimer) {
      fetchCategories();
    }
  }, [hasAcceptedDisclaimer, fetchCategories]);

  return {
    categories,
    loading,
    error,
    hasAcceptedDisclaimer,
    checkingDisclaimer,
    acceptDisclaimer,
    fetchCategories,
    fetchTopics,
    startView,
    endView,
    requestApproval,
  };
}

// Hook for parent dashboard
export function useWellnessParent(userId: string | undefined, playerId: string) {
  const [engagement, setEngagement] =
    useState<WellnessEngagementSummary | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEngagement = useCallback(async () => {
    if (!userId || !playerId) return;
    try {
      const { data, error } = await supabase.rpc(
        'get_wellness_engagement_summary',
        {
          _player_id: playerId,
          _days: 30,
        }
      );
      if (error) throw error;
      setEngagement(data?.[0] || null);
    } catch (err) {
      console.error('Error fetching engagement:', err);
    }
  }, [userId, playerId]);

  const fetchPendingApprovals = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('wellness_parent_approvals')
        .select(
          `
          *,
          wellness_categories(name, description),
          players(first_name, last_name)
        `
        )
        .eq('parent_user_id', userId)
        .is('approved_at', null)
        .is('declined_at', null)
        .not('requested_at', 'is', null);
      if (error) throw error;
      setPendingApprovals(data || []);
    } catch (err) {
      console.error('Error fetching pending approvals:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const approveCategory = useCallback(
    async (approvalId: string): Promise<boolean> => {
      try {
        const { error } = await supabase
          .from('wellness_parent_approvals')
          .update({ approved_at: new Date().toISOString() })
          .eq('id', approvalId);
        if (error) throw error;
        await fetchPendingApprovals();
        return true;
      } catch (err) {
        console.error('Error approving:', err);
        return false;
      }
    },
    [fetchPendingApprovals]
  );

  const declineCategory = useCallback(
    async (approvalId: string): Promise<boolean> => {
      try {
        const { error } = await supabase
          .from('wellness_parent_approvals')
          .update({ declined_at: new Date().toISOString() })
          .eq('id', approvalId);
        if (error) throw error;
        await fetchPendingApprovals();
        return true;
      } catch (err) {
        console.error('Error declining:', err);
        return false;
      }
    },
    [fetchPendingApprovals]
  );

  useEffect(() => {
    fetchEngagement();
    fetchPendingApprovals();
  }, [fetchEngagement, fetchPendingApprovals]);

  return {
    engagement,
    pendingApprovals,
    loading,
    approveCategory,
    declineCategory,
    refreshEngagement: fetchEngagement,
  };
}

// Hook to check if player is female athlete
export function useIsFemaleAthlete(playerId?: string) {
  const [isFemale, setIsFemale] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      if (!playerId) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('players')
          .select('team_id, teams(gender)')
          .eq('id', playerId)
          .single();

        if (error) throw error;

        const teamGender = (data?.teams as any)?.gender?.toLowerCase();
        setIsFemale(teamGender === 'female' || teamGender === 'girls');
      } catch (err) {
        console.error('Error checking athlete gender:', err);
        setIsFemale(false);
      } finally {
        setLoading(false);
      }
    }

    check();
  }, [playerId]);

  return { isFemale, loading };
}
