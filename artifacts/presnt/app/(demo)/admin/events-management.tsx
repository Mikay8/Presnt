/**
 * Demo Admin — Events Management (read-only)
 *
 * Shows the full events list. The "New event" / "Post event" button is
 * visible but disabled (opacity 0.4, no onPress). No edit/delete actions.
 */

import { Ionicons } from '@expo/vector-icons';
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

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import type { Tables } from '@/types/database';

type Event = Tables<'events'>;

const DESKTOP = 768;

function fmtDate(iso: string) {
  const d = new Date(iso);
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day:   d.getDate(),
    time:  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

function eventStatus(event: Event): 'cancelled' | 'ongoing' | 'upcoming' | 'past' {
  if (event.is_cancelled) return 'cancelled';
  const now   = new Date();
  const start = new Date(event.start_time);
  const end   = event.end_time ? new Date(event.end_time) : null;
  const openMins  = (event as any).checkin_open_minutes  ?? 15;
  const graceMins = (event as any).checkin_grace_minutes ?? 15;
  const windowOpen  = new Date(start.getTime() - openMins * 60_000);
  const windowClose = end
    ? new Date(end.getTime() + graceMins * 60_000)
    : new Date(start.getTime() + graceMins * 60_000);
  if (now >= windowOpen && now <= windowClose) return 'ongoing';
  if (now < start) return 'upcoming';
  return 'past';
}

const STATUS_COLOR: Record<ReturnType<typeof eventStatus>, string> = {
  cancelled: '#EF4444', ongoing: '#F59E0B', upcoming: '#22C55E', past: '',
};
const STATUS_LABEL: Record<ReturnType<typeof eventStatus>, string> = {
  cancelled: 'Cancelled', ongoing: 'Ongoing', upcoming: 'Upcoming', past: 'Past',
};

// ─── Mobile Card ──────────────────────────────────────────────────────────────

function MobileCard({ event }: { event: Event }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const d      = fmtDate(event.start_time);
  const status = eventStatus(event);
  const statusColor = status === 'past' ? c.textSubtle : STATUS_COLOR[status];
  return (
    <View style={[mc.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={[mc.dateBadge, { backgroundColor: c.surfaceAlt }]}>
          <Text size="xs" weight="medium" color={c.textSubtle}>{d.month}</Text>
          <Text size="md" weight="bold">{d.day}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text size="sm" weight="medium">{event.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text size="xs" color={c.textSubtle}>{d.time}</Text>
            {event.location ? (
              <><Text size="xs" color={c.textSubtle}>·</Text>
              <Text size="xs" color={c.textSubtle}>{event.location}</Text></>
            ) : null}
          </View>
        </View>
        <View style={[mc.statusChip, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
          <Text size="xs" weight="medium" color={statusColor}>{STATUS_LABEL[status]}</Text>
        </View>
      </View>
    </View>
  );
}

const mc = StyleSheet.create({
  card:       { borderWidth: 1, borderRadius: 14, padding: 14 },
  dateBadge:  { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statusChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

const TABS = ['All', 'Upcoming', 'Past'] as const;
type Tab = typeof TABS[number];

export default function DemoAdminEventsScreen() {
  const { theme }      = useThemeStore();
  const insets         = useSafeAreaInsets();
  const { membership } = useAuthStore();
  const { width }      = useWindowDimensions();
  const isWide         = width >= DESKTOP;
  const c              = theme.colors;
  const orgId          = membership?.org_id ?? '';

  const [events,  setEvents]  = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [tab,     setTab]     = useState<Tab>('Upcoming');

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    const { data } = await supabase.from('events').select('*')
      .eq('org_id', orgId).eq('is_deleted', false).eq('is_occurrence', false)
      .order('start_time', { ascending: false });
    setEvents((data ?? []) as Event[]);
    setLoading(false);
    setRefresh(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const upcomingCount = events.filter(e => { const s = eventStatus(e); return s === 'upcoming' || s === 'ongoing'; }).length;
  const pastCount     = events.filter(e => eventStatus(e) === 'past').length;

  const displayed = events.filter(e => {
    const s = eventStatus(e);
    if (tab === 'Upcoming') return s === 'upcoming' || s === 'ongoing';
    if (tab === 'Past')     return s === 'past';
    return true;
  });

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[sc.header, { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.background, borderBottomColor: c.border }]}>
        <View style={{ flex: 1 }}>
          <Text size="xxl" weight="bold">Events</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {upcomingCount} upcoming · {pastCount} past
          </Text>
        </View>
        {/* Disabled "New event" button */}
        <View style={[sc.newBtn, { backgroundColor: c.primary, opacity: 0.4 }]}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text size="sm" weight="medium" style={{ color: '#fff' }}>{isWide ? 'New event' : 'New'}</Text>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sc.tabRow}
        style={{ flexShrink: 0, flexGrow: 0, backgroundColor: c.background, borderBottomWidth: 1, borderBottomColor: c.border }}>
        {TABS.map(t => {
          const count  = t === 'Upcoming' ? upcomingCount : t === 'Past' ? pastCount : null;
          const active = tab === t;
          return (
            <Pressable key={t} onPress={() => setTab(t)}
              style={[sc.tabChip, { backgroundColor: active ? c.surfaceAlt : 'transparent', borderColor: active ? c.border : 'transparent' }]}>
              <Text size="sm" weight={active ? 'medium' : 'regular'} color={active ? c.text : c.textMuted}>
                {t}{count !== null ? ` · ${count}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Desktop table header */}
      {isWide && (
        <View style={[sc.tableHeader, { backgroundColor: c.background, borderBottomColor: c.border }]}>
          {[['EVENT', 2], ['DATE', 0], ['LOCATION', 1], ['STATUS', 0]].map(([label, flex]) => (
            <Text key={label as string} size="xs" weight="medium" color={c.textSubtle}
              style={[{ textTransform: 'uppercase', letterSpacing: 1 }, flex ? { flex: flex as number } : { width: 90 }]}>
              {label as string}
            </Text>
          ))}
        </View>
      )}

      <ScrollView
        contentContainerStyle={isWide ? undefined : [sc.mobileScroll, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(); }} tintColor={c.primary} />}
        showsVerticalScrollIndicator={false}>
        {displayed.length === 0 ? (
          <View style={sc.empty}>
            <Ionicons name="calendar-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              No {tab.toLowerCase()} events
            </Text>
          </View>
        ) : isWide ? (
          displayed.map(e => {
            const d      = fmtDate(e.start_time);
            const status = eventStatus(e);
            const sc2    = status === 'past' ? c.textSubtle : STATUS_COLOR[status];
            return (
              <View key={e.id} style={[tr.row, { borderBottomColor: c.border }]}>
                <View style={[tr.dateBadge, { backgroundColor: c.surfaceAlt }]}>
                  <Text size="xs" weight="medium" color={c.textSubtle}>{d.month}</Text>
                  <Text size="md" weight="bold">{d.day}</Text>
                </View>
                <View style={{ flex: 2, gap: 2 }}>
                  <Text size="sm" weight="medium">{e.title}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text size="sm" color={c.textMuted} numberOfLines={1}>{e.location ?? '—'}</Text>
                </View>
                <View style={[tr.statusChip, { backgroundColor: sc2 + '18', borderColor: sc2 }]}>
                  <Text size="xs" weight="medium" color={sc2}>{STATUS_LABEL[status]}</Text>
                </View>
              </View>
            );
          })
        ) : (
          <View style={{ gap: 10 }}>
            {displayed.map(e => <MobileCard key={e.id} event={e} />)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const sc = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  newBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  tabRow:      { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  tabChip:     { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  tableHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1 },
  mobileScroll:{ padding: 14, gap: 10, paddingBottom: 48 },
  empty:       { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
});

const tr = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1 },
  dateBadge:  { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statusChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, width: 90, alignItems: 'center' },
});
