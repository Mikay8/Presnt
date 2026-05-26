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

import { Button, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import type { Tables } from '@/types/database';

// Chapters are the joinable entities; org_id links them to their parent org.
type Chapter = Tables<'chapters'>;

// ─── Step types ───────────────────────────────────────────────────────────────

type Step =
  | { kind: 'search' }
  | { kind: 'code'; org: Chapter };

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function JoinChapterScreen() {
  const theme = useThemeStore((s) => s.theme);
  const { user, setMembership } = useAuthStore();
  const insets  = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide  = width >= 800;
  const c = theme.colors;

  // ── Step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>({ kind: 'search' });

  // ── Search step ─────────────────────────────────────────────────────────────
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState<Chapter[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');

  // ── Code step ───────────────────────────────────────────────────────────────
  const [code,     setCode]     = useState('');
  const [joining,  setJoining]  = useState(false);
  const [joinErr,  setJoinErr]  = useState('');
  const [success,  setSuccess]  = useState(false);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleSearch(text: string) {
    setQuery(text);
    setSearchErr('');
    if (!text.trim()) { setResults([]); return; }
    setSearching(true);

    const { data, error } = await supabase
      .from('chapters')
      .select('*')
      .ilike('name', `%${text.trim()}%`)
      .eq('is_deleted', false)
      .neq('is_active', false)   // include null (legacy rows) and true, exclude only explicit false
      .limit(10);

    setSearching(false);
    if (error) { setSearchErr(error.message); return; }
    setResults(data ?? []);
  }

  function handleSelectOrg(org: Organization) {
    setStep({ kind: 'code', org });
    setCode('');
    setJoinErr('');
  }

  function handleBack() {
    setStep({ kind: 'search' });
    setJoinErr('');
    setSuccess(false);
  }

  async function handleJoin() {
    if (step.kind !== 'code') return;
    const { org } = step;

    const entered = code.trim().toUpperCase();
    if (!entered) {
      setJoinErr('Please enter the join code for this chapter.');
      return;
    }

    // Validate the code against the org's join_code (case-insensitive)
    const expected = (org.join_code ?? '').toUpperCase();
    if (!expected) {
      setJoinErr('This chapter does not have a join code set. Contact the admin.');
      return;
    }
    if (entered !== expected) {
      setJoinErr('Incorrect join code. Please check with your chapter admin.');
      return;
    }

    let userId = user?.id;
    if (!userId) {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id;
    }
    if (!userId) { setJoinErr('Not logged in. Please restart the app.'); return; }

    setJoining(true);
    setJoinErr('');

    // Check for a pre-existing membership (e.g. previously left / deleted)
    const { data: existing } = await supabase
      .from('memberships')
      .select('id, status, is_deleted')
      .eq('user_id', userId)
      .eq('org_id',  org.id)
      .maybeSingle();

    let membershipData: Tables<'memberships'> | null = null;

    if (existing) {
      // Re-activate a soft-deleted or pending row
      const { data, error } = await supabase
        .from('memberships')
        .update({
          status:     'active',
          is_deleted: false,
          deleted_at: null,
          joined_at:  new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error || !data) {
        setJoining(false);
        setJoinErr(error?.message ?? 'Failed to join chapter. Please try again.');
        return;
      }
      membershipData = data;
    } else {
      // Brand-new membership — status active immediately since code matched
      const { data, error } = await supabase
        .from('memberships')
        .insert({
          user_id:    userId,
          org_id:     org.id,
          status:     'active',
          role:       'member',
          is_deleted: false,
          joined_at:  new Date().toISOString().split('T')[0],
        })
        .select()
        .single();

      if (error || !data) {
        setJoining(false);
        setJoinErr(error?.message ?? 'Failed to join chapter. Please try again.');
        return;
      }
      membershipData = data;
    }

    // Fetch the organizations row (synced from chapters via trigger) so
    // the auth store receives the correct Organization shape.
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', org.id)
      .maybeSingle();

    setJoining(false);
    setSuccess(true);
    setMembership(membershipData, orgRow ?? null);

    // Reload auth state from DB then navigate
    await supabase.auth.refreshSession();
    setTimeout(() => router.replace('/(member)'), 1200);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={step.kind === 'code' ? handleBack : () => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Step 1: Search ─────────────────────────────────────────────────── */}
        {step.kind === 'search' && (
          <>
            <Text size="h1" weight="bold" style={styles.heading}>Find your chapter</Text>
            <Text size="md" color={c.textMuted} style={styles.subheading}>
              Search by chapter name or school
            </Text>

            {/* Search bar */}
            <View style={[styles.searchBar, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Ionicons name="search-outline" size={18} color={c.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { color: c.text, fontFamily: 'SpaceGrotesk_400Regular',
                  // @ts-ignore — web outline
                  outline: 'none' }]}
                placeholder="Search chapters or schools…"
                placeholderTextColor={c.textSubtle}
                value={query}
                onChangeText={handleSearch}
                returnKeyType="search"
                autoCapitalize="none"
              />
              {searching && <ActivityIndicator size="small" color={c.textMuted} />}
            </View>

            {searchErr ? <Text size="sm" color={c.error}>{searchErr}</Text> : null}

            {/* Results */}
            {results.length > 0 && (
              <View style={styles.resultsSection}>
                <Text size="xs" weight="medium" color={c.textMuted} style={styles.resultsLabel}>
                  Results — tap to select
                </Text>
                <View style={styles.resultsList}>
                  {results.map((org) => {
                    const initial  = org.name.charAt(0).toUpperCase();
                    const dotColor = (org as any).primary_color ?? c.primary;
                    return (
                      <Pressable
                        key={org.id}
                        onPress={() => handleSelectOrg(org)}
                        style={({ pressed }) => [
                          styles.resultCard,
                          { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.75 : 1 },
                        ]}
                      >
                        <View style={[styles.orgLogo, { backgroundColor: dotColor + '22' }]}>
                          <Text size="md" weight="bold" color={dotColor}>{initial}</Text>
                        </View>
                        <View style={styles.orgInfo}>
                          <Text size="md" weight="medium">{org.name}</Text>
                          {org.institution ? (
                            <Text size="sm" color={c.textMuted}>{org.institution}</Text>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward-outline" size={16} color={c.textSubtle} />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {results.length === 0 && !searching && query.trim() ? (
              <Text size="sm" color={c.textMuted} style={styles.noResults}>
                No chapters found for "{query}". Try a different search.
              </Text>
            ) : null}
          </>
        )}

        {/* ── Step 2: Enter code ─────────────────────────────────────────────── */}
        {step.kind === 'code' && (
          <>
            {/* Selected org header */}
            <View style={[styles.selectedOrg, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={[styles.orgLogo, {
                backgroundColor: ((step.org as any).primary_color ?? c.primary) + '22',
                width: 48, height: 48, borderRadius: 12,
              }]}>
                <Text size="lg" weight="bold" color={(step.org as any).primary_color ?? c.primary}>
                  {step.org.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text size="md" weight="bold">{step.org.name}</Text>
                {step.org.institution ? (
                  <Text size="sm" color={c.textMuted}>{step.org.institution}</Text>
                ) : null}
              </View>
            </View>

            {success ? (
              /* ── Success state ─────────────────────────────────────────────── */
              <View style={[styles.successCard, { backgroundColor: '#22C55E14', borderColor: '#22C55E' }]}>
                <View style={[styles.successIcon, { backgroundColor: '#22C55E18' }]}>
                  <Ionicons name="checkmark" size={32} color="#22C55E" />
                </View>
                <Text size="xl" weight="bold" style={{ marginTop: 12, textAlign: 'center' }}>
                  You're in!
                </Text>
                <Text size="sm" color={c.textMuted} style={{ textAlign: 'center', marginTop: 4 }}>
                  Welcome to {step.org.name}. Taking you to your dashboard…
                </Text>
              </View>
            ) : (
              /* ── Code entry ────────────────────────────────────────────────── */
              <>
                <Text size="h1" weight="bold" style={styles.heading}>Enter join code</Text>
                <Text size="md" color={c.textMuted} style={styles.subheading}>
                  Ask your chapter admin for the join code to get instant access.
                </Text>

                <View style={[styles.codeCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <Text size="xs" weight="medium" color={c.textMuted}
                    style={{ textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                    Join Code
                  </Text>
                  <TextInput
                    style={[styles.codeInput, {
                      backgroundColor: c.background,
                      borderColor: joinErr ? c.error : c.border,
                      color: c.text,
                      fontFamily: 'SpaceGrotesk_600SemiBold',
                      // @ts-ignore
                      outline: 'none',
                    }]}
                    value={code}
                    onChangeText={(v) => { setCode(v.toUpperCase().replace(/[^A-Z0-9-]/g, '')); setJoinErr(''); }}
                    placeholder="e.g. KAPPA-ABC"
                    placeholderTextColor={c.textSubtle}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleJoin}
                  />
                  {joinErr ? (
                    <Text size="sm" color={c.error} style={{ marginTop: 8 }}>{joinErr}</Text>
                  ) : null}
                </View>

                <Button
                  label="Join chapter"
                  onPress={handleJoin}
                  loading={joining}
                  style={{ marginTop: 4 }}
                />
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar:    { paddingHorizontal: 20, paddingVertical: 12 },
  backBtn:   { padding: 4, alignSelf: 'flex-start' },

  scroll:     { paddingHorizontal: 20, paddingBottom: 48, gap: 16 },
  scrollWide: { paddingHorizontal: 48, maxWidth: 860, alignSelf: 'center', width: '100%' },

  heading:   { marginBottom: 4 },
  subheading:{ marginBottom: 4 },

  // Search step
  searchBar:    { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  searchInput:  { flex: 1, fontSize: 15 },
  resultsSection:{ gap: 10 },
  resultsLabel: { textTransform: 'uppercase', letterSpacing: 0.8 },
  resultsList:  { gap: 8 },
  resultCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 14 },
  orgLogo:      { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  orgInfo:      { flex: 1, gap: 2 },
  noResults:    { textAlign: 'center', marginTop: 16 },

  // Code step
  selectedOrg: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 14, padding: 16 },
  codeCard:    { borderWidth: 1, borderRadius: 14, padding: 20, gap: 4 },
  codeInput:   { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, fontSize: 20, letterSpacing: 2, textAlign: 'center' },

  // Success
  successCard: { borderWidth: 1, borderRadius: 16, padding: 32, alignItems: 'center', gap: 4 },
  successIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
