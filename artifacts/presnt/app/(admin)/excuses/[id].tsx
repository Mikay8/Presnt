/**
 * Officer — Excuse Detail  /(officer)/excuses/[id]
 *
 * Full detail view for a single excuse.
 * Shows: member info, event, reason, supporting docs placeholder,
 *        audit trail, and Approve / Deny / Escalate actions.
 *
 * Navigated to from the excuses list (officer or admin).
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExcuseStatus = 'pending' | 'approved' | 'denied' | 'escalated' | 'withdrawn';

type ExcuseDetail = {
  id:               string;
  status:           ExcuseStatus;
  reason:           string;
  reviewer_note:    string | null;
  admin_notes:      string | null;
  escalation_reason:string | null;
  submitted_at:     string | null;
  reviewed_at:      string | null;
  escalated_at:     string | null;
  user_id:          string;
  event_id:         string;
  profiles:         { first_name: string; last_name: string; email: string } | null;
  events:           { title: string; start_time: string; type: string } | null;
};

type AuditEntry = {
  id:              string;
  previous_status: string | null;
  new_status:      string | null;
  note:            string | null;
  changed_at:      string;
  profiles:        { first_name: string; last_name: string } | null;
};

type ActionType = 'approve' | 'deny' | 'escalate';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
function fmtDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function statusColor(status: ExcuseStatus, c: any) {
  switch (status) {
    case 'approved':  return c.success;
    case 'denied':    return c.error;
    case 'escalated': return '#F59E0B';
    case 'withdrawn': return c.textSubtle;
    default:          return c.warning;
  }
}

// ─── Action Modal ─────────────────────────────────────────────────────────────

function ActionModal({
  visible,
  action,
  onClose,
  onConfirm,
  submitting,
}: {
  visible:    boolean;
  action:     ActionType | null;
  onClose:    () => void;
  onConfirm:  (note: string) => void;
  submitting: boolean;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [note, setNote] = useState('');
  const insets = useSafeAreaInsets();

  useEffect(() => { if (visible) setNote(''); }, [visible]);

  if (!action) return null;

  const config = {
    approve:  { title: 'Approve Excuse',  color: c.success, placeholder: 'Optional note to member…',         required: false },
    deny:     { title: 'Deny Excuse',     color: c.error,   placeholder: 'Reason for denial (shown to member)…', required: true  },
    escalate: { title: 'Escalate Excuse', color: '#F59E0B', placeholder: 'Reason for escalation…',           required: true  },
  }[action];

  const canConfirm = !config.required || note.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[am.root, { backgroundColor: c.background, paddingBottom: insets.bottom + 20 }]}>
        <View style={[am.header, { borderBottomColor: c.border }]}>
          <Text size="lg" weight="bold">{config.title}</Text>
          <Pressable onPress={onClose} style={[am.closeBtn, { backgroundColor: c.surfaceAlt }]}>
            <Ionicons name="close" size={18} color={c.text} />
          </Pressable>
        </View>

        <View style={am.body}>
          <Text size="xs" weight="medium" color={c.textMuted}
            style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            {config.required ? 'Note (required)' : 'Note (optional)'}
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={config.placeholder}
            placeholderTextColor={c.textSubtle}
            multiline
            numberOfLines={4}
            style={[am.textInput, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
          />

          <Pressable
            onPress={() => canConfirm && onConfirm(note)}
            disabled={!canConfirm || submitting}
            style={[am.confirmBtn, {
              backgroundColor: canConfirm && !submitting ? config.color : c.surfaceAlt,
              marginTop: 20,
            }]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text size="md" weight="bold"
                style={{ color: canConfirm ? '#fff' : c.textSubtle }}>
                Confirm {config.title}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const am = StyleSheet.create({
  root:       { flex: 1 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1 },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  body:       { padding: 20 },
  textInput:  { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 14, minHeight: 110, textAlignVertical: 'top' },
  confirmBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExcuseDetailScreen() {
  const { id }     = useLocalSearchParams<{ id: string }>();
  const { theme }  = useThemeStore();
  const c          = theme.colors;
  const insets     = useSafeAreaInsets();
  const { width }  = useWindowDimensions();
  const isWide     = width >= 800;
  const { profile } = useAuthStore();

  const [excuse,     setExcuse]     = useState<ExcuseDetail | null>(null);
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [notFound,   setNotFound]   = useState(false);

  const [modalAction, setModalAction] = useState<ActionType | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }

    const { data: excuseData, error } = await supabase
      .from('excuses')
      .select(`
        id, status, reason, reviewer_note, admin_notes, escalation_reason,
        submitted_at, reviewed_at, escalated_at, user_id, event_id,
        profiles!user_id(first_name, last_name, email),
        events!event_id(title, start_time, type)
      `)
      .eq('id', id)
      .single();

    if (error || !excuseData) { setNotFound(true); setLoading(false); return; }
    setExcuse(excuseData as ExcuseDetail);

    const { data: auditData } = await supabase
      .from('excuse_audit_log')
      .select('id, previous_status, new_status, note, changed_at, profiles!changed_by(first_name, last_name)')
      .eq('excuse_id', id)
      .order('changed_at', { ascending: false });

    setAuditTrail((auditData ?? []) as AuditEntry[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(note: string) {
    if (!excuse || !modalAction || !profile?.id) return;
    setSubmitting(true);

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (modalAction === 'approve') {
      updates.status       = 'approved';
      updates.reviewed_by  = profile.id;
      updates.reviewed_at  = new Date().toISOString();
      updates.reviewer_note = note || null;
    } else if (modalAction === 'deny') {
      updates.status       = 'denied';
      updates.reviewed_by  = profile.id;
      updates.reviewed_at  = new Date().toISOString();
      updates.reviewer_note = note;
    } else if (modalAction === 'escalate') {
      updates.status           = 'escalated';
      updates.escalated_at     = new Date().toISOString();
      updates.escalation_reason = note;
    }

    await supabase.from('excuses').update(updates).eq('id', excuse.id);

    // Write audit log
    await supabase.from('excuse_audit_log').insert({
      excuse_id:       excuse.id,
      changed_by:      profile.id,
      previous_status: excuse.status,
      new_status:      updates.status,
      note:            note || null,
    });

    setSubmitting(false);
    setModalAction(null);
    await load();
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (notFound || !excuse) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Ionicons name="document-text-outline" size={48} color={c.textSubtle} />
        <Text size="lg" weight="bold">Excuse not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text size="md" color={c.primary}>← Go back</Text>
        </Pressable>
      </View>
    );
  }

  const sc       = statusColor(excuse.status, c);
  const isPending = excuse.status === 'pending' || excuse.status === 'escalated';
  const memberName = excuse.profiles
    ? `${excuse.profiles.first_name} ${excuse.profiles.last_name}`
    : 'Unknown member';

  const memberSection = (
    <Card style={{ gap: 12 }}>
      <Text size="xs" weight="medium" color={c.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
        Member
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[s.avatar, { backgroundColor: c.primary + '20' }]}>
          <Text size="md" weight="bold" color={c.primary}>
            {excuse.profiles ? `${excuse.profiles.first_name[0]}${excuse.profiles.last_name[0]}` : '?'}
          </Text>
        </View>
        <View>
          <Text size="md" weight="medium">{memberName}</Text>
          <Text size="xs" color={c.textMuted}>{excuse.profiles?.email ?? '—'}</Text>
        </View>
      </View>
    </Card>
  );

  const eventSection = (
    <Card style={{ gap: 10 }}>
      <Text size="xs" weight="medium" color={c.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
        Event
      </Text>
      <Text size="md" weight="medium">{excuse.events?.title ?? '—'}</Text>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="calendar-outline" size={13} color={c.textMuted} />
          <Text size="xs" color={c.textMuted}>{fmtDate(excuse.events?.start_time ?? null)}</Text>
        </View>
        {excuse.events?.type && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="pricetag-outline" size={13} color={c.textMuted} />
            <Text size="xs" color={c.textMuted} style={{ textTransform: 'capitalize' }}>
              {excuse.events.type}
            </Text>
          </View>
        )}
      </View>
    </Card>
  );

  const reasonSection = (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text size="xs" weight="medium" color={c.textMuted}
          style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
          Reason
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="time-outline" size={12} color={c.textSubtle} />
          <Text size="xs" color={c.textSubtle}>Submitted {fmtDateTime(excuse.submitted_at)}</Text>
        </View>
      </View>
      <Text size="sm" color={c.text} style={{ lineHeight: 22 }}>{excuse.reason}</Text>

      {/* Supporting docs placeholder */}
      <View style={[s.docsRow, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
        <Ionicons name="attach-outline" size={14} color={c.textSubtle} />
        <Text size="xs" color={c.textSubtle}>No supporting documents attached</Text>
      </View>
    </Card>
  );

  const reviewSection = (excuse.reviewer_note || excuse.admin_notes || excuse.escalation_reason) ? (
    <Card style={{ gap: 10 }}>
      <Text size="xs" weight="medium" color={c.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
        Officer Note
      </Text>
      <Text size="sm" color={c.text} style={{ lineHeight: 22 }}>
        {excuse.reviewer_note ?? excuse.admin_notes ?? excuse.escalation_reason}
      </Text>
      {excuse.reviewed_at && (
        <Text size="xs" color={c.textSubtle}>{fmtDateTime(excuse.reviewed_at)}</Text>
      )}
    </Card>
  ) : null;

  const auditSection = auditTrail.length > 0 ? (
    <Card style={{ paddingVertical: 0 }}>
      <View style={[s.auditHeader, { borderBottomColor: c.border }]}>
        <Text size="xs" weight="medium" color={c.textMuted}
          style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
          Audit Trail
        </Text>
      </View>
      {auditTrail.map((entry, i) => (
        <View key={entry.id} style={[
          s.auditRow,
          { borderBottomColor: c.border },
          i < auditTrail.length - 1 && { borderBottomWidth: 1 },
        ]}>
          <View style={[s.auditDot, { backgroundColor: c.primary }]} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text size="sm" weight="medium">
                {entry.profiles
                  ? `${entry.profiles.first_name} ${entry.profiles.last_name}`
                  : 'System'}
              </Text>
              {entry.previous_status && (
                <Text size="xs" color={c.textSubtle}>
                  {entry.previous_status} → {entry.new_status}
                </Text>
              )}
            </View>
            {entry.note && (
              <Text size="xs" color={c.textMuted}>{entry.note}</Text>
            )}
            <Text size="xs" color={c.textSubtle}>{fmtDateTime(entry.changed_at)}</Text>
          </View>
        </View>
      ))}
    </Card>
  ) : null;

  const actionBar = isPending ? (
    <View style={[s.actionBar, {
      borderTopColor: c.border,
      backgroundColor: c.background,
      paddingBottom: insets.bottom + 12,
    }]}>
      <Pressable
        onPress={() => setModalAction('deny')}
        style={[s.actionBtn, { borderColor: c.error, backgroundColor: c.error + '10' }]}
      >
        <Ionicons name="close-circle-outline" size={16} color={c.error} />
        <Text size="sm" weight="medium" color={c.error}>Deny</Text>
      </Pressable>
      <Pressable
        onPress={() => setModalAction('escalate')}
        style={[s.actionBtn, { borderColor: '#F59E0B', backgroundColor: '#F59E0B10' }]}
      >
        <Ionicons name="arrow-up-circle-outline" size={16} color="#F59E0B" />
        <Text size="sm" weight="medium" color="#F59E0B">Escalate</Text>
      </Pressable>
      <Pressable
        onPress={() => setModalAction('approve')}
        style={[s.actionBtn, { borderColor: c.success, backgroundColor: c.success + '10', flex: 1.5 }]}
      >
        <Ionicons name="checkmark-circle-outline" size={16} color={c.success} />
        <Text size="sm" weight="medium" color={c.success}>Approve</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Top bar */}
      <View style={[s.topBar, {
        paddingTop: isWide ? 20 : insets.top + 12,
        backgroundColor: c.background,
        borderBottomColor: c.border,
      }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back-outline" size={18} color={c.text} />
          <Text size="sm" weight="medium">Excuses</Text>
        </Pressable>
        <View style={[s.statusBadge, { backgroundColor: sc + '18', borderColor: sc }]}>
          <Text size="xs" weight="bold" color={sc}>
            {excuse.status.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={[
          isWide ? s.scrollWide : s.scrollMobile,
          { paddingBottom: isPending ? 100 : (insets.bottom + 32) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={{ marginBottom: 20 }}>
          <Text size="xs" color={c.textMuted}>Excuse Request</Text>
          <Text size="xl" weight="bold" style={{ marginTop: 2 }}>{memberName}</Text>
        </View>

        {isWide ? (
          <View style={s.wideCols}>
            <View style={{ flex: 1, gap: 16 }}>
              {memberSection}
              {eventSection}
              {reasonSection}
              {reviewSection}
            </View>
            <View style={{ width: 300, gap: 16 }}>
              {auditSection}
            </View>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {memberSection}
            {eventSection}
            {reasonSection}
            {reviewSection}
            {auditSection}
          </View>
        )}
      </ScrollView>

      {/* Action buttons */}
      {actionBar}

      {/* Action modal */}
      <ActionModal
        visible={modalAction !== null}
        action={modalAction}
        onClose={() => setModalAction(null)}
        onConfirm={handleAction}
        submitting={submitting}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  topBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },

  scrollWide:  { padding: 32 },
  scrollMobile:{ padding: 16 },
  wideCols:    { flexDirection: 'row', gap: 24, alignItems: 'flex-start' },

  avatar:    { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  docsRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, padding: 10 },

  auditHeader: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  auditRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  auditDot:    { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },

  actionBar:   { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, position: 'absolute', bottom: 0, left: 0, right: 0 },
  actionBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 13 },
});
