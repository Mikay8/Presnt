/**
 * Demo Member — Calendar (read-only)
 *
 * Full calendar with month navigation and swipe.
 * Event pills and event rows are non-interactive (no navigation to event detail).
 * All Supabase calls are .select() only.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
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

type EventType = 'mandatory' | 'social' | 'optional';

type CalEvent = {
  id:               string;
  title:            string;
  type:             EventType;
  start_time:       string;
  end_time:         string | null;
  location:         string | null;
  event_code:       string | null;
  is_occurrence:    boolean | null;
  parent_event_id:  string | null;
  recurrence_rule:  string | null;
  occurrences_horizon: string | null;
};

const MONTH_NAMES     = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
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
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function EventPill({ event }: { event: CalEvent }) {
  const { theme } = useThemeStore();
  const bg = event.type === 'social' ? theme.colors.surfaceAlt : theme.colors.primary;
  const fg = event.type === 'social' ? theme.colors.text : '#FFF';
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text size="xs" weight="medium" color={fg} numberOfLines={1}>
        {event.title}
        {event.start_time
          ? ` · ${new Date(event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
          : ''}
      </Text>
    </View>
  );
}

export default function DemoMemberCalendarScreen() {
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
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const orgId = organization?.id;

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    const start = new Date(year, month, 1).toISOString();
    const end   = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    const { data } = await supabase
      .from('events')
      .select('id, title, type, start_time, end_time, location, event_code, is_occurrence, parent_event_id, recurrence_rule, occurrences_horizon')
      .eq('org_id', orgId)
      .eq('is_deleted', false)
      .eq('is_cancelled', false)
      .or('recurrence_rule.is.null,is_occurrence.eq.true')
      .gte('start_time', start)
      .lte('start_time', end)
      .order('start_time');

    setEvents((data ?? []) as CalEvent[]);
    setLoading(false);
    setRefreshing(false);
  }, [orgId, year, month]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelectedDate(null); }, [year, month]);

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

  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) return null;
    return eventsByDate[dateKey(selectedDate)] ?? [];
  }, [selectedDate, eventsByDate]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return events.filter((ev) => {
      const start = new Date(ev.start_time);
      if (start >= now) return true;
      if (ev.end_time && new Date(ev.end_time) > now) return true;
      return false;
    });
  }, [events]);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else              { setMonth((m) => m - 1); }
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else               { setMonth((m) => m + 1); }
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gs) =>
      Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
    onPanResponderRelease: (_, gs) => {
      if (gs.dx < -50) nextMonth();
      else if (gs.dx > 50) prevMonth();
    },
  }), [month, year]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

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
              const evs = eventsByDate[dateKey(date)] ?? [];
              const todayBg = isToday(date) ? { backgroundColor: theme.colors.primary + '18' } : {};
              return (
                <View key={date.toISOString()} style={[styles.dayCell, { borderColor: theme.colors.border }, todayBg]}>
                  <Text size="sm"
                    weight={isToday(date) ? 'bold' : 'regular'}
                    color={isToday(date) ? theme.colors.primary : theme.colors.text}
                    style={{ marginBottom: 4 }}>
                    {date.getDate()}
                  </Text>
                  {evs.map((ev) => <EventPill key={ev.id} event={ev} />)}
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
    <View {...panResponder.panHandlers}>
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
            const evs  = eventsByDate[dateKey(date)] ?? [];
            const isT  = isToday(date);
            const isSel = selectedDate ? isSameDay(date, selectedDate) : false;
            return (
              <Pressable
                key={date.toISOString()}
                style={[
                  styles.mobileDayCell,
                  { width: CELL_SIZE, height: CELL_SIZE },
                  isT && !isSel && { backgroundColor: theme.colors.primary + '20', borderRadius: 8 },
                  isSel && { backgroundColor: theme.colors.primary, borderRadius: 8 },
                ]}
                onPress={() => setSelectedDate(isSel ? null : date)}
              >
                <Text size="sm" weight={isT || isSel ? 'bold' : 'regular'}
                  color={isSel ? '#FFF' : isT ? theme.colors.primary : theme.colors.text}>
                  {date.getDate()}
                </Text>
                {evs.length > 0 && (
                  <View style={[styles.eventDot, { backgroundColor: isSel ? '#FFF' : theme.colors.primary }]} />
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

  // ── Desktop ──
  if (isWide) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.widePad}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.primary} />}
      >
        <View style={styles.wideTitleRow}>
          <Text size="h1" weight="bold">Calendar</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {navHeader}
            <View style={[styles.viewToggle, { borderColor: theme.colors.border }]}>
              {(['Month', 'Week', 'List'] as const).map((v) => (
                <View key={v} style={[styles.viewToggleBtn, v === 'Month' && { backgroundColor: theme.colors.primary }]}>
                  <Text size="sm" weight="medium" color={v === 'Month' ? '#FFF' : theme.colors.text}>{v}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
        {desktopGrid}
      </ScrollView>
    );
  }

  // ── Mobile ──
  const sectionLabel = selectedDate
    ? `${MONTH_NAMES[selectedDate.getMonth()].slice(0, 3)} ${selectedDate.getDate()}`
    : 'Upcoming & Ongoing';
  const sectionEvents = selectedDate ? (selectedDayEvents ?? []) : upcomingEvents;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.mobilePad, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.primary} />}
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
        {sectionLabel}
      </Text>

      {sectionEvents.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
          <Ionicons name="calendar-outline" size={28} color={theme.colors.textSubtle} />
          <Text size="sm" color={theme.colors.textMuted}>
            {selectedDate ? 'No events on this day' : 'No upcoming or ongoing events'}
          </Text>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {sectionEvents.map((ev) => {
            const d = new Date(ev.start_time);
            return (
              <Card key={ev.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
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
              </Card>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

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
