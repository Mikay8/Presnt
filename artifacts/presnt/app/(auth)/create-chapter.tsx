/**
 * Create Chapter — multi-step onboarding flow
 *
 * Step 1: Choose affiliation
 *   • "Under an existing organization" — requires org join code
 *   • "Independent" — standalone chapter with no parent org
 *
 * Step 2 (org path): Enter the org join code → look up and confirm the parent org
 *
 * Step 3: Enter chapter details (name, school, join code, color)
 *
 * On success:
 *   • If under an org → user becomes 'admin' of the new chapter;
 *     the parent org_admin can now see this chapter.
 *   • If INDEPENDENT → chapter is created with no parent_org_id;
 *     label stored as institution = 'INDEPENDENT' and type = 'chapter'.
 *     User becomes 'admin'.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Input, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import type { Tables } from '@/types/database';

type Organization = Tables<'organizations'>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRAND_COLORS = [
  '#E26B4A', '#3B82F6', '#22C55E', '#A855F7', '#CA8A04', '#1C1917',
];

function slugify(text: string) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function generateJoinCode(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const rand  = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${base}-${rand}`;
}

function getCurrentSemester() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  if (month <= 5) return { name: `Spring ${year}`, start: `${year}-01-15`, end: `${year}-05-15` };
  if (month <= 7) return { name: `Summer ${year}`, start: `${year}-05-16`, end: `${year}-08-15` };
  return { name: `Fall ${year}`, start: `${year}-08-16`, end: `${year}-12-20` };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Affiliation = 'org' | 'independent' | null;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CreateChapterScreen() {
  const theme   = useThemeStore((s) => s.theme);
  const { user, setMembership } = useAuthStore();
  const insets  = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide  = width >= 800;
  const c = theme.colors;

  // ── Step state ─────────────────────────────────────────────────────────────
  // step 1 = affiliation choice
  // step 2 = org join code (only for 'org' path)
  // step 3 = chapter details
  const [step,        setStep]        = useState<1 | 2 | 3>(1);
  const [affiliation, setAffiliation] = useState<Affiliation>(null);

  // ── Step 2: org join code lookup ───────────────────────────────────────────
  const [orgCode,      setOrgCode]      = useState('');
  const [lookingUp,    setLookingUp]    = useState(false);
  const [orgCodeErr,   setOrgCodeErr]   = useState('');
  const [parentOrg,    setParentOrg]    = useState<Organization | null>(null);

  // ── Step 3: chapter details ────────────────────────────────────────────────
  const [name,         setName]         = useState('');
  const [institution,  setInstitution]  = useState('');
  const [greekLetter,  setGreekLetter]  = useState('');
  const [primaryColor, setPrimaryColor] = useState(BRAND_COLORS[0]);
  const [joinCode,     setJoinCode]     = useState('');
  const [codeEdited,   setCodeEdited]   = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  // ── Step 3: date term (optional) ──────────────────────────────────────────
  const defaultTerm = getCurrentSemester();
  const [termName,  setTermName]  = useState(defaultTerm.name);
  const [termStart, setTermStart] = useState(defaultTerm.start);
  const [termEnd,   setTermEnd]   = useState(defaultTerm.end);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function handleNameChange(val: string) {
    setName(val);
    if (!codeEdited && val.trim()) setJoinCode(generateJoinCode(val));
  }
  function handleCodeChange(val: string) {
    setJoinCode(val.toUpperCase().replace(/[^A-Z0-9-]/g, ''));
    setCodeEdited(true);
  }
  function handleRegen() {
    setJoinCode(generateJoinCode(name.trim() || 'CHAPTER'));
    setCodeEdited(false);
  }

  // ── Step 1 → 2/3 ──────────────────────────────────────────────────────────

  function handleSelectAffiliation(a: Affiliation) {
    setAffiliation(a);
    if (a === 'org') {
      setStep(2);
    } else {
      setParentOrg(null);
      setStep(3);
    }
  }

  // ── Step 2: look up parent org by join code ────────────────────────────────

  async function handleLookupOrg() {
    const entered = orgCode.trim().toUpperCase();
    if (!entered) { setOrgCodeErr('Enter the organization join code.'); return; }

    setLookingUp(true);
    setOrgCodeErr('');

    // anon-accessible: orgs_select_anon_by_code policy allows reading any org
    // that has a join_code set and is active & not deleted.
    const { data, error: err } = await supabase
      .from('organizations')
      .select('*')
      .eq('join_code', entered)
      .eq('is_deleted', false)
      .eq('is_active', true)
      .neq('type', 'chapter')        // parent orgs only
      .maybeSingle();

    setLookingUp(false);

    if (err || !data) {
      setOrgCodeErr('No organization found with that code. Check with your org admin.');
      return;
    }

    setParentOrg(data);
    setStep(3);
  }

  // ── Step 3: create chapter ─────────────────────────────────────────────────

  async function handleCreate() {
    if (!name.trim() || !institution.trim()) {
      setError('Chapter name and school are required.');
      return;
    }
    const code = joinCode.trim() || generateJoinCode(name);
    if (code.length < 3) {
      setError('Join code must be at least 3 characters.');
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

    // Create the chapter org row
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name:             name.trim(),
        slug:             slugify(name),
        type:             'chapter',
        parent_org_id:    parentOrg?.id ?? null,
        institution:      affiliation === 'independent' ? 'INDEPENDENT' : institution.trim(),
        greek_letter_org: greekLetter.trim() || null,
        primary_color:    primaryColor,
        timezone:         'America/New_York',
        join_code:        code,
        created_by:       userId,
        is_active:        true,
        is_deleted:       false,
      })
      .select()
      .single();

    if (orgError || !org) {
      setLoading(false);
      setError(orgError?.message ?? 'Failed to create chapter. The name may already be taken.');
      return;
    }

    // Create admin membership
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .insert({
        user_id:    userId,
        org_id:     org.id,
        status:     'active',
        role:       'admin',
        is_deleted: false,
        joined_at:  new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (membershipError || !membership) {
      setLoading(false);
      setError(membershipError?.message ?? 'Failed to create membership.');
      return;
    }

    // Seed first academic term (use user-supplied values, or auto-detected defaults)
    const tName  = termName.trim()  || defaultTerm.name;
    const tStart = termStart.trim() || defaultTerm.start;
    const tEnd   = termEnd.trim()   || defaultTerm.end;
    await supabase.from('academic_terms').insert({
      org_id:     org.id,
      name:       tName,
      start_date: tStart,
      end_date:   tEnd,
      is_active:  true,
    });

    await supabase.auth.refreshSession();
    setMembership(membership, org);
    setLoading(false);
    router.replace('/(admin)/dashboard');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const totalSteps = affiliation === 'org' ? 3 : 2;
  const currentDot = step === 1 ? 1 : step === 2 ? 2 : affiliation === 'org' ? 3 : 2;

  const dots = (
    <View style={styles.dots}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <View
          key={i}
          style={[styles.dot, { backgroundColor: i < currentDot ? c.primary : c.border }]}
        />
      ))}
    </View>
  );

  function handleBack() {
    if (step === 3 && affiliation === 'org') { setStep(2); return; }
    if (step === 3 && affiliation === 'independent') { setStep(1); return; }
    if (step === 2) { setStep(1); return; }
    router.back();
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </TouchableOpacity>
        {dots}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Step 1: Affiliation choice ──────────────────────────────────── */}
        {step === 1 && (
          <>
            <Text size="h1" weight="bold" style={styles.heading}>Create your chapter</Text>
            <Text size="md" color={c.textMuted} style={styles.subheading}>
              Is your chapter part of an existing organization, or is it independent?
            </Text>

            <View style={[styles.optionCards, isWide && styles.optionCardsWide]}>
              {/* Under an org */}
              <Pressable
                onPress={() => handleSelectAffiliation('org')}
                style={({ pressed }) => [
                  styles.optionCard,
                  { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <View style={[styles.optionIcon, { backgroundColor: c.primary + '22' }]}>
                  <Ionicons name="globe-outline" size={28} color={c.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text size="md" weight="bold">Under an organization</Text>
                  <Text size="sm" color={c.textMuted} style={{ marginTop: 4 }}>
                    Join an existing national, HQ, or council organization. You'll need the org join code.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.textSubtle} />
              </Pressable>

              {/* Independent */}
              <Pressable
                onPress={() => handleSelectAffiliation('independent')}
                style={({ pressed }) => [
                  styles.optionCard,
                  { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <View style={[styles.optionIcon, { backgroundColor: c.surfaceAlt }]}>
                  <Ionicons name="business-outline" size={28} color={c.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text size="md" weight="bold">Independent chapter</Text>
                  <Text size="sm" color={c.textMuted} style={{ marginTop: 4 }}>
                    Standalone chapter not affiliated with a larger organization. Labeled INDEPENDENT.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.textSubtle} />
              </Pressable>
            </View>
          </>
        )}

        {/* ── Step 2: Org join code ───────────────────────────────────────── */}
        {step === 2 && (
          <>
            <Text size="h1" weight="bold" style={styles.heading}>Enter org join code</Text>
            <Text size="md" color={c.textMuted} style={styles.subheading}>
              Ask your organization admin for the org-level join code to link your chapter.
            </Text>

            <View style={[styles.formCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text size="xs" weight="medium" color={c.textMuted} style={styles.sectionLabel}>
                Organization Join Code
              </Text>

              <TextInput
                style={[styles.codeInput, {
                  backgroundColor: c.background,
                  borderColor: orgCodeErr ? c.error : c.border,
                  color: c.text,
                  fontFamily: 'SpaceGrotesk_600SemiBold',
                  // @ts-ignore
                  outline: 'none',
                }]}
                value={orgCode}
                onChangeText={(v) => { setOrgCode(v.toUpperCase().replace(/[^A-Z0-9-]/g, '')); setOrgCodeErr(''); }}
                placeholder="e.g. AKPSI-XYZ"
                placeholderTextColor={c.textSubtle}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleLookupOrg}
              />

              {orgCodeErr ? (
                <Text size="sm" color={c.error} style={{ marginTop: 4 }}>{orgCodeErr}</Text>
              ) : null}

              {lookingUp && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <ActivityIndicator size="small" color={c.textMuted} />
                  <Text size="sm" color={c.textMuted}>Looking up organization…</Text>
                </View>
              )}
            </View>

            <View style={[styles.actions, isWide && styles.actionsWide]}>
              <Button label="Back" variant="outline" onPress={() => setStep(1)} style={styles.cancelBtn} />
              <Button label="Continue →" onPress={handleLookupOrg} loading={lookingUp} style={styles.submitBtn} />
            </View>
          </>
        )}

        {/* ── Step 3: Chapter details ─────────────────────────────────────── */}
        {step === 3 && (
          <>
            <Text size="h1" weight="bold" style={styles.heading}>Chapter details</Text>
            {parentOrg ? (
              <Text size="md" color={c.textMuted} style={styles.subheading}>
                Creating a chapter under{' '}
                <Text size="md" weight="bold" color={c.text}>{parentOrg.name}</Text>
              </Text>
            ) : (
              <Text size="md" color={c.textMuted} style={styles.subheading}>
                Creating an <Text size="md" weight="bold" color={c.text}>independent</Text> chapter. You can update everything later.
              </Text>
            )}

            {/* Parent org confirmation pill */}
            {parentOrg && (
              <View style={[styles.orgPill, { backgroundColor: c.primary + '18', borderColor: c.primary + '55' }]}>
                <Ionicons name="checkmark-circle" size={16} color={c.primary} />
                <Text size="sm" weight="medium" color={c.primary} numberOfLines={1} style={{ flex: 1 }}>
                  {parentOrg.name}
                </Text>
                <Pressable onPress={() => { setStep(2); setParentOrg(null); }}>
                  <Ionicons name="close-circle-outline" size={16} color={c.primary} />
                </Pressable>
              </View>
            )}

            <View style={[styles.formCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              {/* Identity */}
              <Text size="xs" weight="medium" color={c.textMuted} style={styles.sectionLabel}>Identity</Text>

              <View style={[styles.row, !isWide && styles.col]}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Chapter name"
                    value={name}
                    onChangeText={handleNameChange}
                    placeholder="e.g. Kappa Sigma"
                    autoCapitalize="words"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label={affiliation === 'independent' ? 'School / Location' : 'School / Location'}
                    value={institution}
                    onChangeText={setInstitution}
                    placeholder="UCLA / Los Angeles"
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <Input
                label="Greek letters (optional)"
                value={greekLetter}
                onChangeText={setGreekLetter}
                placeholder="Kappa Sigma"
                autoCapitalize="words"
              />

              {/* Join Code */}
              <View style={styles.sectionDivider} />
              <Text size="xs" weight="medium" color={c.textMuted} style={styles.sectionLabel}>Join Code</Text>
              <Text size="xs" color={c.textSubtle} style={{ marginBottom: 8, marginTop: -4 }}>
                Members will enter this code to join your chapter. You can change it anytime in Settings.
              </Text>

              <View style={styles.codeRow}>
                <View style={{ flex: 1 }}>
                  <Input
                    label=""
                    value={joinCode}
                    onChangeText={handleCodeChange}
                    placeholder="e.g. KAPPA-ABC"
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </View>
                <Pressable
                  onPress={handleRegen}
                  style={[styles.regenBtn, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}
                >
                  <Ionicons name="refresh-outline" size={18} color={c.textMuted} />
                </Pressable>
              </View>

              {/* Date Term */}
              <View style={styles.sectionDivider} />
              <Text size="xs" weight="medium" color={c.textMuted} style={styles.sectionLabel}>First Academic Term</Text>
              <Text size="xs" color={c.textSubtle} style={{ marginBottom: 4, marginTop: -4 }}>
                Pre-filled with the current semester. You can change it any time in Settings.
              </Text>

              <Input
                label="Term name"
                value={termName}
                onChangeText={setTermName}
                placeholder="e.g. Fall 2026"
              />

              <View style={[styles.row, !isWide && styles.col]}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Start date"
                    value={termStart}
                    onChangeText={setTermStart}
                    placeholder="YYYY-MM-DD"
                    autoCorrect={false}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="End date"
                    value={termEnd}
                    onChangeText={setTermEnd}
                    placeholder="YYYY-MM-DD"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Branding */}
              <View style={styles.sectionDivider} />
              <Text size="xs" weight="medium" color={c.textMuted} style={styles.sectionLabel}>Branding</Text>

              <View style={styles.colorRow}>
                <Text size="xs" weight="medium" color={c.textMuted}
                  style={[styles.sectionLabel, { marginBottom: 0, marginRight: 12 }]}>
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
                      {primaryColor === color && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {error ? <Text size="sm" color={c.error}>{error}</Text> : null}
            </View>

            <View style={[styles.actions, isWide && styles.actionsWide]}>
              <Button label="Back" variant="outline" onPress={handleBack} style={styles.cancelBtn} />
              <Button label="Create chapter" onPress={handleCreate} loading={loading} style={styles.submitBtn} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1 },
  topBar:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn:      { padding: 4 },
  dots:         { flexDirection: 'row', gap: 6 },
  dot:          { width: 20, height: 6, borderRadius: 3 },

  scroll:       { paddingHorizontal: 20, paddingBottom: 48, gap: 20 },
  scrollWide:   { paddingHorizontal: 48, maxWidth: 860, alignSelf: 'center', width: '100%' },

  heading:      { marginBottom: 4 },
  subheading:   { marginBottom: 4 },

  // Step 1 option cards
  optionCards:      { gap: 12 },
  optionCardsWide:  {},
  optionCard:       { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 16, padding: 18 },
  optionIcon:       { width: 52, height: 52, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Step 2 code input
  codeInput:    { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, fontSize: 20, letterSpacing: 2, textAlign: 'center' },

  // Step 3 form
  formCard:       { borderRadius: 16, borderWidth: 1, padding: 24, gap: 16 },
  sectionLabel:   { textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: -4 },
  sectionDivider: { height: 1, backgroundColor: 'transparent' },

  orgPill:      { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },

  row:     { flexDirection: 'row', gap: 12 },
  col:     { flexDirection: 'column' },

  codeRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  regenBtn:  { width: 44, height: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },

  colorRow:  { flexDirection: 'row', alignItems: 'center' },
  swatches:  { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  swatch:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  swatchSelected: { borderWidth: 3, borderColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },

  actions:    { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  actionsWide:{},
  cancelBtn:  { flex: 1, maxWidth: 120 },
  submitBtn:  { flex: 1, maxWidth: 220 },
});
