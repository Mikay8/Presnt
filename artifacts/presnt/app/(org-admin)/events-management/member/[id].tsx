/**
 * Admin — Member View Preview  /events-management/member/[id]
 *
 * Read-only preview of what a member sees on the event detail screen.
 * Accessible via "See Member View" on the admin event detail screen.
 *
 * Contains no admin actions — just the member-facing event layout.
 * "← Back to Admin View" returns to the admin detail screen.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View
}  from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';

import { Card, Text, useAlert } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventDetail = {
  id:           string;
  title:        string;
  description:  string | null;
  type:         string;
  location:     string | null;
  meeting_url:  string | null;
  start_time:   string;
  end_time:     string | null;
  rsvp_required: boolean;
  is_cancelled:  boolean;
  is_public:     boolean;
  is_org_wide:   boolean | null;
  points:        number | null;
};

type AttendeePreview = {
  profiles: { first_name: string; last_name: string } | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  mandatory: '#E26B4A',
  social:    '#A855F7',
  optional:  '#22C55E',
  meeting:   '#3B82F6'
} ;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function toCalStamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}
function openGoogleCalendar(ev: EventDetail) {
  const start = new Date(ev.start_time);
  const end   = ev.end_time ? new Date(ev.end_time) : new Date(start.getTime() + 60 * 60_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE', text: ev.title,
    dates:  `${toCalStamp(start)}/${toCalStamp(end)}`,
    details: ev.description ?? '', location: ev.location ?? ''
} );
  Linking.openURL(`https://calendar.google.com/calendar/render?${params.toString()}`);
}
function downloadIcal(ev: EventDetail) {
  const start = new Date(ev.start_time);
  const end   = ev.end_time ? new Date(ev.end_time) : new Date(start.getTime() + 60 * 60_000);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
    `DTSTART:${toCalStamp(start)}`, `DTEND:${toCalStamp(end)}`,
    `SUMMARY:${ev.title}`,
    `DESCRIPTION:${(ev.description ?? '').replace(/\n/g, '\\n')}`,
    `LOCATION:${ev.location ?? ''}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  if (Platform.OS === 'web') {
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${ev.title.replace(/\s+/g, '_')}.ics`; a.click();
    URL.revokeObjectURL(url);
  } else {
    Linking.openURL(`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`).catch(() => {
      showAlert('Export failed', 'Could not open the calendar file on this device.');
    });
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OrgAdminMemberViewScreen() {
  const { id }    = useLocalSearchParams<{ id: string }>();
  const { theme } = useThemeStore();
  const c         = theme.colors;
  const { width } = useWindowDimensions();
  const { showAlert } = useAlert();
  const insets    = useSafeAreaInsets();
  const isWide    = width >= 800;
  const { profile } = useAuthStore();
  const userId = profile?.id;

  const [event,      setEvent]      = useState<EventDetail | null>(null);
  const [rsvpCount,  setRsvpCount]  = useState(0);
  const [attendees,  setAttendees]  = useState<AttendeePreview[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [notFound,   setNotFound]   = useState(false);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    const [evRes, rsvpRes, attendRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, description, type, location, meeting_url, start_time, end_time, rsvp_required, is_cancelled, is_public, is_org_wide, points')
        .eq('id', id).single(),
      supabase
        .from('rsvps').select('id', { count: 'exact', head: true })
        .eq('event_id', id).eq('status', 'going'),
      supabase
        .from('rsvps').select('profiles!user_id(first_name, last_name)')
        .eq('event_id', id).eq('status', 'going').limit(6),
    ]);
    if (evRes.error || !evRes.data) { setNotFound(true); }
    else { setEvent(evRes.data as EventDetail); }
    setRsvpCount(rsvpRes.count ?? 0);
    setAttendees((attendRes.data ?? []) as AttendeePreview[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  if (notFound || !event) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Ionicons name="calendar-outline" size={48} color={c.textSubtle} />
        <Text size="lg" weight="bold">Event not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 8 }}>
          <Text size="md" color={c.primary}>← Go back</Text>
        </Pressable>
      </View>
    );
  }

  const typeColor  = TYPE_COLOR[event.type] ?? c.primary;
  const typeLabel  = event.type.charAt(0).toUpperCase() + event.type.slice(1);
  const extraGoers = Math.max(0, rsvpCount - attendees.length);

  // ── Shared sub-elements ───────────────────────────────────────────────────

  const banner = (
    <View style={[s.banner, { backgroundColor: typeColor + '18' }]}>
      <Ionicons name="calendar-outline" size={40} color={typeColor} />
      {event.is_cancelled && (
        <View style={[s.cancelledBadge, { backgroundColor: c.error }]}>
          <Text size="xs" weight="bold" style={{ color: '#fff' }}>CANCELLED</Text>
        </View>
      )}
    </View>
  );

  const categoryPill = (
    <View style={[s.categoryPill, { backgroundColor: typeColor + '20', borderColor: typeColor }]}>
      <Ionicons name="pricetag-outline" size={13} color={typeColor} />
      <Text size="sm" weight="medium" color={typeColor}>{typeLabel}</Text>
    </View>
  );

  const chips = (
    <View style={s.chips}>
      {event.is_org_wide && (
        <View style={[s.chip, { backgroundColor: '#3B82F618', borderColor: '#3B82F650' }]}>
          <Ionicons name="globe-outline" size={13} color="#3B82F6" />
          <Text size="sm" weight="medium" color="#3B82F6">Organization Wide</Text>
        </View>
      )}
      {[
        { label: formatDate(event.start_time), icon: 'calendar-outline' as const },
        {
          label: formatTime(event.start_time) + (event.end_time ? ` – ${formatTime(event.end_time)}` : ''),
          icon: 'time-outline' as const
} ,
        ...(event.meeting_url
          ? [{ label: 'Remote', icon: 'videocam-outline' as const }]
          : event.location
            ? [{ label: event.location, icon: 'location-outline' as const }]
            : []),
        ...((event.points ?? 0) > 0
          ? [{ label: `${event.points} pts`, icon: 'star-outline' as const }]
          : []),
      ].map(({ label, icon }) => (
        <View key={label} style={[s.chip, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
          <Ionicons name={icon} size={13} color={c.textMuted} />
          <Text size="sm" color={c.text}>{label}</Text>
        </View>
      ))}
    </View>
  );

  const calendarButtons = (
    <View style={s.calRow}>
      <Pressable onPress={() => openGoogleCalendar(event)}
        style={[s.calBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
        <Ionicons name="logo-google" size={15} color={c.text} />
        <Text size="sm" weight="medium" color={c.text}>Google Calendar</Text>
      </Pressable>
      <Pressable onPress={() => downloadIcal(event)}
        style={[s.calBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
        <Ionicons name="calendar-outline" size={15} color={c.text} />
        <Text size="sm" weight="medium" color={c.text}>Save .ics</Text>
      </Pressable>
    </View>
  );

  const goingSection = (
    <View>
      <Text size="xs" weight="medium" color={c.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
        Going ({rsvpCount})
      </Text>
      {rsvpCount === 0 ? (
        <Text size="sm" color={c.textSubtle}>No RSVPs yet</Text>
      ) : (
        <View style={s.avatarRow}>
          {attendees.map((a, i) => (
            <View key={i} style={[s.goingAvatar, { backgroundColor: c.surfaceAlt, borderColor: c.border, marginLeft: i === 0 ? 0 : -10 }]}>
              <Text size="xs" weight="medium" color={c.textMuted}>
                {a.profiles ? `${a.profiles.first_name[0]}${a.profiles.last_name[0]}` : '?'}
              </Text>
            </View>
          ))}
          {extraGoers > 0 && (
            <View style={[s.goingAvatar, { backgroundColor: c.surfaceAlt, borderColor: c.border, marginLeft: -10 }]}>
              <Text size="xs" color={c.textMuted}>+{extraGoers}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  // Profile QR — uses the logged-in admin's ID for the preview
  const profileQr = userId ? (
    <View style={s.qrContainer}>
      <View style={[s.qrInner, { backgroundColor: '#fff' }]}>
        <QRCode value={`presnt://user/${userId}`} size={140} backgroundColor="#ffffff" color="#000000" />
      </View>
      <Text size="xs" color={c.textSubtle} style={{ marginTop: 8, textAlign: 'center' }}>
        Present this QR at the door
      </Text>
    </View>
  ) : null;

  // ── Preview banner ────────────────────────────────────────────────────────

  const previewBanner = (
    <View style={[s.previewBar, { backgroundColor: '#F59E0B18', borderBottomColor: '#F59E0B40' }]}>
      <Ionicons name="eye-outline" size={14} color="#F59E0B" />
      <Text size="xs" weight="medium" color="#92400E">
        Member View Preview — this is what members see
      </Text>
    </View>
  );

  // ── Desktop ──────────────────────────────────────────────────────────────

  if (isWide) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        {/* Back header */}
        <View style={[s.topBar, { paddingTop: 20, borderBottomColor: c.border, backgroundColor: c.background }]}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back-outline" size={18} color={c.text} />
            <Text size="sm" weight="medium">Admin View</Text>
          </Pressable>
          <View style={[s.previewChip, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B50' }]}>
            <Ionicons name="eye-outline" size={13} color="#F59E0B" />
            <Text size="xs" weight="medium" color="#92400E">Member View Preview</Text>
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.widePad} showsVerticalScrollIndicator={false}>
          {/* Title row */}
          <View style={s.wideTitleRow}>
            <View>
              <Text size="xs" color={c.textMuted}>Calendar</Text>
              <Text size="xl" weight="bold">{event.title}</Text>
            </View>
            {/* RSVP button is shown but disabled — read-only preview */}
            <View style={[s.rsvpPreview, { borderColor: c.primary, backgroundColor: c.primary + '10' }]}>
              <Text size="sm" weight="medium" color={c.primary}>RSVP</Text>
            </View>
          </View>

          <View style={s.wideContent}>
            <View style={{ flex: 1, gap: 20 }}>
              {banner}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text size="xl" weight="bold" style={{ flex: 1 }}>{event.title}</Text>
                {categoryPill}
              </View>
              {chips}
              {calendarButtons}
              {event.description && (
                <View>
                  <Text size="xs" weight="medium" color={c.textMuted}
                    style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    About
                  </Text>
                  <Text size="md" color={c.textMuted} style={{ lineHeight: 24 }}>
                    {event.description}
                  </Text>
                </View>
              )}
            </View>

            <View style={s.wideRightPanel}>
              <Card style={{ gap: 12 }}>{goingSection}</Card>
              <Card style={{ gap: 12 }}>
                <Text size="xs" weight="medium" color={c.textMuted}
                  style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                  Check-in
                </Text>
                {profileQr}
              </Card>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Mobile ───────────────────────────────────────────────────────────────

  return (
    <View style={[s.mobileRoot, { backgroundColor: c.background }]}>
      {/* Back header */}
      <View style={[s.mobileTopNav, { paddingTop: insets.top + 8, borderBottomColor: c.border, backgroundColor: c.background }]}>
        <Pressable onPress={() => router.back()} style={[s.backBtnRow, { borderColor: c.border }]}>
          <Ionicons name="arrow-back-outline" size={16} color={c.text} />
          <Text size="sm" weight="medium" color={c.text}>Admin View</Text>
        </Pressable>
        <View style={[s.previewChip, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B50' }]}>
          <Ionicons name="eye-outline" size={12} color="#F59E0B" />
          <Text size="xs" weight="medium" color="#92400E">Preview</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.mobilePad, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {banner}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <Text size="xl" weight="bold" style={{ flex: 1 }}>{event.title}</Text>
          {categoryPill}
        </View>
        <View style={{ marginTop: 14 }}>{chips}</View>
        <View style={{ marginTop: 14 }}>{calendarButtons}</View>

        {event.description && (
          <>
            <Text size="xs" weight="medium" color={c.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 8 }}>
              About
            </Text>
            <Text size="md" color={c.textMuted} style={{ lineHeight: 24 }}>{event.description}</Text>
          </>
        )}

        <View style={{ marginTop: 20 }}>{goingSection}</View>

        <Text size="xs" weight="medium" color={c.textMuted}
          style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 12 }}>
          Check-in
        </Text>
        {profileQr}
      </ScrollView>

      {/* Bottom RSVP bar — shown but disabled (preview) */}
      <View style={[s.mobileActionBar, {
        borderTopColor: c.border, backgroundColor: c.background, paddingBottom: insets.bottom + 12
} ]}>
        <View style={[s.rsvpPreviewFull, { borderColor: c.primary, backgroundColor: c.primary + '10' }]}>
          <Text size="md" weight="medium" color={c.primary}>RSVP</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  topBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backBtnRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  previewChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  previewBar:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  widePad:       { padding: 32 },
  wideTitleRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  wideContent:   { flexDirection: 'row', gap: 24 },
  wideRightPanel:{ width: 280, gap: 16 },
  rsvpPreview:   { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 9 },
  rsvpPreviewFull: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  mobileRoot:    { flex: 1 },
  mobileTopNav:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1 },
  mobilePad:     { paddingHorizontal: 16, paddingTop: 16 },
  mobileActionBar:{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  banner:        { height: 180, borderRadius: 16, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  cancelledBadge:{ position: 'absolute', top: 12, right: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  chips:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:          { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  categoryPill:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  calRow:        { flexDirection: 'row', gap: 10 },
  calBtn:        { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, flex: 1, justifyContent: 'center' },
  avatarRow:     { flexDirection: 'row', alignItems: 'center' },
  goingAvatar:   { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  qrContainer:   { alignItems: 'center', paddingVertical: 8 },
  qrInner:       { borderRadius: 12, padding: 12 }
} );
