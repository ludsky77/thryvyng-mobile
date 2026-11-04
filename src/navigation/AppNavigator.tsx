import React, { lazy, Suspense } from 'react';
import { syncAppBadge } from '../services/appBadge';
import { TeamsProvider } from '../contexts/TeamsContext';
import { ChatUnreadProvider, useChatUnread } from '../contexts/ChatUnreadContext';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useRegistration } from '../contexts/RegistrationContext';
import { FamilyCheckoutProvider } from '../contexts/FamilyCheckoutContext';
import { linking, type RootStackParamList } from './linking';
// Two constants, no feature code — the Playbook's launch switch. See
// src/constants/playbookLaunch.ts for why it is a leaf module, and why it
// lives with the app's constants rather than with the feature.
import { playbookVisible } from '../constants/playbookLaunch';
// One more leaf constant: the card-key SHAPE test, shared with the announcement
// compose and detail screens. It used to be a file-local const here; that file
// carries the whole argument for why this layer tests the shape and leaves "does
// this card exist, and may this viewer read it" to the reader.
import { isAnnounceCardKey } from '../constants/announceCardKey';
// R-04's switch, the same shape as the Playbook's: two constants, no feature
// code. Gates both old-games ROUTES below, so hiding the games cannot be
// undone by a stale navigation, a push payload or a deep link.
import { legacyGamesVisible, showArcadeComingSoon } from '../constants/arcadeLaunch';
import { addNotificationListeners } from '../services/notifications';
// Only for the cold-start tap below. Every other notification path in this app
// goes through `addNotificationListeners` (src/services/notifications.ts); the
// one thing that module cannot do is answer "was this app LAUNCHED by a tap",
// which is a one-shot read, not a subscription.
import * as Notifications from 'expo-notifications';
import {
  JoinTeamScreen,
  JoinStaffScreen,
  RegisterClubScreen,
  RegisterTeamScreen,
  RegisterCreatorScreen,
  ProgramRegistrationScreen,
  AcceptCoParentScreen,
  ClaimPlayerScreen,
  NotFoundScreen,
} from '../screens/registration';

// ─── Eager screens (visible immediately or needed for deep links) ───────────
import { WelcomeScreen } from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import SupportScreen from '../screens/SupportScreen';
import DashboardScreen from '../screens/DashboardScreen';
import WorldCupPredictorScreen from '../screens/WorldCupPredictorScreen';
import ChatScreen from '../screens/ChatScreen';
import TeamChatRoomScreen from '../screens/TeamChatRoomScreen';
import DirectMessagesScreen from '../screens/DirectMessagesScreen';
import DMChatScreen from '../screens/DMChatScreen';
import CalendarScreen from '../screens/CalendarScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { NotificationBell } from '../components/NotificationBell';
import TeamsScreen from '../screens/TeamsScreen';
import TeamDetailScreen from '../screens/TeamDetailScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
// Invitation screens kept eager for deep-link handling
import InvitationAuthWrapper from '../screens/invitation/InvitationAuthWrapper';
import FamilyInvitationsScreen from '../screens/invitation/FamilyInvitationsScreen';
import InvitationQuestionsScreen from '../screens/invitation/InvitationQuestionsScreen';
import InvitationPaymentScreen from '../screens/invitation/InvitationPaymentScreen';
import InvitationVolunteerScreen from '../screens/invitation/InvitationVolunteerScreen';
import InvitationDonateScreen from '../screens/invitation/InvitationDonateScreen';
import InvitationAidScreen from '../screens/invitation/InvitationAidScreen';
import InvitationCheckoutScreen from '../screens/invitation/InvitationCheckoutScreen';
import InvitationSuccessScreen from '../screens/invitation/InvitationSuccessScreen';
import InvitationCancelScreen from '../screens/invitation/InvitationCancelScreen';

// ─── Lazy screens (loaded on first navigation) ───────────────────────────────
const GroupInfoScreen = lazy(() => import('../screens/GroupInfoScreen'));
const ChatInfoScreen = lazy(() => import('../screens/ChatInfoScreen'));
const ChannelPollsScreen = lazy(() => import('../screens/ChannelPollsScreen'));
const ChannelFilesScreen = lazy(() => import('../screens/ChannelFilesScreen'));
const ChannelLinksScreen = lazy(() => import('../screens/ChannelLinksScreen'));
const StaffMessageScreen = lazy(() => import('../screens/StaffMessageScreen'));
// CLUB-ANNOUNCE-V1-MOBILE. Lazy, like every chat screen that is not the list
// or the room: the feed is opened from a chat-list row, the Club-Wide Message
// tile or a push tap, never at boot.
const AnnouncementsFeedScreen = lazy(() => import('../screens/AnnouncementsFeedScreen'));
const AnnouncementDetailScreen = lazy(() => import('../screens/AnnouncementDetailScreen'));
const ComposeAnnouncementScreen = lazy(() => import('../screens/ComposeAnnouncementScreen'));
const PollDetailScreen = lazy(() => import('../screens/PollDetailScreen'));
const SurveyResponseScreen = lazy(() => import('../screens/SurveyResponseScreen'));
const SurveyListScreen = lazy(() => import('../screens/SurveyListScreen'));
const SurveyResultsScreen = lazy(() => import('../screens/SurveyResultsScreen'));
const MessageReadHistoryScreen = lazy(
  () => import('../screens/MessageReadHistoryScreen')
);
const RosterScreen = lazy(() => import('../screens/RosterScreen'));
// __DEV__ ONLY — the M2 Playbook board harness (PLAYBOOK-DEV-HARNESS in
// docs/ledger.md). `__DEV__` is a compile-time constant Metro folds, so in a
// production bundle this is `null` and the dynamic import is never emitted.
const PlaybookDevHarnessScreen = __DEV__
  ? lazy(() => import('../features/pac-playbook/dev/PlaybookDevHarness'))
  : null;
// The PAC Playbook reader, M4's route. `lazy()` is the lazy boundary the whole
// feature hangs off: nothing under `src/features/pac-playbook/` (outside
// `launch.ts`, two constants) is imported from any boot path, so the book —
// 20 files, a 352 KB data file in dev — loads on the first navigation to
// `Playbook` and not before. Proved by module-evaluation log in
// docs/recon/playbook-m4.md.
const PlaybookScreen = lazy(() => import('../features/pac-playbook/PlaybookScreen'));
const CreateEvaluationScreen = lazy(() => import('../screens/CreateEvaluationScreen'));
const EvaluationRosterScreen = lazy(() => import('../screens/EvaluationRosterScreen'));
const TeamStaffScreen = lazy(() => import('../screens/TeamStaffScreen'));
const StaffRequestsScreen = lazy(() => import('../screens/StaffRequestsScreen'));
const PlayerProfileScreen = lazy(() => import('../screens/PlayerProfileScreen'));
const EvaluationDetailScreen = lazy(() => import('../screens/EvaluationDetailScreen'));
const CertificateViewerScreen = lazy(() => import('../screens/CertificateViewerScreen'));
const CoursesScreen = lazy(() => import('../screens/CoursesScreen'));
const MyCoursesScreen = lazy(() => import('../screens/MyCoursesScreen'));
const CourseDetailScreen = lazy(() => import('../screens/CourseDetailScreen'));
const CoursePlayerScreen = lazy(() => import('../screens/CoursePlayerScreen'));
const NotificationSettingsScreen = lazy(() => import('../screens/NotificationSettingsScreen'));
const EditProfileScreen = lazy(() => import('../screens/EditProfileScreen'));
const ChangePasswordScreen = lazy(() => import('../screens/ChangePasswordScreen'));
const EditChildScreen = lazy(() => import('../screens/EditChildScreen'));
const MyRegistrationsScreen = lazy(() => import('../screens/MyRegistrationsScreen'));
const MyFamilyScreen = lazy(() => import('../screens/MyFamilyScreen'));
const RegistrationDetailScreen = lazy(() => import('../screens/RegistrationDetailScreen'));
const PaymentMethodsScreen = lazy(() => import('../screens/PaymentMethodsScreen'));
const PaymentHistoryScreen = lazy(() => import('../screens/PaymentHistoryScreen'));
const PlayerEvaluationsScreen = lazy(() => import('../screens/PlayerEvaluationsScreen'));
const EvaluationsScreen = lazy(() => import('../screens/EvaluationsScreen'));
const TeamCertificatesScreen = lazy(() => import('../screens/TeamCertificatesScreen'));
const GamesHubScreen = lazy(() => import('../screens/GamesHubScreen'));
const WellnessHubScreen = lazy(() => import('../screens/WellnessHubScreen'));
const WellnessCategoryScreen = lazy(() => import('../screens/WellnessCategoryScreen'));
const WellnessTopicScreen = lazy(() => import('../screens/WellnessTopicScreen'));
const WellnessParentDashboardScreen = lazy(() => import('../screens/WellnessParentDashboardScreen'));
const HealthScreen = lazy(() => import('../screens/HealthScreen'));
const ResourcesScreen = lazy(() => import('../screens/ResourcesScreen'));
const SkillsLibraryScreen = lazy(() => import('../screens/SkillsLibraryScreen'));
const TeamResourcesScreen = lazy(() => import('../screens/TeamResourcesScreen'));
const TrainingStudioScreen = lazy(() => import('../screens/TrainingStudioScreen'));
const ClubHubScreen = lazy(() => import('../screens/ClubHubScreen'));
const ClubTeamsListScreen = lazy(() => import('../screens/ClubTeamsListScreen'));
const EvaluationsHubScreen = lazy(() => import('../screens/EvaluationsHubScreen'));
const SessionDetailScreen = lazy(() => import('../screens/training/SessionDetailScreen'));
const DrillDetailScreen = lazy(() => import('../screens/training/DrillDetailScreen'));
const SeasonPlanDetailScreen = lazy(() => import('../screens/training/SeasonPlanDetailScreen'));
const CurriculumDetailScreen = lazy(() => import('../screens/training/CurriculumDetailScreen'));
const GamePlayScreen = lazy(() => import('../screens/GamePlayScreen'));
const LineupListScreen = lazy(() => import('../screens/lineup/LineupListScreen'));
const LineupEditorScreen = lazy(() => import('../screens/lineup/LineupEditorScreen'));
const LineupViewScreen = lazy(() => import('../screens/lineup/LineupViewScreen'));
const ProductStoreScreen = lazy(() => import('../screens/ProductStoreScreen'));
const ProductDetailScreen = lazy(() => import('../screens/ProductDetailScreen'));
const CartScreen = lazy(() => import('../screens/CartScreen'));
const CheckoutSuccessScreen = lazy(() => import('../screens/CheckoutSuccessScreen'));
const ParentPaymentsScreen = lazy(() => import('../screens/parent/ParentPaymentsScreen'));
const PreGameSetupScreen = lazy(() => import('../screens/game-stats/PreGameSetupScreen'));
const StatsConsoleScreen = lazy(() => import('../screens/game-stats/StatsConsoleScreen'));
const MatchSummaryScreen = lazy(() => import('../screens/game-stats/MatchSummaryScreen'));
const LiveSpectatorScreen = lazy(() => import('../screens/game-stats/LiveSpectatorScreen'));

/**
 * PLAYBOOK-ANNOUNCE-PUSH (ruling B, Lu, 2026-11-03 01:19) decided the shape a
 * card key is allowed to have when it arrives from outside the reader, and
 * this file held the pattern because a push tap was then the only way in.
 *
 * CLUB-ANNOUNCE-V1-MOBILE gave it a second caller — an announcement card's
 * `playbook_card` button, validated at compose time and again when it is read
 * back — so the pattern moved to `src/constants/announceCardKey.ts`, a leaf
 * that imports nothing, and that file carries the whole argument for why this
 * layer tests the SHAPE and leaves "does this card exist, and may this viewer
 * read it" to the reader. One definition, three callers.
 */

const Stack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#8b5cf6" />
      <Text style={styles.loadingText}>Loading...</Text>
    </View>
  );
}

const LAZY_FALLBACK = (
  <View style={{ flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' }}>
    <ActivityIndicator size="large" color="#8b5cf6" />
  </View>
);

function LazyScreen({ component: Component, ...rest }: { component: React.LazyExoticComponent<any>; [key: string]: any }) {
  return (
    <Suspense fallback={LAZY_FALLBACK}>
      <Component {...rest} />
    </Suspense>
  );
}

/**
 * R-04: what the `GamesHub` and `GamePlay` routes render while the old games
 * are hidden.
 *
 * THE ROUTE NAMES STAY REGISTERED on purpose, which is the one way this
 * differs from how `playbookVisible` gates the `Playbook` route (that one
 * removes the `Stack.Screen` outright). The Playbook route had never shipped,
 * so nothing could be pointing at it; `GamesHub` and `GamePlay` HAVE shipped,
 * which means a stale navigation state restored from disk, a saved deep link
 * or any future push payload can still name them. Dropping the screens would
 * make those a silent no-op — `navigate()` to an unregistered name does
 * nothing at all — and the person would tap and see the app ignore them.
 * Registered-and-guarded, they get the same sentence as the tile.
 *
 * It renders NOTHING and shows the Alert once on mount, then leaves on OK: the
 * screen is a door that explains itself and closes, not a page. `goBack` when
 * there is somewhere to go back to, otherwise `Dashboard` — the same fallback
 * pair the Playbook route's `onExit` uses, for a route opened cold by a tap
 * with no stack under it.
 *
 * `useRef` and not state: the Alert must fire ONCE. A remount from a re-render
 * would otherwise stack dialogs on top of each other.
 */
function LegacyGameClosedScreen({ navigation }: any) {
  const shown = React.useRef(false);
  React.useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    showArcadeComingSoon(() => {
      if (navigation?.canGoBack()) navigation.goBack();
      else navigation?.navigate('Dashboard');
    });
  }, [navigation]);
  return <View style={{ flex: 1, backgroundColor: '#0f172a' }} />;
}

function InvitationPlaceholderScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#888' }}>Coming in next prompt...</Text>
    </View>
  );
}

const TAB_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  Home: 'home',
  Teams: 'users',
  Chat: 'message-circle',
  Calendar: 'calendar',
  Profile: 'user',
};

function MainTabs() {
  const { currentRole, user } = useAuth();
  const { total: totalChatUnread, syncTick } = useChatUnread();
  const insets = useSafeAreaInsets();

  // R3: the app-icon badge is the chat tab total, always. One writer, here.
  //
  // syncTick is in the deps on purpose. A push can change the OS badge while
  // the app is backgrounded, so returning to the SAME total still has to
  // re-apply our number -- keying on `total` alone would skip exactly that
  // case and leave the server's inflated count on the icon. Every successful
  // recount ticks, so every foreground re-count re-applies, and so does every
  // recount after a mark-read or an incoming message.
  React.useEffect(() => {
    void syncAppBadge(totalChatUnread, user?.id);
  }, [totalChatUnread, syncTick, user?.id]);

  const isStaff =
    currentRole &&
    [
      'head_coach',
      'assistant_coach',
      'team_manager',
      'platform_admin',
    ].includes(currentRole.role);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#8B5CF6',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: [styles.tabBar, { paddingBottom: 24 + insets.bottom, height: 80 + insets.bottom }],
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarIconStyle: styles.tabBarIconStyle,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Feather name={TAB_ICONS.Home} size={22} color={color} />
          ),
        }}
      />

      {isStaff && (
        <Tab.Screen
          name="TeamsTab"
          component={TeamsStack}
          options={{
            tabBarLabel: 'Teams',
            tabBarIcon: ({ color, size }) => (
              <Feather name={TAB_ICONS.Teams} size={22} color={color} />
            ),
          }}
        />
      )}

      <Tab.Screen
        name="ChatTab"
        component={ChatStack}
        options={{
          tabBarLabel: 'Chat',
          tabBarBadge: totalChatUnread > 0 ? (totalChatUnread > 99 ? '99+' : totalChatUnread) : undefined,
          tabBarIcon: ({ color, size }) => (
            <Feather name={TAB_ICONS.Chat} size={22} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="CalendarTab"
        component={CalendarStack}
        options={{
          tabBarLabel: 'Calendar',
          tabBarIcon: ({ color, size }) => (
            <Feather name={TAB_ICONS.Calendar} size={22} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Feather name={TAB_ICONS.Profile} size={22} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function HomeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: styles.header,
        headerTintColor: '#fff',
        headerTitleStyle: styles.headerTitle,
      }}
    >
      <Stack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="SurveyResponse" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={SurveyResponseScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="SurveyList" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={SurveyListScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="SurveyResults" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={SurveyResultsScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PlayerProfile"
        options={({ route }: any) => ({ title: route.params?.playerName || 'Player Profile' })}
      >
        {(props) => <LazyScreen component={PlayerProfileScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="EvaluationDetail" options={{ title: 'Evaluation Details' }}>
        {(props) => <LazyScreen component={EvaluationDetailScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="CertificateViewer" options={{ title: 'Certificate' }}>
        {(props) => <LazyScreen component={CertificateViewerScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="MyCourses" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={MyCoursesScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="Courses" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={CoursesScreen} {...props} />}
      </Stack.Screen>
      {/* The PAC Playbook reader. It sits IN HomeStack, beside Courses, and
          not on the root stack — Lu, Oct 27: "back/home at every point". A
          root-stack screen covers the tab navigator, so the reader had no
          Home / Chat / Calendar / Profile bar and no way out but the in-book
          back, which the cover does not have. All three of its doors are in
          this stack already (the player dashboard, the Courses featured card
          and Club Hub), so one registration still serves all three and a
          push from any of them keeps the tab bar on screen.

          THE LAZY BOUNDARY IS UNMOVED: the component is still the module-level
          `lazy()` at the top of this file, reached through `LazyScreen` +
          Suspense, so nothing under `src/features/pac-playbook/` is evaluated
          until this route is navigated to (proved in docs/recon/playbook-m4.md
          § 5). `card` is the web's `?card=`, the only real route param;
          `offline` is the __DEV__ harness's and the real route never passes
          it. `onExit` is the app's own back, drawn as a chevron on the cover
          — it pops this stack, so the reader returns to whichever door opened
          it. Gated on the launch switch: until PLAYBOOK_LIVE is flipped, a
          store build has no Playbook route at all. */}
      {playbookVisible ? (
        <Stack.Screen name="Playbook" options={{ headerShown: false }}>
          {(props: any) => (
            <LazyScreen
              component={PlaybookScreen}
              card={props.route?.params?.card}
              /* A push tap on a question — PLAYBOOK-COACH-TRACK-MOBILE. Read
                 only, like `card`: the reader never writes these back. */
              question={props.route?.params?.question}
              questionMode={props.route?.params?.questionMode}
              onExit={() =>
                props.navigation?.canGoBack()
                  ? props.navigation.goBack()
                  : props.navigation?.navigate('Dashboard')
              }
            />
          )}
        </Stack.Screen>
      ) : null}
      <Stack.Screen name="CourseDetail" options={{ title: 'Course' }}>
        {(props) => <LazyScreen component={CourseDetailScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="CoursePlayer" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={CoursePlayerScreen} {...props} />}
      </Stack.Screen>
      {/* Team-related screens accessible from CoachDashboard / ClubAdminDashboard */}
      <Stack.Screen name="ClubTeamsList" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={ClubTeamsListScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen
        name="TeamDetail"
        component={TeamDetailScreen}
        options={({ route }: any) => ({ title: route.params?.teamName || 'Team' })}
      />
      <Stack.Screen name="Roster" options={{ title: 'Team Roster' }}>
        {(props) => <LazyScreen component={RosterScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="TeamStaff" options={{ title: 'Team Staff' }}>
        {(props) => <LazyScreen component={TeamStaffScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="StaffRequests" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={StaffRequestsScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="PlayerEvaluations" options={{ title: 'Player Evaluations' }}>
        {(props) => <LazyScreen component={PlayerEvaluationsScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="TeamCertificates" options={{ title: 'Team Certificates' }}>
        {(props) => <LazyScreen component={TeamCertificatesScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="EvaluationRoster" options={{ title: 'Evaluate Players' }}>
        {(props) => <LazyScreen component={EvaluationRosterScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="CreateEvaluation" options={{ title: 'Player Evaluation' }}>
        {(props) => <LazyScreen component={CreateEvaluationScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="Evaluations" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={EvaluationsScreen} {...props} />}
      </Stack.Screen>
      {/* R-04: hidden means the route still exists and explains itself. With
          the switch false the lazy `import()` below is never called, so no
          game screen is even constructed. */}
      <Stack.Screen name="GamesHub" options={{ headerShown: false }}>
        {(props) =>
          legacyGamesVisible ? (
            <LazyScreen component={GamesHubScreen} {...props} />
          ) : (
            <LegacyGameClosedScreen {...props} />
          )
        }
      </Stack.Screen>
      <Stack.Screen
        name="WorldCupPredictor"
        component={WorldCupPredictorScreen}
        options={{ headerShown: false }}
      />
      {/* Health & Wellness Routes */}
      <Stack.Screen name="Health" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={HealthScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="Resources" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={ResourcesScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="WellnessHub" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={WellnessHubScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="WellnessCategory" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={WellnessCategoryScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="WellnessTopic" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={WellnessTopicScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="WellnessParentDashboard" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={WellnessParentDashboardScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="SkillsLibrary" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={SkillsLibraryScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="TeamResources" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={TeamResourcesScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="TrainingStudio" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={TrainingStudioScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="ClubHub" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={ClubHubScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="EvaluationsHub" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={EvaluationsHubScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="SessionDetail" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={SessionDetailScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="DrillDetail" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={DrillDetailScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="SeasonPlanDetail" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={SeasonPlanDetailScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="CurriculumDetail" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={CurriculumDetailScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="LineupList" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={LineupListScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="LineupEditor" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={LineupEditorScreen} {...props} />}
      </Stack.Screen>
      {/* R-04, as GamesHub above. This is the route a saved deep link or a
          stale navigation state is most likely to name, because it is the one
          that carries params (`gameId`, `gameSlug`, `gameName`). */}
      <Stack.Screen name="GamePlay" options={{ headerShown: false }}>
        {(props) =>
          legacyGamesVisible ? (
            <LazyScreen component={GamePlayScreen} {...props} />
          ) : (
            <LegacyGameClosedScreen {...props} />
          )
        }
      </Stack.Screen>
      <Stack.Screen name="ProductStore" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={ProductStoreScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="ProductDetail" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={ProductDetailScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="Cart" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={CartScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="CheckoutSuccess" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={CheckoutSuccessScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="ParentPayments" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={ParentPaymentsScreen} {...props} />}
      </Stack.Screen>
      {/* Event & Lineup screens reachable from Dashboard without hiding the tab bar */}
      <Stack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="LineupView" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={LineupViewScreen} {...props} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

function TeamsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: styles.header,
        headerTintColor: '#fff',
        headerTitleStyle: styles.headerTitle,
      }}
    >
      <Stack.Screen
        name="Teams"
        component={TeamsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TeamDetail"
        component={TeamDetailScreen}
        options={({ route }: any) => ({
          title: route.params?.teamName || 'Team',
        })}
      />
      <Stack.Screen name="Roster" options={{ title: 'Roster' }}>
        {(props) => <LazyScreen component={RosterScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen
        name="PlayerProfile"
        options={({ route }: any) => ({ title: route.params?.playerName || 'Player Profile' })}
      >
        {(props) => <LazyScreen component={PlayerProfileScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="EvaluationRoster" options={{ title: 'Evaluate Players' }}>
        {(props) => <LazyScreen component={EvaluationRosterScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="CreateEvaluation" options={{ title: 'Player Evaluation' }}>
        {(props) => <LazyScreen component={CreateEvaluationScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="TeamStaff" options={{ title: 'Team Staff' }}>
        {(props) => <LazyScreen component={TeamStaffScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="PlayerEvaluations" options={{ title: 'Player Evaluations' }}>
        {(props) => <LazyScreen component={PlayerEvaluationsScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="TeamCertificates" options={{ title: 'Team Certificates' }}>
        {(props) => <LazyScreen component={TeamCertificatesScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="Resources" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={ResourcesScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="Health" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={HealthScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="WellnessHub" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={WellnessHubScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="WellnessCategory" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={WellnessCategoryScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="WellnessTopic" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={WellnessTopicScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="WellnessParentDashboard" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={WellnessParentDashboardScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="SkillsLibrary" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={SkillsLibraryScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="TeamResources" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={TeamResourcesScreen} {...props} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

function ChatStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: styles.header,
        headerTintColor: '#fff',
        headerTitleStyle: styles.headerTitle,
      }}
    >
      <Stack.Screen
        name="Conversations"
        component={ChatScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DirectMessages"
        component={DirectMessagesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DMChat"
        component={DMChatScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TeamChatRoom"
        component={TeamChatRoomScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="GroupInfo" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={GroupInfoScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="ChatInfo" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={ChatInfoScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="ChannelPolls" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={ChannelPollsScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="ChannelFiles" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={ChannelFilesScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="ChannelLinks" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={ChannelLinksScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="StaffMessage" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={StaffMessageScreen} {...props} />}
      </Stack.Screen>
      {/* CLUB-ANNOUNCE-V1-MOBILE (ruling 2026-11-03 01:57). The club's
          announcements as a feed of cards, one card in full, and staff compose.
          All three live in ChatStack and not on the root stack: the feed
          REPLACES TeamChatRoom for the club's default club chat, it is reached
          from the same chat-list row, and a root-stack screen would cover the
          tab bar — the same reason the Playbook reader sits inside HomeStack.
          A push tap routes here too (routeNotification's chat branch, when the
          payload carries `announcement: true`). */}
      <Stack.Screen name="AnnouncementsFeed" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={AnnouncementsFeedScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="AnnouncementDetail" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={AnnouncementDetailScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="ComposeAnnouncement" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={ComposeAnnouncementScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="PollDetail" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={PollDetailScreen} {...props} />}
      </Stack.Screen>
      {/* Target of "View Read History" in the message long-press sheet
          (TeamChatRoomScreen). The navigate call shipped without this route,
          so the action silently did nothing. */}
      <Stack.Screen name="MessageReadHistory" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={MessageReadHistoryScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function CalendarStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: styles.header,
        headerTintColor: '#fff',
        headerTitleStyle: styles.headerTitle,
      }}
    >
      <Stack.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="LineupView" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={LineupViewScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="PreGameSetup" options={{ headerShown: false, presentation: 'modal' }}>
        {(props) => <LazyScreen component={PreGameSetupScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="StatsConsole" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={StatsConsoleScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="LiveSpectator" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={LiveSpectatorScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="MatchSummary" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={MatchSummaryScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: styles.header,
        headerTintColor: '#fff',
        headerTitleStyle: styles.headerTitle,
      }}
    >
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          headerRight: () => <NotificationBell />,
        }}
      />
      <Stack.Screen name="EditProfile" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={EditProfileScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="ChangePassword" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={ChangePasswordScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="EditChild" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={EditChildScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="MyRegistrations" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={MyRegistrationsScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="MyFamily" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={MyFamilyScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="RegistrationDetail" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={RegistrationDetailScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="PaymentMethods" options={{ title: 'Payment Methods' }}>
        {(props) => <LazyScreen component={PaymentMethodsScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="PaymentHistory" options={{ title: 'Payment History' }}>
        {(props) => <LazyScreen component={PaymentHistoryScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="ParentPayments" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={ParentPaymentsScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: false }}
      />
      {/* The bell lives in this stack's header too, so notification taps must land here. */}
      <Stack.Screen name="StaffRequests" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={StaffRequestsScreen} {...props} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

function RootStackNavigator() {
  const { user } = useAuth();
  const initialRouteRef = React.useRef<'Main' | 'Welcome'>(user ? 'Main' : 'Welcome');

  return (
    <FamilyCheckoutProvider>
      <RootStack.Navigator
        initialRouteName={initialRouteRef.current}
        screenOptions={{
          headerShown: false,
          headerStyle: styles.header,
          headerTintColor: '#fff',
          headerTitleStyle: styles.headerTitle,
        }}
      >
      <RootStack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
      <RootStack.Screen name="Login" component={LoginScreen} />
      <RootStack.Screen name="Main" component={MainTabs} />
      {/* Registration Screens - No Auth Required */}
      <RootStack.Screen
        name="JoinTeam"
        component={JoinTeamScreen}
        options={{ title: 'Join Team', headerShown: true }}
      />
      <RootStack.Screen
        name="Support"
        component={SupportScreen}
        options={{ title: 'Support', headerShown: false }}
      />
      <RootStack.Screen
        name="JoinStaff"
        component={JoinStaffScreen}
        options={{ title: 'Join Staff', headerShown: true }}
      />
      <RootStack.Screen
        name="RegisterClub"
        component={RegisterClubScreen}
        options={{ title: 'Register Club', headerShown: true }}
      />
      <RootStack.Screen
        name="RegisterTeam"
        component={RegisterTeamScreen}
        options={{ title: 'Register Team', headerShown: true }}
      />
      <RootStack.Screen
        name="RegisterCreator"
        component={RegisterCreatorScreen}
        options={{ title: 'Become a Creator', headerShown: true }}
      />
      <RootStack.Screen
        name="ProgramRegistration"
        component={ProgramRegistrationScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name="AcceptCoParent"
        component={AcceptCoParentScreen}
        options={{ title: 'Accept Invitation', headerShown: true }}
      />
      <RootStack.Screen
        name="ClaimPlayer"
        component={ClaimPlayerScreen}
        options={{ title: 'Claim Player', headerShown: true }}
      />
      <RootStack.Screen
        name="Invitation"
        component={InvitationAuthWrapper}
        options={{ headerShown: false }}
        initialParams={{ token: '' }}
      />
      <RootStack.Screen
        name="Invitations"
        component={FamilyInvitationsScreen}
        options={{ headerShown: false }}
        initialParams={{ email: '' }}
      />
      <RootStack.Screen
        name="InvitationQuestions"
        component={InvitationQuestionsScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name="InvitationPayment"
        component={InvitationPaymentScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name="InvitationVolunteer"
        component={InvitationVolunteerScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name="InvitationDonate"
        component={InvitationDonateScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name="InvitationAid"
        component={InvitationAidScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name="InvitationCheckout"
        component={InvitationCheckoutScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name="InvitationSuccess"
        component={InvitationSuccessScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name="InvitationCancel"
        component={InvitationCancelScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen name="PreGameSetup" options={{ headerShown: false, presentation: 'modal' }}>
        {(props) => <LazyScreen component={PreGameSetupScreen} {...props} />}
      </RootStack.Screen>
      <RootStack.Screen name="StatsConsole" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={StatsConsoleScreen} {...props} />}
      </RootStack.Screen>
      <RootStack.Screen name="LiveSpectator" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={LiveSpectatorScreen} {...props} />}
      </RootStack.Screen>
      <RootStack.Screen name="MatchSummary" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={MatchSummaryScreen} {...props} />}
      </RootStack.Screen>
      <RootStack.Screen name="NotificationSettings" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={NotificationSettingsScreen} {...props} />}
      </RootStack.Screen>
      {__DEV__ && PlaybookDevHarnessScreen ? (
        <RootStack.Screen name="PlaybookDev" options={{ headerShown: false }}>
          {(props) => <LazyScreen component={PlaybookDevHarnessScreen} {...props} />}
        </RootStack.Screen>
      ) : null}
      <RootStack.Screen
        name="NotFound"
        component={NotFoundScreen}
        options={{ title: 'Not Found', headerShown: true }}
      />
    </RootStack.Navigator>
    </FamilyCheckoutProvider>
  );
}

/**
 * F-4: the notification ids that have ALREADY been routed, for this process.
 *
 * MODULE SCOPE, not a ref, and that is the point. It used to be
 * `routedNotificationIdsRef`, which dies with the component — so a Fast
 * Refresh, a sign-out/in, or any other remount of `AppNavigator` started with
 * an empty set, re-read the same stored cold-start response, and routed the
 * same tap a second time. A module-level set outlives every remount, and the
 * native value is cleared as well (`forgetColdStartResponse` below), so one
 * tap routes exactly once per app launch.
 */
const routedNotificationIds = new Set<string>();

/**
 * Hand the stored cold-start response back to the native module once JS has
 * taken custody of it.
 *
 * `clearLastNotificationResponse` is in `expo-notifications` for exactly this
 * ("may be used when an app selects a route based on the notification
 * response, and it is undesirable to continue selecting the route after the
 * response has already been handled"). Without it the value survives in the
 * native module for the life of the process and any later mount can read it
 * again.
 *
 * try/catch, not a feature test: like its getter it throws
 * `UnavailabilityError` where the native method is absent (Expo Go, web).
 * Nothing to report — it means there was no stored response to clear.
 */
function forgetColdStartResponse() {
  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    // No native store on this platform. Nothing to clear.
  }
}

export default function AppNavigator() {
  const { user, loading } = useAuth();
  const { pendingProgramId, setPendingProgramId, registrationData } = useRegistration();
  const navigationRef = React.useRef<any>(null);
  /**
   * F-4: the tap that is waiting for the app to be able to act on it.
   *
   * STATE, NOT A REF, and that is the fix. It was `pendingNotificationRef`,
   * and a ref write triggers no re-render — so nothing ever re-evaluated the
   * flush condition, and a payload that arrived AFTER `loading` had already
   * settled was stranded with no second `loading` transition to release it
   * (docs/recon/f4-coldstart-push.md §2 HOLE 1). As state it re-renders, and
   * the flush effect below is woken by the payload itself.
   */
  const [pendingNotification, setPendingNotification] = React.useState<
    Record<string, any> | null
  >(null);
  /**
   * The held payload's own notification id, kept beside it so the id can be
   * recorded as routed when the route is DISPATCHED rather than when the
   * response is first seen (§2 HOLE 3), and so a duplicate delivery of the
   * same response while it is still held is recognised instead of re-stashed.
   */
  const pendingNotificationIdRef = React.useRef<string | null>(null);
  /**
   * F-4: is the navigation container READY — its own signal, from `onReady`.
   *
   * Both: a ref, because the notification listener fires outside React and
   * needs the CURRENT answer rather than whatever a `[]` effect closed over;
   * and state, because the flush effect has to be woken when it flips. The
   * old code tested `navigationRef.current` for non-null, which is true from
   * the moment the container MOUNTS — strictly earlier than when it can
   * handle an action (§2 HOLE 2).
   */
  const navReadyRef = React.useRef(false);
  const [navReady, setNavReady] = React.useState(false);
  const hasMountedNavRef = React.useRef(false);

  // Navigate when auth state changes
  React.useEffect(() => {
    if (!loading && navigationRef.current) {
      const currentRoute = navigationRef.current.getCurrentRoute()?.name;

      if (user && (currentRoute === 'Login' || currentRoute === 'Welcome')) {
        // Guard: in-progress team join — leave JoinTeamScreen mounted underneath
        if (
          registrationData?.activeFlow === 'join-team' &&
          registrationData?.teamInviteCode
        ) {
          if (__DEV__) {
            console.log('[AppNavigator] Auth restored mid join-team flow — staying on JoinTeam');
          }
          return;
        }

        if (pendingProgramId) {
          const returnProgramId = pendingProgramId;
          setPendingProgramId(null);
          navigationRef.current.reset({
            index: 0,
            routes: [
              {
                name: 'ProgramRegistration',
                params: { programId: returnProgramId },
              },
            ],
          });
        } else {
          navigationRef.current.reset({
            index: 0,
            routes: [{ name: 'Main' }],
          });
        }
      } else if (
        !user &&
        currentRoute !== 'Welcome' &&
        currentRoute !== 'Login' &&
        ![
          'JoinTeam',
          'Support',
          'JoinStaff',
          'RegisterClub',
          'RegisterTeam',
          'RegisterCreator',
          'ProgramRegistration',
          'AcceptCoParent',
          'ClaimPlayer',
          'Invitation',
          'Invitations',
          'NotFound',
        ].includes(currentRoute ?? '')
      ) {
        navigationRef.current.reset({
          index: 0,
          routes: [{ name: 'Welcome' }],
        });
      }
    }
  }, [user, loading, pendingProgramId, setPendingProgramId]);

  /**
   * THE ONE ROUTER — unchanged by F-4, deliberately. Not a branch in it is
   * touched, so every type inherits the repaired cold-start path with no
   * per-type wiring.
   *
   * `useCallback` with NO dependencies is honest here, not a shortcut: the
   * body reads `navigationRef` (a ref), the module constant `playbookVisible`
   * and the imported `isAnnounceCardKey`, and nothing else from this
   * component's scope. A stable identity is what lets it be named in both
   * effects' dependency arrays below instead of being quietly omitted.
   */
  const routeNotification = React.useCallback((data: Record<string, any>) => {
    const nav = navigationRef.current;
    if (!nav) return;
    const type = data.type ?? data.reference_type;

    if (type === 'chat_message' || type === 'chat' || type === 'message') {
      const channelId = data.channel_id ?? data.chat_id ?? data.reference_id;
      if (channelId) {
        /* CLUB-ANNOUNCE-V1-MOBILE. A club announcement pushes as an ordinary
           chat message — the trigger on `comm_messages` is the only sender and
           it does not know what a card is (recon §B11) — so the TYPE cannot
           tell the two apart. The club chat's payload carries
           `announcement: true` instead, and a tap on it opens the CARD FEED
           rather than the bubble room. Anything else, including the club chat
           with no flag, lands exactly where it does today.

           Accepted truthily: a REMOTE push's `data` values arrive as strings
           (`docs/recon/announce-push-test.md` — the whole payload is JSON in
           `userInfo["body"]`), so `"true"` has to mean the same as `true` or
           the flag would work on the simulator and nowhere else. */
        const announcement =
          data.announcement === true ||
          data.announcement === 'true' ||
          data.announcement === 1 ||
          data.announcement === '1';
        nav.navigate('Main', {
          screen: 'ChatTab',
          params: {
            screen: announcement ? 'AnnouncementsFeed' : 'TeamChatRoom',
            params: { channelId },
          },
        });
      }
    } else if (
      type === 'event_reminder' || type === 'event_created' ||
      type === 'event_changed' || type === 'event_cancelled' ||
      type === 'event' || data.reference_type === 'event'
    ) {
      const eventId = data.event_id ?? data.reference_id;
      if (eventId) {
        nav.navigate('EventDetail', { eventId, onRefetch: () => {} });
      } else {
        // No event id: a series cancellation clears it server-side, because
        // the row it pointed at is being deleted and EventDetail would open
        // dead. Land on the calendar instead of doing nothing.
        //
        // Explicit nested target, not a bare navigate('Calendar'): Calendar
        // is registered only inside CalendarStack, so the root navigator
        // cannot resolve it by name. Same shape as the chat branch above.
        //
        // Readiness needs nothing extra -- this sits inside
        // routeNotification, which already returned early if
        // navigationRef.current was null, and a tap that arrives before the
        // navigator can act is HELD in `pendingNotification` and replayed
        // once the container reports ready and the session has restored
        // (F-4; docs/recon/f4-coldstart-push.md).
        nav.navigate('Main', { screen: 'CalendarTab', params: { screen: 'Calendar' } });
      }
    } else if (type === 'lineup_published') {
      if (data.event_id) {
        nav.navigate('EventDetail', { eventId: data.event_id, onRefetch: () => {} });
      } else if (data.team_id) {
        nav.navigate('Main', {
          screen: 'HomeTab',
          params: { screen: 'LineupList', params: { teamId: data.team_id } },
        });
      }
    } else if (type === 'playbook_question' || type === 'playbook_answer') {
      /* PLAYBOOK-COACH-TRACK-MOBILE. The two pushes migration
         20261102033000 fires (:819, :892), and they land in two different
         places because they have two different readers:

           playbook_question  a coach was told a player asked something ->
                              the inbox thread for that question;
           playbook_answer    the asker was told a coach replied -> their own
                              messages, which live on the end-of-chapter
                              screen. The reader looks the chapter up from the
                              question id, because this payload has none.

         Both carry `question_id` in `data`; `card_key` is passed through as
         the book's existing `card` param so a tap still lands on the right
         card if the question row has gone. Nested navigate (Main -> HomeTab
         -> Playbook), the same shape as the chat branch above, because the
         reader lives in HomeStack and the root navigator cannot resolve it
         by name. Gated by `playbookVisible` at the route, so a tap on a
         build with the book switched off simply finds no screen. */
      const questionId = data.question_id ?? data.reference_id;
      nav.navigate('Main', {
        screen: 'HomeTab',
        params: {
          screen: 'Playbook',
          params: {
            card: data.card_key ?? undefined,
            question: questionId,
            questionMode: type === 'playbook_question' ? 'inbox' : 'family',
          },
        },
      });
    } else if (type === 'playbook_open' || type === 'courses_open') {
      /* PLAYBOOK-ANNOUNCE-PUSH (ruling B, Lu, 2026-11-03 01:19). Two
         announcement taps -- "read this" rather than "someone wrote to you",
         which is what the two question types above are. RECEIVING SIDE ONLY:
         nothing in this app sends either type yet.

           playbook_open   -> the book. With `data.card` (a card key such as
                              "F7") it opens on that card, and on the cover
                              without one, or when the key is not key-shaped,
                              or when the key names a card this viewer's book
                              does not hold (the reader's own fallback, see
                              src/constants/announceCardKey.ts).
           courses_open    -> the Courses screen.

         THE GATE IS CHECKED HERE, not only at the route. `playbookVisible`
         false means the `Playbook` screen is not registered at all
         (:349 below), so navigating to it would land on nothing; a viewer who
         cannot see the book is sent to the Dashboard -- the Home tab's first
         screen -- instead of into a dead navigate. The two question types
         above predate this ruling and still rely on the route being absent.

         `data.card` is the ruling's name for the key. `data.card_key` is
         accepted too, because that is what the server already sends on the
         two question types and one sender should not have to learn two
         spellings for one thing.

         Nested navigate (Main -> HomeTab -> <screen>): both targets live in
         HomeStack, so the root navigator cannot resolve either by name. Same
         shape as every branch above, which is also why both types inherit the
         foreground, background and pre-navigator paths with no extra wiring
         -- see the listener and the pending-tap flush below. */
      if (type === 'courses_open') {
        nav.navigate('Main', { screen: 'HomeTab', params: { screen: 'Courses' } });
      } else if (!playbookVisible) {
        nav.navigate('Main', { screen: 'HomeTab', params: { screen: 'Dashboard' } });
      } else {
        const rawCard = data.card ?? data.card_key;
        const card = isAnnounceCardKey(rawCard) ? rawCard : undefined;
        nav.navigate('Main', {
          screen: 'HomeTab',
          params: { screen: 'Playbook', params: { card } },
        });
      }
    } else if (type === 'survey' || type === 'survey_reminder') {
      if (data.survey_id) {
        nav.navigate('Main', {
          screen: 'HomeTab',
          params: { screen: 'SurveyResponse', params: { surveyId: data.survey_id } },
        });
      }
    } else if (type === 'evaluation' || type === 'evaluation_published') {
      const evaluationId = data.evaluation_id ?? data.reference_id;
      if (evaluationId) {
        nav.navigate('EvaluationDetail', { evaluationId });
      }
    } else if (type === 'staff_request') {
      const staffTeamId = data.teamId ?? data.team_id;
      if (staffTeamId) {
        nav.navigate('Main', {
          screen: 'HomeTab',
          params: {
            screen: 'StaffRequests',
            params: { teamId: staffTeamId, team_id: staffTeamId },
          },
        });
      }
    } else {
      nav.navigate('Notifications');
    }
  }, []);

  /**
   * Push taps — BOTH delivery paths, through ONE door.
   *
   *   LISTENER      a tap while the app is running or backgrounded. Lu proved
   *                 both on an iPhone (Round 3, 2026-11-04), and neither
   *                 changes here: when the navigator is ready this still
   *                 calls `routeNotification` immediately and synchronously.
   *   COLD START    a tap that LAUNCHED the app from killed. The native module
   *                 stores it and ALSO replays it as an event once its
   *                 delegate registers, so it reaches JS twice and may reach
   *                 it late — see docs/recon/f4-coldstart-push.md §1, which
   *                 reads the two Swift files that do it.
   *
   * F-4 (Lu's phone, 2026-11-04): a killed-app tap opened the app and routed
   * NOWHERE. The cold read existed; the HOLD did not work. `handleResponse`
   * stashed the payload in a ref and a flush effect keyed on `loading`
   * changing was supposed to replay it — so a payload arriving after
   * `loading` had settled was never flushed, a mounted-but-not-ready
   * container swallowed the navigate, and the id was marked routed before
   * either had a chance, which blocked the retry. The four holes and their
   * proof are in the recon file's §2.
   *
   * WHAT THIS EFFECT NOW DOES: route when the app can act, HOLD when it
   * cannot, and record the id only when the route is actually dispatched. It
   * decides nothing about readiness itself — `canRouteNow` is the single test
   * and the flush effect below uses the same one.
   *
   * ONE TAP NEVER ROUTES TWICE. `routedNotificationIds` is module-scoped, so
   * it survives a remount, and the stored native response is cleared the
   * moment JS takes custody of it. Whether the listener also receives the
   * cold-start response is timing we do not control (UNKNOWN by design); it
   * no longer matters, because whichever arrival is acted on first wins and
   * the id is already held or recorded.
   *
   * A response with no identifier (not a shape the SDK is documented to
   * produce) is routed without the guard rather than dropped: a tap that goes
   * nowhere is the worse failure.
   *
   * try/catch, not a feature test: `getLastNotificationResponse` THROWS an
   * `UnavailabilityError` when the native method is absent -- Expo Go and web
   * (node_modules/expo-notifications/build/NotificationsEmitter.js:106).
   * There is nothing to report: it means "this platform has no cold-start
   * response", not that a tap was lost.
   */
  React.useEffect(() => {
    /**
     * Can a tap be acted on RIGHT NOW? The container's own `onReady` signal,
     * plus its own `isReady()` as the belt to that braces. Read from refs
     * because this runs outside React's render, from a native event.
     *
     * `!== false` rather than `=== true`: a ref without an `isReady` method
     * answers `undefined`, which must not block — `navReadyRef` is the
     * primary gate and `isReady()` only ever overrules it with a hard no.
     */
    const canRouteNow = () =>
      navReadyRef.current && navigationRef.current?.isReady?.() !== false;

    const handleResponse = (response: Notifications.NotificationResponse) => {
      const id = response?.notification?.request?.identifier ?? null;
      // Already routed, in this launch, by whichever path got there first.
      if (id && routedNotificationIds.has(id)) return;
      // The same response arriving twice while it is still being held.
      if (id && pendingNotificationIdRef.current === id) return;

      const data = response?.notification?.request?.content?.data as
        | Record<string, any>
        | undefined;
      if (!data) return;

      if (canRouteNow()) {
        // The live path, unchanged: record it, then go.
        if (id) routedNotificationIds.add(id);
        routeNotification(data);
        return;
      }

      /*
       * Hold it. The id is NOT recorded yet — it is recorded when the flush
       * dispatches, so that a tap which is held and then dropped can still be
       * delivered again rather than being refused as a duplicate of a route
       * that never happened.
       */
      pendingNotificationIdRef.current = id;
      setPendingNotification(data);
    };

    const unsubscribe = addNotificationListeners(undefined, handleResponse);

    try {
      const coldStart = Notifications.getLastNotificationResponse();
      if (coldStart) {
        handleResponse(coldStart);
        // JS owns this tap now: held in state or already routed. Clearing the
        // native copy is what stops a later mount reading it again.
        forgetColdStartResponse();
      }
    } catch {
      // Platform has no stored response to hand over. Nothing to do.
    }

    return unsubscribe;
  }, [routeNotification]);

  /**
   * F-4: release a held tap the moment the app can act on it.
   *
   * THE DEPENDENCIES ARE THE FIX. This effect waits on the four things that
   * actually have to be true, and it is woken when any of them changes:
   *
   *   pendingNotification   there is a tap to replay (STATE, so it wakes this)
   *   navReady              the container reported itself ready
   *   loading               the stored session has finished restoring
   *   user                  and there IS a signed-in user to restore it for
   *
   * The old version waited on `loading` alone and read the payload out of a
   * ref, which is why a cold-start tap could sit in that ref forever.
   *
   * SIGNED OUT => THE TAP IS DROPPED, not queued. `loading` false with no
   * `user` is a signed-out app; every target lives inside `Main`, which a
   * signed-out user is not in. So it is thrown away and the app lands on
   * sign-in — no crash, and nothing fires later when they do sign in, which
   * would be a tap acting minutes after it was made.
   *
   * THE 500 ms IS THE ONE IT ALWAYS HAD. The auth effect above may `reset()`
   * the stack to `Main` in the same commit this flush runs in, and a navigate
   * dispatched into that is swallowed. The delay predates F-4 and is kept
   * exactly as it was rather than retuned on a device nobody here can see.
   *
   * AND IT RETURNS NO CLEANUP, deliberately. Clearing the held payload is a
   * `setState`, so this effect re-runs immediately — and React runs the
   * previous invocation's cleanup BEFORE the next one. A `clearTimeout`
   * cleanup here would therefore cancel its own pending route every single
   * time. The timer is left to fire; `routeNotification` reads
   * `navigationRef.current` and returns if the navigator has gone, which is
   * the only thing that cleanup would have protected against.
   */
  React.useEffect(() => {
    if (!pendingNotification) return;
    if (!navReady || navigationRef.current?.isReady?.() === false) return;
    // The session is still being restored: wait for the next change.
    if (loading) return;

    if (!user) {
      setPendingNotification(null);
      pendingNotificationIdRef.current = null;
      forgetColdStartResponse();
      return;
    }

    const data = pendingNotification;
    const id = pendingNotificationIdRef.current;
    setPendingNotification(null);
    pendingNotificationIdRef.current = null;
    if (id) routedNotificationIds.add(id);

    setTimeout(() => routeNotification(data), 500);
  }, [pendingNotification, navReady, loading, user, routeNotification]);

  // Only show the full-screen loader on the very first load, before the
  // navigator has ever mounted. After that, keep the NavigationContainer
  // mounted across loading toggles (e.g. mid-flow sign-in) so in-progress
  // screens are never destroyed.
  if (loading && !hasMountedNavRef.current) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      fallback={<LoadingScreen />}
      onReady={() => {
        hasMountedNavRef.current = true;
        /*
         * F-4: the container's own readiness signal, which is what a push tap
         * has to wait for. It was already captured here and used only by the
         * spinner's early return above; now it also releases a held tap.
         * The ref is for the listener (it fires outside React), the state is
         * what wakes the flush effect.
         */
        navReadyRef.current = true;
        setNavReady(true);
      }}
    >
      <TeamsProvider>
        <ChatUnreadProvider>
          <RootStackNavigator />
        </ChatUnreadProvider>
      </TeamsProvider>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 16,
  },
  tabBar: {
    backgroundColor: '#1F2937',
    borderTopColor: '#374151',
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 24,
    height: 80,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  tabBarIconStyle: {
    marginTop: 4,
  },
  header: {
    backgroundColor: '#1a1a2e',
    shadowColor: 'transparent',
    elevation: 0,
  },
  headerTitle: {
    fontWeight: '600',
    fontSize: 18,
  },
});
