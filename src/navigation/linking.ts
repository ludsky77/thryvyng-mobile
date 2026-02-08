import type { LinkingOptions } from '@react-navigation/native';

// Type definitions for navigation params
export type RootStackParamList = {
  // Auth screens
  Welcome: undefined;
  Login: undefined;
  // Main app screens
  Main: undefined;
  MainTabs: undefined;
  Dashboard: undefined;
  // Registration screens
  JoinTeam: { code: string };
  JoinStaff: { code: string };
  RegisterClub: undefined;
  RegisterTeam: undefined;
  RegisterCreator: undefined;
  ProgramRegistration: { programId: string };
  AcceptCoParent: { code: string };
  ClaimPlayer: { code: string };
  // Fallback
  NotFound: undefined;
};

// Deep linking configuration
const prefix = 'thryvyng://';
const universalLinks = ['https://thryvyng.com', 'https://www.thryvyng.com'];

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [prefix, ...universalLinks],
  config: {
    screens: {
      JoinTeam: 'join-team/:code',
      JoinStaff: 'join-staff/:code',
      RegisterClub: 'register/club',
      RegisterTeam: 'register/team',
      RegisterCreator: 'register/creator',
      ProgramRegistration: 'register/:programId',
      AcceptCoParent: 'accept-coparent/:code',
      ClaimPlayer: 'claim-player/:code',
      Login: 'login',
      Dashboard: 'dashboard',
      NotFound: '*',
    },
  },
};
