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
import CalendarScreen from '../screens/CalendarScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import TeamsScreen from '../screens/TeamsScreen';
import TeamDetailScreen from '../screens/TeamDetailScreen';
import PlayerProfileScreen from '../screens/PlayerProfileScreen';

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
        name="PlayerProfile"
        component={PlayerProfileScreen}
        options={({ route }: any) => ({
          title: route.params?.playerName || 'Player Profile',
        })}
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
        name="TeamChatRoom"
        component={TeamChatRoomScreen}
        options={{ title: 'Chat' }}
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
