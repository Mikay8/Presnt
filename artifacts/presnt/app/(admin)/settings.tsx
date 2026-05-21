/**
 * Admin — Settings
 *
 * Organization settings: display name, join code, branding colors,
 * and a link to the Profile / sign-out screen.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
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

// ─── Section header ───────────────────────────────────────────────────────────

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

export default function AdminSettingsScreen() {
  const { theme }    = useThemeStore();
  const insets       = useSafeAreaInsets();
  const { width }    = useWindowDimensions();
  const isWide       = width >= 800;
  const { organization, membership, profile, setMembership } = useAuthStore();

  const [displayName, setDisplayName] = useState(organization?.app_display_name ?? organization?.name ?? '');
  const [institution, setInstitution] = useState(organization?.institution ?? '');
  const [saving, setSaving]           = useState(false);
  const [dirty, setDirty]             = useState(false);

  useEffect(() => {
    setDisplayName(organization?.app_display_name ?? organization?.name ?? '');
    setInstitution(organization?.institution ?? '');
  }, [organization]);

  const isOrgAdmin = membership?.role === 'org_admin';
  const c = theme.colors;

  async function handleSave() {
    if (!organization?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('organizations')
      .update({
        app_display_name: displayName.trim() || null,
        institution:      institution.trim() || null,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', organization.id);

    setSaving(false);
    setDirty(false);

    if (error) {
      Alert.alert('Error', 'Failed to save settings. Please try again.');
    } else {
      Alert.alert('Saved', 'Organization settings updated.');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[
        styles.header,
        { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
      ]}>
        <View>
          <Text size="xxl" weight="bold">Settings</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>Chapter configuration</Text>
        </View>
      </View>

      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        showsVerticalScrollIndicator={false}
      >
        {/* Account */}
        <SectionHeader label="Account" />
        <Card style={{ paddingVertical: 0 }}>
          <SettingRow
            icon="person-circle-outline"
            label="My Profile"
            value={`${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'View profile'}
            onPress={() => router.push('/(admin)/profile')}
          />
          <SettingRow
            icon="shield-outline"
            label="Role"
            value={membership?.role ? membership.role.charAt(0).toUpperCase() + membership.role.slice(1).replace('_', ' ') : '—'}
            last
          />
        </Card>

        {/* Organization */}
        {isOrgAdmin && (
          <>
            <SectionHeader label="Organization" />
            <Card>
              <Text size="xs" weight="medium" color={c.textMuted}
                style={{ textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                Display Name
              </Text>
              <TextInput
                value={displayName}
                onChangeText={(v) => { setDisplayName(v); setDirty(true); }}
                placeholder={organization?.name ?? 'Organization name'}
                placeholderTextColor={c.textSubtle}
                style={[styles.input, { backgroundColor: c.background, borderColor: c.border, color: c.text, fontFamily: theme.typography.fontFamily.regular }]}
              />

              <Text size="xs" weight="medium" color={c.textMuted}
                style={{ textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 16 }}>
                Institution
              </Text>
              <TextInput
                value={institution}
                onChangeText={(v) => { setInstitution(v); setDirty(true); }}
                placeholder="e.g. UCLA"
                placeholderTextColor={c.textSubtle}
                style={[styles.input, { backgroundColor: c.background, borderColor: c.border, color: c.text, fontFamily: theme.typography.fontFamily.regular }]}
              />

              {dirty && (
                <View style={styles.saveRow}>
                  <Button label="Discard" variant="outline" style={{ flex: 1 }} onPress={() => {
                    setDisplayName(organization?.app_display_name ?? organization?.name ?? '');
                    setInstitution(organization?.institution ?? '');
                    setDirty(false);
                  }} />
                  <Button label="Save changes" style={{ flex: 1 }} loading={saving} onPress={handleSave} />
                </View>
              )}
            </Card>
          </>
        )}

        {/* Chapter info (read-only for non-org-admin) */}
        <SectionHeader label="Chapter" />
        <Card style={{ paddingVertical: 0 }}>
          <SettingRow
            icon="business-outline"
            label="Organization"
            value={organization?.name}
          />
          <SettingRow
            icon="school-outline"
            label="Institution"
            value={organization?.institution ?? '—'}
          />
          <SettingRow
            icon="key-outline"
            label="Join Code"
            value={organization?.join_code ?? '—'}
            last
          />
        </Card>

        {/* Roles */}
        <SectionHeader label="Permissions" />
        <Card style={{ paddingVertical: 0 }}>
          <SettingRow
            icon="shield-checkmark-outline"
            label="Officer Roles"
            value="Manage custom officer roles & permissions"
            onPress={() => router.push('/(admin)/roles')}
            last
          />
        </Card>

        {/* Danger zone */}
        <SectionHeader label="Account" />
        <Card style={{ paddingVertical: 0 }}>
          <SettingRow
            icon="log-out-outline"
            label="Sign Out"
            onPress={() => router.push('/(admin)/profile')}
            last
          />
        </Card>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  scroll:    { padding: 20, gap: 12, paddingBottom: 48 },
  scrollWide:{ paddingHorizontal: 48, maxWidth: 760, alignSelf: 'center', width: '100%' },

  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4 },

  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15,
  },
  saveRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
});
