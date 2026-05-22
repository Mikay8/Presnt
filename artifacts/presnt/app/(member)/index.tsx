import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Card, DonutChart, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type Announcement = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  author_id: string;
  profiles: { first_name: string; last_name: string } | null;
};

type UpcomingEvent = {
  id: string;
  title: string;
  type: string;
  start_time: string;
  location: string | null;
  event_code: string | null;
};

function eventSlug(ev: UpcomingEvent) { return ev.event_code ?? ev.id; }

type AttendanceSummary = { attended: number; total: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 60)  return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Sub-components ───────────────────────────────────────────────────────────

function AnnouncementCard({ item }: { item: Announcement }) {
  const { theme } = useThemeStore();
  const authorName = item.profiles
    ? `${item.profiles.first_name} ${item.profiles.last_name}`
    : 'Chapter Officer';
  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.announcementHeader}>
        <View style={styles.announcementLeft}>
          <Avatar name={authorName} size="sm" />
          <View>
            <Text size="sm" weight="medium">{authorName}</Text>
            <Text size="xs" color={theme.colors.textMuted}>{item.title}</Text>
          </View>
        </View>
        <Text size="xs" color={theme.colors.textSubtle}>{timeAgo(item.created_at)}</Text>
      </View>
      <Text size="sm" color={theme.colors.textMuted} style={{ lineHeight: 20 }}>
        {item.body}
      </Text>
    </Card>
  );
}

function SectionLabel({ children }: { children: string }) {
  const { theme } = useThemeStore();
  return (
    <Text size="xs" weight="medium" color={theme.colors.textMuted}
      style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
      {children}
    </Text>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MemberHomeScreen() {
  const { theme }        = useThemeStore();
  const { width }        = useWindowDimensions();
  const insets           = useSafeAreaInsets();
  const isWide           = width >= 800;
  const { profile, membership, organization } = useAuthStore();

  const [announcements, setAnnouncements]   = useState<Announcement[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [attendance, setAttendance]         = useState<AttendanceSummary>({ attended: 0, total: 0 });
  const [termLabel, setTermLabel]           = useState('');
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);

  const orgId  = organization?.id;
  const userId = profile?.id;

  const firstName = profile?.first_name ?? 'there';
  const initials  = profile
    ? `${profile.first_name[0] ?? ''}${profile.last_name[0] ?? ''}`
    : '?';

  const load = useCallback(async () => {
    if (!orgId || !userId) { setLoading(false); return; }

    const now = new Date().toISOString();

    const [annResult, evResult, termResult] = await Promise.all([
      // Announcements with author name
      supabase
        .from('announcements')
        .select('id, title, body, created_at, author_id, profiles!author_id(first_name, last_name)')
        .eq('org_id', orgId)
        .eq('is_deleted', false)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20),

      // Upcoming events
      supabase
        .from('events')
        .select('id, title, type, start_time, location, event_code')
        .eq('org_id', orgId)
        .eq('is_deleted', false)
        .eq('is_cancelled', false)
        .gte('start_time', now)
        .order('start_time')
        .limit(5),

      // Active academic term
      supabase
        .from('academic_terms')
        .select('id, name, start_date, end_date')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .single(),
    ]);

    if (annResult.data)    setAnnouncements(annResult.data as Announcement[]);
    if (evResult.data)     setUpcomingEvents(evResult.data);

    const term = termResult.data;
    if (term) {
      setTermLabel(term.name);

      // Attendance stats for current term
      const [eventsInTerm, userAttendance] = await Promise.all([
        supabase
          .from('events')
          .select('id', { count: 'exact', head: false })
          .eq('org_id', orgId)
          .eq('type', 'mandatory')
          .eq('is_deleted', false)
          .gte('start_time', `${term.start_date}T00:00:00Z`)
          .lte('start_time', `${term.end_date}T23:59:59Z`),

        supabase
          .from('event_attendance')
          .select('id', { count: 'exact', head: false })
          .eq('user_id', userId)
          .eq('org_id', orgId)
          .eq('status', 'present'),
      ]);

      setAttendance({
        total:    eventsInTerm.count ?? 0,
        attended: userAttendance.count ?? 0,
      });
    }

    setLoading(false);
    setRefreshing(false);
  }, [orgId, userId]);

  useEffect(() => { load(); }, [load]);

  function onRefresh() { setRefreshing(true); load(); }

  const attendancePct = attendance.total > 0
    ? Math.round((attendance.attended / attendance.total) * 100)
    : 0;

  const announcementsList = loading ? (
    <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />
  ) : announcements.length === 0 ? (
    <Card style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
      <Ionicons name="megaphone-outline" size={32} color={theme.colors.textSubtle} />
      <Text size="sm" color={theme.colors.textMuted}>No announcements yet</Text>
    </Card>
  ) : (
    <View style={{ gap: 12 }}>
      {announcements.map((item) => (
        <AnnouncementCard key={item.id} item={item} />
      ))}
    </View>
  );

  const TODAY = new Date();
  const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const todayLabel = `${DAYS[TODAY.getDay()]} · ${MONTHS[TODAY.getMonth()]} ${TODAY.getDate()}`;

  // ── Desktop ──
  if (isWide) {
    return (
      <View style={[styles.wideRoot, { backgroundColor: theme.colors.background }]}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.wideMain}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        >
          <View style={styles.wideTitleRow}>
            <View>
              <Text size="h1" weight="bold">Welcome back, {firstName}</Text>
              <Text size="sm" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
                {todayLabel}
              </Text>
            </View>
            <View style={styles.wideTitleActions}>
              <Button label="View calendar" variant="outline" size="sm" onPress={() => router.push('/(member)/calendar')} />
              <Button label="Submit excuse" size="sm" onPress={() => {}} />
            </View>
          </View>

          <SectionLabel>Announcements</SectionLabel>
          {announcementsList}
        </ScrollView>

        {/* Right sidebar */}
        <View style={[styles.rightPanel, { borderLeftColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
          <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 20 }}>
            <Text size="xs" weight="medium" color={theme.colors.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              Attendance
            </Text>
            <DonutChart percent={attendancePct} size={120} strokeWidth={14} />
            <Text size="sm" color={theme.colors.textMuted} style={{ textAlign: 'center' }}>
              {termLabel || 'Current term'} · {attendance.attended}/{attendance.total} meetings
            </Text>
          </Card>

          <Card style={{ gap: 0, paddingVertical: 16 }}>
            <Text size="xs" weight="medium" color={theme.colors.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14, paddingHorizontal: 4 }}>
              Upcoming Events
            </Text>
            {upcomingEvents.length === 0 ? (
              <Text size="sm" color={theme.colors.textSubtle} style={{ paddingHorizontal: 4 }}>
                No upcoming events
              </Text>
            ) : upcomingEvents.map((ev, i) => {
              const d = new Date(ev.start_time);
              return (
                <Pressable
                  key={ev.id}
                  style={[
                    styles.upcomingRow,
                    i < upcomingEvents.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
                  ]}
                  onPress={() => router.push(`/(member)/event/${eventSlug(ev)}` as any)}
                >
                  <View style={[styles.upcomingDateChip, { backgroundColor: theme.colors.surfaceAlt }]}>
                    <Text size="xs" weight="bold" color={theme.colors.textMuted}
                      style={{ textTransform: 'uppercase' }}>
                      {MONTH_SHORT[d.getMonth()]}
                    </Text>
                    <Text size="sm" weight="bold">{d.getDate()}</Text>
                  </View>
                  <Text size="sm" style={{ flex: 1 }}>{ev.title}</Text>
                </Pressable>
              );
            })}
          </Card>
        </View>
      </View>
    );
  }

  // ── Mobile ──
  return (
    <View style={[styles.mobileRoot, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.mobileHeader, { paddingTop: insets.top + 12, borderBottomColor: theme.colors.border }]}>
        <Avatar name={`${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`} size="sm" />
        <View style={{ flex: 1 }}>
          <Text size="md" weight="medium">{profile?.first_name} {profile?.last_name}</Text>
          <Text size="xs" color={theme.colors.textMuted}>
            {organization?.name} · {membership?.role ?? 'Member'}
          </Text>
        </View>
        <Pressable style={[styles.bellBtn, { borderColor: theme.colors.border }]}>
          <Ionicons name="notifications-outline" size={18} color={theme.colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.mobileScroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        <SectionLabel>Announcements</SectionLabel>
        {announcementsList}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wideRoot:         { flex: 1, flexDirection: 'row' },
  wideMain:         { padding: 32, gap: 0 },
  wideTitleRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  wideTitleActions: { flexDirection: 'row', gap: 10 },
  rightPanel:       { width: 300, borderLeftWidth: 1, padding: 20, gap: 16 },
  upcomingRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4 },
  upcomingDateChip: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  announcementHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  announcementLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 },
  mobileRoot:   { flex: 1 },
  mobileHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  bellBtn:      { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mobileScroll: { padding: 16, gap: 0 },
});
