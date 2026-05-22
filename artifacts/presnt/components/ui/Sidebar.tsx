import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '@/stores/authStore';
import { Text } from './Text';

const DARK_BG   = '#272018';
const ACTIVE_BG = '#3D2B22';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const NAV_ITEMS: { label: string; segment: string; icon: IconName }[] = [
  { label: 'Home',     segment: 'index',    icon: 'home-outline' },
  { label: 'Calendar', segment: 'calendar', icon: 'calendar-outline' },
  { label: 'Status',   segment: 'status',   icon: 'checkmark-circle-outline' },
  { label: 'Profile',  segment: 'profile',  icon: 'person-outline' },
];

export function Sidebar() {
  const insets   = useSafeAreaInsets();
  const pathname = usePathname();
  const { organization, membership } = useAuthStore();

  const orgName    = organization?.name        ?? 'My Chapter';
  const institution = organization?.institution ?? '';

  // Match active item: on web Expo Router strips route groups so pathname is like
  // "/", "/calendar", "/status", "/profile" (no "/(member)/" prefix).
  const isActive = (segment: string) => {
    if (segment === 'index') return pathname === '/' || pathname === '' || pathname === '/(member)';
    return pathname === `/${segment}` || pathname.startsWith(`/${segment}/`)
        || pathname === `/(member)/${segment}` || pathname.startsWith(`/(member)/${segment}/`);
  };

  const navigate = (segment: string) => {
    if (segment === 'index') {
      router.push('/(member)' as any);
    } else {
      router.push(`/(member)/${segment}` as any);
    }
  };

  return (
    <View
      style={[
        styles.sidebar,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
      ]}
    >
      {/* Wordmark */}
      <View style={styles.logoRow}>
        <Image
          source={require('@/assets/images/wordmark-dark.png')}
          style={{ width: 100, height: 24 }}
          resizeMode="contain"
        />
        <Text size="xs" color="#6E5E54" style={styles.roleLabel}>
          {membership?.role
            ? membership.role.toUpperCase().replace('_', ' ')
            : 'MEMBER'}
        </Text>
      </View>

      {/* Nav items */}
      <View style={styles.nav}>
        {NAV_ITEMS.map(({ label, segment, icon }) => {
          const active = isActive(segment);
          return (
            <Pressable
              key={segment}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => navigate(segment)}
            >
              <Ionicons
                name={icon}
                size={18}
                color={active ? '#E26B4A' : '#6E5E54'}
              />
              <Text
                size="md"
                weight={active ? 'medium' : 'regular'}
                color={active ? '#FBF6EE' : '#A89687'}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Bottom org info */}
      <View style={styles.orgRow}>
        <View style={styles.orgAvatar} />
        <View style={{ flex: 1 }}>
          <Text size="sm" weight="medium" color="#FBF6EE" numberOfLines={1}>{orgName}</Text>
          {!!institution && (
            <Text size="xs" color="#6E5E54" numberOfLines={1}>{institution}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 240,
    backgroundColor: DARK_BG,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  logoRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 32,
    paddingHorizontal: 4,
  },
  roleLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 5,
  },
  nav: {
    flex: 1,
    gap: 2,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  navItemActive: {
    backgroundColor: ACTIVE_BG,
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#3D2B22',
  },
  orgAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6E5E54',
  },
});
