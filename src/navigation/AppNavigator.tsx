import React, { lazy, Suspense } from 'react';
import { useTotalChatUnread } from '../hooks/useTotalChatUnread';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useRegistration } from '../contexts/RegistrationContext';
import { FamilyCheckoutProvider } from '../contexts/FamilyCheckoutContext';
import { linking, type RootStackParamList } from './linking';
import { addNotificationListeners } from '../services/notifications';
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
import DashboardScreen from '../screens/DashboardScreen';
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
const PollDetailScreen = lazy(() => import('../screens/PollDetailScreen'));
const SurveyResponseScreen = lazy(() => import('../screens/SurveyResponseScreen'));
const SurveyListScreen = lazy(() => import('../screens/SurveyListScreen'));
const SurveyResultsScreen = lazy(() => import('../screens/SurveyResultsScreen'));
const AttendanceScreen = lazy(() => import('../screens/AttendanceScreen'));
const RosterScreen = lazy(() => import('../screens/RosterScreen'));
const CreateEvaluationScreen = lazy(() => import('../screens/CreateEvaluationScreen'));
const EvaluationRosterScreen = lazy(() => import('../screens/EvaluationRosterScreen'));
const TeamStaffScreen = lazy(() => import('../screens/TeamStaffScreen'));
const PlayerProfileScreen = lazy(() => import('../screens/PlayerProfileScreen'));
const EvaluationDetailScreen = lazy(() => import('../screens/EvaluationDetailScreen'));
const CertificateViewerScreen = lazy(() => import('../screens/CertificateViewerScreen'));
const CoursesScreen = lazy(() => import('../screens/CoursesScreen'));
const MyCoursesScreen = lazy(() => import('../screens/MyCoursesScreen'));
const CourseDetailScreen = lazy(() => import('../screens/CourseDetailScreen'));
const CoursePlayerScreen = lazy(() => import('../screens/CoursePlayerScreen'));
const NotificationSettingsScreen = lazy(() => import('../screens/NotificationSettingsScreen'));
const EditProfileScreen = lazy(() => import('../screens/EditProfileScreen'));
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
const PreGameSetupScreen = lazy(() => import('../screens/game-stats/PreGameSetupScreen'));
const StatsConsoleScreen = lazy(() => import('../screens/game-stats/StatsConsoleScreen'));
const MatchSummaryScreen = lazy(() => import('../screens/game-stats/MatchSummaryScreen'));
const LiveSpectatorScreen = lazy(() => import('../screens/game-stats/LiveSpectatorScreen'));

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
  const { currentRole } = useAuth();
  const totalChatUnread = useTotalChatUnread();

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
        tabBarStyle: styles.tabBar,
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
      <Stack.Screen name="GamesHub" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={GamesHubScreen} {...props} />}
      </Stack.Screen>
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
      <Stack.Screen name="GamePlay" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={GamePlayScreen} {...props} />}
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
      <Stack.Screen name="PollDetail" options={{ headerShown: false }}>
        {(props) => <LazyScreen component={PollDetailScreen} {...props} />}
      </Stack.Screen>
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
      <Stack.Screen name="Attendance" options={{ title: 'Take Attendance' }}>
        {(props) => <LazyScreen component={AttendanceScreen} {...props} />}
      </Stack.Screen>
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
      <Stack.Screen name="PaymentMethods" options={{ title: 'Payment Methods' }}>
        {(props) => <LazyScreen component={PaymentMethodsScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen name="PaymentHistory" options={{ title: 'Payment History' }}>
        {(props) => <LazyScreen component={PaymentHistoryScreen} {...props} />}
      </Stack.Screen>
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: false }}
      />
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
  return (
    <FamilyCheckoutProvider>
      <RootStack.Navigator
        initialRouteName={user ? 'Main' : 'Welcome'}
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
      <RootStack.Screen
        name="NotFound"
        component={NotFoundScreen}
        options={{ title: 'Not Found', headerShown: true }}
      />
    </RootStack.Navigator>
    </FamilyCheckoutProvider>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();
  const { pendingProgramId, setPendingProgramId } = useRegistration();
  const navigationRef = React.useRef<any>(null);

  // Navigate when auth state changes
  React.useEffect(() => {
    if (!loading && navigationRef.current) {
      const currentRoute = navigationRef.current.getCurrentRoute()?.name;

      if (user && (currentRoute === 'Login' || currentRoute === 'Welcome')) {
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

  // Handle push notification taps (e.g. lineup_published, event_reminder)
  React.useEffect(() => {
    const unsubscribe = addNotificationListeners(undefined, (response) => {
      const data = response.notification.request.content.data as Record<string, any> | undefined;
      if (!data || !navigationRef.current) return;

      const type = data.type ?? data.reference_type;
      if (type === 'lineup_published') {
        if (data.event_id) {
          navigationRef.current.navigate('EventDetail', {
            eventId: data.event_id,
            onRefetch: () => {},
          });
        } else if (data.team_id) {
          navigationRef.current.navigate('Main', {
            screen: 'HomeTab',
            params: { screen: 'LineupList', params: { teamId: data.team_id } },
          });
        }
      } else if ((type === 'event_reminder' || data.reference_type === 'event') && data.reference_id) {
        navigationRef.current.navigate('EventDetail', {
          eventId: data.reference_id,
          onRefetch: () => {},
        });
      } else if (type === 'survey' || type === 'survey_reminder') {
        if (data.survey_id) {
          navigationRef.current.navigate('Main', {
            screen: 'HomeTab',
            params: {
              screen: 'SurveyResponse',
              params: { surveyId: data.survey_id },
            },
          });
        }
      }
    });
    return unsubscribe;
  }, []);

  if (loading) {
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
    >
      <RootStackNavigator />
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
