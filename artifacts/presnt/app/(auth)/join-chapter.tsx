import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Button, Card, Input, ScreenContainer, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import type { Tables } from '@/types/database';

type Organization = Tables<'organizations'>;

export default function JoinChapterScreen() {
  const theme = useThemeStore((s) => s.theme);
  const { user, setMembership } = useAuthStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Organization[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Organization | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch() {
    if (!query.trim()) return;
    setError('');
    setSearching(true);
    setSelected(null);

    const { data, error: searchError } = await supabase
      .from('organizations')
      .select('*')
      .ilike('name', `%${query.trim()}%`)
      .eq('is_deleted', false)
      .eq('is_active', true)
      .limit(10);

    setSearching(false);
    if (searchError) {
      setError(searchError.message);
      return;
    }
    setResults(data ?? []);
  }

  async function handleJoin() {
    if (!selected) return;

    // Use store user if available, otherwise fetch the live session
    let userId = user?.id;
    if (!userId) {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id;
    }
    if (!userId) {
      setError('Not logged in. Please restart the app.');
      return;
    }

    setError('');
    setJoining(true);

    const { data: membership, error: joinError } = await supabase
      .from('memberships')
      .insert({
        user_id: userId,
        org_id: selected.id,
        status: 'pending',
        joined_at: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    setJoining(false);

    if (joinError) {
      setError(joinError.message);
      return;
    }

    setJoined(true);
    setMembership(membership, selected);
    // Pending membership — redirect to member home (will show limited view until approved)
    setTimeout(() => router.replace('/(member)'), 1500);
  }

  if (joined) {
    return (
      <ScreenContainer contentStyle={styles.centeredContent}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark-circle" size={64} color={theme.colors.success} />
        </View>
        <Text size="xl" weight="semibold" style={styles.successTitle}>
          Request sent!
        </Text>
        <Text size="md" color={theme.colors.textMuted} style={styles.successSubtext}>
          An officer will approve your membership shortly.
        </Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
      </TouchableOpacity>

      <Text size="h1" weight="semibold" style={styles.heading}>
        Find your chapter
      </Text>
      <Text size="md" color={theme.colors.textMuted} style={styles.subheading}>
        Search by chapter name or organization
      </Text>

      <View style={styles.searchRow}>
        <View style={{ flex: 1 }}>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="e.g. Sigma Chi, Alpha Mu"
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
        </View>
        <TouchableOpacity
          onPress={handleSearch}
          style={[styles.searchButton, { backgroundColor: theme.colors.primary }]}
        >
          {searching ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="search" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {error ? (
        <Text size="sm" color={theme.colors.error} style={styles.error}>
          {error}
        </Text>
      ) : null}

      {results.length === 0 && !searching && query.trim() ? (
        <Text size="sm" color={theme.colors.textMuted} style={styles.noResults}>
          No chapters found for "{query}". Try a different search.
        </Text>
      ) : null}

      <View style={styles.resultsList}>
        {results.map((org) => (
          <TouchableOpacity key={org.id} onPress={() => setSelected(org)} activeOpacity={0.8}>
            <Card
              style={[
                styles.resultCard,
                selected?.id === org.id && {
                  borderColor: theme.colors.primary,
                  borderWidth: 2,
                },
              ]}
            >
              <View style={styles.resultRow}>
                <View style={styles.resultInfo}>
                  <Text size="md" weight="semibold">
                    {org.name}
                  </Text>
                  {org.institution ? (
                    <Text size="sm" color={theme.colors.textMuted}>
                      {org.institution}
                    </Text>
                  ) : null}
                </View>
                {selected?.id === org.id && (
                  <Ionicons name="checkmark-circle" size={24} color={theme.colors.primary} />
                )}
              </View>
            </Card>
          </TouchableOpacity>
        ))}
      </View>

      {selected ? (
        <View style={styles.joinSection}>
          <Text size="sm" color={theme.colors.textMuted} style={styles.joinNote}>
            Your request will be sent to an officer for approval.
          </Text>
          <Button
            label={`Request to join ${selected.name}`}
            onPress={handleJoin}
            loading={joining}
          />
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 24,
  },
  heading: {
    marginBottom: 8,
  },
  subheading: {
    marginBottom: 24,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  searchButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    marginBottom: 12,
  },
  noResults: {
    textAlign: 'center',
    marginVertical: 24,
  },
  resultsList: {
    gap: 10,
  },
  resultCard: {
    padding: 16,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultInfo: {
    gap: 2,
    flex: 1,
  },
  joinSection: {
    marginTop: 24,
    gap: 12,
  },
  joinNote: {
    textAlign: 'center',
  },
  successIcon: {
    marginBottom: 16,
  },
  successTitle: {
    marginBottom: 8,
  },
  successSubtext: {
    textAlign: 'center',
    lineHeight: 24,
  },
});
