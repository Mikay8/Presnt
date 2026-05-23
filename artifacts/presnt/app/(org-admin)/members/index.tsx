/**
 * Org Admin — Members Management
 *
 * Org admins can:
 *  - View all members across all chapters in their organization
 *  - Filter by chapter
 *  - Manage a member's role (promote to org_admin / admin / officer / member / new_member)
 *  - Move a member from one chapter to another
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

type Chapter = Pick<Tables<'organizations'>, 'id' | 'name' | 'institution' | 'primary_color'>;
type OrgRole = Pick<Tables<'org_roles'>, 'id' | 'name' | 'color'>;

type MemberRow = {
  id:             string;
  role:           string;
  status:         string;
  org_id:         string;
  joined_at:      string | null;
  custom_role_id: string | null;
  profiles: {
    id:         string;
    first_name: string;
    last_name:  string;
    email:      string;
  } | null;
  organizations: {
    id:   string;
    name: string;
  } | null;
  org_roles: OrgRole | null;
};

const ORG_ADMIN_BLUE = '#3B82F6';

const ROLE_COLOR: Record<string, string> = {
  org_admin:  '#E26B4A',
  admin:      '#E26B4A',
  officer:    '#A855F7',
  member:     '#3B82F6',
  new_member: '#6B7280',
};

// Org admins can assign any role including org_admin and admin
const ASSIGNABLE_ROLES = [
  { value: 'org_admin',  label: 'Org Admin',  description: 'Organization-level admin — manages all chapters' },
  { value: 'admin',      label: 'Admin',       description: 'Full chapter management access' },
  { value: 'officer',    label: 'Officer',     description: 'Custom permissions via a role' },
  { value: 'member',     label: 'Member',      description: 'Standard member access' },
  { value: 'new_member', label: 'New Member',  description: 'Probationary access' },
] as const;

// ─── Manage Member Modal ──────────────────────────────────────────────────────
// Two tabs: Role and Move Chapter

function ManageMemberModal({
  visible,
  member,
  chapters,
  orgRoles,
  onClose,
  onSave,
  saving,
}: {
  visible:  boolean;
  member:   MemberRow | null;
  chapters: Chapter[];
  orgRoles: OrgRole[];
  onClose:  () => void;
  onSave:   (memberId: string, role: string, customRoleId: string | null, toChapterId: string | null) => void;
  saving:   boolean;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const [tab, setTab] = useState<'role' | 'move'>('role');
  const [selectedRole, setSelectedRole]       = useState('member');
  const [selectedOrgRole, setSelectedOrgRole] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string>('');

  useEffect(() => {
    if (member) {
      setSelectedRole(member.role);
      setSelectedOrgRole(member.custom_role_id);
      setSelectedChapter(member.org_id);
      setTab('role');
    }
  }, [member]);

  if (!member) return null;

  const profile   = member.profiles;
  const firstName = profile?.first_name ?? '';
  const lastName  = profile?.last_name  ?? '';
  const initials  = firstName && lastName ? `${firstName[0]}${lastName[0]}` : '?';
  const fullName  = `${firstName} ${lastName}`.trim() || 'Unknown';

  const otherChapters = chapters.filter((ch) => ch.id !== member.org_id);
  const chapterChanged = selectedChapter !== member.org_id;

  function handleSave() {
    if (!member) return;
    const chapterId = tab === 'move' && chapterChanged ? selectedChapter : null;
    const roleId    = tab === 'role' ? (selectedRole === 'officer' ? selectedOrgRole : null) : member.custom_role_id;
    const role      = tab === 'role' ? selectedRole : member.role;
    onSave(member.id, role, roleId, chapterId);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: c.surface }]}>
          <View style={[styles.handle, { backgroundColor: c.border }]} />

          {/* Member header */}
          <View style={styles.memberHeader}>
            <View style={[styles.avatarLg, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Text size="md" weight="bold" color={c.textMuted}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text size="lg" weight="bold">{fullName}</Text>
              <Text size="sm" color={c.textMuted}>{profile?.email}</Text>
              <Text size="xs" color={c.textSubtle} style={{ marginTop: 3 }}>
                Chapter: <Text size="xs" weight="medium" color={c.text}>{member.organizations?.name ?? '—'}</Text>
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: c.border }]} />

          {/* Tabs */}
          <View style={[styles.tabRow, { borderColor: c.border }]}>
            {(['role', 'move'] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[
                  styles.tabBtn,
                  tab === t && { borderBottomWidth: 2, borderBottomColor: ORG_ADMIN_BLUE },
                ]}
              >
                <Text size="sm" weight={tab === t ? 'medium' : 'regular'}
                  color={tab === t ? ORG_ADMIN_BLUE : c.textMuted}>
                  {t === 'role' ? 'Change Role' : 'Move Chapter'}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>

            {/* ── Role tab ── */}
            {tab === 'role' && (
              <View style={{ gap: 16, paddingTop: 16 }}>
                <Text size="xs" weight="medium" color={c.textMuted}
                  style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                  Base Role
                </Text>
                <View style={[styles.roleList, { borderColor: c.border }]}>
                  {ASSIGNABLE_ROLES.map((r, i) => {
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
                          i < ASSIGNABLE_ROLES.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
                          active && { backgroundColor: ORG_ADMIN_BLUE + '12' },
                        ]}
                      >
                        <View style={[styles.radioOuter, { borderColor: active ? ORG_ADMIN_BLUE : c.border }]}>
                          {active && <View style={[styles.radioInner, { backgroundColor: ORG_ADMIN_BLUE }]} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text size="sm" weight={active ? 'medium' : 'regular'}
                            color={active ? ORG_ADMIN_BLUE : c.text}>
                            {r.label}
                          </Text>
                          <Text size="xs" color={c.textSubtle}>{r.description}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Officer role picker */}
                {selectedRole === 'officer' && orgRoles.length > 0 && (
                  <>
                    <Text size="xs" weight="medium" color={c.textMuted}
                      style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                      Officer Role
                    </Text>
                    <View style={[styles.roleList, { borderColor: c.border }]}>
                      <Pressable
                        onPress={() => setSelectedOrgRole(null)}
                        style={[
                          styles.roleOption,
                          { borderBottomWidth: 1, borderBottomColor: c.border },
                          !selectedOrgRole && { backgroundColor: ORG_ADMIN_BLUE + '12' },
                        ]}
                      >
                        <View style={[styles.radioOuter, { borderColor: !selectedOrgRole ? ORG_ADMIN_BLUE : c.border }]}>
                          {!selectedOrgRole && <View style={[styles.radioInner, { backgroundColor: ORG_ADMIN_BLUE }]} />}
                        </View>
                        <Text size="sm" color={!selectedOrgRole ? ORG_ADMIN_BLUE : c.text}>No specific role</Text>
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
                              active && { backgroundColor: ORG_ADMIN_BLUE + '12' },
                            ]}
                          >
                            <View style={[styles.radioOuter, { borderColor: active ? ORG_ADMIN_BLUE : c.border }]}>
                              {active && <View style={[styles.radioInner, { backgroundColor: ORG_ADMIN_BLUE }]} />}
                            </View>
                            <View style={[styles.roleColorDot, { backgroundColor: or.color }]} />
                            <Text size="sm" weight={active ? 'medium' : 'regular'}
                              color={active ? ORG_ADMIN_BLUE : c.text}>
                              {or.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}

                {/* Org admin warning */}
                {selectedRole === 'org_admin' && (
                  <View style={{ backgroundColor: '#E26B4A12', borderWidth: 1, borderColor: '#E26B4A40', borderRadius: 10, padding: 12, flexDirection: 'row', gap: 8 }}>
                    <Ionicons name="warning-outline" size={15} color="#E26B4A" style={{ marginTop: 1 }} />
                    <Text size="xs" color="#E26B4A" style={{ flex: 1, lineHeight: 18 }}>
                      Promoting to Org Admin grants organization-wide access. This member will be able to manage all chapters, members, and settings.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ── Move tab ── */}
            {tab === 'move' && (
              <View style={{ paddingTop: 16 }}>
                {otherChapters.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text size="sm" color={c.textMuted}>No other chapters available.</Text>
                  </View>
                ) : (
                  <View style={[styles.roleList, { borderColor: c.border }]}>
                    {otherChapters.map((ch, i) => {
                      const selected = selectedChapter === ch.id;
                      return (
                        <Pressable
                          key={ch.id}
                          onPress={() => setSelectedChapter(ch.id)}
                          style={[
                            styles.roleOption,
                            i < otherChapters.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
                            selected && { backgroundColor: ORG_ADMIN_BLUE + '12' },
                          ]}
                        >
                          <View style={[{ width: 12, height: 12, borderRadius: 6, backgroundColor: ch.primary_color ?? ORG_ADMIN_BLUE }]} />
                          <View style={{ flex: 1 }}>
                            <Text size="sm" weight={selected ? 'medium' : 'regular'}
                              color={selected ? ORG_ADMIN_BLUE : c.text}>
                              {ch.name}
                            </Text>
                            {ch.institution && (
                              <Text size="xs" color={c.textSubtle}>{ch.institution}</Text>
                            )}
                          </View>
                          <View style={[styles.radioOuter, { borderColor: selected ? ORG_ADMIN_BLUE : c.border }]}>
                            {selected && <View style={[styles.radioInner, { backgroundColor: ORG_ADMIN_BLUE }]} />}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={[styles.modalActions, { marginTop: 20 }]}>
            <Pressable
              onPress={onClose}
              style={[styles.cancelBtn, { borderColor: c.border }]}
            >
              <Text size="sm" weight="medium">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving || (tab === 'move' && !chapterChanged)}
              style={[
                styles.saveBtn,
                { backgroundColor: (tab === 'move' && !chapterChanged) ? c.surfaceAlt : ORG_ADMIN_BLUE },
              ]}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text size="sm" weight="bold" style={{ color: '#fff' }}>
                    {tab === 'role' ? 'Save Role' : 'Move Member'}
                  </Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberItem({
  member,
  onManage,
}: {
  member:   MemberRow;
  onManage: (m: MemberRow) => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const profile    = member.profiles;
  const firstName  = profile?.first_name ?? '';
  const lastName   = profile?.last_name  ?? '';
  const initials   = firstName && lastName ? `${firstName[0]}${lastName[0]}` : '?';
  const fullName   = `${firstName} ${lastName}`.trim() || 'Unknown';
  const badgeColor = ROLE_COLOR[member.role] ?? '#6B7280';

  const roleLabel = member.org_roles
    ? member.org_roles.name
    : member.role.charAt(0).toUpperCase() + member.role.slice(1).replace('_', ' ');

  return (
    <Pressable
      onPress={() => onManage(member)}
      style={({ pressed }) => [
        styles.memberRow,
        { borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
        <Text size="xs" weight="medium" color={c.textMuted}>{initials}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text size="sm" weight="medium">{fullName}</Text>
        <Text size="xs" color={c.textMuted}>{profile?.email ?? '—'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
          <Ionicons name="business-outline" size={11} color={c.textSubtle} />
          <Text size="xs" color={c.textSubtle}>{member.organizations?.name ?? '—'}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={[styles.rolePill, { backgroundColor: badgeColor + '18', borderColor: badgeColor }]}>
          {member.org_roles && (
            <View style={[styles.roleColorDot, { backgroundColor: member.org_roles.color }]} />
          )}
          <Text size="xs" weight="medium" color={badgeColor}>{roleLabel}</Text>
        </View>
        <Ionicons name="chevron-forward-outline" size={16} color={c.textSubtle} />
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const ROLE_FILTERS = ['All', 'Org Admins', 'Admins', 'Officers', 'Members'] as const;
type RoleFilter = typeof ROLE_FILTERS[number];

export default function OrgAdminMembersScreen() {
  const { theme }        = useThemeStore();
  const insets           = useSafeAreaInsets();
  const { width }        = useWindowDimensions();
  const isWide           = width >= 800;
  const { organization } = useAuthStore();

  const [chapters, setChapters]       = useState<Chapter[]>([]);
  const [orgRoles, setOrgRoles]       = useState<OrgRole[]>([]);
  const [members, setMembers]         = useState<MemberRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefresh]      = useState(false);
  const [chapterFilter, setChFilter]  = useState<string>('all');
  const [roleFilter, setRoleFilter]   = useState<RoleFilter>('All');
  const [managing, setManaging]       = useState<MemberRow | null>(null);
  const [saving, setSaving]           = useState(false);

  const orgId = organization?.id;

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    // Fetch chapters + org-level roles in parallel
    const [chaptersRes, rolesRes] = await Promise.all([
      supabase
        .from('organizations')
        .select('id, name, institution, primary_color')
        .eq('parent_org_id', orgId)
        .eq('is_deleted', false)
        .order('name'),
      supabase
        .from('org_roles')
        .select('id, name, color')
        .eq('org_id', orgId)
        .order('name'),
    ]);

    const chaps = (chaptersRes.data as Chapter[]) ?? [];
    setChapters(chaps);
    setOrgRoles((rolesRes.data as OrgRole[]) ?? []);

    if (chaps.length === 0) {
      setLoading(false);
      setRefresh(false);
      return;
    }

    // Fetch all members across all chapters
    const { data: membersData } = await supabase
      .from('memberships')
      .select(`
        id, role, status, org_id, joined_at, custom_role_id,
        profiles!user_id(id, first_name, last_name, email),
        organizations!org_id(id, name),
        org_roles!custom_role_id(id, name, color)
      `)
      .in('org_id', chaps.map((c) => c.id))
      .eq('is_deleted', false)
      .order('role');

    // Deduplicate by profile ID — keep the row with the highest-privilege role.
    // A person in multiple chapters would otherwise appear once per chapter.
    const ROLE_RANK: Record<string, number> = {
      org_admin: 5, admin: 4, officer: 3, member: 2, new_member: 1,
    };
    // Normalize: Supabase may return related rows as arrays when FK direction is ambiguous
    const normalized: MemberRow[] = ((membersData ?? []) as any[]).map((m) => ({
      ...m,
      profiles:      Array.isArray(m.profiles)      ? (m.profiles[0]      ?? null) : m.profiles,
      organizations: Array.isArray(m.organizations) ? (m.organizations[0] ?? null) : m.organizations,
      org_roles:     Array.isArray(m.org_roles)     ? (m.org_roles[0]     ?? null) : m.org_roles,
    }));

    const byProfile = new Map<string, MemberRow>();
    for (const row of normalized) {
      const pid = row.profiles?.id ?? row.id;
      const existing = byProfile.get(pid);
      if (!existing || (ROLE_RANK[row.role] ?? 0) > (ROLE_RANK[existing.role] ?? 0)) {
        byProfile.set(pid, row);
      }
    }
    setMembers(Array.from(byProfile.values()));
    setLoading(false);
    setRefresh(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(
    memberId: string,
    role: string,
    customRoleId: string | null,
    toChapterId: string | null,
  ) {
    setSaving(true);

    if (toChapterId) {
      // Move chapter
      const { error } = await supabase
        .from('memberships')
        .update({ org_id: toChapterId, role: 'member', custom_role_id: null })
        .eq('id', memberId);
      if (error) Alert.alert('Error', error.message);
    } else {
      // Change role
      const { error } = await supabase
        .from('memberships')
        .update({ role, custom_role_id: customRoleId })
        .eq('id', memberId);
      if (error) Alert.alert('Error', error.message);
    }

    await load();
    setSaving(false);
    setManaging(null);
  }

  const c = theme.colors;

  // Apply chapter + role filters
  const filtered = members.filter((m) => {
    const chapterOk = chapterFilter === 'all' || m.org_id === chapterFilter;
    const roleOk =
      roleFilter === 'All'       ? true
      : roleFilter === 'Org Admins' ? m.role === 'org_admin'
      : roleFilter === 'Admins'  ? m.role === 'admin'
      : roleFilter === 'Officers'? m.role === 'officer'
      : m.role === 'member' || m.role === 'new_member';
    return chapterOk && roleOk;
  });

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
          <Text size="xxl" weight="bold">Members</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {filtered.length} member{filtered.length !== 1 ? 's' : ''} across {chapters.length} chapter{chapters.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Chapter filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={{ flexShrink: 0, flexGrow: 0, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}
      >
        <Pressable
          onPress={() => setChFilter('all')}
          style={[
            styles.filterChip,
            { borderColor: chapterFilter === 'all' ? ORG_ADMIN_BLUE : c.border,
              backgroundColor: chapterFilter === 'all' ? ORG_ADMIN_BLUE + '14' : 'transparent' },
          ]}
        >
          <Text size="xs" weight={chapterFilter === 'all' ? 'medium' : 'regular'}
            color={chapterFilter === 'all' ? ORG_ADMIN_BLUE : c.textMuted}>
            All chapters
          </Text>
        </Pressable>
        {chapters.map((ch) => {
          const active = chapterFilter === ch.id;
          return (
            <Pressable
              key={ch.id}
              onPress={() => setChFilter(ch.id)}
              style={[
                styles.filterChip,
                { borderColor: active ? ORG_ADMIN_BLUE : c.border,
                  backgroundColor: active ? ORG_ADMIN_BLUE + '14' : 'transparent' },
              ]}
            >
              <View style={[styles.filterDot, { backgroundColor: ch.primary_color ?? ORG_ADMIN_BLUE }]} />
              <Text size="xs" weight={active ? 'medium' : 'regular'}
                color={active ? ORG_ADMIN_BLUE : c.textMuted}>
                {ch.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Role filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={{ flexShrink: 0, flexGrow: 0, backgroundColor: c.background, borderBottomWidth: 1, borderBottomColor: c.border }}
      >
        {ROLE_FILTERS.map((f) => {
          const active = roleFilter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setRoleFilter(f)}
              style={[
                styles.filterChipSm,
                { borderColor: active ? ORG_ADMIN_BLUE : c.border,
                  backgroundColor: active ? ORG_ADMIN_BLUE + '14' : 'transparent' },
              ]}
            >
              <Text size="xs" weight={active ? 'medium' : 'regular'}
                color={active ? ORG_ADMIN_BLUE : c.textMuted}>
                {f}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide, !isWide && { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefresh(true); load(); }} tintColor={ORG_ADMIN_BLUE} />
        }
        showsVerticalScrollIndicator={false}
      >
        {chapters.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>No chapters yet</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>No members found</Text>
          </View>
        ) : (
          <Card style={{ paddingVertical: 0 }}>
            {filtered.map((m, i) => (
              <View
                key={m.id}
                style={i < filtered.length - 1 ? { borderBottomWidth: 1, borderBottomColor: c.border } : undefined}
              >
                <MemberItem member={m} onManage={setManaging} />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      <ManageMemberModal
        visible={!!managing}
        member={managing}
        chapters={chapters}
        orgRoles={orgRoles}
        onClose={() => setManaging(null)}
        onSave={handleSave}
        saving={saving}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },

  filterRow:    { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6, gap: 8, alignItems: 'center' },
  filterChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  filterChipSm: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  filterDot:    { width: 8, height: 8, borderRadius: 4 },

  scroll:     { padding: 20, paddingBottom: 48, gap: 14 },
  scrollWide: { paddingHorizontal: 48, maxWidth: 760, alignSelf: 'center', width: '100%' },

  memberRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  avatar:       { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rolePill:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  roleColorDot: { width: 8, height: 8, borderRadius: 4 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '90%' },
  handle:       { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },

  memberHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 20 },
  avatarLg:     { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  divider:      { height: 1, marginBottom: 0 },

  tabRow:   { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 0 },
  tabBtn:   { flex: 1, alignItems: 'center', paddingVertical: 12 },

  roleList:   { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  roleOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5 },

  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn:    { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  saveBtn:      { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
});
