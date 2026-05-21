import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { usePermissions } from '@/hooks/usePermissions';
import { PERMISSIONS } from '@/lib/permissions';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';

export default function OfficerLayout() {
  const { theme }      = useThemeStore();
  const { membership } = useAuthStore();
  const { can }        = usePermissions();
  const userView       = useUserViewStore((s) => s.session);

  // Guard: only officers may access this portal (or superuser in user-view)
  if (!userView && membership?.role !== 'officer') {
    return <Redirect href="/(member)" />;
  }

  // In user-view officer mode, use the simulated permission set
  const viewPerms = userView?.role === 'officer' ? userView.permissions : null;
  const hasViewPerm = (p: string) => viewPerms?.includes(p) ?? false;

  const showEvents     = viewPerms ? hasViewPerm(PERMISSIONS.MANAGE_EVENTS)      : can(PERMISSIONS.MANAGE_EVENTS);
  const showAttendance = viewPerms ? hasViewPerm(PERMISSIONS.MANAGE_ATTENDANCE)  : can(PERMISSIONS.MANAGE_ATTENDANCE);
  const showExcuses    = viewPerms ? (hasViewPerm(PERMISSIONS.MANAGE_ATTENDANCE) || hasViewPerm(PERMISSIONS.MANAGE_MEMBERS)) : (can(PERMISSIONS.MANAGE_ATTENDANCE) || can(PERMISSIONS.MANAGE_MEMBERS));
  const showMembers    = viewPerms ? hasViewPerm(PERMISSIONS.MANAGE_MEMBERS)     : can(PERMISSIONS.MANAGE_MEMBERS);

  // Officer with zero relevant permissions → fall back to member portal
  if (!showEvents && !showAttendance && !showExcuses && !showMembers) {
    return <Redirect href="/(member)" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSubtle,
        tabBarLabelStyle: {
          fontFamily: theme.typography.fontFamily.medium,
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="events"
        options={showEvents ? {
          title: 'Events',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        } : { href: null }}
      />
      <Tabs.Screen
        name="attendance"
        options={showAttendance ? {
          title: 'Attendance',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-done-outline" size={size} color={color} />
          ),
        } : { href: null }}
      />
      <Tabs.Screen
        name="excuses"
        options={showExcuses ? {
          title: 'Excuses',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        } : { href: null }}
      />
      <Tabs.Screen
        name="members"
        options={showMembers ? {
          title: 'Members',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        } : { href: null }}
      />
    </Tabs>
  );
}
