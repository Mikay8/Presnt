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

function getCurrentSemester() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month <= 5)  return { name: `Spring ${year}`, start: `${year}-01-15`, end: `${year}-05-15` };
  if (month <= 7)  return { name: `Summer ${year}`, start: `${year}-05-16`, end: `${year}-08-15` };
  return { name: `Fall ${year}`, start: `${year}-08-16`, end: `${year}-12-20` };
}

export default function CreateChapterScreen() {
  const theme = useThemeStore((s) => s.theme);
  const { user, setMembership } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [greekLetterOrg, setGreekLetterOrg] = useState('');
  const [primaryColor, setPrimaryColor] = useState(BRAND_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!name.trim() || !institution.trim()) {
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

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: name.trim(),
        slug: slugify(name),
        type: 'chapter',
        institution: institution.trim(),
        greek_letter_org: greekLetterOrg.trim() || null,
        primary_color: primaryColor,
        timezone: 'America/New_York',
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
        user_id: userId,
        org_id: org.id,
        status: 'active',
        joined_at: new Date().toISOString().split('T')[0],
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
      org_id: org.id,
      name: semester.name,
      start_date: semester.start,
      end_date: semester.end,
      is_active: true,
    });

    setMembership(membership, org);
    setLoading(false);
    router.replace('/(member)');
  }

  const formContent = (
    <View style={[styles.formCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      {/* IDENTITY */}
      <Text size="xs" weight="medium" color={theme.colors.textMuted} style={styles.sectionLabel}>
        Identity
      </Text>

      <View style={[styles.row, !isWide && styles.col]}>
        <View style={{ flex: 1 }}>
          <Input
            label="Chapter name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Kappa Sigma"
            autoCapitalize="words"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="School"
            value={institution}
            onChangeText={setInstitution}
            placeholder="UCLA"
            autoCapitalize="words"
          />
        </View>
      </View>

      <Input
        label="Greek letters (optional)"
        value={greekLetterOrg}
        onChangeText={setGreekLetterOrg}
        placeholder="Kappa Sigma"
        autoCapitalize="words"
      />

      {/* BRANDING */}
      <View style={styles.sectionDivider} />
      <Text size="xs" weight="medium" color={theme.colors.textMuted} style={styles.sectionLabel}>
        Branding
      </Text>

      {/* Logo placeholder */}
      <View style={styles.logoRow}>
        <View style={[styles.logoBox, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
          <Ionicons name="image-outline" size={28} color={theme.colors.textSubtle} />
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <Text size="sm" weight="medium" color={theme.colors.text}>Chapter logo</Text>
          <Text size="xs" color={theme.colors.textMuted}>PNG or SVG, square recommended</Text>
          <Button label="Upload logo" variant="outline" size="sm" onPress={() => {}} />
        </View>
      </View>

      {/* Color swatches */}
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        {/* Step dots */}
        <View style={styles.dots}>
          <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} />
          <View style={[styles.dot, { backgroundColor: theme.colors.border }]} />
          <View style={[styles.dot, { backgroundColor: theme.colors.border }]} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text size="h1" weight="bold" style={styles.heading}>Create your chapter</Text>
        <Text size="md" color={theme.colors.textMuted} style={styles.subheading}>
          This takes under 2 minutes. You can update everything later.
        </Text>

        {formContent}

        {/* Actions */}
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

  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: -4 },
  sectionDivider: { height: 1, backgroundColor: 'transparent' },

  row:          { flexDirection: 'row', gap: 12 },
  col:          { flexDirection: 'column' },

  logoRow:      { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  logoBox:      { width: 72, height: 72, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  colorRow:     { flexDirection: 'row', alignItems: 'center' },
  swatches:     { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  swatch:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  swatchSelected: { borderWidth: 3, borderColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },

  actions:      { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  actionsWide:  {},
  cancelBtn:    { flex: 1, maxWidth: 120 },
  submitBtn:    { flex: 1, maxWidth: 200 },
});
