/**
 * (demo)/admin — Tab layout for the demo admin portal.
 *
 * Mirrors the real (admin) layout but has no auth guard —
 * the demo.tsx entry screen handles sign-in before routing here.
 * All screens in this group are read-only; no writes to Supabase.
 */

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { AdminSidebar, TopBar } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

const DESKTOP_BREAKPOINT = 768;

export default function DemoAdminLayout() {
  const { theme } = useThemeStore();
  const { width } = useWindowDimensions();
  const isWide    = width >= DESKTOP_BREAKPOINT;
  const c         = theme.colors;

  const mobileTabBarStyle = {
    backgroundColor: c.surface,
    borderTopColor:  c.border,
    borderTopWidth:  1,
  };

  if (isWide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <AdminSidebar demoMode />
        <View style={{ flex: 1 }}>
          <TopBar />
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: 'none' },
              tabBarActiveTintColor:   c.primary,
              tabBarInactiveTintColor: c.textSubtle,
              tabBarLabelStyle: {
                fontFamily: theme.typography.fontFamily.medium,
                fontSize:   11,
              },
            }}
          >
            <Tabs.Screen name="index"             options={{ title: 'Dashboard' }} />
            <Tabs.Screen name="calendar"          options={{ title: 'Calendar' }} />
            <Tabs.Screen name="events-management" options={{ title: 'Events' }} />
            <Tabs.Screen name="members"           options={{ title: 'Members' }} />
            <Tabs.Screen name="announcements"     options={{ title: 'Announcements' }} />
            <Tabs.Screen name="dues"              options={{ title: 'Dues' }} />
            <Tabs.Screen name="status"            options={{ title: 'Status' }} />
            <Tabs.Screen name="profile"           options={{ title: 'Profile' }} />
          </Tabs>
        </View>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle:             mobileTabBarStyle,
        tabBarActiveTintColor:   c.primary,
        tabBarInactiveTintColor: c.textSubtle,
        tabBarLabelStyle: {
          fontFamily: theme.typography.fontFamily.medium,
          fontSize:   11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
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
        name="members"
        options={{
          title: 'Members',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="dues"
        options={{
          title: 'Dues',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cash-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="status"
        options={{
          title: 'Status',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="alert-circle-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden from tab bar */}
      <Tabs.Screen name="events-management" options={{ href: null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="announcements"     options={{ href: null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="profile"           options={{ href: null, tabBarItemStyle: { display: 'none' } }} />
    </Tabs>
  );
}
