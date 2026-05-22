/**
 * Public event page — no authentication required
 *
 * URL: /c/[org_slug]/events/[event_code]
 *
 * Shows public event details: title, date/time, location, description.
 * Anyone with the link can view it (e.g. scan a QR code at the door).
 * No RSVP/attendance actions — those are in the authenticated app.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────────

type PublicEvent = {
  id:           string;
  title:        string;
  type:         string;
  start_time:   string;
  end_time:     string | null;
  location:     string | null;
  meeting_url:  string | null;
  description:  string | null;
  is_cancelled: boolean | null;
  is_public:    boolean;
  points:       number | null;
  rsvp_required:boolean | null;
  checkin_open_minutes:  number | null;
  checkin_grace_minutes: number | null;
};

type PublicOrg = {
  id:          string;
  name:        string;
  slug:        string;
  logo_url:    string | null;
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

function eventStatus(event: PublicEvent): 'cancelled' | 'ongoing' | 'upcoming' | 'past' {
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

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function PublicEventPage() {
  const { org_slug, event_code } = useLocalSearchParams<{ org_slug: string; event_code: string }>();
  const { width }  = useWindowDimensions();
  const insets     = useSafeAreaInsets();
  const isWide     = width >= 640;

  const [org,     setOrg]     = useState<PublicOrg | null>(null);
  const [event,   setEvent]   = useState<PublicEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound,setNotFound]= useState(false);

  useEffect(() => {
    if (!org_slug || !event_code) return;
    (async () => {
      // 1. Look up org by slug
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, name, slug, logo_url, primary_color')
        .eq('slug', org_slug)
        .eq('is_deleted', false)
        .single();

      if (!orgData) { setNotFound(true); setLoading(false); return; }
      setOrg(orgData as PublicOrg);

      // 2. Look up event by org_id + event_code (uses anon RLS policy)
      const { data: evData } = await supabase
        .from('events')
        .select('id, title, type, start_time, end_time, location, meeting_url, description, is_cancelled, is_public, points, rsvp_required, checkin_open_minutes, checkin_grace_minutes')
        .eq('org_id', orgData.id)
        .eq('event_code', event_code)
        .eq('is_deleted', false)
        .single();

      // Treat not found OR not public as a 404 — don't leak private event details
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

  const status      = eventStatus(event);
  const primaryColor = org.primary_color ?? '#F08862';

  const statusConfig = {
    cancelled: { label: 'Cancelled',  color: '#EF4444' },
    ongoing:   { label: 'Ongoing',    color: '#F59E0B' },
    upcoming:  { label: 'Upcoming',   color: '#22C55E' },
    past:      { label: 'Past',       color: '#9CA3AF' },
  }[status];

  // ── Layout ───────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F9FAFB' }}
      contentContainerStyle={{ paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header bar */}
      <View style={[s.header, { backgroundColor: primaryColor, paddingTop: insets.top + 12 }]}>
        <Text size="sm" weight="bold" style={{ color: '#fff', opacity: 0.85 }}>{org.name}</Text>
      </View>

      {/* Card */}
      <View style={[s.card, isWide && s.cardWide]}>

        {/* Status + type row */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <View style={[s.badge, { backgroundColor: primaryColor + '18', borderColor: primaryColor }]}>
            <Text size="xs" weight="medium" style={{ color: primaryColor }}>
              {TYPE_LABEL[event.type] ?? event.type}
            </Text>
          </View>
          <View style={[s.badge, { backgroundColor: statusConfig.color + '18', borderColor: statusConfig.color }]}>
            <Text size="xs" weight="medium" style={{ color: statusConfig.color }}>
              {statusConfig.label}
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text size="xl" weight="bold" style={{ color: '#111827', marginBottom: 20, lineHeight: 28 }}>
          {event.title}
        </Text>

        {/* Details */}
        <View style={{ gap: 12 }}>
          {/* Date */}
          <View style={s.detailRow}>
            <Ionicons name="calendar-outline" size={18} color="#6B7280" />
            <Text size="sm" style={{ color: '#374151' }}>{fmt(event.start_time)}</Text>
          </View>

          {/* Time */}
          <View style={s.detailRow}>
            <Ionicons name="time-outline" size={18} color="#6B7280" />
            <Text size="sm" style={{ color: '#374151' }}>
              {fmtTime(event.start_time)}
              {event.end_time ? ` – ${fmtTime(event.end_time)}` : ''}
            </Text>
          </View>

          {/* Location */}
          {event.meeting_url ? (
            <View style={s.detailRow}>
              <Ionicons name="videocam-outline" size={18} color={primaryColor} />
              <Text
                size="sm"
                style={{ color: primaryColor }}
                onPress={() => Linking.openURL(event.meeting_url!)}
              >
                Join online
              </Text>
            </View>
          ) : event.location ? (
            <View style={s.detailRow}>
              <Ionicons name="location-outline" size={18} color="#6B7280" />
              <Text size="sm" style={{ color: '#374151', flex: 1 }}>{event.location}</Text>
            </View>
          ) : null}

          {/* Points */}
          {(event.points ?? 0) > 0 && (
            <View style={s.detailRow}>
              <Ionicons name="star-outline" size={18} color="#F59400" />
              <Text size="sm" style={{ color: '#374151' }}>{event.points} point{event.points !== 1 ? 's' : ''}</Text>
            </View>
          )}

          {/* RSVP note */}
          {event.rsvp_required && (
            <View style={s.detailRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#6B7280" />
              <Text size="sm" style={{ color: '#6B7280' }}>RSVP required — sign in to the app to register</Text>
            </View>
          )}
        </View>

        {/* Description */}
        {event.description ? (
          <>
            <View style={[s.divider, { marginVertical: 20 }]} />
            <Text size="sm" style={{ color: '#374151', lineHeight: 22 }}>{event.description}</Text>
          </>
        ) : null}

        {/* Footer */}
        <View style={[s.divider, { marginTop: 24, marginBottom: 16 }]} />
        <Text size="xs" style={{ color: '#9CA3AF', textAlign: 'center' }}>
          Powered by Presnt · {org.name}
        </Text>
      </View>
    </ScrollView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:   { paddingHorizontal: 20, paddingBottom: 16 },
  card:     { margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 2 } },
  cardWide: { maxWidth: 560, alignSelf: 'center', marginTop: 24 },
  badge:    { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  detailRow:{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  divider:  { height: 1, backgroundColor: '#F3F4F6' },
});
