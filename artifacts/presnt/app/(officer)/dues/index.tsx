/**
 * Officer — Dues Overview  /(officer)/dues
 *
 * Lists all members with outstanding dues balances.
 * Desktop: table with Name · Balance · Status · Due Date columns
 * Mobile:  stacked cards
 *
 * Tapping a row → /(officer)/dues/:membershipId
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
import { useUserViewStore } from '@/stores/userViewStore';

const DESKTOP = 768;

// ─── Types ────────────────────────────────────────────────────────────────────

type DuesRow = {
  balance: {
    id:           string;
    amount_due:   string;
    amount_paid:  string;
    amount_waived:string;
    status:       string;
    due_date:     string | null;
  };
  membership: {
    id:        string;
    dues_hold: boolean | null;
  };
  profile: {
    first_name: string;
    last_name:  string;
    email:      string;
  } | null;
};

type StatusFilter = 'All' | 'Overdue' | 'Unpaid' | 'Partial';

function statusColor(status: string) {
  switch (status) {
    case 'overdue': return '#EF4444';
    case 'partial': return '#EAB308';
    case 'unpaid':  return '#F97316';
    default:        return '#6B7280';
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function balance(row: DuesRow['balance']) {
  return parseFloat(row.amount_due ?? '0') - parseFloat(row.amount_paid ?? '0') - parseFloat(row.amount_waived ?? '0');
}

// ─── Row / Card ───────────────────────────────────────────────────────────────

function DuesItem({ row, isWide }: { row: DuesRow; isWide: boolean }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const p = row.profile;
  const name = p ? `${p.first_name} ${p.last_name}` : 'Unknown';
  const bal = balance(row.balance);
  const sc = statusColor(row.balance.status);

  function go() {
    router.push(`/(officer)/dues/${row.membership.id}` as any);
  }

  if (isWide) {
    return (
      <Pressable onPress={go} style={[di.desktopRow, { borderBottomColor: c.border }]}>
        <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={[di.avatar, { backgroundColor: c.surfaceAlt }]}>
            <Text size="xs" weight="medium" color={c.textMuted}>
              {p ? `${p.first_name[0]}${p.last_name[0]}` : '?'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text size="sm" weight="medium">{name}</Text>
            <Text size="xs" color={c.textMuted}>{p?.email}</Text>
          </View>
        </View>

        <View style={{ width: 110 }}>
          <Text size="sm" weight="semibold" color={bal > 0 ? '#EF4444' : '#22C55E'}>
            ${bal.toFixed(2)}
          </Text>
        </View>

        <View style={{ width: 90 }}>
          <View style={[di.badge, { backgroundColor: sc + '18', borderColor: sc }]}>
            <Text size="xs" weight="medium" color={sc}>
              {row.balance.status.charAt(0).toUpperCase() + row.balance.status.slice(1)}
            </Text>
          </View>
        </View>

        <View style={{ width: 90 }}>
          <Text size="sm" color={c.textMuted}>{fmtDate(row.balance.due_date)}</Text>
        </View>

        {row.membership.dues_hold && (
          <View style={{ width: 80, alignItems: 'center' }}>
            <Ionicons name="warning-outline" size={16} color="#F59E0B" />
          </View>
        )}

        <Ionicons name="chevron-forward-outline" size={14} color={c.textSubtle} />
      </Pressable>
    );
  }

  return (
    <Pressable onPress={go} style={[di.mobileCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <View style={[di.avatar, { backgroundColor: c.surfaceAlt }]}>
          <Text size="xs" weight="medium" color={c.textMuted}>
            {p ? `${p.first_name[0]}${p.last_name[0]}` : '?'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text size="sm" weight="medium">{name}</Text>
          <Text size="xs" color={c.textMuted}>{p?.email}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text size="md" weight="bold" color={bal > 0 ? '#EF4444' : '#22C55E'}>
            ${bal.toFixed(2)}
          </Text>
          <View style={[di.badge, { backgroundColor: sc + '18', borderColor: sc }]}>
            <Text size="xs" weight="medium" color={sc}>
              {row.balance.status.charAt(0).toUpperCase() + row.balance.status.slice(1)}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text size="xs" color={c.textSubtle}>Due {fmtDate(row.balance.due_date)}</Text>
        {row.membership.dues_hold && (
          <>
            <Text size="xs" color={c.textSubtle}>·</Text>
            <Ionicons name="warning-outline" size={12} color="#F59E0B" />
            <Text size="xs" color="#F59E0B">Hold active</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const di = StyleSheet.create({
  desktopRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, gap: 0 },
  mobileCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  avatar:     { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  badge:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DuesOverviewScreen() {
  const { theme }      = useThemeStore();
  const insets         = useSafeAreaInsets();
  const { width }      = useWindowDimensions();
  const isWide         = width >= DESKTOP;
  const { membership, organization } = useAuthStore();
  const userView       = useUserViewStore((s) => s.session);
  const c              = theme.colors;

  const orgId = userView?.org.id ?? membership?.org_id ?? '';

  const [rows,      setRows]      = useState<DuesRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [filter,    setFilter]    = useState<StatusFilter>('All');

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    // Fetch via Supabase — join dues_balances → memberships → profiles
    const { data } = await (supabase as any)
      .from('dues_balances')
      .select(`
        id, amount_due, amount_paid, amount_waived, status, due_date,
        memberships!membership_id(id, dues_hold,
          profiles!user_id(first_name, last_name, email)
        )
      `)
      .eq('org_id', orgId)
      .not('status', 'in', '("paid","waived")')
      .order('amount_due', { ascending: false });

    if (data) {
      const mapped: DuesRow[] = (data as any[]).map((d) => ({
        balance:    { id: d.id, amount_due: d.amount_due, amount_paid: d.amount_paid, amount_waived: d.amount_waived, status: d.status, due_date: d.due_date },
        membership: { id: d.memberships?.id ?? '', dues_hold: d.memberships?.dues_hold ?? false },
        profile:    d.memberships?.profiles ?? null,
      }));
      setRows(mapped);
    }

    setLoading(false);
    setRefreshing(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const filters: StatusFilter[] = ['All', 'Overdue', 'Unpaid', 'Partial'];
  const counts: Record<StatusFilter, number> = {
    All:     rows.length,
    Overdue: rows.filter(r => r.balance.status === 'overdue').length,
    Unpaid:  rows.filter(r => r.balance.status === 'unpaid').length,
    Partial: rows.filter(r => r.balance.status === 'partial').length,
  };

  const displayed = filter === 'All' ? rows : rows.filter(r => r.balance.status === filter.toLowerCase());
  const totalOwed = displayed.reduce((s, r) => s + balance(r.balance), 0);

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
      <View style={[xs.header, { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.background, borderBottomColor: c.border }]}>
        <View style={{ flex: 1 }}>
          <Text size="xxl" weight="bold">Dues</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {rows.length} member{rows.length !== 1 ? 's' : ''} with outstanding balance · Total ${totalOwed.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[xs.tabScroll, { backgroundColor: c.background, borderBottomColor: c.border, flexGrow: 0 }]}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 8 }}
      >
        {filters.map((f) => {
          const active = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[xs.tabChip, {
                backgroundColor: active ? c.primary : c.surfaceAlt,
                borderColor:     active ? c.primary : c.border,
              }]}
            >
              <Text size="sm" weight={active ? 'medium' : 'regular'}
                style={{ color: active ? '#fff' : c.textMuted }}>
                {f} · {counts[f]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* List */}
      <ScrollView
        contentContainerStyle={isWide ? xs.scrollWide : [xs.scrollMobile, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {displayed.length === 0 ? (
          <View style={xs.empty}>
            <Ionicons name="checkmark-circle-outline" size={44} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              {filter === 'All' ? 'All dues are current!' : `No ${filter.toLowerCase()} dues`}
            </Text>
          </View>
        ) : isWide ? (
          <>
            {/* Column headers */}
            <View style={[xs.colHeader, { borderBottomColor: c.border, backgroundColor: c.surfaceAlt }]}>
              <Text size="xs" weight="medium" color={c.textSubtle} style={{ flex: 2, paddingLeft: 62 }}>MEMBER</Text>
              <Text size="xs" weight="medium" color={c.textSubtle} style={{ width: 110 }}>BALANCE</Text>
              <Text size="xs" weight="medium" color={c.textSubtle} style={{ width: 90 }}>STATUS</Text>
              <Text size="xs" weight="medium" color={c.textSubtle} style={{ width: 90 }}>DUE DATE</Text>
              <Text size="xs" weight="medium" color={c.textSubtle} style={{ width: 80 }}>HOLD</Text>
              <View style={{ width: 20 }} />
            </View>
            <View style={[xs.desktopCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              {displayed.map((r) => (
                <DuesItem key={r.balance.id} row={r} isWide />
              ))}
            </View>
          </>
        ) : (
          <View style={{ gap: 10 }}>
            {displayed.map((r) => (
              <DuesItem key={r.balance.id} row={r} isWide={false} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const xs = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  tabScroll:  { borderBottomWidth: 1, flexGrow: 0 },
  tabChip:    { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  scrollWide: { padding: 20 },
  scrollMobile:{ padding: 14 },
  colHeader:  { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1 },
  desktopCard:{ borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  empty:      { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
});
