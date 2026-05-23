/**
 * Officer — Members
 *
 * Desktop: data table (MEMBER, YEAR, STATUS, ATTENDANCE, PTS columns) with ··· action menu
 * Mobile:  search + filter + card list
 *
 * Officers with MANAGE_MEMBERS can block/unblock + toggle dues hold.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import { PERMISSIONS } from '@/lib/permissions';
import { usePermissions } from '@/hooks/usePermissions';
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

const DUES_COLOR: Record<string, string> = {
  paid: '#22C55E', unpaid: '#EF4444', partial: '#EAB308', waived: '#6B7280',
};
const STATUS_COLOR: Record<string, string> = {
  active: '#22C55E', inactive: '#6B7280', probation: '#EF4444',
};

type FilterTab = 'All' | 'Active' | 'Probation';

function initials(p: { first_name: string; last_name: string } | null) {
  if (!p) return '?';
  return `${p.first_name[0] ?? ''}${p.last_name[0] ?? ''}`;
}

// ─── Member Detail Modal ──────────────────────────────────────────────────────

function MemberDetailModal({
  member,
  canManage,
  onClose,
  onRefresh,
}: {
  member:    MemberRow;
  canManage: boolean;
  onClose:   () => void;
  onRefresh: () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [saving, setSaving] = useState<string | null>(null);

  const p         = member.profiles;
  const name      = p ? `${p.first_name} ${p.last_name}` : 'Unknown';
  const isBlocked = !!member.is_blocked;
  const hasDuesHold = !!member.dues_hold;

  async function toggle(field: 'block' | 'dues') {
    setSaving(field);
    if (field === 'block') {
      await supabase.from('memberships')
        .update(isBlocked ? { is_blocked: false, block_reason: null } : { is_blocked: true })
        .eq('id', member.id);
    } else {
      await supabase.from('memberships').update({ dues_hold: !hasDuesHold }).eq('id', member.id);
    }
    setSaving(null);
    onRefresh();
    onClose();
  }

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={md.overlay}>
        <View style={[md.sheet, { backgroundColor: c.surface }]}>
          <View style={[md.handle, { backgroundColor: c.border }]} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <View style={[md.avatarLg, { backgroundColor: c.surfaceAlt }]}>
              <Text size="md" weight="bold" color={c.textMuted}>{initials(p)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text size="lg" weight="bold">{name}</Text>
              <Text size="sm" color={c.textMuted}>{p?.email}</Text>
              {p?.phone && <Text size="xs" color={c.textSubtle}>{p.phone}</Text>}
            </View>
          </View>

          {/* Info chips */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <View style={[md.chip, { backgroundColor: (DUES_COLOR[member.dues_status] ?? '#6B7280') + '18', borderColor: DUES_COLOR[member.dues_status] ?? '#6B7280' }]}>
              <Text size="xs" weight="medium" color={DUES_COLOR[member.dues_status] ?? '#6B7280'}>
                Dues: {member.dues_status.charAt(0).toUpperCase() + member.dues_status.slice(1)}
                {member.dues_balance != null ? ` ($${member.dues_balance})` : ''}
              </Text>
            </View>
            {member.org_roles && (
              <View style={[md.chip, { backgroundColor: member.org_roles.color + '18', borderColor: member.org_roles.color }]}>
                <Text size="xs" weight="medium" color={member.org_roles.color}>{member.org_roles.name}</Text>
              </View>
            )}
            {isBlocked && (
              <View style={[md.chip, { backgroundColor: '#EF444418', borderColor: '#EF4444' }]}>
                <Text size="xs" weight="medium" color="#EF4444">Blocked</Text>
              </View>
            )}
          </View>

          {p?.major && <Text size="sm" color={c.textSubtle} style={{ marginBottom: 16 }}>📚 {p.major}</Text>}
          {p?.graduation_year && <Text size="sm" color={c.textSubtle} style={{ marginBottom: 16 }}>🎓 Class of {p.graduation_year}</Text>}

          {canManage && (
            <View style={{ gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={() => toggle('block')}
                disabled={!!saving}
                style={[md.actionBtn, { backgroundColor: isBlocked ? '#22C55E14' : '#EF444414', borderColor: isBlocked ? '#22C55E40' : '#EF444440' }]}
              >
                {saving === 'block' ? <ActivityIndicator size="small" color={isBlocked ? '#22C55E' : '#EF4444'} /> : (
                  <>
                    <Ionicons name={isBlocked ? 'lock-open-outline' : 'ban-outline'} size={16} color={isBlocked ? '#22C55E' : '#EF4444'} />
                    <Text size="sm" weight="medium" color={isBlocked ? '#22C55E' : '#EF4444'}>
                      {isBlocked ? 'Unblock Member' : 'Block Member'}
                    </Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={() => toggle('dues')}
                disabled={!!saving}
                style={[md.actionBtn, { backgroundColor: hasDuesHold ? '#22C55E14' : '#EAB30814', borderColor: hasDuesHold ? '#22C55E40' : '#EAB30840' }]}
              >
                {saving === 'dues' ? <ActivityIndicator size="small" color="#EAB308" /> : (
                  <>
                    <Ionicons name={hasDuesHold ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={16} color={hasDuesHold ? '#22C55E' : '#EAB308'} />
                    <Text size="sm" weight="medium" color={hasDuesHold ? '#22C55E' : '#EAB308'}>
                      {hasDuesHold ? 'Remove Dues Hold' : 'Place Dues Hold'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          <Pressable onPress={onClose} style={[md.closeBtn, { borderColor: c.border, marginTop: 16 }]}>
            <Text size="sm" weight="medium">Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const md = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:    { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '88%' },
  handle:   { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  avatarLg: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  chip:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  actionBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingVertical: 13 },
  closeBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
});

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
  const { organization } = useAuthStore();
  const userView       = useUserViewStore((s) => s.session);
  const { can }        = usePermissions();
  const { width }      = useWindowDimensions();
  const isWide         = width >= DESKTOP;
  const c = theme.colors;

  const orgId = userView?.org.id ?? organization?.id ?? '';
  const canManage = userView
    ? userView.role === 'admin' || userView.permissions.includes(PERMISSIONS.MANAGE_MEMBERS)
    : can(PERMISSIONS.MANAGE_MEMBERS);

  const [members,  setMembers]  = useState<MemberRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);
  const [tab,      setTab]      = useState<FilterTab>('All');
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState<MemberRow | null>(null);

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
    setMembers((data ?? []) as MemberRow[]);
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
            {displayed.map((m, i) => (
              <DesktopRow key={m.id} member={m} onOpen={() => setSelected(m)} />
            ))}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {displayed.map(m => (
              <MobileCard key={m.id} member={m} onOpen={() => setSelected(m)} />
            ))}
          </View>
        )}
      </ScrollView>

      {selected && (
        <MemberDetailModal
          member={selected}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onRefresh={load}
        />
      )}
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
