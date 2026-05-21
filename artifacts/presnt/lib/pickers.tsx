/**
 * lib/pickers.tsx
 *
 * Cross-platform date & time picker primitives.
 *
 * DatePickerModal       — single-date picker (bottom sheet mobile / popover web)
 * DateRangePickerModal  — range picker with presets (full-screen mobile / dialog web)
 * TimePickerModal       — Hour / Minute / AM·PM wheel columns (all platforms)
 *
 * Utilities: formatDateDisplay, formatTimeDisplay, combineDateTime, formatDateRange
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

// ─── Calendar helpers ─────────────────────────────────────────────────────────

const MONTHS_LONG  = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
                      'Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW_LETTERS  = ['S','M','T','W','T','F','S'];

export type CalCell = { day: number; month: number; year: number; overflow: boolean };

/** Midnight timestamp for a CalCell or Date */
function cellTs(c: CalCell | Date): number {
  if (c instanceof Date) return new Date(c.getFullYear(), c.getMonth(), c.getDate()).getTime();
  return new Date(c.year, c.month, c.day).getTime();
}

export function buildCalendar(year: number, month: number): CalCell[] {
  const firstDay   = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevYear   = month === 0 ? year - 1 : year;
  const prevMonth  = month === 0 ? 11 : month - 1;
  const daysInPrev = new Date(prevYear, prevMonth + 1, 0).getDate();
  const nextYear   = month === 11 ? year + 1 : year;
  const nextMonth  = month === 11 ? 0 : month + 1;

  const cells: CalCell[] = [];
  for (let i = firstDay - 1; i >= 0; i--)
    cells.push({ day: daysInPrev - i, month: prevMonth, year: prevYear, overflow: true });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ day: d, month, year, overflow: false });
  let nextDay = 1;
  while (cells.length % 7 !== 0)
    cells.push({ day: nextDay++, month: nextMonth, year: nextYear, overflow: true });
  return cells;
}

// ─── Shared CalendarGrid ──────────────────────────────────────────────────────

/**
 * rangeStart / rangeEnd — if provided, days between them are highlighted.
 * selectedTs — single-day selection timestamp (used when no range).
 */
function CalendarGrid({
  year, month, selectedTs, rangeStart, rangeEnd,
  onDayPress, onPrevMonth, onNextMonth,
}: {
  year: number; month: number;
  selectedTs?: number;
  rangeStart?: number; rangeEnd?: number;
  onDayPress:  (cell: CalCell) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const { theme } = useThemeStore();
  const c     = theme.colors;
  const cells = useMemo(() => buildCalendar(year, month), [year, month]);
  const today = new Date();
  const todayTs = cellTs(today);

  return (
    <View>
      {/* Month header */}
      <View style={cg.monthRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[cg.monthTitle, { color: c.text }]}>{MONTHS_LONG[month]} {year}</Text>
          <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 1 }}>▾</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable onPress={onPrevMonth}
            style={[cg.navBtn, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
            <Text style={[cg.navArrow, { color: c.text }]}>‹</Text>
          </Pressable>
          <Pressable onPress={onNextMonth}
            style={[cg.navBtn, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
            <Text style={[cg.navArrow, { color: c.text }]}>›</Text>
          </Pressable>
        </View>
      </View>

      {/* DOW header */}
      <View style={cg.weekRow}>
        {DOW_LETTERS.map((l, i) => (
          <View key={i} style={cg.dayCell}>
            <Text style={[cg.dowLetter, { color: c.textMuted }]}>{l}</Text>
          </View>
        ))}
      </View>

      {/* Date grid */}
      {Array.from({ length: cells.length / 7 }).map((_, wi) => (
        <View key={wi} style={cg.weekRow}>
          {cells.slice(wi * 7, wi * 7 + 7).map((cell, di) => {
            const ts         = cellTs(cell);
            const isStart    = rangeStart !== undefined && ts === rangeStart;
            const isEnd      = rangeEnd   !== undefined && ts === rangeEnd;
            const inRange    = rangeStart !== undefined && rangeEnd !== undefined
                               && ts > rangeStart && ts < rangeEnd;
            const isSingle   = selectedTs !== undefined && ts === selectedTs && !rangeStart;
            const isSelected = isStart || isEnd || isSingle;
            const isToday    = ts === todayTs;

            // Range highlight background spans full cell width
            const rangeBg = inRange
              ? c.primary + '22'
              : (isStart && rangeEnd) || (isEnd && rangeStart)
                ? c.primary + '22'
                : undefined;

            return (
              <Pressable key={di} style={[cg.dayCell, rangeBg ? { backgroundColor: rangeBg } : undefined]}
                onPress={() => onDayPress(cell)}>
                <View style={[
                  cg.dayInner,
                  isSelected ? { backgroundColor: c.primary, borderRadius: 999 } : undefined,
                  !isSelected && isToday ? { borderWidth: 1.5, borderColor: c.primary, borderRadius: 999 } : undefined,
                ]}>
                  <Text style={cg.dayNum}
                    color={
                      isSelected ? '#fff'
                      : isToday ? c.primary
                      : inRange ? c.primary
                      : cell.overflow ? c.textSubtle
                      : c.text
                    }
                    weight={isSelected || isToday ? 'bold' : 'regular'}
                  >
                    {cell.day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const CELL_SIZE = 44;
const cg = StyleSheet.create({
  monthRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  monthTitle:{ fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  navBtn:    { width: 32, height: 32, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  navArrow:  { fontSize: 18, lineHeight: 22, marginTop: -1 },
  weekRow:   { flexDirection: 'row' },
  dayCell:   { flex: 1, height: CELL_SIZE, alignItems: 'center', justifyContent: 'center' },
  dayInner:  { width: CELL_SIZE - 6, height: CELL_SIZE - 6, alignItems: 'center', justifyContent: 'center' },
  dowLetter: { fontSize: 13, fontWeight: '500' },
  dayNum:    { fontSize: 15 },
});

// ─── Single-date picker — Mobile ─────────────────────────────────────────────

function MobileDatePicker({ visible, value, onConfirm, onClose }: {
  visible: boolean; value: Date;
  onConfirm: (d: Date) => void; onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [year, setYear]   = useState(value.getFullYear());
  const [month, setMonth] = useState(value.getMonth());
  const [day, setDay]     = useState(value.getDate());

  useEffect(() => {
    if (visible) { setYear(value.getFullYear()); setMonth(value.getMonth()); setDay(value.getDate()); }
  }, [visible, value]);

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  const ts = useMemo(() => new Date(year, month, day).getTime(), [year, month, day]);

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <Pressable style={mb.overlay} onPress={onClose}>
        <Pressable style={[mb.sheet, { backgroundColor: c.surface }]} onPress={e => e.stopPropagation()}>
          <View style={[mb.handle, { backgroundColor: c.border }]} />
          <View style={mb.header}>
            <Pressable onPress={onClose} style={mb.headerBtn}>
              <Text style={[mb.headerCancel, { color: c.textMuted }]}>CANCEL</Text>
            </Pressable>
            <Text style={[mb.headerTitle, { color: c.text }]}>Pick a date</Text>
            <Pressable onPress={() => onConfirm(new Date(year, month, day))} style={mb.headerBtn}>
              <Text style={[mb.headerAction, { color: c.primary }]}>DONE</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            <CalendarGrid year={year} month={month} selectedTs={ts}
              onDayPress={cell => { setDay(cell.day); setMonth(cell.month); setYear(cell.year); }}
              onPrevMonth={prevMonth} onNextMonth={nextMonth} />
          </ScrollView>
          <View style={{ paddingHorizontal: 20, paddingBottom: 36, paddingTop: 8 }}>
            <Pressable onPress={() => onConfirm(new Date(year, month, day))}
              style={[mb.confirmBtn, { backgroundColor: c.primary }]}>
              <Text style={mb.confirmLabel}>Confirm · {MONTHS_SHORT[month]} {day}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Single-date picker — Web popover ────────────────────────────────────────

function WebDatePicker({ visible, value, onConfirm, onClose }: {
  visible: boolean; value: Date;
  onConfirm: (d: Date) => void; onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [year, setYear]   = useState(value.getFullYear());
  const [month, setMonth] = useState(value.getMonth());
  const [day, setDay]     = useState(value.getDate());

  useEffect(() => {
    if (visible) { setYear(value.getFullYear()); setMonth(value.getMonth()); setDay(value.getDate()); }
  }, [visible, value]);

  useEffect(() => {
    if (!visible) return;
    function handleClick(e: MouseEvent) {
      const el = document.getElementById('date-picker-popover');
      if (el && !el.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [visible, onClose]);

  if (!visible) return null;

  const ts = new Date(year, month, day).getTime();

  return (
    <View nativeID="date-picker-popover"
      style={[wb.popover, { backgroundColor: c.surface, borderColor: c.border,
        // @ts-ignore
        boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
      }]}>
      <CalendarGrid year={year} month={month} selectedTs={ts}
        onDayPress={cell => {
          setDay(cell.day); setMonth(cell.month); setYear(cell.year);
          onConfirm(new Date(cell.year, cell.month, cell.day));
        }}
        onPrevMonth={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}
        onNextMonth={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}
      />
    </View>
  );
}

const wb = StyleSheet.create({
  popover: { position: 'absolute', top: '100%' as any, left: 0, zIndex: 9999,
             borderWidth: 1, borderRadius: 16, padding: 20, marginTop: 6, width: 360 },
});

// ─── Public DatePickerModal ───────────────────────────────────────────────────

export function DatePickerModal({ visible, value, onConfirm, onClose }: {
  visible: boolean; value: Date;
  onConfirm: (date: Date) => void; onClose: () => void;
}) {
  if (Platform.OS === 'web') {
    return <WebDatePicker visible={visible} value={value}
      onConfirm={d => { onConfirm(d); onClose(); }} onClose={onClose} />;
  }
  return <MobileDatePicker visible={visible} value={value}
    onConfirm={d => { onConfirm(d); onClose(); }} onClose={onClose} />;
}

// ─── Range presets ────────────────────────────────────────────────────────────

export type DateRange = { start: Date; end: Date };

type Preset = { label: string; getRange: () => DateRange };

function getPresets(): Preset[] {
  const now     = new Date();
  const today   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow     = today.getDay(); // 0=Sun

  return [
    {
      label: 'Today',
      getRange: () => ({ start: today, end: today }),
    },
    {
      label: 'This week',
      getRange: () => {
        const start = new Date(today); start.setDate(today.getDate() - dow);
        const end   = new Date(start); end.setDate(start.getDate() + 6);
        return { start, end };
      },
    },
    {
      label: 'Next 7 days',
      getRange: () => {
        const end = new Date(today); end.setDate(today.getDate() + 6);
        return { start: today, end };
      },
    },
    {
      label: 'This month',
      getRange: () => {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return { start, end };
      },
    },
    {
      label: 'Next 30 days',
      getRange: () => {
        const end = new Date(today); end.setDate(today.getDate() + 29);
        return { start: today, end };
      },
    },
    { label: 'Custom', getRange: () => ({ start: today, end: today }) },
  ];
}

function daysBetween(a: Date, b: Date) {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 86400000) + 1;
}

// ─── DateRangePickerModal — Mobile (full screen) ──────────────────────────────

function MobileDateRangePicker({ visible, value, onConfirm, onClose }: {
  visible: boolean; value: DateRange;
  onConfirm: (r: DateRange) => void; onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const presets = useMemo(() => getPresets(), []);

  const [start,        setStart]        = useState<Date>(value.start);
  const [end,          setEnd]          = useState<Date>(value.end);
  const [pickingStart, setPickingStart] = useState(true); // which end is active
  const [activePreset, setActivePreset] = useState<string>('Custom');
  const [year, setYear]   = useState(value.start.getFullYear());
  const [month, setMonth] = useState(value.start.getMonth());

  useEffect(() => {
    if (visible) {
      setStart(value.start); setEnd(value.end); setPickingStart(true);
      setYear(value.start.getFullYear()); setMonth(value.start.getMonth());
      setActivePreset('Custom');
    }
  }, [visible, value]);

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  function handleDayPress(cell: CalCell) {
    const date = new Date(cell.year, cell.month, cell.day);
    setActivePreset('Custom');
    if (pickingStart) {
      setStart(date);
      if (date > end) setEnd(date);
      setPickingStart(false);
    } else {
      if (date < start) { setEnd(start); setStart(date); }
      else setEnd(date);
      setPickingStart(true);
    }
  }

  function applyPreset(p: Preset) {
    const r = p.getRange();
    setStart(r.start); setEnd(r.end);
    setYear(r.start.getFullYear()); setMonth(r.start.getMonth());
    setActivePreset(p.label); setPickingStart(true);
  }

  const startTs = cellTs(start);
  const endTs   = cellTs(end);
  const days    = daysBetween(start, end);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.background }}>

        {/* Header */}
        <View style={[rm.header, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
          <Pressable onPress={onClose} style={rm.backBtn}>
            <Text style={[rm.backLabel, { color: c.text }]}>← BACK</Text>
          </Pressable>
          <Text style={[rm.title, { color: c.text }]}>Select range</Text>
          <Pressable onPress={() => { setStart(value.start); setEnd(value.end); setActivePreset('Custom'); }}>
            <Text style={[rm.clearLabel, { color: c.textMuted }]}>CLEAR</Text>
          </Pressable>
        </View>

        {/* START / END chips */}
        <View style={[rm.chipRow, { backgroundColor: c.surface }]}>
          <Pressable
            onPress={() => setPickingStart(true)}
            style={[rm.chip, { borderColor: pickingStart ? c.primary : c.border,
              borderWidth: pickingStart ? 1.5 : 1, borderStyle: 'solid' as const }]}>
            <Text style={[rm.chipLabel, { color: c.textMuted }]}>START</Text>
            <Text style={[rm.chipDate, { color: c.text }]}>
              {MONTHS_SHORT[start.getMonth()]} {start.getDate()}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setPickingStart(false)}
            style={[rm.chip, { borderColor: !pickingStart ? c.primary : c.border,
              borderWidth: !pickingStart ? 1.5 : 1, borderStyle: 'dashed' as const }]}>
            <Text style={[rm.chipLabel, { color: c.textMuted }]}>END</Text>
            <Text style={[rm.chipDate, { color: c.text }]}>
              {MONTHS_SHORT[end.getMonth()]} {end.getDate()}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}>
          <CalendarGrid year={year} month={month}
            rangeStart={startTs} rangeEnd={endTs}
            onDayPress={handleDayPress}
            onPrevMonth={prevMonth} onNextMonth={nextMonth} />

          {/* Preset chips */}
          <View style={rm.presetRow}>
            {presets.map(p => {
              const active = activePreset === p.label;
              return (
                <Pressable key={p.label} onPress={() => applyPreset(p)}
                  style={[rm.presetChip, {
                    borderColor: active ? c.primary : c.border,
                    backgroundColor: active ? c.primary + '18' : 'transparent',
                  }]}>
                  <Text size="sm" color={active ? c.primary : c.text} weight={active ? 'medium' : 'regular'}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Apply button */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 36, paddingTop: 8 }}>
          <Pressable onPress={() => onConfirm({ start, end })}
            style={[rm.applyBtn, { backgroundColor: c.primary }]}>
            <Text style={rm.applyLabel}>Apply range · {days} {days === 1 ? 'day' : 'days'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── DateRangePickerModal — Web (dialog) ──────────────────────────────────────

function WebDateRangePicker({ visible, value, onConfirm, onClose }: {
  visible: boolean; value: DateRange;
  onConfirm: (r: DateRange) => void; onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const presets = useMemo(() => getPresets(), []);

  const [start,        setStart]        = useState<Date>(value.start);
  const [end,          setEnd]          = useState<Date>(value.end);
  const [pickingStart, setPickingStart] = useState(true);
  const [activePreset, setActivePreset] = useState<string>('Custom');
  // Left calendar month
  const [lYear, setLYear]   = useState(value.start.getFullYear());
  const [lMonth, setLMonth] = useState(value.start.getMonth());

  // Right calendar = left + 1 month
  const rMonth = (lMonth + 1) % 12;
  const rYear  = lMonth === 11 ? lYear + 1 : lYear;

  useEffect(() => {
    if (visible) {
      setStart(value.start); setEnd(value.end); setPickingStart(true);
      setLYear(value.start.getFullYear()); setLMonth(value.start.getMonth());
      setActivePreset('Custom');
    }
  }, [visible, value]);

  function handleDayPress(cell: CalCell) {
    const date = new Date(cell.year, cell.month, cell.day);
    setActivePreset('Custom');
    if (pickingStart) {
      setStart(date);
      if (date > end) setEnd(date);
      setPickingStart(false);
    } else {
      if (date < start) { setEnd(start); setStart(date); }
      else setEnd(date);
      setPickingStart(true);
    }
  }

  function applyPreset(p: Preset) {
    const r = p.getRange();
    setStart(r.start); setEnd(r.end);
    setLYear(r.start.getFullYear()); setLMonth(r.start.getMonth());
    setActivePreset(p.label); setPickingStart(true);
  }

  function prevLeft() { if (lMonth === 0) { setLMonth(11); setLYear(y => y - 1); } else setLMonth(m => m - 1); }
  function nextLeft() { if (lMonth === 11) { setLMonth(0); setLYear(y => y + 1); } else setLMonth(m => m + 1); }

  if (!visible) return null;

  const startTs = cellTs(start);
  const endTs   = cellTs(end);

  return (
    <Modal visible={visible} animationType="fade" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <Pressable style={wd.overlay} onPress={onClose}>
        <Pressable style={[wd.dialog, { backgroundColor: c.surface, borderColor: c.border,
          // @ts-ignore
          boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
        }]} onPress={e => e.stopPropagation()}>

          {/* FROM / TO inputs */}
          <View style={wd.fromToRow}>
            <View style={{ flex: 1 }}>
              <Text style={[wd.fromToLabel, { color: c.textMuted }]}>FROM</Text>
              <Pressable onPress={() => setPickingStart(true)}
                style={[wd.fromToBox, { borderColor: pickingStart ? c.primary : c.border }]}>
                <Text style={[wd.fromToDate, { color: c.text }]}>
                  {MONTHS_SHORT[start.getMonth()]} {start.getDate()}, {start.getFullYear()}
                </Text>
              </Pressable>
            </View>
            <Text style={{ color: c.textMuted, fontSize: 18, marginTop: 24, paddingHorizontal: 8 }}>→</Text>
            <View style={{ flex: 1 }}>
              <Text style={[wd.fromToLabel, { color: c.textMuted }]}>TO</Text>
              <Pressable onPress={() => setPickingStart(false)}
                style={[wd.fromToBox, { borderColor: !pickingStart ? c.primary : c.border }]}>
                <Text style={[wd.fromToDate, { color: c.text }]}>
                  {MONTHS_SHORT[end.getMonth()]} {end.getDate()}, {end.getFullYear()}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Presets + dual calendars */}
          <View style={[wd.body, { borderColor: c.border }]}>
            {/* Presets sidebar */}
            <View style={[wd.sidebar, { borderRightColor: c.border }]}>
              <Text style={[wd.presetsLabel, { color: c.textMuted }]}>PRESETS</Text>
              {presets.map(p => {
                const active = activePreset === p.label;
                return (
                  <Pressable key={p.label} onPress={() => applyPreset(p)}
                    style={[wd.sidebarItem, active && { backgroundColor: c.primary + '18' }]}>
                    <Text size="sm" color={active ? c.primary : c.text} weight={active ? 'medium' : 'regular'}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Dual calendar */}
            <View style={wd.calendars}>
              <View style={{ flex: 1 }}>
                <CalendarGrid year={lYear} month={lMonth}
                  rangeStart={startTs} rangeEnd={endTs}
                  onDayPress={handleDayPress}
                  onPrevMonth={prevLeft} onNextMonth={nextLeft} />
              </View>
              <View style={[wd.calDivider, { backgroundColor: c.border }]} />
              <View style={{ flex: 1 }}>
                <CalendarGrid year={rYear} month={rMonth}
                  rangeStart={startTs} rangeEnd={endTs}
                  onDayPress={handleDayPress}
                  onPrevMonth={prevLeft} onNextMonth={nextLeft} />
              </View>
            </View>
          </View>

          {/* Footer */}
          <View style={wd.footer}>
            <Pressable onPress={onClose}
              style={[wd.cancelBtn, { borderColor: c.border }]}>
              <Text size="sm" weight="medium" color={c.text}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => { onConfirm({ start, end }); onClose(); }}
              style={[wd.applyBtn, { backgroundColor: c.primary }]}>
              <Text style={rm.applyLabel}>Apply range</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Public DateRangePickerModal ──────────────────────────────────────────────

export function DateRangePickerModal({ visible, value, onConfirm, onClose }: {
  visible:   boolean;
  value:     DateRange;
  onConfirm: (range: DateRange) => void;
  onClose:   () => void;
}) {
  if (Platform.OS === 'web') {
    return <WebDateRangePicker visible={visible} value={value}
      onConfirm={r => { onConfirm(r); onClose(); }} onClose={onClose} />;
  }
  return <MobileDateRangePicker visible={visible} value={value}
    onConfirm={r => { onConfirm(r); onClose(); }} onClose={onClose} />;
}

// ─── Shared styles: mobile sheet header ──────────────────────────────────────

const mb = StyleSheet.create({
  overlay:      { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' },
  handle:       { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 2 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  headerBtn:    { minWidth: 60 },
  headerCancel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  headerTitle:  { fontSize: 17, fontWeight: '700' },
  headerAction: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textAlign: 'right' },
  confirmBtn:   { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  confirmLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ─── Range picker styles ──────────────────────────────────────────────────────

const rm = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  backBtn:     { minWidth: 70 },
  backLabel:   { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  title:       { fontSize: 17, fontWeight: '700' },
  clearLabel:  { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  chipRow:     { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  chip:        { flex: 1, borderRadius: 12, padding: 14 },
  chipLabel:   { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  chipDate:    { fontSize: 20, fontWeight: '700' },
  presetRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  presetChip:  { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  applyBtn:    { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  applyLabel:  { color: '#fff', fontSize: 16, fontWeight: '700' },
});

const wd = StyleSheet.create({
  overlay:      { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  dialog:       { width: 820, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  fromToRow:    { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 24, paddingBottom: 16 },
  fromToLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  fromToBox:    { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
  fromToDate:   { fontSize: 18, fontWeight: '600' },
  body:         { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1 },
  sidebar:      { width: 160, padding: 20, borderRightWidth: 1 },
  presetsLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 14 },
  sidebarItem:  { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 2 },
  calendars:    { flex: 1, flexDirection: 'row', padding: 20, gap: 0 },
  calDivider:   { width: 1, marginHorizontal: 20 },
  footer:       { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, padding: 20, paddingTop: 16 },
  cancelBtn:    { borderWidth: 1, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  applyBtn:     { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
});

// ─── Wheel column ─────────────────────────────────────────────────────────────

export function WheelColumn({ items, selectedIndex, onSelect, width = 80 }: {
  items: string[]; selectedIndex: number;
  onSelect: (index: number) => void; width?: number;
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
      <View pointerEvents="none" style={[wh.indicator, {
        top: ITEM_H * 2, height: ITEM_H,
        borderColor: c.primary + '55', backgroundColor: c.primary + '18',
      }]} />
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H} decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
          onSelect(Math.max(0, Math.min(idx, items.length - 1)));
        }}>
        {items.map((item, i) => (
          <Pressable key={i}
            onPress={() => { onSelect(i); scrollRef.current?.scrollTo({ y: i * ITEM_H, animated: true }); }}
            style={wh.item}>
            <Text size="md" weight={i === selectedIndex ? 'bold' : 'regular'}
              color={i === selectedIndex ? c.text : c.textSubtle}>{item}</Text>
          </Pressable>
        ))}
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

export function TimePickerModal({ visible, value, onConfirm, onClose }: {
  visible: boolean; value: Date;
  onConfirm: (date: Date) => void; onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  function toState(d: Date) {
    const h24 = d.getHours();
    return { hourIdx: (h24 % 12 || 12) - 1, minIdx: d.getMinutes(), periodIdx: h24 >= 12 ? 1 : 0 };
  }
  const [state, setState] = useState(() => toState(value));
  useEffect(() => { if (visible) setState(toState(value)); }, [visible, value]);

  function handleConfirm() {
    const h24 = (state.hourIdx + 1) % 12 + state.periodIdx * 12;
    const d   = new Date(value); d.setHours(h24, state.minIdx, 0, 0); onConfirm(d);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <Pressable style={tp.overlay} onPress={onClose}>
        <Pressable style={[tp.sheet, { backgroundColor: c.surface }]} onPress={e => e.stopPropagation()}>
          <View style={[tp.handle, { backgroundColor: c.border }]} />
          <View style={tp.header}>
            <Pressable onPress={onClose}>
              <Text style={[mb.headerCancel, { color: c.textMuted }]}>CANCEL</Text>
            </Pressable>
            <Text style={[mb.headerTitle, { color: c.text }]}>Select time</Text>
            <Pressable onPress={handleConfirm}>
              <Text style={[mb.headerAction, { color: c.primary }]}>SET TIME</Text>
            </Pressable>
          </View>
          <View style={tp.wheels}>
            <WheelColumn items={HOURS}   selectedIndex={state.hourIdx}   onSelect={i => setState(s => ({ ...s, hourIdx: i }))} />
            <Text size="xl" weight="bold" color={c.textMuted} style={{ alignSelf: 'center' }}>:</Text>
            <WheelColumn items={MINUTES} selectedIndex={state.minIdx}    onSelect={i => setState(s => ({ ...s, minIdx: i }))} />
            <WheelColumn items={PERIODS} selectedIndex={state.periodIdx} onSelect={i => setState(s => ({ ...s, periodIdx: i }))} width={64} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const tp = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle:  { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 2 },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  wheels:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 16, paddingBottom: 40 },
});

// ─── Utilities ────────────────────────────────────────────────────────────────

export function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTimeDisplay(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function combineDateTime(datePart: Date, timePart: Date): string {
  const combined = new Date(datePart);
  combined.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
  return combined.toISOString();
}

/** "Mar 14 – Mar 20, 2026" or "Mar 14 – Apr 2, 2026" */
export function formatDateRange(start: Date, end: Date): string {
  const sameYear  = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const sm = MONTHS_SHORT[start.getMonth()];
  const em = MONTHS_SHORT[end.getMonth()];
  if (sameMonth) return `${sm} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
  if (sameYear)  return `${sm} ${start.getDate()} – ${em} ${end.getDate()}, ${start.getFullYear()}`;
  return `${sm} ${start.getDate()}, ${start.getFullYear()} – ${em} ${end.getDate()}, ${end.getFullYear()}`;
}
