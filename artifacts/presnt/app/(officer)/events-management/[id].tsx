/**
 * Admin — Event Detail  /events/[id]
 *
 * Two tabs:
 *   • Registrations (RSVPs)  — who signed up; add any chapter member manually
 *   • Attendance             — who was marked present; add any chapter member manually
 *
 * Desktop: two-column layout (event info left, tabs right)
 * Mobile:  stacked, tabs scroll
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fullName(p: { first_name: string; last_name: string } | null) {
  if (!p) return 'Unknown';
  return `${p.first_name} ${p.last_name}`;
}

/** Format a Date as YYYYMMDDTHHmmssZ for iCal / Google Calendar URLs */
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
    location: ev.location ?? '',
  });
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
      Alert.alert('Export failed', 'Could not open the calendar file on this device.');
    });
  }
}

// ─── Add-member modal ─────────────────────────────────────────────────────────

function AddMemberModal({
  visible,
  title,
  members,
  alreadyAdded,
  onAdd,
  onClose,
}: {
  visible:      boolean;
  title:        string;
  members:      Member[];
  alreadyAdded: Set<string>;
  onAdd:        (m: Member) => Promise<void>;
  onClose:      () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [query,   setQuery]   = useState('');
  const [adding,  setAdding]  = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 200); }
  }, [visible]);

  const filtered = members.filter((m) => {
    if (!query.trim()) return true;
    const name = fullName(m.profiles).toLowerCase();
    const email = (m.profiles?.email ?? '').toLowerCase();
    const q = query.toLowerCase();
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

        {/* Search */}
        <View style={[am.searchRow, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
          <Ionicons name="search-outline" size={16} color={c.textSubtle} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or email…"
            placeholderTextColor={c.textSubtle}
            style={[am.searchInput, { color: c.text }]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={16} color={c.textSubtle} />
            </Pressable>
          )}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(m) => m.user_id}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 12, gap: 4 }}
          renderItem={({ item: m }) => {
            const added  = alreadyAdded.has(m.user_id);
            const busy   = adding === m.user_id;
            return (
              <Pressable
                disabled={added || busy}
                onPress={() => handleAdd(m)}
                style={[am.memberRow, { borderColor: c.border, opacity: added ? 0.5 : 1 }]}
              >
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

// ─── Screen ───────────────────────────────────────────────────────────────────

type TabKey = 'registrations' | 'attendance';

export default function OfficerEventDetailScreen() {
  const { id }    = useLocalSearchParams<{ id: string }>();
  const { theme } = useThemeStore();
  const c         = theme.colors;
  const { width } = useWindowDimensions();
  const insets    = useSafeAreaInsets();
  const isWide    = width >= 800;
  const { organization } = useAuthStore();
  const orgId = organization?.id ?? '';

  const [event,     setEvent]     = useState<EventDetail | null>(null);
  const [rsvps,     setRsvps]     = useState<RsvpRow[]>([]);
  const [attendance,setAttendance]= useState<AttendRow[]>([]);
  const [allMembers,setAllMembers]= useState<Member[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState<TabKey>('registrations');
  const [addModal,  setAddModal]  = useState<TabKey | null>(null);
  const [showScan,  setShowScan]  = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!id || !orgId) { setLoading(false); return; }

    const [evRes, rsvpRes, attendRes, membRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, type, start_time, end_time, location, meeting_url, description, is_cancelled, rsvp_required, points, checkin_open_minutes, checkin_grace_minutes, is_org_wide')
        .eq('id', id)
        .single(),

      supabase
        .from('rsvps')
        .select('id, user_id, status, created_at, profiles(first_name, last_name, email)')
        .eq('event_id', id)
        .eq('org_id', orgId)
        .order('created_at'),

      supabase
        .from('event_attendance')
        .select('id, user_id, status, checked_in_at, profiles(first_name, last_name, email)')
        .eq('event_id', id)
        .eq('org_id', orgId)
        .order('checked_in_at'),

      supabase
        .from('memberships')
        .select('user_id, profiles(first_name, last_name, email)')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('user_id'),
    ]);

    if (evRes.data)      setEvent(evRes.data as EventDetail);
    if (rsvpRes.data)    setRsvps(rsvpRes.data as unknown as RsvpRow[]);
    if (attendRes.data)  setAttendance(attendRes.data as unknown as AttendRow[]);
    if (membRes.data)    setAllMembers(membRes.data as unknown as Member[]);
    setLoading(false);
  }, [id, orgId]);

  useEffect(() => { load(); }, [load]);

  // ── Add RSVP ──────────────────────────────────────────────────────────────

  async function addRsvp(m: Member) {
    const { error } = await supabase.from('rsvps').upsert({
      event_id: id,
      org_id:   orgId,
      user_id:  m.user_id,
      status:   'confirmed',
    }, { onConflict: 'event_id,user_id' });
    if (error) { Alert.alert('Error', error.message); return; }
    await load();
  }

  // ── Add attendance ────────────────────────────────────────────────────────

  async function addAttendance(m: Member) {
    const { error } = await supabase.from('event_attendance').upsert({
      event_id:       id,
      org_id:         orgId,
      user_id:        m.user_id,
      status:         'present',
      checked_in_at:  new Date().toISOString(),
      check_in_method:'manual',
    }, { onConflict: 'event_id,user_id' });
    if (error) { Alert.alert('Error', error.message); return; }
    await load();
  }

  // ── Remove ────────────────────────────────────────────────────────────────

  async function removeRsvp(rsvpId: string) {
    Alert.alert('Remove registration', 'Remove this person from the registration list?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await supabase.from('rsvps').delete().eq('id', rsvpId);
        await load();
      }},
    ]);
  }

  async function removeAttendance(attendId: string) {
    Alert.alert('Remove attendance', 'Remove this attendance record?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await supabase.from('event_attendance').delete().eq('id', attendId);
        await load();
      }},
    ]);
  }

  // ── Derived sets for "already added" check ────────────────────────────────

  const rsvpUserIds   = new Set(rsvps.map((r) => r.user_id));
  const attendUserIds = new Set(attendance.map((a) => a.user_id));

  // ── Render helpers ────────────────────────────────────────────────────────

  function RsvpList() {
    if (rsvps.length === 0) {
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
              borderColor:     r.status === 'confirmed' ? '#22C55E'   : '#F59400',
            }]}>
              <Text size="xs" weight="medium" color={r.status === 'confirmed' ? '#22C55E' : '#F59400'}>
                {r.status}
              </Text>
            </View>
            <Pressable onPress={() => removeRsvp(r.id)} style={ls.removeBtn}>
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
            </Pressable>
          </View>
        ))}
      </>
    );
  }

  function AttendList() {
    if (attendance.length === 0) {
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
            <Pressable onPress={() => removeAttendance(a.id)} style={ls.removeBtn}>
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
            </Pressable>
          </View>
        ))}
      </>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

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

  // ── Info panel ────────────────────────────────────────────────────────────

  const TYPE_COLORS: Record<string, string> = {
    mandatory: '#E26B4A', social: '#A855F7', optional: '#22C55E', meeting: '#3B82F6',
  };
  const typeColor = TYPE_COLORS[event.type] ?? c.primary;

  const _now        = new Date();
  const _start      = new Date(event.start_time);
  const _end        = event.end_time ? new Date(event.end_time) : null;
  const _openMins   = event.checkin_open_minutes  ?? 15;
  const _graceMins  = event.checkin_grace_minutes ?? 15;
  const _winOpen    = new Date(_start.getTime() - _openMins  * 60_000);
  const _winClose   = _end
    ? new Date(_end.getTime()   + _graceMins * 60_000)
    : new Date(_start.getTime() + _graceMins * 60_000);
  const detailStatus: 'cancelled' | 'ongoing' | 'upcoming' | 'past' =
    event.is_cancelled          ? 'cancelled'
    : (_now >= _winOpen && _now <= _winClose) ? 'ongoing'
    : _now < _start             ? 'upcoming'
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

  const infoPanel = (
    <View style={[ip.panel, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* Type badge */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <View style={[ip.typeBadge, { backgroundColor: typeColor + '22', borderColor: typeColor }]}>
          <Text size="xs" weight="medium" color={typeColor} style={{ textTransform: 'capitalize' }}>{event.type}</Text>
        </View>
        <View style={[ip.typeBadge, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
          <Text size="xs" weight="medium" color={statusColor}>{statusLabel}</Text>
        </View>
        {event.is_org_wide && (
          <View style={[ip.typeBadge, { backgroundColor: '#3B82F618', borderColor: '#3B82F650', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
            <Ionicons name="globe-outline" size={11} color="#3B82F6" />
            <Text size="xs" weight="medium" color="#3B82F6">Organization Wide</Text>
          </View>
        )}
      </View>

      <Text size="xl" weight="bold" style={{ marginBottom: 4 }}>{event.title}</Text>

      {/* Date / time */}
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

      {/* Location */}
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

      {/* Points */}
      {(event.points ?? 0) > 0 && (
        <View style={ip.detailRow}>
          <Ionicons name="star-outline" size={15} color="#F59400" />
          <Text size="sm" color={c.textMuted}>{event.points} pts</Text>
        </View>
      )}

      {/* Description */}
      {event.description && (
        <Text size="sm" color={c.textMuted} style={{ marginTop: 12, lineHeight: 20 }}>
          {event.description}
        </Text>
      )}

      {/* Save to Calendar */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <Pressable
          onPress={() => openGoogleCalendar(event)}
          style={[ip.calBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
        >
          <Ionicons name="logo-google" size={14} color={c.text} />
          <Text size="xs" weight="medium" color={c.text}>Google Calendar</Text>
        </Pressable>
        <Pressable
          onPress={() => downloadIcal(event)}
          style={[ip.calBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
        >
          <Ionicons name="calendar-outline" size={14} color={c.text} />
          <Text size="xs" weight="medium" color={c.text}>Save .ics</Text>
        </Pressable>
      </View>

      {/* Stats */}
      <View style={[ip.stats, { borderTopColor: c.border, marginTop: 16, paddingTop: 14 }]}>
        <View style={ip.stat}>
          <Text size="xl" weight="bold" color={c.primary}>{rsvps.length}</Text>
          <Text size="xs" color={c.textSubtle}>Registered</Text>
        </View>
        <View style={[ip.statDivider, { backgroundColor: c.border }]} />
        <View style={ip.stat}>
          <Text size="xl" weight="bold" color="#22C55E">{attendance.length}</Text>
          <Text size="xs" color={c.textSubtle}>Attended</Text>
        </View>
      </View>

      {/* Edit button */}
      <Pressable
        onPress={() => router.push(`/(officer)/events-management?edit=${id}` as any)}
        style={[ip.editBtn, { borderColor: c.border, marginTop: 14 }]}
      >
        <Ionicons name="create-outline" size={15} color={c.text} />
        <Text size="sm" weight="medium">Edit event</Text>
      </Pressable>
    </View>
  );

  // ── Tabs panel ────────────────────────────────────────────────────────────

  const tabsPanel = (
    <View style={{ flex: 1 }}>
      {/* Tab bar */}
      <View style={[tp.tabBar, { borderBottomColor: c.border }]}>
        {(['registrations', 'attendance'] as TabKey[]).map((t) => {
          const active = tab === t;
          const count  = t === 'registrations' ? rsvps.length : attendance.length;
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

        {/* Action buttons — right side of tab bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto', marginRight: 16, marginVertical: 8 }}>
          {detailStatus === 'ongoing' && (
            <Pressable
              onPress={() => setShowScan(true)}
              style={[tp.addBtn, { backgroundColor: '#F59E0B18', borderWidth: 1, borderColor: '#F59E0B' }]}
            >
              <Ionicons name="qr-code-outline" size={14} color="#F59E0B" />
              <Text size="xs" weight="medium" style={{ color: '#F59E0B' }}>Scan QR</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => setAddModal(tab)}
            style={[tp.addBtn, { backgroundColor: c.primary }]}
          >
            <Ionicons name="person-add-outline" size={14} color="#fff" />
            <Text size="xs" weight="medium" style={{ color: '#fff' }}>Add</Text>
          </Pressable>
        </View>
      </View>

      {/* List */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: isWide ? 40 : insets.bottom + 40 }}>
        {tab === 'registrations' ? <RsvpList /> : <AttendList />}
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
        backgroundColor: c.background,
      }]}>
        <Pressable onPress={() => router.back()} style={sc.backBtn}>
          <Ionicons name="arrow-back-outline" size={18} color={c.text} />
          <Text size="sm" weight="medium">Events</Text>
        </Pressable>
      </View>

      {isWide ? (
        // Desktop: side-by-side
        <View style={{ flex: 1, flexDirection: 'row', gap: 0 }}>
          <ScrollView
            style={{ width: 320, borderRightWidth: 1, borderRightColor: c.border }}
            contentContainerStyle={{ padding: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {infoPanel}
          </ScrollView>
          <View style={{ flex: 1 }}>
            {tabsPanel}
          </View>
        </View>
      ) : (
        // Mobile: stacked
        <View style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ padding: 16 }}>
              {infoPanel}
            </View>
            {tabsPanel}
          </ScrollView>
        </View>
      )}

      {/* Add-member modals */}
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
          orgId={orgId}
          onClose={() => { setShowScan(false); load(); }}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sc = StyleSheet.create({
  topBar:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

const ip = StyleSheet.create({
  panel:     { borderWidth: 1, borderRadius: 16, padding: 20 },
  typeBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  stats:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  stat:      { alignItems: 'center', gap: 2 },
  statDivider:{ width: 1, height: 36 },
  editBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 10 },
  calBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, flex: 1, justifyContent: 'center' },
});

const tp = StyleSheet.create({
  tabBar:      { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  tabBtn:      { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive:{ borderBottomWidth: 2 },
  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
});

const ls = StyleSheet.create({
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1 },
  avatar:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statusChip:{ borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  removeBtn: { padding: 6 },
  emptyBox:  { alignItems: 'center', paddingVertical: 48 },
});

const am = StyleSheet.create({
  sheet:     { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', minHeight: 400 },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  closeBtn:  { padding: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput:{ flex: 1, fontSize: 14, padding: 0 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10 },
  avatar:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  addBtn:    { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
});
