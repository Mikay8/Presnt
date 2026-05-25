/**
 * Demo Member — Status (read-only)
 *
 * Shows attendance donut, requirements progress, and event history.
 * The "Submit excuse" button is completely removed.
 * Per-row "Submit an Excuse" inline buttons on missed mandatory events
 * are also removed (replaced with plain missed-event display).
 * No writes to Supabase.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, DonutChart, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

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

type AcademicTerm = { id: string; name: string; start_date: string; end_date: string; };

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

// ─── Requirement progress card ────────────────────────────────────────────────

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

// ─── Attendance history row (no excuse button) ────────────────────────────────

function HistoryRow({ item, isLast }: { item: AttendanceRecord; isLast: boolean }) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const attended = item.status === 'present' || item.status === 'late';
  const excused  = item.status === 'excused';
  const isMissedMandatory = item.status === 'absent' && item.events?.type === 'mandatory';

  const dotColor = attended ? c.primary
    : excused  ? (c.warning ?? '#C99432')
    : isMissedMandatory ? c.error
    : c.textSubtle;

  const event   = item.events;
  const dateStr = event?.start_time ? fmtDate(event.start_time) : '—';
  const timeStr = event?.start_time ? fmtTime(event.start_time) : '';

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
        {/* No per-row excuse button in demo */}
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

export default function DemoMemberStatusScreen() {
  const { theme }    = useThemeStore();
  const c            = theme.colors;
  const { width }    = useWindowDimensions();
  const insets       = useSafeAreaInsets();
  const isWide       = width >= 800;
  const { profile, membership, organization } = useAuthStore();

  const [term,         setTerm]         = useState<AcademicTerm | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [snapshots,    setSnapshots]    = useState<Snapshot[]>([]);
  const [records,      setRecords]      = useState<AttendanceRecord[]>([]);
  const [totalMandatory, setTotal]      = useState(0);
  const [weeksLeft,    setWeeksLeft]    = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  const orgId  = organization?.id;
  const userId = profile?.id;
  const membId = membership?.id;

  const load = useCallback(async () => {
    if (!orgId || !userId) { setLoading(false); return; }

    const { data: termData } = await supabase
      .from('academic_terms').select('id, name, start_date, end_date')
      .eq('org_id', orgId).eq('is_active', true).single();
    setTerm(termData ?? null);

    if (termData) {
      const end = new Date(termData.end_date);
      const ms  = end.getTime() - Date.now();
      setWeeksLeft(Math.max(0, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000))));
    }

    if (termData) {
      const { data: rData } = await supabase
        .from('status_requirements')
        .select('id, name, min_points, min_events, warning_threshold, consequence')
        .eq('org_id', orgId).eq('term_id', termData.id).eq('is_deleted', false).order('name');
      setRequirements((rData ?? []) as Requirement[]);
    }

    if (termData && membId) {
      const { data: sData } = await supabase
        .from('status_snapshots')
        .select('requirement_id, points_earned, points_required, events_attended, events_required, is_compliant, is_at_risk')
        .eq('membership_id', membId).eq('term_id', termData.id);
      setSnapshots((sData ?? []) as Snapshot[]);
    }

    const { data: attData } = await supabase
      .from('event_attendance')
      .select('id, status, checked_in_at, events(id, title, type, start_time)')
      .eq('user_id', userId).eq('org_id', orgId)
      .order('created_at', { ascending: false }).limit(50);
    if (attData) setRecords(attData as AttendanceRecord[]);

    if (termData) {
      const { count } = await supabase
        .from('events').select('id', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('type', 'mandatory').eq('is_deleted', false)
        .gte('start_time', `${termData.start_date}T00:00:00Z`)
        .lte('start_time', `${termData.end_date}T23:59:59Z`);
      setTotal(count ?? 0);
    }

    setLoading(false);
    setRefreshing(false);
  }, [orgId, userId, membId]);

  useEffect(() => { load(); }, [load]);

  const attended   = records.filter((r) => r.status === 'present' || r.status === 'late').length;
  const excused    = records.filter((r) => r.status === 'excused').length;
  const pct        = totalMandatory > 0 ? Math.round((attended / totalMandatory) * 100) : 0;
  const termLabel  = term?.name ?? 'Current term';

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

  const historySection = records.length === 0 ? (
    <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
      <Ionicons name="calendar-outline" size={28} color={c.textSubtle} />
      <Text size="sm" color={c.textMuted}>No attendance records yet</Text>
    </View>
  ) : records.map((item, i) => (
    <HistoryRow key={item.id} item={item} isLast={i === records.length - 1} />
  ));

  // ── Desktop ──
  if (isWide) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={styles.widePad}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
      >
        <View style={styles.wideTitleRow}>
          <View>
            <Text size="h1" weight="bold">Status</Text>
            <Text size="sm" color={c.textMuted} style={{ marginTop: 4 }}>
              {termLabel}{weeksLeft > 0 ? ` · ${weeksLeft} week${weeksLeft !== 1 ? 's' : ''} remaining` : ''}
            </Text>
          </View>
          {/* No "Submit excuse" button in demo */}
        </View>

        <View style={styles.wideContent}>
          <View style={{ width: 300, gap: 20 }}>
            <Card style={{ alignItems: 'center', gap: 16, paddingVertical: 28 }}>
              <Text size="xs" weight="medium" color={c.textMuted}
                style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                Attendance
              </Text>
              <DonutChart percent={pct} size={180} strokeWidth={20} sublabel={termLabel} />
              <Text size="sm" color={c.textMuted}>
                {attended} of {totalMandatory} meetings attended
              </Text>
            </Card>
            {requirementsSection}
          </View>

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
                <View style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: c.error }]} />
                  <Text size="xs" color={c.textMuted}>Missed mandatory</Text>
                </View>
              </View>
              {historySection}
            </Card>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ── Mobile ──
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={[styles.mobilePad, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
    >
      {/* Title row — no "Submit excuse" button */}
      <View style={{ marginBottom: 24 }}>
        <Text size="h1" weight="bold">Status</Text>
        <Text size="sm" color={c.textMuted} style={{ marginTop: 4 }}>
          {termLabel}{weeksLeft > 0 ? ` · ${weeksLeft} week${weeksLeft !== 1 ? 's' : ''} remaining` : ''}
        </Text>
      </View>

      <View style={styles.mobileDonut}>
        <DonutChart percent={pct} size={180} strokeWidth={20} />
        <Text size="sm" color={c.textMuted} style={{ marginTop: 12, textAlign: 'center' }}>
          {attended} of {totalMandatory} meetings attended · {termLabel}
        </Text>
      </View>

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

      {requirementsSection && (
        <View style={{ marginTop: 24 }}>
          {requirementsSection}
        </View>
      )}

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
  );
}

const styles = StyleSheet.create({
  widePad:      { padding: 32 },
  wideTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  wideContent:  { flexDirection: 'row', gap: 24, alignItems: 'flex-start' },
  statRow:      { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  historyHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, paddingBottom: 10, borderBottomWidth: 1 },

  mobilePad:      { paddingHorizontal: 16 },
  mobileDonut:    { alignItems: 'center', marginBottom: 24 },
  miniStatCard:   { width: 140, paddingVertical: 16 },

  statCard: { flex: 1, minWidth: 120 },
  barTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 2 },

  historyRow:  { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 8, gap: 12 },
  attendedDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  missedBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },

  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },

  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
});
