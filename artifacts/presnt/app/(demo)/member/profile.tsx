/**
 * Demo Member — Profile (read-only)
 *
 * Shows member info and QR code.
 * No edit actions. "Exit Demo" signs out and stops demo mode.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useDemoStore } from '@/stores/demoStore';
import { useThemeStore } from '@/stores/themeStore';

function QREnlargedModal({ userId, name, visible, onClose }: {
  userId: string; name: string; visible: boolean; onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  return (
    <Modal visible={visible} animationType="fade" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <Pressable style={qr.overlay} onPress={onClose}>
        <View style={[qr.card, { backgroundColor: c.surface }]}>
          <Text size="lg" weight="bold" style={{ marginBottom: 4 }}>{name}</Text>
          <Text size="xs" color={c.textMuted} style={{ marginBottom: 20 }}>Demo check-in QR code</Text>
          <View style={[qr.qrWrap, { borderColor: c.border }]}>
            <QRCode value={`presnt://user/${userId}`} size={220} />
          </View>
          <Pressable onPress={onClose} style={[qr.closeBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
            <Text size="sm" weight="medium" color={c.text}>Close</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const qr = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  card:     { borderRadius: 24, padding: 28, alignItems: 'center', width: 320 },
  qrWrap:   { borderWidth: 1, borderRadius: 16, padding: 16, backgroundColor: '#fff' },
  closeBtn: { marginTop: 20, borderWidth: 1, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 12 },
});

export default function DemoMemberProfileScreen() {
  const { theme }   = useThemeStore();
  const { width }   = useWindowDimensions();
  const insets      = useSafeAreaInsets();
  const isWide      = width >= 800;
  const { profile, membership, organization } = useAuthStore();
  const { stopDemo } = useDemoStore();

  const [signingOut, setSigningOut]   = useState(false);
  const [eventsAttended, setAttended] = useState<number | null>(null);
  const [totalEvents, setTotal]       = useState<number | null>(null);
  const [showQR, setShowQR]           = useState(false);

  const firstName = profile?.first_name ?? '';
  const lastName  = profile?.last_name  ?? '';
  const fullName  = `${firstName} ${lastName}`.trim() || 'Member';
  const initials  = firstName && lastName
    ? `${firstName[0]}${lastName[0]}`
    : fullName[0] ?? '?';

  const roleLabel = membership?.role
    ? membership.role.charAt(0).toUpperCase() + membership.role.slice(1).replace('_', ' ')
    : 'Member';

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

  async function handleExitDemo() {
    setSigningOut(true);
    try {
      stopDemo();
      await supabase.auth.signOut();
      router.replace('/(auth)/login' as any);
    } finally {
      setSigningOut(false);
    }
  }

  // ── Desktop ──
  if (isWide) {
    return (
      <>
        <ScrollView
          style={{ flex: 1, backgroundColor: theme.colors.background }}
          contentContainerStyle={styles.widePad}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.wideTitleRow}>
            <Text size="h1" weight="bold">Profile</Text>
            {/* Demo badge */}
            <View style={[styles.demoBadge, { backgroundColor: theme.colors.primary + '14', borderColor: theme.colors.primary + '40' }]}>
              <Ionicons name="eye-outline" size={13} color={theme.colors.primary} />
              <Text size="xs" weight="medium" color={theme.colors.primary}>Demo Mode — Member View</Text>
            </View>
          </View>

          <View style={styles.wideContent}>
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
                label="Exit Demo"
                variant="outline"
                size="sm"
                style={{ marginTop: 20, alignSelf: 'stretch' }}
                loading={signingOut}
                onPress={handleExitDemo}
              />

              {profile?.id && (
                <Pressable
                  onPress={() => setShowQR(true)}
                  style={[styles.qrBox, { backgroundColor: '#fff', borderColor: theme.colors.border }]}
                >
                  <QRCode value={`presnt://user/${profile.id}`} size={120} />
                  <Text size="xs" color={theme.colors.textMuted} style={{ marginTop: 8, textAlign: 'center' }}>
                    Demo check-in QR
                  </Text>
                  <Text size="xs" color={theme.colors.textSubtle} style={{ textAlign: 'center' }}>
                    Tap to enlarge
                  </Text>
                </Pressable>
              )}
            </Card>

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
        {profile?.id && (
          <QREnlargedModal
            userId={profile.id}
            name={fullName}
            visible={showQR}
            onClose={() => setShowQR(false)}
          />
        )}
      </>
    );
  }

  // ── Mobile ──
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.mobilePad, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Demo badge */}
      <View style={[styles.demoBadge, { backgroundColor: theme.colors.primary + '14', borderColor: theme.colors.primary + '40', alignSelf: 'center', marginBottom: 12 }]}>
        <Ionicons name="eye-outline" size={13} color={theme.colors.primary} />
        <Text size="xs" weight="medium" color={theme.colors.primary}>Demo Mode — Member View</Text>
      </View>

      <View style={styles.mobileAvatarSection}>
        <View style={[styles.mobileAvatarCircle, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
          <Text size="xxl" weight="bold" color={theme.colors.textMuted}>{initials}</Text>
        </View>
        <Text size="xl" weight="bold" style={{ marginTop: 14 }}>{fullName}</Text>
        <Text size="sm" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
          {organization?.name ?? '—'}
          {organization?.institution ? ` · ${organization.institution}` : ''}
        </Text>

        {profile?.id && (
          <Pressable
            onPress={() => setShowQR(true)}
            style={[styles.qrBox, { backgroundColor: '#fff', borderColor: theme.colors.border, marginTop: 20 }]}
          >
            <QRCode value={`presnt://user/${profile.id}`} size={130} />
            <Text size="xs" color={theme.colors.textMuted} style={{ marginTop: 8, textAlign: 'center' }}>
              Demo check-in QR · Tap to enlarge
            </Text>
          </Pressable>
        )}
      </View>

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

      {/* Info card */}
      <Text size="xs" weight="medium" color={theme.colors.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 8 }}>
        Details
      </Text>
      <Card style={{ paddingVertical: 8 }}>
        {[
          { label: 'Email',        value: profile?.email ?? '—' },
          { label: 'Role',         value: roleLabel },
          { label: 'Member since', value: membership?.joined_at ? new Date(membership.joined_at).toLocaleDateString() : '—' },
          { label: 'Organization', value: organization?.name ?? '—' },
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

      <Button
        label="Exit Demo"
        variant="outline"
        style={{ marginTop: 20 }}
        loading={signingOut}
        onPress={handleExitDemo}
      />

      {profile?.id && (
        <QREnlargedModal
          userId={profile.id}
          name={fullName}
          visible={showQR}
          onClose={() => setShowQR(false)}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  widePad:      { padding: 32 },
  wideTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  wideContent:  { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  avatarCard:   { width: 280, alignItems: 'center', paddingVertical: 28 },
  avatarLarge:  { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, justifyContent: 'center' },
  roleChip:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  infoRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, gap: 12 },
  demoBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  mobilePad:         { paddingHorizontal: 16 },
  mobileAvatarSection: { alignItems: 'center', marginBottom: 20 },
  mobileAvatarCircle: { width: 88, height: 88, borderRadius: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  miniStatsRow:  { flexDirection: 'row', gap: 12 },
  miniStatItem:  { flex: 1, paddingVertical: 16 },
  qrBox:         { borderWidth: 1, borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 20 },
});
