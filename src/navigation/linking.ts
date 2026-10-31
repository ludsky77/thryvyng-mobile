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
  // returnTo/returnParams are read at LoginScreen.tsx:137-139 after sign-in.
  Login:
    | {
        mode?: 'signin' | 'signup';
        returnTo?: string;
        returnParams?: Record<string, unknown>;
      }
    | undefined;
  // Main app screens
  Main: undefined;
  MainTabs: undefined;
  Dashboard: undefined;
  Notifications: undefined;
  NotificationSettings: undefined;
  EventDetail: { eventId?: string; event?: any; onRefetch?: () => void };
  // Pushed from EvaluationsScreen; both screens take their route via props.
  PlayerProfile: { playerId: string; playerName: string };
  EvaluationDetail: { evaluationId?: string; evaluation_id?: string };
  PreGameSetup: { eventId: string; teamId: string };
  StatsConsole: { sessionId: string };
  LiveSpectator: { sessionId: string };
  MatchSummary: { sessionId: string };
  // Registration screens
  JoinTeam: { code: string; slug?: string; role?: string };
  Support: { slug?: string; code: string };
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
  // Training Studio
  TrainingStudio: { teamId?: string; clubId?: string };
  SessionDetail: { sessionId: string };
  DrillDetail: { drillId: string };
  SeasonPlanDetail: { plan: any };
  CurriculumDetail: { curriculum: any };
  LineupList: { teamId?: string; clubId?: string };
  LineupEditor: { lineupId: string; teamId: string };
  // __DEV__ ONLY — the M2 Playbook board harness (PLAYBOOK-DEV-HARNESS).
  // A param-list entry is a type, erased at compile time; the runtime gate is
  // on the `config.screens` entry below and on the navigator's own.
  PlaybookDev: undefined;
  // The PAC Playbook reader (M4). `card` is the web's `?card=` — open the
  // book on that card instead of the cover; everything else about where you
  // are in the book is the reader's own state, never a route param.
  // The path below is `__DEV__` ONLY, the same three-gate pattern as
  // `PlaybookDev`: a production bundle has no URL into the reader, so the
  // launch switch stays the only thing that decides whether the book is
  // reachable. In dev it is how the reader is opened at all on a machine
  // where a simulator cannot be tapped. A real, release-time path is M5's,
  // and it must be gated on `playbookVisible`, not on `__DEV__`.
  Playbook: { card?: string } | undefined;
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
      JoinTeam: {
        path: 'join-team/:slug/:code?',
        parse: {
          slug: (slug: string) => slug,
          code: (code: string | undefined) => code || '',
        },
      },
      Support: {
        path: 'support/:slug/:code?',
        parse: {
          slug: (slug: string) => slug,
          code: (code: string | undefined) => code || '',
        },
      },
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
      // __DEV__ ONLY. Metro folds `__DEV__` to a literal, so in a production
      // bundle this spread is `...{}` and the path does not exist.
      ...(__DEV__
        ? {
            PlaybookDev: 'playbook-dev',
            // thryvyng://playbook  ·  thryvyng://playbook?card=F3
            Playbook: 'playbook',
          }
        : {}),
      NotFound: '*',
    },
  },
};
