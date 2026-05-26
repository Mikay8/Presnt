/**
 * Org Admin — Event Detail  /(org-admin)/events-management/[id]
 *
 * View attendance & registrations for any event across all chapters.
 * Org-wide events (is_org_wide = true): full management — add/remove, edit, scan QR.
 * Chapter events: read-only view (can see lists but not modify them).
 *
 * Desktop: two-column layout (event info left, tabs right)
 * Mobile:  stacked
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View
}  from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, useAlert } from '@/components/ui';
import { registerGeofenceForEvent, unregisterGeofenceForEvent } from '@/lib/geofence';
import { QRCheckinModal } from '@/lib/QRCheckin';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventDetail = {
  id:            string;
  title:         string;
  type:          string;
  start_time:    string;
  end_time:      string | null;
  location:      string | null;
  meeting_url:   string | null;
  description:   string | null;
  is_cancelled:  boolean | null;
  rsvp_required: boolean | null;
  points:                 number | null;
  checkin_open_minutes:  number | null;
  checkin_grace_minutes: number | null;
  is_org_wide:   boolean | null;
  is_public:     boolean | null;
  event_code:    string | null;
  org_id:        string;
  location_lat:  number | null;
  location_lng:  number | null;
  geofence_radius_m: number | null;
  geofence_required: boolean | null;
};

type RsvpRow = {
  id:         string;
  user_id:    string;
  status:     string;
  created_at: string | null;
  profiles:   { first_name: string; last_name: string; email: string } | null;
};

type AttendRow = {
  id:      string;
  user_id: string;
  status:  string;
  checked_in_at: string | null;
  profiles: { first_name: string; last_name: string; email: string } | null;
};

type Member = {
  user_id: string;
  profiles: { first_name: string; last_name: string; email: string } | null;
};

type GuestRow = {
  id:         string;
  first_name: string;
  last_name:  string;
  email:      string;
  type:       'rsvp' | 'attendance';
  created_at: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true if the string looks like a UUID v4. */
function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
} );
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fullName(p: { first_name: string; last_name: string } | null) {
  if (!p) return 'Unknown';
  return `${p.first_name} ${p.last_name}`;
}

function toCalStamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function openGoogleCalendar(ev: EventDetail) {
  const start = new Date(ev.start_time);
  const end   = ev.end_time ? new Date(ev.end_time) : new Date(start.getTime() + 60 * 60_000);
  const params = new URLSearchParams({
    action:   'TEMPLATE',
    text:     ev.title,
    dates:    `${toCalStamp(start)}/${toCalStamp(end)}`,
    details:  ev.description ?? '',
    location: ev.location ?? ''
} );
  Linking.openURL(`https://calendar.google.com/calendar/render?${params.toString()}`);
}

function downloadIcal(ev: EventDetail) {
  const start = new Date(ev.start_time);
  const end   = ev.end_time ? new Date(ev.end_time) : new Date(start.getTime() + 60 * 60_000);
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `DTSTART:${toCalStamp(start)}`,
    `DTEND:${toCalStamp(end)}`,
    `SUMMARY:${ev.title}`,
    `DESCRIPTION:${(ev.description ?? '').replace(/\n/g, '\\n')}`,
    `LOCATION:${ev.location ?? ''}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  if (Platform.OS === 'web') {
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${ev.title.replace(/\s+/g, '_')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    const encoded = encodeURIComponent(ics);
    Linking.openURL(`data:text/calendar;charset=utf-8,${encoded}`).catch(() => {
      showAlert('Export failed', 'Could not open the calendar file on this device.');
    });
  }
}

// ─── Add-member modal ─────────────────────────────────────────────────────────

function AddMemberModal({
  visible, title, members, alreadyAdded, onAdd, onClose
} : {
  visible: boolean; title: string; members: Member[];
  alreadyAdded: Set<string>; onAdd: (m: Member) => Promise<void>; onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [query,  setQuery]  = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 200); }
  }, [visible]);

  const filtered = members.filter((m) => {
    if (!query.trim()) return true;
    const name  = fullName(m.profiles).toLowerCase();
    const email = (m.profiles?.email ?? '').toLowerCase();
    const q     = query.toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  async function handleAdd(m: Member) {
    setAdding(m.user_id);
    try { await onAdd(m); }
    finally { setAdding(null); }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#00000050' }} onPress={onClose} />
      <View style={[am.sheet, { backgroundColor: c.surface }]}>
        <View style={[am.header, { borderBottomColor: c.border }]}>
          <Text size="md" weight="bold">{title}</Text>
          <Pressable onPress={onClose} style={am.closeBtn}>
            <Ionicons name="close" size={20} color={c.text} />
          </Pressable>
        </View>
        <View style={[am.searchRow, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
          <Ionicons name="search-outline" size={16} color={c.textSubtle} />
          <TextInput ref={inputRef} value={query} onChangeText={setQuery}
            placeholder="Search by name or email…" placeholderTextColor={c.textSubtle}
            style={[am.searchInput, { color: c.text }]} />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={16} color={c.textSubtle} />
            </Pressable>
          )}
        </View>
        <FlatList data={filtered} keyExtractor={(m) => m.user_id}
          style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 4 }}
          renderItem={({ item: m }) => {
            const added = alreadyAdded.has(m.user_id);
            const busy  = adding === m.user_id;
            return (
              <Pressable disabled={added || busy} onPress={() => handleAdd(m)}
                style={[am.memberRow, { borderColor: c.border, opacity: added ? 0.5 : 1 }]}>
                <View style={[am.avatar, { backgroundColor: c.primary + '22' }]}>
                  <Text size="sm" weight="bold" color={c.primary}>
                    {(m.profiles?.first_name?.[0] ?? '?')}{(m.profiles?.last_name?.[0] ?? '')}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text size="sm" weight="medium">{fullName(m.profiles)}</Text>
                  <Text size="xs" color={c.textMuted}>{m.profiles?.email ?? ''}</Text>
                </View>
                {busy ? (
                  <ActivityIndicator size="small" color={c.primary} />
                ) : added ? (
                  <Ionicons name="checkmark-circle" size={20} color={c.primary} />
                ) : (
                  <View style={[am.addBtn, { backgroundColor: c.primary }]}>
                    <Text size="xs" weight="medium" style={{ color: '#fff' }}>Add</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text size="sm" color={c.textMuted} style={{ textAlign: 'center', paddingVertical: 24 }}>
              No members found
            </Text>
          }
        />
      </View>
    </Modal>
  );
}

const am = StyleSheet.create({
  sheet:     { maxHeight: '70%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  closeBtn:  { padding: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, margin: 12, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput:{ flex: 1, fontSize: 14 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  avatar:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  addBtn:    { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }
} );

// ─── Screen ───────────────────────────────────────────────────────────────────

type TabKey = 'registrations' | 'attendance';

export default function OrgAdminEventDetailScreen() {
  const { id }    = useLocalSearchParams<{ id: string }>();
  const { theme } = useThemeStore();
  const c         = theme.colors;
  const { width } = useWindowDimensions();
  const insets    = useSafeAreaInsets();
  const { showAlert, confirm } = useAlert();
  const isWide    = width >= 800;
  const { organization } = useAuthStore();
  const parentOrgId = organization?.id ?? '';

  const [event,      setEvent]      = useState<EventDetail | null>(null);
  const [rsvps,      setRsvps]      = useState<RsvpRow[]>([]);
  const [attendance, setAttendance] = useState<AttendRow[]>([]);
  const [guests,     setGuests]     = useState<GuestRow[]>([]);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<TabKey>('registrations');
  const [addModal,   setAddModal]   = useState<TabKey | null>(null);
  const [showScan,   setShowScan]   = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!id || !parentOrgId) { setLoading(false); return; }

    // Load event first so we know which org owns it (support UUID or event_code slug)
    const evQuery = isUuid(id)
      ? supabase
          .from('events')
          .select('id, title, type, start_time, end_time, location, meeting_url, description, is_cancelled, rsvp_required, points, checkin_open_minutes, checkin_grace_minutes, is_org_wide, is_public, event_code, org_id, location_lat, location_lng, geofence_radius_m, geofence_required')
          .eq('id', id)
          .single()
      : supabase
          .from('events')
          .select('id, title, type, start_time, end_time, location, meeting_url, description, is_cancelled, rsvp_required, points, checkin_open_minutes, checkin_grace_minutes, is_org_wide, is_public, event_code, org_id, location_lat, location_lng, geofence_radius_m, geofence_required')
          .eq('event_code', id)
          .eq('is_deleted', false)
          .single();

    const evRes = await evQuery;

    const ev = evRes.data as EventDetail | null;
    if (ev) setEvent(ev);

    // Use the event's actual UUID and org_id for RSVP / attendance queries
    const eventUuid  = ev?.id ?? id;
    const eventOrgId = ev?.org_id ?? parentOrgId;

    const [rsvpRes, attendRes, membRes, guestRes] = await Promise.all([
      supabase
        .from('rsvps')
        .select('id, user_id, status, created_at, profiles(first_name, last_name, email)')
        .eq('event_id', eventUuid)
        .eq('org_id', eventOrgId)
        .order('created_at'),

      supabase
        .from('event_attendance')
        .select('id, user_id, status, checked_in_at, profiles(first_name, last_name, email)')
        .eq('event_id', eventUuid)
        .eq('org_id', eventOrgId)
        .order('checked_in_at'),

      // Members list — use parent org for org-wide, chapter org otherwise
      supabase
        .from('memberships')
        .select('user_id, profiles(first_name, last_name, email)')
        .eq('org_id', eventOrgId)
        .is('deleted_at', null)
        .order('user_id'),

      supabase
        .from('public_event_guests')
        .select('id, first_name, last_name, email, type, created_at')
        .eq('event_id', eventUuid)
        .order('created_at'),
    ]);

    if (rsvpRes.data)   setRsvps(rsvpRes.data as unknown as RsvpRow[]);
    if (attendRes.data) setAttendance(attendRes.data as unknown as AttendRow[]);
    if (membRes.data)   setAllMembers(membRes.data as unknown as Member[]);
    if (guestRes.data)  setGuests(guestRes.data as GuestRow[]);
    setLoading(false);
  }, [id, parentOrgId]);

  useEffect(() => { load(); }, [load]);

  // ── Geofence lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    if (!event || !id) return;
    if (event.location_lat == null || event.location_lng == null) return;

    const now       = new Date();
    const startTime = new Date(event.start_time);
    const endTime   = event.end_time ? new Date(event.end_time) : null;
    const openMins  = event.checkin_open_minutes  ?? 15;
    const graceMins = event.checkin_grace_minutes ?? 15;
    const winOpen   = new Date(startTime.getTime() - openMins  * 60_000);
    const winClose  = endTime
      ? new Date(endTime.getTime() + graceMins * 60_000)
      : new Date(startTime.getTime() + (120 + graceMins) * 60_000);

    const isOngoing = now >= winOpen && now <= winClose && !event.is_cancelled;

    if (isOngoing) {
      registerGeofenceForEvent({
        eventId:  id,
        lat:      event.location_lat,
        lng:      event.location_lng,
        radiusM:  event.geofence_radius_m ?? 100
} ).catch(() => {});
    } else if (now > winClose) {
      unregisterGeofenceForEvent(id).catch(() => {});
    }
  }, [event, id]);

  // ── Write actions (org-wide events only) ──────────────────────────────────

  async function addRsvp(m: Member) {
    if (!event?.is_org_wide) return;
    const { error } = await supabase.from('rsvps').upsert({
      event_id: id, org_id: event.org_id, user_id: m.user_id, status: 'confirmed'
} , { onConflict: 'event_id,user_id' });
    if (error) { showAlert('Error', error.message); return; }
    await load();
  }

  async function addAttendance(m: Member) {
    if (!event?.is_org_wide) return;
    const { error } = await supabase.from('event_attendance').upsert({
      event_id: id, org_id: event.org_id, user_id: m.user_id,
      status: 'present', checked_in_at: new Date().toISOString(), check_in_method: 'manual'
} , { onConflict: 'event_id,user_id' });
    if (error) { showAlert('Error', error.message); return; }
    await load();
  }

  async function removeRsvp(rsvpId: string) {
    if (!event?.is_org_wide) return;
    confirm(
      'Remove registration',
      'Remove this person from the registration list?',
      async () => { await supabase.from('rsvps').delete().eq('id', rsvpId); await load(); },
      { confirmLabel: 'Remove', destructive: true }
    );
  }

  async function removeAttendance(attendId: string) {
    if (!event?.is_org_wide) return;
    confirm(
      'Remove attendance',
      'Remove this attendance record?',
      async () => { await supabase.from('event_attendance').delete().eq('id', attendId); await load(); },
      { confirmLabel: 'Remove', destructive: true }
    );
  }

  const rsvpUserIds   = new Set(rsvps.map((r) => r.user_id));
  const attendUserIds = new Set(attendance.map((a) => a.user_id));

  // ── Loading / not-found ───────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
        <Text size="md" color={c.textMuted}>Event not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text size="sm" color={c.primary}>← Go back</Text>
        </Pressable>
      </View>
    );
  }

  const isOrgWide = !!event.is_org_wide;

  // ── Status ────────────────────────────────────────────────────────────────

  const TYPE_COLORS: Record<string, string> = {
    mandatory: '#E26B4A', social: '#A855F7', optional: '#22C55E', meeting: '#3B82F6'
} ;
  const typeColor = TYPE_COLORS[event.type] ?? c.primary;

  const _now       = new Date();
  const _start     = new Date(event.start_time);
  const _end       = event.end_time ? new Date(event.end_time) : null;
  const _openMins  = event.checkin_open_minutes  ?? 15;
  const _graceMins = event.checkin_grace_minutes ?? 15;
  const _winOpen   = new Date(_start.getTime() - _openMins  * 60_000);
  const _winClose  = _end
    ? new Date(_end.getTime()   + _graceMins * 60_000)
    : new Date(_start.getTime() + _graceMins * 60_000);
  const detailStatus: 'cancelled' | 'ongoing' | 'upcoming' | 'past' =
    event.is_cancelled              ? 'cancelled'
    : (_now >= _winOpen && _now <= _winClose) ? 'ongoing'
    : _now < _start                 ? 'upcoming'
    : 'past';
  const statusColor =
    detailStatus === 'cancelled' ? '#EF4444'
    : detailStatus === 'ongoing' ? '#F59E0B'
    : detailStatus === 'upcoming'? '#22C55E'
    : c.textSubtle;
  const statusLabel =
    detailStatus === 'cancelled' ? 'Cancelled'
    : detailStatus === 'ongoing' ? 'Ongoing'
    : detailStatus === 'upcoming'? 'Upcoming'
    : 'Past';

  // ── Info panel ────────────────────────────────────────────────────────────

  const infoPanel = (
    <View style={[ip.panel, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* Type + status badges */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <View style={[ip.typeBadge, { backgroundColor: typeColor + '22', borderColor: typeColor }]}>
          <Text size="xs" weight="medium" color={typeColor} style={{ textTransform: 'capitalize' }}>{event.type}</Text>
        </View>
        <View style={[ip.typeBadge, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
          <Text size="xs" weight="medium" color={statusColor}>{statusLabel}</Text>
        </View>
        {isOrgWide ? (
          <View style={[ip.typeBadge, { backgroundColor: '#3B82F618', borderColor: '#3B82F650', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
            <Ionicons name="globe-outline" size={11} color="#3B82F6" />
            <Text size="xs" weight="medium" color="#3B82F6">Organization Wide</Text>
          </View>
        ) : (
          <View style={[ip.typeBadge, { backgroundColor: c.surfaceAlt, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
            <Ionicons name="business-outline" size={11} color={c.textSubtle} />
            <Text size="xs" weight="medium" color={c.textSubtle}>Chapter Event</Text>
          </View>
        )}
        {event.is_public && (
          <View style={[ip.typeBadge, { backgroundColor: '#22C55E18', borderColor: '#22C55E50', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
            <Ionicons name="globe-outline" size={11} color="#22C55E" />
            <Text size="xs" weight="medium" color="#22C55E">Public</Text>
          </View>
        )}
      </View>

      <Text size="xl" weight="bold" style={{ marginBottom: 4 }}>{event.title}</Text>

      <View style={ip.detailRow}>
        <Ionicons name="calendar-outline" size={15} color={c.textSubtle} />
        <Text size="sm" color={c.textMuted}>{fmt(event.start_time)}</Text>
      </View>
      <View style={ip.detailRow}>
        <Ionicons name="time-outline" size={15} color={c.textSubtle} />
        <Text size="sm" color={c.textMuted}>
          {fmtTime(event.start_time)}
          {event.end_time ? ` – ${fmtTime(event.end_time)}` : ''}
        </Text>
      </View>
      {event.meeting_url ? (
        <View style={ip.detailRow}>
          <Ionicons name="videocam-outline" size={15} color={c.primary} />
          <Text size="sm" color={c.primary}>Remote</Text>
        </View>
      ) : event.location ? (
        <View style={ip.detailRow}>
          <Ionicons name="location-outline" size={15} color={c.textSubtle} />
          <Text size="sm" color={c.textMuted}>{event.location}</Text>
        </View>
      ) : null}
      {(event.points ?? 0) > 0 && (
        <View style={ip.detailRow}>
          <Ionicons name="star-outline" size={15} color="#F59400" />
          <Text size="sm" color={c.textMuted}>{event.points} pts</Text>
        </View>
      )}
      {event.description && (
        <Text size="sm" color={c.textMuted} style={{ marginTop: 12, lineHeight: 20 }}>
          {event.description}
        </Text>
      )}

      {/* Calendar export */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <Pressable onPress={() => openGoogleCalendar(event)}
          style={[ip.calBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
          <Ionicons name="logo-google" size={14} color={c.text} />
          <Text size="xs" weight="medium" color={c.text}>Google Calendar</Text>
        </Pressable>
        <Pressable onPress={() => downloadIcal(event)}
          style={[ip.calBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
          <Ionicons name="calendar-outline" size={14} color={c.text} />
          <Text size="xs" weight="medium" color={c.text}>Save .ics</Text>
        </Pressable>
      </View>

      {/* Stats */}
      <View style={[ip.stats, { borderTopColor: c.border, marginTop: 16, paddingTop: 14 }]}>
        <View style={ip.stat}>
          <Text size="xl" weight="bold" color={c.primary}>{rsvps.length + guestRsvps.length}</Text>
          <Text size="xs" color={c.textSubtle}>Registered</Text>
        </View>
        <View style={[ip.statDivider, { backgroundColor: c.border }]} />
        <View style={ip.stat}>
          <Text size="xl" weight="bold" color="#22C55E">{attendance.length + guestAttend.length}</Text>
          <Text size="xs" color={c.textSubtle}>Attended</Text>
        </View>
      </View>

      {/* Edit — org-wide events only */}
      {isOrgWide && (
        <Pressable
          onPress={() => router.push(`/(org-admin)/events-management?edit=${id}` as any)}
          style={[ip.editBtn, { borderColor: c.border, marginTop: 14 }]}
        >
          <Ionicons name="create-outline" size={15} color={c.text} />
          <Text size="sm" weight="medium">Edit event</Text>
        </Pressable>
      )}

      {/* See Member View */}
      <Pressable
        onPress={() => router.push(`/(org-admin)/events-management/member/${id}` as any)}
        style={[ip.editBtn, { borderColor: c.primary + '60', backgroundColor: c.primary + '10', marginTop: isOrgWide ? 8 : 14 }]}
      >
        <Ionicons name="eye-outline" size={15} color={c.primary} />
        <Text size="sm" weight="medium" color={c.primary}>See Member View</Text>
      </Pressable>
    </View>
  );

  // ── Tabs panel ────────────────────────────────────────────────────────────

  const guestRsvps  = guests.filter((g) => g.type === 'rsvp');
  const guestAttend = guests.filter((g) => g.type === 'attendance');

  function GuestBadge() {
    return (
      <View style={[ls.statusChip, { backgroundColor: '#8B5CF618', borderColor: '#8B5CF6' }]}>
        <Text size="xs" weight="medium" color="#8B5CF6">Guest</Text>
      </View>
    );
  }

  function RsvpList() {
    const hasAny = rsvps.length > 0 || guestRsvps.length > 0;
    if (!hasAny) {
      return (
        <View style={ls.emptyBox}>
          <Ionicons name="person-outline" size={28} color={c.textSubtle} />
          <Text size="sm" color={c.textMuted} style={{ marginTop: 8 }}>No registrations yet</Text>
        </View>
      );
    }
    return (
      <>
        {rsvps.map((r) => (
          <View key={r.id} style={[ls.personRow, { borderBottomColor: c.border }]}>
            <View style={[ls.avatar, { backgroundColor: c.primary + '22' }]}>
              <Text size="sm" weight="bold" color={c.primary}>
                {r.profiles?.first_name?.[0] ?? '?'}{r.profiles?.last_name?.[0] ?? ''}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text size="sm" weight="medium">{fullName(r.profiles)}</Text>
              <Text size="xs" color={c.textMuted}>{r.profiles?.email ?? ''}</Text>
            </View>
            <View style={[ls.statusChip, {
              backgroundColor: r.status === 'confirmed' ? '#22C55E18' : '#F5940018',
              borderColor:     r.status === 'confirmed' ? '#22C55E'   : '#F59400'
} ]}>
              <Text size="xs" weight="medium" color={r.status === 'confirmed' ? '#22C55E' : '#F59400'}>
                {r.status}
              </Text>
            </View>
            {isOrgWide && (
              <Pressable onPress={() => removeRsvp(r.id)} style={ls.removeBtn}>
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </Pressable>
            )}
          </View>
        ))}
        {guestRsvps.map((g) => (
          <View key={g.id} style={[ls.personRow, { borderBottomColor: c.border }]}>
            <View style={[ls.avatar, { backgroundColor: '#8B5CF622' }]}>
              <Text size="sm" weight="bold" color="#8B5CF6">
                {g.first_name[0] ?? '?'}{g.last_name[0] ?? ''}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text size="sm" weight="medium">{g.first_name} {g.last_name}</Text>
              <Text size="xs" color={c.textMuted}>{g.email}</Text>
            </View>
            <GuestBadge />
          </View>
        ))}
      </>
    );
  }

  function AttendList() {
    const hasAny = attendance.length > 0 || guestAttend.length > 0;
    if (!hasAny) {
      return (
        <View style={ls.emptyBox}>
          <Ionicons name="checkmark-circle-outline" size={28} color={c.textSubtle} />
          <Text size="sm" color={c.textMuted} style={{ marginTop: 8 }}>No attendance recorded yet</Text>
        </View>
      );
    }
    return (
      <>
        {attendance.map((a) => (
          <View key={a.id} style={[ls.personRow, { borderBottomColor: c.border }]}>
            <View style={[ls.avatar, { backgroundColor: '#22C55E22' }]}>
              <Text size="sm" weight="bold" color="#22C55E">
                {a.profiles?.first_name?.[0] ?? '?'}{a.profiles?.last_name?.[0] ?? ''}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text size="sm" weight="medium">{fullName(a.profiles)}</Text>
              <Text size="xs" color={c.textMuted}>{a.profiles?.email ?? ''}</Text>
            </View>
            {a.checked_in_at && (
              <Text size="xs" color={c.textSubtle} style={{ marginRight: 8 }}>
                {fmtTime(a.checked_in_at)}
              </Text>
            )}
            <View style={[ls.statusChip, { backgroundColor: '#22C55E18', borderColor: '#22C55E' }]}>
              <Text size="xs" weight="medium" color="#22C55E">{a.status}</Text>
            </View>
            {isOrgWide && (
              <Pressable onPress={() => removeAttendance(a.id)} style={ls.removeBtn}>
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </Pressable>
            )}
          </View>
        ))}
        {guestAttend.map((g) => (
          <View key={g.id} style={[ls.personRow, { borderBottomColor: c.border }]}>
            <View style={[ls.avatar, { backgroundColor: '#8B5CF622' }]}>
              <Text size="sm" weight="bold" color="#8B5CF6">
                {g.first_name[0] ?? '?'}{g.last_name[0] ?? ''}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text size="sm" weight="medium">{g.first_name} {g.last_name}</Text>
              <Text size="xs" color={c.textMuted}>{g.email}</Text>
            </View>
            <GuestBadge />
          </View>
        ))}
      </>
    );
  }

  const tabsPanel = (
    <View style={{ flex: 1 }}>
      <View style={[tp.tabBar, { borderBottomColor: c.border }]}>
        {(['registrations', 'attendance'] as TabKey[]).map((t) => {
          const active = tab === t;
          const count  = t === 'registrations' ? rsvps.length + guestRsvps.length : attendance.length + guestAttend.length;
          return (
            <Pressable key={t} onPress={() => setTab(t)}
              style={[tp.tabBtn, active && [tp.tabBtnActive, { borderBottomColor: c.primary }]]}>
              <Text size="sm" weight={active ? 'medium' : 'regular'}
                color={active ? c.primary : c.textMuted}>
                {t === 'registrations' ? 'Registrations' : 'Attendance'}
                {' '}<Text size="sm" color={active ? c.primary : c.textSubtle}>({count})</Text>
              </Text>
            </Pressable>
          );
        })}

        {/* Actions — right side, only for org-wide events */}
        {isOrgWide && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto', marginRight: 16, marginVertical: 8 }}>
            {detailStatus === 'ongoing' && (
              <Pressable onPress={() => setShowScan(true)}
                style={[tp.addBtn, { backgroundColor: '#F59E0B18', borderWidth: 1, borderColor: '#F59E0B' }]}>
                <Ionicons name="qr-code-outline" size={14} color="#F59E0B" />
                <Text size="xs" weight="medium" style={{ color: '#F59E0B' }}>Scan QR</Text>
              </Pressable>
            )}
            <Pressable onPress={() => setAddModal(tab)} style={[tp.addBtn, { backgroundColor: c.primary }]}>
              <Ionicons name="person-add-outline" size={14} color="#fff" />
              <Text size="xs" weight="medium" style={{ color: '#fff' }}>Add</Text>
            </Pressable>
          </View>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: isWide ? 40 : insets.bottom + 40 }}>
        {!isOrgWide && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, paddingBottom: 0 }}>
            <Ionicons name="eye-outline" size={14} color={c.textSubtle} />
            <Text size="xs" color={c.textSubtle}>Read-only — chapter events are managed by the chapter admin</Text>
          </View>
        )}
        <View style={ls.list}>
          {tab === 'registrations' ? <RsvpList /> : <AttendList />}
        </View>
      </ScrollView>
    </View>
  );

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Back header */}
      <View style={[sc.topBar, {
        paddingTop: isWide ? 20 : insets.top + 12,
        borderBottomColor: c.border,
        backgroundColor: c.background
} ]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(org-admin)/events-management' as any)} style={sc.backBtn}>
          <Ionicons name="arrow-back-outline" size={18} color={c.text} />
          <Text size="sm" weight="medium">Events</Text>
        </Pressable>
      </View>

      {isWide ? (
        <View style={{ flex: 1, flexDirection: 'row', gap: 0 }}>
          <ScrollView
            style={{ width: 320, borderRightWidth: 1, borderRightColor: c.border }}
            contentContainerStyle={{ padding: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {infoPanel}
          </ScrollView>
          <View style={{ flex: 1 }}>{tabsPanel}</View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ padding: 16 }}>{infoPanel}</View>
            {tabsPanel}
          </ScrollView>
        </View>
      )}

      {/* Add-member modals — org-wide only */}
      {isOrgWide && (
        <>
          <AddMemberModal
            visible={addModal === 'registrations'}
            title="Add to registrations"
            members={allMembers}
            alreadyAdded={rsvpUserIds}
            onAdd={addRsvp}
            onClose={() => setAddModal(null)}
          />
          <AddMemberModal
            visible={addModal === 'attendance'}
            title="Add to attendance"
            members={allMembers}
            alreadyAdded={attendUserIds}
            onAdd={addAttendance}
            onClose={() => setAddModal(null)}
          />
          {id && (
            <QRCheckinModal
              visible={showScan}
              eventId={id}
              orgId={event.org_id}
              onClose={() => { setShowScan(false); load(); }}
            />
          )}
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sc = StyleSheet.create({
  topBar:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 }
} );

const ip = StyleSheet.create({
  panel:      { borderWidth: 1, borderRadius: 16, padding: 20 },
  typeBadge:  { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  stats:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  stat:       { alignItems: 'center', gap: 2 },
  statDivider:{ width: 1, height: 36 },
  editBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 10 },
  calBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, flex: 1, justifyContent: 'center' }
} );

const tp = StyleSheet.create({
  tabBar:       { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  tabBtn:       { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomWidth: 2 },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }
} );

const ls = StyleSheet.create({
  list:       { paddingHorizontal: 12, paddingTop: 8 },
  emptyBox:   { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  personRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1 },
  avatar:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statusChip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  removeBtn:  { padding: 6 }
} );
