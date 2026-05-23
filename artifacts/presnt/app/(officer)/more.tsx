/**
 * Officer — More
 *
 * Entry point for sections not in the main tab bar:
 * Events, Attendance, Excuses — shown only if the officer has that permission.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';
import { usePermissions } from '@/hooks/usePermissions';
import { PERMISSIONS } from '@/lib/permissions';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';

export default function OfficerMoreScreen() {
  const { theme }  = useThemeStore();
  const insets     = useSafeAreaInsets();
  const { width }  = useWindowDimensions();
  const isWide     = width >= 800;
  const { can }    = usePermissions();
  const userView   = useUserViewStore((s) => s.session);
  const c          = theme.colors;

  const viewPerms = userView?.role === 'officer' ? userView.permissions : null;
  const hasPerm   = (p: string) => viewPerms ? viewPerms.includes(p) : can(p as any);

  const items = [
    {
      icon:        'list-outline' as const,
      label:       'Events',
      description: 'Create and manage chapter events',
      route:       '/(officer)/events-management',
      show:        hasPerm(PERMISSIONS.MANAGE_EVENTS),
    },
    {
      icon:        'checkmark-done-outline' as const,
      label:       'Attendance',
      description: 'Mark attendance for events',
      route:       '/(officer)/attendance',
      show:        hasPerm(PERMISSIONS.MANAGE_ATTENDANCE),
    },
    {
      icon:        'document-text-outline' as const,
      label:       'Excuses',
      description: 'Review and approve excuse requests',
      route:       '/(officer)/excuses',
      show:        hasPerm(PERMISSIONS.MANAGE_ATTENDANCE) || hasPerm(PERMISSIONS.MANAGE_MEMBERS),
    },
    {
      icon:        'megaphone-outline' as const,
      label:       'Announcements',
      description: 'Send push notifications to chapter members',
      route:       '/(officer)/announcements',
      show:        hasPerm(PERMISSIONS.MANAGE_MEMBERS),
    },
  ].filter(i => i.show);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Text size="xxl" weight="bold">More</Text>
      </View>

      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide, !isWide && { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="lock-closed-outline" size={40} color={c.textSubtle} />
            <Text size="md" color={c.textMuted} style={{ marginTop: 12, textAlign: 'center' }}>
              No additional sections available for your role.
            </Text>
          </View>
        ) : (
          <Card style={{ paddingVertical: 0 }}>
            {items.map((item, i) => (
              <Pressable
                key={item.label}
                onPress={() => router.push(item.route as any)}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 },
                  i < items.length - 1 && { borderBottomWidth: 1 },
                ]}
              >
                <View style={[styles.iconBox, { backgroundColor: c.primary + '18' }]}>
                  <Ionicons name={item.icon} size={20} color={c.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text size="sm" weight="medium">{item.label}</Text>
                  <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>{item.description}</Text>
                </View>
                <Ionicons name="chevron-forward-outline" size={16} color={c.textSubtle} />
              </Pressable>
            ))}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:     { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  scroll:     { padding: 20, gap: 12, paddingBottom: 48 },
  scrollWide: { paddingHorizontal: 48, maxWidth: 760, alignSelf: 'center', width: '100%' },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  iconBox:    { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  empty:      { alignItems: 'center', paddingVertical: 60 },
});
