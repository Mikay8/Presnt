/**
 * Officer — Member Dues Detail  /(officer)/dues/:membershipId
 *
 * Shows all dues balances + transaction history for a specific member.
 * Officers can:
 *   - Record a payment / charge / waiver / adjustment
 *   - Add a new dues balance (charge)
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
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';

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
  term_id:       string | null;
};

type DuesTx = {
  id:               string;
  type:             string;
  amount:           string;
  direction:        string;
  description:      string;
  payment_method:   string | null;
  transaction_date: string;
};

type MemberInfo = {
  id:        string;
  dues_hold: boolean | null;
  dues_status: string;
  profiles: { first_name: string; last_name: string; email: string } | null;
};

type TxType = 'payment' | 'charge' | 'waiver' | 'adjustment';
type PaymentMethod = 'cash' | 'check' | 'venmo' | 'manual';

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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

function txColor(direction: string, type: string) {
  if (type === 'waiver')    return '#6B7280';
  return direction === 'credit' ? '#22C55E' : '#EF4444';
}

// ─── Record Transaction Modal ─────────────────────────────────────────────────

function RecordTxModal({
  visible,
  balanceId,
  onClose,
  onSaved,
  officerId,
  membershipId,
  orgId,
}: {
  visible:      boolean;
  balanceId:    string;
  onClose:      () => void;
  onSaved:      () => void;
  officerId:    string;
  membershipId: string;
  orgId:        string;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const [txType,  setTxType]  = useState<TxType>('payment');
  const [amount,  setAmount]  = useState('');
  const [desc,    setDesc]    = useState('');
  const [method,  setMethod]  = useState<PaymentMethod>('cash');
  const [saving,  setSaving]  = useState(false);

  async function save() {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid amount', 'Enter a positive number.');
      return;
    }
    setSaving(true);

    const isCredit = txType === 'payment' || txType === 'waiver';
    const { error } = await (supabase as any).from('dues_transactions').insert({
      dues_balance_id:  balanceId,
      membership_id:    membershipId,
      org_id:           orgId,
      type:             txType,
      amount:           String(amt),
      direction:        isCredit ? 'credit' : 'debit',
      description:      desc.trim() || `${txType.charAt(0).toUpperCase() + txType.slice(1)} recorded`,
      payment_method:   txType === 'payment' ? method : null,
      recorded_by:      officerId,
      transaction_date: new Date().toISOString(),
    });

    if (error) {
      setSaving(false);
      Alert.alert('Error', error.message);
      return;
    }

    // Update balance amounts
    const { data: bal } = await (supabase as any).from('dues_balances').select('amount_due, amount_paid, amount_waived').eq('id', balanceId).single();
    if (bal) {
      const due    = parseFloat(bal.amount_due ?? '0');
      const paid   = parseFloat(bal.amount_paid ?? '0') + (isCredit && txType === 'payment' ? amt : 0);
      const waived = parseFloat(bal.amount_waived ?? '0') + (txType === 'waiver' ? amt : 0);
      const newStatus = (paid + waived >= due) ? 'paid' : (paid + waived > 0) ? 'partial' : 'overdue';
      await (supabase as any).from('dues_balances').update({
        amount_paid:   txType === 'payment' ? String(paid) : undefined,
        amount_waived: txType === 'waiver'  ? String(waived) : undefined,
        status:        newStatus,
        updated_at:    new Date().toISOString(),
      }).eq('id', balanceId);

      if (newStatus === 'paid') {
        await supabase.from('memberships').update({ dues_hold: false, dues_status: 'current' }).eq('id', membershipId);
      }
    }

    setSaving(false);
    setAmount(''); setDesc('');
    onSaved();
    onClose();
  }

  const TX_TYPES: { value: TxType; label: string }[] = [
    { value: 'payment',    label: 'Payment' },
    { value: 'waiver',     label: 'Waiver' },
    { value: 'charge',     label: 'Charge' },
    { value: 'adjustment', label: 'Adjust' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={mo.backdrop}>
        <View style={[mo.sheet, { backgroundColor: c.surface }]}>
          <View style={[mo.handle, { backgroundColor: c.border }]} />
          <Text size="lg" weight="bold" style={{ marginBottom: 16 }}>Record Transaction</Text>

          {/* Type */}
          <Text size="xs" weight="semibold" color={c.textSubtle} style={mo.label}>TYPE</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {TX_TYPES.map(({ value, label }) => (
              <Pressable
                key={value}
                onPress={() => setTxType(value)}
                style={[mo.typeChip, {
                  backgroundColor: txType === value ? c.primary : c.surfaceAlt,
                  borderColor:     txType === value ? c.primary : c.border,
                }]}
              >
                <Text size="sm" weight={txType === value ? 'medium' : 'regular'}
                  style={{ color: txType === value ? '#fff' : c.text }}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Amount */}
          <Text size="xs" weight="semibold" color={c.textSubtle} style={mo.label}>AMOUNT ($)</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={c.textSubtle}
            style={[mo.input, { color: c.text, backgroundColor: c.surfaceAlt, borderColor: c.border }]}
          />

          {/* Payment method (only for payment type) */}
          {txType === 'payment' && (
            <>
              <Text size="xs" weight="semibold" color={c.textSubtle} style={mo.label}>METHOD</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {(['cash', 'check', 'venmo', 'manual'] as PaymentMethod[]).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setMethod(m)}
                    style={[mo.typeChip, {
                      backgroundColor: method === m ? c.primary : c.surfaceAlt,
                      borderColor:     method === m ? c.primary : c.border,
                    }]}
                  >
                    <Text size="sm" weight={method === m ? 'medium' : 'regular'}
                      style={{ color: method === m ? '#fff' : c.text }}>
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {/* Description */}
          <Text size="xs" weight="semibold" color={c.textSubtle} style={mo.label}>DESCRIPTION (OPTIONAL)</Text>
          <TextInput
            value={desc}
            onChangeText={setDesc}
            placeholder="e.g. Spring semester dues, partial payment…"
            placeholderTextColor={c.textSubtle}
            style={[mo.input, { color: c.text, backgroundColor: c.surfaceAlt, borderColor: c.border }]}
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <Pressable onPress={onClose} style={[mo.btn, { backgroundColor: c.surfaceAlt, flex: 1 }]}>
              <Text size="md" weight="medium" color={c.textMuted}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={saving}
              style={[mo.btn, { backgroundColor: c.primary, flex: 2, opacity: saving ? 0.6 : 1 }]}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text size="md" weight="semibold" style={{ color: '#fff' }}>Save</Text>
              }
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const mo = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000060', justifyContent: 'flex-end' },
  sheet:    { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  handle:   { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  label:    { textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  input:    { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, fontSize: 14 },
  typeChip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  btn:      { borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MemberDuesScreen() {
  const { membershipId }   = useLocalSearchParams<{ membershipId: string }>();
  const { theme }          = useThemeStore();
  const insets             = useSafeAreaInsets();
  const { width }          = useWindowDimensions();
  const isWide             = width >= DESKTOP;
  const { membership, profile } = useAuthStore();
  const userView           = useUserViewStore((s) => s.session);
  const c                  = theme.colors;

  const orgId    = userView?.org.id ?? membership?.org_id ?? '';
  const officerId = profile?.id ?? '';

  const [member,    setMember]    = useState<MemberInfo | null>(null);
  const [balances,  setBalances]  = useState<DuesBalance[]>([]);
  const [txMap,     setTxMap]     = useState<Record<string, DuesTx[]>>({});
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [modalBalId,setModalBalId]= useState<string | null>(null);
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!membershipId || !orgId) { setLoading(false); return; }

    const [memberRes, balancesRes] = await Promise.all([
      supabase
        .from('memberships')
        .select('id, dues_hold, dues_status, profiles!user_id(first_name, last_name, email)')
        .eq('id', membershipId)
        .single(),
      (supabase as any)
        .from('dues_balances')
        .select('id, amount_due, amount_paid, amount_waived, status, due_date, notes, term_id')
        .eq('membership_id', membershipId)
        .order('created_at', { ascending: false }),
    ]);

    setMember((memberRes.data as MemberInfo | null));
    const bals = (balancesRes.data ?? []) as DuesBalance[];
    setBalances(bals);

    if (bals.length > 0) {
      const txRes = await (supabase as any)
        .from('dues_transactions')
        .select('id, type, amount, direction, description, payment_method, transaction_date, dues_balance_id')
        .in('dues_balance_id', bals.map(b => b.id))
        .order('transaction_date', { ascending: false });

      const grouped: Record<string, DuesTx[]> = {};
      for (const tx of (txRes.data ?? []) as any[]) {
        if (!grouped[tx.dues_balance_id]) grouped[tx.dues_balance_id] = [];
        grouped[tx.dues_balance_id].push(tx as DuesTx);
      }
      setTxMap(grouped);
    }

    setLoading(false);
    setRefreshing(false);
  }, [membershipId, orgId]);

  useEffect(() => { load(); }, [load]);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const p = member?.profiles;
  const name = p ? `${p.first_name} ${p.last_name}` : 'Member';
  const totalDue  = balances.reduce((s, b) => s + parseFloat(b.amount_due ?? '0'), 0);
  const totalPaid = balances.reduce((s, b) => s + parseFloat(b.amount_paid ?? '0') + parseFloat(b.amount_waived ?? '0'), 0);
  const totalBalance = totalDue - totalPaid;

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
      {/* ── Summary Card ─────────────────────────────────────── */}
      <Card style={xs.summaryCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text size="xs" color={c.textSubtle}>Total Outstanding</Text>
            <Text size="xxl" weight="bold" color={totalBalance > 0 ? '#EF4444' : '#22C55E'}>
              ${totalBalance.toFixed(2)}
            </Text>
          </View>
          {member?.dues_hold && (
            <View style={[xs.holdBadge, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}>
              <Ionicons name="warning-outline" size={12} color="#F59E0B" />
              <Text size="xs" weight="semibold" color="#F59E0B">Hold Active</Text>
            </View>
          )}
        </View>
        <View style={[xs.summaryRow, { borderTopColor: c.border }]}>
          <View>
            <Text size="xs" color={c.textSubtle}>Total Charged</Text>
            <Text size="md" weight="semibold">${totalDue.toFixed(2)}</Text>
          </View>
          <View>
            <Text size="xs" color={c.textSubtle}>Total Paid</Text>
            <Text size="md" weight="semibold" color="#22C55E">${totalPaid.toFixed(2)}</Text>
          </View>
          <View>
            <Text size="xs" color={c.textSubtle}># Balances</Text>
            <Text size="md" weight="semibold">{balances.length}</Text>
          </View>
        </View>
      </Card>

      {/* ── Balances ─────────────────────────────────────────── */}
      {balances.length === 0 ? (
        <View style={xs.empty}>
          <Ionicons name="checkmark-circle-outline" size={40} color={c.textSubtle} />
          <Text size="md" color={c.textMuted} style={{ marginTop: 12 }}>No dues records yet.</Text>
        </View>
      ) : (
        balances.map((bal) => {
          const balAmt = parseFloat(bal.amount_due ?? '0') - parseFloat(bal.amount_paid ?? '0') - parseFloat(bal.amount_waived ?? '0');
          const sc = statusColor(bal.status);
          const isOpen = expanded.has(bal.id);
          const txList = txMap[bal.id] ?? [];

          return (
            <View key={bal.id} style={[xs.balanceCard, { borderColor: c.border, backgroundColor: c.surface }]}>
              {/* Balance Header */}
              <Pressable onPress={() => toggleExpand(bal.id)} style={xs.balanceHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text size="md" weight="semibold">${balAmt.toFixed(2)}</Text>
                    <View style={[xs.badge, { backgroundColor: sc + '18', borderColor: sc }]}>
                      <Text size="xs" weight="medium" color={sc}>
                        {bal.status.charAt(0).toUpperCase() + bal.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                  <Text size="xs" color={c.textMuted}>
                    Due {fmtDate(bal.due_date)} · Charged ${bal.amount_due} · Paid ${bal.amount_paid}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable
                    onPress={() => setModalBalId(bal.id)}
                    style={[xs.recordBtn, { backgroundColor: c.primary }]}
                  >
                    <Text size="xs" weight="medium" style={{ color: '#fff' }}>Record</Text>
                  </Pressable>
                  <Ionicons name={isOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={16} color={c.textSubtle} />
                </View>
              </Pressable>

              {/* Transaction list */}
              {isOpen && (
                <View style={[xs.txList, { borderTopColor: c.border }]}>
                  {txList.length === 0 ? (
                    <Text size="xs" color={c.textSubtle} style={{ paddingVertical: 8 }}>No transactions recorded.</Text>
                  ) : (
                    txList.map((tx) => {
                      const tc = txColor(tx.direction, tx.type);
                      const isCredit = tx.direction === 'credit';
                      return (
                        <View key={tx.id} style={[xs.txRow, { borderBottomColor: c.border }]}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text size="sm" weight="medium">{tx.description}</Text>
                              {tx.payment_method && (
                                <View style={[xs.badge, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                                  <Text size="xs" color={c.textSubtle}>{tx.payment_method}</Text>
                                </View>
                              )}
                            </View>
                            <Text size="xs" color={c.textSubtle}>{fmtDateTime(tx.transaction_date)}</Text>
                          </View>
                          <Text size="md" weight="semibold" color={tc}>
                            {isCredit ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </View>
              )}
            </View>
          );
        })
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
        <View style={{ flex: 1 }}>
          <Text size="xl" weight="bold">{name} — Dues</Text>
          <Text size="xs" color={c.textMuted}>{balances.length} balance record{balances.length !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {isWide ? (
        <View style={{ flex: 1, maxWidth: 800, alignSelf: 'center', width: '100%', paddingHorizontal: 24 }}>
          {content}
        </View>
      ) : content}

      {/* Record Transaction Modal */}
      {modalBalId && (
        <RecordTxModal
          visible
          balanceId={modalBalId}
          onClose={() => setModalBalId(null)}
          onSaved={load}
          officerId={officerId}
          membershipId={membershipId ?? ''}
          orgId={orgId}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const xs = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:     { padding: 4 },
  scroll:      { padding: 16, gap: 14 },

  summaryCard: { marginBottom: 0 },
  summaryRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14, marginTop: 14, borderTopWidth: 1 },
  holdBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },

  balanceCard:   { borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginTop: 14 },
  balanceHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  txList:        { borderTopWidth: 1, paddingHorizontal: 14, paddingBottom: 6 },
  txRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, gap: 10 },

  badge:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  recordBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  empty:     { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
});
