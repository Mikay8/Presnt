/**
 * Create Organization flow — two-step form
 *
 * Step 1: Name the Organization (national / umbrella entity)
 * Step 2: Create the first Chapter under it
 *
 * On success: user gets an 'org_admin' membership in the parent org
 * and an 'admin' membership in the first chapter.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Input, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

const BRAND_COLORS = [
  '#E26B4A', '#3B82F6', '#22C55E', '#A855F7', '#CA8A04', '#1C1917',
];

function slugify(str: string) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function generateJoinCode(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${base}-${rand}`;
}

export default function CreateOrgScreen() {
  const theme = useThemeStore((s) => s.theme);
  const { user, setMembership } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  // ── Step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 — Organization fields
  const [orgName, setOrgName]           = useState('');
  const [orgGreek, setOrgGreek]         = useState('');
  const [orgType, setOrgType]           = useState<'national_hq' | 'council'>('national_hq');

  // Step 2 — First chapter fields
  const [chapterName, setChapterName]   = useState('');
  const [institution, setInstitution]   = useState('');
  const [primaryColor, setPrimaryColor] = useState(BRAND_COLORS[0]);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // ── Step 1 validation ───────────────────────────────────────────────────────
  function handleNextStep() {
    if (!orgName.trim()) { setError('Organization name is required.'); return; }
    setError('');
    setStep(2);
  }

  // ── Final submission ────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!chapterName.trim() || !institution.trim()) {
      setError('Chapter name and school are required.');
      return;
    }

    let userId = user?.id;
    if (!userId) {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id;
    }
    if (!userId) { setError('Not logged in. Please restart the app.'); return; }

    setError('');
    setLoading(true);

    // ── 1. Create the parent Organization ─────────────────────────────────────
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name:             orgName.trim(),
        slug:             slugify(orgName),
        type:             orgType,
        greek_letter_org: orgGreek.trim() || null,
        timezone:         'America/New_York',
        created_by:       userId,
        is_active:        true,
        is_deleted:       false,
      })
      .select()
      .single();

    if (orgError || !org) {
      setLoading(false);
      setError(orgError?.message ?? 'Failed to create organization. The name may already be taken.');
      return;
    }

    // ── 2. Org admin membership for creator ───────────────────────────────────
    await supabase.from('memberships').insert({
      user_id:   userId,
      org_id:    org.id,
      status:    'active',
      role:      'org_admin',
      joined_at: new Date().toISOString().split('T')[0],
    });

    // ── 3. Create the first Chapter under this org ────────────────────────────
    // Insert into chapters table; trigger syncs back to organizations automatically.
    const joinCode = generateJoinCode(chapterName);
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .insert({
        name:          chapterName.trim(),
        slug:          slugify(chapterName),
        org_id:        org.id,
        institution:   institution.trim(),
        primary_color: primaryColor,
        timezone:      'America/New_York',
        join_code:     joinCode,
        created_by:    userId,
        is_active:     true,
        is_deleted:    false,
      })
      .select()
      .single();

    if (chapterError || !chapter) {
      setLoading(false);
      setError(chapterError?.message ?? 'Failed to create chapter.');
      return;
    }

    // ── 4. Admin membership in the chapter ────────────────────────────────────
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .insert({
        user_id:   userId,
        org_id:    chapter.id,
        status:    'active',
        role:      'admin',
        joined_at: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (membershipError || !membership) {
      setLoading(false);
      setError(membershipError?.message ?? 'Failed to create membership.');
      return;
    }

    // Fetch the org_admin membership (for the parent org) so the auth store
    // has the correct role — routes the user to the org-admin portal.
    const { data: orgAdminMembership } = await supabase
      .from('memberships')
      .select('*, organizations(*)')
      .eq('user_id', userId)
      .eq('org_id', org.id)
      .eq('role', 'org_admin')
      .single();

    if (orgAdminMembership) {
      const { organizations: orgRow, ...membershipOnly } = orgAdminMembership as typeof orgAdminMembership & {
        organizations: NonNullable<typeof orgAdminMembership>['organizations'];
      };
      setMembership(membershipOnly, orgRow ?? null);
    } else {
      setMembership(membership, chapter);
    }

    setLoading(false);
    router.replace('/(org-admin)/dashboard');
  }

  // ── Step dots ───────────────────────────────────────────────────────────────
  const dots = (
    <View style={styles.dots}>
      {[1, 2].map((n) => (
        <View
          key={n}
          style={[
            styles.dot,
            { backgroundColor: n <= step ? theme.colors.primary : theme.colors.border },
          ]}
        />
      ))}
    </View>
  );

  // ── Step 1 form ─────────────────────────────────────────────────────────────
  const step1Form = (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text size="xs" weight="medium" color={theme.colors.textMuted} style={styles.sectionLabel}>
        Organization type
      </Text>
      <View style={styles.typeRow}>
        {(['national_hq', 'council'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setOrgType(t)}
            style={[
              styles.typeChip,
              {
                backgroundColor: orgType === t ? theme.colors.primary + '22' : theme.colors.surfaceAlt,
                borderColor: orgType === t ? theme.colors.primary : theme.colors.border,
              },
            ]}
          >
            <Text
              size="sm"
              weight={orgType === t ? 'semibold' : 'regular'}
              color={orgType === t ? theme.colors.primary : theme.colors.textMuted}
            >
              {t === 'national_hq' ? 'National / HQ' : 'Council / Region'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Input
        label="Organization name"
        value={orgName}
        onChangeText={setOrgName}
        placeholder="e.g. Alpha Kappa Psi"
        autoCapitalize="words"
      />
      <Input
        label="Greek letters (optional)"
        value={orgGreek}
        onChangeText={setOrgGreek}
        placeholder="ΑΚΨ"
      />

      {error ? <Text size="sm" color={theme.colors.error}>{error}</Text> : null}
    </View>
  );

  // ── Step 2 form ─────────────────────────────────────────────────────────────
  const step2Form = (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text size="xs" weight="medium" color={theme.colors.textMuted} style={styles.sectionLabel}>
        First chapter
      </Text>
      <Text size="sm" color={theme.colors.textMuted} style={{ marginTop: -8 }}>
        Under <Text size="sm" weight="semibold" color={theme.colors.text}>{orgName}</Text>
      </Text>

      <View style={[styles.row, !isWide && styles.col]}>
        <View style={{ flex: 1 }}>
          <Input
            label="Chapter name"
            value={chapterName}
            onChangeText={setChapterName}
            placeholder="e.g. Beta Chapter"
            autoCapitalize="words"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="School / institution / location"
            value={institution}
            onChangeText={setInstitution}
            placeholder="University of Michigan"
            autoCapitalize="words"
          />
        </View>
      </View>

      {/* Color picker */}
      <View style={styles.colorRow}>
        <Text size="xs" weight="medium" color={theme.colors.textMuted} style={[styles.sectionLabel, { marginBottom: 0, marginRight: 12 }]}>
          Color
        </Text>
        <View style={styles.swatches}>
          {BRAND_COLORS.map((color) => (
            <TouchableOpacity
              key={color}
              onPress={() => setPrimaryColor(color)}
              style={[
                styles.swatch,
                { backgroundColor: color },
                primaryColor === color && styles.swatchSelected,
              ]}
            >
              {primaryColor === color && (
                <Ionicons name="checkmark" size={14} color="#fff" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {error ? <Text size="sm" color={theme.colors.error}>{error}</Text> : null}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => step === 2 ? setStep(1) : router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        {dots}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 ? (
          <>
            <Text size="h1" weight="bold" style={styles.heading}>Create your organization</Text>
            <Text size="md" color={theme.colors.textMuted} style={styles.subheading}>
              Define the umbrella organization. You'll add chapters to it next.
            </Text>
            {step1Form}
            <View style={[styles.actions, isWide && styles.actionsWide]}>
              <Button label="Cancel" variant="outline" onPress={() => router.back()} style={styles.cancelBtn} />
              <Button label="Next →" onPress={handleNextStep} style={styles.submitBtn} />
            </View>
          </>
        ) : (
          <>
            <Text size="h1" weight="bold" style={styles.heading}>Add your first chapter</Text>
            <Text size="md" color={theme.colors.textMuted} style={styles.subheading}>
              You can add more chapters later from the organization admin panel.
            </Text>
            {step2Form}
            <View style={[styles.actions, isWide && styles.actionsWide]}>
              <Button label="Back" variant="outline" onPress={() => setStep(1)} style={styles.cancelBtn} />
              <Button label="Create organization" onPress={handleCreate} loading={loading} style={styles.submitBtn} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1 },
  topBar:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn:        { padding: 4 },
  dots:           { flexDirection: 'row', gap: 6 },
  dot:            { width: 20, height: 6, borderRadius: 3 },

  scroll:         { paddingHorizontal: 20, paddingBottom: 48, gap: 20 },
  scrollWide:     { paddingHorizontal: 48, maxWidth: 860, alignSelf: 'center', width: '100%' },

  heading:        { marginBottom: 4 },
  subheading:     { marginBottom: 4 },

  card:           { borderRadius: 16, borderWidth: 1, padding: 24, gap: 16 },
  sectionLabel:   { textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: -4 },

  typeRow:        { flexDirection: 'row', gap: 10 },
  typeChip:       { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },

  row:            { flexDirection: 'row', gap: 12 },
  col:            { flexDirection: 'column' },

  colorRow:       { flexDirection: 'row', alignItems: 'center' },
  swatches:       { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  swatch:         { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  swatchSelected: { borderWidth: 3, borderColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },

  actions:        { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  actionsWide:    {},
  cancelBtn:      { flex: 1, maxWidth: 120 },
  submitBtn:      { flex: 1, maxWidth: 220 },
});
