/**
 * Officer — Excuses
 *
 * Officers with MANAGE_ATTENDANCE or MANAGE_MEMBERS can:
 *   • See all pending excuse requests
 *   • Approve or deny with optional notes
 *
 * Entitlement gate: tab hidden in _layout.tsx if neither permission is granted.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';
import type { Tables } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

type Excuse = {
  id:           string;
  reason:       string;
  status:       string;
  admin_notes:  string | null;
  created_at:   string | null;
  reviewed_at:  string | null;
  user_id:      string;
  event_id:     string;
  profiles:     { first_name: string; last_name: string; email: string } | null;
  events:       { title: string; start_time: string } | null;
};

const STATUS_FILTERS = ['Pending', 'Approved', 'Denied', 'All'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending:  { label: 'Pending',  color: '#EAB308', icon: 'time-outline'            },
  approved: { label: 'Approved', color: '#22C55E', icon: 'checkmark-circle-outline' },
  denied:   { label: 'Denied',   color: '#EF4444', icon: 'close-circle-outline'     },
};

function fmtDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Review Modal ─────────────────────────────────────────────────────────────

function ReviewModal({
  excuse,
  reviewerId,
  onClose,
  onDone,
}: {
  excuse:     Excuse;
  reviewerId: string;
  onClose:    () => void;
  onDone:     () => void;
}) {
  const { theme }  = useThemeStore();
  const c          = theme.colors;
  const [notes, setNotes] = useState(excuse.admin_notes ?? '');
  const [saving, setSaving] = useState<'approved' | 'denied' | null>(null);

  const profile = excuse.profiles;
  const name    = profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown';

  async function submit(decision: 'approved' | 'denied') {
    setSaving(decision);
    await supabase
      .from('excuses')
      .update({
        status:      decision,
        admin_notes: notes.trim() || null,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', excuse.id);
    setSaving(null);
    onDone();
  }

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: c.surface }]}>
          <View style={[styles.handle, { backgroundColor: c.border }]} />

          <Text size="lg" weight="bold" style={{ marginBottom: 4 }}>Review Excuse</Text>
          <Text size="xs" color={c.textMuted} style={{ marginBottom: 20 }}>
            {name} · {excuse.events?.title ?? 'Unknown event'} · {fmtDate(excuse.events?.start_time ?? null)}
          </Text>

          {/* Reason */}
          <Text size="xs" weight="medium" color={c.textMuted}
            style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Reason
          </Text>
          <View style={[styles.reasonBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
            <Text size="sm" color={c.text}>{excuse.reason}</Text>
          </View>

          {/* Admin notes */}
          <Text size="xs" weight="medium" color={c.textMuted}
            style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 8 }}>
            Notes (optional)
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add a note for the member..."
            placeholderTextColor={c.textSubtle}
            multiline
          />

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
            <Pressable
              onPress={onClose}
              style={[styles.actionBtn, { flex: 1, borderColor: c.border }]}
            >
              <Text size="sm" weight="medium">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => submit('denied')}
              disabled={!!saving}
              style={[styles.actionBtn, { flex: 1, borderColor: '#EF444440', backgroundColor: '#EF444414' }]}
            >
              {saving === 'denied'
                ? <ActivityIndicator size="small" color="#EF4444" />
                : <Text size="sm" weight="medium" color="#EF4444">Deny</Text>}
            </Pressable>
            <Pressable
              onPress={() => submit('approved')}
              disabled={!!saving}
              style={[styles.actionBtn, { flex: 1, backgroundColor: '#22C55E22', borderColor: '#22C55E40' }]}
            >
              {saving === 'approved'
                ? <ActivityIndicator size="small" color="#22C55E" />
                : <Text size="sm" weight="medium" color="#22C55E">Approve</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Excuse card ──────────────────────────────────────────────────────────────

function ExcuseCard({ excuse, onReview }: { excuse: Excuse; onReview: () => void }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const meta    = STATUS_META[excuse.status] ?? STATUS_META.pending;
  const profile = excuse.profiles;
  const name    = profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown';

  return (
    <Pressable
      onPress={excuse.status === 'pending' ? onReview : undefined}
      style={({ pressed }) => [
        styles.excuseCard,
        { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      {/* Top row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text size="sm" weight="medium">{name}</Text>
        <View style={[styles.statusPill, { backgroundColor: meta.color + '18', borderColor: meta.color }]}>
          <Ionicons name={meta.icon} size={12} color={meta.color} />
          <Text size="xs" weight="medium" color={meta.color}>{meta.label}</Text>
        </View>
      </View>

      {/* Event */}
      <Text size="xs" color={c.textMuted} style={{ marginBottom: 6 }}>
        {excuse.events?.title ?? 'Unknown event'} · {fmtDate(excuse.events?.start_time ?? null)}
      </Text>

      {/* Reason */}
      <Text size="sm" color={c.text} numberOfLines={3}>{excuse.reason}</Text>

      {/* Admin notes */}
      {excuse.admin_notes && (
        <View style={[styles.notesBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
          <Text size="xs" color={c.textSubtle} style={{ fontStyle: 'italic' }}>
            "{excuse.admin_notes}"
          </Text>
        </View>
      )}

      {/* Submitted date */}
      <Text size="xs" color={c.textSubtle} style={{ marginTop: 8 }}>
        Submitted {fmtDate(excuse.created_at)}
        {excuse.status === 'pending' && ' · Tap to review'}
      </Text>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExcusesScreen() {
  const { theme }      = useThemeStore();
  const insets         = useSafeAreaInsets();
  const { organization, profile } = useAuthStore();
  const userView       = useUserViewStore((s) => s.session);
  const c = theme.colors;

  const orgId     = userView?.org.id ?? organization?.id;
  const reviewerId = profile?.id ?? '';

  const [excuses, setExcuses]   = useState<Excuse[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [filter, setFilter]     = useState<StatusFilter>('Pending');
  const [reviewing, setReviewing] = useState<Excuse | null>(null);

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    const { data } = await supabase
      .from('excuses')
      .select(`
        id, reason, status, admin_notes, created_at, reviewed_at, user_id, event_id,
        profiles!user_id(first_name, last_name, email),
        events!event_id(title, start_time)
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    setExcuses((data ?? []) as Excuse[]);
    setLoading(false);
    setRefresh(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const displayed = excuses.filter((e) => {
    if (filter === 'All')      return true;
    return e.status === filter.toLowerCase();
  });

  const pendingCount = excuses.filter(e => e.status === 'pending').length;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text size="xxl" weight="bold">Excuses</Text>
            {pendingCount > 0 && (
              <View style={[styles.badge, { backgroundColor: c.primary }]}>
                <Text size="xs" weight="bold" style={{ color: '#fff' }}>{pendingCount}</Text>
              </View>
            )}
          </View>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {pendingCount} pending review
          </Text>
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}
      >
        {STATUS_FILTERS.map((f) => {
          const active = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, {
                borderColor: active ? c.primary : c.border,
                backgroundColor: active ? c.primary + '14' : 'transparent',
              }]}
            >
              <Text size="xs" weight={active ? 'medium' : 'regular'}
                color={active ? c.primary : c.textMuted}>
                {f}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefresh(true); load(); }}
            tintColor={c.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {displayed.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              No {filter.toLowerCase()} excuses
            </Text>
          </View>
        ) : (
          displayed.map((e) => (
            <ExcuseCard
              key={e.id}
              excuse={e}
              onReview={() => setReviewing(e)}
            />
          ))
        )}
      </ScrollView>

      {reviewing && (
        <ReviewModal
          excuse={reviewing}
          reviewerId={reviewerId}
          onClose={() => setReviewing(null)}
          onDone={() => { setReviewing(null); load(); }}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:    { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip:{ borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  scroll:    { padding: 16, gap: 12, paddingBottom: 48 },
  emptyState:{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  badge:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },

  excuseCard:{ borderWidth: 1, borderRadius: 14, padding: 16 },
  statusPill:{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  notesBox:  { borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 8 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  handle:       { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  reasonBox:    { borderWidth: 1, borderRadius: 10, padding: 14 },
  input:        { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  actionBtn:    { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
});
