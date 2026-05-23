/**
 * Admin — Compliance Requirements
 *
 * Create, edit, and delete status_requirements for the active academic term.
 * Each requirement has a name, min_points, optional min_events, applies_to,
 * and an optional warning_threshold.
 *
 * Desktop: two-column (requirement list left, form right)
 * Mobile:  list + bottom-sheet-style form
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
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type Requirement = {
  id:                string;
  name:              string;
  description:       string | null;
  min_points:        number;
  min_events:        number | null;
  applies_to:        string;
  warning_threshold: number;
  is_mandatory:      boolean;
  consequence:       string | null;
};

type AcademicTerm = { id: string; name: string; start_date: string; end_date: string };

const APPLIES_OPTIONS = [
  { value: 'all',        label: 'All members' },
  { value: 'active',     label: 'Active only' },
  { value: 'new_member', label: 'New members only' },
  { value: 'alumni',     label: 'Alumni only' },
];

const BLANK: Omit<Requirement, 'id'> = {
  name:              '',
  description:       '',
  min_points:        10,
  min_events:        null,
  applies_to:        'all',
  warning_threshold: 80,
  is_mandatory:      true,
  consequence:       '',
};

// ─── Form ─────────────────────────────────────────────────────────────────────

function RequirementForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial:  Omit<Requirement, 'id'>;
  onSave:   (v: Omit<Requirement, 'id'>) => void;
  onCancel: () => void;
  saving:   boolean;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const [form, setForm] = useState(initial);
  const set = (k: keyof typeof BLANK, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const labelStyle = {
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom:  6,
  };

  return (
    <View style={{ gap: 16 }}>
      {/* Name */}
      <View>
        <Text size="xs" weight="medium" color={c.textMuted} style={labelStyle}>Requirement Name *</Text>
        <TextInput
          value={form.name}
          onChangeText={(v) => set('name', v)}
          placeholder="e.g. General Attendance"
          placeholderTextColor={c.textSubtle}
          style={[f.input, { backgroundColor: c.background, borderColor: c.border, color: c.text }]}
        />
      </View>

      {/* Description */}
      <View>
        <Text size="xs" weight="medium" color={c.textMuted} style={labelStyle}>Description (optional)</Text>
        <TextInput
          value={form.description ?? ''}
          onChangeText={(v) => set('description', v)}
          placeholder="Short explanation for members"
          placeholderTextColor={c.textSubtle}
          multiline
          numberOfLines={2}
          style={[f.input, f.multiline, { backgroundColor: c.background, borderColor: c.border, color: c.text }]}
        />
      </View>

      {/* Points + Events row */}
      <View style={f.row}>
        <View style={{ flex: 1 }}>
          <Text size="xs" weight="medium" color={c.textMuted} style={labelStyle}>Min Points *</Text>
          <TextInput
            value={String(form.min_points)}
            onChangeText={(v) => set('min_points', Number(v.replace(/[^0-9.]/g, '')) || 0)}
            keyboardType="numeric"
            style={[f.input, { backgroundColor: c.background, borderColor: c.border, color: c.text }]}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text size="xs" weight="medium" color={c.textMuted} style={labelStyle}>Min Events (opt)</Text>
          <TextInput
            value={form.min_events != null ? String(form.min_events) : ''}
            onChangeText={(v) => set('min_events', v.trim() === '' ? null : (Number(v.replace(/[^0-9]/g, '')) || null))}
            keyboardType="numeric"
            placeholder="—"
            placeholderTextColor={c.textSubtle}
            style={[f.input, { backgroundColor: c.background, borderColor: c.border, color: c.text }]}
          />
        </View>
      </View>

      {/* Warning threshold */}
      <View>
        <Text size="xs" weight="medium" color={c.textMuted} style={labelStyle}>
          At-Risk Warning Threshold (% of min points)
        </Text>
        <TextInput
          value={String(form.warning_threshold)}
          onChangeText={(v) => set('warning_threshold', Math.min(100, Number(v.replace(/[^0-9]/g, '')) || 80))}
          keyboardType="numeric"
          style={[f.input, { backgroundColor: c.background, borderColor: c.border, color: c.text }]}
        />
        <Text size="xs" color={c.textSubtle} style={{ marginTop: 4 }}>
          Members below this % of required points are flagged "At Risk"
        </Text>
      </View>

      {/* Applies to */}
      <View>
        <Text size="xs" weight="medium" color={c.textMuted} style={labelStyle}>Applies To</Text>
        <View style={f.chipRow}>
          {APPLIES_OPTIONS.map((o) => {
            const active = form.applies_to === o.value;
            return (
              <Pressable
                key={o.value}
                onPress={() => set('applies_to', o.value)}
                style={[f.chip, {
                  borderColor:     active ? c.primary : c.border,
                  backgroundColor: active ? c.primary + '14' : 'transparent',
                }]}
              >
                <Text size="xs" weight={active ? 'medium' : 'regular'} color={active ? c.primary : c.textMuted}>
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Mandatory toggle */}
      <Pressable
        onPress={() => set('is_mandatory', !form.is_mandatory)}
        style={[f.toggle, { borderColor: c.border, backgroundColor: c.background }]}
      >
        <View>
          <Text size="sm" weight="medium">Mandatory</Text>
          <Text size="xs" color={c.textSubtle}>Non-compliance has consequences</Text>
        </View>
        <View style={[f.toggleDot, {
          backgroundColor: form.is_mandatory ? c.primary : c.border,
        }]}>
          <View style={[f.toggleThumb, { transform: [{ translateX: form.is_mandatory ? 18 : 0 }] }]} />
        </View>
      </Pressable>

      {/* Consequence */}
      {form.is_mandatory && (
        <View>
          <Text size="xs" weight="medium" color={c.textMuted} style={labelStyle}>Consequence (optional)</Text>
          <TextInput
            value={form.consequence ?? ''}
            onChangeText={(v) => set('consequence', v)}
            placeholder="e.g. Social probation"
            placeholderTextColor={c.textSubtle}
            style={[f.input, { backgroundColor: c.background, borderColor: c.border, color: c.text }]}
          />
        </View>
      )}

      {/* Actions */}
      <View style={f.row}>
        <Button label="Cancel" variant="outline" style={{ flex: 1 }} onPress={onCancel} />
        <Button
          label={saving ? 'Saving…' : 'Save requirement'}
          style={{ flex: 1 }}
          loading={saving}
          onPress={() => onSave(form)}
        />
      </View>
    </View>
  );
}

const f = StyleSheet.create({
  input:     { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontFamily: 'SpaceGrotesk_400Regular' },
  multiline: { minHeight: 64, textAlignVertical: 'top', paddingTop: 10 },
  row:       { flexDirection: 'row', gap: 12 },
  chipRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:      { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  toggle:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  toggleDot: { width: 40, height: 22, borderRadius: 11, padding: 2 },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminRequirementsScreen() {
  const { theme }    = useThemeStore();
  const c            = theme.colors;
  const insets       = useSafeAreaInsets();
  const { width }    = useWindowDimensions();
  const isWide       = width >= 800;
  const { membership } = useAuthStore();
  const orgId = membership?.org_id ?? '';

  const [term,         setTerm]         = useState<AcademicTerm | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [editing,      setEditing]      = useState<Requirement | null>(null);
  const [showForm,     setShowForm]     = useState(false);
  const [saving,       setSaving]       = useState(false);

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    const { data: termData } = await supabase
      .from('academic_terms').select('id, name, start_date, end_date')
      .eq('org_id', orgId).eq('is_active', true).single();
    setTerm(termData ?? null);
    if (termData) {
      const { data } = await supabase
        .from('status_requirements')
        .select('id, name, description, min_points, min_events, applies_to, warning_threshold, is_mandatory, consequence')
        .eq('org_id', orgId).eq('term_id', termData.id).eq('is_deleted', false)
        .order('name');
      setRequirements((data ?? []) as Requirement[]);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form: Omit<Requirement, 'id'>) {
    if (!form.name.trim()) { Alert.alert('Required', 'Requirement name is required.'); return; }
    if (!term) { Alert.alert('No term', 'No active academic term found.'); return; }
    setSaving(true);
    if (editing) {
      const { error } = await supabase
        .from('status_requirements')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('id', editing.id);
      if (error) { Alert.alert('Error', error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase
        .from('status_requirements')
        .insert({ ...form, org_id: orgId, term_id: term.id });
      if (error) { Alert.alert('Error', error.message); setSaving(false); return; }
    }
    setSaving(false);
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function handleDelete(req: Requirement) {
    Alert.alert('Delete requirement', `Remove "${req.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('status_requirements')
            .update({ is_deleted: true, deleted_at: new Date().toISOString() })
            .eq('id', req.id);
          load();
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

  const formInitial = editing
    ? { name: editing.name, description: editing.description, min_points: editing.min_points,
        min_events: editing.min_events, applies_to: editing.applies_to,
        warning_threshold: editing.warning_threshold, is_mandatory: editing.is_mandatory,
        consequence: editing.consequence }
    : { ...BLANK };

  const list = (
    <View style={{ gap: 12 }}>
      {/* Term header */}
      {term ? (
        <View style={[s.termPill, { backgroundColor: c.primary + '14', borderColor: c.primary + '40' }]}>
          <Ionicons name="calendar-outline" size={14} color={c.primary} />
          <Text size="xs" weight="medium" color={c.primary}>
            {term.name} · {term.start_date} → {term.end_date}
          </Text>
        </View>
      ) : (
        <View style={[s.termPill, { backgroundColor: c.warning + '14', borderColor: c.warning + '40' }]}>
          <Ionicons name="alert-circle-outline" size={14} color={c.warning} />
          <Text size="xs" weight="medium" color={c.warning}>No active term — go to Settings → Date Terms to create one</Text>
        </View>
      )}

      {/* Add button */}
      {!!term && (
        <Pressable
          onPress={() => { setEditing(null); setShowForm(true); }}
          style={[s.addBtn, { borderColor: c.primary, backgroundColor: c.primary + '0f' }]}
        >
          <Ionicons name="add-circle-outline" size={18} color={c.primary} />
          <Text size="sm" weight="medium" color={c.primary}>Add requirement</Text>
        </Pressable>
      )}

      {requirements.length === 0 && !!term && (
        <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 32 }}>
          <Ionicons name="clipboard-outline" size={36} color={c.textSubtle} />
          <Text size="sm" color={c.textMuted} style={{ textAlign: 'center' }}>
            No requirements for this term.{'\n'}Add one to start tracking compliance.
          </Text>
        </Card>
      )}

      {requirements.map((req) => (
        <Card key={req.id} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text size="sm" weight="bold">{req.name}</Text>
                {req.is_mandatory && (
                  <View style={[s.badge, { backgroundColor: c.error + '14', borderColor: c.error + '40' }]}>
                    <Text size="xs" weight="medium" color={c.error}>Mandatory</Text>
                  </View>
                )}
              </View>
              {req.description ? <Text size="xs" color={c.textSubtle}>{req.description}</Text> : null}
              <Text size="xs" color={c.textMuted}>
                {req.min_points} pts min
                {req.min_events ? ` · ${req.min_events} events min` : ''}
                {' · '}at-risk below {req.warning_threshold}%
              </Text>
              <Text size="xs" color={c.textSubtle} style={{ textTransform: 'capitalize' }}>
                Applies to: {APPLIES_OPTIONS.find((o) => o.value === req.applies_to)?.label ?? req.applies_to}
              </Text>
              {req.consequence ? (
                <Text size="xs" color={c.warning}>Consequence: {req.consequence}</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pressable
                onPress={() => { setEditing(req); setShowForm(true); }}
                style={[s.iconBtn, { borderColor: c.border }]}
              >
                <Ionicons name="pencil-outline" size={15} color={c.textMuted} />
              </Pressable>
              <Pressable
                onPress={() => handleDelete(req)}
                style={[s.iconBtn, { borderColor: c.error + '40' }]}
              >
                <Ionicons name="trash-outline" size={15} color={c.error} />
              </Pressable>
            </View>
          </View>
        </Card>
      ))}
    </View>
  );

  const formPanel = showForm ? (
    <Card style={{ gap: 0 }}>
      <Text size="md" weight="bold" style={{ marginBottom: 16 }}>
        {editing ? 'Edit requirement' : 'New requirement'}
      </Text>
      <RequirementForm
        initial={formInitial}
        onSave={handleSave}
        onCancel={() => { setShowForm(false); setEditing(null); }}
        saving={saving}
      />
    </Card>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[s.header, {
        paddingTop: isWide ? 20 : insets.top + 12,
        backgroundColor: c.surface, borderBottomColor: c.border,
      }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={c.text} />
          <Text size="sm" weight="medium" color={c.text}>Status</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text size="xxl" weight="bold">Compliance Requirements</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            Define attendance & points thresholds for the active term
          </Text>
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
            <View style={{ flex: 1 }}>{list}</View>
            {showForm && <View style={{ width: 400 }}>{formPanel}</View>}
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {list}
            {formPanel}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4 },
  scroll:      { padding: 16, gap: 16 },
  scrollWide:  { padding: 32 },
  wideCols:    { flexDirection: 'row', gap: 24, alignItems: 'flex-start' },
  termPill:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, borderStyle: 'dashed' },
  badge:       { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  iconBtn:     { width: 32, height: 32, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
