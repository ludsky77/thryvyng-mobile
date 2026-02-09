import React, { createContext, useContext, useState, ReactNode } from 'react';

// Types for registration context that must survive auth flow
export interface RegistrationContextData {
  // Join Team flow
  teamInviteCode?: string;

  // Join Staff flow
  staffInviteCode?: string;

  // Program Registration flow
  programId?: string;
  pendingProgramId?: string;

  // Co-Parent flow
  coParentCode?: string;

  // Claim Player flow
  claimPlayerCode?: string;

  // Track which flow the user is in
  activeFlow?:
    | 'join-team'
    | 'join-staff'
    | 'register-club'
    | 'register-team'
    | 'register-creator'
    | 'program-registration'
    | 'accept-coparent'
    | 'claim-player';

  // For existing user mode - store verified user ID
  verifiedUserId?: string;

  // Registration mode
  registrationMode?: 'new' | 'existing';
}

interface RegistrationContextType {
  // Current registration data
  registrationData: RegistrationContextData;

  // Set entire registration context (when deep link arrives)
  setRegistrationData: (data: RegistrationContextData) => void;

  // Update specific fields
  updateRegistrationData: (data: Partial<RegistrationContextData>) => void;

  // Clear all registration context (after successful registration)
  clearRegistrationData: () => void;

  // Check if there's a pending registration
  hasPendingRegistration: boolean;

  pendingProgramId: string | null;
  setPendingProgramId: (id: string | null) => void;
}

const RegistrationContext = createContext<RegistrationContextType | undefined>(undefined);

export const RegistrationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [registrationData, setRegistrationDataState] = useState<RegistrationContextData>({});
  const [pendingProgramId, setPendingProgramId] = useState<string | null>(null);

  const setRegistrationData = (data: RegistrationContextData) => {
    if (__DEV__) {
      console.log('[RegistrationContext] Setting registration data:', data);
    }
    setRegistrationDataState(data);
  };

  const updateRegistrationData = (data: Partial<RegistrationContextData>) => {
    if (__DEV__) {
      console.log('[RegistrationContext] Updating registration data:', data);
    }
    setRegistrationDataState((prev) => ({ ...prev, ...data }));
  };

  const clearRegistrationData = () => {
    if (__DEV__) {
      console.log('[RegistrationContext] Clearing registration data');
    }
    setRegistrationDataState({});
  };

  const hasPendingRegistration = Boolean(
    registrationData.teamInviteCode ||
      registrationData.staffInviteCode ||
      registrationData.programId ||
      registrationData.coParentCode ||
      registrationData.claimPlayerCode ||
      registrationData.activeFlow
  );

  return (
    <RegistrationContext.Provider
      value={{
        registrationData,
        setRegistrationData,
        updateRegistrationData,
        clearRegistrationData,
        hasPendingRegistration,
        pendingProgramId,
        setPendingProgramId,
      }}
    >
      {children}
    </RegistrationContext.Provider>
  );
};

export const useRegistration = (): RegistrationContextType => {
  const context = useContext(RegistrationContext);
  if (!context) {
    throw new Error('useRegistration must be used within a RegistrationProvider');
  }
  return context;
};

export default RegistrationContext;
