import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Input, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
];

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getCurrentSemester() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month <= 5) {
    return { name: `Spring ${year}`, start: `${year}-01-15`, end: `${year}-05-15` };
  } else if (month <= 7) {
    return { name: `Summer ${year}`, start: `${year}-05-16`, end: `${year}-08-15` };
  } else {
    return { name: `Fall ${year}`, start: `${year}-08-16`, end: `${year}-12-20` };
  }
}

export default function CreateChapterScreen() {
  const theme = useThemeStore((s) => s.theme);
  const { user, setMembership } = useAuthStore();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [greekLetterOrg, setGreekLetterOrg] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!name.trim() || !institution.trim()) {
      setError('Chapter name and institution are required.');
      return;
    }

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
    setLoading(true);

    const slug = slugify(name);

    // Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: name.trim(),
        slug,
        type: 'chapter',
        institution: institution.trim(),
        greek_letter_org: greekLetterOrg.trim() || null,
        timezone,
      })
      .select()
      .single();

    if (orgError || !org) {
      setLoading(false);
      setError(orgError?.message ?? 'Failed to create chapter. The name may already be taken.');
      return;
    }

    // Create membership for the creator (admin role will be set in Phase 2)
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

    // Create initial academic term
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

    // Redirect to member home — auth store update triggers _layout redirect
    router.replace('/(member)');
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text size="h1" weight="semibold" style={styles.heading}>
          Create your chapter
        </Text>
        <Text size="md" color={theme.colors.textMuted} style={styles.subheading}>
          This takes under 2 minutes. You can update everything later.
        </Text>

        <View style={styles.form}>
          <Input
            label="Chapter name"
            value={name}
            onChangeText={setName}
            placeholder="Sigma Chi — Alpha Mu"
            autoCapitalize="words"
          />

          <Input
            label="Institution"
            value={institution}
            onChangeText={setInstitution}
            placeholder="University of Michigan"
            autoCapitalize="words"
          />

          <Input
            label="Greek letter organization (optional)"
            value={greekLetterOrg}
            onChangeText={setGreekLetterOrg}
            placeholder="Sigma Chi"
            autoCapitalize="words"
          />

          <View style={styles.fieldGroup}>
            <Text size="sm" weight="medium" color={theme.colors.textMuted} style={styles.fieldLabel}>
              Timezone
            </Text>
            <View style={styles.timezoneList}>
              {TIMEZONES.map((tz) => (
                <TouchableOpacity
                  key={tz}
                  onPress={() => setTimezone(tz)}
                  style={[
                    styles.timezoneOption,
                    {
                      backgroundColor: timezone === tz ? theme.colors.primary + '22' : theme.colors.surface,
                      borderColor: timezone === tz ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    size="sm"
                    color={timezone === tz ? theme.colors.primary : theme.colors.textMuted}
                    weight={timezone === tz ? 'medium' : 'regular'}
                  >
                    {tz.replace('America/', '').replace('Pacific/', '').replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {error ? (
            <Text size="sm" color={theme.colors.error}>
              {error}
            </Text>
          ) : null}

          <Button
            label="Create chapter"
            onPress={handleCreate}
            loading={loading}
            style={styles.button}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 4,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  heading: {
    marginBottom: 8,
  },
  subheading: {
    marginBottom: 32,
    lineHeight: 24,
  },
  form: {
    gap: 16,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    marginBottom: 2,
  },
  timezoneList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timezoneOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  button: {
    marginTop: 8,
  },
});
