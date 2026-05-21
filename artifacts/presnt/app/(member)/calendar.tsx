import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

// ─── Types & data ─────────────────────────────────────────────────────────────

type EventType = 'mandatory' | 'social' | 'optional';

interface CalEvent {
  id:    string;
  title: string;
  type:  EventType;
  time?: string;
}

// Key format: YYYY-M-D (no zero-pad so it's easy to construct)
const EVENTS: Record<string, CalEvent[]> = {
  '2026-5-10': [{ id: 'e1', title: 'Chapter Meeting',     type: 'mandatory', time: '7:00 PM' }],
  '2026-5-13': [{ id: 'e2', title: 'Philanthropy Event',  type: 'mandatory', time: '3:00 PM' }],
  '2026-5-17': [{ id: 'e3', title: 'Spring Formal',       type: 'social',    time: '8:00 PM' }],
  '2026-5-19': [{ id: 'e4', title: 'Risk Mgmt Training',  type: 'mandatory', time: '6:00 PM' }],
  '2026-5-23': [{ id: 'e5', title: 'Community Service',   type: 'optional',  time: '10:00 AM' }],
  '2026-5-26': [{ id: 'e6', title: 'Social Event',        type: 'social',    time: '7:00 PM' }],
  '2026-6-2':  [{ id: 'e7', title: 'End of Year Banquet', type: 'social',    time: '6:30 PM' }],
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS_WIDE   = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY_LABELS_MOBILE = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ─── Calendar helpers ─────────────────────────────────────────────────────────

function buildGrid(year: number, month: number): (Date | null)[] {
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++)  grid.push(new Date(year, month, d));
  return grid;
}

function eventsForDate(date: Date): CalEvent[] {
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  return EVENTS[key] ?? [];
}

function isToday(date: Date): boolean {
  const t = new Date();
  return (
    date.getFullYear() === t.getFullYear() &&
    date.getMonth()    === t.getMonth()    &&
    date.getDate()     === t.getDate()
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EventPill({
  event,
  onPress,
}: {
  event: CalEvent;
  onPress: () => void;
}) {
  const { theme } = useThemeStore();
  const bg = event.type === 'social' ? theme.colors.surfaceAlt : theme.colors.primary;
  const fg = event.type === 'social' ? theme.colors.text : '#FFF';
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, { backgroundColor: bg }]}
    >
      <Text size="xs" weight="medium" color={fg} numberOfLines={1}>
        {event.title}
        {event.time ? ` · ${event.time.replace(':00', '')}` : ''}
      </Text>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { theme } = useThemeStore();
  const { width } = useWindowDimensions();
  const insets    = useSafeAreaInsets();
  const isWide    = width >= 800;

  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const grid = useMemo(() => buildGrid(year, month), [year, month]);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else              { setMonth((m) => m - 1); }
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else               { setMonth((m) => m + 1); }
  };

  // Upcoming events in this month (from today or from month start)
  const upcomingEvents = useMemo(() => {
    return Object.entries(EVENTS)
      .flatMap(([key, evs]) => {
        const [y, m, d] = key.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        if (date >= today) return evs.map((e) => ({ ...e, date }));
        return [];
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 5);
  }, []);

  // ── Desktop grid ──
  const desktopGrid = (
    <View style={[styles.gridWrapper, { borderColor: theme.colors.border }]}>
      {/* Day headers */}
      <View style={styles.dayHeaderRow}>
        {DAY_LABELS_WIDE.map((d) => (
          <View key={d} style={[styles.dayHeaderCell, { borderColor: theme.colors.border }]}>
            <Text size="xs" weight="medium" color={theme.colors.textSubtle}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Day cells */}
      <View style={styles.gridRows}>
        {Array.from({ length: Math.ceil(grid.length / 7) }).map((_, rowIdx) => (
          <View key={rowIdx} style={[styles.gridRow, { borderColor: theme.colors.border }]}>
            {grid.slice(rowIdx * 7, rowIdx * 7 + 7).map((date, colIdx) => {
              if (!date) {
                return (
                  <View
                    key={`blank-${rowIdx}-${colIdx}`}
                    style={[styles.dayCell, { borderColor: theme.colors.border }]}
                  />
                );
              }
              const evs        = eventsForDate(date);
              const todayStyle = isToday(date)
                ? { backgroundColor: theme.colors.primary + '18' }
                : {};
              return (
                <View
                  key={date.toISOString()}
                  style={[styles.dayCell, { borderColor: theme.colors.border }, todayStyle]}
                >
                  <Text
                    size="sm"
                    weight={isToday(date) ? 'bold' : 'regular'}
                    color={isToday(date) ? theme.colors.primary : theme.colors.text}
                    style={{ marginBottom: 4 }}
                  >
                    {date.getDate()}
                  </Text>
                  {evs.map((ev) => (
                    <EventPill
                      key={ev.id}
                      event={ev}
                      onPress={() => router.push(`/(member)/event/${ev.id}` as any)}
                    />
                  ))}
                </View>
              );
            })}
            {/* Pad remaining cells in last partial row */}
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
      {/* Day headers */}
      <View style={styles.mobileDayHeaderRow}>
        {DAY_LABELS_MOBILE.map((d, i) => (
          <View key={i} style={{ width: CELL_SIZE, alignItems: 'center', paddingVertical: 6 }}>
            <Text size="xs" color={theme.colors.textSubtle}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Cells */}
      {Array.from({ length: Math.ceil(grid.length / 7) }).map((_, rowIdx) => (
        <View key={rowIdx} style={{ flexDirection: 'row' }}>
          {grid.slice(rowIdx * 7, rowIdx * 7 + 7).map((date, colIdx) => {
            if (!date) {
              return <View key={`b-${rowIdx}-${colIdx}`} style={{ width: CELL_SIZE, height: CELL_SIZE }} />;
            }
            const evs    = eventsForDate(date);
            const isT    = isToday(date);
            return (
              <Pressable
                key={date.toISOString()}
                style={[
                  styles.mobileDayCell,
                  { width: CELL_SIZE, height: CELL_SIZE },
                  isT && { backgroundColor: theme.colors.primary + '20', borderRadius: 8 },
                ]}
                onPress={() => {
                  if (evs.length > 0) router.push(`/(member)/event/${evs[0].id}` as any);
                }}
              >
                <Text
                  size="sm"
                  weight={isT ? 'bold' : 'regular'}
                  color={isT ? theme.colors.primary : theme.colors.text}
                >
                  {date.getDate()}
                </Text>
                {evs.length > 0 && (
                  <View style={[styles.eventDot, { backgroundColor: theme.colors.primary }]} />
                )}
              </Pressable>
            );
          })}
          {/* Pad last row */}
          {Array.from({ length: 7 - grid.slice(rowIdx * 7, rowIdx * 7 + 7).length }).map((_, i) => (
            <View key={`p-${i}`} style={{ width: CELL_SIZE, height: CELL_SIZE }} />
          ))}
        </View>
      ))}
    </View>
  );

  // ── Shared nav header ──
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
      >
        {/* Page heading row */}
        <View style={styles.wideTitleRow}>
          <Text size="h1" weight="bold">Calendar</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {navHeader}
            {/* View toggles */}
            <View style={[styles.viewToggle, { borderColor: theme.colors.border }]}>
              {(['Month', 'Week', 'List'] as const).map((v) => (
                <Pressable
                  key={v}
                  style={[
                    styles.viewToggleBtn,
                    v === 'Month' && { backgroundColor: theme.colors.primary },
                  ]}
                >
                  <Text
                    size="sm"
                    weight="medium"
                    color={v === 'Month' ? '#FFF' : theme.colors.text}
                  >
                    {v}
                  </Text>
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
      contentContainerStyle={[
        styles.mobilePad,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text size="h1" weight="bold" style={{ marginBottom: 16 }}>Calendar</Text>

      {/* Nav */}
      <View style={[styles.mobileNavRow, { borderColor: theme.colors.border }]}>
        <Pressable onPress={prevMonth}>
          <Ionicons name="chevron-back-outline" size={20} color={theme.colors.text} />
        </Pressable>
        <Text size="md" weight="medium">{MONTH_NAMES[month]} {year}</Text>
        <Pressable onPress={nextMonth}>
          <Ionicons name="chevron-forward-outline" size={20} color={theme.colors.text} />
        </Pressable>
      </View>

      {mobileGrid}

      {/* Upcoming section */}
      <Text
        size="xs"
        weight="medium"
        color={theme.colors.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 28, marginBottom: 12 }}
      >
        Upcoming
      </Text>

      <View style={{ gap: 10 }}>
        {upcomingEvents.map((ev) => (
          <Pressable
            key={ev.id}
            onPress={() => router.push(`/(member)/event/${ev.id}` as any)}
          >
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={[styles.upcomingIcon, { backgroundColor: theme.colors.primary + '20' }]}>
                <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text size="md" weight="medium">{ev.title}</Text>
                <Text size="sm" color={theme.colors.textMuted}>
                  {MONTH_NAMES[ev.date.getMonth()].slice(0, 3)} {ev.date.getDate()}
                  {ev.time ? ` · ${ev.time}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={16} color={theme.colors.textSubtle} />
            </Card>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Desktop
  widePad:      { padding: 32 },
  wideTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },

  gridWrapper:    { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  dayHeaderRow:   { flexDirection: 'row', borderBottomWidth: 1 },
  dayHeaderCell:  { flex: 1, alignItems: 'center', paddingVertical: 10, borderRightWidth: 1 },
  gridRows:       {},
  gridRow:        { flexDirection: 'row', borderTopWidth: 1 },
  dayCell:        { flex: 1, minHeight: 100, padding: 8, borderRightWidth: 1, gap: 4 },

  pill: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },

  navHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn:     { width: 32, height: 32, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  viewToggle:    { flexDirection: 'row', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  viewToggleBtn: { paddingHorizontal: 14, paddingVertical: 8 },

  // Mobile
  mobilePad:         { paddingHorizontal: 16 },
  mobileNavRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, marginBottom: 8 },
  mobileDayHeaderRow:{ flexDirection: 'row' },
  mobileDayCell:     { alignItems: 'center', justifyContent: 'center', gap: 3 },
  eventDot:          { width: 5, height: 5, borderRadius: 3 },

  upcomingIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
