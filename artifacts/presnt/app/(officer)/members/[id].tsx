/**
 * Officer — Member Detail  /(officer)/members/:id
 *
 * Shows profile, membership status, dues summary, active restrictions,
 * and attendance/points snapshot for the selected member.
 *
 * MANAGE_MEMBERS → can apply / lift restrictions, record dues payments.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
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
import { usePermissions } from '@/hooks/usePermissions';
import { PERMISSIONS } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';

const DESKTOP = 768;

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberDetail = {
  id:            string;
  role:          string;
  status:        string;
  dues_status:   string;
  dues_hold:     boolean | null;
  dues_balance:  string | null;
  is_blocked:    boolean | null;
  block_reason:  string | null;
  can_attend_events:  boolean | null;
  can_rsvp_events:    boolean | null;
  can_submit_excuses: boolean | null;
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
    avatar_url:      string | null;
  } | null;
};

type Restriction = {
  id:               string;
  restriction_type: string;
  reason:           string;
  internal_note:    string | null;
  is_active:        boolean;
  starts_at:        string;
  ends_at:          string | null;
  auto_lift_condition: string | null;
  lifted_at:        string | null;
  lift_reason:      string | null;
};

type DuesBalance = {
  id:           string;
  amount_due:   string;
  amount_paid:  string;
  amount_waived:string;
  status:       string;
  due_date:     string | null;
  term_id:      string | null;
};

type AttendanceSummary = {
  total:   number;
  present: number;
  excused: number;
  absent:  number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function restrictionLabel(type: string) {
  switch (type) {
    case 'dues_hold':     return 'Dues Hold';
    case 'manual_block':  return 'Manual Block';
    case 'suspension':    return 'Suspension';
    case 'probation':     return 'Probation';
    case 'inactive':      return 'Inactive';
    default:              return type;
  }
}

function restrictionColor(type: string) {
  switch (type) {
    case 'dues_hold':    return '#F59E0B';
    case 'manual_block': return '#EF4444';
    case 'suspension':   return '#EF4444';
    case 'probation':    return '#F97316';
    default:             return '#6B7280';
  }
}

function duesStatusColor(status: string) {
  switch (status) {
    case 'paid':    return '#22C55E';
    case 'partial': return '#EAB308';
    case 'overdue': return '#EF4444';
    case 'waived':  return '#6B7280';
    default:        return '#6B7280';
  }
}

// ─── Section Headers ──────────────────────────────────────────────────────────

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  return (
    <View style={[sh.row, { borderBottomColor: c.border }]}>
      <Text size="xs" weight="semibold" color={c.textSubtle} style={sh.label}>{title}</Text>
      {action}
    </View>
  );
}

const sh = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, marginBottom: 12, borderBottomWidth: 1 },
  label: { textTransform: 'uppercase', letterSpacing: 0.8 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MemberDetailScreen() {
  const { id: membershipId }   = useLocalSearchParams<{ id: string }>();
  const { theme }              = useThemeStore();
  const insets                 = useSafeAreaInsets();
  const { width }              = useWindowDimensions();
  const isWide                 = width >= DESKTOP;
  const { membership, profile } = useAuthStore();
  const userView               = useUserViewStore((s) => s.session);
  const { can }                = usePermissions();
  const c                      = theme.colors;

  const orgId      = userView?.org.id ?? membership?.org_id ?? '';
  const viewPerms  = userView?.role === 'officer' ? userView.permissions : null;
  const hasPerm    = (p: string) => viewPerms ? viewPerms.includes(p) : can(p as any);
  const canManage  = hasPerm(PERMISSIONS.MANAGE_MEMBERS);

  const [member,       setMember]       = useState<MemberDetail | null>(null);
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [dues,         setDues]         = useState<DuesBalance[]>([]);
  const [attendance,   setAttendance]   = useState<AttendanceSummary>({ total: 0, present: 0, excused: 0, absent: 0 });
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [liftingId,    setLiftingId]    = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!membershipId || !orgId) { setLoading(false); return; }

    const [memberRes, restrictionsRes, duesRes, attendanceRes] = await Promise.all([
      supabase
        .from('memberships')
        .select(`id, role, status, dues_status, dues_hold, dues_balance, is_blocked, block_reason,
                 can_attend_events, can_rsvp_events, can_submit_excuses, joined_at, member_number, user_id,
                 profiles!user_id(id, first_name, last_name, email, phone, major, graduation_year, avatar_url)`)
        .eq('id', membershipId)
        .eq('org_id', orgId)
        .single(),

      (supabase as any)
        .from('member_restrictions')
        .select('id, restriction_type, reason, internal_note, is_active, starts_at, ends_at, auto_lift_condition, lifted_at, lift_reason')
        .eq('membership_id', membershipId)
        .order('created_at', { ascending: false }),

      (supabase as any)
        .from('dues_balances')
        .select('id, amount_due, amount_paid, amount_waived, status, due_date, term_id')
        .eq('membership_id', membershipId)
        .order('created_at', { ascending: false }),

      (supabase as any)
        .from('attendance_records')
        .select('status')
        .eq('membership_id', membershipId),
    ]);

    setMember((memberRes.data ?? null) as MemberDetail | null);
    setRestrictions((restrictionsRes.data ?? []) as Restriction[]);
    setDues((duesRes.data ?? []) as DuesBalance[]);

    if (attendanceRes.data) {
      const records = attendanceRes.data as { status: string }[];
      setAttendance({
        total:   records.length,
        present: records.filter(r => r.status === 'present').length,
        excused: records.filter(r => r.status === 'excused').length,
        absent:  records.filter(r => r.status === 'absent').length,
      });
    }

    setLoading(false);
    setRefreshing(false);
  }, [membershipId, orgId]);

  useEffect(() => { load(); }, [load]);

  async function liftRestriction(restriction: Restriction) {
    Alert.alert(
      'Lift Restriction',
      `Remove "${restrictionLabel(restriction.restriction_type)}"? Reason: ${restriction.reason}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lift',
          onPress: async () => {
            setLiftingId(restriction.id);
            await (supabase as any)
              .from('member_restrictions')
              .update({ is_active: false, lifted_at: new Date().toISOString(), lifted_by: profile?.id, lift_reason: 'Lifted by officer' })
              .eq('id', restriction.id);

            // Sync membership flags
            const remaining = restrictions.filter(r => r.id !== restriction.id && r.is_active);
            await supabase
              .from('memberships')
              .update({
                can_attend_events:  !remaining.some(r => r.restriction_type !== 'dues_hold'),
                dues_hold:          remaining.some(r => r.restriction_type === 'dues_hold'),
              })
              .eq('id', membershipId);

            setLiftingId(null);
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

  const p = member.profiles;
  const name = p ? `${p.first_name} ${p.last_name}` : 'Unknown';
  const activeRestrictions = restrictions.filter(r => r.is_active);
  const pastRestrictions   = restrictions.filter(r => !r.is_active);

  const totalDue  = dues.reduce((s, d) => s + parseFloat(d.amount_due  ?? '0'), 0);
  const totalPaid = dues.reduce((s, d) => s + parseFloat(d.amount_paid ?? '0'), 0);
  const balance   = totalDue - totalPaid;

  const content = (
    <ScrollView
      contentContainerStyle={[xs.scroll, { paddingBottom: insets.bottom + 32 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Profile Card ────────────────────────────────────────────── */}
      <Card style={xs.profileCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={[xs.avatar, { backgroundColor: c.surfaceAlt }]}>
            <Text size="lg" weight="bold" color={c.textMuted}>{p ? `${p.first_name[0]}${p.last_name[0]}` : '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text size="lg" weight="bold">{name}</Text>
            <Text size="sm" color={c.textMuted}>{p?.email}</Text>
            {p?.major && <Text size="xs" color={c.textSubtle}>{p.major} {p.graduation_year ? `· Class of ${p.graduation_year}` : ''}</Text>}
          </View>
          {canManage && (
            <Pressable
              onPress={() => router.push(`/(officer)/members/${membershipId}/restrict` as any)}
              style={[xs.restrictBtn, { backgroundColor: '#EF444418', borderColor: '#EF444440' }]}
            >
              <Ionicons name="ban-outline" size={14} color="#EF4444" />
              <Text size="sm" weight="medium" color="#EF4444">Restrict</Text>
            </Pressable>
          )}
        </View>

        {/* Meta row */}
        <View style={[xs.metaRow, { borderTopColor: c.border }]}>
          {[
            ['Role',    member.role.charAt(0).toUpperCase() + member.role.slice(1)],
            ['Joined',  fmtDate(member.joined_at)],
            ['#',       member.member_number ?? '—'],
          ].map(([label, val]) => (
            <View key={label} style={xs.metaItem}>
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
                <View key={r.id} style={[xs.restrictionCard, { backgroundColor: rc + '12', borderColor: rc + '40' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={[xs.typeBadge, { backgroundColor: rc + '20', borderColor: rc }]}>
                      <Text size="xs" weight="semibold" color={rc}>{restrictionLabel(r.restriction_type)}</Text>
                    </View>
                    <Text size="xs" color={c.textSubtle}>Since {fmtDate(r.starts_at)}</Text>
                  </View>
                  <Text size="sm" color={c.text}>{r.reason}</Text>
                  {r.internal_note && (
                    <Text size="xs" color={c.textMuted} style={{ marginTop: 4 }}>Note: {r.internal_note}</Text>
                  )}
                  {r.auto_lift_condition && (
                    <Text size="xs" color={c.textSubtle} style={{ marginTop: 4 }}>
                      Auto-lift: {r.auto_lift_condition.replace('_', ' ')}
                    </Text>
                  )}
                  {canManage && (
                    liftingId === r.id ? (
                      <ActivityIndicator size="small" color={rc} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
                    ) : (
                      <Pressable onPress={() => liftRestriction(r)} style={[xs.liftBtn, { borderColor: rc + '60' }]}>
                        <Ionicons name="checkmark-circle-outline" size={14} color={rc} />
                        <Text size="xs" weight="medium" color={rc}>Lift restriction</Text>
                      </Pressable>
                    )
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Attendance Summary ───────────────────────────────────────── */}
      <View style={xs.section}>
        <SectionHeader title="Attendance" />
        <Card style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16 }}>
          {[
            ['Total',   attendance.total,   c.text],
            ['Present', attendance.present, '#22C55E'],
            ['Excused', attendance.excused, '#F59E0B'],
            ['Absent',  attendance.absent,  '#EF4444'],
          ].map(([label, val, color]) => (
            <View key={label as string} style={{ alignItems: 'center' }}>
              <Text size="xl" weight="bold" color={color as string}>{val as number}</Text>
              <Text size="xs" color={c.textSubtle}>{label as string}</Text>
            </View>
          ))}
        </Card>
      </View>

      {/* ── Dues Summary ─────────────────────────────────────────────── */}
      <View style={xs.section}>
        <SectionHeader
          title="Dues"
          action={canManage ? (
            <Pressable onPress={() => router.push(`/(officer)/dues/${membershipId}` as any)}>
              <Text size="xs" color={c.primary}>Manage →</Text>
            </Pressable>
          ) : undefined}
        />
        {dues.length === 0 ? (
          <Text size="sm" color={c.textMuted}>No dues records.</Text>
        ) : (
          <Card style={xs.duesSummary}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View>
                <Text size="xs" color={c.textSubtle}>Outstanding Balance</Text>
                <Text size="xxl" weight="bold" color={balance > 0 ? '#EF4444' : '#22C55E'}>
                  ${balance.toFixed(2)}
                </Text>
              </View>
              <View style={[xs.typeBadge, {
                backgroundColor: duesStatusColor(member.dues_status) + '18',
                borderColor:     duesStatusColor(member.dues_status),
              }]}>
                <Text size="xs" weight="semibold" color={duesStatusColor(member.dues_status)}>
                  {member.dues_status.toUpperCase()}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <View>
                <Text size="xs" color={c.textSubtle}>Charged</Text>
                <Text size="sm" weight="medium">${totalDue.toFixed(2)}</Text>
              </View>
              <View>
                <Text size="xs" color={c.textSubtle}>Paid</Text>
                <Text size="sm" weight="medium" color="#22C55E">${totalPaid.toFixed(2)}</Text>
              </View>
            </View>
            {member.dues_hold && (
              <View style={[xs.holdBanner, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}>
                <Ionicons name="warning-outline" size={14} color="#F59E0B" />
                <Text size="xs" weight="medium" color="#F59E0B">Dues hold active — restricted from events</Text>
              </View>
            )}
          </Card>
        )}
      </View>

      {/* ── Restriction History ──────────────────────────────────────── */}
      {pastRestrictions.length > 0 && (
        <View style={xs.section}>
          <SectionHeader title="Past Restrictions" />
          <View style={{ gap: 6 }}>
            {pastRestrictions.map((r) => (
              <View key={r.id} style={[xs.pastRow, { borderColor: c.border, backgroundColor: c.surface }]}>
                <Text size="sm" weight="medium" color={c.textMuted}>{restrictionLabel(r.restriction_type)}</Text>
                <Text size="xs" color={c.textSubtle}>
                  {fmtDate(r.starts_at)} → {fmtDate(r.lifted_at)}
                </Text>
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
      <View style={[xs.header, {
        paddingTop: isWide ? 20 : insets.top + 12,
        backgroundColor: c.background,
        borderBottomColor: c.border,
      }]}>
        <Pressable onPress={() => router.back()} style={xs.backBtn}>
          <Ionicons name="arrow-back-outline" size={20} color={c.text} />
        </Pressable>
        <Text size="xl" weight="bold" numberOfLines={1}>{name}</Text>
      </View>

      {isWide ? (
        <View style={{ flex: 1, maxWidth: 800, alignSelf: 'center', width: '100%', paddingHorizontal: 24 }}>
          {content}
        </View>
      ) : content}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const xs = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:      { padding: 4 },
  scroll:       { padding: 16, gap: 0 },

  profileCard:  { marginBottom: 0, gap: 0 },
  avatar:       { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  restrictBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  metaRow:      { flexDirection: 'row', paddingTop: 14, marginTop: 14, borderTopWidth: 1, gap: 24 },
  metaItem:     { gap: 2 },

  section:      { marginTop: 20, gap: 0 },

  restrictionCard: { borderWidth: 1, borderRadius: 12, padding: 14 },
  typeBadge:       { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  liftBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 10, alignSelf: 'flex-start' },

  duesSummary: { gap: 0 },
  holdBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 12 },

  pastRow:     { borderWidth: 1, borderRadius: 10, padding: 12, gap: 2 },
});
