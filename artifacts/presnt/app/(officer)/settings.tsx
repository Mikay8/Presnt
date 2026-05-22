/**
 * Officer — Settings
 *
 * Read-only view of chapter info + join code.
 * Officers can copy the join code but cannot edit it.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Clipboard,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

import { Card, Text } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

// ─── Setting row ──────────────────────────────────────────────────────────────

function SettingRow({
  icon, label, value, onPress, last,
}: {
  icon:    string;
  label:   string;
  value?:  string;
  onPress?: () => void;
  last?:   boolean;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.settingRow,
        { borderBottomColor: c.border, opacity: pressed && onPress ? 0.7 : 1 },
        !last && { borderBottomWidth: 1 },
      ]}
    >
      <Ionicons name={icon as any} size={18} color={c.textMuted} />
      <View style={{ flex: 1 }}>
        <Text size="sm" weight="medium">{label}</Text>
        {value && <Text size="xs" color={c.textSubtle} style={{ marginTop: 2 }}>{value}</Text>}
      </View>
      {onPress && <Ionicons name="chevron-forward-outline" size={16} color={c.textSubtle} />}
    </Pressable>
  );
}

function SectionHeader({ label }: { label: string }) {
  const { theme } = useThemeStore();
  return (
    <Text size="xs" weight="bold" color={theme.colors.textMuted}
      style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 4 }}>
      {label}
    </Text>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OfficerSettingsScreen() {
  const { theme }                        = useThemeStore();
  const insets                           = useSafeAreaInsets();
  const { width }                        = useWindowDimensions();
  const isWide                           = width >= 800;
  const { organization, membership, profile } = useAuthStore();
  const [codeCopied, setCodeCopied]      = useState(false);
  const c = theme.colors;

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/logout' as any);
        },
      },
    ]);
  }

  function handleCopyCode() {
    const code = organization?.join_code;
    if (!code) return;
    Clipboard.setString(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  const roleLabel = membership?.role
    ? membership.role.charAt(0).toUpperCase() + membership.role.slice(1).replace('_', ' ')
    : '—';

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[
        styles.header,
        { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
      ]}>
        <View>
          <Text size="xxl" weight="bold">Settings</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>Chapter information</Text>
        </View>
      </View>

      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide, !isWide && { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Account */}
        <SectionHeader label="Account" />
        <Card style={{ paddingVertical: 0 }}>
          <SettingRow
            icon="person-circle-outline"
            label="My Profile"
            value={`${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'View profile'}
            onPress={() => router.push('/(member)/profile' as any)}
          />
          <SettingRow
            icon="shield-outline"
            label="Role"
            value={roleLabel}
            last
          />
        </Card>

        {/* Chapter info */}
        <SectionHeader label="Chapter" />
        <Card style={{ paddingVertical: 0 }}>
          <SettingRow
            icon="business-outline"
            label="Organization"
            value={organization?.name ?? '—'}
          />
          <SettingRow
            icon="school-outline"
            label="Institution"
            value={organization?.institution ?? '—'}
            last={!organization?.join_code}
          />

          {/* Join code — read-only */}
          {organization?.join_code && (
            <View style={[styles.codeSection, { borderTopColor: c.border }]}>
              <View style={styles.codeLabelRow}>
                <Ionicons name="key-outline" size={18} color={c.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text size="sm" weight="medium">Join Code</Text>
                  <Text size="xs" color={c.textSubtle} style={{ marginTop: 1 }}>
                    Share this with members joining your chapter
                  </Text>
                </View>
                <Pressable onPress={handleCopyCode} style={[styles.codeAction, { borderColor: c.border }]}>
                  <Ionicons
                    name={codeCopied ? 'checkmark' : 'copy-outline'}
                    size={15}
                    color={codeCopied ? '#22C55E' : c.textMuted}
                  />
                </Pressable>
              </View>
              <View style={[styles.codeDisplay, { backgroundColor: c.background, borderColor: c.border }]}>
                <Text
                  size="md"
                  weight="medium"
                  style={{ letterSpacing: 2, fontFamily: theme.typography.fontFamily.medium }}
                >
                  {organization.join_code}
                </Text>
              </View>
            </View>
          )}
        </Card>

        {/* Sign out */}
        <SectionHeader label="Session" />
        <Card style={{ paddingVertical: 0 }}>
          <SettingRow
            icon="log-out-outline"
            label="Sign Out"
            onPress={handleSignOut}
            last
          />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  scroll:       { padding: 20, gap: 12, paddingBottom: 48 },
  scrollWide:   { paddingHorizontal: 48, maxWidth: 760, alignSelf: 'center', width: '100%' },
  settingRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4 },
  codeSection:  { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, gap: 10 },
  codeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  codeAction:   { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  codeDisplay:  { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
});
