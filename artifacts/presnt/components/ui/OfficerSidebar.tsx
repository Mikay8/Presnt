/**
 * OfficerSidebar
 *
 * Desktop-only left navigation panel for the officer portal.
 * Matches the dark sidebar from the wireframes — same visual language as AdminSidebar.
 * Only shows tabs the officer actually has permission for.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { PERMISSIONS } from '@/lib/permissions';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';
import { Text } from './Text';

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDEBAR_BG  = '#272018';
const ACTIVE_BG   = '#3D2B22';
const ACTIVE_TEXT = '#FBF6EE';
const MUTED_TEXT  = '#A89687';
const SUBTLE_TEXT = '#6E5E54';
const DIVIDER     = '#3D2B22';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ALL_NAV_ITEMS: {
  label:      string;
  path:       string;
  icon:       IconName;
  permission: string | null; // null = always visible
}[] = [
  { label: 'Events',     path: '/(officer)/events',     icon: 'calendar-outline',        permission: PERMISSIONS.MANAGE_EVENTS },
  { label: 'Attendance', path: '/(officer)/attendance', icon: 'checkmark-done-outline',  permission: PERMISSIONS.MANAGE_ATTENDANCE },
  { label: 'Excuses',    path: '/(officer)/excuses',    icon: 'document-text-outline',   permission: null }, // shown if manage_attendance OR manage_members
  { label: 'Members',    path: '/(officer)/members',    icon: 'people-outline',           permission: PERMISSIONS.MANAGE_MEMBERS },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function OfficerSidebar() {
  const insets    = useSafeAreaInsets();
  const pathname  = usePathname();
  const { theme } = useThemeStore();
  const { organization, membership, profile, customRole } = useAuthStore();
  const userView  = useUserViewStore((s) => s.session);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try { await supabase.auth.signOut(); }
    finally { setSigningOut(false); }
  }

  // Resolve permission set — real session vs user-view
  const viewPerms  = userView?.role === 'officer' ? userView.permissions : null;
  const realPerms  = customRole?.permissions ?? [];
  const isAdmin    = userView
    ? userView.role === 'admin'
    : membership?.role === 'admin' || membership?.role === 'org_admin';

  function hasPerm(permission: string): boolean {
    if (isAdmin) return true;
    if (viewPerms) return viewPerms.includes(permission);
    return realPerms.includes(permission);
  }

  // Filter nav items the same way _layout.tsx does
  const navItems = ALL_NAV_ITEMS.filter((item) => {
    if (item.label === 'Excuses') {
      return hasPerm(PERMISSIONS.MANAGE_ATTENDANCE) || hasPerm(PERMISSIONS.MANAGE_MEMBERS);
    }
    if (item.permission) return hasPerm(item.permission);
    return true;
  });

  const orgName    = userView?.org.name ?? organization?.name ?? 'My Chapter';
  const institution = organization?.institution ?? '';
  const firstName  = profile?.first_name ?? '';
  const lastName   = profile?.last_name  ?? '';
  const initials   = firstName && lastName ? `${firstName[0]}${lastName[0]}` : '?';

  // Role label — show custom role name if available
  const roleLabel = userView
    ? 'OFFICER (VIEW)'
    : customRole?.name?.toUpperCase()
      ?? membership?.role?.toUpperCase().replace('_', ' ')
      ?? 'OFFICER';

  const isActive = (path: string) => {
    const segment = path.replace('/(officer)/', '');
    return pathname === `/${segment}` || pathname.startsWith(`/${segment}/`);
  };

  const primaryColor = theme.colors.primary;

  return (
    <View
      style={[
        styles.sidebar,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
      ]}
    >
      {/* ── Wordmark ──────────────────────────────────────────────────── */}
      <View style={styles.logoRow}>
        <Image
          source={require('@/assets/images/wordmark-dark.png')}
          style={{ width: 100, height: 24 }}
          resizeMode="contain"
        />
        <Text size="xs" color={SUBTLE_TEXT} style={styles.roleTag}>{roleLabel}</Text>
      </View>

      {/* ── Nav items ─────────────────────────────────────────────────── */}
      <View style={styles.nav}>
        {navItems.map(({ label, path, icon }) => {
          const active = isActive(path);
          return (
            <Pressable
              key={path}
              onPress={() => router.push(path as any)}
              style={({ pressed }) => [
                styles.navItem,
                active && [styles.navItemActive, { borderLeftColor: primaryColor }],
                !active && pressed && { backgroundColor: '#2E2218' },
              ]}
            >
              <Ionicons name={icon} size={18} color={active ? primaryColor : MUTED_TEXT} />
              <Text
                size="sm"
                weight={active ? 'medium' : 'regular'}
                color={active ? ACTIVE_TEXT : MUTED_TEXT}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Sign out ──────────────────────────────────────────────────── */}
      <Pressable
        onPress={handleSignOut}
        disabled={signingOut}
        style={({ pressed }) => [
          styles.signOutBtn,
          { borderColor: DIVIDER, opacity: pressed || signingOut ? 0.6 : 1 },
        ]}
      >
        {signingOut
          ? <ActivityIndicator size="small" color={MUTED_TEXT} />
          : <Ionicons name="log-out-outline" size={16} color={MUTED_TEXT} />}
        <Text size="sm" color={MUTED_TEXT}>Sign out</Text>
      </Pressable>

      {/* ── Org footer ───────────────────────────────────────────────── */}
      <View style={[styles.orgRow, { borderTopColor: DIVIDER }]}>
        <View style={styles.orgAvatar}>
          <Text size="xs" weight="medium" color={MUTED_TEXT}>{initials}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" weight="medium" color={ACTIVE_TEXT} numberOfLines={1}>{orgName}</Text>
          {!!institution && (
            <Text size="xs" color={SUBTLE_TEXT} numberOfLines={1}>{institution}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sidebar: {
    width:             240,
    backgroundColor:   SIDEBAR_BG,
    paddingHorizontal: 12,
    justifyContent:    'space-between',
  },
  logoRow: {
    flexDirection:     'column',
    alignItems:        'flex-start',
    marginBottom:      28,
    paddingHorizontal: 4,
  },
  roleTag: {
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop:     5,
  },
  nav: {
    flex: 1,
    gap:  2,
  },
  navItem: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    paddingHorizontal: 12,
    paddingVertical:   9,
    borderRadius:      8,
    borderLeftWidth:   0,
  },
  navItemActive: {
    backgroundColor: ACTIVE_BG,
    borderLeftWidth: 3,
  },
  signOutBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    paddingHorizontal: 12,
    paddingVertical:   9,
    borderRadius:      8,
    borderWidth:       1,
    marginBottom:      8,
  },
  orgRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    paddingTop:        14,
    borderTopWidth:    1,
    paddingHorizontal: 4,
  },
  orgAvatar: {
    width:           32,
    height:          32,
    borderRadius:    16,
    backgroundColor: '#3D2B22',
    alignItems:      'center',
    justifyContent:  'center',
  },
});
