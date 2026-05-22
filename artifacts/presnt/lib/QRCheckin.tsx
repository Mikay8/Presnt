/**
 * QRCheckinModal
 *
 * Used by admin and officer events-management screens.
 * Wraps QRScannerModal: after a successful scan it:
 *   1. Looks up the profile by user_id
 *   2. Upserts a row in event_attendance (status = 'present', check_in_method = 'qr')
 *   3. Shows a success / error state inside the same modal
 *   4. Returns to scanning after a brief pause so multiple members can be checked in
 *      without reopening the modal.
 *
 * Props:
 *   visible     — show/hide
 *   eventId     — the event to check in to
 *   orgId       — the org (needed for RLS)
 *   onClose     — called when done
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { QRScannerModal } from '@/lib/QRScanner';
import { useThemeStore } from '@/stores/themeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type ScanState =
  | { stage: 'scanning' }
  | { stage: 'loading' }
  | { stage: 'success'; name: string; alreadyCheckedIn: boolean }
  | { stage: 'error';   message: string };

// ─── Component ────────────────────────────────────────────────────────────────

export function QRCheckinModal({
  visible,
  eventId,
  orgId,
  onClose,
}: {
  visible: boolean;
  eventId: string;
  orgId:   string;
  onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const [state, setState] = useState<ScanState>({ stage: 'scanning' });
  // Accumulate check-ins within this modal session
  const [checkedIn, setCheckedIn] = useState<string[]>([]);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset each time the modal opens
  const onOpenReset = useCallback(() => {
    setState({ stage: 'scanning' });
    setCheckedIn([]);
  }, []);

  // Show scanner only while in "scanning" state
  const scannerVisible = visible && state.stage === 'scanning';

  async function handleScan(data: string) {
    // Extract UUID — data is `presnt://user/<uuid>` or just the UUID
    const match = data.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (!match) {
      setState({ stage: 'error', message: 'Invalid QR code. Please try again.' });
      scheduleReturn();
      return;
    }
    const userId = match[0];
    setState({ stage: 'loading' });

    try {
      // 1. Look up the member's name via memberships (org members can read
      //    peer memberships; profiles SELECT policy is own-only so we join here)
      const { data: membership } = await supabase
        .from('memberships')
        .select('profiles!user_id(first_name, last_name)')
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .eq('is_deleted', false)
        .maybeSingle();

      if (!membership) {
        setState({ stage: 'error', message: 'Member not found in this organisation.' });
        scheduleReturn();
        return;
      }

      const p = membership.profiles as { first_name: string; last_name: string } | null;
      const name = p ? `${p.first_name} ${p.last_name}`.trim() : 'Unknown Member';

      // 2. Check for an existing attendance row
      const { data: existing } = await supabase
        .from('event_attendance')
        .select('id, status')
        .eq('event_id', eventId)
        .eq('user_id',  userId)
        .maybeSingle();

      const alreadyCheckedIn = existing?.status === 'present';

      // 3. Upsert — no-op if already present, marks present if previously absent/rsvp
      const { error } = await supabase
        .from('event_attendance')
        .upsert(
          {
            event_id:         eventId,
            user_id:          userId,
            org_id:           orgId,
            status:           'present',
            check_in_method:  'qr',
            checked_in_at:    new Date().toISOString(),
          },
          { onConflict: 'event_id,user_id' }
        );

      if (error) throw error;

      setCheckedIn(prev => alreadyCheckedIn ? prev : [...prev, name]);
      setState({ stage: 'success', name, alreadyCheckedIn });
      scheduleReturn();
    } catch (err: any) {
      setState({ stage: 'error', message: err?.message ?? 'Check-in failed. Please try again.' });
      scheduleReturn();
    }
  }

  function scheduleReturn() {
    if (returnTimer.current) clearTimeout(returnTimer.current);
    returnTimer.current = setTimeout(() => {
      setState({ stage: 'scanning' });
    }, 2500);
  }

  function handleClose() {
    if (returnTimer.current) clearTimeout(returnTimer.current);
    setState({ stage: 'scanning' });
    setCheckedIn([]);
    onClose();
  }

  // ── Scanner modal (delegates to QRScannerModal) ───────────────────────────
  // On web the QRScannerModal itself renders a modal, so we don't need an extra
  // wrapper. On native it's a full-screen modal. We render it only when scanning.

  if (state.stage === 'scanning') {
    return (
      <QRScannerModal
        visible={visible}
        onScan={handleScan}
        onClose={handleClose}
      />
    );
  }

  // ── Result overlay ────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={handleClose}
    >
      <View style={rs.overlay}>
        <View style={[rs.card, { backgroundColor: c.surface }]}>

          {/* Loading */}
          {state.stage === 'loading' && (
            <View style={rs.center}>
              <ActivityIndicator size="large" color={c.primary} />
              <Text size="md" color={c.textMuted} style={{ marginTop: 16 }}>Looking up member…</Text>
            </View>
          )}

          {/* Success */}
          {state.stage === 'success' && (
            <View style={rs.center}>
              <View style={[rs.iconCircle, { backgroundColor: '#22C55E18' }]}>
                <Ionicons name="checkmark" size={36} color="#22C55E" />
              </View>
              <Text size="xl" weight="bold" style={{ marginTop: 16 }}>
                {state.alreadyCheckedIn ? 'Already Checked In' : 'Checked In!'}
              </Text>
              <Text size="lg" color={c.textMuted} style={{ marginTop: 4 }}>{state.name}</Text>
              {!state.alreadyCheckedIn && (
                <Text size="xs" color={c.textSubtle} style={{ marginTop: 8 }}>
                  Returning to scanner…
                </Text>
              )}
              {state.alreadyCheckedIn && (
                <Text size="xs" color={c.textSubtle} style={{ marginTop: 8 }}>
                  Already marked present
                </Text>
              )}
            </View>
          )}

          {/* Error */}
          {state.stage === 'error' && (
            <View style={rs.center}>
              <View style={[rs.iconCircle, { backgroundColor: '#EF444418' }]}>
                <Ionicons name="close" size={36} color="#EF4444" />
              </View>
              <Text size="xl" weight="bold" style={{ marginTop: 16 }}>Error</Text>
              <Text size="sm" color={c.textMuted} style={{ marginTop: 8, textAlign: 'center' }}>
                {state.message}
              </Text>
              <Text size="xs" color={c.textSubtle} style={{ marginTop: 8 }}>
                Returning to scanner…
              </Text>
            </View>
          )}

          {/* Count + done */}
          <View style={{ marginTop: 24, gap: 8 }}>
            {checkedIn.length > 0 && (
              <Text size="xs" color={c.textSubtle} style={{ textAlign: 'center' }}>
                {checkedIn.length} checked in this session
              </Text>
            )}
            <Pressable onPress={handleClose} style={[rs.doneBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Text size="sm" weight="medium" color={c.text}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const rs = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  card:       { borderRadius: 24, padding: 28, alignItems: 'stretch', width: 320 },
  center:     { alignItems: 'center' },
  iconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  doneBtn:    { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
});
