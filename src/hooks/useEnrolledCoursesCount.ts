import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useEnrolledCoursesCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    if (!user?.id) {
      setCount(0);
      setLoading(false);
      return;
    }

    try {
      const { count: enrollCount, error } = await supabase
        .from('course_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (!error) {
        setCount(enrollCount || 0);
      }
    } catch (err) {
      console.error('Error fetching enrolled count:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  return { count, loading, refetch: fetchCount };
}
