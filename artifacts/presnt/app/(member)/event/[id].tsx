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

import { Avatar, Button, Card, Text, useAlert } from '@/components/ui';
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
  start_time:   string;
  end_time:     string | null;
  rsvp_required: boolean;
  is_cancelled:  boolean;
  event_code:    string | null;
  is_public:     boolean;
  is_org_wide:   boolean | null;
};

/** Returns true if the string looks like a UUID v4. */
function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

type RsvpRow = {
  id:     string;
  status: string;
};

type AttendeePreview = {
  profiles: { first_name: string; last_name: string } | null;
};

const TYPE_COLOR: Record<string, string> = {
  mandatory: '#E26B4A',
  social:    '#A855F7',
  optional:  '#22C55E'
} ;

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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
    // On native, open as a data URI so the OS can handle .ics
    const encoded = encodeURIComponent(ics);
    Linking.openURL(`data:text/calendar;charset=utf-8,${encoded}`).catch(() => {
      showAlert('Export failed', 'Could not open the calendar file on this device.');
    });
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EventDetailScreen() {
  const { id }        = useLocalSearchParams<{ id: string }>();
  const { theme }     = useThemeStore();
  const { width }     = useWindowDimensions();
  const insets        = useSafeAreaInsets();
  const isWide        = width >= 800;
  const { showAlert } = useAlert();
  const { profile, membership, organization } = useAuthStore();

  const [event, setEvent]               = useState<EventDetail | null>(null);
  const [rsvpCount, setRsvpCount]       = useState(0);
  const [userRsvp, setUserRsvp]         = useState<RsvpRow | null>(null);
  const [attendees, setAttendees]       = useState<AttendeePreview[]>([]);
  const [loading, setLoading]           = useState(true);
  const [rsvpLoading, setRsvpLoading]   = useState(false);
  const [notFound, setNotFound]         = useState(false);

  const userId = profile?.id;
  const orgId  = organization?.id;

  const load = useCallback(async () => {
    if (!id || !userId || !orgId) { setLoading(false); return; }

    // Support both UUID and event_code slugs as the [id] param
    const evQuery = isUuid(id)
      ? supabase
          .from('events')
          .select('id, title, description, type, location, start_time, end_time, rsvp_required, is_cancelled, event_code, is_public, is_org_wide')
          .eq('id', id)
          .single()
      : supabase
          .from('events')
          .select('id, title, description, type, location, start_time, end_time, rsvp_required, is_cancelled, event_code, is_public, is_org_wide')
          .eq('org_id', orgId)
          .eq('event_code', id)
          .eq('is_deleted', false)
          .single();

    // Resolve event first so related queries always use the UUID
    const evResult = await evQuery;
    if (evResult.error || !evResult.data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setEvent(evResult.data as EventDetail);
    const eventUuid = evResult.data.id;

    const [rsvpCountResult, userRsvpResult, attendeesResult] = await Promise.all([
      supabase
        .from('rsvps')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventUuid)
        .eq('status', 'going'),

      supabase
        .from('rsvps')
        .select('id, status')
        .eq('event_id', eventUuid)
        .eq('user_id', userId)
        .maybeSingle(),

      // First few RSVPs with names for avatar stack
      supabase
        .from('rsvps')
        .select('profiles!user_id(first_name, last_name)')
        .eq('event_id', eventUuid)
        .eq('status', 'going')
        .limit(6),
    ]);

    setRsvpCount(rsvpCountResult.count ?? 0);
    setUserRsvp(userRsvpResult.data ?? null);
    setAttendees((attendeesResult.data ?? []) as AttendeePreview[]);
    setLoading(false);
  }, [id, userId, orgId]);

  useEffect(() => { load(); }, [load]);

  // ── RSVP toggle ─────────────────────────────────────────────────────────────
  async function handleRsvp() {
    if (!userId || !orgId || !event) return;
    setRsvpLoading(true);
    const eventUuid = event.id;

    if (userRsvp) {
      // Remove RSVP
      await supabase.from('rsvps').delete().eq('id', userRsvp.id);
      setUserRsvp(null);
      setRsvpCount((c) => Math.max(0, c - 1));
    } else {
      // Add RSVP
      const { data } = await supabase
        .from('rsvps')
        .insert({ event_id: eventUuid, user_id: userId, org_id: orgId, status: 'going' })
        .select('id, status')
        .single();
      if (data) {
        setUserRsvp(data);
        setRsvpCount((c) => c + 1);
      }
    }
    setRsvpLoading(false);
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (notFound || !event) {
    return (
      <View style={[styles.notFound, { backgroundColor: theme.colors.background }]}>
        <Ionicons name="calendar-outline" size={48} color={theme.colors.textSubtle} />
        <Text size="lg" weight="bold" style={{ marginTop: 16 }}>Event not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 8 }}>
          <Text size="md" color={theme.colors.primary}>← Go back</Text>
        </Pressable>
      </View>
    );
  }

  const typeColor  = TYPE_COLOR[event.type] ?? theme.colors.primary;
  const typeLabel  = event.type.charAt(0).toUpperCase() + event.type.slice(1);
  const extraGoers = Math.max(0, rsvpCount - attendees.length);
  const isRsvped   = !!userRsvp;

  // ── Category pill ──
  const categoryPill = (
    <View style={[styles.categoryPill, { backgroundColor: typeColor + '20', borderColor: typeColor }]}>
      <Ionicons name="pricetag-outline" size={13} color={typeColor} />
      <Text size="sm" weight="medium" color={typeColor}>{typeLabel}</Text>
    </View>
  );

  // ── Public pill ──
  const publicPill = event.is_public ? (
    <View style={[styles.categoryPill, { backgroundColor: '#22C55E20', borderColor: '#22C55E' }]}>
      <Ionicons name="globe-outline" size={13} color="#22C55E" />
      <Text size="sm" weight="medium" color="#22C55E">Public</Text>
    </View>
  ) : null;

  // ── Info chips (date, time, location) ──
  const chips = (
    <View style={styles.chips}>
      {event.is_org_wide && (
        <View style={[styles.chip, { backgroundColor: '#3B82F618', borderColor: '#3B82F650', flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
          <Ionicons name="globe-outline" size={13} color="#3B82F6" />
          <Text size="sm" weight="medium" color="#3B82F6">Organization Wide</Text>
        </View>
      )}
      {[
        { label: formatDate(event.start_time), icon: 'calendar-outline' as const },
        { label: formatTime(event.start_time), icon: 'time-outline' as const },
        { label: event.location ?? 'TBD',      icon: 'location-outline' as const },
      ].map(({ label, icon }) => (
        <View key={label} style={[styles.chip, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
          <Ionicons name={icon} size={13} color={theme.colors.textMuted} />
          <Text size="sm" color={theme.colors.text}>{label}</Text>
        </View>
      ))}
    </View>
  );

  // ── Save to calendar row ──
  const calendarButtons = (
    <View style={styles.calendarRow}>
      <Pressable
        onPress={() => openGoogleCalendar(event)}
        style={[styles.calBtn, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
      >
        <Ionicons name="logo-google" size={15} color={theme.colors.text} />
        <Text size="sm" weight="medium" color={theme.colors.text}>Google Calendar</Text>
      </Pressable>
      <Pressable
        onPress={() => downloadIcal(event)}
        style={[styles.calBtn, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
      >
        <Ionicons name="calendar-outline" size={15} color={theme.colors.text} />
        <Text size="sm" weight="medium" color={theme.colors.text}>Save .ics</Text>
      </Pressable>
    </View>
  );

  // ── Going section ──
  const goingSection = (
    <View>
      <Text size="xs" weight="medium" color={theme.colors.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
        Going ({rsvpCount})
      </Text>
      {rsvpCount === 0 ? (
        <Text size="sm" color={theme.colors.textSubtle}>No RSVPs yet</Text>
      ) : (
        <View style={styles.avatarRow}>
          {attendees.map((a, i) => {
            const name = a.profiles
              ? `${a.profiles.first_name} ${a.profiles.last_name}`
              : '?';
            return (
              <View key={i} style={[styles.goingAvatar, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, marginLeft: i === 0 ? 0 : -10 }]}>
                <Text size="xs" weight="medium" color={theme.colors.textMuted}>
                  {a.profiles ? `${a.profiles.first_name[0]}${a.profiles.last_name[0]}` : '?'}
                </Text>
              </View>
            );
          })}
          {extraGoers > 0 && (
            <View style={[styles.goingAvatar, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, marginLeft: -10 }]}>
              <Text size="xs" color={theme.colors.textMuted}>+{extraGoers}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  // ── Profile QR (for check-in) ──
  const profileQr = userId ? (
    <View style={styles.qrContainer}>
      <View style={[styles.qrInner, { backgroundColor: '#fff' }]}>
        <QRCode
          value={`presnt://user/${userId}`}
          size={140}
          backgroundColor="#ffffff"
          color="#000000"
        />
      </View>
      <Text size="xs" color={theme.colors.textSubtle} style={{ marginTop: 8, textAlign: 'center' }}>
        Present this QR at the door
      </Text>
    </View>
  ) : null;

  // ── Banner ──
  const banner = (
    <View style={[styles.banner, { backgroundColor: typeColor + '18' }]}>
      <Ionicons name="calendar-outline" size={40} color={typeColor} />
      {event.is_cancelled && (
        <View style={[styles.cancelledBadge, { backgroundColor: theme.colors.error }]}>
          <Text size="xs" weight="bold" style={{ color: '#fff' }}>CANCELLED</Text>
        </View>
      )}
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
        <View style={styles.wideTitleRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(member)' as any)}
              style={[styles.backBtn, { borderColor: theme.colors.border }]}>
              <Ionicons name="arrow-back-outline" size={16} color={theme.colors.text} />
            </Pressable>
            <View>
              <Text size="xs" color={theme.colors.textMuted}>Calendar</Text>
              <Text size="lg" weight="bold">{event.title}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              label={isRsvped ? 'Cancel RSVP' : 'RSVP'}
              variant={isRsvped ? 'outline' : 'primary'}
              size="sm"
              loading={rsvpLoading}
              onPress={handleRsvp}
            />
          </View>
        </View>

        <View style={styles.wideContent}>
          <View style={{ flex: 1, gap: 20 }}>
            {banner}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text size="xl" weight="bold" style={{ flex: 1 }}>{event.title}</Text>
              {publicPill}
              {categoryPill}
            </View>
            {chips}
            {calendarButtons}
            {event.description && (
              <View>
                <Text size="xs" weight="medium" color={theme.colors.textMuted}
                  style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  About
                </Text>
                <Text size="md" color={theme.colors.textMuted} style={{ lineHeight: 24 }}>
                  {event.description}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.wideRightPanel}>
            <Card style={{ gap: 12 }}>{goingSection}</Card>
            <Card style={{ gap: 12 }}>
              <Text size="xs" weight="medium" color={theme.colors.textMuted}
                style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                Check-in
              </Text>
              {profileQr}
            </Card>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ── Mobile ──
  return (
    <View style={[styles.mobileRoot, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.mobileTopNav, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(member)' as any)}
          style={[styles.backBtn, { borderColor: theme.colors.border }]}>
          <Ionicons name="arrow-back-outline" size={16} color={theme.colors.text} />
        </Pressable>
        <Pressable style={[styles.shareBtn, { borderColor: theme.colors.border }]}>
          <Ionicons name="share-outline" size={16} color={theme.colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.mobilePad, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {banner}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <Text size="xl" weight="bold" style={{ flex: 1 }}>{event.title}</Text>
          {publicPill}
          {categoryPill}
        </View>
        <View style={{ marginTop: 14 }}>{chips}</View>
        <View style={{ marginTop: 14 }}>{calendarButtons}</View>

        {event.description && (
          <>
            <Text size="xs" weight="medium" color={theme.colors.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 8 }}>
              About
            </Text>
            <Text size="md" color={theme.colors.textMuted} style={{ lineHeight: 24 }}>
              {event.description}
            </Text>
          </>
        )}

        <View style={{ marginTop: 20 }}>{goingSection}</View>

        {/* Check-in QR */}
        <Text size="xs" weight="medium" color={theme.colors.textMuted}
          style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 12 }}>
          Check-in
        </Text>
        {profileQr}
      </ScrollView>

      <View style={[styles.mobileActionBar, {
        borderTopColor:  theme.colors.border,
        backgroundColor: theme.colors.background,
        paddingBottom:   insets.bottom + 12
} ]}>
        <Button
          label={isRsvped ? 'Cancel RSVP' : 'RSVP'}
          variant={isRsvped ? 'outline' : 'primary'}
          style={{ flex: 1 }}
          loading={rsvpLoading}
          onPress={handleRsvp}
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  widePad:       { padding: 32 },
  wideTitleRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  wideContent:   { flexDirection: 'row', gap: 24 },
  wideRightPanel:{ width: 280, gap: 16 },
  backBtn:       { width: 36, height: 36, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  mobileRoot:      { flex: 1 },
  mobileTopNav:    { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  shareBtn:        { width: 36, height: 36, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  mobilePad:       { paddingHorizontal: 16 },
  mobileActionBar: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  banner:        { height: 180, borderRadius: 16, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  cancelledBadge:{ position: 'absolute', top: 12, right: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  chips:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:          { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  avatarRow:     { flexDirection: 'row', alignItems: 'center' },
  goingAvatar:   { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  categoryPill:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  calendarRow:   { flexDirection: 'row', gap: 10 },
  calBtn:        { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, flex: 1, justifyContent: 'center' },
  qrContainer:   { alignItems: 'center', paddingVertical: 8 },
  qrInner:       { borderRadius: 12, padding: 12 }
} );
