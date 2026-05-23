/**
 * Admin — Chapter Status
 *
 * Two tabs:
 *   • Attendance  — requirement-based compliance from status_snapshots
 *   • Dues        — dues hold / overdue members (existing logic)
 *
 * Desktop: two-column (summary left, member list right)
 * Mobile:  stacked
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
  id: string; name: string; min_points: number; min_events: number | null;
};

type Snapshot = {
  membership_id: string; requirement_id: string;
  points_earned: number; points_required: number;
  events_attended: number; is_compliant: boolean; is_at_risk: boolean;
};

type AttendanceMember = {
  id: string;
  dues_hold: boolean | null;
  profiles: { first_name: string; last_name: string; email: string } | null;
  snapshots: Snapshot[];
  isAtRisk: boolean;
  isCompliant: boolean;
};

type DuesMember = {
  id: string; dues_status: string; dues_hold: boolean | null; dues_balance: number | null;
  profiles: { first_name: string; last_name: string; email: string } | null;
};

type AcademicTerm = { id: string; name: string; };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(earned: number, required: number) {
  if (required <= 0) return 100;
  return Math.min(100, Math.round((earned / required) * 100));
}
function fullName(p: { first_name: string; last_name: string } | null) {
  return p ? `${p.first_name} ${p.last_name}`.trim() : 'Unknown';
}
function initials(p: { first_name: string; last_name: string } | null) {
  return p ? `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}` : '?';
}

// ─── Compliance bar ───────────────────────────────────────────────────────────

function ComplianceBar({ value, color }: { value: number; color: string }) {
  return (
    <View style={[cbar.track, { backgroundColor: color + '22' }]}>
      <View style={[cbar.fill, { width: `${value}%` as any, backgroundColor: color }]} />
    </View>
  );
}
const cbar = StyleSheet.create({
  track: { height: 8, borderRadius: 4, overflow: 'hidden', flex: 1 },
  fill:  { height: 8, borderRadius: 4 },
});

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  return (
    <Card style={sc.card}>
      <Text size="xs" weight="medium" color={c.textMuted} style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</Text>
      <Text size="xxl" weight="bold" style={{ marginTop: 6, color: accent ?? c.text }}>{value}</Text>
    </Card>
  );
}
const sc = StyleSheet.create({ card: { flex: 1, minWidth: '44%' } });

// ─── Screen ───────────────────────────────────────────────────────────────────

type TabKey = 'attendance' | 'dues';

export default function AdminStatusScreen() {
  const { theme }    = useThemeStore();
  const c            = theme.colors;
  const insets       = useSafeAreaInsets();
  const { width }    = useWindowDimensions();
  const isWide       = width >= 800;
  const { organization } = useAuthStore();
  const orgId = organization?.id ?? '';

  const [tab,          setTab]          = useState<TabKey>('attendance');
  const [term,         setTerm]         = useState<AcademicTerm | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [attMembers,   setAttMembers]   = useState<AttendanceMember[]>([]);
  const [duesMembers,  setDuesMembers]  = useState<DuesMember[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [search,       setSearch]       = useState('');

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    // Active term
    const { data: termData } = await supabase
      .from('academic_terms').select('id, name')
      .eq('org_id', orgId).eq('is_active', true).single();
    setTerm(termData ?? null);

    // Requirements
    const reqs: Requirement[] = [];
    if (termData) {
      const { data: rData } = await supabase
        .from('status_requirements')
        .select('id, name, min_points, min_events')
        .eq('org_id', orgId).eq('term_id', termData.id).eq('is_deleted', false);
      reqs.push(...((rData ?? []) as Requirement[]));
    }
    setRequirements(reqs);

    // All active memberships
    const { data: membData } = await supabase
      .from('memberships')
      .select('id, dues_status, dues_hold, dues_balance, profiles!user_id(first_name, last_name, email)')
      .eq('org_id', orgId).eq('is_deleted', false).eq('status', 'active');

    setDuesMembers((membData ?? []) as unknown as DuesMember[]);

    // Snapshots
    const snaps: Snapshot[] = [];
    if (termData && membData?.length) {
      const { data: sData } = await supabase
        .from('status_snapshots')
        .select('membership_id, requirement_id, points_earned, points_required, events_attended, is_compliant, is_at_risk')
        .eq('org_id', orgId).eq('term_id', termData.id);
      snaps.push(...((sData ?? []) as Snapshot[]));
    }

    const attRows: AttendanceMember[] = ((membData ?? []) as any[]).map((m) => {
      const mySnaps   = snaps.filter((s) => s.membership_id === m.id);
      const isAtRisk  = mySnaps.some((s) => s.is_at_risk);
      const isCompliant = mySnaps.length === 0 || mySnaps.every((s) => s.is_compliant);
      return { id: m.id, dues_hold: m.dues_hold, profiles: m.profiles, snapshots: mySnaps, isAtRisk, isCompliant };
    });
    attRows.sort((a, b) => {
      if (a.isAtRisk !== b.isAtRisk) return a.isAtRisk ? -1 : 1;
      if (a.isCompliant !== b.isCompliant) return a.isCompliant ? 1 : -1;
      return fullName(a.profiles).localeCompare(fullName(b.profiles));
    });
    setAttMembers(attRows);

    setLoading(false);
    setRefreshing(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  // ── Derived ───────────────────────────────────────────────────────────────

  // Attendance tab
  const total      = attMembers.length;
  const atRiskCt   = attMembers.filter((m) => m.isAtRisk).length;
  const compliantCt = attMembers.filter((m) => m.isCompliant && !m.isAtRisk).length;
  const overallPct  = total > 0 ? Math.round((compliantCt / total) * 100) : 100;
  const overallColor = overallPct >= 80 ? c.success : overallPct >= 60 ? c.warning : c.error;

  // Dues tab
  const atRiskDues  = duesMembers.filter((m) => m.dues_status === 'overdue' && !m.dues_hold);
  const onHold      = duesMembers.filter((m) => m.dues_hold === true);
  const goodStanding = duesMembers.filter((m) => m.dues_status === 'paid' && !m.dues_hold);
  const duesPct     = duesMembers.length > 0 ? Math.round((goodStanding.length / duesMembers.length) * 100) : 100;
  const duesColor   = duesPct >= 80 ? c.success : duesPct >= 60 ? c.warning : c.error;

  // Search filter (attendance tab)
  const visibleAtt = attMembers.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return fullName(m.profiles).toLowerCase().includes(q) ||
           (m.profiles?.email ?? '').toLowerCase().includes(q);
  });

  // Search filter (dues tab)
  const visibleDues = duesMembers.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return fullName(m.profiles).toLowerCase().includes(q) ||
           (m.profiles?.email ?? '').toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  // ── Summary panel (left col on desktop, top on mobile) ───────────────────

  const attendanceSummary = (
    <View style={{ gap: 16 }}>
      <View style={styles.statGrid}>
        <StatCard label="Compliance"  value={`${overallPct}%`} accent={overallColor} />
        <StatCard label="Compliant"   value={compliantCt}      accent={c.success} />
        <StatCard label="At Risk"     value={atRiskCt}         accent={atRiskCt > 0 ? c.error : undefined} />
        <StatCard label="Behind"      value={total - compliantCt - atRiskCt} />
      </View>

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text size="sm" weight="medium">Attendance Compliance</Text>
          <Text size="sm" weight="bold" color={overallColor}>{overallPct}%</Text>
        </View>
        <ComplianceBar value={overallPct} color={overallColor} />
        <Text size="xs" color={c.textSubtle}>
          {compliantCt}/{total} members meeting requirements · {term?.name ?? 'Current term'}
        </Text>
      </Card>

      {requirements.length > 0 ? (
        <Card style={{ gap: 0, paddingVertical: 0 }}>
          <Pressable
            onPress={() => router.push('/(admin)/status/requirements' as any)}
            style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
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
              <Ionicons name="checkmark-circle-outline" size={15} color={c.primary} />
              <View style={{ flex: 1 }}>
                <Text size="sm" weight="medium">{r.name}</Text>
                <Text size="xs" color={c.textMuted}>
                  {r.min_points} pts min{r.min_events ? ` · ${r.min_events} events min` : ''}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : (
        <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}>
          <Ionicons name="clipboard-outline" size={28} color={c.textSubtle} />
          <Text size="sm" color={c.textMuted} style={{ textAlign: 'center' }}>
            No requirements set for this term
          </Text>
          <Pressable onPress={() => router.push('/(admin)/status/requirements' as any)}>
            <Text size="sm" color={c.primary}>+ Add requirements</Text>
          </Pressable>
        </Card>
      )}
    </View>
  );

  const duesSummary = (
    <View style={{ gap: 16 }}>
      <View style={styles.statGrid}>
        <StatCard label="Standing"    value={`${duesPct}%`}      accent={duesColor} />
        <StatCard label="Good"        value={goodStanding.length} accent={c.success} />
        <StatCard label="At Risk"     value={atRiskDues.length}   accent={atRiskDues.length > 0 ? c.error : undefined} />
        <StatCard label="On Hold"     value={onHold.length}       accent={onHold.length > 0 ? c.warning : undefined} />
      </View>

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text size="sm" weight="medium">Dues Compliance</Text>
          <Text size="sm" weight="bold" color={duesColor}>{duesPct}%</Text>
        </View>
        <ComplianceBar value={duesPct} color={duesColor} />
        <Text size="xs" color={c.textSubtle}>
          {goodStanding.length} of {duesMembers.length} members in good standing
        </Text>
      </Card>
    </View>
  );

  // ── List panel ────────────────────────────────────────────────────────────

  const searchBar = (
    <View style={[styles.searchRow, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
      <Ionicons name="search-outline" size={16} color={c.textSubtle} />
      <TextInput
        value={search} onChangeText={setSearch}
        placeholder="Search members…"
        placeholderTextColor={c.textSubtle}
        style={[styles.searchInput, { color: c.text }]}
      />
    </View>
  );

  const attendanceList = (
    <Card style={{ paddingVertical: 0 }}>
      {visibleAtt.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
          <Ionicons name="people-outline" size={28} color={c.textSubtle} />
          <Text size="sm" color={c.textMuted}>No members found</Text>
        </View>
      ) : visibleAtt.map((m, i) => {
        const statusColor = m.isAtRisk ? c.error : m.isCompliant ? c.success : c.warning;
        const statusLabel = m.isAtRisk ? 'At Risk' : m.isCompliant ? 'Compliant' : 'Behind';
        return (
          <View key={m.id} style={[
            styles.memberRow,
            { borderBottomColor: c.border },
            i < visibleAtt.length - 1 && { borderBottomWidth: 1 },
          ]}>
            <View style={[styles.avatar, { backgroundColor: statusColor + '18', borderColor: statusColor + '40' }]}>
              <Text size="xs" weight="bold" color={statusColor}>{initials(m.profiles)}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text size="sm" weight="medium">{fullName(m.profiles)}</Text>
              <Text size="xs" color={c.textMuted}>{m.profiles?.email ?? '—'}</Text>
              {m.snapshots.length > 0 && (
                <View style={{ gap: 4, marginTop: 4 }}>
                  {m.snapshots.map((s) => {
                    const req = requirements.find((r) => r.id === s.requirement_id);
                    const p   = pct(s.points_earned, s.points_required);
                    const bc  = s.is_at_risk ? c.error : s.is_compliant ? c.success : c.warning;
                    return (
                      <View key={s.requirement_id} style={{ gap: 2 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text size="xs" color={c.textSubtle}>{req?.name ?? 'Requirement'}</Text>
                          <Text size="xs" weight="medium" color={bc}>
                            {s.points_earned}/{s.points_required} pts
                          </Text>
                        </View>
                        <ComplianceBar value={p} color={bc} />
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
            <View style={[styles.badge, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
              <Text size="xs" weight="medium" color={statusColor}>{statusLabel}</Text>
            </View>
          </View>
        );
      })}
    </Card>
  );

  const duesList = (
    <View style={{ gap: 12 }}>
      {atRiskDues.length > 0 && (
        <>
          <Text size="xs" weight="bold" color={c.textMuted} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
            At Risk · {atRiskDues.length}
          </Text>
          <Card style={{ paddingVertical: 0 }}>
            {atRiskDues.filter((m) => {
              if (!search.trim()) return true;
              const q = search.toLowerCase();
              return fullName(m.profiles).toLowerCase().includes(q) || (m.profiles?.email ?? '').toLowerCase().includes(q);
            }).map((m, i, arr) => (
              <View key={m.id} style={[styles.memberRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                <View style={[styles.avatar, { backgroundColor: c.error + '18', borderColor: c.error + '40' }]}>
                  <Text size="xs" weight="bold" color={c.error}>{initials(m.profiles)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text size="sm" weight="medium">{fullName(m.profiles)}</Text>
                  <Text size="xs" color={c.textMuted}>{m.profiles?.email ?? '—'}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]}>
                  <Text size="xs" weight="medium" color="#b91c1c">Overdue</Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}

      {onHold.length > 0 && (
        <>
          <Text size="xs" weight="bold" color={c.textMuted} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
            On Hold · {onHold.length}
          </Text>
          <Card style={{ paddingVertical: 0 }}>
            {onHold.filter((m) => {
              if (!search.trim()) return true;
              const q = search.toLowerCase();
              return fullName(m.profiles).toLowerCase().includes(q) || (m.profiles?.email ?? '').toLowerCase().includes(q);
            }).map((m, i, arr) => (
              <View key={m.id} style={[styles.memberRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                <View style={[styles.avatar, { backgroundColor: c.warning + '18', borderColor: c.warning + '40' }]}>
                  <Text size="xs" weight="bold" color={c.warning}>{initials(m.profiles)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text size="sm" weight="medium">{fullName(m.profiles)}</Text>
                  <Text size="xs" color={c.textMuted}>{m.profiles?.email ?? '—'}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: '#f3e8ff', borderColor: '#d8b4fe' }]}>
                  <Text size="xs" weight="medium" color="#7e22ce">Hold</Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}

      {atRiskDues.length === 0 && onHold.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
          <Ionicons name="checkmark-circle-outline" size={48} color={c.success} />
          <Text size="lg" weight="bold" color={c.success}>All members in good standing</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[styles.header, {
        paddingTop: isWide ? 20 : insets.top + 12,
        backgroundColor: c.surface, borderBottomColor: c.border,
      }]}>
        <View>
          <Text size="xxl" weight="bold">Status</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>Chapter-wide compliance</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {(['attendance', 'dues'] as TabKey[]).map((t) => {
          const active = tab === t;
          return (
            <Pressable key={t} onPress={() => setTab(t)}
              style={[styles.tabBtn, active && [styles.tabBtnActive, { borderBottomColor: c.primary }]]}>
              <Text size="sm" weight={active ? 'medium' : 'regular'}
                color={active ? c.primary : c.textMuted}>
                {t === 'attendance' ? 'Attendance' : 'Dues'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[
          isWide ? styles.scrollWide : styles.scroll,
          !isWide && { paddingBottom: insets.bottom + 24 },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={c.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {isWide ? (
          <View style={styles.wideCols}>
            <View style={{ width: 280 }}>
              {tab === 'attendance' ? attendanceSummary : duesSummary}
            </View>
            <View style={{ flex: 1, gap: 12 }}>
              {searchBar}
              {tab === 'attendance' ? attendanceList : duesList}
            </View>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {tab === 'attendance' ? attendanceSummary : duesSummary}
            {searchBar}
            {tab === 'attendance' ? attendanceList : duesList}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },

  tabBar:     { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn:     { paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive:{ borderBottomWidth: 2 },

  scroll:     { padding: 16, gap: 16 },
  scrollWide: { padding: 32 },
  wideCols:   { flexDirection: 'row', gap: 24, alignItems: 'flex-start' },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },

  searchRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  memberRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  avatar:    { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badge:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, flexShrink: 0 },
});
