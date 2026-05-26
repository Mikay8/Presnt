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
import { clearBadge } from '@/lib/notifications';
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

type AppNotification = {
  id:         string;
  type:       string;
  title:      string;
  body:       string;
  is_read:    boolean;
  created_at: string;
  data:       Record<string, string> | null;
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

// Icon map for notification types
const NOTIF_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  excuse_approved:    'checkmark-circle-outline',
  excuse_denied:      'close-circle-outline',
  excuse_submitted:   'document-text-outline',
  compliance_warning: 'warning-outline',
  event_reminder:     'calendar-outline',
  event_open:         'qr-code-outline',
  role_assigned:      'shield-outline',
  dues_hold:          'card-outline',
  announcement:       'megaphone-outline',
  generic:            'notifications-outline',
};
const NOTIF_COLOR: Record<string, string> = {
  excuse_approved:    '#22c55e',
  excuse_denied:      '#ef4444',
  compliance_warning: '#f59e0b',
  dues_hold:          '#ef4444',
  event_open:         '#6366f1',
};

function NotificationRow({
  item,
  onMarkRead,
}: {
  item:       AppNotification;
  onMarkRead: (id: string) => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const icon  = NOTIF_ICON[item.type]  ?? 'notifications-outline';
  const color = NOTIF_COLOR[item.type] ?? c.primary;

  return (
    <Pressable
      onPress={() => { if (!item.is_read) onMarkRead(item.id); }}
      style={({ pressed }) => [
        styles.notifRow,
        { borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 },
        !item.is_read && { backgroundColor: c.primary + '08' },
      ]}
    >
      <View style={[styles.notifIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" weight={item.is_read ? 'regular' : 'medium'} numberOfLines={1}>
          {item.title}
        </Text>
        <Text size="xs" color={c.textMuted} numberOfLines={2} style={{ marginTop: 2 }}>
          {item.body}
        </Text>
        <Text size="xs" color={c.textSubtle} style={{ marginTop: 3 }}>
          {timeAgo(item.created_at)}
        </Text>
      </View>
      {!item.is_read && (
        <View style={[styles.unreadDot, { backgroundColor: c.primary }]} />
      )}
    </Pressable>
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
  const [notifications, setNotifications]   = useState<AppNotification[]>([]);
  const [unreadCount,   setUnreadCount]     = useState(0);
  const [showNotifs,    setShowNotifs]      = useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [attendance, setAttendance]         = useState<AttendanceSummary>({ attended: 0, total: 0 });
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

    const [annResult, evResult, notifResult] = await Promise.all([
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

      // Personal notifications (most recent 30)
      supabase
        .from('notifications')
        .select('id, type, title, body, is_read, created_at, data')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    if (annResult.data)   setAnnouncements(annResult.data as Announcement[]);
    if (evResult.data)    setUpcomingEvents(evResult.data);
    if (notifResult.data) {
      const notifs = notifResult.data as AppNotification[];
      setNotifications(notifs);
      const unread = notifs.filter(n => !n.is_read).length;
      setUnreadCount(unread);
      // Clear the OS badge now that the user opened the app
      if (unread === 0) clearBadge().catch(() => {});
    }

    // Attendance stats (all-time)
    const [eventsTotal, userAttendance] = await Promise.all([
      supabase
        .from('events')
        .select('id', { count: 'exact', head: false })
        .eq('org_id', orgId)
        .eq('type', 'mandatory')
        .eq('is_deleted', false),

      supabase
        .from('event_attendance')
        .select('id', { count: 'exact', head: false })
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .eq('status', 'present'),
    ]);

    setAttendance({
      total:    eventsTotal.count ?? 0,
      attended: userAttendance.count ?? 0,
    });

    setLoading(false);
    setRefreshing(false);
  }, [orgId, userId]);

  useEffect(() => { load(); }, [load]);

  function onRefresh() { setRefreshing(true); load(); }

  async function markRead(notifId: string) {
    setNotifications(prev =>
      prev.map(n => n.id === notifId ? { ...n, is_read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notifId);
  }

  async function markAllRead() {
    if (unreadCount === 0) return;
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
    clearBadge().catch(() => {});
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', unreadIds);
  }

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
              <Pressable
                onPress={() => setShowNotifs(v => !v)}
                style={[styles.bellBtn, { borderColor: theme.colors.border }]}
              >
                <Ionicons name="notifications-outline" size={18} color={theme.colors.text} />
                {unreadCount > 0 && (
                  <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
                    <Text size="xs" color="#fff" weight="bold" style={{ fontSize: 9, lineHeight: 13 }}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>

          {/* Notification panel — desktop */}
          {showNotifs && (
            <View style={{ marginBottom: 24 }}>
              <View style={styles.notifHeader}>
                <SectionLabel>Notifications</SectionLabel>
                {unreadCount > 0 && (
                  <Pressable onPress={markAllRead}>
                    <Text size="xs" color={theme.colors.primary} weight="medium">Mark all read</Text>
                  </Pressable>
                )}
              </View>
              <Card style={{ paddingVertical: 0 }}>
                {notifications.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                    <Ionicons name="notifications-off-outline" size={28} color={theme.colors.textSubtle} />
                    <Text size="sm" color={theme.colors.textMuted}>No notifications</Text>
                  </View>
                ) : (
                  notifications.map((n, i) => (
                    <View key={n.id} style={i < notifications.length - 1 ? undefined : { borderBottomWidth: 0 }}>
                      <NotificationRow item={n} onMarkRead={markRead} />
                    </View>
                  ))
                )}
              </Card>
            </View>
          )}

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
              {attendance.attended}/{attendance.total} meetings attended
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
        <Pressable
          onPress={() => setShowNotifs(v => !v)}
          style={[styles.bellBtn, { borderColor: theme.colors.border }]}
        >
          <Ionicons name="notifications-outline" size={18} color={theme.colors.text} />
          {unreadCount > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
              <Text size="xs" color="#fff" weight="bold" style={{ fontSize: 9, lineHeight: 13 }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.mobileScroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {/* ── Notifications panel (toggled by bell) ─────────────────── */}
        {showNotifs && (
          <View style={{ marginBottom: 20 }}>
            <View style={[styles.notifHeader]}>
              <SectionLabel>Notifications</SectionLabel>
              {unreadCount > 0 && (
                <Pressable onPress={markAllRead}>
                  <Text size="xs" color={theme.colors.primary} weight="medium">
                    Mark all read
                  </Text>
                </Pressable>
              )}
            </View>
            <Card style={{ paddingVertical: 0 }}>
              {notifications.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                  <Ionicons name="notifications-off-outline" size={28} color={theme.colors.textSubtle} />
                  <Text size="sm" color={theme.colors.textMuted}>No notifications</Text>
                </View>
              ) : (
                notifications.map((n, i) => (
                  <View
                    key={n.id}
                    style={i < notifications.length - 1 ? undefined : { borderBottomWidth: 0 }}
                  >
                    <NotificationRow item={n} onMarkRead={markRead} />
                  </View>
                ))
              )}
            </Card>
          </View>
        )}

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
  bellBtn:      { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  badge:        { position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  mobileScroll: { padding: 16, gap: 0 },
  notifHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  notifRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: 1 },
  notifIcon:    { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  unreadDot:    { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
