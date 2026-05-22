/**
 * Admin — Calendar
 *
 * Full month-view calendar showing all org events (non-recurring one-offs and
 * expanded occurrence rows). Tapping an event opens the Events management
 * screen. Admins can also tap "+ New event" to create one.
 *
 * Desktop: grid calendar + month nav
 * Mobile:  compact cell grid + upcoming list
 */

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

import { Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type CalEvent = {
  id:               string;
  title:            string;
  type:             string;
  start_time:       string;
  location:         string | null;
  is_occurrence:    boolean | null;
  parent_event_id:  string | null;
  recurrence_rule:  string | null;
  occurrences_horizon: string | null;
};

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

export default function AdminCalendarScreen() {
  const { theme }        = useThemeStore();
  const { width }        = useWindowDimensions();
  const insets           = useSafeAreaInsets();
  const isWide           = width >= 800;
  const { organization } = useAuthStore();
  const c                = theme.colors;

  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents]         = useState<CalEvent[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const orgId = organization?.id;

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    const start = new Date(year, month, 1).toISOString();
    const end   = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    const { data } = await supabase
      .from('events')
      .select('id, title, type, start_time, location, is_occurrence, parent_event_id, recurrence_rule, occurrences_horizon')
      .eq('org_id', orgId)
      .eq('is_deleted', false)
      .eq('is_cancelled', false)
      .or('recurrence_rule.is.null,is_occurrence.eq.true')
      .gte('start_time', start)
      .lte('start_time', end)
      .order('start_time');

    const rows = (data ?? []) as CalEvent[];
    setEvents(rows);
    setLoading(false);
    setRefreshing(false);

    // Top-up recurring occurrences if horizon is approaching
    const viewedEnd  = new Date(year, month + 1, 0);
    const cutoff     = new Date(viewedEnd.getTime() + 90 * 24 * 3600 * 1000);
    const needsTopup = rows.some(ev =>
      ev.parent_event_id != null &&
      ev.occurrences_horizon != null &&
      new Date(ev.occurrences_horizon) < cutoff
    );
    if (needsTopup) {
      supabase.rpc('topup_recurring_events', { p_org_id: orgId, lookahead_days: 90 }).then(() => {});
    }
  }, [orgId, year, month]);

  useEffect(() => { load(); }, [load]);

  const grid = useMemo(() => buildGrid(year, month), [year, month]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const ev of events) {
      const k = dateKey(new Date(ev.start_time));
      if (!map[k]) map[k] = [];
      map[k].push(ev);
    }
    return map;
  }, [events]);

  const upcomingEvents = useMemo(() => {
    return events.filter((ev) => new Date(ev.start_time) >= today).slice(0, 5);
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

  function openEvent(ev: CalEvent) {
    router.push(`/(admin)/events-management/${ev.id}` as any);
  }

  // ── Desktop grid ──
  const desktopGrid = (
    <View style={[styles.gridWrapper, { borderColor: c.border }]}>
      <View style={styles.dayHeaderRow}>
        {DAY_LABELS_WIDE.map((d) => (
          <View key={d} style={[styles.dayHeaderCell, { borderColor: c.border }]}>
            <Text size="xs" weight="medium" color={c.textSubtle}>{d}</Text>
          </View>
        ))}
      </View>
      <View style={styles.gridRows}>
        {Array.from({ length: Math.ceil(grid.length / 7) }).map((_, rowIdx) => (
          <View key={rowIdx} style={[styles.gridRow, { borderColor: c.border }]}>
            {grid.slice(rowIdx * 7, rowIdx * 7 + 7).map((date, colIdx) => {
              if (!date) {
                return <View key={`blank-${rowIdx}-${colIdx}`} style={[styles.dayCell, { borderColor: c.border }]} />;
              }
              const evs     = eventsByDate[dateKey(date)] ?? [];
              const todayBg = isToday(date) ? { backgroundColor: c.primary + '18' } : {};
              return (
                <View key={date.toISOString()} style={[styles.dayCell, { borderColor: c.border }, todayBg]}>
                  <Text size="sm"
                    weight={isToday(date) ? 'bold' : 'regular'}
                    color={isToday(date) ? c.primary : c.text}
                    style={{ marginBottom: 4 }}>
                    {date.getDate()}
                  </Text>
                  {evs.map((ev) => (
                    <EventPill key={ev.id} event={ev} onPress={() => openEvent(ev)} />
                  ))}
                </View>
              );
            })}
            {Array.from({ length: 7 - grid.slice(rowIdx * 7, rowIdx * 7 + 7).length }).map((_, i) => (
              <View key={`pad-${i}`} style={[styles.dayCell, { borderColor: c.border }]} />
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
            <Text size="xs" color={c.textSubtle}>{d}</Text>
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
                  isT && { backgroundColor: c.primary + '20', borderRadius: 8 },
                ]}
                onPress={() => {
                  if (evs.length === 1) openEvent(evs[0]);
                }}
              >
                <Text size="sm" weight={isT ? 'bold' : 'regular'}
                  color={isT ? c.primary : c.text}>
                  {date.getDate()}
                </Text>
                {evs.length > 0 && (
                  <View style={[styles.eventDot, { backgroundColor: c.primary }]} />
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
      <Pressable onPress={prevMonth} style={[styles.navBtn, { borderColor: c.border }]}>
        <Ionicons name="chevron-back-outline" size={16} color={c.text} />
      </Pressable>
      <Text size="md" weight="medium" style={{ minWidth: 140, textAlign: 'center' }}>
        {MONTH_NAMES[month]} {year}
      </Text>
      <Pressable onPress={nextMonth} style={[styles.navBtn, { borderColor: c.border }]}>
        <Ionicons name="chevron-forward-outline" size={16} color={c.text} />
      </Pressable>
    </View>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  // ── Desktop ──
  if (isWide) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={styles.widePad}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        <View style={styles.wideTitleRow}>
          <Text size="h1" weight="bold">Calendar</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {navHeader}
            <Pressable
              onPress={() => router.push('/(admin)/events-management' as any)}
              style={[styles.newBtn, { backgroundColor: c.primary }]}
            >
              <Text size="sm" weight="medium" style={{ color: '#fff' }}>+ New event</Text>
            </Pressable>
          </View>
        </View>
        {desktopGrid}
      </ScrollView>
    );
  }

  // ── Mobile ──
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={[styles.mobilePad, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text size="h1" weight="bold">Calendar</Text>
        <Pressable
          onPress={() => router.push('/(admin)/events-management' as any)}
          style={[styles.newBtn, { backgroundColor: c.primary }]}
        >
          <Text size="sm" weight="medium" style={{ color: '#fff' }}>+ New event</Text>
        </Pressable>
      </View>

      <View style={[styles.mobileNavRow, { borderColor: c.border }]}>
        <Pressable onPress={prevMonth}><Ionicons name="chevron-back-outline" size={20} color={c.text} /></Pressable>
        <Text size="md" weight="medium">{MONTH_NAMES[month]} {year}</Text>
        <Pressable onPress={nextMonth}><Ionicons name="chevron-forward-outline" size={20} color={c.text} /></Pressable>
      </View>
      {mobileGrid}

      <Text size="xs" weight="medium" color={c.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 28, marginBottom: 12 }}>
        Upcoming
      </Text>

      {upcomingEvents.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
          <Ionicons name="calendar-outline" size={28} color={c.textSubtle} />
          <Text size="sm" color={c.textMuted}>No upcoming events</Text>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {upcomingEvents.map((ev) => {
            const d = new Date(ev.start_time);
            return (
              <Pressable key={ev.id} onPress={() => openEvent(ev)}>
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={[styles.upcomingIcon, { backgroundColor: c.primary + '20' }]}>
                    <Ionicons name="calendar-outline" size={20} color={c.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text size="md" weight="medium">{ev.title}</Text>
                    <Text size="sm" color={c.textMuted}>
                      {MONTH_NAMES[d.getMonth()].slice(0, 3)} {d.getDate()}
                      {` · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward-outline" size={16} color={c.textSubtle} />
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
  newBtn:       { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  gridWrapper:    { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  dayHeaderRow:   { flexDirection: 'row', borderBottomWidth: 1 },
  dayHeaderCell:  { flex: 1, alignItems: 'center', paddingVertical: 10, borderRightWidth: 1 },
  gridRows:       {},
  gridRow:        { flexDirection: 'row', borderTopWidth: 1 },
  dayCell:        { flex: 1, minHeight: 100, padding: 8, borderRightWidth: 1, gap: 4 },
  pill:           { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  navHeader:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn:         { width: 32, height: 32, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  mobilePad:         { paddingHorizontal: 16 },
  mobileNavRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, marginBottom: 8 },
  mobileDayHeaderRow:{ flexDirection: 'row' },
  mobileDayCell:     { alignItems: 'center', justifyContent: 'center', gap: 3 },
  eventDot:          { width: 5, height: 5, borderRadius: 3 },
  upcomingIcon:      { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
