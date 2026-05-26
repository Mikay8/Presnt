/**
 * Public event page — no authentication required
 *
 * URL: /c/[org_slug]/events/[event_code]
 *
 * States:
 *  upcoming → RSVP form (first, last, email)
 *  ongoing  → Attendance check-in form (first, last, email)
 *  past     → "Event is closed" message
 *  cancelled→ Cancelled badge
 *
 * Also shows: iCal download, Google Calendar link, share button.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, useAlert } from '@/components/ui';
import { supabase } from '@/lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────────

type PublicEvent = {
  id:                    string;
  title:                 string;
  type:                  string;
  start_time:            string;
  end_time:              string | null;
  location:              string | null;
  meeting_url:           string | null;
  description:           string | null;
  is_cancelled:          boolean | null;
  is_public:             boolean;
  points:                number | null;
  rsvp_required:         boolean | null;
  checkin_open_minutes:  number | null;
  checkin_grace_minutes: number | null;
};

type PublicOrg = {
  id:            string;
  name:          string;
  slug:          string;
  logo_url:      string | null;
  primary_color: string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function toCalStamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

type EventPhase = 'cancelled' | 'ongoing' | 'upcoming' | 'past';

function eventPhase(event: PublicEvent): EventPhase {
  if (event.is_cancelled) return 'cancelled';
  const now       = new Date();
  const start     = new Date(event.start_time);
  const end       = event.end_time ? new Date(event.end_time) : null;
  const openMins  = event.checkin_open_minutes  ?? 15;
  const graceMins = event.checkin_grace_minutes ?? 15;
  const winOpen   = new Date(start.getTime() - openMins  * 60_000);
  const winClose  = end
    ? new Date(end.getTime()   + graceMins * 60_000)
    : new Date(start.getTime() + graceMins * 60_000);
  if (now >= winOpen && now <= winClose) return 'ongoing';
  if (now < start) return 'upcoming';
  return 'past';
}

const TYPE_LABEL: Record<string, string> = {
  meeting: 'Chapter Meeting', social: 'Social', service: 'Service',
  fundraiser: 'Fundraiser', workshop: 'Workshop', other: 'Event',
};

function downloadIcal(ev: PublicEvent, orgName: string) {
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
    Linking.openURL(`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`).catch(() => {});
  }
}

function openGoogleCalendar(ev: PublicEvent) {
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

// ─── Guest Form ────────────────────────────────────────────────────────────────

function GuestForm({
  phase,
  event,
  org,
  eventCode,
  primaryColor,
}: {
  phase: 'upcoming' | 'ongoing';
  event: PublicEvent;
  org: PublicOrg;
  eventCode: string;
  primaryColor: string;
}) {
  const [first,     setFirst]     = useState('');
  const [last,      setLast]      = useState('');
  const [email,     setEmail]     = useState('');
  const [submitting,setSubmitting]= useState(false);
  const [done,      setDone]      = useState(false);
  const { showAlert } = useAlert();

  const isRsvp = phase === 'upcoming';
  const label  = isRsvp ? 'RSVP' : 'Check In';
  const icon   = isRsvp ? 'checkmark-circle-outline' : 'qr-code-outline';

  async function handleSubmit() {
    if (!first.trim() || !last.trim() || !email.trim()) {
      Alert.alert('Missing info', 'Please fill in all fields.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('public_event_guests')
        .insert({
          event_id:   event.id,
          org_id:     org.id,
          first_name: first.trim(),
          last_name:  last.trim(),
          email:      email.trim().toLowerCase(),
          type:       isRsvp ? 'rsvp' : 'attendance',
        });
      if (error) throw error;
      setDone(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <View style={[gf.successBox, { borderColor: primaryColor + '40', backgroundColor: primaryColor + '10' }]}>
        <Ionicons name="checkmark-circle" size={36} color={primaryColor} />
        <Text size="lg" weight="bold" style={{ color: primaryColor, marginTop: 10, textAlign: 'center' }}>
          {isRsvp ? 'You\'re on the list!' : 'Checked in!'}
        </Text>
        <Text size="sm" style={{ color: '#6B7280', marginTop: 6, textAlign: 'center' }}>
          {isRsvp
            ? `Thanks ${first}! We'll see you at ${event.title}.`
            : `Welcome ${first}! Your attendance has been recorded.`}
        </Text>
      </View>
    );
  }

  return (
    <View style={[gf.box, { borderColor: primaryColor + '30', backgroundColor: primaryColor + '06' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Ionicons name={icon} size={18} color={primaryColor} />
        <Text size="md" weight="bold" style={{ color: '#111827' }}>
          {isRsvp ? 'RSVP for this event' : 'Check in to this event'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <Text size="xs" weight="medium" style={gf.label}>FIRST NAME</Text>
          <TextInput
            value={first}
            onChangeText={setFirst}
            placeholder="Jane"
            placeholderTextColor="#9CA3AF"
            style={gf.input}
            autoCapitalize="words"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text size="xs" weight="medium" style={gf.label}>LAST NAME</Text>
          <TextInput
            value={last}
            onChangeText={setLast}
            placeholder="Smith"
            placeholderTextColor="#9CA3AF"
            style={gf.input}
            autoCapitalize="words"
          />
        </View>
      </View>

      <Text size="xs" weight="medium" style={gf.label}>EMAIL</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="jane@example.com"
        placeholderTextColor="#9CA3AF"
        style={[gf.input, { marginBottom: 14 }]}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Pressable
        onPress={handleSubmit}
        disabled={submitting}
        style={({ pressed }) => [gf.btn, { backgroundColor: pressed ? primaryColor + 'DD' : primaryColor, opacity: submitting ? 0.6 : 1 }]}
      >
        {submitting
          ? <ActivityIndicator size="small" color="#fff" />
          : <>
              <Ionicons name={icon} size={16} color="#fff" />
              <Text size="sm" weight="bold" style={{ color: '#fff' }}>{label}</Text>
            </>
        }
      </Pressable>
    </View>
  );
}

const gf = StyleSheet.create({
  box:        { borderWidth: 1, borderRadius: 16, padding: 18, marginTop: 20 },
  successBox: { borderWidth: 1, borderRadius: 16, padding: 24, marginTop: 20, alignItems: 'center' },
  label:      { color: '#6B7280', letterSpacing: 0.8, marginBottom: 5, fontSize: 10 },
  input:      { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: '#111827', backgroundColor: '#fff', marginBottom: 0 },
  btn:        { borderRadius: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function PublicEventPage() {
  const { org_slug, event_code } = useLocalSearchParams<{ org_slug: string; event_code: string }>();
  const { width }  = useWindowDimensions();
  const insets     = useSafeAreaInsets();
  const isWide     = width >= 680;

  const [org,     setOrg]     = useState<PublicOrg | null>(null);
  const [event,   setEvent]   = useState<PublicEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound,setNotFound]= useState(false);

  useEffect(() => {
    if (!org_slug || !event_code) return;
    (async () => {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, name, slug, logo_url, primary_color')
        .eq('slug', org_slug)
        .eq('is_deleted', false)
        .single();

      if (!orgData) { setNotFound(true); setLoading(false); return; }
      setOrg(orgData as PublicOrg);

      const { data: evData } = await supabase
        .from('events')
        .select('id, title, type, start_time, end_time, location, meeting_url, description, is_cancelled, is_public, points, rsvp_required, checkin_open_minutes, checkin_grace_minutes')
        .eq('org_id', orgData.id)
        .eq('event_code', event_code)
        .eq('is_deleted', false)
        .single();

      if (!evData || !evData.is_public) { setNotFound(true); setLoading(false); return; }
      setEvent(evData as PublicEvent);
      setLoading(false);
    })();
  }, [org_slug, event_code]);

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top + 40 }]}>
        <ActivityIndicator size="large" color="#F08862" />
      </View>
    );
  }

  if (notFound || !event || !org) {
    return (
      <View style={[s.center, { paddingTop: insets.top + 40 }]}>
        <Ionicons name="calendar-outline" size={48} color="#9CA3AF" />
        <Text size="lg" weight="bold" style={{ marginTop: 16, color: '#111827' }}>Event not found</Text>
        <Text size="sm" style={{ marginTop: 8, color: '#6B7280', textAlign: 'center', paddingHorizontal: 32 }}>
          This link may be invalid or the event may have been removed.
        </Text>
      </View>
    );
  }

  const phase        = eventPhase(event);
  const primaryColor = org.primary_color ?? '#F08862';
  const publicUrl    = `https://presnt.link/c/${org.slug}/events/${event_code}`;

  const statusConfig = {
    cancelled: { label: 'Cancelled',  color: '#EF4444' },
    ongoing:   { label: 'Live Now',   color: '#F59E0B' },
    upcoming:  { label: 'Upcoming',   color: '#22C55E' },
    past:      { label: 'Past',       color: '#9CA3AF' },
  }[phase];

  function handleShare() {
    if (Platform.OS === 'web') {
      if (navigator?.share) {
        navigator.share({ title: event!.title, url: publicUrl }).catch(() => {});
      } else {
        navigator?.clipboard?.writeText(publicUrl);
        Alert.alert('Copied!', 'Link copied to clipboard.');
      }
    } else {
      Share.share({ message: publicUrl, title: event!.title }).catch(() => {});
    }
  }

  // ── Layout ───────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F3F4F6' }}
      contentContainerStyle={{ paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[s.header, { backgroundColor: primaryColor, paddingTop: insets.top + 16 }]}>
        <Text size="sm" weight="bold" style={{ color: '#fff', opacity: 0.9 }}>{org.name}</Text>
        <Text size="xl" weight="bold" style={{ color: '#fff', marginTop: 4, lineHeight: 30, fontSize: 26 }}>
          {event.title}
        </Text>
        {/* Status + type pills */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <View style={[s.headerPill, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
            <Text size="xs" weight="medium" style={{ color: '#fff' }}>
              {TYPE_LABEL[event.type] ?? event.type}
            </Text>
          </View>
          <View style={[s.headerPill, { backgroundColor: statusConfig.color + '33' }]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusConfig.color }} />
            <Text size="xs" weight="medium" style={{ color: '#fff' }}>{statusConfig.label}</Text>
          </View>
        </View>
      </View>

      {/* Card */}
      <View style={[s.card, isWide && s.cardWide]}>

        {/* Details */}
        <View style={{ gap: 13 }}>
          <View style={s.detailRow}>
            <Ionicons name="calendar-outline" size={18} color="#6B7280" />
            <Text size="sm" style={{ color: '#374151', flex: 1 }}>{fmt(event.start_time)}</Text>
          </View>
          <View style={s.detailRow}>
            <Ionicons name="time-outline" size={18} color="#6B7280" />
            <Text size="sm" style={{ color: '#374151' }}>
              {fmtTime(event.start_time)}
              {event.end_time ? ` – ${fmtTime(event.end_time)}` : ''}
            </Text>
          </View>
          {event.meeting_url ? (
            <Pressable style={s.detailRow} onPress={() => Linking.openURL(event.meeting_url!)}>
              <Ionicons name="videocam-outline" size={18} color={primaryColor} />
              <Text size="sm" style={{ color: primaryColor }}>Join online</Text>
            </Pressable>
          ) : event.location ? (
            <View style={s.detailRow}>
              <Ionicons name="location-outline" size={18} color="#6B7280" />
              <Text size="sm" style={{ color: '#374151', flex: 1 }}>{event.location}</Text>
            </View>
          ) : null}
          
        </View>

        {/* Description */}
        {event.description ? (
          <>
            <View style={[s.divider, { marginVertical: 18 }]} />
            <Text size="sm" style={{ color: '#374151', lineHeight: 22 }}>{event.description}</Text>
          </>
        ) : null}

        <View style={[s.divider, { marginVertical: 18 }]} />

        {/* Calendar export + Share */}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Pressable
            onPress={() => openGoogleCalendar(event)}
            style={[s.calBtn, { flex: 1, minWidth: 140 }]}
          >
            <Ionicons name="logo-google" size={15} color="#374151" />
            <Text size="xs" weight="medium" style={{ color: '#374151' }}>Google Calendar</Text>
          </Pressable>
          <Pressable
            onPress={() => downloadIcal(event, org.name)}
            style={[s.calBtn, { flex: 1, minWidth: 120 }]}
          >
            <Ionicons name="calendar-outline" size={15} color="#374151" />
            <Text size="xs" weight="medium" style={{ color: '#374151' }}>Save .ics</Text>
          </Pressable>
          <Pressable
            onPress={handleShare}
            style={[s.calBtn, { flex: 1, minWidth: 90 }]}
          >
            <Ionicons name="share-outline" size={15} color={primaryColor} />
            <Text size="xs" weight="medium" style={{ color: primaryColor }}>Share</Text>
          </Pressable>
        </View>

        {/* State-based action section */}
        {phase === 'upcoming' && (
          <GuestForm phase="upcoming" event={event} org={org} eventCode={event_code} primaryColor={primaryColor} />
        )}

        {phase === 'ongoing' && (
          <GuestForm phase="ongoing" event={event} org={org} eventCode={event_code} primaryColor={primaryColor} />
        )}

        {phase === 'past' && (
          <View style={[s.closedBox, { borderColor: '#9CA3AF30' }]}>
            <Ionicons name="lock-closed-outline" size={28} color="#9CA3AF" />
            <Text size="md" weight="bold" style={{ color: '#6B7280', marginTop: 10 }}>Event is closed</Text>
            <Text size="sm" style={{ color: '#9CA3AF', marginTop: 4, textAlign: 'center' }}>
              This event has already taken place. Registration is no longer available.
            </Text>
          </View>
        )}

        {phase === 'cancelled' && (
          <View style={[s.closedBox, { borderColor: '#EF444430', backgroundColor: '#FEF2F2' }]}>
            <Ionicons name="close-circle-outline" size={28} color="#EF4444" />
            <Text size="md" weight="bold" style={{ color: '#EF4444', marginTop: 10 }}>Event Cancelled</Text>
            <Text size="sm" style={{ color: '#9CA3AF', marginTop: 4, textAlign: 'center' }}>
              This event has been cancelled. Contact the organizer for more information.
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={[s.divider, { marginTop: 24, marginBottom: 14 }]} />
        <Text size="xs" style={{ color: '#9CA3AF', textAlign: 'center' }}>
          Powered by Presnt · {org.name}
        </Text>
      </View>
    </ScrollView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:     { paddingHorizontal: 24, paddingBottom: 24 },
  headerPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  card:       { margin: 16, backgroundColor: '#fff', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 3 } },
  cardWide:   { maxWidth: 640, alignSelf: 'center', marginTop: 20 },
  detailRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  divider:    { height: 1, backgroundColor: '#F3F4F6' },
  calBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#F9FAFB' },
  closedBox:  { borderWidth: 1, borderRadius: 16, padding: 24, marginTop: 20, alignItems: 'center', backgroundColor: '#F9FAFB' },
});
