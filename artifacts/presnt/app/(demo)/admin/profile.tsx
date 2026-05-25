/**
 * Demo Admin — Profile (read-only)
 *
 * Shows the demo user's info, QR code, and a "Exit Demo" sign-out button.
 * No edit actions. Sign-out calls supabase.auth.signOut() + stopDemo().
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useDemoStore } from '@/stores/demoStore';
import { useThemeStore } from '@/stores/themeStore';

export default function DemoAdminProfileScreen() {
  const { theme }       = useThemeStore();
  const insets          = useSafeAreaInsets();
  const { profile, membership, organization } = useAuthStore();
  const { stopDemo }    = useDemoStore();
  const [signingOut, setSigningOut] = useState(false);
  const [showQR,     setShowQR]     = useState(false);
  const c = theme.colors;

  const firstName = profile?.first_name ?? '';
  const lastName  = profile?.last_name  ?? '';
  const initials  = firstName && lastName ? `${firstName[0]}${lastName[0]}` : '?';
  const fullName  = `${firstName} ${lastName}`.trim() || 'Unknown';

  const roleLabel = membership?.role
    ? membership.role.charAt(0).toUpperCase() + membership.role.slice(1).replace('_', ' ')
    : '—';

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

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[
        styles.header,
        { paddingTop: insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
      ]}>
        <View style={{ width: 36 }} />
        <Text size="lg" weight="bold">Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Demo badge */}
        <View style={[styles.demoBadge, { backgroundColor: c.primary + '14', borderColor: c.primary + '40' }]}>
          <Ionicons name="eye-outline" size={14} color={c.primary} />
          <Text size="xs" weight="medium" color={c.primary}>Demo Mode — Admin View</Text>
        </View>

        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatar, { backgroundColor: c.primary + '22', borderColor: c.primary }]}>
            <Text size="xxl" weight="bold" color={c.primary}>{initials}</Text>
          </View>
          <Text size="xl" weight="bold" style={{ marginTop: 14 }}>{fullName}</Text>
          <Text size="sm" color={c.textMuted} style={{ marginTop: 4 }}>{roleLabel}</Text>
          {organization && (
            <Text size="xs" color={c.textSubtle} style={{ marginTop: 2 }}>{organization.name}</Text>
          )}

          {/* QR Code */}
          {profile?.id && (
            <Pressable
              onPress={() => setShowQR(true)}
              style={[styles.qrBox, { backgroundColor: '#fff', borderColor: c.border }]}
            >
              <QRCode value={`presnt://user/${profile.id}`} size={130} />
              <Text size="xs" color={c.textMuted} style={{ marginTop: 8, textAlign: 'center' }}>
                Demo check-in QR · Tap to enlarge
              </Text>
            </Pressable>
          )}
        </View>

        {/* Info card */}
        <Card style={{ paddingVertical: 0 }}>
          {[
            { icon: 'mail-outline',    label: 'Email',        value: profile?.email ?? '—' },
            { icon: 'person-outline',  label: 'Member since', value: membership?.joined_at
                ? new Date(membership.joined_at).toLocaleDateString()
                : '—' },
            { icon: 'business-outline', label: 'Organization', value: organization?.name ?? '—' },
          ].map((row, i, arr) => (
            <View
              key={row.label}
              style={[
                styles.infoRow,
                { borderBottomColor: c.border },
                i < arr.length - 1 && { borderBottomWidth: 1 },
              ]}
            >
              <Ionicons name={row.icon as any} size={18} color={c.textMuted} />
              <View style={{ flex: 1 }}>
                <Text size="xs" color={c.textSubtle}>{row.label}</Text>
                <Text size="sm" style={{ marginTop: 2 }}>{row.value}</Text>
              </View>
            </View>
          ))}
        </Card>

        {/* Exit Demo */}
        <Button
          label="Exit Demo"
          variant="danger"
          loading={signingOut}
          onPress={handleExitDemo}
        />
      </ScrollView>

      {/* Enlarged QR modal */}
      {profile?.id && (
        <Modal visible={showQR} animationType="fade" transparent presentationStyle="overFullScreen" onRequestClose={() => setShowQR(false)}>
          <Pressable style={qrS.overlay} onPress={() => setShowQR(false)}>
            <View style={[qrS.card, { backgroundColor: c.surface }]}>
              <Text size="lg" weight="bold" style={{ marginBottom: 4 }}>{fullName}</Text>
              <Text size="xs" color={c.textMuted} style={{ marginBottom: 20 }}>Demo check-in QR code</Text>
              <View style={[qrS.qrWrap, { borderColor: c.border }]}>
                <QRCode value={`presnt://user/${profile.id}`} size={220} />
              </View>
              <Pressable onPress={() => setShowQR(false)} style={[qrS.closeBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                <Text size="sm" weight="medium" color={c.text}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const qrS = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  card:     { borderRadius: 24, padding: 28, alignItems: 'center', width: 320 },
  qrWrap:   { borderWidth: 1, borderRadius: 16, padding: 16, backgroundColor: '#fff' },
  closeBtn: { marginTop: 20, borderWidth: 1, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 12 },
});

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },

  demoBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, alignSelf: 'center', marginBottom: 16 },

  scroll:  { padding: 20, gap: 20, paddingBottom: 48 },

  avatarSection: { alignItems: 'center', paddingVertical: 12 },
  avatar:        { width: 80, height: 80, borderRadius: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4 },
  qrBox:   { borderWidth: 1, borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 20 },
});
