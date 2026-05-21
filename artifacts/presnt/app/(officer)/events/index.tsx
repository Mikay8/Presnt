/**
 * Officer — Events
 *
 * Lists upcoming and past events for the org.
 * Officers with MANAGE_EVENTS can create, edit, and cancel events.
 * Entitlement gate: tab is hidden in _layout.tsx if !can(MANAGE_EVENTS).
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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

type Event = Tables<'events'>;

const EVENT_TYPES = ['meeting', 'social', 'service', 'fundraiser', 'workshop', 'other'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function isUpcoming(event: Event): boolean {
  return new Date(event.start_time) > new Date();
}

// ─── Event card ───────────────────────────────────────────────────────────────

function EventCard({
  event,
  canManage,
  onEdit,
  onCancel,
}: {
  event:     Event;
  canManage: boolean;
  onEdit:    (e: Event) => void;
  onCancel:  (e: Event) => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const upcoming   = isUpcoming(event);
  const cancelled  = !!event.is_cancelled;
  const statusColor = cancelled ? '#EF4444' : upcoming ? c.primary : c.textSubtle;
  const statusLabel = cancelled ? 'Cancelled' : upcoming ? 'Upcoming' : 'Past';

  return (
    <View style={[styles.eventCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* Type + Status row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <View style={[styles.typePill, { backgroundColor: c.surfaceAlt }]}>
          <Text size="xs" weight="medium" color={c.textMuted} style={{ textTransform: 'capitalize' }}>
            {event.type}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
          <Text size="xs" weight="medium" color={statusColor}>{statusLabel}</Text>
        </View>
      </View>

      {/* Title */}
      <Text size="md" weight="bold" style={{ marginBottom: 4 }}
        color={cancelled ? c.textSubtle : c.text}>
        {event.title}
      </Text>

      {/* Time + location */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Ionicons name="time-outline" size={13} color={c.textSubtle} />
        <Text size="xs" color={c.textMuted}>{formatDate(event.start_time)}</Text>
      </View>
      {event.location && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Ionicons name="location-outline" size={13} color={c.textSubtle} />
          <Text size="xs" color={c.textMuted}>{event.location}</Text>
        </View>
      )}

      {/* Description */}
      {event.description && (
        <Text size="xs" color={c.textSubtle} numberOfLines={2} style={{ marginTop: 4 }}>
          {event.description}
        </Text>
      )}

      {/* Actions */}
      {canManage && !cancelled && upcoming && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Pressable
            onPress={() => onEdit(event)}
            style={[styles.actionBtn, { borderColor: c.border }]}
          >
            <Ionicons name="pencil-outline" size={14} color={c.textMuted} />
            <Text size="xs" weight="medium" color={c.textMuted}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={() => onCancel(event)}
            style={[styles.actionBtn, { borderColor: '#EF444440', backgroundColor: '#EF444410' }]}
          >
            <Ionicons name="close-outline" size={14} color="#EF4444" />
            <Text size="xs" weight="medium" color="#EF4444">Cancel Event</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Create / Edit Modal ──────────────────────────────────────────────────────

type EventForm = {
  title:       string;
  description: string;
  location:    string;
  type:        string;
  start_time:  string; // ISO string
  end_time:    string;
};

const BLANK_FORM: EventForm = {
  title: '', description: '', location: '',
  type: 'meeting',
  start_time: '', end_time: '',
};

function EventModal({
  visible,
  initial,
  onClose,
  onSave,
  saving,
}: {
  visible:  boolean;
  initial:  Event | null;   // null = create mode
  onClose:  () => void;
  onSave:   (form: EventForm) => void;
  saving:   boolean;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const [form, setForm] = useState<EventForm>(BLANK_FORM);

  useEffect(() => {
    if (initial) {
      setForm({
        title:       initial.title,
        description: initial.description ?? '',
        location:    initial.location    ?? '',
        type:        initial.type,
        start_time:  initial.start_time,
        end_time:    initial.end_time ?? '',
      });
    } else {
      setForm(BLANK_FORM);
    }
  }, [initial, visible]);

  const set = (k: keyof EventForm) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const inputStyle = [styles.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }];

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.modalOverlay}>
        <ScrollView
          style={[styles.modalSheet, { backgroundColor: c.surface }]}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.handle, { backgroundColor: c.border }]} />
          <Text size="xl" weight="bold" style={{ marginBottom: 20 }}>
            {initial ? 'Edit Event' : 'New Event'}
          </Text>

          <Text size="xs" weight="medium" color={c.textMuted} style={styles.label}>Title *</Text>
          <TextInput
            style={inputStyle}
            value={form.title}
            onChangeText={set('title')}
            placeholder="Event title"
            placeholderTextColor={c.textSubtle}
          />

          <Text size="xs" weight="medium" color={c.textMuted} style={styles.label}>Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {EVENT_TYPES.map((t) => {
                const active = form.type === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => set('type')(t)}
                    style={[styles.typeChip, {
                      borderColor: active ? c.primary : c.border,
                      backgroundColor: active ? c.primary + '18' : 'transparent',
                    }]}
                  >
                    <Text size="xs" weight={active ? 'medium' : 'regular'}
                      color={active ? c.primary : c.textMuted}
                      style={{ textTransform: 'capitalize' }}>
                      {t}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text size="xs" weight="medium" color={c.textMuted} style={styles.label}>Location</Text>
          <TextInput
            style={inputStyle}
            value={form.location}
            onChangeText={set('location')}
            placeholder="Room, building, or address"
            placeholderTextColor={c.textSubtle}
          />

          <Text size="xs" weight="medium" color={c.textMuted} style={styles.label}>Start Time (ISO)</Text>
          <TextInput
            style={inputStyle}
            value={form.start_time}
            onChangeText={set('start_time')}
            placeholder="e.g. 2025-10-15T18:00:00"
            placeholderTextColor={c.textSubtle}
            autoCapitalize="none"
          />

          <Text size="xs" weight="medium" color={c.textMuted} style={styles.label}>End Time (ISO)</Text>
          <TextInput
            style={inputStyle}
            value={form.end_time}
            onChangeText={set('end_time')}
            placeholder="e.g. 2025-10-15T20:00:00"
            placeholderTextColor={c.textSubtle}
            autoCapitalize="none"
          />

          <Text size="xs" weight="medium" color={c.textMuted} style={styles.label}>Description</Text>
          <TextInput
            style={[inputStyle, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]}
            value={form.description}
            onChangeText={set('description')}
            placeholder="Optional description"
            placeholderTextColor={c.textSubtle}
            multiline
          />

          <View style={[styles.modalActions, { marginTop: 24 }]}>
            <Pressable onPress={onClose} style={[styles.cancelBtn, { borderColor: c.border }]}>
              <Text size="sm" weight="medium">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(form)}
              disabled={saving || !form.title.trim() || !form.start_time.trim()}
              style={[styles.saveBtn, { backgroundColor: c.primary, opacity: saving ? 0.6 : 1 }]}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text size="sm" weight="bold" style={{ color: '#fff' }}>Save</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const TABS = ['Upcoming', 'Past'] as const;
type Tab = typeof TABS[number];

export default function OfficerEventsScreen() {
  const { theme }      = useThemeStore();
  const insets         = useSafeAreaInsets();
  const { organization, membership, profile } = useAuthStore();
  const userView       = useUserViewStore((s) => s.session);

  const [events, setEvents]     = useState<Event[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [tab, setTab]           = useState<Tab>('Upcoming');
  const [editing, setEditing]   = useState<Event | null | false>(false); // false = closed
  const [saving, setSaving]     = useState(false);

  // Resolve org id — real session or user-view
  const orgId = userView?.org.id ?? organization?.id;

  // Can manage: real officer or user-view officer with the permission
  const canManage = userView
    ? userView.role === 'admin' || userView.permissions.includes('manage_events')
    : membership?.role === 'admin' || membership?.role === 'org_admin' ||
      // officer with custom role containing manage_events — checked in _layout already
      true;

  const c = theme.colors;

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_deleted', false)
      .order('start_time', { ascending: false });
    setEvents(data ?? []);
    setLoading(false);
    setRefresh(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const displayed = events.filter(e =>
    tab === 'Upcoming' ? isUpcoming(e) : !isUpcoming(e)
  );

  // ── Create / Edit ──────────────────────────────────────────────────────────

  async function handleSave(form: EventForm) {
    if (!orgId) return;
    setSaving(true);
    try {
      if (editing && editing !== false && 'id' in editing) {
        // Update
        await supabase
          .from('events')
          .update({
            title:       form.title.trim(),
            description: form.description.trim() || null,
            location:    form.location.trim()    || null,
            type:        form.type,
            start_time:  form.start_time.trim(),
            end_time:    form.end_time.trim()    || null,
          })
          .eq('id', editing.id);
      } else {
        // Insert
        await supabase
          .from('events')
          .insert({
            org_id:      orgId,
            created_by:  profile?.id ?? null,
            title:       form.title.trim(),
            description: form.description.trim() || null,
            location:    form.location.trim()    || null,
            type:        form.type,
            start_time:  form.start_time.trim(),
            end_time:    form.end_time.trim()    || null,
          });
      }
      await load();
      setEditing(false);
    } catch {
      Alert.alert('Error', 'Failed to save event.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(event: Event) {
    Alert.alert('Cancel Event', `Cancel "${event.title}"? Members will be notified.`, [
      { text: 'Never mind', style: 'cancel' },
      {
        text: 'Cancel Event',
        style: 'destructive',
        onPress: async () => {
          await supabase
            .from('events')
            .update({ is_cancelled: true })
            .eq('id', event.id);
          await load();
        },
      },
    ]);
  }

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
          <Text size="xxl" weight="bold">Events</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {events.length} event{events.length !== 1 ? 's' : ''}
          </Text>
        </View>
        {canManage && (
          <Pressable
            onPress={() => setEditing(null)}
            style={[styles.createBtn, { backgroundColor: c.primary }]}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text size="sm" weight="medium" style={{ color: '#fff' }}>New Event</Text>
          </Pressable>
        )}
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map((t) => {
          const active = tab === t;
          return (
            <Pressable key={t} onPress={() => setTab(t)} style={styles.tabItem}>
              <Text size="sm" weight={active ? 'medium' : 'regular'}
                color={active ? c.primary : c.textMuted}>
                {t}
              </Text>
              {active && <View style={[styles.tabIndicator, { backgroundColor: c.primary }]} />}
            </Pressable>
          );
        })}
      </View>

      {/* List */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefresh(true); load(); }}
            tintColor={c.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {displayed.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              No {tab.toLowerCase()} events
            </Text>
            {canManage && tab === 'Upcoming' && (
              <Pressable onPress={() => setEditing(null)} style={{ marginTop: 16 }}>
                <Text size="sm" color={c.primary} weight="medium">+ Create one</Text>
              </Pressable>
            )}
          </View>
        ) : (
          displayed.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              canManage={canManage}
              onEdit={(ev) => setEditing(ev)}
              onCancel={handleCancel}
            />
          ))
        )}
      </ScrollView>

      <EventModal
        visible={editing !== false}
        initial={editing || null}
        onClose={() => setEditing(false)}
        onSave={handleSave}
        saving={saving}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  tabRow:    { flexDirection: 'row', borderBottomWidth: 1 },
  tabItem:   { flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative' },
  tabIndicator: { position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, borderRadius: 1 },
  scroll:    { padding: 16, gap: 12, paddingBottom: 48 },
  emptyState:{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },

  eventCard: { borderWidth: 1, borderRadius: 14, padding: 16 },
  typePill:  { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusPill:{ borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '92%' },
  handle:       { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  label:        { textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 16 },
  input:        { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  typeChip:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn:    { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  saveBtn:      { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
});
