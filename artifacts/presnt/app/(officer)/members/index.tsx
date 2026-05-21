/**
 * Officer — Members
 *
 * Officers with MANAGE_MEMBERS can:
 *   • Browse all active members with their status, dues, and role
 *   • View member detail + contact info
 *   • Block / unblock a member (is_blocked + block_reason)
 *   • Toggle dues hold
 *
 * Read-only view is still shown; actions are gated behind the permission.
 * Entitlement gate: tab hidden in _layout.tsx if !can(MANAGE_MEMBERS).
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';
import { PERMISSIONS } from '@/lib/permissions';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';
import type { Tables } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberRow = {
  id:              string;
  role:            string;
  status:          string;
  dues_status:     string;
  dues_balance:    number | null;
  dues_hold:       boolean | null;
  is_blocked:      boolean | null;
  block_reason:    string | null;
  can_attend_events: boolean | null;
  user_id:         string;
  profiles: {
    id:         string;
    first_name: string;
    last_name:  string;
    email:      string;
    phone:      string | null;
    major:      string | null;
  } | null;
  org_roles: { id: string; name: string; color: string } | null;
};

const FILTERS = ['All', 'Members', 'Officers', 'Blocked'] as const;
type Filter = typeof FILTERS[number];

const ROLE_BADGE: Record<string, string> = {
  org_admin:  '#E26B4A',
  admin:      '#E26B4A',
  officer:    '#A855F7',
  member:     '#3B82F6',
  new_member: '#6B7280',
};

const DUES_COLOR: Record<string, string> = {
  paid:    '#22C55E',
  unpaid:  '#EF4444',
  partial: '#EAB308',
  waived:  '#6B7280',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(p: { first_name: string; last_name: string } | null) {
  if (!p) return '?';
  return `${p.first_name[0] ?? ''}${p.last_name[0] ?? ''}`;
}

// ─── Member detail / action modal ────────────────────────────────────────────

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

  const [blockReason, setBlockReason] = useState(member.block_reason ?? '');
  const [showBlockInput, setShowBlock] = useState(false);
  const [saving, setSaving]           = useState<string | null>(null);

  const profile   = member.profiles;
  const name      = profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown';
  const initl     = initials(profile);
  const isBlocked = !!member.is_blocked;
  const hasDuesHold = !!member.dues_hold;
  const duesColor = DUES_COLOR[member.dues_status] ?? '#6B7280';
  const roleLabel = member.org_roles
    ? member.org_roles.name
    : member.role.charAt(0).toUpperCase() + member.role.slice(1).replace('_', ' ');

  async function toggleBlock() {
    if (!isBlocked && !showBlockInput) {
      setShowBlock(true);
      return;
    }
    setSaving('block');
    await supabase
      .from('memberships')
      .update(isBlocked
        ? { is_blocked: false, block_reason: null }
        : { is_blocked: true, block_reason: blockReason.trim() || null }
      )
      .eq('id', member.id);
    setSaving(null);
    setShowBlock(false);
    onRefresh();
    onClose();
  }

  async function toggleDuesHold() {
    setSaving('dues');
    await supabase
      .from('memberships')
      .update({ dues_hold: !hasDuesHold })
      .eq('id', member.id);
    setSaving(null);
    onRefresh();
    onClose();
  }

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: c.surface }]}>
          <View style={[styles.handle, { backgroundColor: c.border }]} />

          {/* Avatar + name */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <View style={[styles.avatarLg, { backgroundColor: c.surfaceAlt }]}>
              <Text size="md" weight="bold" color={c.textMuted}>{initl}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text size="lg" weight="bold">{name}</Text>
              <Text size="sm" color={c.textMuted}>{profile?.email}</Text>
              {profile?.phone && <Text size="xs" color={c.textSubtle}>{profile.phone}</Text>}
            </View>
          </View>

          {/* Info pills */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {/* Role */}
            <View style={[styles.infoPill, {
              backgroundColor: (ROLE_BADGE[member.role] ?? '#6B7280') + '18',
              borderColor:     (ROLE_BADGE[member.role] ?? '#6B7280'),
            }]}>
              {member.org_roles && (
                <View style={[styles.colorDot, { backgroundColor: member.org_roles.color }]} />
              )}
              <Text size="xs" weight="medium" color={ROLE_BADGE[member.role] ?? '#6B7280'}>
                {roleLabel}
              </Text>
            </View>

            {/* Dues status */}
            <View style={[styles.infoPill, { backgroundColor: duesColor + '18', borderColor: duesColor }]}>
              <Text size="xs" weight="medium" color={duesColor}>
                Dues: {member.dues_status.charAt(0).toUpperCase() + member.dues_status.slice(1)}
                {member.dues_balance != null ? ` ($${member.dues_balance})` : ''}
              </Text>
            </View>

            {/* Blocked */}
            {isBlocked && (
              <View style={[styles.infoPill, { backgroundColor: '#EF444418', borderColor: '#EF4444' }]}>
                <Text size="xs" weight="medium" color="#EF4444">Blocked</Text>
              </View>
            )}

            {/* Dues hold */}
            {hasDuesHold && (
              <View style={[styles.infoPill, { backgroundColor: '#EAB30818', borderColor: '#EAB308' }]}>
                <Text size="xs" weight="medium" color="#EAB308">Dues Hold</Text>
              </View>
            )}
          </View>

          {/* Major */}
          {profile?.major && (
            <Text size="sm" color={c.textSubtle} style={{ marginBottom: 16 }}>
              📚 {profile.major}
            </Text>
          )}

          {/* Block reason if blocked */}
          {isBlocked && member.block_reason && (
            <View style={[styles.reasonBox, { backgroundColor: '#EF444410', borderColor: '#EF444430' }]}>
              <Text size="xs" color="#EF4444">Block reason: {member.block_reason}</Text>
            </View>
          )}

          {/* Block reason input */}
          {showBlockInput && !isBlocked && (
            <TextInput
              style={[styles.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text, marginTop: 12 }]}
              value={blockReason}
              onChangeText={setBlockReason}
              placeholder="Reason for blocking (optional)"
              placeholderTextColor={c.textSubtle}
            />
          )}

          {/* Action buttons */}
          {canManage && (
            <View style={{ gap: 10, marginTop: 20 }}>
              {/* Block / Unblock */}
              <Pressable
                onPress={toggleBlock}
                disabled={!!saving}
                style={[styles.actionBtn, {
                  backgroundColor: isBlocked ? '#22C55E18' : '#EF444418',
                  borderColor:     isBlocked ? '#22C55E40' : '#EF444440',
                }]}
              >
                {saving === 'block'
                  ? <ActivityIndicator size="small" color={isBlocked ? '#22C55E' : '#EF4444'} />
                  : <>
                      <Ionicons
                        name={isBlocked ? 'lock-open-outline' : 'ban-outline'}
                        size={16}
                        color={isBlocked ? '#22C55E' : '#EF4444'}
                      />
                      <Text size="sm" weight="medium" color={isBlocked ? '#22C55E' : '#EF4444'}>
                        {showBlockInput ? 'Confirm Block' : isBlocked ? 'Unblock Member' : 'Block Member'}
                      </Text>
                    </>
                }
              </Pressable>

              {/* Dues hold */}
              <Pressable
                onPress={toggleDuesHold}
                disabled={!!saving}
                style={[styles.actionBtn, {
                  backgroundColor: hasDuesHold ? '#22C55E18' : '#EAB30818',
                  borderColor:     hasDuesHold ? '#22C55E40' : '#EAB30840',
                }]}
              >
                {saving === 'dues'
                  ? <ActivityIndicator size="small" color="#EAB308" />
                  : <>
                      <Ionicons
                        name={hasDuesHold ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                        size={16}
                        color={hasDuesHold ? '#22C55E' : '#EAB308'}
                      />
                      <Text size="sm" weight="medium" color={hasDuesHold ? '#22C55E' : '#EAB308'}>
                        {hasDuesHold ? 'Remove Dues Hold' : 'Place Dues Hold'}
                      </Text>
                    </>
                }
              </Pressable>
            </View>
          )}

          <Pressable onPress={onClose} style={[styles.closeBtn, { borderColor: c.border, marginTop: 16 }]}>
            <Text size="sm" weight="medium">Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberItem({ member, onOpen }: { member: MemberRow; onOpen: () => void }) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const profile    = member.profiles;
  const name       = profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown';
  const initl      = initials(profile);
  const badgeColor = ROLE_BADGE[member.role] ?? '#6B7280';
  const roleLabel  = member.org_roles
    ? member.org_roles.name
    : member.role.charAt(0).toUpperCase() + member.role.slice(1).replace('_', ' ');

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.memberRow,
        { borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: c.surfaceAlt }]}>
        <Text size="xs" weight="medium" color={c.textMuted}>{initl}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text size="sm" weight="medium">{name}</Text>
          {member.is_blocked && (
            <View style={[styles.tagPill, { backgroundColor: '#EF444418', borderColor: '#EF444440' }]}>
              <Text size="xs" color="#EF4444">Blocked</Text>
            </View>
          )}
          {member.dues_hold && (
            <View style={[styles.tagPill, { backgroundColor: '#EAB30818', borderColor: '#EAB30840' }]}>
              <Text size="xs" color="#EAB308">Hold</Text>
            </View>
          )}
        </View>
        <Text size="xs" color={c.textSubtle}>{profile?.email}</Text>
      </View>

      {/* Role */}
      <View style={[styles.rolePill, { backgroundColor: badgeColor + '18', borderColor: badgeColor }]}>
        {member.org_roles && (
          <View style={[styles.colorDot, { backgroundColor: member.org_roles.color }]} />
        )}
        <Text size="xs" weight="medium" color={badgeColor}>{roleLabel}</Text>
      </View>

      <Ionicons name="chevron-forward-outline" size={16} color={c.textSubtle} />
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OfficerMembersScreen() {
  const { theme }      = useThemeStore();
  const insets         = useSafeAreaInsets();
  const { organization } = useAuthStore();
  const userView       = useUserViewStore((s) => s.session);
  const { can }        = usePermissions();
  const c = theme.colors;

  const orgId = userView?.org.id ?? organization?.id;

  // Permission: real session or user-view with manage_members
  const canManage = userView
    ? userView.role === 'admin' || userView.permissions.includes(PERMISSIONS.MANAGE_MEMBERS)
    : can(PERMISSIONS.MANAGE_MEMBERS);

  const [members, setMembers]   = useState<MemberRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [filter, setFilter]     = useState<Filter>('All');
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<MemberRow | null>(null);

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    const { data } = await supabase
      .from('memberships')
      .select(`
        id, role, status, dues_status, dues_balance, dues_hold, is_blocked, block_reason, can_attend_events, user_id,
        profiles!user_id(id, first_name, last_name, email, phone, major),
        org_roles!custom_role_id(id, name, color)
      `)
      .eq('org_id', orgId)
      .eq('is_deleted', false)
      .order('role');

    setMembers((data ?? []) as MemberRow[]);
    setLoading(false);
    setRefresh(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  // Filter + search
  const displayed = members.filter((m) => {
    const roleMatch = (() => {
      if (filter === 'Officers') return m.role === 'officer';
      if (filter === 'Members')  return m.role === 'member' || m.role === 'new_member';
      if (filter === 'Blocked')  return !!m.is_blocked;
      return true;
    })();

    const q = search.toLowerCase();
    const nameMatch = !q || (
      (m.profiles?.first_name ?? '').toLowerCase().includes(q) ||
      (m.profiles?.last_name  ?? '').toLowerCase().includes(q) ||
      (m.profiles?.email      ?? '').toLowerCase().includes(q)
    );

    return roleMatch && nameMatch;
  });

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
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View>
          <Text size="xxl" weight="bold">Members</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {members.length} member{members.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={[styles.searchRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={[styles.searchBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
          <Ionicons name="search-outline" size={16} color={c.textSubtle} />
          <TextInput
            style={{ flex: 1, fontSize: 14, color: c.text }}
            value={search}
            onChangeText={setSearch}
            placeholder="Search members…"
            placeholderTextColor={c.textSubtle}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={c.textSubtle} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}
      >
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, {
                borderColor: active ? c.primary : c.border,
                backgroundColor: active ? c.primary + '14' : 'transparent',
              }]}
            >
              <Text size="xs" weight={active ? 'medium' : 'regular'}
                color={active ? c.primary : c.textMuted}>
                {f}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefresh(true); load(); }}
            tintColor={c.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {displayed.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              No members found
            </Text>
          </View>
        ) : (
          <Card style={{ paddingVertical: 0 }}>
            {displayed.map((m, i) => (
              <View key={m.id}
                style={i < displayed.length - 1 ? { borderBottomWidth: 1, borderBottomColor: c.border } : undefined}>
                <MemberItem member={m} onOpen={() => setSelected(m)} />
              </View>
            ))}
          </Card>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:    { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  searchRow: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip:{ borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  scroll:    { padding: 16, paddingBottom: 48 },
  emptyState:{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  avatar:    { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  rolePill:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  colorDot:  { width: 8, height: 8, borderRadius: 4 },
  tagPill:   { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '88%' },
  handle:       { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  avatarLg:     { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  infoPill:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  reasonBox:    { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 4 },
  actionBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingVertical: 13 },
  input:        { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  closeBtn:     { borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
});
