import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { isEmailValid } from '../components/forms';

interface UseEmailAvailabilityReturn {
  isChecking: boolean;
  isAvailable: boolean | null;
  error: string | null;
  checkEmail: (email: string) => Promise<boolean>;
}

export const useEmailAvailability = (debounceMs: number = 500): UseEmailAvailabilityReturn => {
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckedEmail = useRef<string>('');

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const checkEmail = async (email: string): Promise<boolean> => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Reset state for empty or invalid email
    if (!email || !isEmailValid(email)) {
      setIsAvailable(null);
      setIsChecking(false);
      setError(null);
      return false;
    }

    // Skip if same email already checked
    if (email === lastCheckedEmail.current && isAvailable !== null) {
      return isAvailable;
    }

    // Debounce the check
    return new Promise((resolve) => {
      setIsChecking(true);

      timeoutRef.current = setTimeout(async () => {
        try {
          const { data, error: fnError } = await supabase.functions.invoke('check-email-exists', {
            body: { email },
          });

          lastCheckedEmail.current = email;

          if (fnError) {
            setError('Failed to check email availability');
            setIsAvailable(null);
            resolve(false);
            return;
          }

          const available = !data?.exists;
          setIsAvailable(available);
          setError(null);
          resolve(available);
        } catch (err) {
          setError('Failed to check email availability');
          setIsAvailable(null);
          resolve(false);
        } finally {
          setIsChecking(false);
        }
      }, debounceMs);
    });
  };

  return { isChecking, isAvailable, error, checkEmail };
};

export default useEmailAvailability;
