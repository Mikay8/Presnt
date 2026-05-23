/**
 * Officer — Members
 *
 * Desktop: data table (MEMBER, YEAR, STATUS, ATTENDANCE, PTS columns) with ··· action menu
 * Mobile:  search + filter + card list
 *
 * Officers with MANAGE_MEMBERS can block/unblock + toggle dues hold.
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
import { DOMAIN, loggedQuery } from '@/lib/apiLogger';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';
import type { Tables } from '@/types/database';

const DESKTOP = 768;

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberRow = {
  id:           string;
  role:         string;
  status:       string;
  dues_status:  string;
  dues_balance: number | null;
  dues_hold:    boolean | null;
  is_blocked:   boolean | null;
  block_reason: string | null;
  user_id:      string;
  profiles: {
    id:              string;
    first_name:      string;
    last_name:       string;
    email:           string;
    phone:           string | null;
    major:           string | null;
    graduation_year: number | null;
  } | null;
  org_roles: { id: string; name: string; color: string } | null;
};

const STATUS_COLOR: Record<string, string> = {
  active: '#22C55E', inactive: '#6B7280', probation: '#EF4444',
};

type FilterTab = 'All' | 'Active' | 'Probation';

function initials(p: { first_name: string; last_name: string } | null) {
  if (!p) return '?';
  return `${p.first_name[0] ?? ''}${p.last_name[0] ?? ''}`;
}


// ─── Desktop Table Row ────────────────────────────────────────────────────────

function DesktopRow({ member, onOpen }: { member: MemberRow; onOpen: () => void }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const p = member.profiles;
  const name = p ? `${p.first_name} ${p.last_name}` : 'Unknown';
  const statusColor = member.is_blocked ? '#EF4444'
    : STATUS_COLOR[member.status] ?? '#6B7280';
  const statusLabel = member.is_blocked ? 'Blocked'
    : member.status.charAt(0).toUpperCase() + member.status.slice(1);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <View style={[dr.row, { borderBottomColor: c.border }]}>
      {/* Avatar + name */}
      <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[dr.avatar, { backgroundColor: c.surfaceAlt }]}>
          <Text size="xs" weight="medium" color={c.textMuted}>{initials(p)}</Text>
        </View>
        <View>
          <Text size="sm" weight="medium">{name}</Text>
          <Text size="xs" color={c.textSubtle}>{p?.email}</Text>
        </View>
      </View>
      {/* Year */}
      <Text size="sm" color={c.textMuted} style={{ flex: 1 }}>
        {p?.graduation_year ? `'${String(p.graduation_year).slice(-2)}` : '—'}
      </Text>
      {/* Status */}
      <View style={{ flex: 1 }}>
        <View style={[dr.statusChip, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
          <Text size="xs" weight="medium" color={statusColor}>{statusLabel}</Text>
        </View>
      </View>
      {/* Attendance placeholder */}
      <Text size="sm" color={c.textMuted} style={{ flex: 1 }}>—</Text>
      {/* PTS placeholder */}
      <Text size="sm" color={c.textMuted} style={{ width: 48, textAlign: 'center' }}>—</Text>
      {/* Menu */}
      <View style={{ width: 36, alignItems: 'center', position: 'relative' }}>
        <Pressable onPress={() => setMenuOpen(!menuOpen)} style={{ padding: 8 }}>
          <Text size="md" color={c.textSubtle}>···</Text>
        </Pressable>
        {menuOpen && (
          <View style={[dr.menu, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Pressable onPress={() => { setMenuOpen(false); onOpen(); }} style={[dr.menuItem, { borderBottomColor: c.border }]}>
              <Text size="sm">View details</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const dr = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1 },
  avatar:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statusChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  menu:       { position: 'absolute', right: 0, top: 28, zIndex: 200, borderWidth: 1, borderRadius: 10, width: 140, overflow: 'hidden' },
  menuItem:   { padding: 12, borderBottomWidth: 1 },
});

// ─── Mobile Member Card ───────────────────────────────────────────────────────

function MobileCard({ member, onOpen }: { member: MemberRow; onOpen: () => void }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const p = member.profiles;
  const name = p ? `${p.first_name} ${p.last_name}` : 'Unknown';

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [mc2.card, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[mc2.avatar, { backgroundColor: c.surfaceAlt }]}>
          <Text size="xs" weight="medium" color={c.textMuted}>{initials(p)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text size="sm" weight="medium">{name}</Text>
            {member.is_blocked && (
              <View style={[mc2.tag, { backgroundColor: '#EF444414', borderColor: '#EF444440' }]}>
                <Text size="xs" color="#EF4444">Blocked</Text>
              </View>
            )}
          </View>
          <Text size="xs" color={c.textSubtle}>{p?.email}</Text>
        </View>
        <View style={[mc2.statusChip, {
          backgroundColor: (STATUS_COLOR[member.status] ?? '#6B7280') + '18',
          borderColor:     STATUS_COLOR[member.status] ?? '#6B7280',
        }]}>
          <Text size="xs" weight="medium" color={STATUS_COLOR[member.status] ?? '#6B7280'}>
            {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
          </Text>
        </View>
        <Ionicons name="chevron-forward-outline" size={16} color={c.textSubtle} />
      </View>
    </Pressable>
  );
}

const mc2 = StyleSheet.create({
  card:       { borderWidth: 1, borderRadius: 14, padding: 14 },
  avatar:     { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  tag:        { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  statusChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OfficerMembersScreen() {
  const { theme }      = useThemeStore();
  const insets         = useSafeAreaInsets();
  const { membership } = useAuthStore();
  const userView       = useUserViewStore((s) => s.session);
  const { width }      = useWindowDimensions();
  const isWide         = width >= DESKTOP;
  const c = theme.colors;

  const orgId = userView?.org.id ?? membership?.org_id ?? '';

  const [members,  setMembers]  = useState<MemberRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);
  const [tab,      setTab]      = useState<FilterTab>('All');
  const [search,   setSearch]   = useState('');

  const { profile } = useAuthStore();

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    const { data } = await loggedQuery({
      domain: DOMAIN.MEMBERS, method: 'GET', endpoint: 'memberships',
      orgId, userId: profile?.id,
      query: supabase
        .from('memberships')
        .select(`
          id, role, status, dues_status, dues_balance, dues_hold, is_blocked, block_reason, user_id,
          profiles!user_id(id, first_name, last_name, email, phone, major, graduation_year),
          org_roles!custom_role_id(id, name, color)
        `)
        .eq('org_id', orgId)
        .eq('is_deleted', false)
        .order('role'),
    });
    // Normalize: Supabase may return related rows as arrays when FK direction is ambiguous
    const normalized: MemberRow[] = ((data ?? []) as any[]).map((m) => ({
      ...m,
      profiles:  Array.isArray(m.profiles)  ? (m.profiles[0]  ?? null) : m.profiles,
      org_roles: Array.isArray(m.org_roles) ? (m.org_roles[0] ?? null) : m.org_roles,
    }));
    setMembers(normalized);
    setLoading(false);
    setRefresh(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const displayed = members.filter((m) => {
    const q = search.toLowerCase();
    const p = m.profiles;
    const nameMatch = !q || (
      (p?.first_name ?? '').toLowerCase().includes(q) ||
      (p?.last_name  ?? '').toLowerCase().includes(q) ||
      (p?.email      ?? '').toLowerCase().includes(q)
    );
    const tabMatch =
      tab === 'Active'    ? m.status === 'active'    && !m.is_blocked :
      tab === 'Probation' ? m.status === 'probation' || m.is_blocked  :
      true;
    return nameMatch && tabMatch;
  });

  const activeCount    = members.filter(m => m.status === 'active' && !m.is_blocked).length;
  const probationCount = members.filter(m => m.status === 'probation' || m.is_blocked).length;

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
      <View style={[ms.header, { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.background, borderBottomColor: c.border }]}>
        <View style={{ flex: 1 }}>
          <Text size="xxl" weight="bold">Members</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {activeCount} active
          </Text>
        </View>
        <Pressable style={[ms.exportBtn, { borderColor: c.border }]}>
          <Text size="sm" weight="medium">Export</Text>
        </Pressable>
        <Pressable style={[ms.msgBtn, { backgroundColor: c.primary }]}>
          <Text size="sm" weight="medium" style={{ color: '#fff' }}>Message</Text>
        </Pressable>
      </View>

      {/* Search + filter bar */}
      <View style={[ms.filterBar, { backgroundColor: c.background, borderBottomColor: c.border }]}>
        <View style={[ms.searchBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
          <Ionicons name="search-outline" size={15} color={c.textSubtle} />
          <TextInput
            style={{ flex: 1, fontSize: 14, color: c.text }}
            value={search}
            onChangeText={setSearch}
            placeholder="Search…"
            placeholderTextColor={c.textSubtle}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={15} color={c.textSubtle} />
            </Pressable>
          )}
        </View>
        {(['All', 'Active', 'Probation'] as FilterTab[]).map((t) => {
          const count = t === 'All' ? members.length : t === 'Active' ? activeCount : probationCount;
          const active = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[ms.tabChip, {
                backgroundColor: active ? c.surfaceAlt : 'transparent',
                borderColor:     active ? c.border : 'transparent',
              }]}
            >
              <Text size="sm" weight={active ? 'medium' : 'regular'}
                color={active ? c.text : c.textMuted}>
                {t}{count > 0 && t !== 'All' ? ` · ${count}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Desktop table header */}
      {isWide && (
        <View style={[ms.tableHeader, { backgroundColor: c.background, borderBottomColor: c.border }]}>
          {(['MEMBER', 'YEAR', 'STATUS', 'ATTENDANCE', 'PTS'] as const).map((col) => (
            <Text key={col} size="xs" weight="medium" color={c.textSubtle}
              style={[
                { textTransform: 'uppercase', letterSpacing: 1 },
                col === 'MEMBER' ? { flex: 3 } :
                col === 'PTS'    ? { width: 48, textAlign: 'center' } :
                { flex: 1 },
              ]}>
              {col}
            </Text>
          ))}
          <View style={{ width: 36 }} />
        </View>
      )}

      {/* List */}
      <ScrollView
        contentContainerStyle={isWide ? ms.desktopScroll : [ms.mobileScroll, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(); }} tintColor={c.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {displayed.length === 0 ? (
          <View style={ms.empty}>
            <Ionicons name="people-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>No members found</Text>
          </View>
        ) : isWide ? (
          <View style={[ms.desktopCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            {displayed.map((m) => (
              <DesktopRow key={m.id} member={m} onOpen={() => router.push(`/(officer)/members/${m.id}` as any)} />
            ))}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {displayed.map(m => (
              <MobileCard key={m.id} member={m} onOpen={() => router.push(`/(officer)/members/${m.id}` as any)} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const ms = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  exportBtn:   { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  msgBtn:      { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  filterBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: 1, flexWrap: 'wrap' },
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, minWidth: 180, flex: 1 },
  tabChip:     { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  tableHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1 },
  desktopScroll:{ padding: 20, paddingBottom: 48 },
  mobileScroll: { padding: 14, gap: 10, paddingBottom: 48 },
  desktopCard: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  empty:       { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
});
