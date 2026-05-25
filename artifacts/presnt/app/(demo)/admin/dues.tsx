/**
 * Demo Admin — Dues (read-only)
 *
 * Shows dues stats and a member list with per-member dues status.
 * Member rows show an info alert on press (same as real screen).
 * No record-payment, waive, or hold-toggle actions.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

type DuesMember = {
  id:              string;
  dues_balance:    number | null;
  dues_status:     string;
  dues_hold:       boolean | null;
  dues_last_paid_at: string | null;
  profiles: {
    first_name: string;
    last_name:  string;
    email:      string;
  } | null;
};

type Filter = 'All' | 'Unpaid' | 'On hold' | 'Overdue';
const FILTERS: Filter[] = ['All', 'Unpaid', 'On hold', 'Overdue'];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  paid:    { label: 'Paid',    bg: '#dcfce7', text: '#15803d' },
  due:     { label: 'Due',     bg: '#fef3c7', text: '#92400e' },
  overdue: { label: 'Overdue', bg: '#fee2e2', text: '#b91c1c' },
  hold:    { label: 'Hold',    bg: '#f3e8ff', text: '#7e22ce' },
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  return (
    <Card style={styles.statCard}>
      <Text size="xs" weight="medium" color={c.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </Text>
      <Text size="xl" weight="bold" style={{ marginTop: 6 }}>{value}</Text>
      {sub && <Text size="xs" color={c.textSubtle} style={{ marginTop: 2 }}>{sub}</Text>}
    </Card>
  );
}

function DuesRow({ member, onPress }: { member: DuesMember; onPress: () => void }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const profile   = member.profiles;
  const firstName = profile?.first_name ?? '';
  const lastName  = profile?.last_name  ?? '';
  const initials  = firstName && lastName ? `${firstName[0]}${lastName[0]}` : '?';
  const fullName  = `${firstName} ${lastName}`.trim() || 'Unknown';

  const status  = member.dues_hold ? 'hold' : member.dues_status;
  const cfg     = STATUS_CONFIG[status] ?? STATUS_CONFIG['due'];
  const balance = member.dues_balance ?? 0;
  const lastPaid = member.dues_last_paid_at
    ? new Date(member.dues_last_paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.duesRow,
        { borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
        <Text size="xs" weight="medium" color={c.textMuted}>{initials}</Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" weight="medium" numberOfLines={1}>{fullName}</Text>
        {isWide && (
          <Text size="xs" color={c.textMuted} numberOfLines={1}>{profile?.email}</Text>
        )}
      </View>

      <Text size="sm" weight="medium"
        style={{ width: 70, textAlign: 'right', color: balance > 0 ? c.error : c.success }}>
        {balance > 0 ? `$${balance}` : balance < 0 ? `+$${Math.abs(balance)}` : '$0'}
      </Text>

      {isWide && (
        <Text size="xs" color={c.textMuted} style={{ width: 90, textAlign: 'right' }}>
          {lastPaid}
        </Text>
      )}

      <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
        <Text size="xs" weight="medium" style={{ color: cfg.text }}>{cfg.label}</Text>
      </View>
    </Pressable>
  );
}

export default function DemoAdminDuesScreen() {
  const { theme }    = useThemeStore();
  const insets       = useSafeAreaInsets();
  const { width }    = useWindowDimensions();
  const isWide       = width >= 800;
  const { membership } = useAuthStore();

  const [members, setMembers]       = useState<DuesMember[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState<Filter>('All');
  const [search, setSearch]         = useState('');

  const orgId = membership?.org_id;

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    const { data } = await supabase
      .from('memberships')
      .select(`
        id, dues_balance, dues_status, dues_hold, dues_last_paid_at,
        profiles!user_id(first_name, last_name, email)
      `)
      .eq('org_id', orgId)
      .eq('is_deleted', false)
      .eq('status', 'active')
      .order('dues_status');

    const normalized: DuesMember[] = ((data ?? []) as any[]).map((m) => ({
      ...m,
      profiles: Array.isArray(m.profiles) ? (m.profiles[0] ?? null) : m.profiles,
    }));
    setMembers(normalized);
    setLoading(false);
    setRefreshing(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const totalBalance   = members.reduce((s, m) => s + (m.dues_balance ?? 0), 0);
  const outstanding    = members.filter((m) => m.dues_status !== 'paid' && !m.dues_hold);
  const onHold         = members.filter((m) => m.dues_hold === true);
  const overdue        = members.filter((m) => m.dues_status === 'overdue');
  const avgBalance     = members.length ? (totalBalance / members.length).toFixed(0) : '0';

  const filtered = members.filter((m) => {
    const matchesFilter =
      filter === 'All'      ? true
      : filter === 'Unpaid'   ? m.dues_status !== 'paid'
      : filter === 'On hold'  ? m.dues_hold === true
      : filter === 'Overdue'  ? m.dues_status === 'overdue'
      : true;

    if (!matchesFilter) return false;
    if (!search) return true;
    const name = `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.toLowerCase();
    const email = (m.profiles?.email ?? '').toLowerCase();
    return name.includes(search.toLowerCase()) || email.includes(search.toLowerCase());
  });

  function handleMemberPress(m: DuesMember) {
    const name = `${m.profiles?.first_name} ${m.profiles?.last_name}`.trim();
    const info = [
      `Balance: $${m.dues_balance ?? 0}`,
      `Status: ${m.dues_hold ? 'On Hold' : m.dues_status}`,
      `Last paid: ${m.dues_last_paid_at ? new Date(m.dues_last_paid_at).toLocaleDateString() : 'Never'}`,
    ].join('\n');
    Alert.alert(name, info);
  }

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
          <Text size="xxl" weight="bold">Dues</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {members.length} active members
          </Text>
        </View>
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
          <StatCard label="Outstanding" value={`${outstanding.length}`} sub="members" />
          <StatCard label="On Hold"     value={`${onHold.length}`}      sub="members" />
          <StatCard label="Overdue"     value={`${overdue.length}`}      sub="members" />
          <StatCard label="Avg Balance" value={`$${avgBalance}`}         sub="per member" />
        </View>

        {/* Search */}
        <View style={[styles.searchBar, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name="search-outline" size={16} color={c.textSubtle} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search members…"
            placeholderTextColor={c.textSubtle}
            style={[styles.searchInput, { color: c.text, fontFamily: theme.typography.fontFamily.regular }]}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={c.textSubtle} />
            </Pressable>
          )}
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={{ flexShrink: 0, flexGrow: 0 }}>
          {FILTERS.map((f) => {
            const active = filter === f;
            const count  = f === 'All' ? members.length
              : f === 'Unpaid'  ? outstanding.length
              : f === 'On hold' ? onHold.length
              : overdue.length;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[
                  styles.chip,
                  { borderColor: active ? c.primary : c.border,
                    backgroundColor: active ? c.primary + '14' : 'transparent' },
                ]}
              >
                <Text size="xs" weight={active ? 'medium' : 'regular'}
                  color={active ? c.primary : c.textMuted}>
                  {f} · {count}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Table header (wide screens) */}
        {isWide && (
          <View style={[styles.tableHeader, { borderBottomColor: c.border, backgroundColor: c.surfaceAlt }]}>
            {['MEMBER', 'BALANCE', 'LAST PAYMENT', 'STATUS'].map((col) => (
              <Text key={col} size="xs" weight="medium" color={c.textMuted}
                style={col === 'MEMBER' ? [styles.colHeader, { flex: 1 }] : styles.colHeader}>
                {col}
              </Text>
            ))}
          </View>
        )}

        {/* Member list */}
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cash-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              No members match this filter
            </Text>
          </View>
        ) : (
          <Card style={{ paddingVertical: 0 }}>
            {filtered.map((m, i) => (
              <View
                key={m.id}
                style={i < filtered.length - 1 ? { borderBottomWidth: 1, borderBottomColor: c.border } : undefined}
              >
                <DuesRow member={m} onPress={() => handleMemberPress(m)} />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  scroll:    { padding: 20, gap: 16, paddingBottom: 48 },
  scrollWide:{ paddingHorizontal: 48, maxWidth: 900, alignSelf: 'center', width: '100%' },

  statGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard:  { flex: 1, minWidth: '44%' },

  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderRadius: 12 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  filterRow: { flexDirection: 'row', gap: 8 },
  chip:      { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },

  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  colHeader:   { width: 100, textAlign: 'right' },

  duesRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  avatar:      { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, minWidth: 58, alignItems: 'center' },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
});
