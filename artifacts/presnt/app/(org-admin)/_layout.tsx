/**
 * Org Admin Layout
 *
 * Wraps the organization admin portal. Only accessible to users with
 * role === 'org_admin' (or superusers in User View simulating the role).
 *
 * Desktop: sidebar + top bar
 * Mobile:  bottom tab bar
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { OrgAdminSidebar, TopBar } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';

const DESKTOP_BREAKPOINT = 768;

export default function OrgAdminLayout() {
  const { theme }      = useThemeStore();
  const { membership } = useAuthStore();
  const { width }      = useWindowDimensions();
  const isWide         = width >= DESKTOP_BREAKPOINT;
  const userView       = useUserViewStore((s) => s.session);

  const role = membership?.role;
  // Allow entry for real org_admin, or a user-view session simulating org_admin
  const isUserViewOrgAdmin = userView?.role === 'org_admin';
  if (!isUserViewOrgAdmin && role !== 'org_admin') {
    return <Redirect href="/(member)" />;
  }

  const c = theme.colors;

  const mobileTabBarStyle = {
    backgroundColor: c.surface,
    borderTopColor:  c.border,
    borderTopWidth:  1,
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {/* Sidebar — desktop only */}
      {isWide && <OrgAdminSidebar />}

      {/* Content area */}
      <View style={{ flex: 1 }}>
        {/* TopBar — desktop only */}
        {isWide && <TopBar />}

        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: isWide
              ? { display: 'none' }
              : mobileTabBarStyle,
            tabBarActiveTintColor:   '#3B82F6',
            tabBarInactiveTintColor: c.textSubtle,
            tabBarLabelStyle: {
              fontFamily: theme.typography.fontFamily.medium,
              fontSize:   11,
            },
          }}
        >
          {/* ── Visible tabs (mobile) ───────────────────────────────── */}
          <Tabs.Screen
            name="dashboard"
            options={{
              title: 'Overview',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="grid-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="chapters/index"
            options={{
              title: 'Chapters',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="business-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="members/index"
            options={{
              title: 'Members',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="people-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="events-management/index"
            options={{
              title: 'Events',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="calendar-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="settings-outline" size={size} color={color} />
              ),
            }}
          />

          {/* ── Hidden routes (accessible via sidebar on desktop only) ── */}
          <Tabs.Screen name="chapters"          options={{ href: null, tabBarItemStyle: { display: 'none' } }} />
          <Tabs.Screen name="members"           options={{ href: null, tabBarItemStyle: { display: 'none' } }} />
          <Tabs.Screen name="status"            options={{ href: null, tabBarItemStyle: { display: 'none' } }} />
          <Tabs.Screen name="status/index"      options={{ href: null, tabBarItemStyle: { display: 'none' } }} />
          <Tabs.Screen name="events-management" options={{ href: null, tabBarItemStyle: { display: 'none' } }} />
          {/* Calendar — desktop sidebar only, hidden on mobile */}
          <Tabs.Screen name="calendar"          options={{ href: null, tabBarItemStyle: { display: 'none' } }} />
          <Tabs.Screen name="calendar/index"    options={{ href: null, tabBarItemStyle: { display: 'none' } }} />
          {/* Roles — desktop sidebar only */}
          <Tabs.Screen name="roles"             options={{ href: null, tabBarItemStyle: { display: 'none' } }} />
          <Tabs.Screen name="roles/index"       options={{ href: null, tabBarItemStyle: { display: 'none' } }} />
        </Tabs>
      </View>
    </View>
  );
}
