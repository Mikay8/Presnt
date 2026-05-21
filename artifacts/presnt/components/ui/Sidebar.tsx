import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

interface Props {
  orgName?:    string;
  institution?: string;
}

export function Sidebar({ orgName = 'Kappa Sigma', institution = 'UCLA' }: Props) {
  const insets   = useSafeAreaInsets();
  const pathname = usePathname();

  // Match active item: pathname is like "/" for index, "/calendar", "/status", "/profile"
  const isActive = (segment: string) => {
    if (segment === 'index') return pathname === '/' || pathname === '';
    return pathname.startsWith(`/${segment}`);
  };

  const navigate = (segment: string) => {
    if (segment === 'index') {
      router.push('/' as any);
    } else {
      router.push(`/${segment}` as any);
    }
  };

  return (
    <View
      style={[
        styles.sidebar,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
      ]}
    >
      {/* Logo */}
      <View style={styles.logoRow}>
        <View style={styles.logoIcon}>
          <Text size="md" weight="bold" color="#FFF" style={{ lineHeight: 20 }}>p</Text>
        </View>
        <View>
          <Text size="lg" weight="bold" color="#FBF6EE">presnt</Text>
          <Text size="xs" color="#6E5E54" style={styles.roleLabel}>Member</Text>
        </View>
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
          <Text size="sm" weight="medium" color="#FBF6EE">{orgName}</Text>
          <Text size="xs" color="#6E5E54">{institution}</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 32,
  },
  logoIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#E26B4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 1,
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
