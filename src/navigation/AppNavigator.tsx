import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '🏠',
    Teams: '👥',
    Chat: '💬',
    Calendar: '📅',
    Profile: '👤',
  };

  return (
    <Text
      style={[styles.tabIcon, focused && styles.tabIconFocused]}
    >
      {icons[name] || '📱'}
    </Text>
  );
}

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
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#8b5cf6',
        tabBarInactiveTintColor: '#666',
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarIconStyle: styles.tabBarIcon,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon name="Home" focused={focused} />,
        }}
      />

      {isStaff && (
        <Tab.Screen
          name="TeamsTab"
          component={TeamsStack}
          options={{
            tabBarLabel: 'Teams',
            tabBarIcon: ({ focused }) => (
              <TabIcon name="Teams" focused={focused} />
            ),
          }}
        />
      )}

      <Tab.Screen
        name="ChatTab"
        component={ChatStack}
        options={{
          tabBarLabel: 'Chat',
          tabBarIcon: ({ focused }) => <TabIcon name="Chat" focused={focused} />,
        }}
      />

      <Tab.Screen
        name="CalendarTab"
        component={CalendarStack}
        options={{
          tabBarLabel: 'Calendar',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="Calendar" focused={focused} />
          ),
        }}
      />

      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="Profile" focused={focused} />
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
        options={{ title: 'Chat' }}
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

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <MainTabs /> : <AuthStack />}
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
    backgroundColor: '#1a1a2e',
    borderTopColor: '#2a2a4e',
    borderTopWidth: 1,
    height: 90,
    paddingBottom: 20,
    paddingTop: 10,
  },
  tabBarLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 5,
  },
  tabBarIcon: {
    marginTop: 5,
  },
  tabIcon: {
    fontSize: 26,
  },
  tabIconFocused: {
    transform: [{ scale: 1.1 }],
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
