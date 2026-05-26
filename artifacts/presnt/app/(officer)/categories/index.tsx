/**
 * Officer / Admin — Event Categories
 *
 * Per-org categories that can be tagged on events.
 * Each category has a name, optional description, and a color swatch.
 *
 * Desktop: 3-column grid
 * Mobile:  full-width list
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
}  from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, useAlert } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';

const DESKTOP = 768;

// ─── Palette of preset colors ─────────────────────────────────────────────────

const PRESET_COLORS = [
  '#E26B4A', // orange (default)
  '#EF4444', // red
  '#F59E0B', // amber
  '#22C55E', // green
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#CA8A04', // gold
  '#6B7280', // gray
  '#1C1917', // near-black
  '#FFFFFF', // white
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = {
  id:          string;
  name:        string;
  color:       string;
  description: string | null;
  created_at:  string | null;
};

type CategoryForm = {
  name:        string;
  color:       string;
  description: string;
};

const BLANK_FORM: CategoryForm = {
  name: '', color: PRESET_COLORS[0], description: ''
} ;

// ─── Color Swatch Picker ──────────────────────────────────────────────────────

function ColorPicker({
  value,
  onChange
} : {
  value: string;
  onChange: (c: string) => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [custom, setCustom] = useState('');

  return (
    <View style={{ gap: 10 }}>
      {/* Preset swatches */}
      <View style={cp.swatchGrid}>
        {PRESET_COLORS.map((col) => (
          <TouchableOpacity
            key={col}
            onPress={() => onChange(col)}
            style={[
              cp.swatch,
              { backgroundColor: col, borderColor: col === '#FFFFFF' ? c.border : col },
              value === col && cp.swatchSelected,
            ]}
          >
            {value === col && (
              <Ionicons
                name="checkmark"
                size={13}
                color={col === '#FFFFFF' || col === '#CA8A04' ? '#000' : '#fff'}
              />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Custom hex input */}
      <View style={[cp.hexRow, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
        {/* Live preview dot */}
        <View style={[cp.hexPreview, { backgroundColor: value }]} />
        <TextInput
          style={{ flex: 1, fontSize: 13, color: c.text, fontFamily: 'monospace' }}
          value={custom || value}
          onChangeText={(v) => {
            setCustom(v);
            if (/^#[0-9A-Fa-f]{6}$/.test(v)) onChange(v);
          }}
          onBlur={() => setCustom('')}
          placeholder="#RRGGBB"
          placeholderTextColor={c.textSubtle}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
        />
      </View>
    </View>
  );
}

const cp = StyleSheet.create({
  swatchGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch:         { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatchSelected: { borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  hexRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  hexPreview:     { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' }
} );

// ─── Category Form Modal ──────────────────────────────────────────────────────

function CategoryFormModal({
  visible,
  initial,
  onClose,
  onSave,
  onDelete,
  saving
} : {
  visible:  boolean;
  initial:  Category | null;
  onClose:  () => void;
  onSave:   (form: CategoryForm) => void;
  onDelete: (cat: Category) => void;
  saving:   boolean;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [form, setForm] = useState<CategoryForm>(BLANK_FORM);

  useEffect(() => {
    if (visible) {
      setForm(initial
        ? { name: initial.name, color: initial.color, description: initial.description ?? '' }
        : { ...BLANK_FORM });
    }
  }, [visible, initial]);

  const set = <K extends keyof CategoryForm>(k: K) =>
    (v: CategoryForm[K]) => setForm(f => ({ ...f, [k]: v }));

  const inputStyle = [cf.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }];
  const isEdit = !!initial;

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={cf.overlay}>
        <View style={[cf.sheet, { backgroundColor: c.surface }]}>
          <View style={[cf.handle, { backgroundColor: c.border }]} />

          {/* Header */}
          <View style={cf.sheetHeader}>
            <Text size="xl" weight="bold">{isEdit ? 'Edit category' : 'New category'}</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={20} color={c.textMuted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Preview badge */}
            <View style={cf.previewRow}>
              <View style={[cf.previewBadge, { backgroundColor: form.color + '20', borderColor: form.color }]}>
                <View style={[cf.previewDot, { backgroundColor: form.color }]} />
                <Text size="sm" weight="medium" color={form.color}>
                  {form.name || 'Category name'}
                </Text>
              </View>
            </View>

            {/* Name */}
            <Text size="xs" weight="medium" color={c.textMuted} style={cf.label}>Name *</Text>
            <TextInput
              style={[inputStyle, { marginBottom: 16 }]}
              value={form.name}
              onChangeText={set('name')}
              placeholder="e.g. Philanthropy, Brotherhood, Academic"
              placeholderTextColor={c.textSubtle}
              autoCapitalize="words"
            />

            {/* Description */}
            <Text size="xs" weight="medium" color={c.textMuted} style={cf.label}>Description</Text>
            <TextInput
              style={[inputStyle, { marginBottom: 16, height: 72, textAlignVertical: 'top', paddingTop: 10 }]}
              value={form.description}
              onChangeText={set('description')}
              placeholder="Optional — shown on event detail pages"
              placeholderTextColor={c.textSubtle}
              multiline
            />

            {/* Color */}
            <Text size="xs" weight="medium" color={c.textMuted} style={cf.label}>Color</Text>
            <ColorPicker value={form.color} onChange={set('color')} />

            {/* Actions */}
            <View style={[cf.actionRow, { marginTop: 24 }]}>
              <Pressable onPress={onClose}
                style={[cf.cancelBtn, { borderColor: c.border, flex: 1 }]}>
                <Text size="sm" weight="medium">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => onSave(form)}
                disabled={saving || !form.name.trim()}
                style={[cf.saveBtn, { backgroundColor: c.primary, flex: 2, opacity: saving || !form.name.trim() ? 0.5 : 1 }]}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text size="sm" weight="bold" style={{ color: '#fff' }}>
                      {isEdit ? 'Save changes' : 'Create category'}
                    </Text>
                }
              </Pressable>
            </View>

            {/* Delete — edit only */}
            {isEdit && (
              <Pressable
                onPress={() => onDelete(initial!)}
                style={[cf.deleteBtn, { borderColor: '#EF4444', marginTop: 12, marginBottom: 8 }]}
              >
                <Ionicons name="trash-outline" size={14} color="#EF4444" />
                <Text size="sm" weight="medium" color="#EF4444">Delete category</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const cf = StyleSheet.create({
  overlay:     { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '92%' },
  handle:      { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  label:       { textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 },
  input:       { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  previewRow:  { marginBottom: 20, alignItems: 'flex-start' },
  previewBadge:{ flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  previewDot:  { width: 8, height: 8, borderRadius: 4 },
  actionRow:   { flexDirection: 'row', gap: 10 },
  cancelBtn:   { borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  saveBtn:     { borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  deleteBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 12 }
} );

// ─── Category Card ────────────────────────────────────────────────────────────

function CategoryCard({
  category,
  usageCount,
  onEdit
} : {
  category:   Category;
  usageCount: number;
  onEdit:     () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  return (
    <Pressable
      onPress={onEdit}
      style={({ pressed }) => [
        cc.card,
        { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {/* Color bar */}
      <View style={[cc.colorBar, { backgroundColor: category.color }]} />

      <View style={cc.body}>
        <View style={cc.titleRow}>
          {/* Color dot + name */}
          <View style={[cc.dot, { backgroundColor: category.color }]} />
          <Text size="md" weight="medium" style={{ flex: 1 }} numberOfLines={1}>
            {category.name}
          </Text>
          {/* Edit icon */}
          <Pressable onPress={onEdit} style={cc.editBtn} hitSlop={8}>
            <Ionicons name="create-outline" size={15} color={c.textSubtle} />
          </Pressable>
        </View>

        {category.description ? (
          <Text size="xs" color={c.textMuted} numberOfLines={2} style={{ marginTop: 4 }}>
            {category.description}
          </Text>
        ) : null}

        <View style={[cc.badge, { backgroundColor: c.surfaceAlt }]}>
          <Ionicons name="calendar-outline" size={11} color={c.textSubtle} />
          <Text size="xs" color={c.textMuted}>
            {usageCount} event{usageCount !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const cc = StyleSheet.create({
  card:      { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  colorBar:  { height: 5 },
  body:      { padding: 14, gap: 6 },
  titleRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:       { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  editBtn:   { padding: 4 },
  badge:     { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 }
} );

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CategoriesScreen() {
  const { theme }       = useThemeStore();
  const insets          = useSafeAreaInsets();
  const { membership, profile } = useAuthStore();
  const userView        = useUserViewStore((s) => s.session);
  const { width }       = useWindowDimensions();
  const { confirm } = useAlert();
  const isWide          = width >= DESKTOP;
  const c               = theme.colors;

  const orgId = userView?.org.id ?? membership?.org_id ?? '';

  const [categories, setCategories] = useState<Category[]>([]);
  const [usageMap,   setUsageMap]   = useState<Record<string, number>>({});
  const [loading,    setLoading]    = useState(true);
  const [refresh,    setRefresh]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [editing,    setEditing]    = useState<Category | null | false>(false);
  const [saving,     setSaving]     = useState(false);

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    const [catRes, evRes] = await Promise.all([
      supabase
        .from('event_categories')
        .select('id, name, color, description, created_at')
        .eq('org_id', orgId)
        .eq('is_deleted', false)
        .order('name'),

      supabase
        .from('events')
        .select('category_id')
        .eq('org_id', orgId)
        .eq('is_deleted', false)
        .not('category_id', 'is', null),
    ]);

    const usage: Record<string, number> = {};
    for (const ev of evRes.data ?? []) {
      if (ev.category_id) usage[ev.category_id] = (usage[ev.category_id] ?? 0) + 1;
    }

    setCategories((catRes.data ?? []) as Category[]);
    setUsageMap(usage);
    setLoading(false);
    setRefresh(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const displayed = categories.filter(cat =>
    !search ||
    cat.name.toLowerCase().includes(search.toLowerCase()) ||
    (cat.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  async function handleSave(form: CategoryForm) {
    if (!orgId) return;
    setSaving(true);
    try {
      const payload = {
        name:        form.name.trim(),
        color:       form.color,
        description: form.description.trim() || null
} ;
      const editingCat = editing === false || editing === null ? null : editing;
      if (editingCat?.id) {
        await supabase
          .from('event_categories')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingCat.id);
      } else {
        await supabase
          .from('event_categories')
          .insert({ ...payload, org_id: orgId, created_by: profile?.id ?? null });
      }
      await load();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(cat: Category) {
    // If this category has events, ask where to move them first
    const eventCount = usageMap[cat.id] ?? 0;
    const otherCats  = categories.filter(c => c.id !== cat.id);

    const doDelete = async (replacementId: string | null) => {
      setSaving(true);
      try {
        // Reassign events to chosen category (or null = uncategorised)
        if (eventCount > 0) {
          await supabase
            .from('events')
            .update({ category_id: replacementId })
            .eq('category_id', cat.id)
            .eq('is_deleted', false);
        }
        // Soft-delete the category
        await supabase
          .from('event_categories')
          .update({ is_deleted: true, updated_at: new Date().toISOString() })
          .eq('id', cat.id);
        await load();
        setEditing(false);
      } finally {
        setSaving(false);
      }
    };

    if (eventCount === 0 || otherCats.length === 0) {
      // No events to migrate, or no other categories to migrate to — just delete
      confirm(
        'Delete category',
        eventCount > 0
          ? `"${cat.name}" has ${eventCount} event${eventCount !== 1 ? 's' : ''} — they will become uncategorised.`
          : `Delete "${cat.name}"?`,
        () => doDelete(null),
        { confirmLabel: 'Delete', destructive: true }
      );
      return;
    }

    // Has events AND other categories exist — show reassignment picker
    // Multi-option Alert.alert doesn't work on web; fall back to confirm with "leave uncategorised"
    confirm(
      'Move events before deleting',
      `"${cat.name}" has ${eventCount} event${eventCount !== 1 ? 's' : ''}. Events will be left uncategorised.`,
      () => doDelete(null),
      { confirmLabel: 'Delete & uncategorise', destructive: true }
    );
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
      <View style={[ls.header, {
        paddingTop: isWide ? 20 : insets.top + 12,
        backgroundColor: c.background,
        borderBottomColor: c.border
} ]}>
        <Pressable onPress={() => router.back()} style={ls.backBtn}>
          <Ionicons name="arrow-back" size={16} color={c.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text size="xxl" weight="bold">Categories</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}
          </Text>
        </View>

        {isWide && (
          <View style={[ls.desktopSearch, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
            <Ionicons name="search-outline" size={15} color={c.textSubtle} />
            <TextInput
              style={{ flex: 1, fontSize: 14, color: c.text }}
              value={search}
              onChangeText={setSearch}
              placeholder="Search categories…"
              placeholderTextColor={c.textSubtle}
            />
          </View>
        )}

        <Pressable onPress={() => setEditing(null)} style={[ls.newBtn, { backgroundColor: c.primary }]}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text size="sm" weight="medium" style={{ color: '#fff' }}>
            {isWide ? 'New category' : 'New'}
          </Text>
        </Pressable>
      </View>

      {/* Mobile search bar */}
      {!isWide && (
        <View style={[ls.mobileSearch, { backgroundColor: c.background, borderBottomColor: c.border }]}>
          <View style={[ls.searchBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
            <Ionicons name="search-outline" size={15} color={c.textSubtle} />
            <TextInput
              style={{ flex: 1, fontSize: 14, color: c.text }}
              value={search}
              onChangeText={setSearch}
              placeholder="Search categories…"
              placeholderTextColor={c.textSubtle}
            />
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[
          ls.grid,
          isWide && ls.gridWide,
          !isWide && { paddingBottom: insets.bottom + 24 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refresh}
            onRefresh={() => { setRefresh(true); load(); }}
            tintColor={c.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {displayed.length === 0 ? (
          <View style={ls.empty}>
            <Ionicons name="pricetag-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              {search ? `No categories matching "${search}"` : 'No categories yet'}
            </Text>
            {!search && (
              <Pressable onPress={() => setEditing(null)} style={{ marginTop: 12 }}>
                <Text size="sm" color={c.primary} weight="medium">+ Create your first category</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            {displayed.map((cat) => (
              <View key={cat.id} style={isWide ? ls.gridItem : ls.listItem}>
                <CategoryCard
                  category={cat}
                  usageCount={usageMap[cat.id] ?? 0}
                  onEdit={() => setEditing(cat)}
                />
              </View>
            ))}
            {/* Ghost "add" card on desktop */}
            {isWide && (
              <View style={ls.gridItem}>
                <Pressable
                  onPress={() => setEditing(null)}
                  style={[ls.ghostCard, { borderColor: c.border }]}
                >
                  <Ionicons name="add" size={28} color={c.textSubtle} />
                  <Text size="sm" color={c.textSubtle} style={{ marginTop: 8 }}>New category</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <CategoryFormModal
        visible={editing !== false}
        initial={editing || null}
        onClose={() => setEditing(false)}
        onSave={handleSave}
        onDelete={handleDelete}
        saving={saving}
      />
    </View>
  );
}

const ls = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:       { width: 32, height: 32, borderRadius: 8, backgroundColor: '#0000000A', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  desktopSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, width: 220 },
  newBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, flexShrink: 0 },
  mobileSearch:  { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  searchBox:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  grid:          { padding: 16, paddingBottom: 48, gap: 12 },
  gridWide:      { flexDirection: 'row', flexWrap: 'wrap', gap: 20, padding: 24, alignItems: 'flex-start' },
  gridItem:      { width: '31%', minWidth: 240 },
  listItem:      { width: '100%' },
  ghostCard:     { borderWidth: 1.5, borderRadius: 14, borderStyle: 'dashed', height: 140, alignItems: 'center', justifyContent: 'center' },
  empty:         { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }
} );
