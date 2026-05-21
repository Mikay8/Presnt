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

import { Button, Card, DonutChart, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceRecord = {
  id: string;
  status: 'present' | 'absent' | 'excused' | 'late';
  checked_in_at: string | null;
  events: {
    id: string;
    title: string;
    type: string;
    start_time: string;
  } | null;
};

type AcademicTerm = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, pct }: { label: string; value: string; pct: number }) {
  const { theme } = useThemeStore();
  return (
    <Card style={styles.statCard}>
      <Text size="xs" weight="medium" color={theme.colors.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        {label}
      </Text>
      <Text size="xxl" weight="bold" style={{ marginBottom: 8 }}>{value}</Text>
      <View style={[styles.barTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
        <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: theme.colors.primary }]} />
      </View>
    </Card>
  );
}

function HistoryRow({
  item,
  isLast,
}: {
  item: AttendanceRecord;
  isLast: boolean;
}) {
  const { theme } = useThemeStore();
  const attended  = item.status === 'present' || item.status === 'late';
  const excused   = item.status === 'excused';

  const dotColor = attended ? theme.colors.primary
    : excused ? theme.colors.warning ?? '#C99432'
    : theme.colors.textSubtle;

  const event   = item.events;
  const dateStr = event?.start_time
    ? new Date(event.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
  const timeStr = event?.start_time
    ? new Date(event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';

  return (
    <View style={[
      styles.historyRow,
      !isLast && { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    ]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text size="sm" weight="medium">{event?.title ?? '—'}</Text>
        <Text size="xs" color={theme.colors.textMuted}>{dateStr}{timeStr ? ` · ${timeStr}` : ''}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <View style={[styles.attendedDot, { backgroundColor: dotColor }]} />
        {excused && (
          <Text size="xs" color={theme.colors.textMuted}>Excused</Text>
        )}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StatusScreen() {
  const { theme }    = useThemeStore();
  const { width }    = useWindowDimensions();
  const insets       = useSafeAreaInsets();
  const isWide       = width >= 800;
  const { profile, membership, organization } = useAuthStore();

  const [term, setTerm]             = useState<AcademicTerm | null>(null);
  const [records, setRecords]       = useState<AttendanceRecord[]>([]);
  const [totalMandatory, setTotal]  = useState(0);
  const [weeksLeft, setWeeksLeft]   = useState(0);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const orgId  = organization?.id;
  const userId = profile?.id;

  const load = useCallback(async () => {
    if (!orgId || !userId) { setLoading(false); return; }

    // 1. Active term
    const { data: termData } = await supabase
      .from('academic_terms')
      .select('id, name, start_date, end_date')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .single();

    setTerm(termData ?? null);

    // 2. Weeks remaining in term
    if (termData) {
      const end  = new Date(termData.end_date);
      const now  = new Date();
      const ms   = end.getTime() - now.getTime();
      setWeeksLeft(Math.max(0, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000))));
    }

    // 3. Attendance records for this user, joined with event details
    const { data: attendanceData } = await supabase
      .from('event_attendance')
      .select('id, status, checked_in_at, events(id, title, type, start_time)')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (attendanceData) setRecords(attendanceData as AttendanceRecord[]);

    // 4. Total mandatory events in the term (for denominator)
    if (termData) {
      const { count } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('type', 'mandatory')
        .eq('is_deleted', false)
        .gte('start_time', `${termData.start_date}T00:00:00Z`)
        .lte('start_time', `${termData.end_date}T23:59:59Z`);

      setTotal(count ?? 0);
    }

    setLoading(false);
    setRefreshing(false);
  }, [orgId, userId]);

  useEffect(() => { load(); }, [load]);

  function onRefresh() { setRefreshing(true); load(); }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const attended      = records.filter((r) => r.status === 'present' || r.status === 'late').length;
  const excused       = records.filter((r) => r.status === 'excused').length;
  const pct           = totalMandatory > 0 ? Math.round((attended / totalMandatory) * 100) : 0;
  const termLabel     = term?.name ?? 'Current term';

  // Stat cards derived from records
  const mandatoryRecs = records.filter((r) => r.events?.type === 'mandatory');
  const socialRecs    = records.filter((r) => r.events?.type === 'social');
  const mandPct       = mandatoryRecs.length > 0 ? Math.round((mandatoryRecs.filter((r) => r.status === 'present').length / mandatoryRecs.length) * 100) : 0;
  const socialPct     = socialRecs.length > 0    ? Math.round((socialRecs.filter((r) => r.status === 'present').length / socialRecs.length) * 100) : 0;

  const STAT_CARDS = [
    {
      label: 'Meetings',
      value: totalMandatory > 0 ? `${attended}/${totalMandatory}` : `${attended}`,
      pct: mandPct,
    },
    {
      label: 'Excused',
      value: `${excused}`,
      pct: totalMandatory > 0 ? Math.round((excused / totalMandatory) * 100) : 0,
    },
    {
      label: 'Socials',
      value: `${socialRecs.filter((r) => r.status === 'present').length}/${socialRecs.length}`,
      pct: socialPct,
    },
  ];

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  // ── Desktop ──
  if (isWide) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.widePad}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        <View style={styles.wideTitleRow}>
          <View>
            <Text size="h1" weight="bold">Status</Text>
            <Text size="sm" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
              {termLabel}{weeksLeft > 0 ? ` · ${weeksLeft} week${weeksLeft !== 1 ? 's' : ''} remaining` : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Submit excuse" size="sm" onPress={() => {}} />
          </View>
        </View>

        <View style={styles.wideContent}>
          <Card style={[styles.donutCard, { alignItems: 'center', gap: 16 }]}>
            <Text size="xs" weight="medium" color={theme.colors.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              Attendance
            </Text>
            <DonutChart percent={pct} size={200} strokeWidth={22} sublabel={termLabel} />
            <Text size="sm" color={theme.colors.textMuted}>
              {attended} of {totalMandatory} meetings attended
            </Text>
          </Card>

          <View style={{ flex: 1, gap: 16 }}>
            <View style={styles.statRow}>
              {STAT_CARDS.map((s) => (
                <StatCard key={s.label} label={s.label} value={s.value} pct={s.pct} />
              ))}
            </View>

            <Card style={{ paddingVertical: 8 }}>
              <View style={styles.historyHeader}>
                <Text size="xs" weight="medium" color={theme.colors.textMuted}
                  style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                  Event History
                </Text>
              </View>
              {records.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                  <Ionicons name="calendar-outline" size={28} color={theme.colors.textSubtle} />
                  <Text size="sm" color={theme.colors.textMuted}>No attendance records yet</Text>
                </View>
              ) : records.map((item, i) => (
                <HistoryRow key={item.id} item={item} isLast={i === records.length - 1} />
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
    >
      <View style={styles.mobileTitleRow}>
        <Text size="h1" weight="bold">Status</Text>
        <Button label="Submit excuse" size="sm" onPress={() => {}} />
      </View>

      <View style={styles.mobileDonut}>
        <DonutChart percent={pct} size={180} strokeWidth={20} />
        <Text size="sm" color={theme.colors.textMuted} style={{ marginTop: 12, textAlign: 'center' }}>
          {attended} of {totalMandatory} meetings attended · {termLabel}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
        style={{ marginHorizontal: -16, paddingHorizontal: 16 }}>
        {STAT_CARDS.map((s) => (
          <Card key={s.label} style={styles.miniStatCard}>
            <Text size="xs" color={theme.colors.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              {s.label}
            </Text>
            <Text size="xl" weight="bold">{s.value}</Text>
            <View style={[styles.barTrack, { backgroundColor: theme.colors.surfaceAlt, marginTop: 8 }]}>
              <View style={[styles.barFill, { width: `${s.pct}%` as any, backgroundColor: theme.colors.primary }]} />
            </View>
          </Card>
        ))}
      </ScrollView>

      <Text size="xs" weight="medium" color={theme.colors.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 12 }}>
        History
      </Text>

      {records.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
          <Ionicons name="calendar-outline" size={28} color={theme.colors.textSubtle} />
          <Text size="sm" color={theme.colors.textMuted}>No attendance records yet</Text>
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {records.map((item, i) => (
            <HistoryRow key={item.id} item={item} isLast={i === records.length - 1} />
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  widePad:      { padding: 32 },
  wideTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  wideContent:  { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  donutCard:    { width: 280, paddingVertical: 28 },
  statRow:      { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  historyHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, paddingBottom: 10, borderBottomWidth: 1 },
  mobilePad:      { paddingHorizontal: 16 },
  mobileTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  mobileDonut:    { alignItems: 'center', marginBottom: 24 },
  miniStatCard:   { width: 140, paddingVertical: 16 },
  statCard:    { flex: 1, minWidth: 120 },
  barTrack:    { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill:     { height: '100%', borderRadius: 2 },
  historyRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, gap: 12 },
  attendedDot: { width: 12, height: 12, borderRadius: 6 },
});
