/**
 * Admin — Members Management
 *
 * Lists all chapter members with their role + custom officer role.
 * Admins can promote/demote members and assign officer roles inline.
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
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import type { Tables } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrgRole = Pick<Tables<'org_roles'>, 'id' | 'name' | 'color'>;

type MemberRow = {
  id:             string;
  role:           string;
  status:         string;
  custom_role_id: string | null;
  profiles: {
    id:         string;
    first_name: string;
    last_name:  string;
    email:      string;
  } | null;
  org_roles: OrgRole | null;
};

// Role hierarchy: admins can only assign roles strictly below their own
const ASSIGNABLE_ROLES = [
  { value: 'admin',      label: 'Admin',      description: 'Full chapter management' },
  { value: 'officer',    label: 'Officer',    description: 'Custom permissions' },
  { value: 'member',     label: 'Member',     description: 'Standard member access' },
  { value: 'new_member', label: 'New Member', description: 'Probationary access' },
] as const;

const ROLE_BADGE_COLOR: Record<string, string> = {
  org_admin:  '#E26B4A',
  admin:      '#E26B4A',
  officer:    '#A855F7',
  member:     '#3B82F6',
  new_member: '#6B7280',
};

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberItem({
  member,
  isSelf,
  onManage,
}: {
  member:   MemberRow;
  isSelf:   boolean;
  onManage: (m: MemberRow) => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const profile    = member.profiles;
  const firstName  = profile?.first_name ?? '';
  const lastName   = profile?.last_name  ?? '';
  const initials   = firstName && lastName ? `${firstName[0]}${lastName[0]}` : '?';
  const fullName   = `${firstName} ${lastName}`.trim() || 'Unknown';
  const badgeColor = ROLE_BADGE_COLOR[member.role] ?? '#6B7280';

  const roleLabel = member.org_roles
    ? member.org_roles.name
    : member.role.charAt(0).toUpperCase() + member.role.slice(1).replace('_', ' ');

  return (
    <Pressable
      onPress={() => !isSelf && onManage(member)}
      style={({ pressed }) => [
        styles.memberRow,
        { borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
        <Text size="xs" weight="medium" color={c.textMuted}>{initials}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text size="sm" weight="medium">{fullName}</Text>
          {isSelf && (
            <View style={[styles.selfBadge, { backgroundColor: c.surfaceAlt }]}>
              <Text size="xs" color={c.textMuted}>You</Text>
            </View>
          )}
        </View>
        <Text size="xs" color={c.textMuted}>{profile?.email ?? '—'}</Text>
      </View>

      {/* Role chip */}
      <View style={[styles.rolePill, { backgroundColor: badgeColor + '18', borderColor: badgeColor }]}>
        {member.org_roles && (
          <View style={[styles.roleColorDot, { backgroundColor: member.org_roles.color }]} />
        )}
        <Text size="xs" weight="medium" color={badgeColor}>{roleLabel}</Text>
      </View>

      {!isSelf && (
        <Ionicons name="chevron-forward-outline" size={16} color={c.textSubtle} />
      )}
    </Pressable>
  );
}

// ─── Role management modal ────────────────────────────────────────────────────

function ManageRoleModal({
  visible,
  member,
  orgRoles,
  myRole,
  onClose,
  onSave,
  saving,
}: {
  visible:  boolean;
  member:   MemberRow | null;
  orgRoles: OrgRole[];
  myRole:   string;
  onClose:  () => void;
  onSave:   (memberId: string, role: string, customRoleId: string | null) => void;
  saving:   boolean;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const [selectedRole, setSelectedRole]     = useState('member');
  const [selectedOrgRole, setSelectedOrgRole] = useState<string | null>(null);

  useEffect(() => {
    if (member) {
      setSelectedRole(member.role);
      setSelectedOrgRole(member.custom_role_id);
    }
  }, [member]);

  if (!member) return null;

  const profile   = member.profiles;
  const firstName = profile?.first_name ?? '';
  const lastName  = profile?.last_name  ?? '';
  const initials  = firstName && lastName ? `${firstName[0]}${lastName[0]}` : '?';
  const fullName  = `${firstName} ${lastName}`.trim() || 'Unknown';

  // org_admin can assign admin; chapter admin cannot promote to admin
  const canAssignAdmin = myRole === 'org_admin';
  const filteredRoles  = ASSIGNABLE_ROLES.filter(
    (r) => r.value !== 'admin' || canAssignAdmin,
  );

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: c.surface }]}>
          <View style={[styles.handle, { backgroundColor: c.border }]} />

          {/* Member header */}
          <View style={styles.modalMemberRow}>
            <View style={[styles.avatarLg, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Text size="md" weight="bold" color={c.textMuted}>{initials}</Text>
            </View>
            <View>
              <Text size="lg" weight="bold">{fullName}</Text>
              <Text size="sm" color={c.textMuted}>{profile?.email}</Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: c.border }]} />

          {/* Base role selector */}
          <Text size="xs" weight="medium" color={c.textMuted}
            style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Base Role
          </Text>
          <View style={[styles.roleList, { borderColor: c.border }]}>
            {filteredRoles.map((r, i) => {
              const active = selectedRole === r.value;
              return (
                <Pressable
                  key={r.value}
                  onPress={() => {
                    setSelectedRole(r.value);
                    if (r.value !== 'officer') setSelectedOrgRole(null);
                  }}
                  style={[
                    styles.roleOption,
                    i < filteredRoles.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
                    active && { backgroundColor: c.primary + '12' },
                  ]}
                >
                  <View style={[styles.radioOuter, { borderColor: active ? c.primary : c.border }]}>
                    {active && <View style={[styles.radioInner, { backgroundColor: c.primary }]} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text size="sm" weight={active ? 'medium' : 'regular'}
                      color={active ? c.primary : c.text}>
                      {r.label}
                    </Text>
                    <Text size="xs" color={c.textSubtle}>{r.description}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Officer role picker — only when base role = officer */}
          {selectedRole === 'officer' && orgRoles.length > 0 && (
            <>
              <Text size="xs" weight="medium" color={c.textMuted}
                style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 10 }}>
                Officer Role
              </Text>
              <View style={[styles.roleList, { borderColor: c.border }]}>
                {/* None option */}
                <Pressable
                  onPress={() => setSelectedOrgRole(null)}
                  style={[
                    styles.roleOption,
                    { borderBottomWidth: 1, borderBottomColor: c.border },
                    !selectedOrgRole && { backgroundColor: c.primary + '12' },
                  ]}
                >
                  <View style={[styles.radioOuter, { borderColor: !selectedOrgRole ? c.primary : c.border }]}>
                    {!selectedOrgRole && <View style={[styles.radioInner, { backgroundColor: c.primary }]} />}
                  </View>
                  <Text size="sm" color={!selectedOrgRole ? c.primary : c.text}>No specific role</Text>
                </Pressable>

                {orgRoles.map((or, i) => {
                  const active = selectedOrgRole === or.id;
                  return (
                    <Pressable
                      key={or.id}
                      onPress={() => setSelectedOrgRole(or.id)}
                      style={[
                        styles.roleOption,
                        i < orgRoles.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
                        active && { backgroundColor: c.primary + '12' },
                      ]}
                    >
                      <View style={[styles.radioOuter, { borderColor: active ? c.primary : c.border }]}>
                        {active && <View style={[styles.radioInner, { backgroundColor: c.primary }]} />}
                      </View>
                      <View style={[styles.roleColorDot, { backgroundColor: or.color }]} />
                      <Text size="sm" weight={active ? 'medium' : 'regular'}
                        color={active ? c.primary : c.text}>
                        {or.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* Actions */}
          <View style={[styles.modalActions, { marginTop: 24 }]}>
            <Pressable
              onPress={onClose}
              style={[styles.cancelBtn, { borderColor: c.border }]}
            >
              <Text size="sm" weight="medium">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(member.id, selectedRole, selectedOrgRole)}
              style={[styles.saveBtn, { backgroundColor: c.primary }]}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text size="sm" weight="bold" style={{ color: '#fff' }}>Save</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const FILTERS = ['All', 'Admins', 'Officers', 'Members'] as const;
type Filter = typeof FILTERS[number];

export default function AdminMembersScreen() {
  const { theme }    = useThemeStore();
  const insets       = useSafeAreaInsets();
  const { width }    = useWindowDimensions();
  const isWide       = width >= 800;
  const { organization, membership, profile } = useAuthStore();

  const [members, setMembers]     = useState<MemberRow[]>([]);
  const [orgRoles, setOrgRoles]   = useState<OrgRole[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);
  const [filter, setFilter]       = useState<Filter>('All');
  const [managing, setManaging]   = useState<MemberRow | null>(null);
  const [saving, setSaving]       = useState(false);

  const orgId  = organization?.id;
  const myId   = profile?.id;
  const myRole = membership?.role ?? 'member';

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    const [membersRes, rolesRes] = await Promise.all([
      supabase
        .from('memberships')
        .select(`
          id, role, status, custom_role_id,
          profiles!user_id(id, first_name, last_name, email),
          org_roles!custom_role_id(id, name, color)
        `)
        .eq('org_id', orgId)
        .eq('is_deleted', false)
        .order('role'),

      supabase
        .from('org_roles')
        .select('id, name, color')
        .eq('org_id', orgId)
        .order('name'),
    ]);

    setMembers((membersRes.data ?? []) as MemberRow[]);
    setOrgRoles((rolesRes.data ?? []) as OrgRole[]);
    setLoading(false);
    setRefresh(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  // Filter members
  const filtered = members.filter((m) => {
    if (filter === 'Admins')  return m.role === 'admin' || m.role === 'org_admin';
    if (filter === 'Officers') return m.role === 'officer';
    if (filter === 'Members') return m.role === 'member' || m.role === 'new_member';
    return true;
  });

  async function handleSaveRole(memberId: string, role: string, customRoleId: string | null) {
    setSaving(true);
    await supabase
      .from('memberships')
      .update({ role, custom_role_id: customRoleId })
      .eq('id', memberId);
    await load();
    setSaving(false);
    setManaging(null);
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
          <Text size="xxl" weight="bold">Members</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {members.length} member{members.length !== 1 ? 's' : ''}
          </Text>
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
              style={[
                styles.filterChip,
                { borderColor: active ? c.primary : c.border,
                  backgroundColor: active ? c.primary + '14' : 'transparent' },
              ]}
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
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefresh(true); load(); }}
            tintColor={c.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              No {filter.toLowerCase()} found
            </Text>
          </View>
        ) : (
          <Card style={{ paddingVertical: 0 }}>
            {filtered.map((m, i) => (
              <View key={m.id} style={i < filtered.length - 1 ? { borderBottomWidth: 1, borderBottomColor: c.border } : undefined}>
                <MemberItem
                  member={m}
                  isSelf={m.profiles?.id === myId}
                  onManage={setManaging}
                />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      <ManageRoleModal
        visible={!!managing}
        member={managing}
        orgRoles={orgRoles}
        myRole={myRole}
        onClose={() => setManaging(null)}
        onSave={handleSaveRole}
        saving={saving}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip:{ borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  scroll:    { padding: 20, paddingBottom: 48 },
  scrollWide:{ paddingHorizontal: 48, maxWidth: 760, alignSelf: 'center', width: '100%' },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  avatar:    { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  selfBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  rolePill:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  roleColorDot: { width: 8, height: 8, borderRadius: 4 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },

  // Modal
  modalOverlay:   { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet:     { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '88%' },
  handle:         { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalMemberRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  avatarLg:       { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  divider:        { height: 1, marginBottom: 20 },

  roleList:   { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  roleOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5 },

  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn:    { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  saveBtn:      { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
});
