/**
 * Officer — Attendance
 *
 * Desktop: event list → drill into roster (grid of check-boxes with filter tabs,
 *          "Mark all present", save count in header)
 * Mobile:  same flow but stacked cards
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
import { DOMAIN, loggedQuery } from '@/lib/apiLogger';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';
import type { Tables } from '@/types/database';

const DESKTOP = 768;

// ─── Types ────────────────────────────────────────────────────────────────────

type EventRow = Pick<Tables<'events'>, 'id' | 'title' | 'start_time' | 'type' | 'is_cancelled'>;

type AttRow = {
  id:      string;
  status:  string;
  user_id: string;
  event_id: string;
};

type MemberRow = {
  id:      string;
  user_id: string;
  profiles: { id: string; first_name: string; last_name: string; email: string } | null;
};

type RosterFilter = 'All' | 'Present' | 'Absent' | 'Excused';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day:   d.getDate(),
    full:  d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
  };
}

function initials(p: { first_name: string; last_name: string } | null) {
  if (!p) return '?';
  return `${p.first_name[0] ?? ''}${p.last_name[0] ?? ''}`;
}

// ─── Roster Modal ─────────────────────────────────────────────────────────────

function RosterModal({
  event,
  orgId,
  onClose,
}: {
  event:   EventRow;
  orgId:   string;
  onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const { width } = useWindowDimensions();
  const isWide    = width >= DESKTOP;
  const c = theme.colors;

  const [members,    setMembers]    = useState<MemberRow[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttRow>>({});
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState<Set<string>>(new Set());
  const [filter,     setFilter]     = useState<RosterFilter>('All');
  const [search,     setSearch]     = useState('');

  useEffect(() => {
    async function load() {
      const [membersRes, attRes] = await Promise.all([
        supabase
          .from('memberships')
          .select('id, user_id, profiles!user_id(id, first_name, last_name, email)')
          .eq('org_id', orgId)
          .eq('is_deleted', false)
          .eq('status', 'active'),

        supabase
          .from('event_attendance')
          .select('id, status, user_id, event_id')
          .eq('event_id', event.id)
          .eq('org_id', orgId),
      ]);

      const map: Record<string, AttRow> = {};
      for (const r of (attRes.data ?? []) as AttRow[]) map[r.user_id] = r;

      setMembers((membersRes.data ?? []) as MemberRow[]);
      setAttendance(map);
      setLoading(false);
    }
    load();
  }, [event.id, orgId]);

  async function mark(userId: string, status: 'present' | 'absent' | 'excused' | null) {
    setSaving(prev => new Set(prev).add(userId));
    const existing = attendance[userId];

    if (status === null && existing) {
      // toggle off — delete record
      await supabase.from('event_attendance').delete().eq('id', existing.id);
      setAttendance(prev => { const n = { ...prev }; delete n[userId]; return n; });
    } else if (existing) {
      const res = await supabase
        .from('event_attendance')
        .update({ status })
        .eq('id', existing.id)
        .select('id, status, user_id, event_id')
        .single();
      if (res.data) setAttendance(prev => ({ ...prev, [userId]: res.data as AttRow }));
    } else {
      const res = await supabase
        .from('event_attendance')
        .insert({ event_id: event.id, org_id: orgId, user_id: userId, status })
        .select('id, status, user_id, event_id')
        .single();
      if (res.data) setAttendance(prev => ({ ...prev, [userId]: res.data as AttRow }));
    }

    setSaving(prev => { const n = new Set(prev); n.delete(userId); return n; });
  }

  async function markAllPresent() {
    // Upsert all unMarked members as present
    setSaving(new Set(members.map(m => m.user_id)));
    const unMarked = members.filter(m => !attendance[m.user_id]);
    const inserts = unMarked.map(m => ({
      event_id: event.id, org_id: orgId, user_id: m.user_id, status: 'present',
    }));
    if (inserts.length > 0) {
      const { data } = await supabase
        .from('event_attendance')
        .insert(inserts)
        .select('id, status, user_id, event_id');
      if (data) {
        const newMap = { ...attendance };
        for (const row of data as AttRow[]) newMap[row.user_id] = row;
        setAttendance(newMap);
      }
    }
    // Also flip absent→present
    const absentIds = Object.values(attendance)
      .filter(a => a.status === 'absent')
      .map(a => a.user_id);
    for (const uid of absentIds) await mark(uid, 'present');
    setSaving(new Set());
  }

  const d = fmtDate(event.start_time);

  const counts = {
    present: Object.values(attendance).filter(a => a.status === 'present').length,
    absent:  Object.values(attendance).filter(a => a.status === 'absent').length,
    excused: Object.values(attendance).filter(a => a.status === 'excused').length,
  };

  const filteredMembers = members.filter(m => {
    const q = search.toLowerCase();
    const p = m.profiles;
    const nameMatch = !q || (p?.first_name + ' ' + p?.last_name).toLowerCase().includes(q);

    if (filter === 'Present') return attendance[m.user_id]?.status === 'present' && nameMatch;
    if (filter === 'Absent')  return attendance[m.user_id]?.status === 'absent'  && nameMatch;
    if (filter === 'Excused') return attendance[m.user_id]?.status === 'excused' && nameMatch;
    return nameMatch;
  });

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: c.background }}>
        {/* Header */}
        <View style={[rh.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
          <Pressable onPress={onClose} style={rh.backBtn}>
            <Ionicons name="arrow-back" size={18} color={c.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text size="lg" weight="bold">{event.title} · {d.full.split(',')[0].replace(' ', ' ')}</Text>
          </View>
          <Pressable
            onPress={markAllPresent}
            style={[rh.markAllBtn, { borderColor: c.border }]}
          >
            <Text size="sm" weight="medium">Mark all present</Text>
          </Pressable>
          <View style={[rh.saveChip, { backgroundColor: c.primary }]}>
            <Text size="sm" weight="bold" style={{ color: '#fff' }}>
              Save · {counts.present}/{members.length}
            </Text>
          </View>
        </View>

        {/* Filter bar */}
        <View style={[rh.filterBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
          <View style={[rh.searchBox, { backgroundColor: c.surfaceAlt, borderColor: c.border, flex: 1 }]}>
            <Ionicons name="search-outline" size={15} color={c.textSubtle} />
            <TextInput
              style={{ flex: 1, fontSize: 14, color: c.text }}
              value={search}
              onChangeText={setSearch}
              placeholder="Filter members…"
              placeholderTextColor={c.textSubtle}
            />
          </View>
          {(['All', 'Present', 'Absent', 'Excused'] as RosterFilter[]).map((f) => {
            const count = f === 'All' ? members.length
              : f === 'Present' ? counts.present
              : f === 'Absent'  ? counts.absent
              : counts.excused;
            const active = filter === f;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[rh.filterChip, {
                  backgroundColor: active ? c.surfaceAlt : 'transparent',
                  borderColor:     active ? c.border : 'transparent',
                }]}
              >
                <Text size="sm" weight={active ? 'medium' : 'regular'}
                  color={active ? c.text : c.textMuted}>
                  {f} · {count}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator color={c.primary} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView contentContainerStyle={[rh.grid, isWide && rh.gridWide]}>
            {filteredMembers.map((m) => {
              const uid      = m.user_id;
              const att      = attendance[uid];
              const isPresent = att?.status === 'present';
              const isExcused = att?.status === 'excused';
              const isSaving  = saving.has(uid);
              const p         = m.profiles;

              return (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    if (isSaving) return;
                    // Cycle: none→present→absent→none
                    if (!att)             mark(uid, 'present');
                    else if (isPresent)   mark(uid, 'absent');
                    else                  mark(uid, null);
                  }}
                  style={[rh.memberCell, { borderColor: c.border }]}
                >
                  {/* Checkbox */}
                  {isSaving ? (
                    <ActivityIndicator size="small" color={c.primary} style={rh.checkbox} />
                  ) : (
                    <View style={[
                      rh.checkbox,
                      isPresent && { backgroundColor: c.primary, borderColor: c.primary },
                      isExcused && { backgroundColor: '#EAB308', borderColor: '#EAB308' },
                      !att && { borderColor: c.border },
                    ]}>
                      {isPresent && <Ionicons name="checkmark" size={13} color="#fff" />}
                      {isExcused && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />}
                      {att && !isPresent && !isExcused && (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#6B7280' }} />
                      )}
                    </View>
                  )}

                  {/* Avatar */}
                  <View style={[rh.avatar, { backgroundColor: c.surfaceAlt }]}>
                    <Text size="xs" weight="medium" color={c.textMuted}>{initials(p)}</Text>
                  </View>

                  {/* Name */}
                  <View style={{ flex: 1 }}>
                    <Text size="sm" weight="medium" numberOfLines={1}>
                      {p ? `${p.first_name} ${p.last_name}` : 'Unknown'}
                    </Text>
                    <Text size="xs" color={c.textSubtle} numberOfLines={1}>{p?.email}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const rh = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, borderRadius: 10, backgroundColor: '#0000000A', alignItems: 'center', justifyContent: 'center' },
  markAllBtn:  { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  saveChip:    { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  filterBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, flexWrap: 'wrap' },
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: 160 },
  filterChip:  { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  grid:        { padding: 16, gap: 2 },
  gridWide:    { flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  memberCell:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1,
                 // desktop: 3-column grid via minWidth
                 minWidth: 0, },
  checkbox:    { width: 28, height: 28, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  avatar:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});

// ─── Event list row (main screen) ─────────────────────────────────────────────

function EventListRow({
  event,
  presentCount,
  total,
  onOpen,
}: {
  event:        EventRow;
  presentCount: number;
  total:        number;
  onOpen:       () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const d = fmtDate(event.start_time);
  const pct = total > 0 ? Math.round((presentCount / total) * 100) : 0;

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [el.row, { borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[el.dateBadge, { backgroundColor: c.surfaceAlt }]}>
        <Text size="xs" weight="medium" color={c.textSubtle}>{d.month}</Text>
        <Text size="md" weight="bold">{d.day}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text size="sm" weight="medium">{event.title}</Text>
        <Text size="xs" color={c.textSubtle}>{d.full}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text size="sm" weight="medium" color={c.primary}>{presentCount}/{total}</Text>
        <Text size="xs" color={c.textSubtle}>{pct}% present</Text>
      </View>
      <Ionicons name="chevron-forward-outline" size={16} color={c.textSubtle} />
    </Pressable>
  );
}

const el = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 20 },
  dateBadge: { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AttendanceScreen() {
  const { theme }      = useThemeStore();
  const insets         = useSafeAreaInsets();
  const { organization } = useAuthStore();
  const userView       = useUserViewStore((s) => s.session);
  const { width }      = useWindowDimensions();
  const isWide         = width >= DESKTOP;
  const c = theme.colors;

  const orgId = userView?.org.id ?? organization?.id ?? '';

  const [events,  setEvents]  = useState<EventRow[]>([]);
  const [total,   setTotal]   = useState(0);
  const [counts,  setCounts]  = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [open,    setOpen]    = useState<EventRow | null>(null);

  const { profile } = useAuthStore();

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    const [evRes, memRes, attRes] = await Promise.all([
      loggedQuery({
        domain: DOMAIN.EVENTS, method: 'GET', endpoint: 'events',
        orgId, userId: profile?.id,
        query: supabase
          .from('events')
          .select('id, title, start_time, type, is_cancelled')
          .eq('org_id', orgId)
          .eq('is_deleted', false)
          .eq('is_cancelled', false)
          .order('start_time', { ascending: false })
          .limit(60),
      }),
      // count query — use raw supabase (count lives on result, not data)
      supabase
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('is_deleted', false)
        .eq('status', 'active'),
      loggedQuery({
        domain: DOMAIN.ATTENDANCE, method: 'GET', endpoint: 'event_attendance',
        orgId, userId: profile?.id,
        query: supabase
          .from('event_attendance')
          .select('event_id, status')
          .eq('org_id', orgId)
          .eq('status', 'present'),
      }),
    ]);

    const map: Record<string, number> = {};
    for (const r of attRes.data ?? []) {
      map[r.event_id] = (map[r.event_id] ?? 0) + 1;
    }

    setEvents((evRes.data ?? []) as EventRow[]);
    setTotal(memRes.count ?? 0);
    setCounts(map);
    setLoading(false);
    setRefresh(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={[as.header, { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Text size="xxl" weight="bold">Attendance</Text>
        <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
          Tap an event to manage its roster
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[as.scroll, !isWide && { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(); }} tintColor={c.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {events.length === 0 ? (
          <View style={as.empty}>
            <Ionicons name="checkmark-done-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>No events yet</Text>
          </View>
        ) : (
          <Card style={{ paddingVertical: 0 }}>
            {events.map((e, i) => (
              <View key={e.id} style={i < events.length - 1 ? { borderBottomWidth: 1, borderBottomColor: c.border } : undefined}>
                <EventListRow
                  event={e}
                  presentCount={counts[e.id] ?? 0}
                  total={total}
                  onOpen={() => setOpen(e)}
                />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      {open && orgId && (
        <RosterModal
          event={open}
          orgId={orgId}
          onClose={() => { setOpen(null); load(); }}
        />
      )}
    </View>
  );
}

const as = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  scroll: { padding: 16, paddingBottom: 48 },
  empty:  { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
});
