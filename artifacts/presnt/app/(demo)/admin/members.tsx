/**
 * Demo Admin — Members (read-only)
 *
 * Shows the full member list with role badges.
 * Member rows are non-interactive (no navigation to detail/edit).
 * No promote/demote/remove/invite actions.
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

const ROLE_BADGE_COLOR: Record<string, string> = {
  org_admin:  '#E26B4A',
  admin:      '#E26B4A',
  officer:    '#A855F7',
  member:     '#3B82F6',
  new_member: '#6B7280',
};

// ─── Member row (view-only) ───────────────────────────────────────────────────

function MemberItem({ member }: { member: MemberRow }) {
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
    <View style={[styles.memberRow, { borderBottomColor: c.border }]}>
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
        <Text size="xs" weight="medium" color={c.textMuted}>{initials}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1, gap: 2 }}>
        <Text size="sm" weight="medium">{fullName}</Text>
        <Text size="xs" color={c.textMuted}>{profile?.email ?? '—'}</Text>
      </View>

      {/* Role chip */}
      <View style={[styles.rolePill, { backgroundColor: badgeColor + '18', borderColor: badgeColor }]}>
        {member.org_roles && (
          <View style={[styles.roleColorDot, { backgroundColor: member.org_roles.color }]} />
        )}
        <Text size="xs" weight="medium" color={badgeColor}>{roleLabel}</Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const FILTERS = ['All', 'Admins', 'Officers', 'Members'] as const;
type Filter = typeof FILTERS[number];

export default function DemoAdminMembersScreen() {
  const { theme }    = useThemeStore();
  const insets       = useSafeAreaInsets();
  const { width }    = useWindowDimensions();
  const isWide       = width >= 800;
  const { membership } = useAuthStore();

  const [members, setMembers]     = useState<MemberRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);
  const [filter, setFilter]       = useState<Filter>('All');

  const orgId = membership?.org_id;

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    const { data } = await supabase
      .from('memberships')
      .select(`
        id, role, status, custom_role_id,
        profiles!user_id(id, first_name, last_name, email),
        org_roles!custom_role_id(id, name, color)
      `)
      .eq('org_id', orgId)
      .eq('is_deleted', false)
      .order('role');

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

  const filtered = members.filter((m) => {
    if (filter === 'Admins')   return m.role === 'admin' || m.role === 'org_admin';
    if (filter === 'Officers') return m.role === 'officer';
    if (filter === 'Members')  return m.role === 'member' || m.role === 'new_member';
    return true;
  });

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
        style={{ flexShrink: 0, flexGrow: 0, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}
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
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide, !isWide && { paddingBottom: insets.bottom + 24 }]}
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
                <MemberItem member={m} />
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
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6, gap: 8, alignItems: 'center' },
  filterChip:{ borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  scroll:    { padding: 16, paddingBottom: 48 },
  scrollWide:{ paddingHorizontal: 48, maxWidth: 760, alignSelf: 'center', width: '100%' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  avatar:    { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rolePill:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  roleColorDot: { width: 8, height: 8, borderRadius: 4 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
});
