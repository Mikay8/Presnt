/**
 * Admin — Dashboard
 *
 * Shows chapter-wide stats: member count, dues collected, at-risk count,
 * recent announcements as an activity feed, and an attendance trend chart stub.
 */

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

import { Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type Stats = {
  totalMembers:    number;
  duesCollected:   number;
  atRisk:          number;
  onHold:          number;
};

type ActivityItem = {
  id:         string;
  title:      string;
  body:       string;
  created_at: string | null;
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label:      string;
  value:      string | number;
  sub?:       string;
  highlight?: boolean;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  return (
    <Card style={styles.statCard}>
      <Text size="xs" weight="medium" color={c.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </Text>
      <Text size="xxl" weight="bold"
        style={{ marginTop: 6, color: highlight ? c.error : c.text }}>
        {value}
      </Text>
      {sub && (
        <Text size="xs" color={c.textSubtle} style={{ marginTop: 2 }}>{sub}</Text>
      )}
    </Card>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminDashboardScreen() {
  const { theme }       = useThemeStore();
  const insets          = useSafeAreaInsets();
  const { width }       = useWindowDimensions();
  const isWide          = width >= 800;
  const { organization, profile } = useAuthStore();

  const [stats, setStats]           = useState<Stats | null>(null);
  const [activity, setActivity]     = useState<ActivityItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const orgId = organization?.id;

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    const [membersRes, announcementsRes] = await Promise.all([
      supabase
        .from('memberships')
        .select('dues_balance, dues_hold, dues_status, status')
        .eq('org_id', orgId)
        .eq('is_deleted', false),

      supabase
        .from('announcements')
        .select('id, title, body, created_at')
        .eq('org_id', orgId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const members = membersRes.data ?? [];
    const active  = members.filter((m) => m.status === 'active');

    const duesCollected = active.reduce((sum, m) => {
      // balance < 0 means they've overpaid; treat paid as balance <= 0
      return sum + (m.dues_balance && m.dues_balance < 0 ? Math.abs(m.dues_balance) : 0);
    }, 0);

    setStats({
      totalMembers:  active.length,
      duesCollected: Math.round(duesCollected),
      atRisk:  active.filter((m) => m.dues_status === 'overdue').length,
      onHold:  active.filter((m) => m.dues_hold === true).length,
    });

    setActivity((announcementsRes.data ?? []) as ActivityItem[]);
    setLoading(false);
    setRefreshing(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const c = theme.colors;

  const firstName = profile?.first_name ?? '';
  const lastName  = profile?.last_name  ?? '';
  const initials  = firstName && lastName ? `${firstName[0]}${lastName[0]}` : '?';

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[
        styles.header,
        { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
      ]}>
        <View>
          <Text size="xxl" weight="bold">Dashboard</Text>
          {organization && (
            <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
              {organization.name}
            </Text>
          )}
        </View>
        {/* Avatar → profile (mobile only, desktop has TopBar) */}
        {!isWide && (
          <Pressable
            onPress={() => router.push('/(admin)/profile')}
            style={[styles.avatarBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
          >
            <Text size="xs" weight="medium" color={c.textMuted}>{initials}</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide, !isWide && { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={c.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Stat grid */}
        <View style={styles.statGrid}>
          <StatCard label="Members"        value={stats?.totalMembers ?? 0} />
          <StatCard label="Dues Collected" value={`$${stats?.duesCollected ?? 0}`} />
          <StatCard label="At Risk"  value={stats?.atRisk ?? 0}  highlight={(stats?.atRisk ?? 0) > 0} />
          <StatCard label="On Hold"  value={stats?.onHold ?? 0}  highlight={(stats?.onHold ?? 0) > 0} />
        </View>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          {[
            { icon: 'people-outline',    label: 'Members',     route: '/(admin)/members'    },
            { icon: 'cash-outline',      label: 'Dues',        route: '/(admin)/dues'       },
            { icon: 'shield-outline',    label: 'Roles',       route: '/(admin)/roles'      },
            { icon: 'alert-circle-outline', label: 'Status',   route: '/(admin)/status'     },
          ].map((item) => (
            <Pressable
              key={item.label}
              onPress={() => router.push(item.route as any)}
              style={({ pressed }) => [
                styles.quickBtn,
                { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons name={item.icon as any} size={22} color={c.primary} />
              <Text size="xs" color={c.textMuted} style={{ marginTop: 4 }}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Activity feed */}
        {activity.length > 0 && (
          <>
            <Text size="xs" weight="bold" color={c.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Activity
            </Text>
            <Card style={{ paddingVertical: 4 }}>
              {activity.map((item, i) => (
                <View
                  key={item.id}
                  style={[
                    styles.activityRow,
                    i < activity.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
                  ]}
                >
                  <View style={[styles.activityDot, { backgroundColor: c.primary }]} />
                  <View style={{ flex: 1 }}>
                    <Text size="sm" weight="medium" numberOfLines={1}>{item.title}</Text>
                    <Text size="xs" color={c.textSubtle} numberOfLines={1}>{item.body}</Text>
                  </View>
                </View>
              ))}
            </Card>
          </>
        )}

        {activity.length === 0 && (
          <View style={styles.emptyActivity}>
            <Ionicons name="megaphone-outline" size={36} color={c.textSubtle} />
            <Text size="sm" color={c.textMuted} style={{ marginTop: 10 }}>No recent activity</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  avatarBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  scroll:    { padding: 20, gap: 20, paddingBottom: 48 },
  scrollWide:{ paddingHorizontal: 48, maxWidth: 900, alignSelf: 'center', width: '100%' },

  statGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard:  { flex: 1, minWidth: '44%' },

  quickRow:  { flexDirection: 'row', gap: 10 },
  quickBtn:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1 },

  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  activityDot: { width: 8, height: 8, borderRadius: 4 },

  emptyActivity: { alignItems: 'center', paddingVertical: 32 },
});
