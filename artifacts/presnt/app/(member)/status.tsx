import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, DonutChart, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceRecord = {
  id: string;
  status: 'present' | 'absent' | 'excused' | 'late';
  checked_in_at: string | null;
  events: { id: string; title: string; type: string; start_time: string } | null;
};

type Requirement = {
  id: string; name: string; min_points: number; min_events: number | null;
  warning_threshold: number | null; consequence: string | null;
};

type Snapshot = {
  requirement_id: string;
  points_earned:  number;
  points_required: number;
  events_attended: number;
  events_required: number | null;
  is_compliant:   boolean;
  is_at_risk:     boolean;
};


// Future-excuse events (for the top button picker)
type FutureEvent = { id: string; title: string; start_time: string; };

// ─── Common excuse reasons ────────────────────────────────────────────────────

const COMMON_REASONS = [
  'Academic conflict (exam/class)',
  'Medical appointment or illness',
  'Family emergency',
  'Work obligation',
  'Transportation issue',
  'Pre-approved travel',
  'Other (describe below)',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function snapPct(earned: number, required: number) {
  if (required <= 0) return 100;
  return Math.min(100, Math.round((earned / required) * 100));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Submit Excuse Modal ─────────────────────────────────────────────────────

type ExcuseMode = 'missed' | 'future';

interface SubmitExcuseModalProps {
  visible: boolean;
  mode: ExcuseMode;
  /** Pre-selected event when coming from a missed-event row */
  preselectedEvent?: { id: string; title: string } | null;
  futureEvents: FutureEvent[];
  orgId: string;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function SubmitExcuseModal({
  visible,
  mode,
  preselectedEvent,
  futureEvents,
  orgId,
  userId,
  onClose,
  onSuccess,
}: SubmitExcuseModalProps) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const insets = useSafeAreaInsets();

  const [selectedEventId, setSelectedEventId] = useState<string>(preselectedEvent?.id ?? '');
  const [selectedReason,  setSelectedReason]  = useState<string>('');
  const [customText,      setCustomText]      = useState<string>('');
  const [submitting,      setSubmitting]      = useState(false);
  const [submitted,       setSubmitted]       = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setSelectedEventId(preselectedEvent?.id ?? '');
      setSelectedReason('');
      setCustomText('');
      setSubmitting(false);
      setSubmitted(false);
      setError(null);
    }
  }, [visible, preselectedEvent?.id]);

  const needsCustomText = selectedReason === 'Other (describe below)';
  const finalReason = needsCustomText
    ? customText.trim()
    : selectedReason;

  const canSubmit =
    selectedEventId &&
    finalReason.length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from('excuses').insert({
      org_id:   orgId,
      user_id:  userId,
      event_id: selectedEventId,
      reason:   finalReason,
      status:   'pending',
    });
    if (err) {
      setError('Failed to submit excuse. Please try again.');
      setSubmitting(false);
    } else {
      setSubmitted(true);
      setSubmitting(false);
      setTimeout(() => { onSuccess(); }, 1200);
    }
  }

  const titleText = mode === 'missed' ? 'Submit Excuse' : 'Submit Future Excuse';
  const subtitle  = mode === 'missed'
    ? 'Submit an excuse for a missed mandatory event'
    : 'Notify officers in advance that you cannot attend an upcoming event';

  // The events shown in the picker depend on mode
  const pickerEvents: { id: string; title: string; start_time?: string }[] =
    mode === 'missed' && preselectedEvent
      ? [preselectedEvent]
      : futureEvents;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[em.root, { backgroundColor: c.background, paddingBottom: insets.bottom + 16 }]}>
        {/* Header */}
        <View style={[em.header, { borderBottomColor: c.border }]}>
          <View style={{ flex: 1 }}>
            <Text size="lg" weight="bold">{titleText}</Text>
            <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>{subtitle}</Text>
          </View>
          <Pressable onPress={onClose} style={[em.closeBtn, { backgroundColor: c.surfaceAlt }]}>
            <Ionicons name="close" size={18} color={c.text} />
          </Pressable>
        </View>

        {submitted ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Ionicons name="checkmark-circle" size={56} color={c.success} />
            <Text size="lg" weight="bold" color={c.success}>Excuse Submitted</Text>
            <Text size="sm" color={c.textMuted} style={{ textAlign: 'center' }}>
              Your excuse has been sent for review.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={em.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Event selector */}
            <Text size="xs" weight="medium" color={c.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Event
            </Text>

            {mode === 'missed' && preselectedEvent ? (
              /* Pre-filled — read-only for missed-event flow */
              <View style={[em.selectedEventPill, { backgroundColor: c.error + '15', borderColor: c.error + '50' }]}>
                <Ionicons name="calendar-outline" size={15} color={c.error} />
                <Text size="sm" weight="medium" color={c.error} style={{ flex: 1 }}>
                  {preselectedEvent.title}
                </Text>
                <View style={[em.missedTag, { backgroundColor: c.error }]}>
                  <Text size="xs" weight="bold" style={{ color: '#fff' }}>Missed</Text>
                </View>
              </View>
            ) : (
              /* Future-excuse mode: scrollable event list */
              <View style={[em.eventList, { borderColor: c.border }]}>
                {pickerEvents.length === 0 ? (
                  <View style={{ padding: 16, alignItems: 'center' }}>
                    <Text size="sm" color={c.textMuted}>No upcoming events found</Text>
                  </View>
                ) : (pickerEvents as FutureEvent[]).map((ev, i) => {
                  const active = selectedEventId === ev.id;
                  return (
                    <Pressable
                      key={ev.id}
                      onPress={() => setSelectedEventId(ev.id)}
                      style={[
                        em.eventOption,
                        { borderBottomColor: c.border },
                        i < pickerEvents.length - 1 && { borderBottomWidth: 1 },
                        active && { backgroundColor: c.primary + '12' },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text size="sm" weight={active ? 'medium' : 'regular'} color={active ? c.primary : c.text}>
                          {ev.title}
                        </Text>
                        {ev.start_time && (
                          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
                            {fmtDate(ev.start_time)} · {fmtTime(ev.start_time)}
                          </Text>
                        )}
                      </View>
                      {active && <Ionicons name="checkmark-circle" size={18} color={c.primary} />}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Reason selector */}
            <Text size="xs" weight="medium" color={c.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 8 }}>
              Reason
            </Text>
            <View style={[em.reasonList, { borderColor: c.border }]}>
              {COMMON_REASONS.map((r, i) => {
                const active = selectedReason === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => setSelectedReason(r)}
                    style={[
                      em.reasonOption,
                      { borderBottomColor: c.border },
                      i < COMMON_REASONS.length - 1 && { borderBottomWidth: 1 },
                      active && { backgroundColor: c.primary + '12' },
                    ]}
                  >
                    <Text size="sm" color={active ? c.primary : c.text} weight={active ? 'medium' : 'regular'}
                      style={{ flex: 1 }}>
                      {r}
                    </Text>
                    {active && <Ionicons name="checkmark-circle" size={18} color={c.primary} />}
                  </Pressable>
                );
              })}
            </View>

            {/* Custom text — shown when "Other" is selected */}
            {needsCustomText && (
              <View style={{ marginTop: 12 }}>
                <Text size="xs" weight="medium" color={c.textMuted}
                  style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Describe your reason
                </Text>
                <TextInput
                  value={customText}
                  onChangeText={setCustomText}
                  placeholder="Enter your reason here…"
                  placeholderTextColor={c.textSubtle}
                  multiline
                  numberOfLines={4}
                  style={[em.customInput, {
                    backgroundColor: c.surface,
                    borderColor: c.border,
                    color: c.text,
                  }]}
                />
              </View>
            )}

            {error && (
              <View style={[em.errorBanner, { backgroundColor: c.error + '15', borderColor: c.error + '40' }]}>
                <Ionicons name="alert-circle-outline" size={16} color={c.error} />
                <Text size="sm" color={c.error}>{error}</Text>
              </View>
            )}

            {/* Submit */}
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
              style={[
                em.submitBtn,
                { backgroundColor: canSubmit && !submitting ? c.primary : c.surfaceAlt },
                { marginTop: 24 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text size="md" weight="bold" style={{ color: canSubmit ? '#fff' : c.textSubtle }}>
                  Submit Excuse
                </Text>
              )}
            </Pressable>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const em = StyleSheet.create({
  root:       { flex: 1 },
  header:     { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, gap: 12 },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  body:       { padding: 20, paddingBottom: 40 },

  selectedEventPill: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 14 },
  missedTag:         { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },

  eventList:    { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  eventOption:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13 },

  reasonList:   { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  reasonOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13 },

  customInput:  { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 14, minHeight: 100, textAlignVertical: 'top' },
  errorBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 12 },
  submitBtn:    { borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
});

// ─── Requirement progress card ───────────────────────────────────────────────

function RequirementCard({ req, snap, c }: { req: Requirement; snap: Snapshot | undefined; c: any }) {
  const earned   = snap?.points_earned   ?? 0;
  const required = snap?.points_required ?? req.min_points;
  const p        = snapPct(earned, required);
  const isAtRisk  = snap?.is_at_risk   ?? false;
  const compliant = snap?.is_compliant ?? (required === 0);
  const barColor  = isAtRisk ? c.error : compliant ? c.success : c.warning;
  const statusLabel = isAtRisk ? 'At Risk' : compliant ? 'Met' : 'In Progress';

  return (
    <View style={[rc.card, { backgroundColor: c.surface, borderColor: isAtRisk ? c.error + '60' : c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <Text size="sm" weight="medium">{req.name}</Text>
          {req.consequence && (
            <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>{req.consequence}</Text>
          )}
        </View>
        <View style={[rc.badge, { backgroundColor: barColor + '18', borderColor: barColor }]}>
          <Text size="xs" weight="medium" color={barColor}>{statusLabel}</Text>
        </View>
      </View>
      <View style={[rc.track, { backgroundColor: barColor + '22' }]}>
        <View style={[rc.fill, { width: `${p}%` as any, backgroundColor: barColor }]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        <Text size="xs" color={c.textMuted}>{earned} / {required} pts</Text>
        {req.min_events != null && (
          <Text size="xs" color={c.textMuted}>
            {snap?.events_attended ?? 0} / {req.min_events} events
          </Text>
        )}
        <Text size="xs" weight="medium" color={barColor}>{p}%</Text>
      </View>
    </View>
  );
}

const rc = StyleSheet.create({
  card:  { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  badge: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 4 },
});

// ─── Attendance history row ───────────────────────────────────────────────────

interface HistoryRowProps {
  item: AttendanceRecord;
  isLast: boolean;
  onSubmitExcuse?: (event: { id: string; title: string }) => void;
}

function HistoryRow({ item, isLast, onSubmitExcuse }: HistoryRowProps) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const attended = item.status === 'present' || item.status === 'late';
  const excused  = item.status === 'excused';
  const isMissedMandatory =
    item.status === 'absent' && item.events?.type === 'mandatory';

  const dotColor = attended ? c.primary
    : excused  ? (c.warning ?? '#C99432')
    : isMissedMandatory ? c.error
    : c.textSubtle;

  const event   = item.events;
  const dateStr = event?.start_time
    ? fmtDate(event.start_time) : '—';
  const timeStr = event?.start_time
    ? fmtTime(event.start_time) : '';

  // Red row background for missed mandatory events
  const rowBg = isMissedMandatory
    ? { backgroundColor: c.error + '10', borderLeftWidth: 3, borderLeftColor: c.error }
    : {};

  return (
    <View style={[
      styles.historyRow,
      rowBg,
      !isLast && { borderBottomWidth: 1, borderBottomColor: isMissedMandatory ? c.error + '25' : c.border },
    ]}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text size="sm" weight="medium" color={isMissedMandatory ? c.error : c.text}>
            {event?.title ?? '—'}
          </Text>
          {isMissedMandatory && (
            <View style={[styles.missedBadge, { backgroundColor: c.error + '18', borderColor: c.error + '50' }]}>
              <Text size="xs" weight="medium" color={c.error}>Missed</Text>
            </View>
          )}
        </View>
        <Text size="xs" color={isMissedMandatory ? c.error + 'CC' : c.textMuted}>
          {dateStr}{timeStr ? ` · ${timeStr}` : ''}
          {isMissedMandatory ? ' · Mandatory' : ''}
        </Text>

        {/* Per-row excuse button for missed mandatory events */}
        {isMissedMandatory && event && onSubmitExcuse && (
          <Pressable
            onPress={() => onSubmitExcuse({ id: event.id, title: event.title })}
            style={[styles.excuseRowBtn, { borderColor: c.error + '60', backgroundColor: c.error + '10' }]}
          >
            <Ionicons name="document-text-outline" size={13} color={c.error} />
            <Text size="xs" weight="medium" color={c.error}>Submit an Excuse</Text>
          </Pressable>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <View style={[styles.attendedDot, { backgroundColor: dotColor }]} />
        {excused && <Text size="xs" color={c.textMuted}>Excused</Text>}
        {item.status === 'late' && <Text size="xs" color={c.textMuted}>Late</Text>}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StatusScreen() {
  const { theme }    = useThemeStore();
  const c            = theme.colors;
  const { width }    = useWindowDimensions();
  const insets       = useSafeAreaInsets();
  const isWide       = width >= 800;
  const { profile, membership, organization } = useAuthStore();

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [snapshots,    setSnapshots]    = useState<Snapshot[]>([]);
  const [records,      setRecords]      = useState<AttendanceRecord[]>([]);
  const [futureEvents, setFutureEvents] = useState<FutureEvent[]>([]);
  const [totalMandatory, setTotal]      = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  // Modal state
  const [modalVisible,       setModalVisible]       = useState(false);
  const [excuseMode,         setExcuseMode]         = useState<ExcuseMode>('future');
  const [preselectedEvent,   setPreselectedEvent]   = useState<{ id: string; title: string } | null>(null);

  const orgId  = organization?.id;
  const userId = profile?.id;
  const membId = membership?.id;

  const load = useCallback(async () => {
    if (!orgId || !userId) { setLoading(false); return; }

    // 1. Requirements (no term filter)
    const { data: rData } = await supabase
      .from('status_requirements')
      .select('id, name, min_points, min_events, warning_threshold, consequence')
      .eq('org_id', orgId).eq('is_deleted', false).order('name');
    setRequirements((rData ?? []) as Requirement[]);

    // 2. My snapshots (no term filter)
    if (membId) {
      const { data: sData } = await supabase
        .from('status_snapshots')
        .select('requirement_id, points_earned, points_required, events_attended, events_required, is_compliant, is_at_risk')
        .eq('membership_id', membId);
      setSnapshots((sData ?? []) as Snapshot[]);
    }

    // 3. Attendance records (recent 50)
    const { data: attData } = await supabase
      .from('event_attendance')
      .select('id, status, checked_in_at, events(id, title, type, start_time)')
      .eq('user_id', userId).eq('org_id', orgId)
      .order('created_at', { ascending: false }).limit(50);
    if (attData) setRecords(attData as AttendanceRecord[]);

    // 4. Total mandatory events (all time for this org)
    const { count } = await supabase
      .from('events').select('id', { count: 'exact', head: true })
      .eq('org_id', orgId).eq('type', 'mandatory').eq('is_deleted', false);
    setTotal(count ?? 0);

    // 5. Upcoming events (for "future excuse" picker)
    const { data: upcomingData } = await supabase
      .from('events')
      .select('id, title, start_time')
      .eq('org_id', orgId)
      .eq('is_deleted', false)
      .in('status', ['scheduled', 'open'])
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })
      .limit(30);
    setFutureEvents((upcomingData ?? []) as FutureEvent[]);

    setLoading(false);
    setRefreshing(false);
  }, [orgId, userId, membId]);

  useEffect(() => { load(); }, [load]);

  function onRefresh() { setRefreshing(true); load(); }

  // Open modal for top "Submit excuse" button (future excuse mode)
  function openFutureExcuse() {
    setExcuseMode('future');
    setPreselectedEvent(null);
    setModalVisible(true);
  }

  // Open modal from a missed-event row
  function openMissedExcuse(event: { id: string; title: string }) {
    setExcuseMode('missed');
    setPreselectedEvent(event);
    setModalVisible(true);
  }

  function handleModalClose() { setModalVisible(false); }
  function handleModalSuccess() { setModalVisible(false); load(); }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const attended   = records.filter((r) => r.status === 'present' || r.status === 'late').length;
  const excused    = records.filter((r) => r.status === 'excused').length;
  const pct        = totalMandatory > 0 ? Math.round((attended / totalMandatory) * 100) : 0;

  const mandatoryRecs = records.filter((r) => r.events?.type === 'mandatory');
  const socialRecs    = records.filter((r) => r.events?.type === 'social');
  const mandPct = mandatoryRecs.length > 0
    ? Math.round((mandatoryRecs.filter((r) => r.status === 'present').length / mandatoryRecs.length) * 100) : 0;
  const socialPct = socialRecs.length > 0
    ? Math.round((socialRecs.filter((r) => r.status === 'present').length / socialRecs.length) * 100) : 0;

  const STAT_CARDS = [
    { label: 'Meetings', value: totalMandatory > 0 ? `${attended}/${totalMandatory}` : `${attended}`, pct: mandPct },
    { label: 'Excused',  value: `${excused}`, pct: totalMandatory > 0 ? Math.round((excused / totalMandatory) * 100) : 0 },
    { label: 'Socials',  value: `${socialRecs.filter((r) => r.status === 'present').length}/${socialRecs.length}`, pct: socialPct },
  ];

  const anyAtRisk    = snapshots.some((s) => s.is_at_risk);
  const allCompliant = snapshots.length > 0 && snapshots.every((s) => s.is_compliant);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  // ── Requirements section ──────────────────────────────────────────────────
  const requirementsSection = requirements.length > 0 ? (
    <View>
      <Text size="xs" weight="medium" color={c.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
        Requirements
      </Text>
      {snapshots.length > 0 && (
        <View style={[styles.statusBanner, {
          backgroundColor: anyAtRisk ? c.error + '12' : allCompliant ? c.success + '12' : c.warning + '12',
          borderColor:     anyAtRisk ? c.error + '40' : allCompliant ? c.success + '40' : c.warning + '40',
        }]}>
          <Ionicons
            name={anyAtRisk ? 'alert-circle-outline' : allCompliant ? 'checkmark-circle-outline' : 'time-outline'}
            size={18}
            color={anyAtRisk ? c.error : allCompliant ? c.success : c.warning}
          />
          <Text size="sm" weight="medium"
            color={anyAtRisk ? c.error : allCompliant ? c.success : c.warning}>
            {anyAtRisk
              ? 'You are at risk on one or more requirements'
              : allCompliant
              ? 'All requirements met — great work!'
              : 'Working toward requirements'}
          </Text>
        </View>
      )}
      {requirements.map((req) => (
        <RequirementCard
          key={req.id}
          req={req}
          snap={snapshots.find((s) => s.requirement_id === req.id)}
          c={c}
        />
      ))}
    </View>
  ) : null;

  // ── History section (shared between desktop and mobile) ───────────────────
  const historySection = records.length === 0 ? (
    <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
      <Ionicons name="calendar-outline" size={28} color={c.textSubtle} />
      <Text size="sm" color={c.textMuted}>No attendance records yet</Text>
    </View>
  ) : records.map((item, i) => (
    <HistoryRow
      key={item.id}
      item={item}
      isLast={i === records.length - 1}
      onSubmitExcuse={openMissedExcuse}
    />
  ));

  // ── Desktop ──
  if (isWide) {
    return (
      <>
        <ScrollView
          style={{ flex: 1, backgroundColor: c.background }}
          contentContainerStyle={styles.widePad}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        >
          <View style={styles.wideTitleRow}>
            <View>
              <Text size="h1" weight="bold">Status</Text>
              <Text size="sm" color={c.textMuted} style={{ marginTop: 4 }}>
                Attendance & Compliance
              </Text>
            </View>
            <Button label="Submit excuse" size="sm" onPress={openFutureExcuse} />
          </View>

          <View style={styles.wideContent}>
            {/* Left: donut + requirements */}
            <View style={{ width: 300, gap: 20 }}>
              <Card style={{ alignItems: 'center', gap: 16, paddingVertical: 28 }}>
                <Text size="xs" weight="medium" color={c.textMuted}
                  style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                  Attendance
                </Text>
                <DonutChart percent={pct} size={180} strokeWidth={20} />
                <Text size="sm" color={c.textMuted}>
                  {attended} of {totalMandatory} meetings attended
                </Text>
              </Card>
              {requirementsSection}
            </View>

            {/* Right: stat cards + history */}
            <View style={{ flex: 1, gap: 16 }}>
              <View style={styles.statRow}>
                {STAT_CARDS.map((s) => (
                  <Card key={s.label} style={styles.statCard}>
                    <Text size="xs" weight="medium" color={c.textMuted}
                      style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                      {s.label}
                    </Text>
                    <Text size="xxl" weight="bold" style={{ marginBottom: 8 }}>{s.value}</Text>
                    <View style={[styles.barTrack, { backgroundColor: c.surfaceAlt }]}>
                      <View style={[styles.barFill, { width: `${s.pct}%` as any, backgroundColor: c.primary }]} />
                    </View>
                  </Card>
                ))}
              </View>

              <Card style={{ paddingVertical: 8 }}>
                <View style={styles.historyHeader}>
                  <Text size="xs" weight="medium" color={c.textMuted}
                    style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                    Event History
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={[styles.legendRow]}>
                      <View style={[styles.legendDot, { backgroundColor: c.error }]} />
                      <Text size="xs" color={c.textMuted}>Missed mandatory</Text>
                    </View>
                    <Pressable onPress={() => router.push('/(member)/excuses/history' as any)}>
                      <Text size="xs" color={c.primary} weight="medium">View excuse history →</Text>
                    </Pressable>
                  </View>
                </View>
                {historySection}
              </Card>
            </View>
          </View>
        </ScrollView>

        <SubmitExcuseModal
          visible={modalVisible}
          mode={excuseMode}
          preselectedEvent={preselectedEvent}
          futureEvents={futureEvents}
          orgId={orgId ?? ''}
          userId={userId ?? ''}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      </>
    );
  }

  // ── Mobile ──
  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={[styles.mobilePad, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        <View style={styles.mobileTitleRow}>
          <Text size="h1" weight="bold">Status</Text>
          <Button label="Submit excuse" size="sm" onPress={openFutureExcuse} />
        </View>

        {/* Donut */}
        <View style={styles.mobileDonut}>
          <DonutChart percent={pct} size={180} strokeWidth={20} />
          <Text size="sm" color={c.textMuted} style={{ marginTop: 12, textAlign: 'center' }}>
            {attended} of {totalMandatory} meetings attended
          </Text>
        </View>

        {/* Mini stat cards */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
          style={{ marginHorizontal: -16, paddingHorizontal: 16 }}>
          {STAT_CARDS.map((s) => (
            <Card key={s.label} style={styles.miniStatCard}>
              <Text size="xs" color={c.textMuted}
                style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                {s.label}
              </Text>
              <Text size="xl" weight="bold">{s.value}</Text>
              <View style={[styles.barTrack, { backgroundColor: c.surfaceAlt, marginTop: 8 }]}>
                <View style={[styles.barFill, { width: `${s.pct}%` as any, backgroundColor: c.primary }]} />
              </View>
            </Card>
          ))}
        </ScrollView>

        {/* Requirements */}
        {requirementsSection && (
          <View style={{ marginTop: 24 }}>
            {requirementsSection}
          </View>
        )}

        {/* Event History */}
        <View style={{ marginTop: 24, marginBottom: 12, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text size="xs" weight="medium" color={c.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              Event History
            </Text>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: c.error }]} />
              <Text size="xs" color={c.textMuted}>Missed mandatory</Text>
            </View>
          </View>
          <Pressable onPress={() => router.push('/(member)/excuses/history' as any)}>
            <Text size="xs" color={c.primary} weight="medium">View excuse history →</Text>
          </Pressable>
        </View>

        {records.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
            <Ionicons name="calendar-outline" size={28} color={c.textSubtle} />
            <Text size="sm" color={c.textMuted}>No attendance records yet</Text>
          </Card>
        ) : (
          <Card style={{ paddingVertical: 4 }}>
            {historySection}
          </Card>
        )}
      </ScrollView>

      <SubmitExcuseModal
        visible={modalVisible}
        mode={excuseMode}
        preselectedEvent={preselectedEvent}
        futureEvents={futureEvents}
        orgId={orgId ?? ''}
        userId={userId ?? ''}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  widePad:      { padding: 32 },
  wideTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  wideContent:  { flexDirection: 'row', gap: 24, alignItems: 'flex-start' },
  statRow:      { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  historyHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, paddingBottom: 10, borderBottomWidth: 1 },

  mobilePad:      { paddingHorizontal: 16 },
  mobileTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  mobileDonut:    { alignItems: 'center', marginBottom: 24 },
  miniStatCard:   { width: 140, paddingVertical: 16 },

  statCard: { flex: 1, minWidth: 120 },
  barTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 2 },

  historyRow:  { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 8, gap: 12 },
  attendedDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },

  missedBadge:   { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  excuseRowBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6, alignSelf: 'flex-start' },

  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },

  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
});
