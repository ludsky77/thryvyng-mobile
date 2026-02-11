import type { LinkingOptions } from '@react-navigation/native';

// Shared shape for selected players passed through the invitation flow
export interface SelectedPlayerParam {
  placementId: string;
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  packageId: string;
  packageName: string;
  packagePrice: number;
}

// Type definitions for navigation params
export type RootStackParamList = {
  // Auth screens
  Welcome: undefined;
  Login: { mode?: 'signin' | 'signup' } | undefined;
  // Main app screens
  Main: undefined;
  MainTabs: undefined;
  Dashboard: undefined;
  Notifications: undefined;
  NotificationSettings: undefined;
  EventDetail: { eventId?: string; event?: any; onRefetch?: () => void };
  // Registration screens
  JoinTeam: { code: string };
  JoinStaff: { code: string };
  RegisterClub: undefined;
  RegisterTeam: undefined;
  RegisterCreator: undefined;
  ProgramRegistration: { programId: string };
  AcceptCoParent: { code: string };
  ClaimPlayer: { code: string };
  // Post-tryout invitation (Flow B)
  Invitation: { token: string };
  Invitations: { email?: string };
  InvitationQuestions: {
    token: string;
    packageId?: string;
    selectedPlayers?: SelectedPlayerParam[];
  };
  InvitationPayment: {
    token: string;
    packageId: string;
    selectedPlayers?: SelectedPlayerParam[];
    answers?: Record<string, any>;
  };
  InvitationVolunteer: { token: string };
  InvitationDonate: { token: string };
  InvitationAid: { token: string };
  InvitationCheckout: { token: string };
  InvitationSuccess: undefined;
  InvitationCancel: { token?: string };
  // Product store & checkout
  ProductStore: undefined;
  ProductDetail: { productId: string };
  Cart: undefined;
  CheckoutSuccess: { sessionId?: string };
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
      ProgramRegistration: {
        path: 'register/program/:programId',
        parse: {
          programId: (programId: string) => programId,
        },
      },
      AcceptCoParent: 'accept-coparent/:code',
      ClaimPlayer: 'claim-player/:code',
      Invitation: {
        path: 'invitation/:token',
        parse: { token: (token: string) => token },
      },
      Invitations: 'invitations',
      InvitationSuccess: 'invitation-success',
      InvitationCancel: 'invitation-cancel',
      Login: 'login',
      Dashboard: 'dashboard',
      CheckoutSuccess: 'checkout-success',
      ProductStore: 'store',
      ProductDetail: 'product/:productId',
      Cart: 'cart',
      NotFound: '*',
    },
  },
};
