/**
 * Admin — Committees
 *
 * Committees are not yet in the database schema. This screen shows an empty
 * state with a "coming soon" prompt. Wire up once a `committees` table is added.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

export default function CommitteesScreen() {
  const { theme } = useThemeStore();
  const insets    = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide    = width >= 768;
  const c = theme.colors;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[
        styles.header,
        { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
      ]}>
        <View>
          <Text size="xxl" weight="bold">Committees</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>Organize members into committees</Text>
        </View>
      </View>

      {/* Empty state */}
      <View style={styles.empty}>
        <View style={[styles.iconWrap, { backgroundColor: c.primary + '18' }]}>
          <Ionicons name="people-circle-outline" size={48} color={c.primary} />
        </View>
        <Text size="lg" weight="bold" style={{ marginTop: 20 }}>Committees coming soon</Text>
        <Text size="sm" color={c.textMuted}
          style={{ textAlign: 'center', marginTop: 8, lineHeight: 20, maxWidth: 280 }}>
          Committee management requires a database migration.{'\n'}
          This feature will be available in the next release.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  empty:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconWrap: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
});
