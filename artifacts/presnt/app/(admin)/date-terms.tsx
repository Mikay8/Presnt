/**
 * Admin — Date Terms
 *
 * Create, rename, and set the active academic term (semester / quarter).
 * Uses the same DateRangePickerModal as events-management.
 * "Ongoing" pill shown when today falls within start_date..end_date.
 * First term created is auto-set as active.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components/ui';
import { DateRangePickerModal, formatDateRange, type DateRange } from '@/lib/pickers';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type Term = {
  id:         string;
  name:       string;
  start_date: string;
  end_date:   string;
  is_active:  boolean;
};

// YYYY-MM-DD from a Date
function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

// Is today between start and end (inclusive)?
function isOngoing(start_date: string, end_date: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const s = new Date(start_date + 'T00:00:00');
  const e = new Date(end_date   + 'T00:00:00');
  return today >= s && today <= e;
}

// ─── Term form ────────────────────────────────────────────────────────────────

function TermForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial:  { name: string; range: DateRange };
  onSave:   (name: string, range: DateRange) => void;
  onCancel: () => void;
  saving:   boolean;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const [name,      setName]      = useState(initial.name);
  const [range,     setRange]     = useState<DateRange>(initial.range);
  const [showRange, setShowRange] = useState(false);

  const labelStyle = { textTransform: 'uppercase' as const, letterSpacing: 0.8, marginBottom: 6 };

  return (
    <View style={{ gap: 14 }}>
      {/* Term name */}
      <View>
        <Text size="xs" weight="medium" color={c.textMuted} style={labelStyle}>Term Name *</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Fall 2026"
          placeholderTextColor={c.textSubtle}
          style={[tf.input, { backgroundColor: c.background, borderColor: c.border, color: c.text }]}
        />
      </View>

      {/* Date range — same picker as events */}
      <View>
        <Text size="xs" weight="medium" color={c.textMuted} style={labelStyle}>Date Range *</Text>
        <Pressable
          onPress={() => setShowRange(true)}
          style={[tf.rangeBtn, { borderColor: c.border, backgroundColor: c.background }]}
        >
          <Ionicons name="calendar-outline" size={16} color={c.primary} />
          <Text size="sm" color={range ? c.text : c.textSubtle}>
            {formatDateRange(range.start, range.end)}
          </Text>
        </Pressable>
        <DateRangePickerModal
          visible={showRange}
          value={range}
          onConfirm={(r) => { setRange(r); setShowRange(false); }}
          onClose={() => setShowRange(false)}
        />
      </View>

      {/* Actions */}
      <View style={tf.row}>
        <Button label="Cancel" variant="outline" style={{ flex: 1 }} onPress={onCancel} />
        <Button
          label={saving ? 'Saving…' : 'Save term'}
          style={{ flex: 1 }}
          loading={saving}
          onPress={() => onSave(name, range)}
        />
      </View>
    </View>
  );
}

const tf = StyleSheet.create({
  input:    { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontFamily: 'SpaceGrotesk_400Regular' },
  rangeBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  row:      { flexDirection: 'row', gap: 12 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminDateTermsScreen() {
  const { theme }    = useThemeStore();
  const c            = theme.colors;
  const insets       = useSafeAreaInsets();
  const { width }    = useWindowDimensions();
  const isWide       = width >= 800;
  const { membership } = useAuthStore();
  const orgId = membership?.org_id ?? '';

  const [terms,    setTerms]    = useState<Term[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState<Term | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    const { data } = await supabase
      .from('academic_terms')
      .select('id, name, start_date, end_date, is_active')
      .eq('org_id', orgId)
      .order('start_date', { ascending: false });
    setTerms((data ?? []) as Term[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(name: string, range: DateRange) {
    if (!name.trim()) { Alert.alert('Required', 'Term name is required.'); return; }
    setSaving(true);
    const start_date = toDateStr(range.start);
    const end_date   = toDateStr(range.end);

    if (editing) {
      const { error } = await supabase
        .from('academic_terms')
        .update({ name: name.trim(), start_date, end_date, updated_at: new Date().toISOString() })
        .eq('id', editing.id);
      if (error) { Alert.alert('Error', error.message); setSaving(false); return; }
    } else {
      // Auto-set active if this is the first term
      const isFirst = terms.length === 0;
      const { error } = await supabase
        .from('academic_terms')
        .insert({ org_id: orgId, name: name.trim(), start_date, end_date, is_active: isFirst });
      if (error) { Alert.alert('Error', error.message); setSaving(false); return; }
    }
    setSaving(false);
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function handleSetActive(term: Term) {
    Alert.alert('Set active term?', `"${term.name}" will become the active term. Compliance data is scoped to it.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Set active',
        onPress: async () => {
          await supabase.from('academic_terms').update({ is_active: false }).eq('org_id', orgId);
          await supabase.from('academic_terms').update({ is_active: true }).eq('id', term.id);
          load();
        },
      },
    ]);
  }

  // Default range for new term form
  const defaultRange: DateRange = (() => {
    const now   = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();
    if (month <= 5)  return { start: new Date(`${year}-01-15`), end: new Date(`${year}-05-15`) };
    if (month <= 7)  return { start: new Date(`${year}-05-16`), end: new Date(`${year}-08-15`) };
    return { start: new Date(`${year}-08-16`), end: new Date(`${year}-12-20`) };
  })();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  const termList = (
    <View style={{ gap: 12 }}>
      <Pressable
        onPress={() => { setEditing(null); setShowForm(true); }}
        style={[s.addBtn, { borderColor: c.primary, backgroundColor: c.primary + '0f' }]}
      >
        <Ionicons name="add-circle-outline" size={18} color={c.primary} />
        <Text size="sm" weight="medium" color={c.primary}>New term</Text>
      </Pressable>

      {terms.length === 0 && (
        <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 32 }}>
          <Ionicons name="calendar-outline" size={36} color={c.textSubtle} />
          <Text size="sm" color={c.textMuted} style={{ textAlign: 'center' }}>
            No terms yet.{'\n'}Create your first academic term.
          </Text>
        </Card>
      )}

      {terms.map((term) => {
        const ongoing = isOngoing(term.start_date, term.end_date);
        return (
          <Card key={term.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text size="sm" weight="bold">{term.name}</Text>
                  {term.is_active && (
                    <View style={[s.badge, { backgroundColor: c.primary + '14', borderColor: c.primary + '40' }]}>
                      <Text size="xs" weight="medium" color={c.primary}>Active</Text>
                    </View>
                  )}
                  {ongoing && (
                    <View style={[s.badge, { backgroundColor: c.success + '14', borderColor: c.success + '40' }]}>
                      <Ionicons name="radio-button-on-outline" size={10} color={c.success} />
                      <Text size="xs" weight="medium" color={c.success}> Ongoing</Text>
                    </View>
                  )}
                </View>
                <Text size="xs" color={c.textMuted}>{term.start_date} → {term.end_date}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {!term.is_active && (
                  <Pressable
                    onPress={() => handleSetActive(term)}
                    style={[s.iconBtn, { borderColor: c.primary + '50', backgroundColor: c.primary + '0f' }]}
                  >
                    <Ionicons name="checkmark-circle-outline" size={15} color={c.primary} />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => { setEditing(term); setShowForm(true); }}
                  style={[s.iconBtn, { borderColor: c.border }]}
                >
                  <Ionicons name="pencil-outline" size={15} color={c.textMuted} />
                </Pressable>
              </View>
            </View>
          </Card>
        );
      })}
    </View>
  );

  const editRange: DateRange = editing
    ? { start: new Date(editing.start_date + 'T00:00:00'), end: new Date(editing.end_date + 'T00:00:00') }
    : defaultRange;

  const formPanel = showForm ? (
    <Card>
      <Text size="md" weight="bold" style={{ marginBottom: 16 }}>
        {editing ? 'Edit term' : 'New term'}
      </Text>
      <TermForm
        initial={{ name: editing?.name ?? '', range: editRange }}
        onSave={handleSave}
        onCancel={() => { setShowForm(false); setEditing(null); }}
        saving={saving}
      />
    </Card>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={[s.header, {
        paddingTop: isWide ? 20 : insets.top + 12,
        backgroundColor: c.surface, borderBottomColor: c.border,
      }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={c.text} />
          <Text size="sm" weight="medium" color={c.text}>Settings</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text size="xxl" weight="bold">Date Terms</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>Academic terms — semesters, quarters, etc.</Text>
        </View>
      </View>

      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[
          isWide ? s.scrollWide : s.scroll,
          !isWide && { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isWide ? (
          <View style={s.wideCols}>
            <View style={{ flex: 1 }}>{termList}</View>
            {showForm && <View style={{ width: 380 }}>{formPanel}</View>}
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {termList}
            {formPanel}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4 },
  scroll:     { padding: 16, gap: 16 },
  scrollWide: { padding: 32 },
  wideCols:   { flexDirection: 'row', gap: 24, alignItems: 'flex-start' },
  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, borderStyle: 'dashed' },
  badge:      { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  iconBtn:    { width: 32, height: 32, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
