/**
 * OrgAdminSidebar
 *
 * Desktop-only left navigation panel for the org-admin portal.
 * Org admins manage chapters and members across their entire organization.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { Text } from './Text';

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDEBAR_BG  = '#1A1F2E';
const ACTIVE_BG   = '#252D42';
const ACTIVE_TEXT = '#FBF6EE';
const MUTED_TEXT  = '#8B97B8';
const SUBTLE_TEXT = '#5A6480';
const DIVIDER     = '#252D42';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const NAV_ITEMS: { label: string; path: string; icon: IconName }[] = [
  { label: 'Overview',       path: '/(org-admin)/dashboard',        icon: 'grid-outline'             },
  { label: 'Chapters',       path: '/(org-admin)/chapters',         icon: 'business-outline'         },
  { label: 'Members',        path: '/(org-admin)/members',          icon: 'people-outline'           },
  { label: 'Announcements',  path: '/(org-admin)/announcements',    icon: 'megaphone-outline'        },
  { label: 'Roles',          path: '/(org-admin)/roles',            icon: 'shield-outline'           },
  { label: 'Status',         path: '/(org-admin)/status',           icon: 'shield-checkmark-outline' },
  { label: 'Events',         path: '/(org-admin)/events-management', icon: 'calendar-outline'        },
  { label: 'Calendar',       path: '/(org-admin)/calendar',         icon: 'calendar-number-outline'  },
  { label: 'Settings',       path: '/(org-admin)/settings',         icon: 'settings-outline'         },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function OrgAdminSidebar() {
  const insets    = useSafeAreaInsets();
  const pathname  = usePathname();
  const { theme } = useThemeStore();
  const { organization, profile } = useAuthStore();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setSigningOut(false);
    }
  }

  const orgName  = organization?.name ?? 'My Organization';
  const firstName = profile?.first_name ?? '';
  const lastName  = profile?.last_name  ?? '';
  const initials  = firstName && lastName ? `${firstName[0]}${lastName[0]}` : '?';

  const isActive = (path: string) => {
    const segment = path.replace('/(org-admin)/', '');
    return pathname === `/${segment}` || pathname.startsWith(`/${segment}/`);
  };

  const primaryColor = '#3B82F6'; // blue accent for org-admin to distinguish from chapter admin

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
        <Text size="xs" color={SUBTLE_TEXT} style={styles.roleTag}>ORG ADMIN</Text>
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
                !active && pressed && { backgroundColor: '#1E2638' },
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
          : <Ionicons name="log-out-outline" size={16} color={MUTED_TEXT} />
        }
        <Text size="sm" color={MUTED_TEXT}>Sign out</Text>
      </Pressable>

      {/* ── Org footer ───────────────────────────────────────────────── */}
      <View style={[styles.orgRow, { borderTopColor: DIVIDER }]}>
        <View style={styles.orgAvatar}>
          <Text size="xs" weight="medium" color={MUTED_TEXT}>{initials}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" weight="medium" color={ACTIVE_TEXT} numberOfLines={1}>{orgName}</Text>
          <Text size="xs" color={SUBTLE_TEXT} numberOfLines={1}>Organization Admin</Text>
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
    backgroundColor: '#252D42',
    alignItems:      'center',
    justifyContent:  'center',
  },
});
