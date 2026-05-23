/**
 * Org Admin — Settings
 *
 * - Organization name (editable)
 * - Org join code: the code new chapters enter to link themselves to this org
 *   (editable; shown with copy button)
 * - Chapter join codes: read-only list of all chapters' join codes (view + copy)
 * - Sign out
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Pressable,
  RefreshControl,
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

// ─── Types ────────────────────────────────────────────────────────────────────

type Chapter = {
  id:        string;
  name:      string;
  join_code: string | null;
  institution: string | null;
};

// ─── Join code copy pill ──────────────────────────────────────────────────────

function JoinCodePill({ code, label, color = ORG_ADMIN_BLUE }: { code: string; label?: string; color?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Pressable
      onPress={handleCopy}
      style={({ pressed }) => [
        styles.codePill,
        { backgroundColor: color + '14', borderColor: color + '44', opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <Text
        size="sm"
        weight="medium"
        color={color}
        style={{ letterSpacing: 1.5, fontFamily: 'SpaceGrotesk_600SemiBold', flex: 1 }}
        numberOfLines={1}
      >
        {code}
      </Text>
      <Ionicons
        name={copied ? 'checkmark-done-outline' : 'copy-outline'}
        size={15}
        color={copied ? '#22C55E' : color}
      />
      {label && (
        <Text size="xs" color={color} style={{ marginLeft: 2 }}>
          {copied ? 'Copied!' : label}
        </Text>
      )}
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OrgAdminSettingsScreen() {
  const { theme }        = useThemeStore();
  const insets           = useSafeAreaInsets();
  const { width }        = useWindowDimensions();
  const isWide           = width >= 800;
  const { organization, profile } = useAuthStore();

  const [orgName,    setOrgName]    = useState(organization?.name ?? '');
  const [orgCode,    setOrgCode]    = useState(organization?.join_code ?? '');
  const [codeEdited, setCodeEdited] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [signingOut, setSignOut]    = useState(false);

  const [chapters,      setChapters]      = useState<Chapter[]>([]);
  const [loadingChaps,  setLoadingChaps]  = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);

  const c = theme.colors;

  // ── Load chapters ──────────────────────────────────────────────────────────

  const loadChapters = useCallback(async () => {
    if (!organization?.id) return;
    const { data } = await supabase
      .from('organizations')
      .select('id, name, join_code, institution')
      .eq('parent_org_id', organization.id)
      .eq('is_deleted', false)
      .order('name', { ascending: true });
    setChapters((data ?? []) as Chapter[]);
    setLoadingChaps(false);
  }, [organization?.id]);

  useEffect(() => { loadChapters(); }, [loadChapters]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadChapters();
    setRefreshing(false);
  }

  // ── Save org settings (name + join code) ───────────────────────────────────

  async function handleSave() {
    if (!orgName.trim() || !organization?.id) return;
    const trimmedCode = orgCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    setSaving(true);
    const { error } = await supabase
      .from('organizations')
      .update({
        name:      orgName.trim(),
        join_code: trimmedCode || null,
      })
      .eq('id', organization.id);
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setCodeEdited(false);
      Alert.alert('Saved', 'Organization settings updated.');
    }
  }

  function generateCode() {
    const base = (orgName || organization?.name || 'ORG').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const rand  = Math.random().toString(36).slice(2, 5).toUpperCase();
    setOrgCode(`${base}-${rand}`);
    setCodeEdited(true);
  }

  async function handleSignOut() {
    setSignOut(true);
    await supabase.auth.signOut();
    setSignOut(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* ── Your Account ─────────────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text size="xs" weight="medium" color={c.textMuted} style={styles.sectionLabel}>
            Your Account
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.avatar, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Text size="md" weight="bold" color={c.textMuted}>
                {profile?.first_name?.[0]}{profile?.last_name?.[0]}
              </Text>
            </View>
            <View>
              <Text size="md" weight="bold">
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

        {/* ── Organization settings ─────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text size="xs" weight="medium" color={c.textMuted} style={styles.sectionLabel}>
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
        </View>

        {/* ── Org Join Code ─────────────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text size="xs" weight="medium" color={c.textMuted} style={styles.sectionLabel}>
            Organization Join Code
          </Text>
          <Text size="xs" color={c.textSubtle} style={{ marginTop: 2, marginBottom: 6 }}>
            Chapter admins enter this code when creating a chapter to link it to your organization.
          </Text>

          {orgCode ? (
            <JoinCodePill code={orgCode} label="Copy" color={ORG_ADMIN_BLUE} />
          ) : (
            <View style={[styles.emptyCode, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Ionicons name="key-outline" size={18} color={c.textSubtle} />
              <Text size="sm" color={c.textSubtle}>No org join code set yet</Text>
            </View>
          )}

          {/* Editable input */}
          <View style={[styles.codeInputRow, { marginTop: 12 }]}>
            <View style={{ flex: 1 }}>
              <Input
                label="Set or change org join code"
                value={orgCode}
                onChangeText={(v) => { setOrgCode(v.toUpperCase().replace(/[^A-Z0-9-]/g, '')); setCodeEdited(true); }}
                placeholder="e.g. AKPSI-XYZ"
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
            <Pressable
              onPress={generateCode}
              style={[styles.regenBtn, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}
            >
              <Ionicons name="refresh-outline" size={18} color={c.textMuted} />
            </Pressable>
          </View>

          <Button
            label="Save changes"
            onPress={handleSave}
            loading={saving}
            style={{ marginTop: 12 }}
          />
        </View>

        {/* ── Chapter Join Codes ────────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text size="xs" weight="medium" color={c.textMuted} style={styles.sectionLabel}>
            Chapter Join Codes
          </Text>
          <Text size="xs" color={c.textSubtle} style={{ marginTop: 2, marginBottom: 10 }}>
            Members enter these codes to join individual chapters. Tap any code to copy it.
          </Text>

          {loadingChaps ? (
            <ActivityIndicator size="small" color={c.textMuted} />
          ) : chapters.length === 0 ? (
            <View style={[styles.emptyCode, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Ionicons name="business-outline" size={18} color={c.textSubtle} />
              <Text size="sm" color={c.textSubtle}>No chapters yet</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {chapters.map((ch) => (
                <View key={ch.id} style={styles.chapterRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" weight="medium" numberOfLines={1}>{ch.name}</Text>
                    {ch.institution ? (
                      <Text size="xs" color={c.textSubtle} numberOfLines={1}>{ch.institution}</Text>
                    ) : null}
                  </View>
                  {ch.join_code ? (
                    <JoinCodePill code={ch.join_code} color={ORG_ADMIN_BLUE} />
                  ) : (
                    <View style={[styles.noCode, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                      <Text size="xs" color={c.textSubtle}>No code</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Sign out ──────────────────────────────────────────────────────── */}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:      { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  scroll:      { padding: 20, gap: 16, paddingBottom: 48 },
  scrollWide:  { paddingHorizontal: 48, maxWidth: 760, alignSelf: 'center', width: '100%' },

  section:     { borderRadius: 14, borderWidth: 1, padding: 18, gap: 4 },
  sectionLabel:{ textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

  avatar:      { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge:       { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },

  // Join code input row (input + regen button)
  codeInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  regenBtn:     { width: 44, height: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },

  // Join code display pill
  codePill:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },

  // Empty state
  emptyCode:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },

  // Chapter list row
  chapterRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  noCode:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },

  signOutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 14 },
});
