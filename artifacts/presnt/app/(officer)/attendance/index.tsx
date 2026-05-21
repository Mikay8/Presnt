/**
 * Officer — Attendance
 *
 * Officers with MANAGE_ATTENDANCE can:
 *   • Browse events and open their attendance roster
 *   • Mark members as present / excused / absent
 *   • See attendance counts per event
 *
 * Entitlement gate: tab hidden in _layout.tsx if !can(MANAGE_ATTENDANCE).
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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';
import type { Tables } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

type Event = Pick<Tables<'events'>, 'id' | 'title' | 'start_time' | 'type' | 'is_cancelled'>;

type AttendanceRow = {
  id:       string;
  status:   string;
  notes:    string | null;
  user_id:  string;
  event_id: string;
  profiles: {
    id:         string;
    first_name: string;
    last_name:  string;
    email:      string;
  } | null;
};

type MemberRow = {
  id:      string; // membership id
  user_id: string;
  profiles: {
    id:         string;
    first_name: string;
    last_name:  string;
    email:      string;
  } | null;
};

const STATUS_OPTIONS = [
  { value: 'present',  label: 'Present',  color: '#22C55E', icon: 'checkmark-circle-outline' as const },
  { value: 'excused',  label: 'Excused',  color: '#EAB308', icon: 'document-text-outline'     as const },
  { value: 'absent',   label: 'Absent',   color: '#EF4444', icon: 'close-circle-outline'       as const },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function initials(p: { first_name: string; last_name: string } | null) {
  if (!p) return '?';
  return `${p.first_name[0] ?? ''}${p.last_name[0] ?? ''}`;
}

// ─── Attendance Roster Modal ───────────────────────────────────────────────────

function RosterModal({
  event,
  orgId,
  onClose,
}: {
  event:  Event;
  orgId:  string;
  onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const [members, setMembers]       = useState<MemberRow[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceRow>>({});
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState<string | null>(null); // user_id being saved

  useEffect(() => {
    async function load() {
      const [membersRes, attRes] = await Promise.all([
        supabase
          .from('memberships')
          .select('id, user_id, profiles!user_id(id, first_name, last_name, email)')
          .eq('org_id', orgId)
          .eq('is_deleted', false)
          .eq('status', 'active')
          .order('profiles(last_name)'),

        supabase
          .from('event_attendance')
          .select('id, status, notes, user_id, event_id, profiles!user_id(id, first_name, last_name, email)')
          .eq('event_id', event.id)
          .eq('org_id', orgId),
      ]);

      const attMap: Record<string, AttendanceRow> = {};
      for (const row of (attRes.data ?? []) as AttendanceRow[]) {
        attMap[row.user_id] = row;
      }

      setMembers((membersRes.data ?? []) as MemberRow[]);
      setAttendance(attMap);
      setLoading(false);
    }
    load();
  }, [event.id, orgId]);

  async function mark(member: MemberRow, status: string) {
    const userId = member.user_id;
    setSaving(userId);
    const existing = attendance[userId];

    let result;
    if (existing) {
      result = await supabase
        .from('event_attendance')
        .update({ status })
        .eq('id', existing.id)
        .select('id, status, notes, user_id, event_id, profiles!user_id(id, first_name, last_name, email)')
        .single();
    } else {
      result = await supabase
        .from('event_attendance')
        .insert({ event_id: event.id, org_id: orgId, user_id: userId, status })
        .select('id, status, notes, user_id, event_id, profiles!user_id(id, first_name, last_name, email)')
        .single();
    }

    if (result.data) {
      setAttendance(prev => ({ ...prev, [userId]: result.data as AttendanceRow }));
    }
    setSaving(null);
  }

  const counts = {
    present: Object.values(attendance).filter(a => a.status === 'present').length,
    excused: Object.values(attendance).filter(a => a.status === 'excused').length,
    absent:  Object.values(attendance).filter(a => a.status === 'absent').length,
  };

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: c.surface }]}>
          <View style={[styles.handle, { backgroundColor: c.border }]} />

          {/* Event header */}
          <Text size="lg" weight="bold" numberOfLines={1}>{event.title}</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 4, marginBottom: 16 }}>
            {fmtDate(event.start_time)}
          </Text>

          {/* Summary chips */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {STATUS_OPTIONS.map((s) => (
              <View key={s.value} style={[styles.summaryChip, {
                backgroundColor: s.color + '18', borderColor: s.color,
              }]}>
                <Text size="xs" weight="medium" color={s.color}>
                  {counts[s.value as keyof typeof counts]} {s.label}
                </Text>
              </View>
            ))}
          </View>

          <View style={[styles.divider, { backgroundColor: c.border }]} />

          {loading ? (
            <ActivityIndicator color={c.primary} style={{ paddingVertical: 40 }} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {members.map((m) => {
                const profile    = m.profiles;
                const userId     = m.user_id;
                const existing   = attendance[userId];
                const isSaving   = saving === userId;

                return (
                  <View key={m.id} style={[styles.memberRow, { borderBottomColor: c.border }]}>
                    {/* Avatar */}
                    <View style={[styles.avatar, { backgroundColor: c.surfaceAlt }]}>
                      <Text size="xs" weight="medium" color={c.textMuted}>{initials(profile)}</Text>
                    </View>

                    {/* Name */}
                    <View style={{ flex: 1 }}>
                      <Text size="sm" weight="medium">
                        {profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown'}
                      </Text>
                      <Text size="xs" color={c.textSubtle}>{profile?.email}</Text>
                    </View>

                    {/* Status toggle */}
                    {isSaving ? (
                      <ActivityIndicator size="small" color={c.primary} />
                    ) : (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {STATUS_OPTIONS.map((s) => {
                          const active = existing?.status === s.value;
                          return (
                            <Pressable
                              key={s.value}
                              onPress={() => mark(m, s.value)}
                              style={[
                                styles.statusBtn,
                                {
                                  backgroundColor: active ? s.color + '22' : 'transparent',
                                  borderColor: active ? s.color : c.border,
                                },
                              ]}
                            >
                              <Ionicons name={s.icon} size={16} color={active ? s.color : c.textSubtle} />
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          <Pressable onPress={onClose} style={[styles.closeBtn, { borderColor: c.border, marginTop: 16 }]}>
            <Text size="sm" weight="medium">Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Event row ────────────────────────────────────────────────────────────────

function EventRow({
  event,
  attendedCount,
  totalMembers,
  onOpen,
}: {
  event:        Event;
  attendedCount: number;
  totalMembers:  number;
  onOpen:        () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const pct = totalMembers > 0 ? Math.round((attendedCount / totalMembers) * 100) : 0;

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.eventRow,
        { borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text size="sm" weight="medium">{event.title}</Text>
        <Text size="xs" color={c.textMuted}>{fmtDate(event.start_time)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text size="sm" weight="medium" color={c.primary}>{attendedCount}/{totalMembers}</Text>
        <Text size="xs" color={c.textSubtle}>{pct}% attended</Text>
      </View>
      <Ionicons name="chevron-forward-outline" size={16} color={c.textSubtle} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AttendanceScreen() {
  const { theme }      = useThemeStore();
  const insets         = useSafeAreaInsets();
  const { organization } = useAuthStore();
  const userView       = useUserViewStore((s) => s.session);
  const c = theme.colors;

  const orgId = userView?.org.id ?? organization?.id;

  const [events, setEvents]           = useState<Event[]>([]);
  const [totalMembers, setTotal]      = useState(0);
  const [attendanceCounts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefresh]      = useState(false);
  const [open, setOpen]               = useState<Event | null>(null);

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    const [eventsRes, membersRes, attRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, start_time, type, is_cancelled')
        .eq('org_id', orgId)
        .eq('is_deleted', false)
        .eq('is_cancelled', false)
        .order('start_time', { ascending: false })
        .limit(50),

      supabase
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('is_deleted', false)
        .eq('status', 'active'),

      supabase
        .from('event_attendance')
        .select('event_id, status')
        .eq('org_id', orgId)
        .eq('status', 'present'),
    ]);

    const counts: Record<string, number> = {};
    for (const row of attRes.data ?? []) {
      counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
    }

    setEvents((eventsRes.data ?? []) as Event[]);
    setTotal(membersRes.count ?? 0);
    setCounts(counts);
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
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View>
          <Text size="xxl" weight="bold">Attendance</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            Tap an event to manage its roster
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefresh(true); load(); }}
            tintColor={c.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {events.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-done-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              No events yet
            </Text>
          </View>
        ) : (
          <Card style={{ paddingVertical: 0 }}>
            {events.map((e, i) => (
              <View key={e.id} style={i < events.length - 1 ? { borderBottomWidth: 1, borderBottomColor: c.border } : undefined}>
                <EventRow
                  event={e}
                  attendedCount={attendanceCounts[e.id] ?? 0}
                  totalMembers={totalMembers}
                  onOpen={() => setOpen(e)}
                />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      {open && orgId && (
        <RosterModal event={open} orgId={orgId} onClose={() => { setOpen(null); load(); }} />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:    { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  scroll:    { padding: 16, paddingBottom: 48 },
  emptyState:{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },

  eventRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '88%', flex: 0 },
  handle:       { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  divider:      { height: 1, marginBottom: 12 },
  summaryChip:  { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },

  memberRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1 },
  avatar:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statusBtn:  { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  closeBtn:   { borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
});
