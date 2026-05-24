/**
 * Member — Account Standing  /(member)/account/standing
 *
 * Shows the member their own:
 *   - Dues balances (what they owe / have paid)
 *   - Active restrictions with explanations
 *   - Compliance snapshot (re-uses status store)
 *
 * Read-only — no actions except linking back.
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

const DESKTOP = 768;

// ─── Types ────────────────────────────────────────────────────────────────────

type DuesBalance = {
  id:            string;
  amount_due:    string;
  amount_paid:   string;
  amount_waived: string;
  status:        string;
  due_date:      string | null;
  notes:         string | null;
};

type Restriction = {
  id:               string;
  restriction_type: string;
  reason:           string;
  starts_at:        string;
  ends_at:          string | null;
  auto_lift_condition: string | null;
  blocks_event_attendance:  boolean | null;
  blocks_event_rsvp:        boolean | null;
  blocks_excuse_submission: boolean | null;
  blocks_voting:            boolean | null;
  blocks_calendar_view:     boolean | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function restrictionLabel(type: string) {
  switch (type) {
    case 'dues_hold':    return 'Dues Hold';
    case 'manual_block': return 'Account Block';
    case 'suspension':   return 'Suspension';
    case 'probation':    return 'Probation';
    case 'inactive':     return 'Inactive';
    default:             return type;
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

function autoLiftLabel(condition: string | null) {
  switch (condition) {
    case 'dues_paid':        return 'This restriction will lift automatically once your dues balance is cleared.';
    case 'officer_approval': return 'Contact an officer to have this restriction reviewed.';
    case 'term_end':         return 'This restriction will lift at the end of the current term.';
    default:                 return 'Contact an officer for more information.';
  }
}

function statusColor(status: string) {
  switch (status) {
    case 'paid':    return '#22C55E';
    case 'partial': return '#EAB308';
    case 'overdue': return '#EF4444';
    case 'waived':  return '#6B7280';
    default:        return '#F97316';
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AccountStandingScreen() {
  const { theme }       = useThemeStore();
  const insets          = useSafeAreaInsets();
  const { width }       = useWindowDimensions();
  const isWide          = width >= DESKTOP;
  const { membership, organization } = useAuthStore();
  const c               = theme.colors;

  const membershipId = membership?.id ?? '';
  const orgId        = organization?.id ?? '';

  const [balances,     setBalances]     = useState<DuesBalance[]>([]);
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  const load = useCallback(async () => {
    if (!membershipId || !orgId) { setLoading(false); return; }

    const [balRes, resRes] = await Promise.all([
      (supabase as any)
        .from('dues_balances')
        .select('id, amount_due, amount_paid, amount_waived, status, due_date, notes')
        .eq('membership_id', membershipId)
        .order('created_at', { ascending: false }),

      (supabase as any)
        .from('member_restrictions')
        .select('id, restriction_type, reason, starts_at, ends_at, auto_lift_condition, blocks_event_attendance, blocks_event_rsvp, blocks_excuse_submission, blocks_voting, blocks_calendar_view')
        .eq('membership_id', membershipId)
        .eq('is_active', true)
        .order('starts_at', { ascending: false }),
    ]);

    setBalances((balRes.data ?? []) as DuesBalance[]);
    setRestrictions((resRes.data ?? []) as Restriction[]);
    setLoading(false);
    setRefreshing(false);
  }, [membershipId, orgId]);

  useEffect(() => { load(); }, [load]);

  const totalDue  = balances.reduce((s, b) => s + parseFloat(b.amount_due ?? '0'), 0);
  const totalPaid = balances.reduce((s, b) => s + parseFloat(b.amount_paid ?? '0') + parseFloat(b.amount_waived ?? '0'), 0);
  const outstanding = totalDue - totalPaid;

  const hasActiveRestrictions = restrictions.length > 0;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  const content = (
    <ScrollView
      contentContainerStyle={[xs.scroll, { paddingBottom: insets.bottom + 40 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Standing summary ──────────────────────────────────── */}
      <Card style={xs.summaryCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={[xs.standingIcon, {
            backgroundColor: hasActiveRestrictions ? '#EF444418' : '#22C55E18',
            borderColor:     hasActiveRestrictions ? '#EF444440' : '#22C55E40',
          }]}>
            <Ionicons
              name={hasActiveRestrictions ? 'warning-outline' : 'shield-checkmark-outline'}
              size={28}
              color={hasActiveRestrictions ? '#EF4444' : '#22C55E'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text size="lg" weight="bold"
              color={hasActiveRestrictions ? '#EF4444' : '#22C55E'}>
              {hasActiveRestrictions ? 'Account Restricted' : 'Account in Good Standing'}
            </Text>
            <Text size="sm" color={c.textMuted}>
              {hasActiveRestrictions
                ? `${restrictions.length} active restriction${restrictions.length > 1 ? 's' : ''}`
                : 'No active restrictions'}
            </Text>
          </View>
        </View>
      </Card>

      {/* ── Active Restrictions ───────────────────────────────── */}
      {restrictions.length > 0 && (
        <View style={xs.section}>
          <Text size="xs" weight="semibold" color={c.textSubtle} style={xs.sectionLabel}>ACTIVE RESTRICTIONS</Text>
          {restrictions.map((r) => {
            const rc = restrictionColor(r.restriction_type);
            const blockedList = [
              r.blocks_event_attendance  && 'Event check-in',
              r.blocks_event_rsvp        && 'Event RSVP',
              r.blocks_excuse_submission && 'Excuse submission',
              r.blocks_voting            && 'Voting',
              r.blocks_calendar_view     && 'Calendar view',
            ].filter(Boolean) as string[];

            return (
              <View key={r.id} style={[xs.restrictionCard, { backgroundColor: rc + '10', borderColor: rc + '40' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={[xs.badge, { backgroundColor: rc + '20', borderColor: rc }]}>
                    <Text size="xs" weight="semibold" color={rc}>{restrictionLabel(r.restriction_type)}</Text>
                  </View>
                  <Text size="xs" color={c.textSubtle}>Since {fmtDate(r.starts_at)}</Text>
                </View>

                <Text size="sm" color={c.text} style={{ marginBottom: 8 }}>{r.reason}</Text>

                {blockedList.length > 0 && (
                  <View style={[xs.blockedBox, { backgroundColor: c.background, borderColor: c.border }]}>
                    <Text size="xs" weight="semibold" color={c.textSubtle} style={{ marginBottom: 4 }}>RESTRICTED FROM:</Text>
                    {blockedList.map((b) => (
                      <View key={b} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="close-circle-outline" size={12} color={rc} />
                        <Text size="xs" color={c.textMuted}>{b}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {r.ends_at && (
                  <Text size="xs" color={c.textMuted} style={{ marginTop: 6 }}>
                    Expires: {fmtDate(r.ends_at)}
                  </Text>
                )}

                <View style={[xs.liftInfo, { borderColor: rc + '30', backgroundColor: rc + '08' }]}>
                  <Ionicons name="information-circle-outline" size={14} color={rc} />
                  <Text size="xs" color={c.textMuted} style={{ flex: 1 }}>
                    {autoLiftLabel(r.auto_lift_condition)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Dues ─────────────────────────────────────────────── */}
      <View style={xs.section}>
        <Text size="xs" weight="semibold" color={c.textSubtle} style={xs.sectionLabel}>DUES</Text>
        {balances.length === 0 ? (
          <Card>
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Ionicons name="checkmark-circle-outline" size={36} color="#22C55E" />
              <Text size="md" color={c.textMuted} style={{ marginTop: 8 }}>No dues records.</Text>
            </View>
          </Card>
        ) : (
          <>
            {/* Summary */}
            <Card style={xs.duesSummary}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text size="xs" color={c.textSubtle}>Total Outstanding</Text>
                <Text size="xl" weight="bold" color={outstanding > 0 ? '#EF4444' : '#22C55E'}>
                  ${outstanding.toFixed(2)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 20 }}>
                <View>
                  <Text size="xs" color={c.textSubtle}>Total Charged</Text>
                  <Text size="sm" weight="medium">${totalDue.toFixed(2)}</Text>
                </View>
                <View>
                  <Text size="xs" color={c.textSubtle}>Total Paid</Text>
                  <Text size="sm" weight="medium" color="#22C55E">${totalPaid.toFixed(2)}</Text>
                </View>
              </View>
            </Card>

            {/* Individual balances */}
            {balances.map((bal) => {
              const balAmt = parseFloat(bal.amount_due ?? '0') - parseFloat(bal.amount_paid ?? '0') - parseFloat(bal.amount_waived ?? '0');
              const sc = statusColor(bal.status);
              return (
                <View key={bal.id} style={[xs.balRow, { borderColor: c.border, backgroundColor: c.surface }]}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text size="md" weight="semibold">${balAmt.toFixed(2)}</Text>
                      <View style={[xs.badge, { backgroundColor: sc + '18', borderColor: sc }]}>
                        <Text size="xs" weight="medium" color={sc}>
                          {bal.status.charAt(0).toUpperCase() + bal.status.slice(1)}
                        </Text>
                      </View>
                    </View>
                    <Text size="xs" color={c.textMuted}>
                      Due {fmtDate(bal.due_date)}
                      {bal.amount_paid && parseFloat(bal.amount_paid) > 0
                        ? ` · $${bal.amount_paid} paid`
                        : ''}
                    </Text>
                    {bal.notes && <Text size="xs" color={c.textSubtle}>{bal.notes}</Text>}
                  </View>
                </View>
              );
            })}

            {outstanding > 0 && (
              <View style={[xs.payInfo, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}>
                <Ionicons name="information-circle-outline" size={16} color="#F59E0B" />
                <Text size="sm" color={c.textMuted} style={{ flex: 1 }}>
                  To pay your dues or set up a payment plan, contact an officer or treasurer.
                </Text>
              </View>
            )}
          </>
        )}
      </View>
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
        <View>
          <Text size="xl" weight="bold">Account Standing</Text>
        </View>
      </View>

      {isWide ? (
        <View style={{ flex: 1, maxWidth: 720, alignSelf: 'center', width: '100%', paddingHorizontal: 24 }}>
          {content}
        </View>
      ) : content}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const xs = StyleSheet.create({
  header:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:  { padding: 4 },
  scroll:   { padding: 16, gap: 0 },

  summaryCard:  { marginBottom: 0 },
  standingIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  section:      { marginTop: 24 },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

  restrictionCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  blockedBox:      { borderWidth: 1, borderRadius: 8, padding: 10, gap: 4, marginBottom: 4 },
  liftInfo:        { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 8 },
  badge:           { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },

  duesSummary: { marginBottom: 10 },
  balRow:      { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
  payInfo:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 4 },
});
