/**
 * Admin — Events
 *
 * Full event management for admins (same as officer but always all permissions).
 * Reuses the same EventForm + table/card pattern.
 * Desktop: sidebar nav item; Mobile: tab bar.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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

const DESKTOP = 768;

// ─── Types ────────────────────────────────────────────────────────────────────

type Event = {
  id:               string;
  title:            string;
  type:             string;
  start_time:       string;
  end_time:         string | null;
  location:         string | null;
  location_id:      string | null;
  description:      string | null;
  is_cancelled:     boolean | null;
  is_mandatory:     boolean | null;
  rsvp_required:    boolean | null;
  allow_excuses:    boolean | null;
  qr_checkin:       boolean | null;
  geofence_required: boolean | null;
  points:           number | null;
};

type OrgLocation = { id: string; name: string; address: string | null; radius_meters: number | null };

const EVENT_TYPES = [
  { value: 'meeting', label: 'Chapter mtg' },
  { value: 'social', label: 'Social' },
  { value: 'service', label: 'Service' },
  { value: 'fundraiser', label: 'Fundraiser' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'other', label: 'Other' },
] as const;

type EventForm = {
  title: string; type: string; is_mandatory: boolean;
  date: string; start_time: string; end_time: string;
  location_id: string | null; location_text: string; description: string;
  required_attendance: boolean; qr_checkin: boolean; geofence_required: boolean;
  allow_excuses: boolean; rsvp_required: boolean; points: string;
};

const BLANK: EventForm = {
  title: '', type: 'meeting', is_mandatory: false,
  date: '', start_time: '', end_time: '',
  location_id: null, location_text: '', description: '',
  required_attendance: true, qr_checkin: true, geofence_required: true,
  allow_excuses: true, rsvp_required: false, points: '2',
};

function isUpcoming(e: Event) { return new Date(e.start_time) > new Date(); }

function fmtDate(iso: string) {
  const d = new Date(iso);
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day:   d.getDate(),
    full:  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time:  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

function isoFrom(date: string, time: string) {
  try { const d = new Date(`${date} ${time}`); return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); }
  catch { return new Date().toISOString(); }
}

function formFrom(e: Event): EventForm {
  const d   = new Date(e.start_time);
  const end = e.end_time ? new Date(e.end_time) : null;
  return {
    title: e.title, type: e.type, is_mandatory: !!e.is_mandatory,
    date:       d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    start_time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    end_time:   end ? end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
    location_id: e.location_id ?? null, location_text: e.location ?? '',
    description: e.description ?? '',
    required_attendance: true, qr_checkin: !!e.qr_checkin,
    geofence_required: !!e.geofence_required, allow_excuses: e.allow_excuses !== false,
    rsvp_required: !!e.rsvp_required, points: String(e.points ?? 2),
  };
}

// ─── Location picker modal ────────────────────────────────────────────────────

function LocationPicker({ visible, orgId, selectedId, onSelect, onClose }: {
  visible: boolean; orgId: string; selectedId: string | null;
  onSelect: (loc: OrgLocation | null) => void; onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [locs, setLocs]     = useState<OrgLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(selectedId);

  useEffect(() => {
    if (!visible) return;
    supabase.from('org_locations').select('id, name, address, radius_meters')
      .eq('org_id', orgId).eq('is_deleted', false).order('name')
      .then(({ data }) => { setLocs((data ?? []) as OrgLocation[]); setLoading(false); });
  }, [visible, orgId]);

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={lp2.overlay}>
        <View style={[lp2.sheet, { backgroundColor: c.surface }]}>
          <View style={[lp2.handle, { backgroundColor: c.border }]} />
          <Text size="xl" weight="bold" style={{ marginBottom: 20 }}>Choose location</Text>
          {loading ? <ActivityIndicator color={c.primary} /> : (
            <ScrollView style={{ maxHeight: 320 }}>
              {locs.map(loc => {
                const sel = pending === loc.id;
                return (
                  <Pressable key={loc.id} onPress={() => setPending(loc.id)}
                    style={[lp2.row, { borderColor: sel ? c.primary : c.border, backgroundColor: sel ? c.primary + '10' : 'transparent', borderWidth: sel ? 1.5 : 1, marginBottom: 8 }]}>
                    <Ionicons name="location" size={16} color={sel ? c.primary : c.textSubtle} />
                    <View style={{ flex: 1 }}>
                      <Text size="sm" weight="medium" color={sel ? c.primary : c.text}>{loc.name}</Text>
                      {loc.address && <Text size="xs" color={c.textSubtle}>{loc.address}</Text>}
                    </View>
                    {sel && <View style={[lp2.check, { backgroundColor: c.primary }]}><Ionicons name="checkmark" size={12} color="#fff" /></View>}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <Pressable onPress={() => { const l = locs.find(l => l.id === pending) ?? null; onSelect(l); }}
            style={[lp2.btn, { backgroundColor: c.primary, marginTop: 16 }]}>
            <Text size="md" weight="bold" style={{ color: '#fff' }}>Use this location</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const lp2 = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '80%' },
  handle:  { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 14 },
  check:   { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  btn:     { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
});

// ─── Event form ───────────────────────────────────────────────────────────────

function EventFormModal({ visible, initial, orgId, onClose, onSave, saving }: {
  visible: boolean; initial: Event | null; orgId: string;
  onClose: () => void; onSave: (form: EventForm) => void; saving: boolean;
}) {
  const { theme } = useThemeStore();
  const { width } = useWindowDimensions();
  const isWide    = width >= DESKTOP;
  const c = theme.colors;
  const [form, setForm]         = useState<EventForm>(BLANK);
  const [showLoc, setShowLoc]   = useState(false);
  const [savedLoc, setSavedLoc] = useState<OrgLocation | null>(null);
  const [showType, setShowType] = useState(false);

  useEffect(() => { if (visible) { setForm(initial ? formFrom(initial) : { ...BLANK }); setSavedLoc(null); } }, [visible, initial]);

  const set = <K extends keyof EventForm>(k: K) => (v: EventForm[K]) => setForm(f => ({ ...f, [k]: v }));
  const inputStyle = [ef2.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }];
  const typeLabel  = EVENT_TYPES.find(t => t.value === form.type)?.label ?? form.type;
  const isEdit     = !!initial;

  const settingsPanel = (
    <View style={[ef2.panel, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={ef2.pSection}>
        {([['Required attendance','required_attendance'],['QR check-in','qr_checkin'],['Geofence required','geofence_required'],['Allow excuses','allow_excuses'],['Public RSVP','rsvp_required']] as [string, keyof EventForm][]).map(([label, key]) => (
          <View key={key} style={ef2.toggleRow}>
            <Text size="sm" color={c.text}>{label}</Text>
            <Switch value={!!form[key]} onValueChange={v => set(key)(v as any)} trackColor={{ false: c.border, true: c.primary }} thumbColor="#fff" />
          </View>
        ))}
      </View>
      <View style={[ef2.pSection, { borderTopWidth: 1, borderTopColor: c.border }]}>
        <Text size="xs" weight="medium" color={c.textMuted} style={ef2.sLabel}>Points</Text>
        <TextInput style={[inputStyle, { paddingVertical: 10 }]} value={form.points} onChangeText={set('points')} keyboardType="number-pad" />
      </View>
    </View>
  );

  const formFields = (
    <View style={[ef2.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text size="xs" weight="medium" color={c.textMuted} style={ef2.sLabel}>BASICS</Text>
      <Text size="xs" color={c.textSubtle} style={ef2.fLabel}>TITLE</Text>
      <TextInput style={[inputStyle, { marginBottom: 12 }]} value={form.title} onChangeText={set('title')} placeholder="e.g. Chapter meeting · week 6" placeholderTextColor={c.textSubtle} />

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
        <View style={{ flex: 1, position: 'relative' }}>
          <Text size="xs" color={c.textSubtle} style={ef2.fLabel}>TYPE</Text>
          <Pressable onPress={() => setShowType(!showType)} style={[inputStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }]}>
            <Text size="sm" color={c.text}>{typeLabel}</Text>
            <Ionicons name="chevron-down" size={14} color={c.textSubtle} />
          </Pressable>
          {showType && (
            <View style={[ef2.dropdown, { backgroundColor: c.surface, borderColor: c.border }]}>
              {EVENT_TYPES.map(t => (
                <Pressable key={t.value} onPress={() => { set('type')(t.value); setShowType(false); }} style={[ef2.dropItem, { borderBottomColor: c.border }]}>
                  <Text size="sm" color={form.type === t.value ? c.primary : c.text} weight={form.type === t.value ? 'medium' : 'regular'}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <View style={{ minWidth: 120 }}>
          <Text size="xs" color={c.textSubtle} style={ef2.fLabel}>MANDATORY</Text>
          <View style={[inputStyle, { justifyContent: 'center', alignItems: 'center', paddingVertical: 10 }]}>
            <Switch value={form.is_mandatory} onValueChange={set('is_mandatory')} trackColor={{ false: c.border, true: c.primary }} thumbColor="#fff" />
          </View>
        </View>
      </View>

      <Text size="xs" weight="medium" color={c.textMuted} style={ef2.sLabel}>WHEN</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <TextInput style={[inputStyle, { flex: 2, paddingVertical: 12 }]} value={form.date} onChangeText={set('date')} placeholder="Mar 14, 2026" placeholderTextColor={c.textSubtle} />
        <TextInput style={[inputStyle, { flex: 1, paddingVertical: 12, textAlign: 'center' }]} value={form.start_time} onChangeText={set('start_time')} placeholder="7:00 PM" placeholderTextColor={c.textSubtle} />
        <TextInput style={[inputStyle, { flex: 1, paddingVertical: 12, textAlign: 'center' }]} value={form.end_time} onChangeText={set('end_time')} placeholder="9:00 PM" placeholderTextColor={c.textSubtle} />
      </View>

      <Text size="xs" weight="medium" color={c.textMuted} style={ef2.sLabel}>WHERE</Text>
      <Pressable onPress={() => setShowLoc(true)} style={[ef2.locRow, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
        <Ionicons name="location" size={16} color={c.primary} />
        <View style={{ flex: 1 }}>
          {savedLoc ? (
            <><Text size="sm" weight="medium">{savedLoc.name}</Text>{savedLoc.address && <Text size="xs" color={c.textSubtle}>{savedLoc.address}</Text>}</>
          ) : form.location_text ? (
            <Text size="sm" color={c.text}>{form.location_text}</Text>
          ) : (
            <Text size="sm" color={c.textSubtle}>Tap to choose location</Text>
          )}
        </View>
        {(savedLoc || form.location_text) && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => setShowLoc(true)} style={[ef2.changeBtn, { borderColor: c.border }]}>
              <Text size="xs" weight="medium">Change</Text>
            </Pressable>
          </View>
        )}
      </Pressable>

      <Text size="xs" weight="medium" color={c.textMuted} style={[ef2.sLabel, { marginTop: 20 }]}>DESCRIPTION</Text>
      <TextInput style={[inputStyle, { height: 96, textAlignVertical: 'top', paddingTop: 12 }]} value={form.description} onChangeText={set('description')} placeholder="Add details, agenda, links…" placeholderTextColor={c.textSubtle} multiline />

      {isEdit && isWide && (
        <Pressable onPress={handleDelete} style={[ef2.deleteBtn, { borderColor: '#EF4444', marginTop: 20 }]}>
          <Text size="sm" weight="medium" color="#EF4444">Delete event</Text>
        </Pressable>
      )}
    </View>
  );

  function handleDelete() {
    Alert.alert('Delete Event', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { if (!initial) return; await supabase.from('events').update({ is_deleted: true }).eq('id', initial.id); onClose(); } },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <View style={[ef2.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
          <Pressable onPress={onClose} style={ef2.closeBtn}><Ionicons name="close" size={18} color={c.text} /></Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text size="md" weight="bold">{isEdit ? 'Edit event' : 'New event'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {isEdit && (
              <Pressable style={[ef2.hBtn, { borderColor: c.border }]}>
                <Text size="sm" weight="medium">Save draft</Text>
              </Pressable>
            )}
            <Pressable onPress={() => onSave(form)} disabled={saving || !form.title.trim()}
              style={[ef2.postBtn, { backgroundColor: c.primary, opacity: saving ? 0.6 : 1 }]}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : (
                <Text size="sm" weight="bold" style={{ color: '#fff' }}>{isEdit ? 'Save changes' : 'Post event'}</Text>
              )}
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={[ef2.scroll, isWide && ef2.scrollWide]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {isWide ? (
            <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>{formFields}</View>
              <View style={{ width: 280 }}>{settingsPanel}</View>
            </View>
          ) : (<>{formFields}{settingsPanel}</>)}
          {isEdit && !isWide && (
            <Pressable onPress={handleDelete} style={[ef2.deleteBtn, { borderColor: '#EF4444' }]}>
              <Text size="sm" weight="medium" color="#EF4444">Delete event</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>

      <LocationPicker visible={showLoc} orgId={orgId} selectedId={form.location_id}
        onSelect={loc => { setSavedLoc(loc); setForm(f => ({ ...f, location_id: loc?.id ?? null, location_text: loc?.name ?? f.location_text })); setShowLoc(false); }}
        onClose={() => setShowLoc(false)} />
    </Modal>
  );
}

const ef2 = StyleSheet.create({
  header:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  closeBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0000000A' },
  hBtn:     { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  postBtn:  { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  scroll:   { padding: 20, paddingBottom: 60 },
  scrollWide:{ paddingHorizontal: 48, maxWidth: 1100, alignSelf: 'center', width: '100%' },
  card:     { borderWidth: 1, borderRadius: 16, padding: 20, marginBottom: 16 },
  sLabel:   { textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 },
  fLabel:   { textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontSize: 10, color: '#888' },
  input:    { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 14 },
  locRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 4 },
  changeBtn:{ borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  dropdown: { position: 'absolute', top: 70, left: 0, right: 0, zIndex: 100, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  dropItem: { padding: 12, borderBottomWidth: 1 },
  deleteBtn:{ borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  panel:    { borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  pSection: { padding: 16 },
  toggleRow:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
});

// ─── Table row ────────────────────────────────────────────────────────────────

function TableRow({ event, onEdit, onCancel }: { event: Event; onEdit: () => void; onCancel: () => void }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [menuOpen, setMenuOpen] = useState(false);
  const d = fmtDate(event.start_time);
  const upcoming   = isUpcoming(event);
  const cancelled  = !!event.is_cancelled;
  const statusLabel = cancelled ? 'Cancelled' : upcoming ? 'Upcoming' : 'Past';
  const statusColor = cancelled ? '#EF4444' : upcoming ? '#22C55E' : c.textSubtle;

  return (
    <View style={[tr.row, { borderBottomColor: c.border }]}>
      <View style={[tr.dateBadge, { backgroundColor: c.surfaceAlt }]}>
        <Text size="xs" weight="medium" color={c.textSubtle}>{d.month}</Text>
        <Text size="md" weight="bold">{d.day}</Text>
      </View>
      <View style={{ flex: 2, gap: 2 }}>
        <Text size="sm" weight="medium">{event.title}</Text>
        <Text size="xs" color={c.textSubtle} style={{ textTransform: 'capitalize' }}>{event.type}</Text>
      </View>
      <Text size="sm" color={c.textMuted} style={{ flex: 1 }} numberOfLines={1}>{event.location ?? '—'}</Text>
      <Text size="sm" color={c.textMuted} style={{ width: 60, textAlign: 'center' }}>—</Text>
      <View style={[tr.statusChip, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
        <Text size="xs" weight="medium" color={statusColor}>{statusLabel}</Text>
      </View>
      <View style={{ width: 36, position: 'relative' }}>
        <Pressable onPress={() => setMenuOpen(!menuOpen)} style={{ padding: 8 }}>
          <Text size="md" color={c.textSubtle}>···</Text>
        </Pressable>
        {menuOpen && (
          <View style={[tr.menu, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Pressable onPress={() => { setMenuOpen(false); onEdit(); }} style={[tr.menuItem, { borderBottomColor: c.border }]}>
              <Text size="sm">Edit</Text>
            </Pressable>
            {!cancelled && upcoming && (
              <Pressable onPress={() => { setMenuOpen(false); onCancel(); }} style={tr.menuItem}>
                <Text size="sm" color="#EF4444">Cancel</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const tr = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1 },
  dateBadge:  { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statusChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, width: 90, alignItems: 'center' },
  menu:       { position: 'absolute', right: 0, top: 28, zIndex: 200, borderWidth: 1, borderRadius: 10, width: 120, overflow: 'hidden' },
  menuItem:   { padding: 12, borderBottomWidth: 1 },
});

// ─── Mobile card ─────────────────────────────────────────────────────────────

function MobileCard({ event, onEdit }: { event: Event; onEdit: () => void }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const d = fmtDate(event.start_time);
  const upcoming  = isUpcoming(event);
  const cancelled = !!event.is_cancelled;
  const statusColor = cancelled ? '#EF4444' : upcoming ? c.primary : c.textSubtle;

  return (
    <Pressable onPress={onEdit} style={[mc3.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={[mc3.dateBadge, { backgroundColor: c.surfaceAlt }]}>
          <Text size="xs" weight="medium" color={c.textSubtle}>{d.month}</Text>
          <Text size="md" weight="bold">{d.day}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text size="sm" weight="medium">{event.title}</Text>
          <Text size="xs" color={c.textSubtle}>{d.time} · {event.location ?? event.type}</Text>
        </View>
        <View style={[mc3.statusChip, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
          <Text size="xs" weight="medium" color={statusColor}>{cancelled ? 'Cancelled' : upcoming ? 'Upcoming' : 'Past'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const mc3 = StyleSheet.create({
  card:       { borderWidth: 1, borderRadius: 14, padding: 14 },
  dateBadge:  { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statusChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

const TABS = ['All', 'Upcoming', 'Past', 'Drafts'] as const;
type Tab = typeof TABS[number];

export default function AdminEventsScreen() {
  const { theme }      = useThemeStore();
  const insets         = useSafeAreaInsets();
  const { organization, profile } = useAuthStore();
  const { width }      = useWindowDimensions();
  const isWide         = width >= DESKTOP;
  const c              = theme.colors;
  const orgId          = organization?.id ?? '';

  const [events,  setEvents]  = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [tab,     setTab]     = useState<Tab>('Upcoming');
  const [editing, setEditing] = useState<Event | null | false>(false);
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    const { data } = await supabase.from('events').select('*').eq('org_id', orgId).eq('is_deleted', false).order('start_time', { ascending: false });
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
    if (tab === 'Drafts')   return false;
    return true;
  });

  async function handleSave(form: EventForm) {
    if (!orgId) return;
    setSaving(true);
    try {
      const payload: any = {
        title: form.title.trim(), type: form.type,
        description: form.description.trim() || null, location: form.location_text.trim() || null,
        location_id: form.location_id ?? null,
        start_time: isoFrom(form.date, form.start_time), end_time: form.end_time ? isoFrom(form.date, form.end_time) : null,
        is_mandatory: form.is_mandatory, rsvp_required: form.rsvp_required,
        allow_excuses: form.allow_excuses, qr_checkin: form.qr_checkin,
        geofence_required: form.geofence_required, points: parseInt(form.points) || 0,
      };
      if (editing && editing !== false && 'id' in editing) {
        await supabase.from('events').update(payload).eq('id', editing.id);
      } else {
        await supabase.from('events').insert({ ...payload, org_id: orgId, created_by: profile?.id ?? null });
      }
      await load(); setEditing(false);
    } catch { Alert.alert('Error', 'Failed to save.'); } finally { setSaving(false); }
  }

  async function handleCancel(event: Event) {
    Alert.alert('Cancel Event', `Cancel "${event.title}"?`, [
      { text: 'Never mind', style: 'cancel' },
      { text: 'Cancel Event', style: 'destructive', onPress: async () => { await supabase.from('events').update({ is_cancelled: true }).eq('id', event.id); await load(); } },
    ]);
  }

  if (loading) return <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={[as2.header, { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.background, borderBottomColor: c.border }]}>
        <View style={{ flex: 1 }}>
          <Text size="xxl" weight="bold">Events</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>{upcomingCount} upcoming · {pastCount} past</Text>
        </View>
        <Pressable style={[as2.importBtn, { borderColor: c.border }]}><Text size="sm" weight="medium">Import</Text></Pressable>
        <Pressable onPress={() => setEditing(null)} style={[as2.newBtn, { backgroundColor: c.primary }]}>
          <Text size="sm" weight="medium" style={{ color: '#fff' }}>+ New event</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={as2.tabRow}
        style={{ backgroundColor: c.background, borderBottomWidth: 1, borderBottomColor: c.border }}>
        {TABS.map(t => {
          const count = t === 'Upcoming' ? upcomingCount : t === 'Past' ? pastCount : null;
          const active = tab === t;
          return (
            <Pressable key={t} onPress={() => setTab(t)}
              style={[as2.tabChip, { backgroundColor: active ? c.surfaceAlt : 'transparent', borderColor: active ? c.border : 'transparent' }]}>
              <Text size="sm" weight={active ? 'medium' : 'regular'} color={active ? c.text : c.textMuted}>
                {t}{count !== null ? ` · ${count}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isWide && (
        <View style={[as2.tableHeader, { backgroundColor: c.background, borderBottomColor: c.border }]}>
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
        contentContainerStyle={isWide ? undefined : as2.mobileScroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(); }} tintColor={c.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {displayed.length === 0 ? (
          <View style={as2.empty}>
            <Ionicons name="calendar-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>No {tab.toLowerCase()} events</Text>
            <Pressable onPress={() => setEditing(null)} style={{ marginTop: 12 }}><Text size="sm" color={c.primary} weight="medium">+ Create one</Text></Pressable>
          </View>
        ) : isWide ? (
          displayed.map(e => <TableRow key={e.id} event={e} onEdit={() => setEditing(e)} onCancel={() => handleCancel(e)} />)
        ) : (
          <View style={{ gap: 10 }}>{displayed.map(e => <MobileCard key={e.id} event={e} onEdit={() => setEditing(e)} />)}</View>
        )}
      </ScrollView>

      <EventFormModal visible={editing !== false} initial={editing || null} orgId={orgId} onClose={() => setEditing(false)} onSave={handleSave} saving={saving} />
    </View>
  );
}

const as2 = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  importBtn:   { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  newBtn:      { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  tabRow:      { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tabChip:     { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  tableHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1 },
  mobileScroll:{ padding: 14, gap: 10, paddingBottom: 48 },
  empty:       { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
});
