import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Card, Text } from '@/components/ui';
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
  optional:  '#22C55E',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EventDetailScreen() {
  const { id }        = useLocalSearchParams<{ id: string }>();
  const { theme }     = useThemeStore();
  const { width }     = useWindowDimensions();
  const insets        = useSafeAreaInsets();
  const isWide        = width >= 800;
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
          .select('id, title, description, type, location, start_time, end_time, rsvp_required, is_cancelled, event_code, is_public')
          .eq('id', id)
          .single()
      : supabase
          .from('events')
          .select('id, title, description, type, location, start_time, end_time, rsvp_required, is_cancelled, event_code, is_public')
          .eq('org_id', orgId)
          .eq('event_code', id)
          .eq('is_deleted', false)
          .single();

    const [evResult, rsvpCountResult, userRsvpResult, attendeesResult] = await Promise.all([
      evQuery,

      supabase
        .from('rsvps')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id)
        .eq('status', 'going'),

      supabase
        .from('rsvps')
        .select('id, status')
        .eq('event_id', id)
        .eq('user_id', userId)
        .maybeSingle(),

      // First few RSVPs with names for avatar stack
      supabase
        .from('rsvps')
        .select('profiles!user_id(first_name, last_name)')
        .eq('event_id', id)
        .eq('status', 'going')
        .limit(6),
    ]);

    if (evResult.error || !evResult.data) {
      setNotFound(true);
    } else {
      setEvent(evResult.data as EventDetail);
    }

    setRsvpCount(rsvpCountResult.count ?? 0);
    setUserRsvp(userRsvpResult.data ?? null);
    setAttendees((attendeesResult.data ?? []) as AttendeePreview[]);
    setLoading(false);
  }, [id, userId, orgId]);

  useEffect(() => { load(); }, [load]);

  // ── RSVP toggle ─────────────────────────────────────────────────────────────
  async function handleRsvp() {
    if (!userId || !orgId || !id) return;
    setRsvpLoading(true);

    if (userRsvp) {
      // Remove RSVP
      await supabase.from('rsvps').delete().eq('id', userRsvp.id);
      setUserRsvp(null);
      setRsvpCount((c) => Math.max(0, c - 1));
    } else {
      // Add RSVP
      const { data } = await supabase
        .from('rsvps')
        .insert({ event_id: id, user_id: userId, org_id: orgId, status: 'going' })
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

  // ── Info chips ──
  const chips = (
    <View style={styles.chips}>
      {[
        { label: formatDate(event.start_time), icon: 'calendar-outline' as const },
        { label: formatTime(event.start_time), icon: 'time-outline' as const },
        { label: event.location ?? 'TBD',      icon: 'location-outline' as const },
        { label: typeLabel,                     icon: 'flag-outline' as const, colored: true },
      ].map(({ label, icon, colored }) => (
        <View key={label} style={[
          styles.chip,
          {
            backgroundColor: colored ? typeColor + '20' : theme.colors.surfaceAlt,
            borderColor:     colored ? typeColor : theme.colors.border,
          },
        ]}>
          <Ionicons name={icon} size={13} color={colored ? typeColor : theme.colors.textMuted} />
          <Text size="sm" weight={colored ? 'medium' : 'regular'}
            color={colored ? typeColor : theme.colors.text}>
            {label}
          </Text>
        </View>
      ))}
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
            <Pressable onPress={() => router.back()}
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
            <Text size="xl" weight="bold">{event.title}</Text>
            {chips}
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
              <View style={[styles.qrBox, { backgroundColor: theme.colors.surfaceAlt }]}>
                <Ionicons name="qr-code-outline" size={48} color={theme.colors.textSubtle} />
                <Text size="sm" color={theme.colors.textSubtle} style={{ marginTop: 8 }}>QR / check-in</Text>
              </View>
              <Text size="sm" color={theme.colors.textMuted} style={{ textAlign: 'center' }}>
                Present this code at the door
              </Text>
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
        <Pressable onPress={() => router.back()}
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
        <Text size="xl" weight="bold" style={{ marginTop: 16 }}>{event.title}</Text>
        <View style={{ marginTop: 14 }}>{chips}</View>

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
      </ScrollView>

      <View style={[styles.mobileActionBar, {
        borderTopColor:  theme.colors.border,
        backgroundColor: theme.colors.background,
        paddingBottom:   insets.bottom + 12,
      }]}>
        <Button
          label={isRsvped ? 'Cancel RSVP' : 'RSVP'}
          variant={isRsvped ? 'outline' : 'primary'}
          style={{ flex: 1 }}
          loading={rsvpLoading}
          onPress={handleRsvp}
        />
        <Button label="Check in" style={{ flex: 1 }} onPress={() => {}} />
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
  qrBox:         { borderRadius: 12, height: 140, alignItems: 'center', justifyContent: 'center' },
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
});
