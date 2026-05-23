/**
 * Admin — Member Detail  /(admin)/members/:id
 *
 * Shows profile, role assignment, block toggle, attendance summary,
 * dues summary, active restrictions, and restriction history.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
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

const DESKTOP = 768;

// ─── Types ────────────────────────────────────────────────────────────────────

type OrgRole = Pick<Tables<'org_roles'>, 'id' | 'name' | 'color'>;

type MemberDetail = {
  id:            string;
  role:          string;
  status:        string;
  custom_role_id:string | null;
  dues_status:   string;
  dues_hold:     boolean | null;
  dues_balance:  string | null;
  is_blocked:    boolean | null;
  block_reason:  string | null;
  joined_at:     string | null;
  member_number: string | null;
  user_id:       string;
  profiles: {
    id:              string;
    first_name:      string;
    last_name:       string;
    email:           string;
    phone:           string | null;
    major:           string | null;
    graduation_year: number | null;
  } | null;
  org_roles: OrgRole | null;
};

type Restriction = {
  id:               string;
  restriction_type: string;
  reason:           string;
  internal_note:    string | null;
  is_active:        boolean;
  starts_at:        string;
  ends_at:          string | null;
  lifted_at:        string | null;
  lift_reason:      string | null;
};

type DuesBalance = {
  id:            string;
  amount_due:    string;
  amount_paid:   string;
  amount_waived: string;
  status:        string;
  due_date:      string | null;
};

type AttSummary = { total: number; present: number; excused: number; absent: number };

const ASSIGNABLE_ROLES = [
  { value: 'admin',      label: 'Admin',      description: 'Full chapter management' },
  { value: 'officer',    label: 'Officer',    description: 'Custom permissions' },
  { value: 'member',     label: 'Member',     description: 'Standard member access' },
  { value: 'new_member', label: 'New Member', description: 'Probationary access' },
] as const;

const ROLE_COLOR: Record<string, string> = {
  org_admin: '#E26B4A', admin: '#E26B4A', officer: '#A855F7',
  member: '#3B82F6', new_member: '#6B7280',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function duesColor(s: string) {
  return s === 'paid' ? '#22C55E' : s === 'partial' ? '#EAB308' : s === 'overdue' ? '#EF4444' : '#6B7280';
}

function restrictionColor(type: string) {
  return type === 'dues_hold' ? '#F59E0B'
    : type === 'suspension' || type === 'manual_block' ? '#EF4444'
    : type === 'probation' ? '#F97316'
    : '#6B7280';
}

function restrictionLabel(type: string) {
  const map: Record<string, string> = {
    dues_hold: 'Dues Hold', manual_block: 'Manual Block',
    suspension: 'Suspension', probation: 'Probation', inactive: 'Inactive',
  };
  return map[type] ?? type;
}

// ─── Role Modal ───────────────────────────────────────────────────────────────

function RoleModal({
  visible, member, orgRoles, myRole, saving,
  onClose, onSave,
}: {
  visible: boolean; member: MemberDetail | null; orgRoles: OrgRole[];
  myRole: string; saving: boolean;
  onClose: () => void;
  onSave: (role: string, customRoleId: string | null) => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [role, setRole]         = useState('member');
  const [orgRole, setOrgRole]   = useState<string | null>(null);

  useEffect(() => {
    if (member) { setRole(member.role); setOrgRole(member.custom_role_id); }
  }, [member]);

  if (!member) return null;
  const canAssignAdmin = myRole === 'org_admin';
  const filteredRoles  = ASSIGNABLE_ROLES.filter(r => r.value !== 'admin' || canAssignAdmin);

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={rm.overlay}>
        <View style={[rm.sheet, { backgroundColor: c.surface }]}>
          <View style={[rm.handle, { backgroundColor: c.border }]} />
          <Text size="lg" weight="bold" style={{ marginBottom: 4 }}>Change Role</Text>
          <Text size="sm" color={c.textMuted} style={{ marginBottom: 20 }}>
            {member.profiles?.first_name} {member.profiles?.last_name}
          </Text>

          <View style={[rm.list, { borderColor: c.border }]}>
            {filteredRoles.map((r, i) => {
              const active = role === r.value;
              return (
                <Pressable key={r.value} onPress={() => { setRole(r.value); if (r.value !== 'officer') setOrgRole(null); }}
                  style={[rm.option, i < filteredRoles.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }, active && { backgroundColor: c.primary + '12' }]}>
                  <View style={[rm.radioOuter, { borderColor: active ? c.primary : c.border }]}>
                    {active && <View style={[rm.radioInner, { backgroundColor: c.primary }]} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text size="sm" weight={active ? 'medium' : 'regular'} color={active ? c.primary : c.text}>{r.label}</Text>
                    <Text size="xs" color={c.textSubtle}>{r.description}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {role === 'officer' && orgRoles.length > 0 && (
            <>
              <Text size="xs" weight="medium" color={c.textMuted}
                style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 10 }}>
                Officer Role
              </Text>
              <View style={[rm.list, { borderColor: c.border }]}>
                <Pressable onPress={() => setOrgRole(null)}
                  style={[rm.option, { borderBottomWidth: 1, borderBottomColor: c.border }, !orgRole && { backgroundColor: c.primary + '12' }]}>
                  <View style={[rm.radioOuter, { borderColor: !orgRole ? c.primary : c.border }]}>
                    {!orgRole && <View style={[rm.radioInner, { backgroundColor: c.primary }]} />}
                  </View>
                  <Text size="sm" color={!orgRole ? c.primary : c.text}>No specific role</Text>
                </Pressable>
                {orgRoles.map((or, i) => {
                  const active = orgRole === or.id;
                  return (
                    <Pressable key={or.id} onPress={() => setOrgRole(or.id)}
                      style={[rm.option, i < orgRoles.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }, active && { backgroundColor: c.primary + '12' }]}>
                      <View style={[rm.radioOuter, { borderColor: active ? c.primary : c.border }]}>
                        {active && <View style={[rm.radioInner, { backgroundColor: c.primary }]} />}
                      </View>
                      <View style={[rm.dot, { backgroundColor: or.color }]} />
                      <Text size="sm" weight={active ? 'medium' : 'regular'} color={active ? c.primary : c.text}>{or.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <View style={[rm.actions, { marginTop: 24 }]}>
            <Pressable onPress={onClose} style={[rm.cancelBtn, { borderColor: c.border }]}>
              <Text size="sm" weight="medium">Cancel</Text>
            </Pressable>
            <Pressable onPress={() => onSave(role, orgRole)} style={[rm.saveBtn, { backgroundColor: c.primary }]}>
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

const rm = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:      { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '88%' },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  list:       { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  option:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  dot:        { width: 8, height: 8, borderRadius: 4 },
  actions:    { flexDirection: 'row', gap: 12 },
  cancelBtn:  { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  saveBtn:    { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
});

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text size="xs" weight="semibold" color={c.textSubtle} style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>{title}</Text>
      {action}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminMemberDetailScreen() {
  const { id: membershipId }          = useLocalSearchParams<{ id: string }>();
  const { theme }                     = useThemeStore();
  const insets                        = useSafeAreaInsets();
  const { width }                     = useWindowDimensions();
  const isWide                        = width >= DESKTOP;
  const { membership, profile }       = useAuthStore();
  const c                             = theme.colors;

  const orgId  = membership?.org_id ?? '';
  const myRole = membership?.role ?? 'admin';

  const [member,       setMember]       = useState<MemberDetail | null>(null);
  const [orgRoles,     setOrgRoles]     = useState<OrgRole[]>([]);
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [dues,         setDues]         = useState<DuesBalance[]>([]);
  const [attendance,   setAttendance]   = useState<AttSummary>({ total: 0, present: 0, excused: 0, absent: 0 });
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [roleModal,    setRoleModal]    = useState(false);
  const [savingRole,   setSavingRole]   = useState(false);
  const [savingBlock,  setSavingBlock]  = useState(false);

  const load = useCallback(async () => {
    if (!membershipId || !orgId) { setLoading(false); return; }

    const [memberRes, rolesRes, restrictRes, duesRes, attRes] = await Promise.all([
      supabase
        .from('memberships')
        .select(`id, role, status, custom_role_id, dues_status, dues_hold, dues_balance,
                 is_blocked, block_reason, joined_at, member_number, user_id,
                 profiles!user_id(id, first_name, last_name, email, phone, major, graduation_year),
                 org_roles!custom_role_id(id, name, color)`)
        .eq('id', membershipId)
        .eq('org_id', orgId)
        .single(),

      supabase.from('org_roles').select('id, name, color').eq('org_id', orgId).order('name'),

      supabase
        .from('member_restrictions')
        .select('id, restriction_type, reason, internal_note, is_active, starts_at, ends_at, lifted_at, lift_reason')
        .eq('membership_id', membershipId)
        .order('created_at', { ascending: false }),

      supabase
        .from('dues_balances')
        .select('id, amount_due, amount_paid, amount_waived, status, due_date')
        .eq('membership_id', membershipId)
        .order('created_at', { ascending: false }),

      supabase.from('attendance_records').select('status').eq('membership_id', membershipId),
    ]);

    // Normalize array joins
    const raw = memberRes.data as any;
    if (raw) {
      raw.profiles  = Array.isArray(raw.profiles)  ? (raw.profiles[0]  ?? null) : raw.profiles;
      raw.org_roles = Array.isArray(raw.org_roles) ? (raw.org_roles[0] ?? null) : raw.org_roles;
    }

    setMember(raw as MemberDetail | null);
    setOrgRoles((rolesRes.data ?? []) as OrgRole[]);
    setRestrictions((restrictRes.data ?? []) as Restriction[]);
    setDues((duesRes.data ?? []) as DuesBalance[]);

    if (attRes.data) {
      const recs = attRes.data as { status: string }[];
      setAttendance({
        total:   recs.length,
        present: recs.filter(r => r.status === 'present').length,
        excused: recs.filter(r => r.status === 'excused').length,
        absent:  recs.filter(r => r.status === 'absent').length,
      });
    }

    setLoading(false);
    setRefreshing(false);
  }, [membershipId, orgId]);

  useEffect(() => { load(); }, [load]);

  async function handleSaveRole(role: string, customRoleId: string | null) {
    if (!member) return;
    setSavingRole(true);
    await supabase.from('memberships').update({ role, custom_role_id: customRoleId }).eq('id', member.id);
    setSavingRole(false);
    setRoleModal(false);
    await load();
  }

  async function handleToggleBlock() {
    if (!member) return;
    const isBlocked = !!member.is_blocked;
    const action = isBlocked ? 'Unblock' : 'Block';
    Alert.alert(
      `${action} Member`,
      isBlocked
        ? 'Remove the block from this member?'
        : 'Block this member from accessing chapter features?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            setSavingBlock(true);
            await supabase.from('memberships')
              .update(isBlocked ? { is_blocked: false, block_reason: null } : { is_blocked: true })
              .eq('id', member.id);
            setSavingBlock(false);
            await load();
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!member) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text size="md" color={c.textMuted}>Member not found.</Text>
      </View>
    );
  }

  const p    = member.profiles;
  const name = p ? `${p.first_name} ${p.last_name}` : 'Unknown';
  const roleColor  = ROLE_COLOR[member.role] ?? '#6B7280';
  const roleLabel  = member.org_roles
    ? member.org_roles.name
    : member.role.charAt(0).toUpperCase() + member.role.slice(1).replace('_', ' ');

  const activeRestrictions = restrictions.filter(r => r.is_active);
  const pastRestrictions   = restrictions.filter(r => !r.is_active);
  const totalDue   = dues.reduce((s, d) => s + parseFloat(d.amount_due  ?? '0'), 0);
  const totalPaid  = dues.reduce((s, d) => s + parseFloat(d.amount_paid ?? '0') + parseFloat(d.amount_waived ?? '0'), 0);
  const balance    = totalDue - totalPaid;

  const content = (
    <ScrollView
      contentContainerStyle={[xs.scroll, { paddingBottom: insets.bottom + 32 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Profile Card ─────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <View style={[xs.avatar, { backgroundColor: c.surfaceAlt }]}>
            <Text size="lg" weight="bold" color={c.textMuted}>{p ? `${p.first_name[0]}${p.last_name[0]}` : '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text size="lg" weight="bold">{name}</Text>
            <Text size="sm" color={c.textMuted}>{p?.email}</Text>
            {p?.major && <Text size="xs" color={c.textSubtle}>{p.major}{p.graduation_year ? ` · Class of ${p.graduation_year}` : ''}</Text>}
          </View>
        </View>

        {/* Role + block actions */}
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Pressable onPress={() => setRoleModal(true)}
            style={[xs.actionBtn, { backgroundColor: roleColor + '14', borderColor: roleColor + '40' }]}>
            <Ionicons name="shield-outline" size={14} color={roleColor} />
            <Text size="sm" weight="medium" color={roleColor}>{roleLabel}</Text>
            <Ionicons name="chevron-down-outline" size={12} color={roleColor} />
          </Pressable>

          <Pressable onPress={handleToggleBlock} disabled={savingBlock}
            style={[xs.actionBtn, {
              backgroundColor: member.is_blocked ? '#22C55E14' : '#EF444414',
              borderColor:     member.is_blocked ? '#22C55E40' : '#EF444440',
            }]}>
            {savingBlock
              ? <ActivityIndicator size="small" color={member.is_blocked ? '#22C55E' : '#EF4444'} />
              : <>
                  <Ionicons name={member.is_blocked ? 'lock-open-outline' : 'ban-outline'} size={14}
                    color={member.is_blocked ? '#22C55E' : '#EF4444'} />
                  <Text size="sm" weight="medium" color={member.is_blocked ? '#22C55E' : '#EF4444'}>
                    {member.is_blocked ? 'Unblock' : 'Block'}
                  </Text>
                </>}
          </Pressable>
        </View>

        {/* Meta */}
        <View style={[xs.metaRow, { borderTopColor: c.border }]}>
          {[
            ['Joined', fmtDate(member.joined_at)],
            ['Status', member.status.charAt(0).toUpperCase() + member.status.slice(1)],
            ['#',      member.member_number ?? '—'],
          ].map(([label, val]) => (
            <View key={label} style={{ gap: 2 }}>
              <Text size="xs" color={c.textSubtle}>{label}</Text>
              <Text size="sm" weight="medium">{val}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* ── Active Restrictions ──────────────────────────────────────── */}
      {activeRestrictions.length > 0 && (
        <View style={xs.section}>
          <SectionHeader title="Active Restrictions" />
          <View style={{ gap: 8 }}>
            {activeRestrictions.map((r) => {
              const rc = restrictionColor(r.restriction_type);
              return (
                <View key={r.id} style={[xs.restrictCard, { backgroundColor: rc + '12', borderColor: rc + '40' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={[xs.badge, { backgroundColor: rc + '20', borderColor: rc }]}>
                      <Text size="xs" weight="semibold" color={rc}>{restrictionLabel(r.restriction_type)}</Text>
                    </View>
                    <Text size="xs" color={c.textSubtle}>Since {fmtDate(r.starts_at)}</Text>
                  </View>
                  <Text size="sm" color={c.text}>{r.reason}</Text>
                  {r.internal_note && <Text size="xs" color={c.textMuted} style={{ marginTop: 4 }}>Note: {r.internal_note}</Text>}
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Attendance ───────────────────────────────────────────────── */}
      <View style={xs.section}>
        <SectionHeader title="Attendance" />
        <Card style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16 }}>
          {([['Total', attendance.total, c.text], ['Present', attendance.present, '#22C55E'],
             ['Excused', attendance.excused, '#F59E0B'], ['Absent', attendance.absent, '#EF4444']] as const).map(([label, val, color]) => (
            <View key={label} style={{ alignItems: 'center' }}>
              <Text size="xl" weight="bold" color={color}>{val}</Text>
              <Text size="xs" color={c.textSubtle}>{label}</Text>
            </View>
          ))}
        </Card>
      </View>

      {/* ── Dues Summary ─────────────────────────────────────────────── */}
      <View style={xs.section}>
        <SectionHeader
          title="Dues"
          action={
            <Pressable onPress={() => router.push(`/(admin)/dues/${membershipId}` as any)}>
              <Text size="xs" color={c.primary}>Manage →</Text>
            </Pressable>
          }
        />
        {dues.length === 0 ? (
          <Text size="sm" color={c.textMuted}>No dues records.</Text>
        ) : (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View>
                <Text size="xs" color={c.textSubtle}>Outstanding Balance</Text>
                <Text size="xxl" weight="bold" color={balance > 0 ? '#EF4444' : '#22C55E'}>${balance.toFixed(2)}</Text>
              </View>
              <View style={[xs.badge, { backgroundColor: duesColor(member.dues_status) + '18', borderColor: duesColor(member.dues_status) }]}>
                <Text size="xs" weight="semibold" color={duesColor(member.dues_status)}>{member.dues_status.toUpperCase()}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <View><Text size="xs" color={c.textSubtle}>Charged</Text><Text size="sm" weight="medium">${totalDue.toFixed(2)}</Text></View>
              <View><Text size="xs" color={c.textSubtle}>Paid</Text><Text size="sm" weight="medium" color="#22C55E">${totalPaid.toFixed(2)}</Text></View>
            </View>
            {member.dues_hold && (
              <View style={[xs.holdBanner, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}>
                <Ionicons name="warning-outline" size={14} color="#F59E0B" />
                <Text size="xs" weight="medium" color="#F59E0B">Dues hold active</Text>
              </View>
            )}
          </Card>
        )}
      </View>

      {/* ── Past Restrictions ────────────────────────────────────────── */}
      {pastRestrictions.length > 0 && (
        <View style={xs.section}>
          <SectionHeader title="Restriction History" />
          <View style={{ gap: 6 }}>
            {pastRestrictions.map((r) => (
              <View key={r.id} style={[xs.pastRow, { borderColor: c.border, backgroundColor: c.surface }]}>
                <Text size="sm" weight="medium" color={c.textMuted}>{restrictionLabel(r.restriction_type)}</Text>
                <Text size="xs" color={c.textSubtle}>{fmtDate(r.starts_at)} → {fmtDate(r.lifted_at)}</Text>
                {r.lift_reason && <Text size="xs" color={c.textSubtle}>Lifted: {r.lift_reason}</Text>}
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[xs.header, { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.background, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back-outline" size={20} color={c.text} />
        </Pressable>
        <Text size="xl" weight="bold" numberOfLines={1}>{name}</Text>
      </View>

      {isWide ? (
        <View style={{ flex: 1, maxWidth: 800, alignSelf: 'center', width: '100%', paddingHorizontal: 24 }}>
          {content}
        </View>
      ) : content}

      <RoleModal
        visible={roleModal}
        member={member}
        orgRoles={orgRoles}
        myRole={myRole}
        saving={savingRole}
        onClose={() => setRoleModal(false)}
        onSave={handleSaveRole}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const xs = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  scroll:     { padding: 16, gap: 0 },
  avatar:     { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  actionBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  metaRow:    { flexDirection: 'row', paddingTop: 14, marginTop: 14, borderTopWidth: 1, gap: 24 },
  section:    { marginTop: 20 },
  badge:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  restrictCard: { borderWidth: 1, borderRadius: 12, padding: 14 },
  holdBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 12 },
  pastRow:    { borderWidth: 1, borderRadius: 10, padding: 12, gap: 2 },
});
