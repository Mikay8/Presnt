/**
 * Officer — Status
 *
 * Chapter-wide attendance compliance overview.
 * Shows requirement progress for every active member, flags at-risk members,
 * and lets officers drill into any member's attendance history.
 *
 * Desktop: two-column (summary left, member list right)
 * Mobile:  stacked with horizontal stat pills + scrollable member list
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
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type Requirement = {
  id:            string;
  name:          string;
  min_points:    number;
  min_events:    number | null;
  warning_threshold: number | null;
};

type Snapshot = {
  membership_id:  string;
  requirement_id: string;
  points_earned:  number;
  points_required: number;
  events_attended: number;
  events_required: number | null;
  is_compliant:   boolean;
  is_at_risk:     boolean;
};

type MemberRow = {
  id:         string;
  dues_hold:  boolean | null;
  profiles: { first_name: string; last_name: string; email: string } | null;
  snapshots:  Snapshot[];
  /** Worst single compliance pct across all requirements */
  worstPct:   number;
  isAtRisk:   boolean;
  isCompliant: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(earned: number, required: number) {
  if (required <= 0) return 100;
  return Math.min(100, Math.round((earned / required) * 100));
}

function fullName(p: { first_name: string; last_name: string } | null) {
  if (!p) return 'Unknown';
  return `${p.first_name} ${p.last_name}`.trim();
}

function initials(p: { first_name: string; last_name: string } | null) {
  if (!p) return '?';
  return `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}`;
}

// ─── Compliance bar ───────────────────────────────────────────────────────────

function ComplianceBar({ value, color }: { value: number; color: string }) {
  return (
    <View style={[bar.track, { backgroundColor: color + '22' }]}>
      <View style={[bar.fill, { width: `${value}%` as any, backgroundColor: color }]} />
    </View>
  );
}
const bar = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden', flex: 1 },
  fill:  { height: 6, borderRadius: 3 },
});

// ─── Member list item ─────────────────────────────────────────────────────────

function MemberItem({ m, reqs, c }: { m: MemberRow; reqs: Requirement[]; c: any }) {
  const statusColor = m.isAtRisk ? c.error : m.isCompliant ? c.success : c.warning;
  const statusLabel = m.isAtRisk ? 'At Risk' : m.isCompliant ? 'Compliant' : 'Behind';

  return (
    <View style={[mi.row, { borderBottomColor: c.border }]}>
      {/* Avatar */}
      <View style={[mi.avatar, { backgroundColor: statusColor + '18', borderColor: statusColor + '40' }]}>
        <Text size="xs" weight="bold" color={statusColor}>{initials(m.profiles)}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text size="sm" weight="medium">{fullName(m.profiles)}</Text>
          {m.dues_hold && (
            <View style={[mi.chip, { backgroundColor: c.warning + '18', borderColor: c.warning }]}>
              <Text size="xs" weight="medium" color={c.warning}>Dues Hold</Text>
            </View>
          )}
        </View>
        <Text size="xs" color={c.textMuted}>{m.profiles?.email ?? '—'}</Text>

        {/* Per-requirement bars */}
        {m.snapshots.length > 0 && (
          <View style={{ gap: 4, marginTop: 4 }}>
            {m.snapshots.map((s) => {
              const req = reqs.find((r) => r.id === s.requirement_id);
              const p   = pct(s.points_earned, s.points_required);
              const barColor = s.is_at_risk ? c.error : s.is_compliant ? c.success : c.warning;
              return (
                <View key={s.requirement_id} style={{ gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text size="xs" color={c.textSubtle}>{req?.name ?? 'Requirement'}</Text>
                    <Text size="xs" weight="medium" color={barColor}>
                      {s.points_earned}/{s.points_required} pts
                    </Text>
                  </View>
                  <ComplianceBar value={p} color={barColor} />
                </View>
              );
            })}
          </View>
        )}

        {/* No snapshots yet */}
        {m.snapshots.length === 0 && (
          <Text size="xs" color={c.textSubtle}>No requirements tracked yet</Text>
        )}
      </View>

      {/* Status badge */}
      <View style={[mi.badge, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
        <Text size="xs" weight="medium" color={statusColor}>{statusLabel}</Text>
      </View>
    </View>
  );
}

const mi = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chip:   { borderWidth: 1, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  badge:  { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, flexShrink: 0 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'at-risk' | 'compliant';

export default function OfficerStatusScreen() {
  const { theme }    = useThemeStore();
  const c            = theme.colors;
  const insets       = useSafeAreaInsets();
  const { width }    = useWindowDimensions();
  const isWide       = width >= 800;
  const { membership } = useAuthStore();
  const orgId = membership?.org_id ?? '';

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [members,      setMembers]      = useState<MemberRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [filter,       setFilter]       = useState<FilterTab>('all');
  const [search,       setSearch]       = useState('');

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    // 1. Requirements (no term filter)
    const { data: reqData } = await supabase
      .from('status_requirements')
      .select('id, name, min_points, min_events, warning_threshold')
      .eq('org_id', orgId)
      .eq('is_deleted', false)
      .order('name');
    setRequirements((reqData ?? []) as Requirement[]);

    // 2. All active memberships
    const { data: membData } = await supabase
      .from('memberships')
      .select('id, dues_hold, profiles!user_id(first_name, last_name, email)')
      .eq('org_id', orgId)
      .eq('is_deleted', false)
      .eq('status', 'active')
      .order('user_id');

    // 3. Snapshots (no term filter)
    const snapshots: Snapshot[] = [];
    if (membData && membData.length > 0) {
      const { data: snapData } = await supabase
        .from('status_snapshots')
        .select('membership_id, requirement_id, points_earned, points_required, events_attended, events_required, is_compliant, is_at_risk')
        .eq('org_id', orgId);
      snapshots.push(...((snapData ?? []) as Snapshot[]));
    }

    // 4. Assemble member rows
    const rows: MemberRow[] = ((membData ?? []) as any[]).map((m) => {
      const mySnaps = snapshots.filter((s) => s.membership_id === m.id);
      const isAtRisk   = mySnaps.some((s) => s.is_at_risk);
      const isCompliant = mySnaps.length === 0 || mySnaps.every((s) => s.is_compliant);
      const worstPct   = mySnaps.length === 0
        ? 100
        : Math.min(...mySnaps.map((s) => pct(s.points_earned, s.points_required)));
      return { ...m, profiles: Array.isArray(m.profiles) ? (m.profiles[0] ?? null) : m.profiles, snapshots: mySnaps, isAtRisk, isCompliant, worstPct };
    });

    // Sort: at-risk first, then behind, then compliant — alphabetical within group
    rows.sort((a, b) => {
      if (a.isAtRisk !== b.isAtRisk) return a.isAtRisk ? -1 : 1;
      if (a.isCompliant !== b.isCompliant) return a.isCompliant ? 1 : -1;
      return fullName(a.profiles).localeCompare(fullName(b.profiles));
    });

    setMembers(rows);
    setLoading(false);
    setRefreshing(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const total      = members.length;
  const atRiskCount = members.filter((m) => m.isAtRisk).length;
  const compliant  = members.filter((m) => m.isCompliant && !m.isAtRisk).length;
  const behind     = total - compliant - atRiskCount;
  const overallPct = total > 0 ? Math.round((compliant / total) * 100) : 100;
  const overallColor = overallPct >= 80 ? c.success : overallPct >= 60 ? c.warning : c.error;

  // ── Filter + search ───────────────────────────────────────────────────────
  const visible = members.filter((m) => {
    if (filter === 'at-risk'  && !m.isAtRisk)   return false;
    if (filter === 'compliant' && !m.isCompliant) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!fullName(m.profiles).toLowerCase().includes(q) &&
          !(m.profiles?.email ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  // ── Summary panel ─────────────────────────────────────────────────────────
  const summaryPanel = (
    <View style={{ gap: 16 }}>
      {/* Stat pills */}
      <View style={styles.pillRow}>
        {[
          { label: 'Compliance',    value: `${overallPct}%`, color: overallColor },
          { label: 'Compliant',     value: compliant,        color: c.success },
          { label: 'At Risk',       value: atRiskCount,      color: atRiskCount > 0 ? c.error : c.textSubtle },
          { label: 'Behind',        value: behind,           color: behind > 0 ? c.warning : c.textSubtle },
        ].map((s) => (
          <Card key={s.label} style={styles.pill}>
            <Text size="xxl" weight="bold" color={s.color}>{s.value}</Text>
            <Text size="xs" color={c.textMuted} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{s.label}</Text>
          </Card>
        ))}
      </View>

      {/* Progress bar */}
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text size="sm" weight="medium">Overall Compliance</Text>
          <Text size="sm" weight="bold" color={overallColor}>{overallPct}%</Text>
        </View>
        <ComplianceBar value={overallPct} color={overallColor} />
        <Text size="xs" color={c.textSubtle}>
          {compliant} of {total} members meeting all requirements
        </Text>
      </Card>

      {/* Requirements list */}
      {requirements.length > 0 && (
        <Card style={{ gap: 0, paddingVertical: 0 }}>
          <Pressable
            onPress={() => router.push('/(officer)/status/requirements' as any)}
            style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text size="xs" weight="medium" color={c.textMuted} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              Requirements
            </Text>
            <Ionicons name="chevron-forward-outline" size={14} color={c.textSubtle} />
          </Pressable>
          {requirements.map((r, i) => (
            <View key={r.id} style={[
              styles.reqRow,
              { borderBottomColor: c.border },
              i < requirements.length - 1 && { borderBottomWidth: 1 },
            ]}>
              <Ionicons name="checkmark-circle-outline" size={16} color={c.primary} />
              <View style={{ flex: 1 }}>
                <Text size="sm" weight="medium">{r.name}</Text>
                <Text size="xs" color={c.textMuted}>
                  {r.min_points} pts min{r.min_events ? ` · ${r.min_events} events min` : ''}
                </Text>
              </View>
            </View>
          ))}
          {requirements.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 20, gap: 6 }}>
              <Text size="sm" color={c.textSubtle}>No requirements set yet</Text>
              <Pressable onPress={() => router.push('/(officer)/status/requirements' as any)}>
                <Text size="sm" color={c.primary}>+ Add requirements</Text>
              </Pressable>
            </View>
          )}
        </Card>
      )}

      {requirements.length === 0 && (
        <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
          <Ionicons name="clipboard-outline" size={32} color={c.textSubtle} />
          <Text size="sm" color={c.textMuted} style={{ textAlign: 'center' }}>
            No status requirements set yet.{'\n'}Add requirements so member progress can be tracked.
          </Text>
        </Card>
      )}
    </View>
  );

  // ── Member list panel ─────────────────────────────────────────────────────
  const listPanel = (
    <View style={{ flex: 1, gap: 12 }}>
      {/* Search + filter bar */}
      <View style={[styles.searchRow, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
        <Ionicons name="search-outline" size={16} color={c.textSubtle} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search members…"
          placeholderTextColor={c.textSubtle}
          style={[styles.searchInput, { color: c.text }]}
        />
      </View>

      <View style={styles.filterRow}>
        {(['all', 'at-risk', 'compliant'] as FilterTab[]).map((f) => {
          const active = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[
                styles.filterChip,
                { borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary + '14' : 'transparent' },
              ]}
            >
              <Text size="xs" weight={active ? 'medium' : 'regular'}
                color={active ? c.primary : c.textMuted}>
                {f === 'all' ? `All (${total})` : f === 'at-risk' ? `At Risk (${atRiskCount})` : `Compliant (${compliant})`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Member rows */}
      <Card style={{ paddingVertical: 0 }}>
        {visible.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 36, gap: 8 }}>
            <Ionicons name="people-outline" size={28} color={c.textSubtle} />
            <Text size="sm" color={c.textMuted}>
              {search ? 'No members match your search' : 'No members in this group'}
            </Text>
          </View>
        ) : (
          visible.map((m) => (
            <MemberItem key={m.id} m={m} reqs={requirements} c={c} />
          ))
        )}
      </Card>
    </View>
  );

  // ── Header ────────────────────────────────────────────────────────────────
  const headerBlock = (
    <View style={[styles.topBar, {
      paddingTop: isWide ? 20 : insets.top + 12,
      backgroundColor: c.surface,
      borderBottomColor: c.border,
    }]}>
      <View>
        <Text size="xxl" weight="bold">Status</Text>
        <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
          {total} members
        </Text>
      </View>
    </View>
  );

  // ── Desktop ──
  if (isWide) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        {headerBlock}
        <ScrollView
          contentContainerStyle={styles.wideScroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
        >
          <View style={styles.wideCols}>
            <View style={{ width: 300 }}>{summaryPanel}</View>
            {listPanel}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Mobile ──
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {headerBlock}
      <ScrollView
        contentContainerStyle={[styles.mobileScroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
      >
        {summaryPanel}
        <View style={{ height: 20 }} />
        {listPanel}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  topBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  wideScroll:  { padding: 32, gap: 0 },
  wideCols:    { flexDirection: 'row', gap: 24, alignItems: 'flex-start' },
  mobileScroll:{ padding: 16, gap: 0 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pill:    { flex: 1, minWidth: '44%', alignItems: 'center', paddingVertical: 14, gap: 4 },

  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11 },

  searchRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  filterRow:  { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
});
