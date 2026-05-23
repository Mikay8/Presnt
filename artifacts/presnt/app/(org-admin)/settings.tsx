/**
 * Org Admin — Settings
 *
 * Basic organization settings: name, type, and sign out.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Input, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

const ORG_ADMIN_BLUE = '#3B82F6';

export default function OrgAdminSettingsScreen() {
  const { theme }        = useThemeStore();
  const insets           = useSafeAreaInsets();
  const { width }        = useWindowDimensions();
  const isWide           = width >= 800;
  const { organization, profile } = useAuthStore();

  const [orgName, setOrgName]     = useState(organization?.name ?? '');
  const [saving, setSaving]       = useState(false);
  const [signingOut, setSignOut]  = useState(false);

  const c = theme.colors;

  async function handleSave() {
    if (!orgName.trim() || !organization?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('organizations')
      .update({ name: orgName.trim() })
      .eq('id', organization.id);
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Saved', 'Organization name updated.');
    }
  }

  async function handleSignOut() {
    setSignOut(true);
    await supabase.auth.signOut();
    setSignOut(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[
        styles.header,
        { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
      ]}>
        <Text size="xxl" weight="bold">Settings</Text>
      </View>

      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide, !isWide && { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile info */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text size="xs" weight="medium" color={c.textMuted}
            style={{ textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 }}>
            Your Account
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.avatar, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Text size="md" weight="bold" color={c.textMuted}>
                {profile?.first_name?.[0]}{profile?.last_name?.[0]}
              </Text>
            </View>
            <View>
              <Text size="md" weight="semibold">
                {profile?.first_name} {profile?.last_name}
              </Text>
              <Text size="sm" color={c.textMuted}>{profile?.email}</Text>
              <View style={[styles.badge, { backgroundColor: ORG_ADMIN_BLUE + '22', borderColor: ORG_ADMIN_BLUE, marginTop: 6 }]}>
                <Ionicons name="shield-checkmark-outline" size={12} color={ORG_ADMIN_BLUE} />
                <Text size="xs" weight="medium" color={ORG_ADMIN_BLUE}>Organization Admin</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Org settings */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text size="xs" weight="medium" color={c.textMuted}
            style={{ textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 }}>
            Organization
          </Text>
          <Input
            label="Organization name"
            value={orgName}
            onChangeText={setOrgName}
            placeholder="e.g. Alpha Kappa Psi"
            autoCapitalize="words"
          />
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            {[
              { label: 'Type', value: organization?.type?.replace('_', ' ') ?? '—' },
              { label: 'Slug', value: organization?.slug ?? '—' },
            ].map(({ label, value }) => (
              <View key={label} style={{ flex: 1, gap: 2 }}>
                <Text size="xs" color={c.textMuted}>{label}</Text>
                <Text size="sm" color={c.text}>{value}</Text>
              </View>
            ))}
          </View>
          <Button
            label="Save changes"
            onPress={handleSave}
            loading={saving}
            style={{ marginTop: 16 }}
          />
        </View>

        {/* Sign out */}
        <Pressable
          onPress={handleSignOut}
          disabled={signingOut}
          style={({ pressed }) => [
            styles.signOutBtn,
            { borderColor: c.error, opacity: pressed || signingOut ? 0.7 : 1 },
          ]}
        >
          {signingOut
            ? <ActivityIndicator size="small" color={c.error} />
            : <Ionicons name="log-out-outline" size={18} color={c.error} />}
          <Text size="sm" weight="medium" color={c.error}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:      { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  scroll:      { padding: 20, gap: 16, paddingBottom: 48 },
  scrollWide:  { paddingHorizontal: 48, maxWidth: 760, alignSelf: 'center', width: '100%' },

  section:     { borderRadius: 14, borderWidth: 1, padding: 18, gap: 4 },
  avatar:      { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge:       { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },

  signOutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 14 },
});
