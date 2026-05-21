import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

const ACCOUNT_ITEMS: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { label: 'Personal info',   icon: 'person-outline' },
  { label: 'Notifications',   icon: 'notifications-outline' },
  { label: 'Dues & payments', icon: 'card-outline' },
  { label: 'Committees',      icon: 'people-outline' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { theme }   = useThemeStore();
  const { width }   = useWindowDimensions();
  const insets      = useSafeAreaInsets();
  const isWide      = width >= 800;
  const { profile, membership, organization } = useAuthStore();

  const [signingOut, setSigningOut]   = useState(false);
  const [eventsAttended, setAttended] = useState<number | null>(null);
  const [totalEvents, setTotal]       = useState<number | null>(null);

  // Derived display values
  const firstName = profile?.first_name ?? '';
  const lastName  = profile?.last_name  ?? '';
  const fullName  = `${firstName} ${lastName}`.trim() || 'Member';
  const initials  = firstName && lastName
    ? `${firstName[0]}${lastName[0]}`
    : fullName[0] ?? '?';

  const roleLabel = membership?.role
    ? membership.role.charAt(0).toUpperCase() + membership.role.slice(1).replace('_', ' ')
    : 'Member';

  // Fetch attendance summary
  const load = useCallback(async () => {
    if (!profile?.id || !organization?.id) return;

    const [attendedRes, totalRes] = await Promise.all([
      supabase
        .from('event_attendance')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('org_id', organization.id)
        .eq('status', 'present'),

      supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', organization.id)
        .eq('is_deleted', false),
    ]);

    setAttended(attendedRes.count ?? 0);
    setTotal(totalRes.count ?? 0);
  }, [profile?.id, organization?.id]);

  useEffect(() => { load(); }, [load]);

  const attendancePct = eventsAttended !== null && totalEvents
    ? Math.round((eventsAttended / totalEvents) * 100)
    : null;

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
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
        <View style={styles.wideTitleRow}>
          <Text size="h1" weight="bold">Profile</Text>
          <Button label="Edit profile" size="sm" onPress={() => {}} />
        </View>

        <View style={styles.wideContent}>
          {/* Avatar card */}
          <Card style={styles.avatarCard}>
            <View style={[styles.avatarLarge, { backgroundColor: theme.colors.surfaceAlt }]}>
              <Text size="h1" weight="bold" color={theme.colors.textMuted}>{initials}</Text>
            </View>
            <Text size="xl" weight="bold" style={{ textAlign: 'center', marginTop: 14 }}>
              {fullName}
            </Text>
            <Text size="sm" color={theme.colors.textMuted} style={{ textAlign: 'center', marginTop: 4 }}>
              {organization?.name ?? '—'}{organization?.institution ? ` · ${organization.institution}` : ''}
            </Text>

            <View style={styles.chipRow}>
              {[roleLabel, membership?.status ?? 'active'].map((r) => (
                <View key={r} style={[styles.roleChip, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                  <Text size="xs" weight="medium" color={theme.colors.textMuted}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
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

          {/* Info + stats */}
          <View style={{ flex: 1, gap: 16 }}>
            <Card style={{ paddingVertical: 8 }}>
              <Text size="xs" weight="medium" color={theme.colors.textMuted}
                style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, paddingHorizontal: 4 }}>
                Contact & Details
              </Text>
              {[
                { label: 'Email',           value: profile?.email ?? '—' },
                { label: 'Phone',           value: profile?.phone ?? '—' },
                { label: 'Major',           value: profile?.major ?? '—' },
                { label: 'Graduation year', value: profile?.graduation_year ?? '—' },
                { label: 'Member since',    value: membership?.joined_at ? new Date(membership.joined_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—' },
              ].map(({ label, value }, i, arr) => (
                <View key={label} style={[
                  styles.infoRow,
                  { borderBottomColor: theme.colors.border },
                  i === arr.length - 1 && { borderBottomWidth: 0 },
                ]}>
                  <Text size="sm" color={theme.colors.textMuted}>{label}</Text>
                  <Text size="sm" weight="medium" style={{ textAlign: 'right', flex: 1 }}>{value}</Text>
                </View>
              ))}
            </Card>

            {/* Dues card */}
            <Card style={{ paddingVertical: 8 }}>
              <Text size="xs" weight="medium" color={theme.colors.textMuted}
                style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, paddingHorizontal: 4 }}>
                Dues
              </Text>
              {[
                { label: 'Status',  value: membership?.dues_status ?? '—' },
                { label: 'Balance', value: membership?.dues_balance != null ? `$${Number(membership.dues_balance).toFixed(2)}` : '—' },
              ].map(({ label, value }, i, arr) => (
                <View key={label} style={[
                  styles.infoRow,
                  { borderBottomColor: theme.colors.border },
                  i === arr.length - 1 && { borderBottomWidth: 0 },
                ]}>
                  <Text size="sm" color={theme.colors.textMuted}>{label}</Text>
                  <Text size="sm" weight="medium" style={{ textAlign: 'right', flex: 1 }}>{value}</Text>
                </View>
              ))}
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
      contentContainerStyle={[styles.mobilePad, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.mobileAvatarSection}>
        <View style={[styles.mobileAvatarCircle, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
          <Text size="xxl" weight="bold" color={theme.colors.textMuted}>{initials}</Text>
        </View>
        <Text size="xl" weight="bold" style={{ marginTop: 14 }}>{fullName}</Text>
        <Text size="sm" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
          {organization?.name ?? '—'}
          {organization?.institution ? ` · ${organization.institution}` : ''}
        </Text>
      </View>

      {/* Mini stats */}
      <View style={styles.miniStatsRow}>
        <Card style={[styles.miniStatItem, { alignItems: 'center' }]}>
          <Text size="xxl" weight="bold">
            {attendancePct !== null ? `${attendancePct}%` : '—'}
          </Text>
          <Text size="xs" color={theme.colors.textMuted}
            style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>
            Attendance
          </Text>
        </Card>
        <Card style={[styles.miniStatItem, { alignItems: 'center' }]}>
          <Text size="xxl" weight="bold">{eventsAttended ?? '—'}</Text>
          <Text size="xs" color={theme.colors.textMuted}
            style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>
            Events
          </Text>
        </Card>
      </View>

      {/* Account section */}
      <Text size="xs" weight="medium" color={theme.colors.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 8 }}>
        Account
      </Text>

      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {ACCOUNT_ITEMS.map((item, i) => (
          <Pressable key={item.label} style={[
            styles.accountRow,
            i < ACCOUNT_ITEMS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
          ]}>
            <Ionicons name={item.icon} size={18} color={theme.colors.textMuted} />
            <Text size="md" style={{ flex: 1 }}>{item.label}</Text>
            <Ionicons name="chevron-forward-outline" size={16} color={theme.colors.textSubtle} />
          </Pressable>
        ))}
      </Card>

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
  widePad:      { padding: 32 },
  wideTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  wideContent:  { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  avatarCard:   { width: 280, alignItems: 'center', paddingVertical: 28 },
  avatarLarge:  { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, justifyContent: 'center' },
  roleChip:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  infoRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, gap: 12 },
  mobilePad:         { paddingHorizontal: 16 },
  mobileAvatarSection: { alignItems: 'center', marginBottom: 20 },
  mobileAvatarCircle: { width: 88, height: 88, borderRadius: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  miniStatsRow:  { flexDirection: 'row', gap: 12 },
  miniStatItem:  { flex: 1, paddingVertical: 16 },
  accountRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4 },
});
