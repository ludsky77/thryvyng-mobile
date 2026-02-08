import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { linking, type RootStackParamList } from './linking';
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

// Screens
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ChatScreen from '../screens/ChatScreen';
import TeamChatRoomScreen from '../screens/TeamChatRoomScreen';
import DirectMessagesScreen from '../screens/DirectMessagesScreen';
import DMChatScreen from '../screens/DMChatScreen';
import GroupInfoScreen from '../screens/GroupInfoScreen';
import CalendarScreen from '../screens/CalendarScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import ProfileScreen from '../screens/ProfileScreen';
import TeamsScreen from '../screens/TeamsScreen';
import TeamDetailScreen from '../screens/TeamDetailScreen';
import RosterScreen from '../screens/RosterScreen';
import CreateEvaluationScreen from '../screens/CreateEvaluationScreen';
import TeamStaffScreen from '../screens/TeamStaffScreen';
import PlayerProfileScreen from '../screens/PlayerProfileScreen';
import EvaluationDetailScreen from '../screens/EvaluationDetailScreen';
import CertificateViewerScreen from '../screens/CertificateViewerScreen';
import CoursesScreen from '../screens/CoursesScreen';
import MyCoursesScreen from '../screens/MyCoursesScreen';
import CourseDetailScreen from '../screens/CourseDetailScreen';
import CoursePlayerScreen from '../screens/CoursePlayerScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import PaymentMethodsScreen from '../screens/PaymentMethodsScreen';
import PaymentHistoryScreen from '../screens/PaymentHistoryScreen';
import InvitePlayerScreen from '../screens/InvitePlayerScreen';
import PlayerEvaluationsScreen from '../screens/PlayerEvaluationsScreen';
import TeamCertificatesScreen from '../screens/TeamCertificatesScreen';
import GamesHubScreen from '../screens/GamesHubScreen';
import GamePlayScreen from '../screens/GamePlayScreen';

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

const TAB_ICONS: Record<string, string> = {
  Home: 'home',
  Teams: 'users',
  Chat: 'message-circle',
  Calendar: 'calendar',
  Profile: 'user',
};

function MainTabs() {
  const { currentRole } = useAuth();

  const isStaff =
    currentRole &&
    [
      'head_coach',
      'assistant_coach',
      'team_manager',
      'club_admin',
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
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PlayerProfile"
        component={PlayerProfileScreen}
        options={({ route }: any) => ({
          title: route.params?.playerName || 'Player Profile',
        })}
      />
      <Stack.Screen
        name="EvaluationDetail"
        component={EvaluationDetailScreen}
        options={{ title: 'Evaluation' }}
      />
      <Stack.Screen
        name="CertificateViewer"
        component={CertificateViewerScreen}
        options={{ title: 'Certificate' }}
      />
      <Stack.Screen
        name="MyCourses"
        component={MyCoursesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Courses"
        component={CoursesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CourseDetail"
        component={CourseDetailScreen}
        options={{ title: 'Course' }}
      />
      <Stack.Screen
        name="CoursePlayer"
        component={CoursePlayerScreen}
        options={{ headerShown: false }}
      />
      {/* Team-related screens accessible from CoachDashboard */}
      <Stack.Screen
        name="Roster"
        component={RosterScreen}
        options={{ title: 'Team Roster' }}
      />
      <Stack.Screen
        name="TeamStaff"
        component={TeamStaffScreen}
        options={{ title: 'Team Staff' }}
      />
      <Stack.Screen
        name="PlayerEvaluations"
        component={PlayerEvaluationsScreen}
        options={{ title: 'Player Evaluations' }}
      />
      <Stack.Screen
        name="TeamCertificates"
        component={TeamCertificatesScreen}
        options={{ title: 'Team Certificates' }}
      />
      <Stack.Screen
        name="CreateEvaluation"
        component={CreateEvaluationScreen}
        options={{ title: 'New Evaluation' }}
      />
      <Stack.Screen
        name="InvitePlayer"
        component={InvitePlayerScreen}
        options={{ title: 'Invite Player' }}
      />
      <Stack.Screen
        name="GamesHub"
        component={GamesHubScreen as any}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="GamePlay"
        component={GamePlayScreen as any}
        options={{ headerShown: false }}
      />
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
      <Stack.Screen
        name="Roster"
        component={RosterScreen}
        options={{ title: 'Roster' }}
      />
      <Stack.Screen
        name="PlayerProfile"
        component={PlayerProfileScreen}
        options={({ route }: any) => ({
          title: route.params?.playerName || 'Player Profile',
        })}
      />
      <Stack.Screen
        name="CreateEvaluation"
        component={CreateEvaluationScreen}
        options={{ title: 'New Evaluation' }}
      />
      <Stack.Screen
        name="TeamStaff"
        component={TeamStaffScreen}
        options={{ title: 'Team Staff' }}
      />
      <Stack.Screen
        name="InvitePlayer"
        component={InvitePlayerScreen}
        options={{ title: 'Invite Player' }}
      />
      <Stack.Screen
        name="PlayerEvaluations"
        component={PlayerEvaluationsScreen}
        options={{ title: 'Player Evaluations' }}
      />
      <Stack.Screen
        name="TeamCertificates"
        component={TeamCertificatesScreen}
        options={{ title: 'Team Certificates' }}
      />
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
      <Stack.Screen
        name="GroupInfo"
        component={GroupInfoScreen}
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
      <Stack.Screen
        name="Attendance"
        component={AttendanceScreen}
        options={{ title: 'Take Attendance' }}
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
        options={{ title: 'Profile' }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: 'Edit Profile' }}
      />
      <Stack.Screen
        name="PaymentMethods"
        component={PaymentMethodsScreen}
        options={{ title: 'Payment Methods' }}
      />
      <Stack.Screen
        name="PaymentHistory"
        component={PaymentHistoryScreen}
        options={{ title: 'Payment History' }}
      />
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
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

function RootStackNavigator() {
  const { user } = useAuth();
  return (
    <RootStack.Navigator
      initialRouteName={user ? 'Main' : 'Login'}
      screenOptions={{
        headerShown: false,
        headerStyle: styles.header,
        headerTintColor: '#fff',
        headerTitleStyle: styles.headerTitle,
      }}
    >
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
        options={{ title: 'Program Registration', headerShown: true }}
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
        name="NotFound"
        component={NotFoundScreen}
        options={{ title: 'Not Found', headerShown: true }}
      />
    </RootStack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();
  const navigationRef = React.useRef<any>(null);

  // Navigate when auth state changes
  React.useEffect(() => {
    if (!loading && navigationRef.current) {
      const currentRoute = navigationRef.current.getCurrentRoute()?.name;

      if (user && currentRoute === 'Login') {
        // User logged in, go to Main
        navigationRef.current.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        });
      } else if (
        !user &&
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
          'NotFound',
        ].includes(currentRoute ?? '')
      ) {
        // User logged out, go to Login (but allow registration screens)
        navigationRef.current.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }
    }
  }, [user, loading]);

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
