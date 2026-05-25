/**
 * Demo — Role picker
 *
 * Entry point for the demo experience. User picks Admin or Member,
 * we sign in with the demo account, call startDemo(role), and
 * navigate to the correct demo portal.
 *
 * Accessible via /(auth)/demo or the "Try demo" link on login.
 */

import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthLeftPanel, Text } from '@/components/ui';
import { DEMO_ACCOUNTS } from '@/lib/demoConfig';
import { supabase } from '@/lib/supabase';
import { useDemoStore } from '@/stores/demoStore';
import { useThemeStore } from '@/stores/themeStore';
import type { DemoRole } from '@/stores/demoStore';

const ROLES: {
  role:        DemoRole;
  label:       string;
  description: string;
  icon:        React.ComponentProps<typeof Ionicons>['name'];
  features:    string[];
}[] = [
  {
    role:        'admin',
    label:       'Admin View',
    description: 'See how chapter admins manage members, events, dues, and compliance.',
    icon:        'shield-checkmark-outline',
    features:    ['Dashboard & stats', 'Events management', 'Member roster', 'Dues tracking', 'Compliance status', 'Announcements'],
  },
  {
    role:        'member',
    label:       'Member View',
    description: 'Experience the app as a chapter member — see your status, events, and more.',
    icon:        'person-circle-outline',
    features:    ['Home & announcements', 'Event calendar', 'Attendance status', 'Personal profile'],
  },
];

export default function DemoScreen() {
  const theme   = useThemeStore((s) => s.theme);
  const { colorScheme } = useThemeStore();
  const insets  = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide  = width >= 800;
  const { startDemo } = useDemoStore();

  const [loading, setLoading]   = useState<DemoRole | null>(null);
  const [error,   setError]     = useState('');

  async function handleSelect(role: DemoRole) {
    setError('');
    setLoading(role);
    try {
      const { email, password } = DEMO_ACCOUNTS[role];
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      startDemo(role);
      router.replace(role === 'admin' ? '/(demo)/admin' : '/(demo)/member' as any);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to start demo. Please try again.');
      setLoading(null);
    }
  }

  const content = (
    <View style={[styles.inner, isWide && styles.innerWide]}>
      {/* Header */}
      <View style={styles.topSection}>
        <View style={[styles.iconBadge, { backgroundColor: theme.colors.primary + '18', borderColor: theme.colors.primary + '40' }]}>
          <Ionicons name="eye-outline" size={22} color={theme.colors.primary} />
        </View>
        <Text size="h1" weight="bold" style={{ marginTop: 16, textAlign: 'center' }}>Try a Demo</Text>
        <Text size="md" color={theme.colors.textMuted} style={[styles.subtitle, { textAlign: 'center' }]}>
          Explore the app with real data — no account needed.
          Choose which perspective you'd like to see.
        </Text>
      </View>

      {/* Role cards */}
      <View style={styles.cardRow}>
        {ROLES.map((item) => {
          const isLoading = loading === item.role;
          return (
            <Pressable
              key={item.role}
              onPress={() => !loading && handleSelect(item.role)}
              disabled={!!loading}
              style={({ pressed }) => [
                styles.roleCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.85 : loading && loading !== item.role ? 0.5 : 1,
                },
              ]}
            >
              {/* Icon */}
              <View style={[styles.roleIcon, { backgroundColor: theme.colors.primary + '14', borderColor: theme.colors.primary + '30' }]}>
                {isLoading
                  ? <ActivityIndicator color={theme.colors.primary} />
                  : <Ionicons name={item.icon} size={28} color={theme.colors.primary} />
                }
              </View>

              <Text size="lg" weight="bold" style={{ marginTop: 14 }}>{item.label}</Text>
              <Text size="sm" color={theme.colors.textMuted} style={{ marginTop: 6, textAlign: 'center', lineHeight: 20 }}>
                {item.description}
              </Text>

              {/* Feature list */}
              <View style={styles.featureList}>
                {item.features.map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <Ionicons name="checkmark-outline" size={14} color={theme.colors.primary} />
                    <Text size="xs" color={theme.colors.textMuted}>{f}</Text>
                  </View>
                ))}
              </View>

              {/* CTA */}
              <View style={[styles.cardCta, { backgroundColor: theme.colors.primary }]}>
                <Text size="sm" weight="bold" color="#fff">
                  {isLoading ? 'Loading…' : `Start ${item.label}`}
                </Text>
                {!isLoading && <Ionicons name="arrow-forward-outline" size={14} color="#fff" />}
              </View>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Text size="sm" color={theme.colors.error} style={{ textAlign: 'center', marginTop: 8 }}>
          {error}
        </Text>
      ) : null}

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <Text size="xs" color={theme.colors.textSubtle} style={{ textAlign: 'center' }}>
          Demo data is read-only — you won't be able to make changes.
        </Text>
        <View style={styles.signInRow}>
          <Text size="sm" color={theme.colors.textMuted}>Have an account? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text size="sm" color={theme.colors.primary} weight="medium">Sign in</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </View>
  );

  if (isWide) {
    return (
      <View style={[styles.splitContainer, { backgroundColor: theme.colors.background }]}>
        <AuthLeftPanel />
        <ScrollView
          contentContainerStyle={styles.formPanel}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.mobileScroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.iconRow}>
        <Image
          source={
            colorScheme === 'dark'
              ? require('@/assets/images/wordmark-dark.png')
              : require('@/assets/images/wordmark-light.png')
          }
          style={styles.wordmark}
          resizeMode="contain"
        />
      </View>
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  splitContainer: { flex: 1, flexDirection: 'row' },
  formPanel:      { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 56 },

  mobileScroll: { paddingHorizontal: 20, flexGrow: 1 },
  iconRow:      { alignItems: 'center', marginBottom: 16 },
  wordmark:     { width: 160, height: 36 },

  inner:      { width: '100%' },
  innerWide:  { maxWidth: 600 },

  topSection: { alignItems: 'center', marginBottom: 28 },
  iconBadge:  { width: 56, height: 56, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  subtitle:   { marginTop: 10, maxWidth: 440 },

  cardRow:   { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  roleCard:  { flex: 1, minWidth: 240, borderWidth: 1, borderRadius: 16, padding: 20, alignItems: 'center' },
  roleIcon:  { width: 60, height: 60, borderRadius: 30, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  featureList: { marginTop: 14, alignSelf: 'stretch', gap: 6 },
  featureRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardCta:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12, alignSelf: 'stretch', justifyContent: 'center' },

  footer:    { marginTop: 32, paddingTop: 20, borderTopWidth: 1, gap: 10, alignItems: 'center' },
  signInRow: { flexDirection: 'row', alignItems: 'center' },
});
