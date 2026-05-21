import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { AdminSidebar, TopBar } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';

const DESKTOP_BREAKPOINT = 768;

export default function AdminLayout() {
  const { theme }      = useThemeStore();
  const { membership } = useAuthStore();
  const { width }      = useWindowDimensions();
  const isWide         = width >= DESKTOP_BREAKPOINT;
  const userView       = useUserViewStore((s) => s.session);

  const role = membership?.role;
  // Allow entry if user-view is simulating admin, otherwise enforce real role
  if (!userView && role !== 'admin' && role !== 'org_admin') {
    return <Redirect href="/(member)" />;
  }

  const c = theme.colors;

  // On desktop the tab bar is hidden — navigation is via the sidebar.
  // On mobile the tab bar is visible at the bottom.
  const mobileTabBarStyle = {
    backgroundColor: c.surface,
    borderTopColor:  c.border,
    borderTopWidth:  1,
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {/* Sidebar — desktop only */}
      {isWide && <AdminSidebar />}

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
            tabBarActiveTintColor:   c.primary,
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
              title: 'Dashboard',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="grid-outline" size={size} color={color} />
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
            name="more"
            options={{
              title: 'More',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="apps-outline" size={size} color={color} />
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

          {/* ── Hidden routes ───────────────────────────────────────── */}
          {/* Cover both Expo Router 6 naming conventions            */}
          <Tabs.Screen name="roles/index"        options={{ href: null }} />
          <Tabs.Screen name="dues/index"         options={{ href: null }} />
          <Tabs.Screen name="committees/index"   options={{ href: null }} />
          <Tabs.Screen name="status/index"       options={{ href: null }} />
          <Tabs.Screen name="organization/index" options={{ href: null }} />
          <Tabs.Screen name="profile"            options={{ href: null }} />

          <Tabs.Screen name="roles"        options={{ href: null }} />
          <Tabs.Screen name="dues"         options={{ href: null }} />
          <Tabs.Screen name="committees"   options={{ href: null }} />
          <Tabs.Screen name="status"       options={{ href: null }} />
          <Tabs.Screen name="organization" options={{ href: null }} />
        </Tabs>
      </View>
    </View>
  );
}
