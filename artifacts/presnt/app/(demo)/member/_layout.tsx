/**
 * (demo)/member — Tab layout for the demo member portal.
 *
 * Mirrors the real (member) layout but has no auth guard.
 * All screens are read-only.
 */

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { Sidebar, TopBar } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

export default function DemoMemberLayout() {
  const { theme } = useThemeStore();
  const { width } = useWindowDimensions();
  const isWide    = width >= 800;
  const c         = theme.colors;

  const screenOptions = {
    headerShown: false,
    tabBarStyle: isWide
      ? { display: 'none' as const }
      : { backgroundColor: c.surface, borderTopColor: c.border, borderTopWidth: 1 },
    tabBarActiveTintColor:   c.primary,
    tabBarInactiveTintColor: c.textSubtle,
    tabBarLabelStyle: {
      fontFamily: theme.typography.fontFamily.medium,
      fontSize:   11,
    },
  };

  if (isWide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.background }}>
        <Sidebar />
        <View style={{ flex: 1 }}>
          <TopBar />
          <Tabs screenOptions={screenOptions}>
            <Tabs.Screen name="index"   options={{ title: 'Home' }} />
            <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
            <Tabs.Screen name="status"  options={{ title: 'Status' }} />
            <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
          </Tabs>
        </View>
      </View>
    );
  }

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="status"
        options={{
          title: 'Status',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
