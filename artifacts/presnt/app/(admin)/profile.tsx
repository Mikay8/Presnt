/**
 * Admin — Profile Screen
 *
 * Shows the current user's info and provides a sign-out button.
 * Accessible from the avatar in the dashboard header.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

export default function AdminProfileScreen() {
  const { theme }       = useThemeStore();
  const insets          = useSafeAreaInsets();
  const { profile, membership, organization } = useAuthStore();
  const [signingOut, setSigningOut] = useState(false);
  const c = theme.colors;

  const firstName = profile?.first_name ?? '';
  const lastName  = profile?.last_name  ?? '';
  const initials  = firstName && lastName ? `${firstName[0]}${lastName[0]}` : '?';
  const fullName  = `${firstName} ${lastName}`.trim() || 'Unknown';

  const roleLabel = membership?.role
    ? membership.role.charAt(0).toUpperCase() + membership.role.slice(1).replace('_', ' ')
    : '—';

  // Mirror the member profile pattern: just call signOut and let the
  // onAuthStateChange listener in _layout.tsx handle clear() + redirect.
  async function handleSignOut() {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[
        styles.header,
        { paddingTop: insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
      ]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back-outline" size={22} color={c.text} />
        </Pressable>
        <Text size="lg" weight="bold">Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatar, { backgroundColor: c.primary + '22', borderColor: c.primary }]}>
            <Text size="xxl" weight="bold" color={c.primary}>{initials}</Text>
          </View>
          <Text size="xl" weight="bold" style={{ marginTop: 14 }}>{fullName}</Text>
          <Text size="sm" color={c.textMuted} style={{ marginTop: 4 }}>{roleLabel}</Text>
          {organization && (
            <Text size="xs" color={c.textSubtle} style={{ marginTop: 2 }}>{organization.name}</Text>
          )}
        </View>

        {/* Info card */}
        <Card style={{ paddingVertical: 0 }}>
          {[
            { icon: 'mail-outline',    label: 'Email',        value: profile?.email ?? '—' },
            { icon: 'person-outline',  label: 'Member since', value: membership?.joined_at
                ? new Date(membership.joined_at).toLocaleDateString()
                : '—' },
            { icon: 'business-outline', label: 'Organization', value: organization?.name ?? '—' },
          ].map((row, i, arr) => (
            <View
              key={row.label}
              style={[
                styles.infoRow,
                { borderBottomColor: c.border },
                i < arr.length - 1 && { borderBottomWidth: 1 },
              ]}
            >
              <Ionicons name={row.icon as any} size={18} color={c.textMuted} />
              <View style={{ flex: 1 }}>
                <Text size="xs" color={c.textSubtle}>{row.label}</Text>
                <Text size="sm" style={{ marginTop: 2 }}>{row.value}</Text>
              </View>
            </View>
          ))}
        </Card>

        {/* Sign out */}
        <Button
          label="Sign Out"
          variant="danger"
          loading={signingOut}
          onPress={handleSignOut}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  scroll:  { padding: 20, gap: 20, paddingBottom: 48 },

  avatarSection: { alignItems: 'center', paddingVertical: 12 },
  avatar:        { width: 80, height: 80, borderRadius: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4 },
});
