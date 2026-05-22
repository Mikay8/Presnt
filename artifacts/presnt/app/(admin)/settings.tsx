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
  Clipboard,
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

function generateJoinCode(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const rand  = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${base}-${rand}`;
}

export default function AdminSettingsScreen() {
  const { theme }    = useThemeStore();
  const insets       = useSafeAreaInsets();
  const { width }    = useWindowDimensions();
  const isWide       = width >= 800;
  const { organization, membership, profile, setMembership } = useAuthStore();

  const [displayName, setDisplayName] = useState(organization?.app_display_name ?? organization?.name ?? '');
  const [institution, setInstitution] = useState(organization?.institution ?? '');
  const [joinCode,    setJoinCode]    = useState(organization?.join_code ?? '');
  const [saving,      setSaving]      = useState(false);
  const [dirty,       setDirty]       = useState(false);
  const [codeCopied,  setCodeCopied]  = useState(false);
  const [codeSaving,  setCodeSaving]  = useState(false);

  useEffect(() => {
    setDisplayName(organization?.app_display_name ?? organization?.name ?? '');
    setInstitution(organization?.institution ?? '');
    setJoinCode(organization?.join_code ?? '');
  }, [organization]);

  const isAdmin    = membership?.role === 'admin' || membership?.role === 'org_admin';
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

  async function handleSaveCode() {
    const code = joinCode.trim().toUpperCase();
    if (!code || !organization?.id) return;
    setCodeSaving(true);
    const { error } = await supabase
      .from('organizations')
      .update({ join_code: code, updated_at: new Date().toISOString() })
      .eq('id', organization.id);
    setCodeSaving(false);
    if (error) {
      Alert.alert('Error', 'Failed to update join code.');
    } else {
      // Patch the local store so the UI reflects the new code immediately
      setMembership(membership, { ...organization, join_code: code });
      Alert.alert('Updated', `Join code is now ${code}`);
    }
  }

  function handleCopyCode() {
    const code = organization?.join_code ?? joinCode;
    if (!code) return;
    Clipboard.setString(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  function handleRegenerateCode() {
    const base = organization?.name ?? 'CHAPTER';
    setJoinCode(generateJoinCode(base));
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

        {/* Chapter info + join code */}
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
            last={!isAdmin}
          />

          {/* Join code — always visible; editable for admins */}
          <View style={[styles.codeSection, { borderTopColor: c.border }]}>
            <View style={styles.codeLabelRow}>
              <Ionicons name="key-outline" size={18} color={c.textMuted} />
              <View style={{ flex: 1 }}>
                <Text size="sm" weight="medium">Join Code</Text>
                <Text size="xs" color={c.textSubtle} style={{ marginTop: 1 }}>
                  Members enter this to join your chapter
                </Text>
              </View>
              {/* Copy button */}
              <Pressable onPress={handleCopyCode} style={[styles.codeAction, { borderColor: c.border }]}>
                <Ionicons name={codeCopied ? 'checkmark' : 'copy-outline'} size={15} color={codeCopied ? '#22C55E' : c.textMuted} />
              </Pressable>
              {/* Regenerate button — admins only */}
              {isAdmin && (
                <Pressable onPress={handleRegenerateCode} style={[styles.codeAction, { borderColor: c.border }]}>
                  <Ionicons name="refresh-outline" size={15} color={c.textMuted} />
                </Pressable>
              )}
            </View>

            {/* Editable input for admins, read-only display otherwise */}
            {isAdmin ? (
              <View style={styles.codeInputRow}>
                <TextInput
                  value={joinCode}
                  onChangeText={(v) => setJoinCode(v.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                  placeholder="e.g. KAPPA-ABC"
                  placeholderTextColor={c.textSubtle}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={[styles.codeInput, {
                    backgroundColor: c.background,
                    borderColor: c.border,
                    color: c.text,
                    fontFamily: theme.typography.fontFamily.medium,
                  }]}
                />
                <Pressable
                  onPress={handleSaveCode}
                  disabled={codeSaving || !joinCode.trim() || joinCode.trim() === (organization?.join_code ?? '')}
                  style={({ pressed }) => [
                    styles.codeSaveBtn,
                    { backgroundColor: c.primary, opacity: pressed ? 0.75 : 1 },
                    (codeSaving || !joinCode.trim() || joinCode.trim() === (organization?.join_code ?? '')) && { opacity: 0.4 },
                  ]}
                >
                  {codeSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text size="xs" weight="medium" style={{ color: '#fff' }}>Save</Text>
                  }
                </Pressable>
              </View>
            ) : (
              <View style={[styles.codeDisplay, { backgroundColor: c.background, borderColor: c.border }]}>
                <Text size="md" weight="medium" style={{ letterSpacing: 2, fontFamily: theme.typography.fontFamily.medium }}>
                  {organization?.join_code ?? '—'}
                </Text>
              </View>
            )}
          </View>
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

  // Join code section inside the Chapter card
  codeSection:  { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, gap: 10 },
  codeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  codeAction:   { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  codeInputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  codeInput:    { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, letterSpacing: 1 },
  codeSaveBtn:  { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  codeDisplay:  { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },

  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4 },

  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15,
  },
  saveRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
});
