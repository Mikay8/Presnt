/**
 * Org Admin — Status
 *
 * Two views in one screen:
 *   • Combined: aggregate compliance across every chapter
 *   • Per-chapter: collapsible compliance cards for each chapter
 *
 * Mirrors the chapter Admin status screen but aggregated across all chapters
 * under the parent org.
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

import { Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import type { Tables } from '@/types/database';

const ORG_ADMIN_BLUE = '#3B82F6';

type Chapter = Pick<Tables<'organizations'>, 'id' | 'name' | 'institution' | 'primary_color' | 'is_active'>;

type StatusMember = {
  id:           string;
  dues_status:  string;
  dues_hold:    boolean | null;
  dues_balance: number | null;
  org_id:       string;
  profiles: { first_name: string; last_name: string; email: string } | null;
};

type ChapterStats = {
  chapter:      Chapter;
  members:      StatusMember[];
  total:        number;
  goodStanding: number;
  atRisk:       StatusMember[];
  onHold:       StatusMember[];
  compliance:   number;
};

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: number | string; color?: string }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  return (
    <View style={[pill.wrap, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text size="xxl" weight="bold" color={color ?? c.text}>{value}</Text>
      <Text size="xs" color={c.textMuted} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Text>
    </View>
  );
}
const pill = StyleSheet.create({
  wrap: { flex: 1, minWidth: 100, borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center', gap: 4 },
});

// ─── Compliance bar ───────────────────────────────────────────────────────────

function ComplianceBar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={[bar.track, { backgroundColor: color + '22' }]}>
      <View style={[bar.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}
const bar = StyleSheet.create({
  track: { height: 8, borderRadius: 4, overflow: 'hidden', flex: 1 },
  fill:  { height: 8, borderRadius: 4 },
});

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberRow({ m, badge, badgeColor, badgeBg }: {
  m: StatusMember; badge: string; badgeColor: string; badgeBg: string;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const p = m.profiles;
  const initials = p ? `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}` : '?';
  const name     = p ? `${p.first_name} ${p.last_name}`.trim() : 'Unknown';
  return (
    <View style={[mr.row, { borderBottomColor: c.border }]}>
      <View style={[mr.avatar, { backgroundColor: badgeBg, borderColor: badgeColor + '40' }]}>
        <Text size="xs" weight="medium" color={badgeColor}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text size="sm" weight="medium">{name}</Text>
        <Text size="xs" color={c.textMuted}>{p?.email ?? '—'}</Text>
      </View>
      <View style={[mr.badge, { backgroundColor: badgeBg }]}>
        <Text size="xs" weight="medium" color={badgeColor}>{badge}</Text>
      </View>
    </View>
  );
}
const mr = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1 },
  avatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
});

// ─── Chapter status card ──────────────────────────────────────────────────────

function ChapterStatusCard({ stats, expanded, onToggle }: {
  stats: ChapterStats; expanded: boolean; onToggle: () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const { chapter, total, goodStanding, atRisk, onHold, compliance } = stats;

  const complianceColor = compliance >= 80 ? c.success : compliance >= 60 ? c.warning : c.error;
  const accentColor = chapter.primary_color ?? ORG_ADMIN_BLUE;

  return (
    <View style={[cc.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* Color stripe */}
      <View style={[cc.stripe, { backgroundColor: accentColor }]} />

      <View style={{ flex: 1 }}>
        {/* Header */}
        <Pressable onPress={onToggle} style={cc.header}>
          <View style={{ flex: 1 }}>
            <Text size="md" weight="semibold">{chapter.name}</Text>
            {chapter.institution && (
              <Text size="xs" color={c.textMuted} style={{ marginTop: 1 }}>{chapter.institution}</Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text size="md" weight="bold" color={complianceColor}>{compliance}%</Text>
            <Text size="xs" color={c.textSubtle}>{total} members</Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={c.textSubtle} style={{ marginLeft: 8 }} />
        </Pressable>

        {/* Compact bar row */}
        <View style={[cc.barRow, { paddingHorizontal: 14, paddingBottom: 12, gap: 8 }]}>
          <ComplianceBar pct={compliance} color={complianceColor} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {atRisk.length > 0 && (
              <View style={[cc.miniChip, { backgroundColor: c.error + '18', borderColor: c.error }]}>
                <Text size="xs" weight="medium" color={c.error}>{atRisk.length} at risk</Text>
              </View>
            )}
            {onHold.length > 0 && (
              <View style={[cc.miniChip, { backgroundColor: c.warning + '18', borderColor: c.warning }]}>
                <Text size="xs" weight="medium" color={c.warning}>{onHold.length} on hold</Text>
              </View>
            )}
            {atRisk.length === 0 && onHold.length === 0 && (
              <View style={[cc.miniChip, { backgroundColor: c.success + '18', borderColor: c.success }]}>
                <Ionicons name="checkmark-circle" size={12} color={c.success} />
                <Text size="xs" weight="medium" color={c.success}>All good</Text>
              </View>
            )}
          </View>
        </View>

        {/* Expanded detail */}
        {expanded && (
          <View style={[cc.detail, { borderTopColor: c.border }]}>
            {atRisk.length > 0 && (
              <>
                <Text size="xs" weight="bold" color={c.error}
                  style={{ textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
                  At Risk · {atRisk.length}
                </Text>
                {atRisk.map((m) => (
                  <MemberRow key={m.id} m={m} badge="Overdue"
                    badgeColor="#b91c1c" badgeBg="#fee2e2" />
                ))}
              </>
            )}
            {onHold.length > 0 && (
              <>
                <Text size="xs" weight="bold" color={c.warning}
                  style={{ textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
                  On Hold · {onHold.length}
                </Text>
                {onHold.map((m) => (
                  <MemberRow key={m.id} m={m} badge="Hold"
                    badgeColor="#7e22ce" badgeBg="#f3e8ff" />
                ))}
              </>
            )}
            {atRisk.length === 0 && onHold.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 16, gap: 6 }}>
                <Ionicons name="checkmark-circle-outline" size={28} color={c.success} />
                <Text size="sm" color={c.success}>All members in good standing</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const cc = StyleSheet.create({
  card:    { borderWidth: 1, borderRadius: 14, overflow: 'hidden', flexDirection: 'row' },
  stripe:  { width: 6 },
  header:  { flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: 8 },
  barRow:  { flexDirection: 'row', alignItems: 'center' },
  miniChip:{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  detail:  { borderTopWidth: 1 },
});

// ─── View toggle ─────────────────────────────────────────────────────────────

type ViewMode = 'combined' | 'by-chapter';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OrgAdminStatusScreen() {
  const { theme }        = useThemeStore();
  const insets           = useSafeAreaInsets();
  const { width }        = useWindowDimensions();
  const isWide           = width >= 800;
  const { organization } = useAuthStore();
  const c                = theme.colors;

  const [chapterStats, setChapterStats] = useState<ChapterStats[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [viewMode, setViewMode]         = useState<ViewMode>('combined');
  const [expanded, setExpanded]         = useState<Set<string>>(new Set());

  const orgId = organization?.id;

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    // 1. Fetch all chapters
    const { data: chaptersData } = await supabase
      .from('organizations')
      .select('id, name, institution, primary_color, is_active')
      .eq('parent_org_id', orgId)
      .eq('is_deleted', false)
      .order('name');

    const chapters = (chaptersData ?? []) as Chapter[];
    if (chapters.length === 0) { setChapterStats([]); setLoading(false); setRefreshing(false); return; }

    // 2. Fetch all memberships across all chapters
    const { data: memberships } = await supabase
      .from('memberships')
      .select('id, dues_status, dues_hold, dues_balance, org_id, profiles!user_id(first_name, last_name, email)')
      .in('org_id', chapters.map((ch) => ch.id))
      .eq('is_deleted', false)
      .eq('status', 'active');

    // Normalize: Supabase may return related rows as arrays when FK direction is ambiguous
    const members: StatusMember[] = ((memberships ?? []) as any[]).map((m) => ({
      ...m,
      profiles: Array.isArray(m.profiles) ? (m.profiles[0] ?? null) : m.profiles,
    }));

    // 3. Group by chapter
    const byChapter: Record<string, StatusMember[]> = {};
    for (const m of members) {
      if (!byChapter[m.org_id]) byChapter[m.org_id] = [];
      byChapter[m.org_id].push(m);
    }

    const stats: ChapterStats[] = chapters.map((ch) => {
      const chMembers  = byChapter[ch.id] ?? [];
      const total      = chMembers.length;
      const atRisk     = chMembers.filter((m) => m.dues_status === 'overdue' && !m.dues_hold);
      const onHold     = chMembers.filter((m) => m.dues_hold === true);
      const goodStanding = chMembers.filter((m) => m.dues_status === 'paid' && !m.dues_hold);
      const compliance = total > 0 ? Math.round((goodStanding.length / total) * 100) : 100;
      return { chapter: ch, members: chMembers, total, goodStanding, atRisk, onHold, compliance };
    });

    setChapterStats(stats);
    setLoading(false);
    setRefreshing(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Combined aggregates
  const allMembers   = chapterStats.flatMap((s) => s.members);
  const totalMembers = allMembers.length;
  const allAtRisk    = chapterStats.flatMap((s) => s.atRisk);
  const allOnHold    = chapterStats.flatMap((s) => s.onHold);
  const allGood      = allMembers.filter((m) => m.dues_status === 'paid' && !m.dues_hold);
  const orgCompliance = totalMembers > 0 ? Math.round((allGood.length / totalMembers) * 100) : 100;
  const compColor    = orgCompliance >= 80 ? c.success : orgCompliance >= 60 ? c.warning : c.error;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={ORG_ADMIN_BLUE} />
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
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {chapterStats.length} chapters · {totalMembers} members
          </Text>
        </View>
      </View>

      {/* View mode toggle */}
      <View style={[styles.toggleRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {(['combined', 'by-chapter'] as ViewMode[]).map((mode) => {
          const active = viewMode === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => setViewMode(mode)}
              style={[
                styles.toggleChip,
                { borderColor: active ? ORG_ADMIN_BLUE : c.border, backgroundColor: active ? ORG_ADMIN_BLUE + '14' : 'transparent' },
              ]}
            >
              <Text size="xs" weight={active ? 'medium' : 'regular'} color={active ? ORG_ADMIN_BLUE : c.textMuted}>
                {mode === 'combined' ? 'Combined' : 'By Chapter'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide, !isWide && { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ORG_ADMIN_BLUE} />
        }
        showsVerticalScrollIndicator={false}
      >
        {viewMode === 'combined' ? (
          <>
            {/* Org-wide summary */}
            <View style={styles.pillRow}>
              <StatPill label="Compliance" value={`${orgCompliance}%`} color={compColor} />
              <StatPill label="Good Standing" value={allGood.length} />
              <StatPill label="At Risk" value={allAtRisk.length} color={allAtRisk.length > 0 ? c.error : undefined} />
              <StatPill label="On Hold" value={allOnHold.length} color={allOnHold.length > 0 ? c.warning : undefined} />
            </View>

            {/* Org compliance bar */}
            <Card>
              <Text size="sm" weight="medium" style={{ marginBottom: 10 }}>Organization Compliance</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ComplianceBar pct={orgCompliance} color={compColor} />
                <Text size="sm" weight="bold" color={compColor}>{orgCompliance}%</Text>
              </View>
              <Text size="xs" color={c.textSubtle} style={{ marginTop: 8 }}>
                {allGood.length} of {totalMembers} members in good standing across {chapterStats.length} chapters
              </Text>
            </Card>

            {/* Per-chapter compliance summary (compact) */}
            <Text size="xs" weight="bold" color={c.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              Chapter Breakdown
            </Text>
            <Card style={{ paddingVertical: 4, gap: 0 }}>
              {chapterStats.map((s, i) => {
                const col = s.compliance >= 80 ? c.success : s.compliance >= 60 ? c.warning : c.error;
                return (
                  <View
                    key={s.chapter.id}
                    style={[
                      styles.chapterSummaryRow,
                      { borderBottomColor: c.border },
                      i < chapterStats.length - 1 && { borderBottomWidth: 1 },
                    ]}
                  >
                    <View style={[styles.chapterDot, { backgroundColor: s.chapter.primary_color ?? ORG_ADMIN_BLUE }]} />
                    <View style={{ flex: 1 }}>
                      <Text size="sm" weight="medium">{s.chapter.name}</Text>
                      <Text size="xs" color={c.textSubtle}>{s.total} members</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4, minWidth: 80 }}>
                      <Text size="sm" weight="bold" color={col}>{s.compliance}%</Text>
                      <ComplianceBar pct={s.compliance} color={col} />
                    </View>
                  </View>
                );
              })}
            </Card>

            {/* Org-wide at-risk list */}
            {allAtRisk.length > 0 && (
              <>
                <Text size="xs" weight="bold" color={c.textMuted}
                  style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                  At Risk Across Org · {allAtRisk.length}
                </Text>
                <Card style={{ paddingVertical: 0 }}>
                  {allAtRisk.map((m, i) => (
                    <View key={m.id} style={i < allAtRisk.length - 1 ? { borderBottomWidth: 1, borderBottomColor: c.border } : undefined}>
                      <MemberRow m={m} badge="Overdue" badgeColor="#b91c1c" badgeBg="#fee2e2" />
                    </View>
                  ))}
                </Card>
              </>
            )}

            {allAtRisk.length === 0 && allOnHold.length === 0 && (
              <View style={styles.allGood}>
                <Ionicons name="checkmark-circle-outline" size={48} color={c.success} />
                <Text size="lg" weight="bold" color={c.success} style={{ marginTop: 12 }}>
                  All members in good standing
                </Text>
              </View>
            )}
          </>
        ) : (
          /* By-chapter view */
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
              <Pressable onPress={() => setExpanded(new Set(chapterStats.map((s) => s.chapter.id)))}>
                <Text size="xs" color={ORG_ADMIN_BLUE}>Expand all</Text>
              </Pressable>
              <Pressable onPress={() => setExpanded(new Set())}>
                <Text size="xs" color={c.textMuted}>Collapse all</Text>
              </Pressable>
            </View>

            {chapterStats.map((s) => (
              <ChapterStatusCard
                key={s.chapter.id}
                stats={s}
                expanded={expanded.has(s.chapter.id)}
                onToggle={() => toggleExpand(s.chapter.id)}
              />
            ))}

            {chapterStats.length === 0 && (
              <View style={styles.allGood}>
                <Ionicons name="business-outline" size={40} color={c.textSubtle} />
                <Text size="md" color={c.textMuted} style={{ marginTop: 12 }}>No chapters yet</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },

  toggleRow:  { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  toggleChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },

  scroll:     { padding: 16, gap: 14, paddingBottom: 48 },
  scrollWide: { paddingHorizontal: 48, maxWidth: 900, alignSelf: 'center', width: '100%' },

  pillRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  chapterSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  chapterDot:        { width: 10, height: 10, borderRadius: 5 },

  allGood:    { alignItems: 'center', paddingVertical: 40 },
});
