/**
 * Saved Locations
 *
 * Desktop: 3-column grid with map-preview placeholder, name, address, usage count, Use button
 * Mobile:  vertical list with same info + map preview placeholder
 *
 * Officers can create new locations, edit name/address/radius, delete.
 * Shared between officer and admin portals (admin links here from events form).
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
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';

const DESKTOP = 768;

// ─── Types ────────────────────────────────────────────────────────────────────

type OrgLocation = {
  id:            string;
  name:          string;
  address:       string | null;
  latitude:      number | null;
  longitude:     number | null;
  radius_meters: number | null;
  created_at:    string | null;
};

type LocationForm = {
  name:          string;
  address:       string;
  radius_meters: string;
};

const BLANK_FORM: LocationForm = { name: '', address: '', radius_meters: '100' };

// ─── Location Form Modal ──────────────────────────────────────────────────────

function LocationFormModal({
  visible,
  initial,
  onClose,
  onSave,
  saving,
}: {
  visible: boolean;
  initial: OrgLocation | null;
  onClose: () => void;
  onSave:  (form: LocationForm) => void;
  saving:  boolean;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [form, setForm] = useState<LocationForm>(BLANK_FORM);

  useEffect(() => {
    if (visible) {
      setForm(initial ? {
        name:          initial.name,
        address:       initial.address ?? '',
        radius_meters: String(initial.radius_meters ?? 100),
      } : { ...BLANK_FORM });
    }
  }, [visible, initial]);

  const set = <K extends keyof LocationForm>(k: K) => (v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const inputStyle = [lf.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }];

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={lf.overlay}>
        <View style={[lf.sheet, { backgroundColor: c.surface }]}>
          <View style={[lf.handle, { backgroundColor: c.border }]} />
          <Text size="xl" weight="bold" style={{ marginBottom: 20 }}>
            {initial ? 'Edit Location' : 'New Location'}
          </Text>

          <Text size="xs" weight="medium" color={c.textMuted} style={lf.label}>Name *</Text>
          <TextInput
            style={[inputStyle, { marginBottom: 14 }]}
            value={form.name}
            onChangeText={set('name')}
            placeholder="e.g. Chapter House, Library Room 204"
            placeholderTextColor={c.textSubtle}
          />

          <Text size="xs" weight="medium" color={c.textMuted} style={lf.label}>Address</Text>
          <TextInput
            style={[inputStyle, { marginBottom: 14 }]}
            value={form.address}
            onChangeText={set('address')}
            placeholder="Street address or building"
            placeholderTextColor={c.textSubtle}
          />

          <Text size="xs" weight="medium" color={c.textMuted} style={lf.label}>
            Geofence Radius (meters)
          </Text>
          <TextInput
            style={[inputStyle, { marginBottom: 24 }]}
            value={form.radius_meters}
            onChangeText={set('radius_meters')}
            keyboardType="number-pad"
            placeholder="100"
            placeholderTextColor={c.textSubtle}
          />

          {/* Map preview placeholder */}
          <View style={[lf.mapPreview, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
            <Ionicons name="map-outline" size={32} color={c.textSubtle} />
            <Text size="sm" color={c.textSubtle} style={{ marginTop: 8 }}>Map preview</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <Pressable onPress={onClose} style={[lf.cancelBtn, { borderColor: c.border, flex: 1 }]}>
              <Text size="sm" weight="medium">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(form)}
              disabled={saving || !form.name.trim()}
              style={[lf.saveBtn, { backgroundColor: c.primary, flex: 1, opacity: saving ? 0.6 : 1 }]}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text size="sm" weight="bold" style={{ color: '#fff' }}>Save</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const lf = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  label:      { textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 },
  input:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  mapPreview: { height: 120, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancelBtn:  { borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  saveBtn:    { borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
});

// ─── Location Card ────────────────────────────────────────────────────────────

function LocationCard({
  location,
  usageCount,
  onEdit,
  onDelete,
  onUse,
}: {
  location:   OrgLocation;
  usageCount: number;
  onEdit:     () => void;
  onDelete:   () => void;
  onUse?:     () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <View style={[lc.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* Map preview */}
      <View style={[lc.mapPreview, { backgroundColor: c.surfaceAlt }]}>
        <Ionicons name="map-outline" size={28} color={c.textSubtle} />
        <Text size="xs" color={c.textSubtle} style={{ marginTop: 6 }}>map preview</Text>
      </View>

      {/* Info */}
      <View style={lc.info}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flex: 1 }}>
          <View style={{ flex: 1 }}>
            <Text size="sm" weight="medium" numberOfLines={1}>{location.name}</Text>
            {location.address && (
              <Text size="xs" color={c.textSubtle} numberOfLines={1} style={{ marginTop: 2 }}>
                {location.address}
              </Text>
            )}
          </View>

          {/* Radius pill */}
          <View style={[lc.radiusPill, { backgroundColor: c.surfaceAlt }]}>
            <Text size="xs" color={c.textMuted}>{location.radius_meters ?? 100}m</Text>
          </View>

          {/* Menu */}
          <View style={{ position: 'relative' }}>
            <Pressable onPress={() => setMenuOpen(!menuOpen)} style={{ padding: 4 }}>
              <Text size="md" color={c.textSubtle}>···</Text>
            </Pressable>
            {menuOpen && (
              <View style={[lc.menu, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Pressable onPress={() => { setMenuOpen(false); onEdit(); }}
                  style={[lc.menuItem, { borderBottomColor: c.border }]}>
                  <Text size="sm">Edit</Text>
                </Pressable>
                <Pressable onPress={() => { setMenuOpen(false); onDelete(); }} style={lc.menuItem}>
                  <Text size="sm" color="#EF4444">Delete</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Usage + Use button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <Text size="xs" color={c.textSubtle}>
            Used in {usageCount} event{usageCount !== 1 ? 's' : ''}
          </Text>
          {onUse && (
            <Pressable onPress={onUse} style={[lc.useBtn, { borderColor: c.border }]}>
              <Text size="xs" weight="medium">Use</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const lc = StyleSheet.create({
  card:       { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  mapPreview: { height: 120, alignItems: 'center', justifyContent: 'center' },
  info:       { padding: 14 },
  radiusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  menu:       { position: 'absolute', right: 0, top: 24, zIndex: 200, borderWidth: 1, borderRadius: 10, width: 110, overflow: 'hidden' },
  menuItem:   { padding: 12, borderBottomWidth: 1 },
  useBtn:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LocationsScreen() {
  const { theme }      = useThemeStore();
  const insets         = useSafeAreaInsets();
  const { organization, profile } = useAuthStore();
  const userView       = useUserViewStore((s) => s.session);
  const { width }      = useWindowDimensions();
  const isWide         = width >= DESKTOP;
  const c = theme.colors;

  const orgId = userView?.org.id ?? organization?.id ?? '';

  const [locations,  setLocations]  = useState<OrgLocation[]>([]);
  const [usageMap,   setUsageMap]   = useState<Record<string, number>>({});
  const [loading,    setLoading]    = useState(true);
  const [refresh,    setRefresh]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [editing,    setEditing]    = useState<OrgLocation | null | false>(false);
  const [saving,     setSaving]     = useState(false);

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    const [locRes, eventsRes] = await Promise.all([
      supabase
        .from('org_locations')
        .select('id, name, address, latitude, longitude, radius_meters, created_at')
        .eq('org_id', orgId)
        .eq('is_deleted', false)
        .order('name'),

      supabase
        .from('events')
        .select('location_id')
        .eq('org_id', orgId)
        .eq('is_deleted', false)
        .not('location_id', 'is', null),
    ]);

    const usage: Record<string, number> = {};
    for (const ev of eventsRes.data ?? []) {
      if (ev.location_id) usage[ev.location_id] = (usage[ev.location_id] ?? 0) + 1;
    }

    setLocations((locRes.data ?? []) as OrgLocation[]);
    setUsageMap(usage);
    setLoading(false);
    setRefresh(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const displayed = locations.filter(l =>
    !search ||
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.address ?? '').toLowerCase().includes(search.toLowerCase())
  );

  async function handleSave(form: LocationForm) {
    if (!orgId) return;
    setSaving(true);
    try {
      const payload = {
        name:          form.name.trim(),
        address:       form.address.trim() || null,
        radius_meters: parseInt(form.radius_meters) || 100,
      };
      if (editing && editing !== false && 'id' in editing) {
        await supabase.from('org_locations').update(payload).eq('id', editing.id);
      } else {
        await supabase.from('org_locations').insert({ ...payload, org_id: orgId, created_by: profile?.id ?? null });
      }
      await load();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(loc: OrgLocation) {
    Alert.alert('Delete Location', `Delete "${loc.name}"? Events using it won't be affected.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('org_locations').update({ is_deleted: true }).eq('id', loc.id);
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
      <View style={[ls.header, { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.background, borderBottomColor: c.border }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* Back — always show since this is a sub-page */}
            <Pressable onPress={() => router.back()} style={ls.backBtn}>
              <Ionicons name="arrow-back" size={16} color={c.text} />
            </Pressable>
            <Text size="xxl" weight="bold">Saved locations</Text>
          </View>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2, marginLeft: isWide ? 0 : 42 }}>
            Reusable venues with geofence radius
          </Text>
        </View>

        {/* Search — desktop inline */}
        {isWide && (
          <View style={[ls.desktopSearch, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
            <Ionicons name="search-outline" size={15} color={c.textSubtle} />
            <TextInput
              style={{ flex: 1, fontSize: 14, color: c.text }}
              value={search}
              onChangeText={setSearch}
              placeholder="Search locations…"
              placeholderTextColor={c.textSubtle}
            />
          </View>
        )}

        <Pressable
          onPress={() => setEditing(null)}
          style={[ls.newBtn, { backgroundColor: c.primary }]}
        >
          <Text size="sm" weight="medium" style={{ color: '#fff' }}>+ New location</Text>
        </Pressable>
      </View>

      {/* Mobile search */}
      {!isWide && (
        <View style={[ls.mobileSearch, { backgroundColor: c.background, borderBottomColor: c.border }]}>
          <View style={[ls.searchBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
            <Ionicons name="search-outline" size={15} color={c.textSubtle} />
            <TextInput
              style={{ flex: 1, fontSize: 14, color: c.text }}
              value={search}
              onChangeText={setSearch}
              placeholder="Search locations…"
              placeholderTextColor={c.textSubtle}
            />
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[ls.grid, isWide && ls.gridWide]}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(); }} tintColor={c.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {displayed.length === 0 && !loading ? (
          <View style={ls.empty}>
            <Ionicons name="location-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              No saved locations
            </Text>
            <Pressable onPress={() => setEditing(null)} style={{ marginTop: 12 }}>
              <Text size="sm" color={c.primary} weight="medium">+ Save a venue</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {displayed.map((loc) => (
              <View key={loc.id} style={isWide ? ls.gridItem : ls.listItem}>
                <LocationCard
                  location={loc}
                  usageCount={usageMap[loc.id] ?? 0}
                  onEdit={() => setEditing(loc)}
                  onDelete={() => handleDelete(loc)}
                />
              </View>
            ))}
            {/* "Save a venue" ghost card — desktop only */}
            {isWide && (
              <View style={ls.gridItem}>
                <Pressable
                  onPress={() => setEditing(null)}
                  style={[ls.ghostCard, { borderColor: c.border }]}
                >
                  <Ionicons name="add" size={28} color={c.textSubtle} />
                  <Text size="sm" color={c.textSubtle} style={{ marginTop: 8 }}>Save a venue</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <LocationFormModal
        visible={editing !== false}
        initial={editing || null}
        onClose={() => setEditing(false)}
        onSave={handleSave}
        saving={saving}
      />
    </View>
  );
}

const ls = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:      { width: 32, height: 32, borderRadius: 8, backgroundColor: '#0000000A', alignItems: 'center', justifyContent: 'center' },
  desktopSearch:{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, width: 220 },
  newBtn:       { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 },
  mobileSearch: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  searchBox:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  grid:         { padding: 16, paddingBottom: 48, gap: 12 },
  gridWide:     { flexDirection: 'row', flexWrap: 'wrap', gap: 20, padding: 24, alignItems: 'flex-start' },
  gridItem:     { width: '31%', minWidth: 260 },
  listItem:     { width: '100%' },
  ghostCard:    { borderWidth: 1.5, borderRadius: 16, borderStyle: 'dashed', height: 200, alignItems: 'center', justifyContent: 'center' },
  empty:        { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
});
