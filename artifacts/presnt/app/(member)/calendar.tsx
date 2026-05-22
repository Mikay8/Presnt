import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
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

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = 'mandatory' | 'social' | 'optional';

type CalEvent = {
  id:               string;
  title:            string;
  type:             EventType;
  start_time:       string;
  location:         string | null;
  event_code:       string | null;
  is_occurrence:    boolean | null;
  parent_event_id:  string | null;
  recurrence_rule:  string | null;
  occurrences_horizon: string | null;
};

/** Navigate to a member event using event_code slug when available, UUID otherwise. */
function eventSlug(ev: CalEvent) { return ev.event_code ?? ev.id; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES     = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS_WIDE = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const DAY_LABELS_MOB  = ['S','M','T','W','T','F','S'];

function buildGrid(year: number, month: number): (Date | null)[] {
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, month, d));
  return grid;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function isToday(d: Date) {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EventPill({ event, onPress }: { event: CalEvent; onPress: () => void }) {
  const { theme } = useThemeStore();
  const bg = event.type === 'social' ? theme.colors.surfaceAlt : theme.colors.primary;
  const fg = event.type === 'social' ? theme.colors.text : '#FFF';
  return (
    <Pressable onPress={onPress} style={[styles.pill, { backgroundColor: bg }]}>
      <Text size="xs" weight="medium" color={fg} numberOfLines={1}>
        {event.title}
        {event.start_time
          ? ` · ${new Date(event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
          : ''}
      </Text>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { theme }       = useThemeStore();
  const { width }       = useWindowDimensions();
  const insets          = useSafeAreaInsets();
  const isWide          = width >= 800;
  const { organization } = useAuthStore();

  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents]       = useState<CalEvent[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const orgId = organization?.id;

  // Fetch events for a month and trigger a top-up if any recurring series
  // horizon is within 90 days of the viewed month end.
  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    const start = new Date(year, month, 1).toISOString();
    const end   = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    const { data } = await supabase
      .from('events')
      .select('id, title, type, start_time, location, event_code, is_occurrence, parent_event_id, recurrence_rule, occurrences_horizon')
      .eq('org_id', orgId)
      .eq('is_deleted', false)
      .eq('is_cancelled', false)
      // Exclude master series rows (they have no start_time that maps to a calendar day).
      // Only show: non-recurring one-off events OR occurrence rows.
      .or('recurrence_rule.is.null,is_occurrence.eq.true')
      .gte('start_time', start)
      .lte('start_time', end)
      .order('start_time');

    const rows = (data ?? []) as CalEvent[];
    setEvents(rows);
    setLoading(false);
    setRefreshing(false);

    // Top-up recurring occurrences if the viewed month end is within 90 days
    // of any series horizon. Fire-and-forget — calendar refreshes on next nav.
    const viewedEnd  = new Date(year, month + 1, 0);
    const cutoff     = new Date(viewedEnd.getTime() + 90 * 24 * 3600 * 1000);
    const needsTopup = rows.some(ev =>
      ev.parent_event_id != null &&
      ev.occurrences_horizon != null &&
      new Date(ev.occurrences_horizon) < cutoff
    );
    if (needsTopup) {
      supabase.rpc('topup_recurring_events', { p_org_id: orgId, lookahead_days: 90 })
        .then(() => { /* occurrences repopulated — next load() will pick them up */ });
    }
  }, [orgId, year, month]);

  useEffect(() => { load(); }, [load]);

  const grid = useMemo(() => buildGrid(year, month), [year, month]);

  // Map date key → events
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const ev of events) {
      const k = dateKey(new Date(ev.start_time));
      if (!map[k]) map[k] = [];
      map[k].push(ev);
    }
    return map;
  }, [events]);

  // Upcoming events from today
  const upcomingEvents = useMemo(() => {
    return events
      .filter((ev) => new Date(ev.start_time) >= today)
      .slice(0, 5);
  }, [events]);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else              { setMonth((m) => m - 1); }
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else               { setMonth((m) => m + 1); }
  };

  function onRefresh() { setRefreshing(true); load(); }

  // ── Desktop grid ──
  const desktopGrid = (
    <View style={[styles.gridWrapper, { borderColor: theme.colors.border }]}>
      <View style={styles.dayHeaderRow}>
        {DAY_LABELS_WIDE.map((d) => (
          <View key={d} style={[styles.dayHeaderCell, { borderColor: theme.colors.border }]}>
            <Text size="xs" weight="medium" color={theme.colors.textSubtle}>{d}</Text>
          </View>
        ))}
      </View>
      <View style={styles.gridRows}>
        {Array.from({ length: Math.ceil(grid.length / 7) }).map((_, rowIdx) => (
          <View key={rowIdx} style={[styles.gridRow, { borderColor: theme.colors.border }]}>
            {grid.slice(rowIdx * 7, rowIdx * 7 + 7).map((date, colIdx) => {
              if (!date) {
                return <View key={`blank-${rowIdx}-${colIdx}`} style={[styles.dayCell, { borderColor: theme.colors.border }]} />;
              }
              const evs      = eventsByDate[dateKey(date)] ?? [];
              const todayBg  = isToday(date) ? { backgroundColor: theme.colors.primary + '18' } : {};
              return (
                <View key={date.toISOString()} style={[styles.dayCell, { borderColor: theme.colors.border }, todayBg]}>
                  <Text size="sm"
                    weight={isToday(date) ? 'bold' : 'regular'}
                    color={isToday(date) ? theme.colors.primary : theme.colors.text}
                    style={{ marginBottom: 4 }}>
                    {date.getDate()}
                  </Text>
                  {evs.map((ev) => (
                    <EventPill key={ev.id} event={ev} onPress={() => router.push(`/(member)/event/${eventSlug(ev)}` as any)} />
                  ))}
                </View>
              );
            })}
            {Array.from({ length: 7 - grid.slice(rowIdx * 7, rowIdx * 7 + 7).length }).map((_, i) => (
              <View key={`pad-${i}`} style={[styles.dayCell, { borderColor: theme.colors.border }]} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );

  // ── Mobile grid ──
  const CELL_SIZE = Math.floor((width - 32) / 7);
  const mobileGrid = (
    <View>
      <View style={styles.mobileDayHeaderRow}>
        {DAY_LABELS_MOB.map((d, i) => (
          <View key={i} style={{ width: CELL_SIZE, alignItems: 'center', paddingVertical: 6 }}>
            <Text size="xs" color={theme.colors.textSubtle}>{d}</Text>
          </View>
        ))}
      </View>
      {Array.from({ length: Math.ceil(grid.length / 7) }).map((_, rowIdx) => (
        <View key={rowIdx} style={{ flexDirection: 'row' }}>
          {grid.slice(rowIdx * 7, rowIdx * 7 + 7).map((date, colIdx) => {
            if (!date) {
              return <View key={`b-${rowIdx}-${colIdx}`} style={{ width: CELL_SIZE, height: CELL_SIZE }} />;
            }
            const evs = eventsByDate[dateKey(date)] ?? [];
            const isT = isToday(date);
            return (
              <Pressable
                key={date.toISOString()}
                style={[
                  styles.mobileDayCell,
                  { width: CELL_SIZE, height: CELL_SIZE },
                  isT && { backgroundColor: theme.colors.primary + '20', borderRadius: 8 },
                ]}
                onPress={() => {
                  if (evs.length === 1) router.push(`/(member)/event/${eventSlug(evs[0])}` as any);
                }}
              >
                <Text size="sm" weight={isT ? 'bold' : 'regular'}
                  color={isT ? theme.colors.primary : theme.colors.text}>
                  {date.getDate()}
                </Text>
                {evs.length > 0 && (
                  <View style={[styles.eventDot, { backgroundColor: theme.colors.primary }]} />
                )}
              </Pressable>
            );
          })}
          {Array.from({ length: 7 - grid.slice(rowIdx * 7, rowIdx * 7 + 7).length }).map((_, i) => (
            <View key={`p-${i}`} style={{ width: CELL_SIZE, height: CELL_SIZE }} />
          ))}
        </View>
      ))}
    </View>
  );

  const navHeader = (
    <View style={styles.navHeader}>
      <Pressable onPress={prevMonth} style={[styles.navBtn, { borderColor: theme.colors.border }]}>
        <Ionicons name="chevron-back-outline" size={16} color={theme.colors.text} />
      </Pressable>
      <Text size="md" weight="medium" style={{ minWidth: 140, textAlign: 'center' }}>
        {MONTH_NAMES[month]} {year}
      </Text>
      <Pressable onPress={nextMonth} style={[styles.navBtn, { borderColor: theme.colors.border }]}>
        <Ionicons name="chevron-forward-outline" size={16} color={theme.colors.text} />
      </Pressable>
    </View>
  );

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
          <Text size="h1" weight="bold">Calendar</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {navHeader}
            <View style={[styles.viewToggle, { borderColor: theme.colors.border }]}>
              {(['Month', 'Week', 'List'] as const).map((v) => (
                <Pressable key={v}
                  style={[styles.viewToggleBtn, v === 'Month' && { backgroundColor: theme.colors.primary }]}>
                  <Text size="sm" weight="medium" color={v === 'Month' ? '#FFF' : theme.colors.text}>{v}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
        {desktopGrid}
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
      <Text size="h1" weight="bold" style={{ marginBottom: 16 }}>Calendar</Text>
      <View style={[styles.mobileNavRow, { borderColor: theme.colors.border }]}>
        <Pressable onPress={prevMonth}><Ionicons name="chevron-back-outline" size={20} color={theme.colors.text} /></Pressable>
        <Text size="md" weight="medium">{MONTH_NAMES[month]} {year}</Text>
        <Pressable onPress={nextMonth}><Ionicons name="chevron-forward-outline" size={20} color={theme.colors.text} /></Pressable>
      </View>
      {mobileGrid}

      <Text size="xs" weight="medium" color={theme.colors.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 28, marginBottom: 12 }}>
        Upcoming
      </Text>

      {upcomingEvents.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
          <Ionicons name="calendar-outline" size={28} color={theme.colors.textSubtle} />
          <Text size="sm" color={theme.colors.textMuted}>No upcoming events</Text>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {upcomingEvents.map((ev) => {
            const d = new Date(ev.start_time);
            return (
              <Pressable key={ev.id} onPress={() => router.push(`/(member)/event/${eventSlug(ev)}` as any)}>
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={[styles.upcomingIcon, { backgroundColor: theme.colors.primary + '20' }]}>
                    <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text size="md" weight="medium">{ev.title}</Text>
                    <Text size="sm" color={theme.colors.textMuted}>
                      {MONTH_NAMES[d.getMonth()].slice(0, 3)} {d.getDate()}
                      {` · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward-outline" size={16} color={theme.colors.textSubtle} />
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  widePad:      { padding: 32 },
  wideTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  gridWrapper:    { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  dayHeaderRow:   { flexDirection: 'row', borderBottomWidth: 1 },
  dayHeaderCell:  { flex: 1, alignItems: 'center', paddingVertical: 10, borderRightWidth: 1 },
  gridRows:       {},
  gridRow:        { flexDirection: 'row', borderTopWidth: 1 },
  dayCell:        { flex: 1, minHeight: 100, padding: 8, borderRightWidth: 1, gap: 4 },
  pill:           { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  navHeader:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn:         { width: 32, height: 32, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  viewToggle:     { flexDirection: 'row', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  viewToggleBtn:  { paddingHorizontal: 14, paddingVertical: 8 },
  mobilePad:         { paddingHorizontal: 16 },
  mobileNavRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, marginBottom: 8 },
  mobileDayHeaderRow:{ flexDirection: 'row' },
  mobileDayCell:     { alignItems: 'center', justifyContent: 'center', gap: 3 },
  eventDot:          { width: 5, height: 5, borderRadius: 3 },
  upcomingIcon:      { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
