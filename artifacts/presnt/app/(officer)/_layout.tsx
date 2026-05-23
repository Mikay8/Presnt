import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View, useWindowDimensions } from 'react-native';

import { OfficerSidebar, TopBar } from '@/components/ui';
import { usePermissions } from '@/hooks/usePermissions';
import { PERMISSIONS } from '@/lib/permissions';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';

const DESKTOP_BREAKPOINT = 768;

// Tab bar item that renders nothing — hides the slot completely
const HIDDEN: any = { href: null, tabBarItemStyle: { display: 'none' } };

export default function OfficerLayout() {
  const { theme }                 = useThemeStore();
  const { membership, isLoading } = useAuthStore();
  const { can }                   = usePermissions();
  const userView                  = useUserViewStore((s) => s.session);
  const { width }                 = useWindowDimensions();
  const isWide                    = width >= DESKTOP_BREAKPOINT;

  // Wait for auth to settle before making any redirect decisions.
  if (isLoading && !userView) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Guard: only officers may access this portal (or superuser in user-view)
  if (!userView && membership?.role !== 'officer') {
    return <Redirect href="/(member)" />;
  }

  // In user-view officer mode, use the simulated permission set
  const viewPerms = userView?.role === 'officer' ? userView.permissions : null;
  const hasPerm   = (p: string) => viewPerms ? viewPerms.includes(p) : can(p as any);

  const hasEvents     = hasPerm(PERMISSIONS.MANAGE_EVENTS);
  const hasAttendance = hasPerm(PERMISSIONS.MANAGE_ATTENDANCE);
  const hasMembers    = hasPerm(PERMISSIONS.MANAGE_MEMBERS);
  const hasExcuses    = hasPerm(PERMISSIONS.MANAGE_ATTENDANCE) || hasPerm(PERMISSIONS.MANAGE_MEMBERS);

  // Officer with zero relevant permissions → fall back to member portal
  if (!hasEvents && !hasAttendance && !hasExcuses && !hasMembers) {
    return <Redirect href="/(member)" />;
  }

  const c = theme.colors;

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {isWide && <OfficerSidebar />}
      <View style={{ flex: 1 }}>
        {isWide && <TopBar />}
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: isWide ? { display: 'none' } : {
              backgroundColor: c.surface,
              borderTopColor:  c.border,
              borderTopWidth:  1,
            },
            tabBarActiveTintColor:   c.primary,
            tabBarInactiveTintColor: c.textSubtle,
            tabBarLabelStyle: {
              fontFamily: theme.typography.fontFamily.medium,
              fontSize:   11,
            },
          }}
        >
          {/* ── Visible tabs ──────────────────────────────────────────── */}
          <Tabs.Screen
            name="dashboard"
            options={{
              title: 'Dashboard',
              tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="calendar"
            options={{
              title: 'Calendar',
              tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="members/index"
            options={{
              title: 'Members',
              tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="more"
            options={{
              title: 'More',
              tabBarIcon: ({ color, size }) => <Ionicons name="apps-outline" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
            }}
          />

          {/* ── Hidden sub-routes ─────────────────────────────────────── */}
          <Tabs.Screen name="events-management/index" options={HIDDEN} />
          <Tabs.Screen name="events-management/[id]"  options={HIDDEN} />
          <Tabs.Screen name="attendance/index"        options={HIDDEN} />
          <Tabs.Screen name="status/index"            options={HIDDEN} />
          <Tabs.Screen name="excuses/index"           options={HIDDEN} />
          <Tabs.Screen name="locations/index"         options={HIDDEN} />
          <Tabs.Screen name="categories/index"        options={HIDDEN} />
        </Tabs>
      </View>
    </View>
  );
}
