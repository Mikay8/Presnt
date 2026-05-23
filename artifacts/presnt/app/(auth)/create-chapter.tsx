import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Pressable,
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
  '#E26B4A', // orange (default)
  '#3B82F6', // blue
  '#22C55E', // green
  '#A855F7', // purple
  '#CA8A04', // gold
  '#1C1917', // near-black
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

export default function CreateChapterScreen() {
  const theme = useThemeStore((s) => s.theme);
  const { user, setMembership } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 800;
  const c = theme.colors;

  const [name,          setName]         = useState('');
  const [institution,   setInstitution]  = useState('');
  const [greekLetterOrg,setGreekLetter]  = useState('');
  const [primaryColor,  setPrimaryColor] = useState(BRAND_COLORS[0]);
  // Join code — pre-generated but editable; regenerates when name changes if still pristine
  const [joinCode,      setJoinCode]     = useState('');
  const [codeEdited,    setCodeEdited]   = useState(false);
  const [loading,       setLoading]      = useState(false);
  const [error,         setError]        = useState('');

  // Auto-update the join code as the user types the chapter name,
  // unless they've manually edited the code field.
  function handleNameChange(val: string) {
    setName(val);
    if (!codeEdited && val.trim()) {
      setJoinCode(generateJoinCode(val));
    }
  }

  function handleRegenerateCode() {
    const base = name.trim() || 'CHAPTER';
    setJoinCode(generateJoinCode(base));
    setCodeEdited(false);
  }

  function handleCodeChange(val: string) {
    // Force uppercase, allow letters, digits, hyphens
    setJoinCode(val.toUpperCase().replace(/[^A-Z0-9-]/g, ''));
    setCodeEdited(true);
  }

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

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name:             name.trim(),
        slug:             slugify(name),
        type:             'chapter',
        institution:      institution.trim(),
        greek_letter_org: greekLetterOrg.trim() || null,
        primary_color:    primaryColor,
        timezone:         'America/New_York',
        join_code:        code,
        created_by:       userId,
      })
      .select()
      .single();

    if (orgError || !org) {
      setLoading(false);
      setError(orgError?.message ?? 'Failed to create chapter. The name may already be taken.');
      return;
    }

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

    const semester = getCurrentSemester();
    await supabase.from('academic_terms').insert({
      org_id:     org.id,
      name:       semester.name,
      start_date: semester.start,
      end_date:   semester.end,
      is_active:  true,
    });

    // Refresh session so _layout reloads membership from DB.
    await supabase.auth.refreshSession();
    setMembership(membership, org);
    setLoading(false);
    router.replace('/(admin)/dashboard');
  }

  const formContent = (
    <View style={[styles.formCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* IDENTITY */}
      <Text size="xs" weight="medium" color={c.textMuted} style={styles.sectionLabel}>
        Identity
      </Text>

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
            label="School / Location"
            value={institution}
            onChangeText={setInstitution}
            placeholder="UCLA / Los Angeles"
            autoCapitalize="words"
          />
        </View>
      </View>

      <Input
        label="Greek letters (optional)"
        value={greekLetterOrg}
        onChangeText={setGreekLetter}
        placeholder="Kappa Sigma"
        autoCapitalize="words"
      />

      {/* JOIN CODE */}
      <View style={styles.sectionDivider} />
      <Text size="xs" weight="medium" color={c.textMuted} style={styles.sectionLabel}>
        Join Code
      </Text>
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
          onPress={handleRegenerateCode}
          style={[styles.regenBtn, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}
        >
          <Ionicons name="refresh-outline" size={18} color={c.textMuted} />
        </Pressable>
      </View>

      {/* BRANDING */}
      <View style={styles.sectionDivider} />
      <Text size="xs" weight="medium" color={c.textMuted} style={styles.sectionLabel}>
        Branding
      </Text>

      {/* Color swatches */}
      <View style={styles.colorRow}>
        <Text size="xs" weight="medium" color={c.textMuted} style={[styles.sectionLabel, { marginBottom: 0, marginRight: 12 }]}>
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

      {error ? <Text size="sm" color={c.error}>{error}</Text> : null}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </TouchableOpacity>
        <View style={styles.dots}>
          <View style={[styles.dot, { backgroundColor: c.primary }]} />
          <View style={[styles.dot, { backgroundColor: c.border }]} />
          <View style={[styles.dot, { backgroundColor: c.border }]} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text size="h1" weight="bold" style={styles.heading}>Create your chapter</Text>
        <Text size="md" color={c.textMuted} style={styles.subheading}>
          This takes under 2 minutes. You can update everything later.
        </Text>

        {formContent}

        <View style={[styles.actions, isWide && styles.actionsWide]}>
          <Button label="Cancel" variant="outline" onPress={() => router.back()} style={styles.cancelBtn} />
          <Button label="Create chapter" onPress={handleCreate} loading={loading} style={styles.submitBtn} />
        </View>
      </ScrollView>
    </View>
  );
}

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

  formCard:     { borderRadius: 16, borderWidth: 1, padding: 24, gap: 16 },

  sectionLabel:   { textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: -4 },
  sectionDivider: { height: 1, backgroundColor: 'transparent' },

  row:     { flexDirection: 'row', gap: 12 },
  col:     { flexDirection: 'column' },

  // Join code row: input + regen button side-by-side
  codeRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  regenBtn:  { width: 44, height: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },

  colorRow:  { flexDirection: 'row', alignItems: 'center' },
  swatches:  { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  swatch:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  swatchSelected: { borderWidth: 3, borderColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },

  actions:    { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  actionsWide:{},
  cancelBtn:  { flex: 1, maxWidth: 120 },
  submitBtn:  { flex: 1, maxWidth: 200 },
});
