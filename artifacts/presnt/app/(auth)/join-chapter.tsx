import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
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

type Organization = Tables<'organizations'>;

export default function JoinChapterScreen() {
  const theme = useThemeStore((s) => s.theme);
  const { user, setMembership } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Organization[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleSearch(text: string) {
    setQuery(text);
    if (!text.trim()) { setResults([]); return; }
    setError('');
    setSearching(true);

    const { data, error: searchError } = await supabase
      .from('organizations')
      .select('*')
      .ilike('name', `%${text.trim()}%`)
      .eq('is_deleted', false)
      .eq('is_active', true)
      .limit(10);

    setSearching(false);
    if (searchError) { setError(searchError.message); return; }
    setResults(data ?? []);
  }

  async function handleRequest(org: Organization) {
    let userId = user?.id;
    if (!userId) {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id;
    }
    if (!userId) { setError('Not logged in. Please restart the app.'); return; }

    setJoiningId(org.id);

    const { data: membership, error: joinError } = await supabase
      .from('memberships')
      .insert({
        user_id: userId,
        org_id: org.id,
        status: 'pending',
        joined_at: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    setJoiningId(null);

    if (joinError) { setError(joinError.message); return; }

    setRequestedIds((prev) => new Set(prev).add(org.id));
    setMembership(membership, org);

    // After first successful request, navigate after brief delay
    setTimeout(() => router.replace('/(member)'), 1200);
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text size="h1" weight="bold" style={styles.heading}>Find your chapter</Text>
        <Text size="md" color={theme.colors.textMuted} style={styles.subheading}>
          Search by chapter name or school
        </Text>

        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: theme.colors.text, fontFamily: 'SpaceGrotesk_400Regular', // @ts-ignore
              outline: 'none' }]}
            placeholder="Search chapters or schools…"
            placeholderTextColor={theme.colors.textSubtle}
            value={query}
            onChangeText={handleSearch}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {searching && <ActivityIndicator size="small" color={theme.colors.textMuted} />}
        </View>

        {error ? <Text size="sm" color={theme.colors.error}>{error}</Text> : null}

        {/* Results */}
        {results.length > 0 && (
          <View style={styles.resultsSection}>
            <Text size="xs" weight="medium" color={theme.colors.textMuted} style={styles.resultsLabel}>
              Results
            </Text>

            <View style={styles.resultsList}>
              {results.map((org) => {
                const requested = requestedIds.has(org.id);
                const isJoining = joiningId === org.id;
                const initial = org.name.charAt(0).toUpperCase();
                const dotColor = (org as any).primary_color ?? theme.colors.primary;

                return (
                  <View
                    key={org.id}
                    style={[styles.resultCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                  >
                    {/* Logo */}
                    <View style={[styles.orgLogo, { backgroundColor: dotColor + '22' }]}>
                      <Text size="md" weight="bold" color={dotColor}>{initial}</Text>
                    </View>

                    {/* Info */}
                    <View style={styles.orgInfo}>
                      <Text size="md" weight="medium" color={theme.colors.text}>{org.name}</Text>
                      {org.institution ? (
                        <Text size="sm" color={theme.colors.textMuted}>{org.institution}</Text>
                      ) : null}
                    </View>

                    {/* Action */}
                    {requested ? (
                      <View style={[styles.requestedBadge, { borderColor: theme.colors.border }]}>
                        <Text size="sm" color={theme.colors.textMuted} weight="medium">Requested</Text>
                      </View>
                    ) : (
                      <Button
                        label={isJoining ? 'Sending…' : 'Request'}
                        size="sm"
                        onPress={() => handleRequest(org)}
                        loading={isJoining}
                        style={styles.requestBtn}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {results.length === 0 && !searching && query.trim() ? (
          <Text size="sm" color={theme.colors.textMuted} style={styles.noResults}>
            No chapters found for "{query}". Try a different search.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1 },
  topBar:         { paddingHorizontal: 20, paddingVertical: 12 },
  backBtn:        { padding: 4, alignSelf: 'flex-start' },

  scroll:         { paddingHorizontal: 20, paddingBottom: 48, gap: 16 },
  scrollWide:     { paddingHorizontal: 48, maxWidth: 860, alignSelf: 'center', width: '100%' },

  heading:        { marginBottom: 4 },
  subheading:     { marginBottom: 4 },

  searchBar:      { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  searchInput:    { flex: 1, fontSize: 15 },

  resultsSection: { gap: 10 },
  resultsLabel:   { textTransform: 'uppercase', letterSpacing: 0.8 },
  resultsList:    { gap: 8 },

  resultCard:     { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 14 },
  orgLogo:        { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  orgInfo:        { flex: 1, gap: 2 },

  requestedBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  requestBtn:     { flexShrink: 0 },

  noResults:      { textAlign: 'center', marginTop: 16 },
});
