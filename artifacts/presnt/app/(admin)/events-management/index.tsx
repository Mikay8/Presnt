/**
 * Admin — Events
 *
 * Full event management for admins (same form as officer).
 * Uses Phase 3 pickers: calendar date picker, time wheel picker,
 * advanced recurrence, and map-based location picker.
 *
 * Desktop: table view  |  Mobile: card list
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  useWindowDimensions,
  View
}  from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, useAlert } from '@/components/ui';
import { QRCheckinModal } from '@/lib/QRCheckin';
import { supabase } from '@/lib/supabase';
import { MapPickerModal } from '@/lib/MapPicker';
import {
  DatePickerModal,
  DateRange,
  DateRangePickerModal,
  TimePickerModal,
  combineDateTime,
  formatDateDisplay,
  formatDateRange,
  formatTimeDisplay
}  from '@/lib/pickers';
import {
  BLANK_RULE,
  RecurrencePickerModal,
  RecurrenceRule,
  buildRRule,
  describeRule
}  from '@/lib/recurrence';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import type { Tables } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

type Event = Tables<'events'> & {
  location_id?:       string | null;
  is_mandatory?:      boolean | null;
  allow_excuses?:     boolean | null;
  qr_checkin?:        boolean | null;
  geofence_required?: boolean | null;
  points?:            number | null;
  recurrence_rule?:   string | null;
};

type OrgLocation = {
  id:            string;
  name:          string;
  address:       string | null;
  latitude:      number | null;
  longitude:     number | null;
  radius_meters: number | null;
};

const DESKTOP = 768;

type EventCategory = { id: string; name: string; color: string };

type EventFormState = {
  title:               string;
  is_mandatory:        boolean;
  isMultiDay:          boolean;
  dateObj:             Date;
  dateRange:           DateRange;
  startTimeObj:        Date;
  endTimeObj:          Date;
  hasEndTime:          boolean;
  location_type:       'in-person' | 'remote';
  meeting_url:         string;
  location_id:         string | null;
  location_text:       string;
  location_lat:        number | null;
  location_lng:        number | null;
  category_id:         string | null;
  recurrence:          RecurrenceRule;
  description:         string;
  required_attendance:  boolean;
  qr_checkin:           boolean;
  geofence_required:    boolean;
  allow_excuses:        boolean;
  rsvp_required:        boolean;
  points:               string;
  checkin_open_minutes: string;   // minutes before start; '' = disabled
  checkin_grace_minutes:string;   // minutes grace after start/end; '' = disabled
  is_public:            boolean;  // whether to generate a public shareable URL
  event_code:           string;   // human-readable slug, e.g. 'meeting-0522'
};

const now = new Date();
const BLANK_FORM: EventFormState = {
  title: '', is_mandatory: false,
  isMultiDay:   false,
  dateObj:      now,
  dateRange:    { start: now, end: now },
  startTimeObj: (() => { const d = new Date(now); d.setHours(18, 0, 0, 0); return d; })(),
  endTimeObj:   (() => { const d = new Date(now); d.setHours(20, 0, 0, 0); return d; })(),
  hasEndTime:   true,
  location_type: 'in-person', meeting_url: '',
  location_id: null, location_text: '', location_lat: null, location_lng: null,
  category_id: null,
  recurrence:  { ...BLANK_RULE },
  description: '',
  required_attendance: true, qr_checkin: true, geofence_required: true,
  allow_excuses: true, rsvp_required: false,
  points: '2',
  checkin_open_minutes:  '15',
  checkin_grace_minutes: '15',
  is_public:             false,
  event_code:            ''
} ;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day:   d.getDate(),
    time:  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
} ;
}

// ── Helpers shared by nextOccurrenceAfter ──────────────────────────────────────

const NTH_DOW_MAP: Record<string, number> = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };

/**
 * Returns the date of the Nth weekday in a given month/year.
 * nth: 1=first … 4=fourth, -1=last.
 * dow: 0=Sun … 6=Sat.
 */
function nthWeekdayOfMonth(year: number, month: number, nth: number, dow: number): Date | null {
  if (nth >= 1) {
    // Find the first occurrence of `dow` in the month, then skip (nth-1) weeks
    const first = new Date(year, month, 1);
    const offset = (dow - first.getDay() + 7) % 7;
    const d = new Date(year, month, 1 + offset + (nth - 1) * 7);
    // Guard: if we overshot into next month (e.g. 5th weekday doesn't exist)
    if (d.getMonth() !== month) return null;
    return d;
  } else {
    // Last: start from the last day of the month and walk backward
    const last = new Date(year, month + 1, 0);
    const offset = (last.getDay() - dow + 7) % 7;
    return new Date(year, month + 1, 0 - offset);
  }
}

function nextOccurrenceAfter(rruleStr: string, startIso: string, now: Date): Date | null {
  try {
    const raw = rruleStr.replace(/^RRULE:/i, '');
    const params: Record<string, string> = {};
    raw.split(';').forEach(p => {
      const [k, v] = p.split('=');
      if (k && v !== undefined) params[k.toUpperCase()] = v;
    });
    const freq     = params['FREQ']?.toUpperCase();
    const interval = parseInt(params['INTERVAL'] ?? '1') || 1;
    const count    = params['COUNT'] ? parseInt(params['COUNT']) : null;
    const until    = params['UNTIL'] ? new Date(
      params['UNTIL'].replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3')
    ) : null;
    const byDay    = params['BYDAY']?.split(',') ?? [];
    const base     = new Date(startIso);
    const limit    = new Date(now.getTime() + 5 * 365 * 24 * 3600 * 1000);

    // ── Monthly Nth-weekday (BYDAY has a numeric prefix, e.g. '1MO' or '-1FR') ──
    if (freq === 'MONTHLY' && byDay.length === 1 && /^-?\d/.test(byDay[0])) {
      const nth    = parseInt(byDay[0]);
      const dowStr = byDay[0].replace(/^-?\d+/, '');
      const dow    = NTH_DOW_MAP[dowStr] ?? 0;
      // Preserve time-of-day from the base event
      const timeMs = base.getTime() - new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime();
      let   yr     = base.getFullYear();
      let   mo     = base.getMonth(); // 0-based
      let   n      = 0;
      // Start from the base month (first occurrence)
      while (true) {
        const candidate = nthWeekdayOfMonth(yr, mo, nth, dow);
        if (!candidate) { mo += interval; yr += Math.floor(mo / 12); mo = mo % 12; continue; }
        const occ = new Date(candidate.getTime() + timeMs);
        if (until && occ > until) return null;
        if (count !== null && n >= count) return null;
        if (occ > limit) return null;
        if (occ >= now) return occ;
        n++;
        mo += interval;
        yr += Math.floor(mo / 12);
        mo = mo % 12;
      }
    }

    // ── Weekly / monthly-by-date / daily ─────────────────────────────────────
    let occ = new Date(base);
    let n   = 0;
    while (occ <= limit) {
      if (until && occ > until) return null;
      if (count !== null && n >= count) return null;
      let matches = true;
      if (byDay.length && freq === 'WEEKLY') {
        matches = byDay.some(d => NTH_DOW_MAP[d.replace(/^[-\d]+/, '')] === occ.getDay());
      }
      if (matches && occ >= now) return occ;
      if (freq === 'WEEKLY') {
        if (byDay.length > 1) {
          occ = new Date(occ.getTime() + 24 * 3600 * 1000);
          const daysDiff = Math.round((occ.getTime() - base.getTime()) / (24 * 3600 * 1000));
          if (daysDiff % (7 * interval) === 0) n++;
        } else {
          occ = new Date(occ.getTime() + 7 * interval * 24 * 3600 * 1000);
          n++;
        }
      } else if (freq === 'MONTHLY') {
        occ = new Date(occ); occ.setMonth(occ.getMonth() + interval); n++;
      } else if (freq === 'DAILY') {
        occ = new Date(occ.getTime() + interval * 24 * 3600 * 1000); n++;
      } else { return null; }
    }
    return null;
  } catch { return null; }
}

function isUpcoming(event: Event): boolean {
  const now = new Date();
  const rrule = (event as any).recurrence_rule as string | null;
  if (rrule) return nextOccurrenceAfter(rrule, event.start_time, now) !== null;
  return new Date(event.start_time) > now;
}

/** Returns 'ongoing' if now is within the check-in window, else 'upcoming' | 'past' | 'cancelled' */
function eventStatus(event: Event): 'cancelled' | 'ongoing' | 'upcoming' | 'past' {
  if (event.is_cancelled) return 'cancelled';
  const now      = new Date();
  const start    = new Date(event.start_time);
  const end      = event.end_time ? new Date(event.end_time) : null;
  const openMins  = (event as any).checkin_open_minutes  as number | null ?? 15;
  const graceMins = (event as any).checkin_grace_minutes as number | null ?? 15;
  const windowOpen  = new Date(start.getTime() - openMins  * 60_000);
  const windowClose = end
    ? new Date(end.getTime()   + graceMins * 60_000)
    : new Date(start.getTime() + graceMins * 60_000);
  if (now >= windowOpen && now <= windowClose) return 'ongoing';
  if (now < start) return 'upcoming';
  return 'past';
}

const STATUS_COLOR: Record<ReturnType<typeof eventStatus>, string> = {
  cancelled: '#EF4444',
  ongoing:   '#F59E0B',
  upcoming:  '#22C55E',
  past:      '',           // filled in at render using c.textSubtle
};
const STATUS_LABEL: Record<ReturnType<typeof eventStatus>, string> = {
  cancelled: 'Cancelled',
  ongoing:   'Ongoing',
  upcoming:  'Upcoming',
  past:      'Past'
} ;

function displayDate(event: Event): string {
  const rrule = (event as any).recurrence_rule as string | null;
  if (rrule) {
    const next = nextOccurrenceAfter(rrule, event.start_time, new Date());
    if (next) return next.toISOString();
  }
  return event.start_time;
}

function formFromEvent(e: Event): EventFormState {
  const start      = new Date(e.start_time);
  const end        = e.end_time ? new Date(e.end_time) : new Date(start.getTime() + 2 * 3600000);
  const meetingUrl = (e as any).meeting_url ?? '';
  return {
    title:          e.title,
    is_mandatory:   !!(e as any).is_mandatory,
    isMultiDay:     false,
    dateObj:        start,
    dateRange:      { start, end },
    startTimeObj:   start,
    endTimeObj:     end,
    hasEndTime:     !!e.end_time,
    location_type:  meetingUrl ? 'remote' : 'in-person',
    meeting_url:    meetingUrl,
    location_id:    (e as any).location_id ?? null,
    location_text:  e.location ?? '',
    location_lat:   null,
    location_lng:   null,
    category_id:    (e as any).category_id ?? null,
    recurrence:     { ...BLANK_RULE },
    description:    e.description ?? '',
    required_attendance: !!(e as any).is_mandatory,
    qr_checkin:     !!(e as any).qr_checkin,
    geofence_required: !!(e as any).geofence_required,
    allow_excuses:         (e as any).allow_excuses !== false,
    rsvp_required:         !!e.rsvp_required,
    points:                String((e as any).points ?? 2),
    checkin_open_minutes:  (e as any).checkin_open_minutes  != null ? String((e as any).checkin_open_minutes)  : '',
    checkin_grace_minutes: (e as any).checkin_grace_minutes != null ? String((e as any).checkin_grace_minutes) : '',
    is_public:             !!(e as any).is_public,
    event_code:            (e as any).event_code ?? ''
} ;
}

// ─── Location Picker Modal ────────────────────────────────────────────────────

function LocationPickerModal({
  visible, orgId, selectedId, onSelect, onClose
} : {
  visible: boolean; orgId: string; selectedId: string | null;
  onSelect: (loc: OrgLocation | null) => void; onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [locations, setLocations] = useState<OrgLocation[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [pending,   setPending]   = useState<string | null>(selectedId);

  useEffect(() => {
    if (!visible) return;
    supabase
      .from('org_locations')
      .select('id, name, address, latitude, longitude, radius_meters')
      .eq('org_id', orgId).eq('is_deleted', false).order('name')
      .then(({ data }) => { setLocations((data ?? []) as OrgLocation[]); setLoading(false); });
  }, [visible, orgId]);

  const filtered = locations.filter(l =>
    !search ||
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.address ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={lp.overlay}>
        <View style={[lp.sheet, { backgroundColor: c.surface }]}>
          <View style={[lp.handle, { backgroundColor: c.border }]} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text size="xl" weight="bold">Choose location</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => router.push('/(admin)/locations' as any)}
                style={[lp.newBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                <Text size="sm" weight="medium" color={c.text}>Manage</Text>
              </Pressable>
              <Pressable onPress={onClose}>
                <Text size="sm" color={c.textMuted}>Cancel</Text>
              </Pressable>
            </View>
          </View>

          <View style={[lp.searchBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
            <Ionicons name="search-outline" size={15} color={c.textSubtle} />
            <TextInput style={{ flex: 1, fontSize: 14, color: c.text }} value={search}
              onChangeText={setSearch} placeholder="Search…" placeholderTextColor={c.textSubtle} />
          </View>

          {loading ? <ActivityIndicator color={c.primary} style={{ marginTop: 20 }} /> : (
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              <Pressable onPress={() => { onSelect(null); }}
                style={[lp.locRow, {
                  backgroundColor: pending === null ? c.primary + '10' : 'transparent',
                  borderColor: pending === null ? c.primary : c.border,
                  borderWidth: pending === null ? 1.5 : 1, marginBottom: 8, marginTop: 16
} ]}>
                <Ionicons name="close-circle-outline" size={16} color={c.textSubtle} />
                <Text size="sm" color={c.textMuted}>No location</Text>
              </Pressable>
              {filtered.map(loc => {
                const sel = pending === loc.id;
                return (
                  <Pressable key={loc.id} onPress={() => setPending(loc.id)}
                    style={[lp.locRow, {
                      backgroundColor: sel ? c.primary + '10' : 'transparent',
                      borderColor: sel ? c.primary : c.border,
                      borderWidth: sel ? 1.5 : 1, marginBottom: 8
} ]}>
                    <Ionicons name="location" size={16} color={sel ? c.primary : c.textSubtle} />
                    <View style={{ flex: 1 }}>
                      <Text size="sm" weight="medium" color={sel ? c.primary : c.text}>{loc.name}</Text>
                      {loc.address && <Text size="xs" color={c.textSubtle}>{loc.address}</Text>}
                      {loc.radius_meters && <Text size="xs" color={c.textSubtle}>Geofence: {loc.radius_meters}m</Text>}
                    </View>
                    {sel && <View style={[lp.checkCircle, { backgroundColor: c.primary }]}><Ionicons name="checkmark" size={12} color="#fff" /></View>}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <Pressable onPress={() => { const loc = locations.find(l => l.id === pending) ?? null; onSelect(loc); }}
            style={[lp.useBtn, { backgroundColor: c.primary, marginTop: 16 }]}>
            <Text size="md" weight="bold" style={{ color: '#fff' }}>Use this location</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const lp = StyleSheet.create({
  overlay:     { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  handle:      { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  newBtn:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  locRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 14 },
  checkCircle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  useBtn:      { borderRadius: 14, paddingVertical: 14, alignItems: 'center' }
} );

// ─── Picker trigger button ────────────────────────────────────────────────────

function PickerBtn({
  label, value, icon, onPress, color
} : {
  label: string; value: string; icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void; color: string;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  return (
    <Pressable onPress={onPress}
      style={[pb.btn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
      <Ionicons name={icon} size={15} color={color} />
      <View style={{ flex: 1 }}>
        <Text size="xs" color={c.textSubtle} weight="medium" style={{ letterSpacing: 0.5 }}>{label}</Text>
        <Text size="sm" color={c.text} weight="medium">{value}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={c.textSubtle} />
    </Pressable>
  );
}

const pb = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }
} );

// ─── Event Form (full screen modal) ──────────────────────────────────────────

function EventForm({
  visible, initial, orgId, orgSlug, onClose, onSave, onDelete, saving, codeErrorMsg, onClearCodeError
} : {
  visible: boolean; initial: Event | null; orgId: string; orgSlug: string;
  onClose: () => void; onSave: (form: EventFormState) => void;
  onDelete: (event: Event, mode: 'this' | 'series') => void; saving: boolean;
  codeErrorMsg?: string | null; onClearCodeError?: () => void;
}) {
  const { theme } = useThemeStore();
  const { width } = useWindowDimensions();
  const isWide    = width >= DESKTOP;
  const insets    = useSafeAreaInsets();
  const c = theme.colors;

  const [form, setForm] = useState<EventFormState>(BLANK_FORM);

  const [showDate,       setShowDate]       = useState(false);
  const [showRange,      setShowRange]      = useState(false);
  const [showStartTime,  setShowStartTime]  = useState(false);
  const [showEndTime,    setShowEndTime]    = useState(false);
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [showLocPicker,  setShowLocPicker]  = useState(false);
  const [showMapPicker,  setShowMapPicker]  = useState(false);
  const [savedLoc,        setSavedLoc]        = useState<OrgLocation | null>(null);
  const [confirmDelete,   setConfirmDelete]   = useState<'single' | 'recurring' | null>(null);
  const [codeGenerating,  setCodeGenerating]  = useState(false);
  const [categories,      setCategories]      = useState<EventCategory[]>([]);
  const [showCatMenu,     setShowCatMenu]     = useState(false);
  // codeError is driven by parent (screen) so it persists through re-renders
  const codeError    = codeErrorMsg ?? null;
  const setCodeError = onClearCodeError ? (_: null) => onClearCodeError() : (_: null) => {};

  // Load categories whenever the form opens
  useEffect(() => {
    if (visible && orgId) {
      supabase
        .from('event_categories')
        .select('id, name, color')
        .eq('org_id', orgId)
        .eq('is_deleted', false)
        .order('name')
        .then(({ data }) => setCategories((data ?? []) as EventCategory[]));
    }
  }, [visible, orgId]);

  // Auto-generate event_code for new events when form opens
  useEffect(() => {
    if (visible) {
      const f = initial
        ? formFromEvent(initial)
        : { ...BLANK_FORM, dateObj: new Date(),
            startTimeObj: (() => { const d = new Date(); d.setHours(18,0,0,0); return d; })(),
            endTimeObj:   (() => { const d = new Date(); d.setHours(20,0,0,0); return d; })() };
      setForm(f);
      setSavedLoc(null);
      onClearCodeError?.();
      // Auto-generate code for all new events that don't already have a code
      if (!initial && !f.event_code) {
        generateCode(f.dateObj);
      }
    }
  }, [visible, initial]);

  async function generateCode(date: Date) {
    if (!orgId) return;
    setCodeGenerating(true);
    try {
      const { data } = await supabase.rpc('generate_event_code', {
        p_org_id: orgId,
        p_type:   'event',
        p_start:  date.toISOString()
} );
      if (data) setForm(f => ({ ...f, event_code: data as string }));
    } finally {
      setCodeGenerating(false);
    }
  }

  function sanitiseCode(raw: string) {
    return raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-');
  }

  const set = <K extends keyof EventFormState>(k: K) =>
    (v: EventFormState[K]) => setForm(f => ({ ...f, [k]: v }));

  const inputStyle = [ef.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }];
  const isEdit       = !!initial;
  const rruleSummary = describeRule(form.recurrence);

  const settingsPanel = (
    <View style={[ef.panel, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={ef.panelSection}>
        {([
          ['Required attendance', 'required_attendance'],
          ['QR check-in',         'qr_checkin'],
          ['Geofence required',   'geofence_required'],
          ['Allow excuses',       'allow_excuses'],
          ['Public RSVP',         'rsvp_required'],
        ] as [string, keyof EventFormState][]).map(([label, key]) => (
          <View key={key} style={ef.toggleRow}>
            <Text size="sm" color={c.text}>{label}</Text>
            <Switch value={!!form[key]} onValueChange={(v) => set(key)(v as any)}
              trackColor={{ false: c.border, true: c.primary }} thumbColor="#fff" />
          </View>
        ))}
      </View>

      {/* ── Check-in window ── */}
      <View style={[ef.panelSection, { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 14 }]}>
        <Text size="xs" weight="medium" color={c.textMuted}
          style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
          Check-in window
        </Text>

        {/* Open before */}
        <Text size="xs" color={c.textSubtle} style={{ marginBottom: 5 }}>
          Opens before start (minutes)
        </Text>
        <View style={[ef.checkinRow, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
          <Ionicons name="time-outline" size={15} color={c.textSubtle} />
          <TextInput
            style={{ flex: 1, fontSize: 14, color: c.text }}
            value={form.checkin_open_minutes}
            onChangeText={set('checkin_open_minutes')}
            keyboardType="number-pad"
            placeholder="e.g. 15"
            placeholderTextColor={c.textSubtle}
          />
          <Text size="xs" color={c.textSubtle}>min</Text>
        </View>

        {/* Grace after */}
        <Text size="xs" color={c.textSubtle} style={{ marginTop: 10, marginBottom: 5 }}>
          Grace period after start/end (minutes)
        </Text>
        <View style={[ef.checkinRow, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
          <Ionicons name="hourglass-outline" size={15} color={c.textSubtle} />
          <TextInput
            style={{ flex: 1, fontSize: 14, color: c.text }}
            value={form.checkin_grace_minutes}
            onChangeText={set('checkin_grace_minutes')}
            keyboardType="number-pad"
            placeholder="e.g. 15"
            placeholderTextColor={c.textSubtle}
          />
          <Text size="xs" color={c.textSubtle}>min</Text>
        </View>
        <Text size="xs" color={c.textSubtle} style={{ marginTop: 6, lineHeight: 16 }}>
          Leave blank to use no pre-open window or no grace period.
        </Text>
      </View>

      {/* ── Points ── */}
      <View style={[ef.panelSection, { marginTop: 0, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 14 }]}>
        <Text size="xs" weight="medium" color={c.textMuted}
          style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Points
        </Text>
        <View style={[ef.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, paddingVertical: 10 }]}>
          <TextInput style={{ fontSize: 14, color: c.text }} value={form.points}
            onChangeText={set('points')} keyboardType="number-pad" placeholderTextColor={c.textSubtle} />
        </View>
      </View>
    </View>
  );

  function formFields() {
    return (
      <View style={[ef.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        {/* ── BASICS ── */}
        <Text size="xs" weight="medium" color={c.textMuted} style={ef.sectionLabel}>BASICS</Text>
        <Text size="xs" weight="medium" color={c.textSubtle} style={ef.fieldLabel}>TITLE</Text>
        <TextInput style={[inputStyle, { marginBottom: 12, paddingVertical: 14, fontSize: 16 }]} value={form.title}
          onChangeText={set('title')} placeholder="e.g. Chapter meeting · week 6"
          placeholderTextColor={c.textSubtle} />

        {/* ── PUBLIC EVENT toggle ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <View style={{ flex: 1 }}>
            <Text size="sm" weight="medium" color={c.text}>Public event</Text>
            <Text size="xs" color={c.textSubtle} style={{ marginTop: 2 }}>
              {form.is_public ? 'Shareable link · visible to non-members' : 'Members only · no public link'}
            </Text>
          </View>
          <Switch
            value={form.is_public}
            onValueChange={(v) => { set('is_public')(v); onClearCodeError?.(); }}
            trackColor={{ false: c.border, true: c.primary }}
            thumbColor="#fff"
          />
        </View>

        {/* ── EVENT CODE (always shown — used as internal URL slug too) ── */}
        <View style={{ marginBottom: 14 }}>
          <Text size="xs" weight="medium" color={c.textSubtle} style={[ef.fieldLabel, { marginTop: 6 }]}>EVENT CODE</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <TextInput
              style={[inputStyle, { flex: 1, marginBottom: 0, fontFamily: 'monospace', paddingVertical: 13,
                borderColor: codeError ? '#EF4444' : c.border }]}
              value={form.event_code}
              onChangeText={(v) => { setCodeError(null); set('event_code')(sanitiseCode(v)); }}
              placeholder="e.g. meeting-0522"
              placeholderTextColor={c.textSubtle}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={() => { setCodeError(null); generateCode(form.isMultiDay ? form.dateRange.start : form.dateObj); }}
              disabled={codeGenerating}
              style={({ pressed }) => ({
                borderWidth: 1, borderColor: c.border, borderRadius: 10,
                paddingHorizontal: 12, paddingVertical: 13,
                backgroundColor: pressed ? c.surfaceAlt : c.surface,
                opacity: codeGenerating ? 0.5 : 1
} )}
            >
              {codeGenerating
                ? <ActivityIndicator size="small" color={c.primary} />
                : <Ionicons name="refresh-outline" size={16} color={c.textSubtle} />
              }
            </Pressable>
          </View>
          {codeError ? (
            <Text size="xs" color="#EF4444" style={{ marginBottom: 4 }}>{codeError}</Text>
          ) : null}
          {form.event_code ? (
            form.is_public ? (
              <Text size="xs" color={c.textSubtle} style={{ fontFamily: 'monospace' }}>
                presnt.link/c/{orgSlug}/events/{form.event_code}
              </Text>
            ) : (
              <Text size="xs" color={c.textSubtle}>
                Internal URL: /event/{form.event_code} · enable Public to share externally
              </Text>
            )
          ) : (
            <Text size="xs" color={c.textSubtle}>Used as the in-app URL slug. Tap ↺ to generate.</Text>
          )}
        </View>

        {/* Category + Mandatory row */}
        <View style={{ flexDirection: 'row', gap: 10, zIndex: showCatMenu ? 100 : 1 }}>
          <View style={{ flex: 1, zIndex: 100 }}>
            <Text size="xs" weight="medium" color={c.textSubtle} style={ef.fieldLabel}>CATEGORY</Text>
            <Pressable
              onPress={() => setShowCatMenu(!showCatMenu)}
              style={[inputStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, marginBottom: 0 }]}
            >
              {form.category_id && categories.find(cat => cat.id === form.category_id) ? (() => {
                const cat = categories.find(c2 => c2.id === form.category_id)!;
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cat.color }} />
                    <Text size="sm" color={c.text}>{cat.name}</Text>
                  </View>
                );
              })() : (
                <Text size="sm" color={c.textSubtle}>None</Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {form.category_id && (
                  <Pressable onPress={(e) => { e.stopPropagation?.(); set('category_id')(null); setShowCatMenu(false); }} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={c.textSubtle} />
                  </Pressable>
                )}
                <Ionicons name={showCatMenu ? 'chevron-up' : 'chevron-down'} size={14} color={c.textSubtle} />
              </View>
            </Pressable>
            {showCatMenu && (
              <View style={[ef.dropdown, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Pressable
                  onPress={() => { set('category_id')(null); setShowCatMenu(false); }}
                  style={[ef.dropdownItem, { borderBottomColor: c.border }]}
                >
                  <Text size="sm" color={c.textMuted}>None</Text>
                </Pressable>
                {categories.map(cat => (
                  <Pressable
                    key={cat.id}
                    onPress={() => { set('category_id')(cat.id); setShowCatMenu(false); }}
                    style={[ef.dropdownItem, { borderBottomColor: c.border }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cat.color }} />
                      <Text size="sm" color={form.category_id === cat.id ? c.primary : c.text}
                        weight={form.category_id === cat.id ? 'medium' : 'regular'}>
                        {cat.name}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                {categories.length === 0 && (
                  <Pressable
                    onPress={() => { setShowCatMenu(false); router.push('/(admin)/categories' as any); }}
                    style={[ef.dropdownItem, { borderBottomColor: c.border }]}
                  >
                    <Text size="sm" color={c.primary}>+ Create categories</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
          <View style={{ width: 110 }}>
            <Text size="xs" weight="medium" color={c.textSubtle} style={ef.fieldLabel}>MANDATORY</Text>
            <View style={[inputStyle, { justifyContent: 'center', alignItems: 'center', paddingVertical: 10 }]}>
              <Switch value={form.is_mandatory} onValueChange={set('is_mandatory')}
                trackColor={{ false: c.border, true: c.primary }} thumbColor="#fff" />
            </View>
          </View>
        </View>

        <View style={[ef.divider, { backgroundColor: c.border, marginTop: 20 }]} />

        {/* ── WHEN ── */}
        <Text size="xs" weight="medium" color={c.textMuted} style={ef.sectionLabel}>WHEN</Text>

        {/* Single / multi-day toggle */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          {[false, true].map(multi => (
            <Pressable key={String(multi)}
              onPress={() => set('isMultiDay')(multi)}
              style={[ef.modeChip, {
                backgroundColor: form.isMultiDay === multi ? c.primary : c.surfaceAlt,
                borderColor: form.isMultiDay === multi ? c.primary : c.border
} ]}>
              <Text size="sm" weight={form.isMultiDay === multi ? 'bold' : 'regular'}
                color={form.isMultiDay === multi ? '#fff' : c.text}>
                {multi ? 'Multi-day' : 'Single day'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text size="xs" weight="medium" color={c.textSubtle} style={ef.fieldLabel}>
          {form.isMultiDay ? 'DATE RANGE' : 'DATE'}
        </Text>
        <View style={{ position: 'relative', zIndex: (showDate || showRange) ? 500 : 1 }}>
          {form.isMultiDay ? (
            <PickerBtn label="Date range"
              value={formatDateRange(form.dateRange.start, form.dateRange.end)}
              icon="calendar-outline" color={c.primary} onPress={() => setShowRange(true)} />
          ) : (
            <>
              <PickerBtn label="Date" value={formatDateDisplay(form.dateObj)}
                icon="calendar-outline" color={c.primary} onPress={() => setShowDate(!showDate)} />
              <DatePickerModal visible={showDate} value={form.dateObj}
                onConfirm={(d) => {
                  const newDate  = new Date(d);
                  const newStart = new Date(newDate);
                  newStart.setHours(form.startTimeObj.getHours(), form.startTimeObj.getMinutes(), 0, 0);
                  const newEnd = new Date(newDate);
                  newEnd.setHours(form.endTimeObj.getHours(), form.endTimeObj.getMinutes(), 0, 0);
                  setForm(f => ({ ...f, dateObj: newDate, startTimeObj: newStart, endTimeObj: newEnd }));
                  setShowDate(false);
                }}
                onClose={() => setShowDate(false)} />
            </>
          )}
        </View>

        <DateRangePickerModal visible={showRange} value={form.dateRange}
          onConfirm={r => { setForm(f => ({ ...f, dateRange: r, dateObj: r.start })); setShowRange(false); }}
          onClose={() => setShowRange(false)} />

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <Text size="xs" weight="medium" color={c.textSubtle} style={ef.fieldLabel}>START TIME</Text>
            <PickerBtn label="Start" value={formatTimeDisplay(form.startTimeObj)}
              icon="time-outline" color={c.primary} onPress={() => setShowStartTime(true)} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text size="xs" weight="medium" color={c.textSubtle} style={ef.fieldLabel}>END TIME</Text>
              <Switch value={form.hasEndTime} onValueChange={set('hasEndTime')}
                trackColor={{ false: c.border, true: c.primary }} thumbColor="#fff"
                style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }} />
            </View>
            {form.hasEndTime ? (
              <PickerBtn label="End" value={formatTimeDisplay(form.endTimeObj)}
                icon="time-outline" color={c.textSubtle} onPress={() => setShowEndTime(true)} />
            ) : (
              <View style={[pb.btn, { backgroundColor: c.surfaceAlt, borderColor: c.border, opacity: 0.4 }]}>
                <Ionicons name="time-outline" size={15} color={c.textSubtle} />
                <Text size="sm" color={c.textSubtle}>No end time</Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ marginTop: 10 }}>
          <Text size="xs" weight="medium" color={c.textSubtle} style={ef.fieldLabel}>REPEAT</Text>
          <PickerBtn label="Recurrence" value={rruleSummary}
            icon={form.recurrence.freq === 'none' ? 'refresh-outline' : 'repeat-outline'}
            color={form.recurrence.freq === 'none' ? c.textSubtle : c.primary}
            onPress={() => setShowRecurrence(true)} />
        </View>

        <View style={[ef.divider, { backgroundColor: c.border, marginTop: 20 }]} />

        {/* ── WHERE ── */}
        <Text size="xs" weight="medium" color={c.textMuted} style={ef.sectionLabel}>WHERE</Text>

        {/* In-person / Remote toggle */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {(['in-person', 'remote'] as const).map((mode) => {
            const active = form.location_type === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => set('location_type')(mode)}
                style={[ef.modeChip, {
                  backgroundColor: active ? c.primary : c.surfaceAlt,
                  borderColor:     active ? c.primary : c.border,
                  flexDirection: 'row', alignItems: 'center', gap: 6
} ]}
              >
                <Ionicons
                  name={mode === 'remote' ? 'videocam-outline' : 'location-outline'}
                  size={14}
                  color={active ? '#fff' : c.textSubtle}
                />
                <Text size="sm" weight={active ? 'bold' : 'regular'}
                  color={active ? '#fff' : c.text}>
                  {mode === 'remote' ? 'Remote' : 'In-Person'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {form.location_type === 'remote' ? (
          <>
            <Text size="xs" weight="medium" color={c.textSubtle} style={ef.fieldLabel}>MEETING LINK</Text>
            <View style={[ef.urlRow, { backgroundColor: c.surfaceAlt, borderColor: form.meeting_url ? c.primary : c.border }]}>
              <Ionicons name="link-outline" size={16} color={form.meeting_url ? c.primary : c.textSubtle} />
              <TextInput
                style={{ flex: 1, fontSize: 14, color: c.text }}
                value={form.meeting_url}
                onChangeText={set('meeting_url')}
                placeholder="https://zoom.us/j/… or meet.google.com/…"
                placeholderTextColor={c.textSubtle}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              {!!form.meeting_url && (
                <Pressable onPress={() => set('meeting_url')('')}>
                  <Ionicons name="close-circle" size={16} color={c.textSubtle} />
                </Pressable>
              )}
            </View>
          </>
        ) : (
          <>
            <Pressable onPress={() => setShowLocPicker(true)}
              style={[ef.locRow, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Ionicons name="business-outline" size={16} color={c.primary} />
              <View style={{ flex: 1 }}>
                {savedLoc ? (
                  <>
                    <Text size="sm" weight="medium">{savedLoc.name}</Text>
                    {savedLoc.address && <Text size="xs" color={c.textSubtle}>{savedLoc.address}</Text>}
                    {savedLoc.radius_meters && <Text size="xs" color={c.textSubtle}>Geofence: {savedLoc.radius_meters}m</Text>}
                  </>
                ) : form.location_text ? (
                  <Text size="sm" color={c.text}>{form.location_text}</Text>
                ) : (
                  <Text size="sm" color={c.textSubtle}>Choose from saved locations</Text>
                )}
              </View>
              <Text size="xs" weight="medium" color={c.primary}>
                {savedLoc || form.location_text ? 'Change' : 'Select'}
              </Text>
            </Pressable>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <View style={[ef.orLine, { backgroundColor: c.border }]} />
              <Text size="xs" color={c.textSubtle}>or</Text>
              <View style={[ef.orLine, { backgroundColor: c.border }]} />
            </View>
            <Pressable onPress={() => setShowMapPicker(true)}
              style={[ef.mapBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Ionicons name="map-outline" size={15} color={c.primary} />
              <Text size="sm" weight="medium" color={c.text}>
                {form.location_lat ? 'Adjust pin on map' : 'Drop a pin on map'}
              </Text>
              {form.location_lat && (
                <Text size="xs" color={c.textSubtle} style={{ marginLeft: 'auto' }}>
                  {form.location_lat.toFixed(4)}, {form.location_lng?.toFixed(4)}
                </Text>
              )}
            </Pressable>

            <TextInput style={[inputStyle, { marginTop: 10, paddingVertical: 11 }]}
              value={form.location_text} onChangeText={set('location_text')}
              placeholder="Or type a location name / address" placeholderTextColor={c.textSubtle} />
          </>
        )}

        <View style={[ef.divider, { backgroundColor: c.border, marginTop: 20 }]} />

        {/* ── DESCRIPTION ── */}
        <Text size="xs" weight="medium" color={c.textMuted} style={ef.sectionLabel}>DESCRIPTION</Text>
        <TextInput style={[inputStyle, { height: 88, textAlignVertical: 'top', paddingTop: 12 }]}
          value={form.description} onChangeText={set('description')}
          placeholder="Add details, agenda, links…" placeholderTextColor={c.textSubtle} multiline />

        {isEdit && isWide && (
          <Pressable onPress={handleDelete}
            style={[ef.deleteBtn, { borderColor: '#EF4444', marginTop: 20 }]}>
            <Ionicons name="trash-outline" size={14} color="#EF4444" />
            <Text size="sm" weight="medium" color="#EF4444">
              {(initial as any)?.recurrence_rule || (initial as any)?.is_occurrence
                ? 'Delete event…'
                : 'Delete event'}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  function handleDelete() {
    if (!initial) return;
    const isMaster    = !!(initial as any).recurrence_rule && !(initial as any).is_occurrence;
    const isOccurrence = !!(initial as any).is_occurrence;
    setConfirmDelete(isMaster || isOccurrence ? 'recurring' : 'single');
  }

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={{ flex: 1, backgroundColor: c.background }}>
          <View style={[ef.header, { backgroundColor: c.surface, borderBottomColor: c.border, paddingTop: insets.top + 14 }]}>
            <Pressable onPress={onClose} style={ef.closeBtn}>
              <Ionicons name="close" size={18} color={c.text} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text size="md" weight="bold">{isEdit ? 'Edit event' : 'New event'}</Text>
              {form.recurrence.freq !== 'none' && (
                <Text size="xs" color={c.primary}>{describeRule(form.recurrence)}</Text>
              )}
            </View>
            <Pressable onPress={() => onSave(form)} disabled={saving || !form.title.trim()}
              style={[ef.postBtn, { backgroundColor: c.primary, opacity: saving ? 0.6 : 1 }]}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text size="sm" weight="bold" style={{ color: '#fff' }}>
                    {isEdit ? 'Save changes' : 'Post event'}
                  </Text>
              }
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }}
            contentContainerStyle={[ef.formScroll, isWide && ef.formScrollWide, { paddingBottom: insets.bottom + 60 }]}
            keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {isWide ? (
              <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>{formFields()}</View>
                <View style={{ width: 280 }}>{settingsPanel}</View>
              </View>
            ) : (
              <>{formFields()}{settingsPanel}</>
            )}
            {isEdit && !isWide && (
              <Pressable onPress={handleDelete} style={[ef.deleteBtn, { borderColor: '#EF4444' }]}>
                <Ionicons name="trash-outline" size={14} color="#EF4444" />
                <Text size="sm" weight="medium" color="#EF4444">
                  {(initial as any)?.recurrence_rule || (initial as any)?.is_occurrence
                    ? 'Delete event…'
                    : 'Delete event'}
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Inline delete confirm (no Alert.alert — works on web) ── */}
      <Modal
        visible={confirmDelete !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDelete(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
          onPress={() => setConfirmDelete(null)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 24, width: 320, gap: 12 }}>
              <Text size="md" weight="bold" color="#EF4444">
                {confirmDelete === 'recurring' ? 'Delete recurring event' : 'Delete event'}
              </Text>
              <Text size="sm" color={c.textMuted} style={{ lineHeight: 20 }}>
                {confirmDelete === 'recurring'
                  ? 'Do you want to delete just this occurrence or the entire series?'
                  : 'This cannot be undone.'}
              </Text>
              <View style={{ gap: 8, marginTop: 4 }}>
                {confirmDelete === 'recurring' ? (
                  <>
                    <Pressable
                      onPress={() => { setConfirmDelete(null); onDelete(initial!, 'this'); }}
                      style={({ pressed }) => ({ borderWidth: 1, borderColor: '#EF4444', borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: pressed ? '#FEE2E2' : 'transparent' })}
                    >
                      <Text size="sm" weight="medium" color="#EF4444">This occurrence only</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { setConfirmDelete(null); onDelete(initial!, 'series'); }}
                      style={({ pressed }) => ({ borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: pressed ? '#DC2626' : '#EF4444' })}
                    >
                      <Text size="sm" weight="bold" style={{ color: '#fff' }}>Entire series</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    onPress={() => { setConfirmDelete(null); onDelete(initial!, 'this'); }}
                    style={({ pressed }) => ({ borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: pressed ? '#DC2626' : '#EF4444' })}
                  >
                    <Text size="sm" weight="bold" style={{ color: '#fff' }}>Delete</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => setConfirmDelete(null)}
                  style={({ pressed }) => ({ borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: pressed ? c.surfaceAlt : 'transparent' })}
                >
                  <Text size="sm" weight="medium">Cancel</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <TimePickerModal visible={showStartTime} value={form.startTimeObj}
        onConfirm={(d) => { set('startTimeObj')(d); setShowStartTime(false); }}
        onClose={() => setShowStartTime(false)} />

      <TimePickerModal visible={showEndTime} value={form.endTimeObj}
        onConfirm={(d) => { set('endTimeObj')(d); setShowEndTime(false); }}
        onClose={() => setShowEndTime(false)} />

      <RecurrencePickerModal visible={showRecurrence} value={form.recurrence}
        onConfirm={(rule) => { set('recurrence')(rule); setShowRecurrence(false); }}
        onClose={() => setShowRecurrence(false)} />

      <LocationPickerModal visible={showLocPicker} orgId={orgId} selectedId={form.location_id}
        onSelect={(loc) => {
          setSavedLoc(loc);
          setForm(f => ({
            ...f,
            location_id:   loc?.id ?? null,
            location_text: loc?.name ?? f.location_text,
            location_lat:  loc?.latitude ?? f.location_lat,
            location_lng:  loc?.longitude ?? f.location_lng
} ));
          setShowLocPicker(false);
        }}
        onClose={() => setShowLocPicker(false)} />

      <MapPickerModal visible={showMapPicker}
        initialLat={form.location_lat ?? (savedLoc?.latitude ?? 0)}
        initialLng={form.location_lng ?? (savedLoc?.longitude ?? 0)}
        radiusMeters={savedLoc?.radius_meters ?? 100}
        onConfirm={({ lat, lng, address }) => {
          setForm(f => ({
            ...f,
            location_lat:  lat || null,
            location_lng:  lng || null,
            location_text: address || f.location_text
} ));
          setShowMapPicker(false);
        }}
        onClose={() => setShowMapPicker(false)} />
    </>
  );
}

const ef = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  closeBtn:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0000000A' },
  postBtn:     { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  formScroll:  { padding: 20, paddingBottom: 60 },
  formScrollWide: { paddingHorizontal: 48, maxWidth: 1100, alignSelf: 'center', width: '100%' },
  card:        { borderWidth: 1, borderRadius: 16, padding: 20, marginBottom: 16 },
  sectionLabel:{ textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, marginTop: 4 },
  fieldLabel:  { textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontSize: 10 },
  input:       { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 14 },
  divider:     { height: 1, marginBottom: 16 },
  locRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 14 },
  mapBtn:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 4 },
  urlRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  orLine:      { flex: 1, height: 1 },
  deleteBtn:   { borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modeChip:    { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  dropdown:    { position: 'absolute', top: '100%', left: 0, right: 0, borderWidth: 1, borderRadius: 12, overflow: 'hidden', zIndex: 200, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8 },
  dropdownItem:{ padding: 12, borderBottomWidth: 1 },
  panel:       { borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  panelSection:{ padding: 16 },
  toggleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  checkinRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }
} );

// ─── Desktop Table Row ────────────────────────────────────────────────────────

function TableRow({ event, catMap, onEdit, onCancel, onScan }: {
  event: Event; catMap: Record<string, EventCategory>; onEdit: () => void; onCancel: () => void; onScan: () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [menuOpen, setMenuOpen] = useState(false);
  const d      = fmtDate(displayDate(event));
  const status = eventStatus(event);
  const statusLabel = STATUS_LABEL[status];
  const statusColor = status === 'past' ? c.textSubtle : STATUS_COLOR[status];
  const cat         = (event as any).category_id ? catMap[(event as any).category_id] : null;

  return (
    <Pressable
      onPress={() => router.push(`/(admin)/events-management/${(event as any).event_code ?? event.id}` as any)}
      style={({ pressed }) => [tr.row, { borderBottomColor: c.border, backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}
    >
      <View style={[tr.dateBadge, { backgroundColor: c.surfaceAlt }]}>
        <Text size="xs" weight="medium" color={c.textSubtle}>{d.month}</Text>
        <Text size="md" weight="bold">{d.day}</Text>
      </View>
      <View style={{ flex: 2, gap: 2 }}>
        <Text size="sm" weight="medium">{event.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {cat && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: cat.color + '20', borderWidth: 1, borderColor: cat.color + '60',
              borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cat.color }} />
              <Text size="xs" color={cat.color} weight="medium">{cat.name}</Text>
            </View>
          )}
          {(event as any).recurrence_rule && (
            <View style={[tr.recurBadge, { backgroundColor: c.primary + '18', borderColor: c.primary + '50' }]}>
              <Ionicons name="repeat" size={9} color={c.primary} />
              <Text size="xs" color={c.primary}>Recurring</Text>
            </View>
          )}
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {(event as any).meeting_url ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="videocam-outline" size={13} color={c.primary} />
            <Text size="sm" color={c.primary} numberOfLines={1}>Remote</Text>
          </View>
        ) : (
          <Text size="sm" color={c.textMuted} numberOfLines={1}>{event.location ?? '—'}</Text>
        )}
      </View>
      <Text size="sm" color={c.textMuted} style={{ width: 60, textAlign: 'center' }}>—</Text>
      <View style={[tr.statusChip, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
        <Text size="xs" weight="medium" color={statusColor}>{statusLabel}</Text>
      </View>
      {/* Scan QR button — only shown for ongoing events */}
      {status === 'ongoing' ? (
        <Pressable
          onPress={(e) => { e.stopPropagation?.(); onScan(); }}
          style={[tr.scanBtn, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B' }]}
        >
          <Ionicons name="qr-code-outline" size={13} color="#F59E0B" />
          <Text size="xs" weight="medium" style={{ color: '#F59E0B' }}>Scan QR</Text>
        </Pressable>
      ) : (
        <View style={{ width: 80 }} />
      )}
      <View style={{ width: 36, position: 'relative' }}>
        <Pressable onPress={(e) => { e.stopPropagation?.(); setMenuOpen(!menuOpen); }} style={{ padding: 8 }}>
          <Text size="md" color={c.textSubtle}>···</Text>
        </Pressable>
        {menuOpen && (
          <View style={[tr.menu, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Pressable onPress={(e) => { e.stopPropagation?.(); setMenuOpen(false); onEdit(); }}
              style={[tr.menuItem, { borderBottomColor: c.border }]}>
              <Text size="sm">Edit</Text>
            </Pressable>
            {status !== 'cancelled' && status !== 'past' && (
              <Pressable onPress={(e) => { e.stopPropagation?.(); setMenuOpen(false); onCancel(); }} style={tr.menuItem}>
                <Text size="sm" color="#EF4444">Cancel</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const tr = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1 },
  dateBadge:  { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recurBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  statusChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, width: 90, alignItems: 'center' },
  scanBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, width: 80, justifyContent: 'center' },
  menu:       { position: 'absolute', right: 0, top: 28, zIndex: 200, borderWidth: 1, borderRadius: 10, width: 120, overflow: 'hidden' },
  menuItem:   { padding: 12, borderBottomWidth: 1 }
} );

// ─── Mobile Card ─────────────────────────────────────────────────────────────

function MobileCard({ event, catMap, onEdit, onScan }: { event: Event; catMap: Record<string, EventCategory>; onEdit: () => void; onScan: () => void }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const d      = fmtDate(displayDate(event));
  const status = eventStatus(event);
  const statusColor = status === 'past' ? c.textSubtle : STATUS_COLOR[status];
  const cat         = (event as any).category_id ? catMap[(event as any).category_id] : null;

  return (
    <Pressable
      onPress={() => router.push(`/(admin)/events-management/${(event as any).event_code ?? event.id}` as any)}
      style={[mc.card, { backgroundColor: c.surface, borderColor: c.border }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={[mc.dateBadge, { backgroundColor: c.surfaceAlt }]}>
          <Text size="xs" weight="medium" color={c.textSubtle}>{d.month}</Text>
          <Text size="md" weight="bold">{d.day}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text size="sm" weight="medium">{event.title}</Text>
          {cat && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: cat.color + '20', borderWidth: 1, borderColor: cat.color + '60',
              borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cat.color }} />
              <Text size="xs" color={cat.color} weight="medium">{cat.name}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text size="xs" color={c.textSubtle}>{d.time}</Text>
              {(event as any).meeting_url ? (
                <>
                  <Text size="xs" color={c.textSubtle}>·</Text>
                  <Ionicons name="videocam-outline" size={11} color={c.primary} />
                  <Text size="xs" color={c.primary}>Remote</Text>
                </>
              ) : (
                event.location ? (
                  <><Text size="xs" color={c.textSubtle}>·</Text>
                  <Text size="xs" color={c.textSubtle}>{event.location}</Text></>
                ) : null
              )}
            </View>
          {(event as any).recurrence_rule && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Ionicons name="repeat" size={11} color={c.primary} />
              <Text size="xs" color={c.primary}>Recurring</Text>
            </View>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={[mc.statusChip, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
            <Text size="xs" weight="medium" color={statusColor}>
              {STATUS_LABEL[status]}
            </Text>
          </View>
          {status === 'ongoing' ? (
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); onScan(); }}
              style={[mc.scanBtn, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B' }]}
            >
              <Ionicons name="qr-code-outline" size={13} color="#F59E0B" />
              <Text size="xs" weight="medium" style={{ color: '#F59E0B' }}>Scan QR</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); onEdit(); }}
              style={[mc.editBtn, { borderColor: c.border }]}
            >
              <Ionicons name="create-outline" size={13} color={c.textSubtle} />
              <Text size="xs" color={c.textSubtle}>Edit</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const mc = StyleSheet.create({
  card:       { borderWidth: 1, borderRadius: 14, padding: 14 },
  dateBadge:  { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statusChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  editBtn:    { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  scanBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 }
} );

// ─── Screen ───────────────────────────────────────────────────────────────────

const TABS = ['All', 'Upcoming', 'Past', 'Drafts'] as const;
type Tab = typeof TABS[number];

export default function AdminEventsScreen() {
  const { theme }      = useThemeStore();
  const insets         = useSafeAreaInsets();
  const { membership, organization, profile } = useAuthStore();
  const { width }      = useWindowDimensions();
  const isWide         = width >= DESKTOP;
  const { showAlert, confirm } = useAlert();
  const c              = theme.colors;
  const orgId = membership?.org_id ?? '';
  const orgSlug        = (organization as any)?.slug ?? '';
  const { edit: editId, new: openNew } = useLocalSearchParams<{ edit?: string; new?: string }>();

  const [events,   setEvents]   = useState<Event[]>([]);
  const [catMap,   setCatMap]   = useState<Record<string, EventCategory>>({});
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);
  const [tab,      setTab]      = useState<Tab>('Upcoming');
  const [editing,       setEditing]      = useState<Event | null | false>(false);
  const [saving,        setSaving]       = useState(false);
  const [codeErrorMsg,  setCodeErrorMsg] = useState<string | null>(null);
  const [scanTarget,    setScanTarget]   = useState<Event | null>(null);

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    const [evRes, occRes, catRes] = await Promise.all([
      // Master events (non-occurrences): All/Past/Drafts tabs + edit actions
      supabase.from('events').select('*')
        .eq('org_id', orgId).eq('is_deleted', false)
        .eq('is_occurrence', false)
        .order('start_time', { ascending: false }),
      // Upcoming occurrences (children of recurring masters)
      supabase.from('events').select('*')
        .eq('org_id', orgId).eq('is_deleted', false)
        .eq('is_occurrence', true)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true }),
      supabase.from('event_categories').select('id, name, color')
        .eq('org_id', orgId).eq('is_deleted', false),
    ]);
    const masters    = (evRes.data  ?? []) as Event[];
    const upcomingOcc= (occRes.data ?? []) as Event[];
    // Merge: masters + upcoming occurrences (dedup by id)
    const seen = new Set<string>(masters.map(e => e.id));
    const merged = [...masters];
    for (const occ of upcomingOcc) {
      if (!seen.has(occ.id)) { merged.push(occ); seen.add(occ.id); }
    }
    setEvents(merged);
    const map: Record<string, EventCategory> = {};
    for (const cat of (catRes.data ?? []) as EventCategory[]) map[cat.id] = cat;
    setCatMap(map);
    setLoading(false);
    setRefresh(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  // Auto-open edit form when navigated from [id].tsx with ?edit=<id>
  useEffect(() => {
    if (!editId || loading || events.length === 0) return;
    const target = events.find(e => e.id === editId);
    if (target) {
      setEditing(target);
      router.setParams({ edit: '' });
    }
  }, [editId, loading, events]);

  // Auto-open new event form when navigated from calendar with ?new=1
  useEffect(() => {
    if (openNew !== '1' || loading) return;
    setEditing(null);
    router.setParams({ new: '' });
  }, [openNew, loading]);

  const upcomingCount = events.filter(e => { const s = eventStatus(e); return s === 'upcoming' || s === 'ongoing'; }).length;
  const pastCount     = events.filter(e => eventStatus(e) === 'past').length;

  const displayed = events.filter(e => {
    const s = eventStatus(e);
    if (tab === 'Upcoming') return s === 'upcoming' || s === 'ongoing';
    if (tab === 'Past')     return s === 'past';
    if (tab === 'Drafts')   return false;
    return true;
  });

  async function handleSave(form: EventFormState) {
    if (!orgId) return;
    setSaving(true);
    try {
      const startDate = form.isMultiDay ? form.dateRange.start : form.dateObj;
      const endDate   = form.isMultiDay ? form.dateRange.end   : form.dateObj;
      const startIso  = combineDateTime(startDate, form.startTimeObj);
      const endIso    = form.isMultiDay
        ? combineDateTime(endDate, form.endTimeObj)
        : form.hasEndTime ? combineDateTime(form.dateObj, form.endTimeObj) : null;
      const rrule    = buildRRule(form.recurrence);

      const isRemote = form.location_type === 'remote';
      const payload: any = {
        title:             form.title.trim(),
        type:              'event',
        description:       form.description.trim() || null,
        location:          isRemote ? null : (form.location_text.trim() || null),
        location_id:       isRemote ? null : (form.location_id ?? null),
        location_lat:      isRemote ? null : (form.location_lat ?? null),
        location_lng:      isRemote ? null : (form.location_lng ?? null),
        meeting_url:       isRemote ? (form.meeting_url.trim() || null) : null,
        start_time:        startIso,
        end_time:          endIso,
        is_mandatory:      form.is_mandatory,
        rsvp_required:     form.rsvp_required,
        allow_excuses:     form.allow_excuses,
        qr_checkin:        form.qr_checkin,
        geofence_required:    isRemote ? false : form.geofence_required,
        points:               parseInt(form.points) || 0,
        recurrence_rule:      rrule,
        checkin_open_minutes:  form.checkin_open_minutes.trim()  !== '' ? parseInt(form.checkin_open_minutes)  || null : null,
        checkin_grace_minutes: form.checkin_grace_minutes.trim() !== '' ? parseInt(form.checkin_grace_minutes) || null : null,
        is_public:             form.is_public,
        event_code:            form.event_code.trim() || null,
        category_id:           form.category_id ?? null
} ;

      const editingEvent: Event | null = editing === false || editing === null ? null : editing;
      if (editingEvent?.id) {
        const { error } = await supabase.from('events').update(payload).eq('id', editingEvent.id);
        if (error?.code === '23505') { setCodeErrorMsg('That event code is already in use. Choose a different one or tap ↺ to generate a new one.'); setSaving(false); return; }
        if (error) throw error;
      } else {
        const { error } = await supabase.from('events').insert({ ...payload, org_id: orgId, created_by: profile?.id ?? null });
        if (error?.code === '23505') { setCodeErrorMsg('That event code is already in use. Choose a different one or tap ↺ to generate a new one.'); setSaving(false); return; }
        if (error) throw error;
      }
      await load();
      setCodeErrorMsg(null);
      setEditing(false);
    } catch {
      showAlert('Error', 'Failed to save event.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(event: Event, mode: 'this' | 'series') {
    try {
      const isMaster = !!(event as any).recurrence_rule && !(event as any).is_occurrence;
      const parentId = (event as any).parent_event_id as string | null;

      if (mode === 'series') {
        const masterId = isMaster ? event.id : (parentId ?? event.id);
        const { error: e1 } = await supabase.from('events').update({ is_deleted: true }).eq('id', masterId);
        if (e1) throw e1;
        const { error: e2 } = await supabase.from('events').update({ is_deleted: true }).eq('parent_event_id', masterId);
        if (e2) throw e2;
      } else {
        const { error } = await supabase.from('events').update({ is_deleted: true }).eq('id', event.id);
        if (error) throw error;
      }

      await load();
      setEditing(false);
    } catch (err: any) {
      showAlert('Error', err?.message ?? 'Failed to delete event.');
    }
  }

  async function handleCancel(event: Event) {
    confirm(
      'Cancel Event',
      `Cancel "${event.title}"?`,
      async () => {
        await supabase.from('events').update({ is_cancelled: true }).eq('id', event.id);
        await load();
      },
      { confirmLabel: 'Cancel Event', destructive: true }
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={[sc.header, { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.background, borderBottomColor: c.border }]}>
        <View style={{ flex: 1 }}>
          <Text size="xxl" weight="bold">Events</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {upcomingCount} upcoming · {pastCount} past
          </Text>
        </View>
        <View style={sc.headerActions}>
          {isWide && (
            <Pressable style={[sc.importBtn, { borderColor: c.border }]}>
              <Text size="sm" weight="medium">Import</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push('/(admin)/locations' as any)}
            style={[sc.iconBtn, { borderColor: c.border }]}
          >
            <Ionicons name="location-outline" size={16} color={c.text} />
            {isWide && <Text size="sm" weight="medium">Locations</Text>}
          </Pressable>
          <Pressable
            onPress={() => router.push('/(admin)/categories' as any)}
            style={[sc.iconBtn, { borderColor: c.border }]}
          >
            <Ionicons name="pricetag-outline" size={16} color={c.text} />
            {isWide && <Text size="sm" weight="medium">Categories</Text>}
          </Pressable>
          <Pressable onPress={() => setEditing(null)} style={[sc.newBtn, { backgroundColor: c.primary }]}>
            <Ionicons name="add" size={16} color="#fff" />
            {isWide && <Text size="sm" weight="medium" style={{ color: '#fff' }}>New event</Text>}
            {!isWide && <Text size="sm" weight="medium" style={{ color: '#fff' }}>New</Text>}
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sc.tabRow}
        style={{ flexShrink: 0, flexGrow: 0, backgroundColor: c.background, borderBottomWidth: 1, borderBottomColor: c.border }}>
        {TABS.map(t => {
          const count  = t === 'Upcoming' ? upcomingCount : t === 'Past' ? pastCount : null;
          const active = tab === t;
          return (
            <Pressable key={t} onPress={() => setTab(t)}
              style={[sc.tabChip, { backgroundColor: active ? c.surfaceAlt : 'transparent', borderColor: active ? c.border : 'transparent' }]}>
              <Text size="sm" weight={active ? 'medium' : 'regular'} color={active ? c.text : c.textMuted}>
                {t}{count !== null ? ` · ${count}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isWide && (
        <View style={[sc.tableHeader, { backgroundColor: c.background, borderBottomColor: c.border }]}>
          {[['EVENT', 2], ['DATE', 0], ['LOCATION', 1], ['RSVPS', 0], ['STATUS', 0]].map(([label, flex]) => (
            <Text key={label as string} size="xs" weight="medium" color={c.textSubtle}
              style={[{ textTransform: 'uppercase', letterSpacing: 1 }, flex ? { flex: flex as number } : { width: label === 'RSVPS' ? 60 : 90 }]}>
              {label as string}
            </Text>
          ))}
          <View style={{ width: 36 }} />
        </View>
      )}

      <ScrollView
        contentContainerStyle={isWide ? undefined : [sc.mobileScroll, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(); }} tintColor={c.primary} />}
        showsVerticalScrollIndicator={false}>
        {displayed.length === 0 ? (
          <View style={sc.empty}>
            <Ionicons name="calendar-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              No {tab.toLowerCase()} events
            </Text>
            <Pressable onPress={() => setEditing(null)} style={{ marginTop: 12 }}>
              <Text size="sm" color={c.primary} weight="medium">+ Create one</Text>
            </Pressable>
          </View>
        ) : isWide ? (
          displayed.map(e => (
            <TableRow key={e.id} event={e} catMap={catMap} onEdit={() => setEditing(e)} onCancel={() => handleCancel(e)} onScan={() => setScanTarget(e)} />
          ))
        ) : (
          <View style={{ gap: 10 }}>
            {displayed.map(e => <MobileCard key={e.id} event={e} catMap={catMap} onEdit={() => setEditing(e)} onScan={() => setScanTarget(e)} />)}
          </View>
        )}
      </ScrollView>

      <EventForm
        visible={editing !== false}
        initial={editing || null}
        orgId={orgId}
        orgSlug={orgSlug}
        onClose={() => { setCodeErrorMsg(null); setEditing(false); }}
        onSave={handleSave}
        onDelete={handleDelete}
        saving={saving}
        codeErrorMsg={codeErrorMsg}
        onClearCodeError={() => setCodeErrorMsg(null)}
      />

      {scanTarget && (
        <QRCheckinModal
          visible={!!scanTarget}
          eventId={scanTarget.id}
          orgId={orgId}
          onClose={() => setScanTarget(null)}
        />
      )}
    </View>
  );
}

const sc = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  importBtn:     { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  iconBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  newBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  tabRow:        { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  tabChip:       { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  tableHeader:   { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1 },
  mobileScroll:  { padding: 14, gap: 10, paddingBottom: 48 },
  empty:         { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }
} );
