/**
 * Officer — Saved Locations
 *
 * Desktop: 3-column grid — map thumbnail, name, address, radius, usage count
 * Mobile:  vertical list, same info
 *
 * Create / edit a location:
 *   - Name + address text inputs
 *   - Geofence radius stepper
 *   - "Pick on map" → MapPickerModal (Mapbox on web, GPS on native)
 *   - Lat / lng stored in org_locations.latitude / longitude
 *
 * Map preview in each card:
 *   - Web: static Mapbox image (if token set)
 *   - Native: SVG radar placeholder with coords
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';

import { Text } from '@/components/ui';
import { MapPickerModal } from '@/lib/MapPicker';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';

const DESKTOP = 768;
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

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
  radius_meters: number;
  latitude:      number | null;
  longitude:     number | null;
};

const BLANK_FORM: LocationForm = {
  name: '', address: '', radius_meters: 100, latitude: null, longitude: null,
};

// ─── Map preview ──────────────────────────────────────────────────────────────

function MapPreview({
  lat,
  lng,
  radiusM,
  height = 140,
}: {
  lat?:    number | null;
  lng?:    number | null;
  radiusM?: number | null;
  height?: number;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const hasCoords = !!lat && !!lng;

  // Web: use Mapbox static image
  if (Platform.OS === 'web' && hasCoords && MAPBOX_TOKEN) {
    const zoom = 15;
    const w = 400, h = height * 2; // 2× for retina
    const url = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${lng},${lat},${zoom}/${w}x${h}@2x?access_token=${MAPBOX_TOKEN}`;
    return (
      <View style={{ height, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
        <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="map" />
        {/* Overlay pin */}
        <View style={[mp2.pinOverlay]}>
          <View style={[mp2.pin, { backgroundColor: c.primary }]} />
        </View>
      </View>
    );
  }

  // Native / no token: SVG placeholder
  return (
    <View style={[{ height, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceAlt }]}>
      <Svg width={height * 0.9} height={height * 0.9} viewBox="0 0 100 100">
        {/* Grid lines */}
        <Line x1={0} y1={50} x2={100} y2={50} stroke={c.border} strokeWidth={1} />
        <Line x1={50} y1={0} x2={50} y2={100} stroke={c.border} strokeWidth={1} />
        {/* Rings */}
        <Circle cx={50} cy={50} r={40} fill="none" stroke={c.border} strokeWidth={0.8} />
        <Circle cx={50} cy={50} r={25} fill="none" stroke={c.border} strokeWidth={0.8} />
        {/* Geofence */}
        <Circle cx={50} cy={50} r={36} fill={c.primary + '1A'} stroke={c.primary + '80'} strokeWidth={1.5} strokeDasharray="3 2" />
        {/* Center */}
        <Circle cx={50} cy={50} r={7} fill={hasCoords ? c.primary : c.border} />
        <Circle cx={50} cy={50} r={3} fill="#fff" />
      </Svg>
      {hasCoords && (
        <Text size="xs" color={c.textSubtle} style={{ position: 'absolute', bottom: 6 }}>
          {lat!.toFixed(4)}, {lng!.toFixed(4)}
        </Text>
      )}
    </View>
  );
}

const mp2 = StyleSheet.create({
  pinOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pin:        { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff' },
});

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

  const [form, setForm]           = useState<LocationForm>(BLANK_FORM);
  const [showMapPicker, setShowMapPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(initial ? {
        name:          initial.name,
        address:       initial.address ?? '',
        radius_meters: initial.radius_meters ?? 100,
        latitude:      initial.latitude ?? null,
        longitude:     initial.longitude ?? null,
      } : { ...BLANK_FORM });
    }
  }, [visible, initial]);

  const set = <K extends keyof LocationForm>(k: K) => (v: LocationForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const inputStyle = [lf.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }];

  const hasCoords = form.latitude != null && form.longitude != null;

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={lf.overlay}>
          <View style={[lf.sheet, { backgroundColor: c.surface }]}>
            <View style={[lf.handle, { backgroundColor: c.border }]} />

            <Text size="xl" weight="bold" style={{ marginBottom: 20 }}>
              {initial ? 'Edit Location' : 'New Location'}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Map preview / pick button */}
              <View style={[lf.mapCard, { borderColor: c.border, overflow: 'hidden' }]}>
                <MapPreview
                  lat={form.latitude}
                  lng={form.longitude}
                  radiusM={form.radius_meters}
                  height={160}
                />
                <Pressable
                  onPress={() => setShowMapPicker(true)}
                  style={[lf.pickMapBtn, { backgroundColor: c.primary }]}
                >
                  <Ionicons name="map-outline" size={14} color="#fff" />
                  <Text size="sm" weight="bold" style={{ color: '#fff' }}>
                    {hasCoords ? 'Adjust on map' : 'Pick on map'}
                  </Text>
                </Pressable>
              </View>

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

              {/* Radius stepper */}
              <Text size="xs" weight="medium" color={c.textMuted} style={lf.label}>
                Geofence Radius (meters)
              </Text>
              <View style={lf.stepperRow}>
                <Pressable
                  onPress={() => set('radius_meters')(Math.max(25, form.radius_meters - 25))}
                  style={[lf.stepBtn, { borderColor: c.border }]}
                >
                  <Text size="md" color={c.text}>−</Text>
                </Pressable>
                <TextInput
                  style={[lf.radiusInput, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
                  value={String(form.radius_meters)}
                  onChangeText={(v) => set('radius_meters')(parseInt(v) || 100)}
                  keyboardType="number-pad"
                />
                <Pressable
                  onPress={() => set('radius_meters')(Math.min(500, form.radius_meters + 25))}
                  style={[lf.stepBtn, { borderColor: c.border }]}
                >
                  <Text size="md" color={c.text}>+</Text>
                </Pressable>
                <Text size="xs" color={c.textMuted}>m</Text>
              </View>

              {/* Coords readout */}
              {hasCoords && (
                <View style={[lf.coordCard, { backgroundColor: c.surfaceAlt }]}>
                  <Ionicons name="location" size={13} color={c.primary} />
                  <Text size="xs" color={c.textMuted}>
                    {form.latitude?.toFixed(6)}, {form.longitude?.toFixed(6)}
                  </Text>
                  <Pressable onPress={() => setForm(f => ({ ...f, latitude: null, longitude: null }))}>
                    <Ionicons name="close-circle" size={16} color={c.textSubtle} />
                  </Pressable>
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
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
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Map picker — rendered outside the sheet modal so it stacks above */}
      <MapPickerModal
        visible={showMapPicker}
        initialLat={form.latitude ?? 0}
        initialLng={form.longitude ?? 0}
        radiusMeters={form.radius_meters}
        onConfirm={({ lat, lng, address }) => {
          setForm(f => ({
            ...f,
            latitude:  lat || null,
            longitude: lng || null,
            address:   address || f.address,
          }));
          setShowMapPicker(false);
        }}
        onClose={() => setShowMapPicker(false)}
      />
    </>
  );
}

const lf = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '90%' },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  label:      { textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 },
  input:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  mapCard:    { borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginBottom: 20 },
  pickMapBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, margin: 10, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignSelf: 'flex-start' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  stepBtn:    { width: 40, height: 40, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  radiusInput:{ flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, textAlign: 'center' },
  coordCard:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 4 },
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
      <MapPreview
        lat={location.latitude}
        lng={location.longitude}
        radiusM={location.radius_meters}
        height={130}
      />

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
            {location.latitude && location.longitude && (
              <Text size="xs" color={c.textSubtle} style={{ marginTop: 1 }}>
                {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
              </Text>
            )}
          </View>

          {/* Radius pill */}
          <View style={[lc.radiusPill, { backgroundColor: c.primary + '18', borderColor: c.primary + '50', borderWidth: 1 }]}>
            <Ionicons name="radio-button-on" size={10} color={c.primary} />
            <Text size="xs" color={c.primary} weight="medium">{location.radius_meters ?? 100}m</Text>
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
  info:       { padding: 14 },
  radiusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  menu:       { position: 'absolute', right: 0, top: 24, zIndex: 200, borderWidth: 1, borderRadius: 10, width: 110, overflow: 'hidden' },
  menuItem:   { padding: 12, borderBottomWidth: 1 },
  useBtn:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LocationsScreen() {
  const { theme }      = useThemeStore();
  const insets         = useSafeAreaInsets();
  const { membership, profile } = useAuthStore();
  const userView       = useUserViewStore((s) => s.session);
  const { width }      = useWindowDimensions();
  const isWide         = width >= DESKTOP;
  const c = theme.colors;

  const orgId = userView?.org.id ?? membership?.org_id ?? '';

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
        latitude:      form.latitude ?? null,
        longitude:     form.longitude ?? null,
        radius_meters: form.radius_meters,
      };
      const editingLoc: OrgLocation | null = editing === false || editing === null ? null : editing;
      if (editingLoc?.id) {
        await supabase.from('org_locations').update(payload).eq('id', editingLoc.id);
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
            <Pressable onPress={() => router.back()} style={ls.backBtn}>
              <Ionicons name="arrow-back" size={16} color={c.text} />
            </Pressable>
            <Text size="xxl" weight="bold">Saved locations</Text>
          </View>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2, marginLeft: isWide ? 0 : 42 }}>
            Reusable venues with geofence radius
          </Text>
        </View>

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
        contentContainerStyle={[ls.grid, isWide && ls.gridWide, !isWide && { paddingBottom: insets.bottom + 24 }]}
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
  ghostCard:    { borderWidth: 1.5, borderRadius: 16, borderStyle: 'dashed', height: 220, alignItems: 'center', justifyContent: 'center' },
  empty:        { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
});
