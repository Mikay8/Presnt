/**
 * lib/pickers.tsx
 *
 * Cross-platform date & time picker primitives.
 *
 * On iOS/Android — uses @react-native-community/datetimepicker (native spinner).
 * On web         — renders a simple styled scroll-list picker (no native sheet).
 *
 * Exports:
 *   <DatePickerModal>   — full-screen calendar day selector
 *   <TimePickerModal>   — hour + minute + AM/PM wheel picker
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Text } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

// ─── Shared sheet wrapper ────────────────────────────────────────────────────

function PickerSheet({
  visible,
  onClose,
  title,
  children,
  onConfirm,
}: {
  visible:   boolean;
  onClose:   () => void;
  title:     string;
  children:  React.ReactNode;
  onConfirm: () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable style={ps.overlay} onPress={onClose}>
        <Pressable
          style={[ps.sheet, { backgroundColor: c.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[ps.handle, { backgroundColor: c.border }]} />

          <View style={ps.header}>
            <Pressable onPress={onClose}>
              <Text size="sm" color={c.textMuted}>Cancel</Text>
            </Pressable>
            <Text size="md" weight="bold">{title}</Text>
            <Pressable onPress={onConfirm}>
              <Text size="sm" weight="bold" color={c.primary}>Done</Text>
            </Pressable>
          </View>

          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const ps = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 },
  handle:  { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
});

// ─── Calendar grid ──────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function buildCalendar(year: number, month: number) {
  // month is 0-indexed
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DatePickerModal({
  visible,
  value,
  onConfirm,
  onClose,
}: {
  visible:   boolean;
  value:     Date;
  onConfirm: (date: Date) => void;
  onClose:   () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const [year,  setYear]  = useState(value.getFullYear());
  const [month, setMonth] = useState(value.getMonth());
  const [day,   setDay]   = useState(value.getDate());

  useEffect(() => {
    if (visible) {
      setYear(value.getFullYear());
      setMonth(value.getMonth());
      setDay(value.getDate());
    }
  }, [visible, value]);

  const cells  = useMemo(() => buildCalendar(year, month), [year, month]);
  const today  = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function handleConfirm() {
    onConfirm(new Date(year, month, day));
  }

  return (
    <PickerSheet visible={visible} onClose={onClose} title="Select date" onConfirm={handleConfirm}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        {/* Month nav */}
        <View style={cal.monthRow}>
          <Pressable onPress={prevMonth} style={cal.navBtn}>
            <Text size="lg" color={c.text}>‹</Text>
          </Pressable>
          <Text size="md" weight="bold">{MONTHS[month]} {year}</Text>
          <Pressable onPress={nextMonth} style={cal.navBtn}>
            <Text size="lg" color={c.text}>›</Text>
          </Pressable>
        </View>

        {/* Day-of-week headers */}
        <View style={cal.row}>
          {DOW.map(d => (
            <Text key={d} size="xs" weight="medium" color={c.textMuted}
              style={cal.dowCell}>{d}</Text>
          ))}
        </View>

        {/* Weeks */}
        {Array.from({ length: cells.length / 7 }).map((_, wi) => (
          <View key={wi} style={cal.row}>
            {cells.slice(wi * 7, wi * 7 + 7).map((d, di) => {
              if (!d) return <View key={di} style={cal.cell} />;
              const isSelected = d === day && month === value.getMonth() && year === value.getFullYear()
                ? true : d === day;
              const isToday    = d === todayD && month === todayM && year === todayY;
              return (
                <Pressable
                  key={di}
                  style={[cal.cell, isSelected && { backgroundColor: c.primary, borderRadius: 20 }]}
                  onPress={() => setDay(d)}
                >
                  <Text
                    size="sm"
                    weight={isSelected || isToday ? 'bold' : 'regular'}
                    color={isSelected ? '#fff' : isToday ? c.primary : c.text}
                  >
                    {d}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}

        {/* Quick-jump to today */}
        <Pressable
          onPress={() => { setYear(todayY); setMonth(todayM); setDay(todayD); }}
          style={[cal.todayBtn, { borderColor: c.border }]}
        >
          <Text size="sm" weight="medium" color={c.textMuted}>Today</Text>
        </Pressable>
      </View>
    </PickerSheet>
  );
}

const cal = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn:   { padding: 8 },
  row:      { flexDirection: 'row' },
  cell:     { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dowCell:  { flex: 1, textAlign: 'center', paddingVertical: 6 },
  todayBtn: { marginTop: 12, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
});

// ─── Wheel column (shared between time + recurrence) ───────────────────────

function WheelColumn({
  items,
  selectedIndex,
  onSelect,
  width = 80,
}: {
  items:         string[];
  selectedIndex: number;
  onSelect:      (index: number) => void;
  width?:        number;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const ITEM_H = 44;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
  }, [selectedIndex]);

  return (
    <View style={{ width, overflow: 'hidden', height: ITEM_H * 5 }}>
      {/* Selection indicator */}
      <View
        pointerEvents="none"
        style={[
          wh.indicator,
          {
            top: ITEM_H * 2,
            height: ITEM_H,
            borderColor: c.primary + '55',
            backgroundColor: c.primary + '18',
          },
        ]}
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
          onSelect(Math.max(0, Math.min(idx, items.length - 1)));
        }}
      >
        {items.map((item, i) => {
          const selected = i === selectedIndex;
          return (
            <Pressable
              key={i}
              onPress={() => {
                onSelect(i);
                scrollRef.current?.scrollTo({ y: i * ITEM_H, animated: true });
              }}
              style={wh.item}
            >
              <Text
                size="md"
                weight={selected ? 'bold' : 'regular'}
                color={selected ? c.text : c.textSubtle}
              >
                {item}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const wh = StyleSheet.create({
  indicator: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderBottomWidth: 1, zIndex: 2 },
  item:      { height: 44, alignItems: 'center', justifyContent: 'center' },
});

// ─── Time Picker Modal ────────────────────────────────────────────────────────

const HOURS   = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
const PERIODS = ['AM', 'PM'];

export function TimePickerModal({
  visible,
  value,
  onConfirm,
  onClose,
}: {
  visible:   boolean;
  value:     Date;
  onConfirm: (date: Date) => void;
  onClose:   () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  function toState(d: Date) {
    const h24 = d.getHours();
    const period = h24 >= 12 ? 1 : 0;
    const h12    = h24 % 12 || 12;
    return { hourIdx: h12 - 1, minIdx: d.getMinutes(), periodIdx: period };
  }

  const [state, setState] = useState(() => toState(value));

  useEffect(() => {
    if (visible) setState(toState(value));
  }, [visible, value]);

  function handleConfirm() {
    const h24 = (state.hourIdx + 1) % 12 + state.periodIdx * 12;
    const d   = new Date(value);
    d.setHours(h24, state.minIdx, 0, 0);
    onConfirm(d);
  }

  return (
    <PickerSheet visible={visible} onClose={onClose} title="Select time" onConfirm={handleConfirm}>
      <View style={tp.row}>
        <WheelColumn
          items={HOURS}
          selectedIndex={state.hourIdx}
          onSelect={(i) => setState(s => ({ ...s, hourIdx: i }))}
        />
        <Text size="xl" weight="bold" color={c.textMuted} style={{ alignSelf: 'center' }}>:</Text>
        <WheelColumn
          items={MINUTES}
          selectedIndex={state.minIdx}
          onSelect={(i) => setState(s => ({ ...s, minIdx: i }))}
        />
        <WheelColumn
          items={PERIODS}
          selectedIndex={state.periodIdx}
          onSelect={(i) => setState(s => ({ ...s, periodIdx: i }))}
          width={64}
        />
      </View>
    </PickerSheet>
  );
}

const tp = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 16 },
});

// ─── Utility ─────────────────────────────────────────────────────────────────

/** Format a Date as "Mar 14, 2026" */
export function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Format a Date as "7:30 PM" */
export function formatTimeDisplay(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Combine a date-only Date and a time-only Date into one UTC ISO string */
export function combineDateTime(datePart: Date, timePart: Date): string {
  const combined = new Date(datePart);
  combined.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
  return combined.toISOString();
}
