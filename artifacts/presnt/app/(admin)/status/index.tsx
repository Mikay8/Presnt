/**
 * Admin — Chapter Status
 *
 * Overview of member compliance: good-standing count, at-risk (dues overdue),
 * on-hold members, and a full at-risk member list.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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

type StatusMember = {
  id:           string;
  dues_status:  string;
  dues_hold:    boolean | null;
  dues_balance: number | null;
  profiles: {
    first_name: string;
    last_name:  string;
    email:      string;
  } | null;
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent,
}: {
  label: string; value: string | number; sub?: string; accent?: string;
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
        style={{ marginTop: 6, color: accent ?? c.text }}>
        {value}
      </Text>
      {sub && <Text size="xs" color={c.textSubtle} style={{ marginTop: 2 }}>{sub}</Text>}
    </Card>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminStatusScreen() {
  const { theme }    = useThemeStore();
  const insets       = useSafeAreaInsets();
  const { width }    = useWindowDimensions();
  const isWide       = width >= 800;
  const { organization } = useAuthStore();

  const [members, setMembers]       = useState<StatusMember[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const orgId = organization?.id;

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    const { data } = await supabase
      .from('memberships')
      .select(`
        id, dues_status, dues_hold, dues_balance,
        profiles!user_id(first_name, last_name, email)
      `)
      .eq('org_id', orgId)
      .eq('is_deleted', false)
      .eq('status', 'active');

    setMembers((data ?? []) as StatusMember[]);
    setLoading(false);
    setRefreshing(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  // Derived groups
  const total       = members.length;
  const atRisk      = members.filter((m) => m.dues_status === 'overdue' && !m.dues_hold);
  const onHold      = members.filter((m) => m.dues_hold === true);
  const goodStanding = members.filter((m) => m.dues_status === 'paid' && !m.dues_hold);
  const compliance  = total > 0 ? Math.round((goodStanding.length / total) * 100) : 100;

  const c = theme.colors;

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
          <Text size="xxl" weight="bold">Status</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>Chapter-wide compliance</Text>
        </View>
      </View>

      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
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
          <StatCard label="Compliance"    value={`${compliance}%`} />
          <StatCard label="Good Standing" value={goodStanding.length} />
          <StatCard label="At Risk"       value={atRisk.length}       accent={atRisk.length > 0 ? c.error : undefined} />
          <StatCard label="On Hold"       value={onHold.length}       accent={onHold.length > 0 ? c.warning : undefined} />
        </View>

        {/* Compliance bar */}
        <Card>
          <Text size="sm" weight="medium" style={{ marginBottom: 10 }}>Chapter Compliance</Text>
          <View style={[styles.barTrack, { backgroundColor: c.surfaceAlt }]}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${compliance}%`,
                  backgroundColor: compliance >= 80 ? c.success : compliance >= 60 ? c.warning : c.error,
                },
              ]}
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <Text size="xs" color={c.textMuted}>{goodStanding.length} in good standing</Text>
            <Text size="xs" weight="bold">{compliance}%</Text>
          </View>
        </Card>

        {/* At-risk members */}
        {atRisk.length > 0 && (
          <>
            <Text size="xs" weight="bold" color={c.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              At Risk · {atRisk.length}
            </Text>
            <Card style={{ paddingVertical: 0 }}>
              {atRisk.map((m, i) => {
                const profile   = m.profiles;
                const firstName = profile?.first_name ?? '';
                const lastName  = profile?.last_name  ?? '';
                const initials  = firstName && lastName ? `${firstName[0]}${lastName[0]}` : '?';
                const fullName  = `${firstName} ${lastName}`.trim() || 'Unknown';
                return (
                  <View
                    key={m.id}
                    style={[
                      styles.memberRow,
                      { borderBottomColor: c.border },
                      i < atRisk.length - 1 && { borderBottomWidth: 1 },
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: c.error + '18', borderColor: c.error + '40' }]}>
                      <Text size="xs" weight="medium" color={c.error}>{initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text size="sm" weight="medium">{fullName}</Text>
                      <Text size="xs" color={c.textMuted}>{profile?.email ?? '—'}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: '#fee2e2' }]}>
                      <Text size="xs" weight="medium" style={{ color: '#b91c1c' }}>Overdue</Text>
                    </View>
                  </View>
                );
              })}
            </Card>
          </>
        )}

        {/* On-hold members */}
        {onHold.length > 0 && (
          <>
            <Text size="xs" weight="bold" color={c.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              On Hold · {onHold.length}
            </Text>
            <Card style={{ paddingVertical: 0 }}>
              {onHold.map((m, i) => {
                const profile   = m.profiles;
                const firstName = profile?.first_name ?? '';
                const lastName  = profile?.last_name  ?? '';
                const initials  = firstName && lastName ? `${firstName[0]}${lastName[0]}` : '?';
                const fullName  = `${firstName} ${lastName}`.trim() || 'Unknown';
                return (
                  <View
                    key={m.id}
                    style={[
                      styles.memberRow,
                      { borderBottomColor: c.border },
                      i < onHold.length - 1 && { borderBottomWidth: 1 },
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: c.warning + '22', borderColor: c.warning + '60' }]}>
                      <Text size="xs" weight="medium" color={c.warning}>{initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text size="sm" weight="medium">{fullName}</Text>
                      <Text size="xs" color={c.textMuted}>{profile?.email ?? '—'}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: '#f3e8ff' }]}>
                      <Text size="xs" weight="medium" style={{ color: '#7e22ce' }}>Hold</Text>
                    </View>
                  </View>
                );
              })}
            </Card>
          </>
        )}

        {atRisk.length === 0 && onHold.length === 0 && (
          <View style={styles.allGood}>
            <Ionicons name="checkmark-circle-outline" size={48} color={c.success} />
            <Text size="lg" weight="bold" style={{ marginTop: 14, color: c.success }}>
              All members in good standing
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  scroll:    { padding: 20, gap: 16, paddingBottom: 48 },
  scrollWide:{ paddingHorizontal: 48, maxWidth: 900, alignSelf: 'center', width: '100%' },

  statGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard:  { flex: 1, minWidth: '44%' },

  barTrack:  { height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill:   { height: 10, borderRadius: 5 },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  avatar:    { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },

  allGood:   { alignItems: 'center', paddingVertical: 40 },
});
