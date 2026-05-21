/**
 * Officer — Excuses
 *
 * Desktop: table-style rows with inline Deny / Approve buttons (matching wireframe)
 * Mobile: card list with same inline buttons
 * Both: filter tabs (Pending · N, Approved · N, Denied · N)
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
import { DOMAIN, loggedQuery } from '@/lib/apiLogger';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';

const DESKTOP = 768;

// ─── Types ────────────────────────────────────────────────────────────────────

type Excuse = {
  id:          string;
  reason:      string;
  status:      string;
  admin_notes: string | null;
  created_at:  string | null;
  reviewed_at: string | null;
  user_id:     string;
  event_id:    string;
  profiles:    { first_name: string; last_name: string; email: string } | null;
  events:      { title: string; start_time: string } | null;
};

type StatusTab = 'Pending' | 'Approved' | 'Denied';

function fmtDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Excuse Row (desktop) / Card (mobile) ─────────────────────────────────────

function ExcuseItem({
  excuse,
  isWide,
  saving,
  onApprove,
  onDeny,
}: {
  excuse:    Excuse;
  isWide:    boolean;
  saving:    boolean;
  onApprove: () => void;
  onDeny:    () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const p    = excuse.profiles;
  const name = p ? `${p.first_name} ${p.last_name}` : 'Unknown';
  const isPending = excuse.status === 'pending';

  if (isWide) {
    return (
      <View style={[ei.desktopRow, { borderBottomColor: c.border }]}>
        {/* Avatar */}
        <View style={[ei.avatar, { backgroundColor: c.surfaceAlt }]}>
          <Text size="xs" weight="medium" color={c.textMuted}>
            {p ? `${p.first_name[0]}${p.last_name[0]}` : '?'}
          </Text>
        </View>

        {/* Name + reason */}
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text size="sm" weight="medium">{name}</Text>
            <View style={[ei.eventTag, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Text size="xs" color={c.textMuted}>
                {excuse.events?.title ?? 'Event'}
              </Text>
            </View>
          </View>
          <Text size="xs" color={c.textMuted} numberOfLines={2}>{excuse.reason}</Text>
          {/* Attachment placeholder */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Ionicons name="attach-outline" size={12} color={c.textSubtle} />
            <Text size="xs" color={c.textSubtle}>doc.pdf</Text>
          </View>
        </View>

        {/* Buttons */}
        {saving ? (
          <ActivityIndicator color={c.primary} />
        ) : isPending ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={onDeny} style={[ei.denyBtn, { borderColor: c.border }]}>
              <Text size="sm" weight="medium" color={c.text}>Deny</Text>
            </Pressable>
            <Pressable onPress={onApprove} style={[ei.approveBtn, { backgroundColor: c.primary }]}>
              <Text size="sm" weight="medium" style={{ color: '#fff' }}>Approve</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[ei.statusBadge, {
            backgroundColor: excuse.status === 'approved' ? '#22C55E18' : '#EF444418',
            borderColor:     excuse.status === 'approved' ? '#22C55E'   : '#EF4444',
          }]}>
            <Text size="xs" weight="medium"
              color={excuse.status === 'approved' ? '#22C55E' : '#EF4444'}>
              {excuse.status === 'approved' ? 'Approved' : 'Denied'}
            </Text>
          </View>
        )}
      </View>
    );
  }

  // Mobile card
  return (
    <View style={[ei.mobileCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <View style={[ei.avatar, { backgroundColor: c.surfaceAlt }]}>
          <Text size="xs" weight="medium" color={c.textMuted}>
            {p ? `${p.first_name[0]}${p.last_name[0]}` : '?'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text size="sm" weight="medium">{name}</Text>
            <View style={[ei.eventTag, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Text size="xs" color={c.textMuted}>{excuse.events?.title ?? 'Event'}</Text>
            </View>
          </View>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 4 }} numberOfLines={3}>
            {excuse.reason}
          </Text>
        </View>
        {!isPending && (
          <View style={[ei.statusBadge, {
            backgroundColor: excuse.status === 'approved' ? '#22C55E18' : '#EF444418',
            borderColor:     excuse.status === 'approved' ? '#22C55E'   : '#EF4444',
          }]}>
            <Text size="xs" weight="medium"
              color={excuse.status === 'approved' ? '#22C55E' : '#EF4444'}>
              {excuse.status === 'approved' ? 'Approved' : 'Denied'}
            </Text>
          </View>
        )}
      </View>

      {isPending && (
        saving ? (
          <ActivityIndicator color={c.primary} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={onDeny} style={[ei.denyBtn, { flex: 1, borderColor: c.border }]}>
              <Text size="sm" weight="medium" color={c.text}>Deny</Text>
            </Pressable>
            <Pressable onPress={onApprove} style={[ei.approveBtn, { flex: 1, backgroundColor: c.primary }]}>
              <Text size="sm" weight="medium" style={{ color: '#fff' }}>Approve</Text>
            </Pressable>
          </View>
        )
      )}
    </View>
  );
}

const ei = StyleSheet.create({
  desktopRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1 },
  mobileCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  avatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  eventTag:   { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  denyBtn:    { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  approveBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  statusBadge:{ borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExcusesScreen() {
  const { theme }      = useThemeStore();
  const insets         = useSafeAreaInsets();
  const { organization, profile } = useAuthStore();
  const userView       = useUserViewStore((s) => s.session);
  const { width }      = useWindowDimensions();
  const isWide         = width >= DESKTOP;
  const c = theme.colors;

  const orgId     = userView?.org.id ?? organization?.id ?? '';
  const reviewerId = profile?.id ?? '';

  const [excuses, setExcuses]   = useState<Excuse[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refresh, setRefresh]   = useState(false);
  const [tab,     setTab]       = useState<StatusTab>('Pending');
  const [saving,  setSaving]    = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    const { data } = await loggedQuery({
      domain: DOMAIN.EXCUSES, method: 'GET', endpoint: 'excuses',
      orgId, userId: reviewerId ?? undefined,
      query: supabase
        .from('excuses')
        .select(`
          id, reason, status, admin_notes, created_at, reviewed_at, user_id, event_id,
          profiles!user_id(first_name, last_name, email),
          events!event_id(title, start_time)
        `)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false }),
    });
    setExcuses((data ?? []) as Excuse[]);
    setLoading(false);
    setRefresh(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  async function review(excuse: Excuse, decision: 'approved' | 'denied') {
    setSaving(prev => new Set(prev).add(excuse.id));
    await loggedQuery({
      domain: DOMAIN.EXCUSES, method: 'PATCH', endpoint: 'excuses/review',
      orgId, userId: reviewerId ?? undefined,
      requestBody: { id: excuse.id, decision },
      query: supabase
        .from('excuses')
        .update({
          status:      decision,
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', excuse.id),
    });
    setSaving(prev => { const n = new Set(prev); n.delete(excuse.id); return n; });
    await load();
  }

  const pendingCount  = excuses.filter(e => e.status === 'pending').length;
  const approvedCount = excuses.filter(e => e.status === 'approved').length;
  const deniedCount   = excuses.filter(e => e.status === 'denied').length;

  const displayed = excuses.filter(e => e.status === tab.toLowerCase());

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
      <View style={[xs.header, { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.background, borderBottomColor: c.border }]}>
        <View style={{ flex: 1 }}>
          <Text size="xxl" weight="bold">Excuses</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {pendingCount} pending · {approvedCount + deniedCount} this term
          </Text>
        </View>
        {/* Bulk approve placeholder */}
        {pendingCount > 0 && (
          <Pressable style={[xs.bulkBtn, { backgroundColor: c.primary }]}>
            <Text size="sm" weight="medium" style={{ color: '#fff' }}>Bulk approve</Text>
          </Pressable>
        )}
      </View>

      {/* Status tabs */}
      <View style={[xs.tabRow, { backgroundColor: c.background, borderBottomColor: c.border }]}>
        {([
          ['Pending',  pendingCount],
          ['Approved', approvedCount],
          ['Denied',   deniedCount],
        ] as [StatusTab, number][]).map(([t, count]) => {
          const active = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[xs.tabChip, {
                backgroundColor: active ? c.surfaceAlt : 'transparent',
                borderColor:     active ? c.border : 'transparent',
              }]}
            >
              <Text size="sm" weight={active ? 'medium' : 'regular'}
                color={active ? c.text : c.textMuted}>
                {t} · {count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* List */}
      <ScrollView
        contentContainerStyle={isWide ? xs.desktopScroll : xs.mobileScroll}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(); }} tintColor={c.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {displayed.length === 0 ? (
          <View style={xs.empty}>
            <Ionicons name="document-text-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              No {tab.toLowerCase()} excuses
            </Text>
          </View>
        ) : isWide ? (
          <View style={[xs.desktopCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            {displayed.map((e) => (
              <ExcuseItem
                key={e.id}
                excuse={e}
                isWide
                saving={saving.has(e.id)}
                onApprove={() => review(e, 'approved')}
                onDeny={() => review(e, 'denied')}
              />
            ))}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {displayed.map((e) => (
              <ExcuseItem
                key={e.id}
                excuse={e}
                isWide={false}
                saving={saving.has(e.id)}
                onApprove={() => review(e, 'approved')}
                onDeny={() => review(e, 'denied')}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const xs = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  bulkBtn:      { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  tabRow:       { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  tabChip:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  desktopScroll:{ padding: 20, paddingBottom: 48 },
  mobileScroll: { padding: 14, gap: 10, paddingBottom: 48 },
  desktopCard:  { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  empty:        { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
});
