/**
 * AdminSidebar
 *
 * Desktop-only left navigation panel for the admin portal.
 * Matches the dark sidebar from the wireframe.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { Text } from './Text';

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDEBAR_BG  = '#272018';
const ACTIVE_BG   = '#3D2B22';
const ACTIVE_TEXT = '#FBF6EE';
const MUTED_TEXT  = '#A89687';
const SUBTLE_TEXT = '#6E5E54';
const DIVIDER     = '#3D2B22';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const NAV_ITEMS: { label: string; path: string; icon: IconName }[] = [
  { label: 'Dashboard',  path: '/(admin)/dashboard',   icon: 'grid-outline'              },
  { label: 'Members',    path: '/(admin)/members',      icon: 'people-outline'            },
  { label: 'Roles',      path: '/(admin)/roles',        icon: 'shield-outline'            },
  { label: 'Committees', path: '/(admin)/committees',   icon: 'people-circle-outline'     },
  { label: 'Dues',       path: '/(admin)/dues',         icon: 'cash-outline'              },
  { label: 'Status',     path: '/(admin)/status',       icon: 'checkmark-circle-outline'  },
  { label: 'Settings',   path: '/(admin)/settings',     icon: 'settings-outline'          },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminSidebar() {
  const insets    = useSafeAreaInsets();
  const pathname  = usePathname();
  const { theme } = useThemeStore();
  const { organization, membership, profile } = useAuthStore();

  const orgName    = organization?.name        ?? 'My Chapter';
  const institution = organization?.institution ?? '';
  const firstName  = profile?.first_name ?? '';
  const lastName   = profile?.last_name  ?? '';
  const initials   = firstName && lastName ? `${firstName[0]}${lastName[0]}` : '?';

  const roleLabel = membership?.role
    ? membership.role.toUpperCase().replace('_', ' ')
    : 'ADMIN';

  // Active if the pathname starts with the item's segment
  const isActive = (path: string) => {
    const segment = path.replace('/(admin)/', '');
    return pathname === `/${segment}` || pathname.startsWith(`/${segment}/`);
  };

  // Use org primary color for active indicator (falls through to orange default)
  const primaryColor = theme.colors.primary;

  return (
    <View
      style={[
        styles.sidebar,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
      ]}
    >
      {/* ── Logo ─────────────────────────────────────────────────────── */}
      <View style={styles.logoRow}>
        <View style={[styles.logoIcon, { backgroundColor: primaryColor }]}>
          <Text size="md" weight="bold" color="#FFF">p</Text>
        </View>
        <View>
          <Text size="lg" weight="bold" color={ACTIVE_TEXT}>presnt</Text>
          <Text size="xs" color={SUBTLE_TEXT} style={styles.roleTag}>{roleLabel}</Text>
        </View>
      </View>

      {/* ── Nav items ─────────────────────────────────────────────────── */}
      <View style={styles.nav}>
        {NAV_ITEMS.map(({ label, path, icon }) => {
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
              <Ionicons
                name={icon}
                size={18}
                color={active ? primaryColor : MUTED_TEXT}
              />
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

      {/* ── Org footer ───────────────────────────────────────────────── */}
      <Pressable
        onPress={() => router.push('/(admin)/profile')}
        style={({ pressed }) => [
          styles.orgRow,
          { borderTopColor: DIVIDER, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <View style={styles.orgAvatar}>
          <Text size="xs" weight="medium" color={MUTED_TEXT}>{initials}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" weight="medium" color={ACTIVE_TEXT} numberOfLines={1}>{orgName}</Text>
          {!!institution && (
            <Text size="xs" color={SUBTLE_TEXT} numberOfLines={1}>{institution}</Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sidebar: {
    width:            240,
    backgroundColor:  SIDEBAR_BG,
    paddingHorizontal: 12,
    justifyContent:   'space-between',
  },

  logoRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
    marginBottom:  28,
    paddingHorizontal: 4,
  },
  logoIcon: {
    width:           34,
    height:          34,
    borderRadius:    8,
    alignItems:      'center',
    justifyContent:  'center',
  },
  roleTag: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop:     1,
  },

  nav: {
    flex: 1,
    gap:  2,
  },
  navItem: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    paddingHorizontal: 12,
    paddingVertical:   9,
    borderRadius:   8,
    borderLeftWidth: 0,
  },
  navItemActive: {
    backgroundColor: ACTIVE_BG,
    borderLeftWidth: 3,
  },

  orgRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
    paddingTop:    14,
    borderTopWidth: 1,
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
