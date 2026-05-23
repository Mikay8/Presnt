/**
 * Org Admin — Calendar
 *
 * Month-view calendar showing events across all chapters under the org,
 * plus org-wide events. Chapter filter bar at the top lets admins focus
 * on one chapter (+ org-wide events always shown).
 *
 * Desktop: grid calendar + month nav + chapter filter
 * Mobile:  compact cell grid + day/upcoming list + swipe to change month
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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

// ─── Types ────────────────────────────────────────────────────────────────────

type CalEvent = {
  id:               string;
  title:            string;
  type:             string;
  start_time:       string;
  end_time:         string | null;
  location:         string | null;
  is_occurrence:    boolean | null;
  parent_event_id:  string | null;
  recurrence_rule:  string | null;
  occurrences_horizon: string | null;
  org_id:           string;
  is_org_wide:      boolean | null;
};

type Chapter = {
  id:            string;
  name:          string;
  primary_color: string | null;
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

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ─── Event Pill ───────────────────────────────────────────────────────────────

function EventPill({ event, onPress, chapterColor }: { event: CalEvent; onPress: () => void; chapterColor?: string }) {
  const { theme } = useThemeStore();
  const isOrgWide = !!event.is_org_wide;
  // Org-wide events use blue, chapter events use chapter color or primary
  const bg = isOrgWide ? '#3B82F6' : (chapterColor ?? theme.colors.primary);
  return (
    <Pressable onPress={onPress} style={[styles.pill, { backgroundColor: bg }]}>
      <Text size="xs" weight="medium" style={{ color: '#FFF' }} numberOfLines={1}>
        {isOrgWide ? '🌐 ' : ''}{event.title}
        {event.start_time
          ? ` · ${new Date(event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
          : ''}
      </Text>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OrgAdminCalendarScreen() {
  const { theme }        = useThemeStore();
  const { width }        = useWindowDimensions();
  const insets           = useSafeAreaInsets();
  const isWide           = width >= 800;
  const { organization } = useAuthStore();
  const c                = theme.colors;

  const parentOrgId = organization?.id ?? '';

  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [chapters,      setChapters]      = useState<Chapter[]>([]);
  const [events,        setEvents]        = useState<CalEvent[]>([]);
  const [chapterFilter, setChapterFilter] = useState<string | null>(null); // null = All
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [selectedDate,  setSelectedDate]  = useState<Date | null>(null);

  // Build a map of chapterId → color for coloring pills
  const chapterColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ch of chapters) {
      if (ch.primary_color) map[ch.id] = ch.primary_color;
    }
    return map;
  }, [chapters]);

  const load = useCallback(async () => {
    if (!parentOrgId) { setLoading(false); return; }

    // First load chapters (do this once — they don't change month to month)
    const { data: chapterData } = await supabase
      .from('organizations')
      .select('id, name, primary_color')
      .eq('parent_org_id', parentOrgId)
      .eq('type', 'chapter')
      .order('name');

    const chaps = (chapterData ?? []) as Chapter[];
    setChapters(chaps);
    const chapterIds = chaps.map(c => c.id);

    const start = new Date(year, month, 1).toISOString();
    const end   = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    const allOrgIds = [parentOrgId, ...chapterIds];

    const { data } = await supabase
      .from('events')
      .select('id, title, type, start_time, end_time, location, is_occurrence, parent_event_id, recurrence_rule, occurrences_horizon, org_id, is_org_wide')
      .in('org_id', allOrgIds)
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
    const viewedEnd = new Date(year, month + 1, 0);
    const cutoff    = new Date(viewedEnd.getTime() + 90 * 24 * 3600 * 1000);
    const needsTopup = rows.some(ev =>
      ev.parent_event_id != null &&
      ev.occurrences_horizon != null &&
      new Date(ev.occurrences_horizon) < cutoff
    );
    if (needsTopup) {
      supabase.rpc('topup_recurring_events', { p_org_id: parentOrgId, lookahead_days: 90 }).then(() => {});
    }
  }, [parentOrgId, year, month]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelectedDate(null); }, [year, month]);

  const grid = useMemo(() => buildGrid(year, month), [year, month]);

  // Apply chapter filter: always show org-wide events, filter chapter events
  const visibleEvents = useMemo(() => {
    if (chapterFilter === null) return events;
    return events.filter(ev => !!ev.is_org_wide || ev.org_id === chapterFilter);
  }, [events, chapterFilter]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const ev of visibleEvents) {
      const k = dateKey(new Date(ev.start_time));
      if (!map[k]) map[k] = [];
      map[k].push(ev);
    }
    return map;
  }, [visibleEvents]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) return null;
    return eventsByDate[dateKey(selectedDate)] ?? [];
  }, [selectedDate, eventsByDate]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return visibleEvents.filter(ev => {
      const start = new Date(ev.start_time);
      if (start >= now) return true;
      if (ev.end_time && new Date(ev.end_time) > now) return true;
      return false;
    });
  }, [visibleEvents]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else              { setMonth(m => m - 1); }
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else               { setMonth(m => m + 1); }
  };

  function openEvent(ev: CalEvent) {
    router.push(`/(org-admin)/events-management` as any);
  }

  function onRefresh() { setRefreshing(true); load(); }

  // Swipe gesture
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
    onPanResponderRelease: (_, gs) => {
      if (gs.dx < -50) nextMonth();
      else if (gs.dx > 50) prevMonth();
    },
  }), [month, year]);

  // ── Chapter filter bar ─────────────────────────────────────────────────────
  const filterBar = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
      style={{ backgroundColor: c.background, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Pressable onPress={() => setChapterFilter(null)}
        style={[styles.filterChip, {
          backgroundColor: chapterFilter === null ? '#3B82F618' : c.surfaceAlt,
          borderColor:     chapterFilter === null ? '#3B82F6'   : c.border,
        }]}>
        <Ionicons name="globe-outline" size={12} color={chapterFilter === null ? '#3B82F6' : c.textSubtle} />
        <Text size="sm" weight={chapterFilter === null ? 'medium' : 'regular'}
          color={chapterFilter === null ? '#3B82F6' : c.textMuted}>All chapters</Text>
      </Pressable>
      {chapters.map(ch => {
        const active = chapterFilter === ch.id;
        const color  = ch.primary_color ?? '#3B82F6';
        return (
          <Pressable key={ch.id} onPress={() => setChapterFilter(active ? null : ch.id)}
            style={[styles.filterChip, {
              backgroundColor: active ? color + '18' : c.surfaceAlt,
              borderColor:     active ? color        : c.border,
            }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
            <Text size="sm" weight={active ? 'medium' : 'regular'} color={active ? color : c.textMuted}>
              {ch.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  // ── Desktop grid ──
  const desktopGrid = (
    <View style={[styles.gridWrapper, { borderColor: c.border }]}>
      <View style={styles.dayHeaderRow}>
        {DAY_LABELS_WIDE.map(d => (
          <View key={d} style={[styles.dayHeaderCell, { borderColor: c.border }]}>
            <Text size="xs" weight="medium" color={c.textSubtle}>{d}</Text>
          </View>
        ))}
      </View>
      <View>
        {Array.from({ length: Math.ceil(grid.length / 7) }).map((_, rowIdx) => (
          <View key={rowIdx} style={[styles.gridRow, { borderColor: c.border }]}>
            {grid.slice(rowIdx * 7, rowIdx * 7 + 7).map((date, colIdx) => {
              if (!date) return <View key={`blank-${rowIdx}-${colIdx}`} style={[styles.dayCell, { borderColor: c.border }]} />;
              const evs     = eventsByDate[dateKey(date)] ?? [];
              const todayBg = isToday(date) ? { backgroundColor: '#3B82F618' } : {};
              return (
                <View key={date.toISOString()} style={[styles.dayCell, { borderColor: c.border }, todayBg]}>
                  <Text size="sm" weight={isToday(date) ? 'bold' : 'regular'}
                    color={isToday(date) ? '#3B82F6' : c.text} style={{ marginBottom: 4 }}>
                    {date.getDate()}
                  </Text>
                  {evs.map(ev => (
                    <EventPill key={ev.id} event={ev} onPress={() => openEvent(ev)}
                      chapterColor={ev.org_id ? chapterColorMap[ev.org_id] : undefined} />
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
    <View {...panResponder.panHandlers}>
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
            if (!date) return <View key={`b-${rowIdx}-${colIdx}`} style={{ width: CELL_SIZE, height: CELL_SIZE }} />;
            const evs  = eventsByDate[dateKey(date)] ?? [];
            const isT  = isToday(date);
            const isSel = selectedDate ? isSameDay(date, selectedDate) : false;
            // Use chapter color for dot if showing single chapter
            const dotColor = chapterFilter && chapters.find(c => c.id === chapterFilter)?.primary_color
              ? (chapters.find(c => c.id === chapterFilter)?.primary_color ?? '#3B82F6')
              : '#3B82F6';
            return (
              <Pressable key={date.toISOString()}
                style={[
                  styles.mobileDayCell,
                  { width: CELL_SIZE, height: CELL_SIZE },
                  isT && !isSel && { backgroundColor: '#3B82F620', borderRadius: 8 },
                  isSel && { backgroundColor: '#3B82F6', borderRadius: 8 },
                ]}
                onPress={() => setSelectedDate(isSel ? null : date)}
              >
                <Text size="sm" weight={isT || isSel ? 'bold' : 'regular'}
                  color={isSel ? '#FFF' : isT ? '#3B82F6' : c.text}>
                  {date.getDate()}
                </Text>
                {evs.length > 0 && (
                  <View style={[styles.eventDot, { backgroundColor: isSel ? '#FFF' : dotColor }]} />
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
      <View style={{ flex: 1, backgroundColor: c.background }}>
        {filterBar}
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
                onPress={() => router.push('/(org-admin)/events-management' as any)}
                style={[styles.newBtn, { backgroundColor: '#3B82F6' }]}
              >
                <Text size="sm" weight="medium" style={{ color: '#fff' }}>+ New org-wide event</Text>
              </Pressable>
            </View>
          </View>

          {/* Legend */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: '#3B82F6' }} />
              <Text size="xs" color={c.textMuted}>Org-wide</Text>
            </View>
            {chapters.map(ch => (
              <View key={ch.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: ch.primary_color ?? c.primary }} />
                <Text size="xs" color={c.textMuted}>{ch.name}</Text>
              </View>
            ))}
          </View>

          {desktopGrid}
        </ScrollView>
      </View>
    );
  }

  // ── Mobile ──
  const sectionLabel = selectedDate
    ? `${MONTH_NAMES[selectedDate.getMonth()].slice(0, 3)} ${selectedDate.getDate()}`
    : 'Upcoming & Ongoing';
  const sectionEvents = selectedDate ? (selectedDayEvents ?? []) : upcomingEvents;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {filterBar}
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={[styles.mobilePad, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text size="h1" weight="bold">Calendar</Text>
          <Pressable
            onPress={() => router.push('/(org-admin)/events-management' as any)}
            style={[styles.newBtn, { backgroundColor: '#3B82F6' }]}
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
          {sectionLabel}
        </Text>

        {sectionEvents.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
            <Ionicons name="calendar-outline" size={28} color={c.textSubtle} />
            <Text size="sm" color={c.textMuted}>
              {selectedDate ? 'No events on this day' : 'No upcoming events'}
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            {sectionEvents.map(ev => {
              const d        = new Date(ev.start_time);
              const isOrgW   = !!ev.is_org_wide;
              const dotColor = isOrgW ? '#3B82F6' : (chapterColorMap[ev.org_id] ?? c.primary);
              return (
                <Pressable key={ev.id} onPress={() => openEvent(ev)}>
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <View style={[styles.upcomingIcon, { backgroundColor: dotColor + '20' }]}>
                      <Ionicons name={isOrgW ? 'globe-outline' : 'calendar-outline'} size={20} color={dotColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text size="md" weight="medium">{ev.title}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                        {isOrgW && (
                          <View style={{ backgroundColor: '#3B82F618', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Text size="xs" color="#3B82F6">Org Wide</Text>
                          </View>
                        )}
                        <Text size="sm" color={c.textMuted}>
                          {MONTH_NAMES[d.getMonth()].slice(0, 3)} {d.getDate()}
                          {` · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward-outline" size={16} color={c.textSubtle} />
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  filterRow:    { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6, gap: 8, alignItems: 'center' },
  filterChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },

  widePad:      { padding: 32 },
  wideTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  newBtn:       { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },

  gridWrapper:    { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  dayHeaderRow:   { flexDirection: 'row', borderBottomWidth: 1 },
  dayHeaderCell:  { flex: 1, alignItems: 'center', paddingVertical: 10, borderRightWidth: 1 },
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
