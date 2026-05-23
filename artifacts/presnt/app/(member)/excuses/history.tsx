/**
 * Member — Excuse History  /(member)/excuses/history
 *
 * Full list of the member's submitted excuses.
 * Tabs: All · Pending · Approved · Denied · Withdrawn
 * Each row shows: event title, date submitted, status badge, reviewer note.
 * Pending rows have a "Withdraw" action.
 *
 * Desktop: table-style rows inside a card
 * Mobile: stacked cards
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

type ExcuseStatus = 'pending' | 'approved' | 'denied' | 'escalated' | 'withdrawn';

type Excuse = {
  id:            string;
  status:        ExcuseStatus;
  reason:        string;
  reviewer_note: string | null;
  admin_notes:   string | null;
  submitted_at:  string | null;
  reviewed_at:   string | null;
  event_id:      string;
  events:        { title: string; start_time: string } | null;
};

type Tab = 'All' | 'Pending' | 'Approved' | 'Denied' | 'Withdrawn';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusColor(status: ExcuseStatus, c: any) {
  switch (status) {
    case 'approved':  return c.success;
    case 'denied':    return c.error;
    case 'escalated': return '#F59E0B';
    case 'withdrawn': return c.textSubtle;
    default:          return c.warning;
  }
}

function statusLabel(status: ExcuseStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ─── Excuse card / row ────────────────────────────────────────────────────────

function ExcuseCard({
  excuse,
  isWide,
  isLast,
  onWithdraw,
  withdrawing,
}: {
  excuse:      Excuse;
  isWide:      boolean;
  isLast:      boolean;
  onWithdraw:  (id: string) => void;
  withdrawing: boolean;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const sc = statusColor(excuse.status, c);
  const note = excuse.reviewer_note ?? excuse.admin_notes;

  if (isWide) {
    return (
      <View style={[
        xs.desktopRow,
        { borderBottomColor: c.border },
        !isLast && { borderBottomWidth: 1 },
      ]}>
        {/* Event info */}
        <View style={{ flex: 1.4, gap: 2 }}>
          <Text size="sm" weight="medium">{excuse.events?.title ?? 'Unknown event'}</Text>
          <Text size="xs" color={c.textMuted}>
            Event: {fmtDate(excuse.events?.start_time ?? null)}
          </Text>
        </View>

        {/* Reason */}
        <View style={{ flex: 2, gap: 2 }}>
          <Text size="sm" color={c.text} numberOfLines={2}>{excuse.reason}</Text>
          {note && (
            <Text size="xs" color={c.textMuted} numberOfLines={1}>
              Officer: {note}
            </Text>
          )}
        </View>

        {/* Submitted */}
        <View style={{ width: 90 }}>
          <Text size="xs" color={c.textMuted}>{fmtDate(excuse.submitted_at)}</Text>
        </View>

        {/* Status + action */}
        <View style={{ width: 110, alignItems: 'flex-end', gap: 6 }}>
          <View style={[xs.badge, { backgroundColor: sc + '18', borderColor: sc }]}>
            <Text size="xs" weight="medium" color={sc}>{statusLabel(excuse.status)}</Text>
          </View>
          {excuse.status === 'pending' && (
            withdrawing ? (
              <ActivityIndicator size="small" color={c.error} />
            ) : (
              <Pressable onPress={() => onWithdraw(excuse.id)}>
                <Text size="xs" color={c.error}>Withdraw</Text>
              </Pressable>
            )
          )}
        </View>
      </View>
    );
  }

  // Mobile card
  return (
    <View style={[xs.mobileCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text size="sm" weight="medium">{excuse.events?.title ?? 'Unknown event'}</Text>
          <Text size="xs" color={c.textMuted}>
            {fmtDate(excuse.events?.start_time ?? null)} · Submitted {fmtDate(excuse.submitted_at)}
          </Text>
        </View>
        <View style={[xs.badge, { backgroundColor: sc + '18', borderColor: sc }]}>
          <Text size="xs" weight="medium" color={sc}>{statusLabel(excuse.status)}</Text>
        </View>
      </View>

      <Text size="sm" color={c.textMuted} numberOfLines={3}>{excuse.reason}</Text>

      {note && (
        <View style={[xs.officerNote, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
          <Ionicons name="person-outline" size={12} color={c.textSubtle} />
          <Text size="xs" color={c.textMuted} style={{ flex: 1 }}>{note}</Text>
        </View>
      )}

      {excuse.status === 'pending' && (
        <View style={{ marginTop: 10 }}>
          {withdrawing ? (
            <ActivityIndicator size="small" color={c.error} />
          ) : (
            <Pressable
              onPress={() => onWithdraw(excuse.id)}
              style={[xs.withdrawBtn, { borderColor: c.error + '60' }]}
            >
              <Ionicons name="close-circle-outline" size={14} color={c.error} />
              <Text size="sm" weight="medium" color={c.error}>Withdraw Excuse</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExcuseHistoryScreen() {
  const { theme }    = useThemeStore();
  const c            = theme.colors;
  const insets       = useSafeAreaInsets();
  const { width }    = useWindowDimensions();
  const isWide       = width >= 800;
  const { profile, membership, organization } = useAuthStore();

  const [excuseList,  setExcuseList]  = useState<Excuse[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [tab,         setTab]         = useState<Tab>('All');
  const [withdrawing, setWithdrawing] = useState<Set<string>>(new Set());

  const membId = membership?.id;
  const userId = profile?.id;
  const orgId  = organization?.id;

  const load = useCallback(async () => {
    if (!userId || !orgId) { setLoading(false); return; }

    const { data } = await supabase
      .from('excuses')
      .select('id, status, reason, reviewer_note, admin_notes, submitted_at, reviewed_at, event_id, events!event_id(title, start_time)')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .order('submitted_at', { ascending: false });

    setExcuseList((data ?? []) as Excuse[]);
    setLoading(false);
    setRefreshing(false);
  }, [userId, orgId]);

  useEffect(() => { load(); }, [load]);

  async function handleWithdraw(excuseId: string) {
    Alert.alert(
      'Withdraw Excuse',
      'Are you sure you want to withdraw this excuse? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            setWithdrawing(prev => new Set(prev).add(excuseId));
            await supabase
              .from('excuses')
              .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
              .eq('id', excuseId);
            setWithdrawing(prev => { const n = new Set(prev); n.delete(excuseId); return n; });
            await load();
          },
        },
      ],
    );
  }

  const tabs: Tab[] = ['All', 'Pending', 'Approved', 'Denied', 'Withdrawn'];
  const counts: Record<Tab, number> = {
    All:       excuseList.length,
    Pending:   excuseList.filter(e => e.status === 'pending').length,
    Approved:  excuseList.filter(e => e.status === 'approved').length,
    Denied:    excuseList.filter(e => e.status === 'denied').length,
    Withdrawn: excuseList.filter(e => e.status === 'withdrawn' || e.status === 'escalated').length,
  };

  const displayed = tab === 'All'
    ? excuseList
    : tab === 'Withdrawn'
      ? excuseList.filter(e => e.status === 'withdrawn' || e.status === 'escalated')
      : excuseList.filter(e => e.status === tab.toLowerCase());

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
      <View style={[xs.header, {
        paddingTop: isWide ? 20 : insets.top + 12,
        backgroundColor: c.background,
        borderBottomColor: c.border,
      }]}>
        <Pressable onPress={() => router.back()} style={xs.backBtn}>
          <Ionicons name="arrow-back-outline" size={18} color={c.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text size="xxl" weight="bold">Excuse History</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {excuseList.length} total · {counts.Pending} pending review
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[xs.tabScroll, { backgroundColor: c.background, borderBottomColor: c.border }]}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 8 }}
      >
        {tabs.map((t) => {
          const active = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[xs.tabChip, {
                backgroundColor: active ? c.primary : c.surfaceAlt,
                borderColor:     active ? c.primary : c.border,
              }]}
            >
              <Text size="sm" weight={active ? 'medium' : 'regular'}
                style={{ color: active ? '#fff' : c.textMuted }}>
                {t} · {counts[t]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* List */}
      <ScrollView
        contentContainerStyle={[
          isWide ? xs.scrollWide : xs.scrollMobile,
          { paddingBottom: insets.bottom + 32 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={c.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {displayed.length === 0 ? (
          <View style={xs.empty}>
            <Ionicons name="document-text-outline" size={44} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12, textAlign: 'center' }}>
              No {tab === 'All' ? '' : tab.toLowerCase()} excuses yet
            </Text>
          </View>
        ) : isWide ? (
          <>
            {/* Desktop column header */}
            <View style={[xs.desktopHeader, { borderBottomColor: c.border }]}>
              <Text size="xs" weight="medium" color={c.textSubtle} style={[xs.col, { flex: 1.4 }]}>EVENT</Text>
              <Text size="xs" weight="medium" color={c.textSubtle} style={[xs.col, { flex: 2 }]}>REASON / OFFICER NOTE</Text>
              <Text size="xs" weight="medium" color={c.textSubtle} style={[xs.col, { width: 90 }]}>SUBMITTED</Text>
              <Text size="xs" weight="medium" color={c.textSubtle} style={[xs.col, { width: 110, textAlign: 'right' }]}>STATUS</Text>
            </View>
            <Card style={{ paddingVertical: 0 }}>
              {displayed.map((e, i) => (
                <ExcuseCard
                  key={e.id}
                  excuse={e}
                  isWide
                  isLast={i === displayed.length - 1}
                  onWithdraw={handleWithdraw}
                  withdrawing={withdrawing.has(e.id)}
                />
              ))}
            </Card>
          </>
        ) : (
          <View style={{ gap: 10 }}>
            {displayed.map((e, i) => (
              <ExcuseCard
                key={e.id}
                excuse={e}
                isWide={false}
                isLast={i === displayed.length - 1}
                onWithdraw={handleWithdraw}
                withdrawing={withdrawing.has(e.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const xs = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:     { padding: 4 },
  tabScroll:   { borderBottomWidth: 1, flexGrow: 0 },
  tabChip:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },

  scrollWide:  { padding: 24 },
  scrollMobile:{ padding: 14, gap: 10 },

  desktopHeader: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, marginBottom: 0 },
  col:           { textTransform: 'uppercase', letterSpacing: 0.8 },

  desktopRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  mobileCard:  { borderWidth: 1, borderRadius: 14, padding: 14 },

  badge:       { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  officerNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 8 },
  withdrawBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  empty:       { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
});
