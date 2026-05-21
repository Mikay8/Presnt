/**
 * Officer — Events
 *
 * Desktop: table view (date column, title, location, RSVPs, status, ··· menu)
 * Mobile:  card list with MAR date badge, Upcoming/Past segmented tabs
 *
 * Create / Edit: full-screen form matching wireframe:
 *   BASICS — title, type dropdown, mandatory toggle
 *   WHEN   — date picker, start time, end time, repeat option
 *   WHERE  — saved location picker (+ save new)
 *   DESCRIPTION — multiline
 *   Right panel (desktop) / bottom section (mobile):
 *     toggles: required attendance, QR check-in, geofence, allow excuses, public RSVP
 *     points + "counts toward" chips
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';
import type { Tables } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

type Event = Tables<'events'> & {
  location_id?:       string | null;
  is_mandatory?:      boolean | null;
  allow_excuses?:     boolean | null;
  qr_checkin?:        boolean | null;
  geofence_required?: boolean | null;
  points?:            number | null;
};

type OrgLocation = {
  id:            string;
  name:          string;
  address:       string | null;
  radius_meters: number | null;
};

const EVENT_TYPES = [
  { value: 'meeting',     label: 'Chapter mtg' },
  { value: 'social',      label: 'Social' },
  { value: 'service',     label: 'Service' },
  { value: 'fundraiser',  label: 'Fundraiser' },
  { value: 'workshop',    label: 'Workshop' },
  { value: 'other',       label: 'Other' },
] as const;

type EventFormState = {
  title:            string;
  type:             string;
  is_mandatory:     boolean;
  date:             string; // 'Mar 14, 2026' display string
  start_time:       string; // 'HH:MM'
  end_time:         string;
  location_id:      string | null;
  location_text:    string; // free-text fallback
  description:      string;
  // Settings
  required_attendance: boolean;
  qr_checkin:          boolean;
  geofence_required:   boolean;
  allow_excuses:       boolean;
  rsvp_required:       boolean;
  points:              string;
};

const BLANK_FORM: EventFormState = {
  title: '', type: 'meeting', is_mandatory: false,
  date: '', start_time: '', end_time: '',
  location_id: null, location_text: '',
  description: '',
  required_attendance: true, qr_checkin: true, geofence_required: true,
  allow_excuses: true, rsvp_required: false,
  points: '2',
};

const DESKTOP = 768;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day:   d.getDate(),
    full:  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time:  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

function isUpcoming(event: Event) { return new Date(event.start_time) > new Date(); }

function isoFromForm(date: string, time: string): string {
  // date: "Mar 14, 2026", time: "7:00 PM" or "19:00"
  try {
    const d = new Date(`${date} ${time}`);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch { return new Date().toISOString(); }
}

function formFromEvent(e: Event): EventFormState {
  const d = new Date(e.start_time);
  const end = e.end_time ? new Date(e.end_time) : null;
  return {
    title:          e.title,
    type:           e.type,
    is_mandatory:   !!(e as any).is_mandatory,
    date:           d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    start_time:     d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    end_time:       end ? end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
    location_id:    (e as any).location_id ?? null,
    location_text:  e.location ?? '',
    description:    e.description ?? '',
    required_attendance: true,
    qr_checkin:     !!( e as any).qr_checkin,
    geofence_required: !!(e as any).geofence_required,
    allow_excuses:  (e as any).allow_excuses !== false,
    rsvp_required:  !!e.rsvp_required,
    points:         String((e as any).points ?? 2),
  };
}

// ─── Location Picker Modal ────────────────────────────────────────────────────

function LocationPickerModal({
  visible,
  orgId,
  selectedId,
  onSelect,
  onClose,
}: {
  visible:    boolean;
  orgId:      string;
  selectedId: string | null;
  onSelect:   (loc: OrgLocation | null, freeText?: string) => void;
  onClose:    () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const [locations, setLocations] = useState<OrgLocation[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [pending, setPending]     = useState<string | null>(selectedId);

  useEffect(() => {
    if (!visible) return;
    supabase
      .from('org_locations')
      .select('id, name, address, radius_meters')
      .eq('org_id', orgId)
      .eq('is_deleted', false)
      .order('name')
      .then(({ data }) => {
        setLocations((data ?? []) as OrgLocation[]);
        setLoading(false);
      });
  }, [visible, orgId]);

  const filtered = locations.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.address ?? '').toLowerCase().includes(search.toLowerCase())
  );

  function confirm() {
    const loc = locations.find(l => l.id === pending) ?? null;
    onSelect(loc);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={lp.overlay}>
        <View style={[lp.sheet, { backgroundColor: c.surface }]}>
          <View style={[lp.handle, { backgroundColor: c.border }]} />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <Text size="xl" weight="bold">Choose location</Text>
            <Pressable
              onPress={() => router.push('/(officer)/locations' as any)}
              style={[lp.newBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
            >
              <Text size="sm" weight="medium" color={c.text}>+ New</Text>
            </Pressable>
          </View>

          {/* Search */}
          <View style={[lp.searchBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
            <Ionicons name="search-outline" size={15} color={c.textSubtle} />
            <TextInput
              style={{ flex: 1, fontSize: 14, color: c.text }}
              value={search}
              onChangeText={setSearch}
              placeholder="Search or paste address…"
              placeholderTextColor={c.textSubtle}
            />
          </View>

          <Text size="xs" weight="medium" color={c.textMuted}
            style={{ textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 16, marginBottom: 10 }}>
            Saved
          </Text>

          {loading ? (
            <ActivityIndicator color={c.primary} />
          ) : (
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {filtered.length === 0 ? (
                <Text size="sm" color={c.textSubtle} style={{ textAlign: 'center', paddingVertical: 24 }}>
                  No saved locations yet
                </Text>
              ) : (
                filtered.map((loc) => {
                  const selected = pending === loc.id;
                  return (
                    <Pressable
                      key={loc.id}
                      onPress={() => setPending(loc.id)}
                      style={[lp.locRow, {
                        backgroundColor: selected ? c.primary + '10' : 'transparent',
                        borderColor:     selected ? c.primary : c.border,
                        borderWidth:     selected ? 1.5 : 1,
                        marginBottom:    8,
                      }]}
                    >
                      <Ionicons name="location" size={16} color={selected ? c.primary : c.textSubtle} />
                      <View style={{ flex: 1 }}>
                        <Text size="sm" weight="medium" color={selected ? c.primary : c.text}>{loc.name}</Text>
                        {loc.address && <Text size="xs" color={c.textSubtle}>{loc.address}</Text>}
                      </View>
                      {selected && (
                        <View style={[lp.checkCircle, { backgroundColor: c.primary }]}>
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        </View>
                      )}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          )}

          <Pressable
            onPress={confirm}
            style={[lp.useBtn, { backgroundColor: c.primary, marginTop: 20 }]}
          >
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
  handle:      { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  newBtn:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  locRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 14 },
  checkCircle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  useBtn:      { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
});

// ─── Event Form (full screen modal) ──────────────────────────────────────────

function EventForm({
  visible,
  initial,
  orgId,
  onClose,
  onSave,
  saving,
}: {
  visible:  boolean;
  initial:  Event | null;
  orgId:    string;
  onClose:  () => void;
  onSave:   (form: EventFormState) => void;
  saving:   boolean;
}) {
  const { theme } = useThemeStore();
  const { width } = useWindowDimensions();
  const isWide    = width >= DESKTOP;
  const c = theme.colors;

  const [form, setForm]         = useState<EventFormState>(BLANK_FORM);
  const [showLocPicker, setShowLocPicker] = useState(false);
  const [savedLoc, setSavedLoc] = useState<OrgLocation | null>(null);
  const [showTypeMenu, setShowTypeMenu]   = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(initial ? formFromEvent(initial) : { ...BLANK_FORM });
      setSavedLoc(null);
    }
  }, [visible, initial]);

  const set = <K extends keyof EventFormState>(k: K) =>
    (v: EventFormState[K]) => setForm(f => ({ ...f, [k]: v }));

  const inputStyle = [ef.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }];

  const isEdit    = !!initial;
  const typeLabel = EVENT_TYPES.find(t => t.value === form.type)?.label ?? form.type;

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
            <Switch
              value={!!form[key]}
              onValueChange={(v) => set(key)(v as any)}
              trackColor={{ false: c.border, true: c.primary }}
              thumbColor="#fff"
            />
          </View>
        ))}
      </View>

      <View style={[ef.panelSection, { marginTop: 12, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12 }]}>
        <Text size="xs" weight="medium" color={c.textMuted}
          style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          Points
        </Text>
        <View style={[ef.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, paddingVertical: 10 }]}>
          <TextInput
            style={{ fontSize: 14, color: c.text }}
            value={form.points}
            onChangeText={set('points')}
            keyboardType="number-pad"
            placeholderTextColor={c.textSubtle}
          />
        </View>
        <Text size="xs" weight="medium" color={c.textMuted}
          style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 12, marginBottom: 8 }}>
          Counts toward
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {['Attendance', 'Philanthropy', 'Socials'].map((cat) => (
            <View key={cat} style={[ef.countChip, { backgroundColor: c.primary + '18', borderColor: c.primary }]}>
              <Text size="xs" weight="medium" color={c.primary}>{cat}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  const formBody = (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[ef.formScroll, isWide && ef.formScrollWide]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {isWide ? (
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
          {/* Main column */}
          <View style={{ flex: 1 }}>
            {formFields()}
          </View>
          {/* Settings panel */}
          <View style={{ width: 280 }}>
            {settingsPanel}
          </View>
        </View>
      ) : (
        <>
          {formFields()}
          {settingsPanel}
        </>
      )}

      {/* Delete button — edit mode only, mobile bottom */}
      {isEdit && !isWide && (
        <Pressable
          onPress={handleDelete}
          style={[ef.deleteBtn, { borderColor: '#EF4444' }]}
        >
          <Text size="sm" weight="medium" color="#EF4444">Delete event</Text>
        </Pressable>
      )}
    </ScrollView>
  );

  function formFields() {
    return (
      <View style={[ef.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        {/* BASICS */}
        <Text size="xs" weight="medium" color={c.textMuted} style={ef.sectionLabel}>BASICS</Text>
        <Text size="xs" weight="medium" color={c.textSubtle} style={ef.fieldLabel}>TITLE</Text>
        <TextInput
          style={[inputStyle, { marginBottom: 12 }]}
          value={form.title}
          onChangeText={set('title')}
          placeholder="e.g. Chapter meeting · week 6"
          placeholderTextColor={c.textSubtle}
        />

        {/* Type + Mandatory row */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 0 }}>
          <Text size="xs" weight="medium" color={c.textSubtle} style={[ef.fieldLabel, { flex: 1 }]}>TYPE</Text>
          <Text size="xs" weight="medium" color={c.textSubtle} style={ef.fieldLabel}>MANDATORY</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          {/* Type dropdown */}
          <Pressable
            onPress={() => setShowTypeMenu(!showTypeMenu)}
            style={[inputStyle, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }]}
          >
            <Text size="sm" color={c.text}>{typeLabel}</Text>
            <Ionicons name="chevron-down" size={14} color={c.textSubtle} />
          </Pressable>
          {showTypeMenu && (
            <View style={[ef.dropdown, { backgroundColor: c.surface, borderColor: c.border }]}>
              {EVENT_TYPES.map((t) => (
                <Pressable
                  key={t.value}
                  onPress={() => { set('type')(t.value); setShowTypeMenu(false); }}
                  style={[ef.dropdownItem, { borderBottomColor: c.border }]}
                >
                  <Text size="sm" color={form.type === t.value ? c.primary : c.text}
                    weight={form.type === t.value ? 'medium' : 'regular'}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {/* Mandatory toggle */}
          <View style={[inputStyle, { justifyContent: 'center', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, minWidth: 100 }]}>
            <Switch
              value={form.is_mandatory}
              onValueChange={set('is_mandatory')}
              trackColor={{ false: c.border, true: c.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* WHEN */}
        <Text size="xs" weight="medium" color={c.textMuted} style={ef.sectionLabel}>WHEN</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
          <Text size="xs" weight="medium" color={c.textSubtle} style={[ef.fieldLabel, { flex: 2 }]}>DATE</Text>
          <Text size="xs" weight="medium" color={c.textSubtle} style={[ef.fieldLabel, { flex: 1 }]}>START</Text>
          <Text size="xs" weight="medium" color={c.textSubtle} style={[ef.fieldLabel, { flex: 1 }]}>END</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <TextInput
            style={[inputStyle, { flex: 2, paddingVertical: 12 }]}
            value={form.date}
            onChangeText={set('date')}
            placeholder="Mar 14, 2026"
            placeholderTextColor={c.textSubtle}
          />
          <TextInput
            style={[inputStyle, { flex: 1, paddingVertical: 12, textAlign: 'center' }]}
            value={form.start_time}
            onChangeText={set('start_time')}
            placeholder="7:00 PM"
            placeholderTextColor={c.textSubtle}
          />
          <TextInput
            style={[inputStyle, { flex: 1, paddingVertical: 12, textAlign: 'center' }]}
            value={form.end_time}
            onChangeText={set('end_time')}
            placeholder="9:00 PM"
            placeholderTextColor={c.textSubtle}
          />
        </View>

        {/* WHERE */}
        <Text size="xs" weight="medium" color={c.textMuted} style={ef.sectionLabel}>WHERE</Text>
        <Pressable
          onPress={() => setShowLocPicker(true)}
          style={[ef.locRow, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
        >
          <Ionicons name="location" size={16} color={c.primary} />
          <View style={{ flex: 1 }}>
            {savedLoc ? (
              <>
                <Text size="sm" weight="medium">{savedLoc.name}</Text>
                {savedLoc.address && <Text size="xs" color={c.textSubtle}>{savedLoc.address}</Text>}
              </>
            ) : form.location_text ? (
              <Text size="sm" color={c.text}>{form.location_text}</Text>
            ) : (
              <Text size="sm" color={c.textSubtle}>Tap to choose location</Text>
            )}
          </View>
          {(savedLoc || form.location_text) && (
            <Pressable onPress={() => setShowLocPicker(true)}>
              <Text size="xs" weight="medium" color={c.primary}>Change</Text>
            </Pressable>
          )}
        </Pressable>
        {savedLoc && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 4 }}>
            <View style={[ef.orangeDot, { backgroundColor: c.primary }]} />
            <Text size="xs" color={c.textMuted}>
              Geofence check-in · {savedLoc.radius_meters ?? 100}m radius
            </Text>
          </View>
        )}

        {/* DESCRIPTION */}
        <Text size="xs" weight="medium" color={c.textMuted} style={[ef.sectionLabel, { marginTop: 20 }]}>
          DESCRIPTION
        </Text>
        <TextInput
          style={[inputStyle, { height: 96, textAlignVertical: 'top', paddingTop: 12 }]}
          value={form.description}
          onChangeText={set('description')}
          placeholder="Add details, agenda, links…"
          placeholderTextColor={c.textSubtle}
          multiline
        />

        {/* Delete — desktop only inside card */}
        {isEdit && isWide && (
          <Pressable
            onPress={handleDelete}
            style={[ef.deleteBtn, { borderColor: '#EF4444', marginTop: 20 }]}
          >
            <Text size="sm" weight="medium" color="#EF4444">Delete event</Text>
          </Pressable>
        )}
      </View>
    );
  }

  function handleDelete() {
    Alert.alert('Delete Event', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (!initial) return;
          await supabase.from('events').update({ is_deleted: true }).eq('id', initial.id);
          onClose();
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: c.background }}>
        {/* Header */}
        <View style={[ef.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
          <Pressable onPress={onClose} style={ef.closeBtn}>
            <Ionicons name="close" size={18} color={c.text} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text size="md" weight="bold">{isEdit ? 'Edit event' : 'New event'}</Text>
            <View style={[ef.formProgress, { backgroundColor: c.border }]}>
              <View style={[ef.formProgressFill, { backgroundColor: c.primary, width: '60%' }]} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {isEdit && (
              <Pressable
                style={[ef.headerBtn, { borderColor: c.border }]}
                onPress={() => onSave({ ...form, _draft: true } as any)}
              >
                <Text size="sm" weight="medium">Save draft</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => onSave(form)}
              disabled={saving || !form.title.trim()}
              style={[ef.postBtn, { backgroundColor: c.primary, opacity: saving ? 0.6 : 1 }]}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text size="sm" weight="bold" style={{ color: '#fff' }}>
                    {isEdit ? 'Save changes' : 'Post event'}
                  </Text>
              }
            </Pressable>
          </View>
        </View>

        {formBody}
      </View>

      <LocationPickerModal
        visible={showLocPicker}
        orgId={orgId}
        selectedId={form.location_id}
        onSelect={(loc) => {
          setSavedLoc(loc);
          setForm(f => ({ ...f, location_id: loc?.id ?? null, location_text: loc?.name ?? f.location_text }));
          setShowLocPicker(false);
        }}
        onClose={() => setShowLocPicker(false)}
      />
    </Modal>
  );
}

const ef = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  closeBtn:      { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0000000A' },
  headerBtn:     { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  postBtn:       { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  formProgress:  { height: 3, width: 80, borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  formProgressFill: { height: '100%', borderRadius: 2 },
  formScroll:    { padding: 20, paddingBottom: 60 },
  formScrollWide:{ paddingHorizontal: 48, maxWidth: 1100, alignSelf: 'center', width: '100%' },
  card:          { borderWidth: 1, borderRadius: 16, padding: 20, marginBottom: 16 },
  sectionLabel:  { textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 },
  fieldLabel:    { textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontSize: 10 },
  input:         { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 14 },
  locRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 4 },
  orangeDot:     { width: 16, height: 16, borderRadius: 4 },
  dropdown:      { position: 'absolute', top: 46, left: 0, right: 0, zIndex: 100, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  dropdownItem:  { padding: 12, borderBottomWidth: 1 },
  deleteBtn:     { borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  panel:         { borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  panelSection:  { padding: 16 },
  toggleRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  countChip:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
});

// ─── Desktop Table Row ────────────────────────────────────────────────────────

function EventTableRow({
  event,
  onEdit,
  onCancel,
}: {
  event:    Event;
  onEdit:   (e: Event) => void;
  onCancel: (e: Event) => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [menuOpen, setMenuOpen] = useState(false);
  const d = fmtDate(event.start_time);
  const upcoming   = isUpcoming(event);
  const cancelled  = !!event.is_cancelled;
  const statusLabel = cancelled ? 'Cancelled' : upcoming ? 'Upcoming' : 'Past';
  const statusColor = cancelled ? '#EF4444' : upcoming ? '#22C55E' : c.textSubtle;

  return (
    <View style={[dt.row, { borderBottomColor: c.border }]}>
      {/* Date badge */}
      <View style={[dt.dateBadge, { backgroundColor: c.surfaceAlt }]}>
        <Text size="xs" weight="medium" color={c.textSubtle}>{d.month}</Text>
        <Text size="md" weight="bold">{d.day}</Text>
      </View>

      {/* Title + type */}
      <View style={{ flex: 2, gap: 2 }}>
        <Text size="sm" weight="medium">{event.title}</Text>
        <Text size="xs" color={c.textSubtle} style={{ textTransform: 'capitalize' }}>{event.type}</Text>
      </View>

      {/* Location */}
      <Text size="sm" color={c.textMuted} style={{ flex: 1 }} numberOfLines={1}>
        {event.location ?? '—'}
      </Text>

      {/* RSVPs placeholder */}
      <Text size="sm" color={c.textMuted} style={{ width: 60, textAlign: 'center' }}>—</Text>

      {/* Status */}
      <View style={[dt.statusChip, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
        <Text size="xs" weight="medium" color={statusColor}>{statusLabel}</Text>
      </View>

      {/* Menu */}
      <View style={{ width: 36, alignItems: 'center', position: 'relative' }}>
        <Pressable onPress={() => setMenuOpen(!menuOpen)} style={dt.menuBtn}>
          <Text size="md" color={c.textSubtle}>···</Text>
        </Pressable>
        {menuOpen && (
          <View style={[dt.menu, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Pressable onPress={() => { setMenuOpen(false); onEdit(event); }}
              style={[dt.menuItem, { borderBottomColor: c.border }]}>
              <Text size="sm">Edit</Text>
            </Pressable>
            {!cancelled && upcoming && (
              <Pressable onPress={() => { setMenuOpen(false); onCancel(event); }} style={dt.menuItem}>
                <Text size="sm" color="#EF4444">Cancel</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const dt = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1 },
  dateBadge:  { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statusChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, width: 90, alignItems: 'center' },
  menuBtn:    { padding: 8 },
  menu:       { position: 'absolute', right: 0, top: 28, zIndex: 200, borderWidth: 1, borderRadius: 10, width: 120, overflow: 'hidden' },
  menuItem:   { padding: 12, borderBottomWidth: 1 },
});

// ─── Mobile Event Card ────────────────────────────────────────────────────────

function EventCard({ event, onEdit }: { event: Event; onEdit: (e: Event) => void }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const d = fmtDate(event.start_time);
  const upcoming  = isUpcoming(event);
  const cancelled = !!event.is_cancelled;
  const statusColor = cancelled ? '#EF4444' : upcoming ? c.primary : c.textSubtle;

  return (
    <Pressable
      onPress={() => onEdit(event)}
      style={[mc.card, { backgroundColor: c.surface, borderColor: c.border }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        {/* Date badge */}
        <View style={[mc.dateBadge, { backgroundColor: c.surfaceAlt }]}>
          <Text size="xs" weight="medium" color={c.textSubtle}>{d.month}</Text>
          <Text size="md" weight="bold">{d.day}</Text>
        </View>

        {/* Content */}
        <View style={{ flex: 1, gap: 3 }}>
          <Text size="sm" weight="medium">{event.title}</Text>
          <Text size="xs" color={c.textSubtle}>{d.time} · {event.location ?? event.type}</Text>
        </View>

        {/* Status */}
        <View style={[mc.statusChip, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
          <Text size="xs" weight="medium" color={statusColor}>
            {cancelled ? 'Cancelled' : upcoming ? 'Upcoming' : 'Past'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const mc = StyleSheet.create({
  card:       { borderWidth: 1, borderRadius: 14, padding: 14 },
  dateBadge:  { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statusChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

const TABS = ['All', 'Upcoming', 'Past', 'Drafts'] as const;
type Tab   = typeof TABS[number];

export default function OfficerEventsScreen() {
  const { theme }      = useThemeStore();
  const insets         = useSafeAreaInsets();
  const { organization, membership, profile } = useAuthStore();
  const userView       = useUserViewStore((s) => s.session);
  const { width }      = useWindowDimensions();
  const isWide         = width >= DESKTOP;
  const c              = theme.colors;

  const orgId    = userView?.org.id ?? organization?.id ?? '';
  const canManage = userView
    ? userView.role === 'admin' || userView.permissions.includes('manage_events')
    : true; // already gated by tab visibility in _layout

  const [events, setEvents]     = useState<Event[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [tab, setTab]           = useState<Tab>('Upcoming');
  const [editTarget, setEdit]   = useState<Event | null | false>(false); // false=closed, null=new
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_deleted', false)
      .order('start_time', { ascending: false });
    setEvents((data ?? []) as Event[]);
    setLoading(false);
    setRefresh(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const upcomingCount = events.filter(e => isUpcoming(e) && !e.is_cancelled).length;
  const pastCount     = events.filter(e => !isUpcoming(e)).length;

  const displayed = events.filter(e => {
    if (tab === 'Upcoming') return isUpcoming(e) && !e.is_cancelled;
    if (tab === 'Past')     return !isUpcoming(e);
    if (tab === 'Drafts')   return false; // placeholder
    return true;
  });

  async function handleSave(form: EventFormState) {
    if (!orgId) return;
    setSaving(true);
    try {
      const payload: any = {
        title:            form.title.trim(),
        type:             form.type,
        description:      form.description.trim() || null,
        location:         form.location_text.trim() || null,
        location_id:      form.location_id ?? null,
        start_time:       isoFromForm(form.date, form.start_time),
        end_time:         form.end_time ? isoFromForm(form.date, form.end_time) : null,
        is_mandatory:     form.is_mandatory,
        rsvp_required:    form.rsvp_required,
        allow_excuses:    form.allow_excuses,
        qr_checkin:       form.qr_checkin,
        geofence_required: form.geofence_required,
        points:           parseInt(form.points) || 0,
      };

      if (editTarget && editTarget !== false && 'id' in editTarget) {
        await supabase.from('events').update(payload).eq('id', editTarget.id);
      } else {
        await supabase.from('events').insert({ ...payload, org_id: orgId, created_by: profile?.id ?? null });
      }

      await load();
      setEdit(false);
    } catch {
      Alert.alert('Error', 'Failed to save event.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(event: Event) {
    Alert.alert('Cancel Event', `Cancel "${event.title}"?`, [
      { text: 'Never mind', style: 'cancel' },
      {
        text: 'Cancel Event', style: 'destructive',
        onPress: async () => {
          await supabase.from('events').update({ is_cancelled: true }).eq('id', event.id);
          await load();
        },
      },
    ]);
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
      {/* ── Header ── */}
      <View style={[sc.header, { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.background, borderBottomColor: c.border }]}>
        <View>
          <Text size="xxl" weight="bold">Events</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {upcomingCount} upcoming · {pastCount} past
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {canManage && (
            <Pressable
              onPress={() => setEdit(null)}
              style={[sc.primaryBtn, { backgroundColor: c.primary }]}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text size="sm" weight="medium" style={{ color: '#fff' }}>
                {isWide ? '+ New event' : ''}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Tab bar ── */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={sc.tabRow}
        style={{ backgroundColor: c.background, borderBottomWidth: 1, borderBottomColor: c.border }}
      >
        {TABS.map((t) => {
          const active = tab === t;
          const count  = t === 'Upcoming' ? upcomingCount : t === 'Past' ? pastCount : null;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[sc.tabChip, {
                backgroundColor: active ? c.surfaceAlt : 'transparent',
                borderColor:     active ? c.border : 'transparent',
              }]}
            >
              <Text size="sm" weight={active ? 'medium' : 'regular'}
                color={active ? c.text : c.textMuted}>
                {t}{count !== null ? ` · ${count}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Desktop table header ── */}
      {isWide && (
        <View style={[sc.tableHeader, { backgroundColor: c.background, borderBottomColor: c.border }]}>
          {[['EVENT', 2], ['DATE', 0], ['LOCATION', 1], ['RSVPS', 0], ['STATUS', 0]].map(([label, flex]) => (
            <Text key={label as string} size="xs" weight="medium" color={c.textSubtle}
              style={[{ textTransform: 'uppercase', letterSpacing: 1 }, flex ? { flex: flex as number } : { width: label === 'RSVPS' ? 60 : 90 }]}>
              {label}
            </Text>
          ))}
          <View style={{ width: 36 }} />
        </View>
      )}

      {/* ── List ── */}
      <ScrollView
        contentContainerStyle={isWide ? undefined : sc.mobileScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefresh(true); load(); }} tintColor={c.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {displayed.length === 0 ? (
          <View style={sc.empty}>
            <Ionicons name="calendar-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              No {tab.toLowerCase()} events
            </Text>
            {canManage && (
              <Pressable onPress={() => setEdit(null)} style={{ marginTop: 12 }}>
                <Text size="sm" color={c.primary} weight="medium">+ Create one</Text>
              </Pressable>
            )}
          </View>
        ) : isWide ? (
          displayed.map(e => (
            <EventTableRow key={e.id} event={e} onEdit={setEdit} onCancel={handleCancel} />
          ))
        ) : (
          <View style={{ gap: 10 }}>
            {displayed.map(e => (
              <EventCard key={e.id} event={e} onEdit={(ev) => setEdit(ev)} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Create/Edit Form ── */}
      <EventForm
        visible={editTarget !== false}
        initial={editTarget || null}
        orgId={orgId}
        onClose={() => setEdit(false)}
        onSave={handleSave}
        saving={saving}
      />
    </View>
  );
}

const sc = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  primaryBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  tabRow:      { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tabChip:     { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  tableHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1 },
  mobileScroll:{ padding: 14, gap: 10, paddingBottom: 48 },
  empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
});
