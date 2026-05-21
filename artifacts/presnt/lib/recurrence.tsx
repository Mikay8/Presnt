/**
 * lib/recurrence.tsx
 *
 * Advanced recurrence picker for events.
 *
 * Supported patterns:
 *   - Every week on <day(s)>
 *   - Every other week on <day(s)>
 *   - Every N weeks on <day(s)>
 *   - Every 1st/2nd/3rd/4th/Last <weekday> of the month
 *   - Every month on day <N>
 *   - Custom (manual RRULE string)
 *
 * The picker encodes the rule as a human-readable object (RecurrenceRule)
 * and also produces an RFC 5545 RRULE string for storage.
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Text } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecurrenceFreq =
  | 'none'
  | 'weekly'
  | 'biweekly'
  | 'nweekly'        // every N weeks
  | 'monthly_day'    // same date each month (e.g. 14th)
  | 'monthly_nth'    // Nth weekday of month (e.g. first Monday)
  | 'custom';

export type RecurrenceRule = {
  freq:        RecurrenceFreq;
  days:        number[];  // 0=Sun … 6=Sat; used by weekly/biweekly/nweekly
  nWeeks:      number;    // for nweekly
  monthDay:    number;    // 1–31 for monthly_day
  nthWeek:     number;    // 1–5 (1=first, 5=last) for monthly_nth
  nthWeekDay:  number;    // 0–6 for monthly_nth
  rrule:       string;    // raw RRULE string for custom
  endType:     'never' | 'after' | 'on';
  endCount:    number;    // occurrences for 'after'
  endDate:     string;    // ISO date string for 'on'
};

export const BLANK_RULE: RecurrenceRule = {
  freq: 'none', days: [], nWeeks: 2,
  monthDay: 1, nthWeek: 1, nthWeekDay: 1,
  rrule: '',
  endType: 'never', endCount: 10, endDate: '',
};

const DAY_NAMES  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_LONG   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const NTH_LABELS = ['','First','Second','Third','Fourth','Last'];

// ─── RRULE builder ────────────────────────────────────────────────────────────

const BY_DAY = ['SU','MO','TU','WE','TH','FR','SA'];

export function buildRRule(rule: RecurrenceRule): string | null {
  if (rule.freq === 'none')   return null;
  if (rule.freq === 'custom') return rule.rrule || null;

  const parts: string[] = [];
  let interval = 1;

  if (rule.freq === 'weekly') {
    parts.push('FREQ=WEEKLY');
    if (rule.days.length) parts.push(`BYDAY=${rule.days.map(d => BY_DAY[d]).join(',')}`);
  } else if (rule.freq === 'biweekly') {
    parts.push('FREQ=WEEKLY;INTERVAL=2');
    if (rule.days.length) parts.push(`BYDAY=${rule.days.map(d => BY_DAY[d]).join(',')}`);
  } else if (rule.freq === 'nweekly') {
    parts.push(`FREQ=WEEKLY;INTERVAL=${rule.nWeeks}`);
    if (rule.days.length) parts.push(`BYDAY=${rule.days.map(d => BY_DAY[d]).join(',')}`);
  } else if (rule.freq === 'monthly_day') {
    parts.push(`FREQ=MONTHLY;BYMONTHDAY=${rule.monthDay}`);
  } else if (rule.freq === 'monthly_nth') {
    const n  = rule.nthWeek === 5 ? -1 : rule.nthWeek;
    const dy = BY_DAY[rule.nthWeekDay];
    parts.push(`FREQ=MONTHLY;BYDAY=${n}${dy}`);
  }

  if (rule.endType === 'after')  parts.push(`COUNT=${rule.endCount}`);
  if (rule.endType === 'on' && rule.endDate) {
    const d = rule.endDate.replace(/-/g, '');
    parts.push(`UNTIL=${d}T235959Z`);
  }

  return 'RRULE:' + parts.join(';');
}

/** Human-readable summary, e.g. "Every other Friday" */
export function describeRule(rule: RecurrenceRule): string {
  if (rule.freq === 'none') return 'Does not repeat';
  if (rule.freq === 'custom') return rule.rrule ? 'Custom recurrence' : 'Does not repeat';

  const dayList = rule.days.map(d => DAY_LONG[d]).join(', ');

  if (rule.freq === 'weekly') {
    return `Every week${dayList ? ' on ' + dayList : ''}`;
  }
  if (rule.freq === 'biweekly') {
    return `Every other week${dayList ? ' on ' + dayList : ''}`;
  }
  if (rule.freq === 'nweekly') {
    return `Every ${rule.nWeeks} weeks${dayList ? ' on ' + dayList : ''}`;
  }
  if (rule.freq === 'monthly_day') {
    return `Monthly on day ${rule.monthDay}`;
  }
  if (rule.freq === 'monthly_nth') {
    return `${NTH_LABELS[rule.nthWeek] ?? ''} ${DAY_LONG[rule.nthWeekDay]} of the month`;
  }
  return 'Does not repeat';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToggleChip({
  label,
  selected,
  onPress,
}: {
  label:    string;
  selected: boolean;
  onPress:  () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  return (
    <Pressable
      onPress={onPress}
      style={[
        rc.chip,
        selected
          ? { backgroundColor: c.primary, borderColor: c.primary }
          : { backgroundColor: 'transparent', borderColor: c.border },
      ]}
    >
      <Text size="xs" weight={selected ? 'bold' : 'regular'} color={selected ? '#fff' : c.textMuted}>
        {label}
      </Text>
    </Pressable>
  );
}

function RadioRow({
  label,
  selected,
  onPress,
}: {
  label:    string;
  selected: boolean;
  onPress:  () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  return (
    <Pressable onPress={onPress} style={rc.radioRow}>
      <View style={[rc.radio, { borderColor: selected ? c.primary : c.border }]}>
        {selected && <View style={[rc.radioDot, { backgroundColor: c.primary }]} />}
      </View>
      <Text size="sm" color={c.text}>{label}</Text>
    </Pressable>
  );
}

function StepperRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label:    string;
  value:    number;
  min:      number;
  max:      number;
  onChange: (v: number) => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  return (
    <View style={rc.stepperRow}>
      <Text size="sm" color={c.text} style={{ flex: 1 }}>{label}</Text>
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        style={[rc.stepBtn, { borderColor: c.border }]}
      >
        <Text size="md" color={c.text}>−</Text>
      </Pressable>
      <Text size="sm" weight="bold" color={c.text} style={{ minWidth: 28, textAlign: 'center' }}>
        {value}
      </Text>
      <Pressable
        onPress={() => onChange(Math.min(max, value + 1))}
        style={[rc.stepBtn, { borderColor: c.border }]}
      >
        <Text size="md" color={c.text}>+</Text>
      </Pressable>
    </View>
  );
}

function NthSelector({
  nthWeek,
  nthWeekDay,
  onChangeWeek,
  onChangeDay,
}: {
  nthWeek:      number;
  nthWeekDay:   number;
  onChangeWeek: (n: number) => void;
  onChangeDay:  (n: number) => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  return (
    <View style={{ marginTop: 12 }}>
      <Text size="xs" weight="medium" color={c.textMuted} style={rc.fieldLabel}>OCCURRENCE</Text>
      <View style={rc.chipRow}>
        {[1,2,3,4,5].map(n => (
          <ToggleChip
            key={n}
            label={NTH_LABELS[n]}
            selected={nthWeek === n}
            onPress={() => onChangeWeek(n)}
          />
        ))}
      </View>
      <Text size="xs" weight="medium" color={c.textMuted} style={[rc.fieldLabel, { marginTop: 12 }]}>DAY</Text>
      <View style={rc.chipRow}>
        {DAY_NAMES.map((d, i) => (
          <ToggleChip
            key={i}
            label={d}
            selected={nthWeekDay === i}
            onPress={() => onChangeDay(i)}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Main RecurrencePickerModal ───────────────────────────────────────────────

export function RecurrencePickerModal({
  visible,
  value,
  onConfirm,
  onClose,
}: {
  visible:   boolean;
  value:     RecurrenceRule;
  onConfirm: (rule: RecurrenceRule) => void;
  onClose:   () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const [rule, setRule] = useState<RecurrenceRule>(value);

  useEffect(() => {
    if (visible) setRule(value);
  }, [visible, value]);

  const set = <K extends keyof RecurrenceRule>(k: K) =>
    (v: RecurrenceRule[K]) => setRule(r => ({ ...r, [k]: v }));

  function toggleDay(d: number) {
    setRule(r => ({
      ...r,
      days: r.days.includes(d) ? r.days.filter(x => x !== d) : [...r.days, d].sort(),
    }));
  }

  const FREQ_OPTIONS: { value: RecurrenceFreq; label: string }[] = [
    { value: 'none',        label: 'Does not repeat' },
    { value: 'weekly',      label: 'Every week' },
    { value: 'biweekly',    label: 'Every other week' },
    { value: 'nweekly',     label: 'Every N weeks' },
    { value: 'monthly_day', label: 'Monthly — same date' },
    { value: 'monthly_nth', label: 'Monthly — Nth weekday' },
    { value: 'custom',      label: 'Custom (RRULE)' },
  ];

  const showDays = ['weekly','biweekly','nweekly'].includes(rule.freq);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={rc.overlay}>
        <View style={[rc.sheet, { backgroundColor: c.surface }]}>
          <View style={[rc.handle, { backgroundColor: c.border }]} />

          {/* Header */}
          <View style={rc.header}>
            <Pressable onPress={onClose}>
              <Text size="sm" color={c.textMuted}>Cancel</Text>
            </Pressable>
            <Text size="md" weight="bold">Repeat</Text>
            <Pressable onPress={() => onConfirm(rule)}>
              <Text size="sm" weight="bold" color={c.primary}>Done</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
            {/* Frequency selector */}
            <Text size="xs" weight="medium" color={c.textMuted} style={rc.fieldLabel}>FREQUENCY</Text>
            <View style={[rc.freqList, { borderColor: c.border }]}>
              {FREQ_OPTIONS.map((opt, i) => (
                <Pressable
                  key={opt.value}
                  onPress={() => set('freq')(opt.value)}
                  style={[
                    rc.freqRow,
                    { borderBottomColor: c.border },
                    i < FREQ_OPTIONS.length - 1 && { borderBottomWidth: 1 },
                    rule.freq === opt.value && { backgroundColor: c.primary + '12' },
                  ]}
                >
                  <Text size="sm" color={rule.freq === opt.value ? c.primary : c.text}>
                    {opt.label}
                  </Text>
                  {rule.freq === opt.value && (
                    <Text size="sm" color={c.primary}>✓</Text>
                  )}
                </Pressable>
              ))}
            </View>

            {/* Every N weeks stepper */}
            {rule.freq === 'nweekly' && (
              <View style={{ marginTop: 16 }}>
                <StepperRow
                  label="Repeat every"
                  value={rule.nWeeks}
                  min={2}
                  max={12}
                  onChange={set('nWeeks')}
                />
                <Text size="xs" color={c.textMuted} style={{ marginTop: 4 }}>
                  weeks
                </Text>
              </View>
            )}

            {/* Day-of-week chips */}
            {showDays && (
              <View style={{ marginTop: 16 }}>
                <Text size="xs" weight="medium" color={c.textMuted} style={rc.fieldLabel}>
                  ON THESE DAYS
                </Text>
                <View style={rc.chipRow}>
                  {DAY_NAMES.map((d, i) => (
                    <ToggleChip
                      key={i}
                      label={d}
                      selected={rule.days.includes(i)}
                      onPress={() => toggleDay(i)}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Monthly same date */}
            {rule.freq === 'monthly_day' && (
              <View style={{ marginTop: 16 }}>
                <StepperRow
                  label="Day of month"
                  value={rule.monthDay}
                  min={1}
                  max={31}
                  onChange={set('monthDay')}
                />
              </View>
            )}

            {/* Monthly Nth weekday */}
            {rule.freq === 'monthly_nth' && (
              <NthSelector
                nthWeek={rule.nthWeek}
                nthWeekDay={rule.nthWeekDay}
                onChangeWeek={set('nthWeek')}
                onChangeDay={set('nthWeekDay')}
              />
            )}

            {/* Custom RRULE */}
            {rule.freq === 'custom' && (
              <View style={{ marginTop: 16 }}>
                <Text size="xs" weight="medium" color={c.textMuted} style={rc.fieldLabel}>
                  RRULE STRING
                </Text>
                <TextInput
                  style={[rc.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
                  value={rule.rrule}
                  onChangeText={set('rrule')}
                  placeholder="RRULE:FREQ=WEEKLY;BYDAY=MO,WE"
                  placeholderTextColor={c.textSubtle}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <Text size="xs" color={c.textMuted} style={{ marginTop: 6, lineHeight: 18 }}>
                  Enter a valid RFC 5545 RRULE string. Will be saved as-is.
                </Text>
              </View>
            )}

            {/* ── End options (only when recurring) ── */}
            {rule.freq !== 'none' && (
              <View style={{ marginTop: 24 }}>
                <Text size="xs" weight="medium" color={c.textMuted} style={rc.fieldLabel}>
                  ENDS
                </Text>
                <View style={[rc.endBox, { borderColor: c.border }]}>
                  <RadioRow
                    label="Never"
                    selected={rule.endType === 'never'}
                    onPress={() => set('endType')('never')}
                  />
                  <View style={[rc.endDivider, { backgroundColor: c.border }]} />

                  <RadioRow
                    label={`After ${rule.endCount} occurrence${rule.endCount !== 1 ? 's' : ''}`}
                    selected={rule.endType === 'after'}
                    onPress={() => set('endType')('after')}
                  />
                  {rule.endType === 'after' && (
                    <View style={{ paddingLeft: 32, paddingBottom: 10 }}>
                      <StepperRow
                        label="Occurrences"
                        value={rule.endCount}
                        min={1}
                        max={999}
                        onChange={set('endCount')}
                      />
                    </View>
                  )}
                  <View style={[rc.endDivider, { backgroundColor: c.border }]} />

                  <RadioRow
                    label="On date"
                    selected={rule.endType === 'on'}
                    onPress={() => set('endType')('on')}
                  />
                  {rule.endType === 'on' && (
                    <View style={{ paddingLeft: 32, paddingBottom: 10 }}>
                      <TextInput
                        style={[rc.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
                        value={rule.endDate}
                        onChangeText={set('endDate')}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={c.textSubtle}
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Preview */}
            {rule.freq !== 'none' && (
              <View style={[rc.preview, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                <Text size="xs" weight="medium" color={c.textMuted} style={{ marginBottom: 4 }}>SUMMARY</Text>
                <Text size="sm" color={c.text}>{describeRule(rule)}</Text>
                {buildRRule(rule) && (
                  <Text size="xs" color={c.textSubtle} style={{ marginTop: 4, fontFamily: 'monospace' }}>
                    {buildRRule(rule)}
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const rc = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  fieldLabel: { textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 },

  freqList:   { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  freqRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },

  chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:       { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn:    { width: 36, height: 36, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  endBox:     { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  endDivider: { height: 1 },
  radioRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  radio:      { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot:   { width: 10, height: 10, borderRadius: 5 },

  input:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },

  preview:    { marginTop: 20, borderWidth: 1, borderRadius: 14, padding: 14 },
});
