import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface UseIdentityVerificationReturn {
  isVerifying: boolean;
  error: string | null;
  verifiedUserId: string | null;
  verifyIdentity: (email: string, password: string) => Promise<{ success: boolean; userId?: string }>;
  clearVerification: () => void;
}

export const useIdentityVerification = (): UseIdentityVerificationReturn => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);

  const verifyIdentity = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; userId?: string }> => {
    setIsVerifying(true);
    setError(null);

    try {
      // Attempt to sign in to verify credentials
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return { success: false };
      }

      if (data.user) {
        setVerifiedUserId(data.user.id);
        return { success: true, userId: data.user.id };
      }

      setError('Verification failed');
      return { success: false };
    } catch (err) {
      setError('An unexpected error occurred');
      return { success: false };
    } finally {
      setIsVerifying(false);
    }
  };

  const clearVerification = () => {
    setVerifiedUserId(null);
    setError(null);
  };

  return { isVerifying, error, verifiedUserId, verifyIdentity, clearVerification };
};

export default useIdentityVerification;
