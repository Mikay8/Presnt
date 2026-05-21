/**
 * Admin — More Hub
 *
 * Entry point for secondary admin sections: Roles, Committees, Dues, Status.
 * Displayed as the "More" tab on mobile.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

const MENU_ITEMS = [
  {
    icon:        'shield-outline' as const,
    label:       'Roles',
    description: 'Manage officer roles & permissions',
    route:       '/(admin)/roles',
  },
  {
    icon:        'people-circle-outline' as const,
    label:       'Committees',
    description: 'Organize members into committees',
    route:       '/(admin)/committees',
  },
  {
    icon:        'cash-outline' as const,
    label:       'Dues',
    description: 'Track payments and balances',
    route:       '/(admin)/dues',
  },
  {
    icon:        'checkmark-circle-outline' as const,
    label:       'Status',
    description: 'Chapter compliance and at-risk members',
    route:       '/(admin)/status',
  },
] as const;

export default function MoreScreen() {
  const { theme }       = useThemeStore();
  const insets          = useSafeAreaInsets();
  const { width }       = useWindowDimensions();
  const isWide          = width >= 768;
  const { organization } = useAuthStore();
  const c = theme.colors;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[
        styles.header,
        { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
      ]}>
        <View>
          <Text size="xxl" weight="bold">More</Text>
          {organization && (
            <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>{organization.name}</Text>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Card style={{ paddingVertical: 0 }}>
          {MENU_ITEMS.map((item, i) => (
            <Pressable
              key={item.label}
              onPress={() => router.push(item.route as any)}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 },
                i < MENU_ITEMS.length - 1 && { borderBottomWidth: 1 },
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: c.primary + '18' }]}>
                <Ionicons name={item.icon} size={20} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text size="md" weight="medium">{item.label}</Text>
                <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
                  {item.description}
                </Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={16} color={c.textSubtle} />
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  scroll: { padding: 20, paddingBottom: 48 },
  row:    { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  iconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
