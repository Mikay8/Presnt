import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useThemeStore } from '@/stores/themeStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// ─── Dummy data ───────────────────────────────────────────────────────────────

const USER = {
  name:        'Ana Reyes',
  email:       'ana.reyes@ucla.edu',
  phone:       '(310) 555-0182',
  major:       'Political Science',
  year:        'Junior',
  pronouns:    'she / her',
  orgName:     'Kappa Sigma',
  institution: 'UCLA',
};

const ROLES = ['Member', 'Spring 2026'];

const COMMITTEES = ['Recruitment', 'Social', 'Risk', 'Philanthropy'];

const ACCOUNT_ITEMS: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { label: 'Personal info',  icon: 'person-outline' },
  { label: 'Notifications',  icon: 'notifications-outline' },
  { label: 'Dues & payments', icon: 'card-outline' },
  { label: 'Committees',     icon: 'people-outline' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { theme }   = useThemeStore();
  const { width }   = useWindowDimensions();
  const insets      = useSafeAreaInsets();
  const isWide      = width >= 800;
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    console.log('[handleSignOut] Button pressed');
    setSigningOut(true);
    try {
      console.log('[signOut] Signing out locally with Supabase...');
      await supabase.auth.signOut();
      console.log('[signOut] Complete - user should be redirected');
    } catch (error) {
      console.error('[signOut] Error:', error);
    } finally {
      setSigningOut(false);
    }
  }

  // ── Desktop ──
  if (isWide) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.widePad}
        showsVerticalScrollIndicator={false}
      >
        {/* Title row */}
        <View style={styles.wideTitleRow}>
          <Text size="h1" weight="bold">Profile</Text>
          <Button label="Edit profile" size="sm" onPress={() => {}} />
        </View>

        {/* Content row */}
        <View style={styles.wideContent}>
          {/* Left: avatar card */}
          <Card style={styles.avatarCard}>
            <View style={styles.avatarLarge}>
              <Text size="h1" weight="bold" color={theme.colors.textMuted}>AR</Text>
            </View>
            <Text size="xl" weight="bold" style={{ textAlign: 'center', marginTop: 14 }}>
              {USER.name}
            </Text>
            <Text size="sm" color={theme.colors.textMuted} style={{ textAlign: 'center', marginTop: 4 }}>
              {USER.orgName} · {USER.institution}
            </Text>
            {/* Role chips */}
            <View style={styles.chipRow}>
              {ROLES.map((r) => (
                <View
                  key={r}
                  style={[styles.roleChip, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
                >
                  <Text size="xs" weight="medium" color={theme.colors.textMuted}>{r}</Text>
                </View>
              ))}
            </View>
            <Button
              label="Sign out"
              variant="outline"
              size="sm"
              style={{ marginTop: 20, alignSelf: 'stretch' }}
              loading={signingOut}
              onPress={handleSignOut}
            />
          </Card>

          {/* Right: info + committees */}
          <View style={{ flex: 1, gap: 16 }}>
            {/* Info card */}
            <Card style={{ paddingVertical: 8 }}>
              <Text
                size="xs"
                weight="medium"
                color={theme.colors.textMuted}
                style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, paddingHorizontal: 4 }}
              >
                Contact & Details
              </Text>
              {[
                { label: 'Email',    value: USER.email },
                { label: 'Phone',    value: USER.phone },
                { label: 'Major',    value: USER.major },
                { label: 'Year',     value: USER.year },
                { label: 'Pronouns', value: USER.pronouns },
              ].map(({ label, value }, i, arr) => (
                <View
                  key={label}
                  style={[
                    styles.infoRow,
                    { borderBottomColor: theme.colors.border },
                    i === arr.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <Text size="sm" color={theme.colors.textMuted}>{label}</Text>
                  <Text size="sm" weight="medium" style={{ textAlign: 'right', flex: 1 }}>{value}</Text>
                </View>
              ))}
            </Card>

            {/* Committees card */}
            <Card>
              <Text
                size="xs"
                weight="medium"
                color={theme.colors.textMuted}
                style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}
              >
                Committees
              </Text>
              <View style={styles.committeesRow}>
                {COMMITTEES.map((c) => (
                  <View
                    key={c}
                    style={[styles.committeeChip, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
                  >
                    <Text size="sm">{c}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ── Mobile ──
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={[
        styles.mobilePad,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Avatar + name */}
      <View style={styles.mobileAvatarSection}>
        <View style={[styles.mobileAvatarCircle, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
          <Text size="xxl" weight="bold" color={theme.colors.textMuted}>AR</Text>
        </View>
        <Text size="xl" weight="bold" style={{ marginTop: 14 }}>{USER.name}</Text>
        <Text size="sm" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
          {USER.orgName} · {USER.institution}
        </Text>
      </View>

      {/* Mini stats */}
      <View style={styles.miniStatsRow}>
        <Card style={[styles.miniStatItem, { alignItems: 'center' }]}>
          <Text size="xxl" weight="bold">87%</Text>
          <Text size="xs" color={theme.colors.textMuted} style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>Attendance</Text>
        </Card>
        <Card style={[styles.miniStatItem, { alignItems: 'center' }]}>
          <Text size="xxl" weight="bold">34</Text>
          <Text size="xs" color={theme.colors.textMuted} style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>Events</Text>
        </Card>
      </View>

      {/* Account section */}
      <Text
        size="xs"
        weight="medium"
        color={theme.colors.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 8 }}
      >
        Account
      </Text>

      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {ACCOUNT_ITEMS.map((item, i) => (
          <Pressable
            key={item.label}
            style={[
              styles.accountRow,
              i < ACCOUNT_ITEMS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
            ]}
          >
            <Ionicons name={item.icon} size={18} color={theme.colors.textMuted} />
            <Text size="md" style={{ flex: 1 }}>{item.label}</Text>
            <Ionicons name="chevron-forward-outline" size={16} color={theme.colors.textSubtle} />
          </Pressable>
        ))}
      </Card>

      {/* Sign out */}
      <Button
        label="Sign out"
        variant="outline"
        style={{ marginTop: 20 }}
        loading={signingOut}
        onPress={handleSignOut}
      />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Wide
  widePad:      { padding: 32 },
  wideTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  wideContent:  { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  avatarCard:   { width: 280, alignItems: 'center', paddingVertical: 28 },
  avatarLarge:  {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#EDE3D4', alignItems: 'center', justifyContent: 'center',
  },
  chipRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, justifyContent: 'center' },
  roleChip:        { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  infoRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, gap: 12 },
  committeesRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  committeeChip:   { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },

  // Mobile
  mobilePad:         { paddingHorizontal: 16 },
  mobileAvatarSection: { alignItems: 'center', marginBottom: 20 },
  mobileAvatarCircle: { width: 88, height: 88, borderRadius: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  miniStatsRow:    { flexDirection: 'row', gap: 12 },
  miniStatItem:    { flex: 1, paddingVertical: 16 },
  accountRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4 },
});
