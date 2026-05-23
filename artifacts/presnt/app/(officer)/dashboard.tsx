/**
 * Officer — Dashboard
 *
 * Quick-access hub showing upcoming events and fast-links to
 * whatever the officer has permission to manage.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';
import { usePermissions } from '@/hooks/usePermissions';
import { PERMISSIONS } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';

type EventRow = {
  id: string;
  title: string;
  start_time: string;
  type: string;
  location: string | null;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day:   d.getDate(),
    time:  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

export default function OfficerDashboardScreen() {
  const { theme }      = useThemeStore();
  const insets         = useSafeAreaInsets();
  const { width }      = useWindowDimensions();
  const isWide         = width >= 800;
  const { membership, organization, profile } = useAuthStore();
  const { can }        = usePermissions();
  const userView       = useUserViewStore((s) => s.session);
  const c              = theme.colors;

  const viewPerms  = userView?.role === 'officer' ? userView.permissions : null;
  const hasPerm    = (p: string) => viewPerms ? viewPerms.includes(p) : can(p as any);

  const hasEvents     = hasPerm(PERMISSIONS.MANAGE_EVENTS);
  const hasAttendance = hasPerm(PERMISSIONS.MANAGE_ATTENDANCE);
  const hasExcuses    = hasPerm(PERMISSIONS.MANAGE_ATTENDANCE) || hasPerm(PERMISSIONS.MANAGE_MEMBERS);
  const hasMembers    = hasPerm(PERMISSIONS.MANAGE_MEMBERS);

  const orgId = userView?.org.id ?? membership?.org_id ?? '';
  const orgName = userView?.org.name ?? organization?.app_display_name ?? organization?.name ?? 'Chapter';

  const [events,     setEvents]    = useState<EventRow[]>([]);
  const [loading,    setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    const { data } = await supabase
      .from('events')
      .select('id, title, start_time, type, location')
      .eq('org_id', orgId)
      .eq('is_deleted', false)
      .eq('is_cancelled', false)
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })
      .limit(5);
    setEvents((data ?? []) as EventRow[]);
    setLoading(false);
    setRefreshing(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const quickLinks: { icon: any; label: string; route: string; perm: boolean }[] = [
    { icon: 'list-outline',           label: 'Events',     route: '/(officer)/events-management', perm: hasEvents },
    { icon: 'checkmark-done-outline', label: 'Attendance', route: '/(officer)/attendance',        perm: hasAttendance },
    { icon: 'document-text-outline',  label: 'Excuses',    route: '/(officer)/excuses',           perm: hasExcuses },
    { icon: 'people-outline',         label: 'Members',    route: '/(officer)/members',           perm: hasMembers },
  ].filter(l => l.perm);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View>
          <Text size="xxl" weight="bold">Dashboard</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>{orgName}</Text>
        </View>
      </View>

      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide, !isWide && { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
      >
        {/* Quick links */}
        {quickLinks.length > 0 && (
          <>
            <Text size="xs" weight="bold" color={c.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Quick Access
            </Text>
            <View style={styles.quickRow}>
              {quickLinks.map(l => (
                <Pressable
                  key={l.label}
                  onPress={() => router.push(l.route as any)}
                  style={({ pressed }) => [styles.quickCard, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}
                >
                  <View style={[styles.quickIcon, { backgroundColor: c.primary + '18' }]}>
                    <Ionicons name={l.icon} size={22} color={c.primary} />
                  </View>
                  <Text size="sm" weight="medium" style={{ marginTop: 8 }}>{l.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Upcoming events */}
        <Text size="xs" weight="bold" color={c.textMuted}
          style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Upcoming Events
        </Text>
        <Card style={{ paddingVertical: 0 }}>
          {loading ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <Text size="sm" color={c.textMuted}>Loading…</Text>
            </View>
          ) : events.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: 'center', gap: 8 }}>
              <Ionicons name="calendar-outline" size={32} color={c.textSubtle} />
              <Text size="sm" color={c.textMuted}>No upcoming events</Text>
              {hasEvents && (
                <Pressable onPress={() => router.push('/(officer)/events-management' as any)}>
                  <Text size="sm" color={c.primary} weight="medium">Create one</Text>
                </Pressable>
              )}
            </View>
          ) : (
            events.map((e, i) => {
              const d = fmtDate(e.start_time);
              const isLast = i === events.length - 1;
              return (
                <Pressable
                  key={e.id}
                  onPress={() => hasEvents ? router.push('/(officer)/events-management' as any) : undefined}
                  style={[styles.eventRow, { borderBottomColor: c.border }, !isLast && styles.eventRowBorder]}
                >
                  <View style={[styles.dateBadge, { backgroundColor: c.primary + '18' }]}>
                    <Text size="xs" weight="bold" color={c.primary}>{d.month}</Text>
                    <Text size="lg" weight="bold" color={c.primary}>{d.day}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text size="sm" weight="medium" numberOfLines={1}>{e.title}</Text>
                    <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
                      {d.time}{e.location ? ` · ${e.location}` : ''}
                    </Text>
                  </View>
                  {hasEvents && <Ionicons name="chevron-forward-outline" size={16} color={c.textSubtle} />}
                </Pressable>
              );
            })
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  scroll:     { padding: 20, gap: 16, paddingBottom: 48 },
  scrollWide: { paddingHorizontal: 48, maxWidth: 760, alignSelf: 'center', width: '100%' },
  quickRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickCard:  { flex: 1, minWidth: 100, borderWidth: 1, borderRadius: 14, padding: 16, alignItems: 'center' },
  quickIcon:  { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  eventRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  eventRowBorder: { borderBottomWidth: 1 },
  dateBadge:  { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
