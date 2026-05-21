/**
 * lib/MapPicker.web.tsx  (WEB only)
 *
 * Uses react-leaflet + OpenStreetMap / CartoDB tiles — no API key required.
 *
 * Features:
 *   - Address search input → forward geocode (Nominatim) → moves pin
 *   - Click-to-place pin
 *   - Draggable marker
 *   - Geofence circle overlay
 *   - Reverse geocode when pin moves
 *   - ♡ Favourite button — saves location to org_locations
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

// ─── Shared type ──────────────────────────────────────────────────────────────

export type MapPickerResult = {
  lat:     number;
  lng:     number;
  address: string;
};

// ─── Geocoding helpers ────────────────────────────────────────────────────────

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'Presnt/1.0' } },
    );
    const data = await res.json();
    return data?.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

async function forwardGeocode(query: string): Promise<{ lat: number; lng: number; display: string } | null> {
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'Presnt/1.0' } },
    );
    const data = await res.json();
    if (!data?.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name };
  } catch {
    return null;
  }
}

// ─── Leaflet CSS ──────────────────────────────────────────────────────────────

let cssInjected = false;
function useLeafletCSS() {
  const [ready, setReady] = useState(cssInjected);
  useEffect(() => {
    if (cssInjected) { setReady(true); return; }
    const link  = document.createElement('link');
    link.rel    = 'stylesheet';
    link.href   = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.onload = () => { cssInjected = true; setReady(true); };
    document.head.appendChild(link);
  }, []);
  return ready;
}

// ─── Geofence polygon ────────────────────────────────────────────────────────

function buildCirclePoints(lat: number, lng: number, radiusMeters: number): [number, number][] {
  const pts = 64; const km = radiusMeters / 1000;
  const coords: [number, number][] = [];
  for (let i = 0; i < pts; i++) {
    const a = (i * 360) / pts;
    const dx = km * Math.cos((a * Math.PI) / 180);
    const dy = km * Math.sin((a * Math.PI) / 180);
    coords.push([lat + dy / 111.32, lng + dx / (111.32 * Math.cos((lat * Math.PI) / 180))]);
  }
  coords.push(coords[0]);
  return coords;
}

const DEFAULT_LAT = 37.7749;
const DEFAULT_LNG = -122.4194;

// ─── Map ──────────────────────────────────────────────────────────────────────

function WebMap({
  lat, lng, radiusMeters, onMove,
}: {
  lat: number; lng: number; radiusMeters: number;
  onMove: (lat: number, lng: number) => void;
}) {
  const c        = useThemeStore(s => s.theme.colors);
  const cssReady = useLeafletCSS();

  const [markerLat, setMarkerLat] = useState(lat || DEFAULT_LAT);
  const [markerLng, setMarkerLng] = useState(lng || DEFAULT_LNG);

  // Expose imperative "fly to" for the address search
  const flyRef = useRef<((lat: number, lng: number) => void) | null>(null);

  useEffect(() => {
    if (lat !== 0 || lng !== 0) { setMarkerLat(lat); setMarkerLng(lng); }
  }, [lat, lng]);

  const circlePoints = useMemo(
    () => buildCirclePoints(markerLat, markerLng, radiusMeters),
    [markerLat, markerLng, radiusMeters],
  );

  if (!cssReady) {
    return (
      <View style={[wm.mapContainer, { alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceAlt }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  const L  = require('leaflet') as typeof import('leaflet');
  const RL = require('react-leaflet') as typeof import('react-leaflet');
  const { MapContainer, TileLayer, Marker, Polygon, useMap, useMapEvents } = RL;

  (L.Icon.Default as any).mergeOptions({
    iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });

  const pinIcon = L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;cursor:grab;">
      <div style="width:16px;height:16px;border-radius:50%;background:${c.primary};"></div>
    </div>`,
    iconSize: [32, 32], iconAnchor: [16, 16],
  });

  function FlyController() {
    const map = useMap();
    flyRef.current = (newLat, newLng) => { map.flyTo([newLat, newLng], 15); };
    return null;
  }

  function ClickHandler() {
    useMapEvents({
      click(e) {
        const { lat: newLat, lng: newLng } = e.latlng;
        setMarkerLat(newLat); setMarkerLng(newLng); onMove(newLat, newLng);
      },
    });
    return null;
  }

  return (
    <View style={wm.mapContainer}>
      {/* @ts-ignore */}
      <MapContainer center={[markerLat, markerLng]} zoom={15}
        style={{ width: '100%', height: '100%' }}
        key={`${markerLat.toFixed(3)}-${markerLng.toFixed(3)}`}>
        <TileLayer
          attribution='&copy; OpenStreetMap &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <Polygon positions={circlePoints}
          pathOptions={{ color: c.primary, fillColor: c.primary, fillOpacity: 0.15, weight: 2, dashArray: '6 4' }} />
        <Marker position={[markerLat, markerLng]} icon={pinIcon} draggable
          eventHandlers={{
            dragend(e) {
              const { lat: newLat, lng: newLng } = (e.target as any).getLatLng();
              setMarkerLat(newLat); setMarkerLng(newLng); onMove(newLat, newLng);
            },
          }} />
        <FlyController />
        <ClickHandler />
      </MapContainer>

      {/* Coord badge */}
      <View style={wm.coordOverlay} pointerEvents="none">
        <View style={[wm.badge, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <Text size="xs" style={{ color: '#fff' }}>{markerLat.toFixed(5)}, {markerLng.toFixed(5)}</Text>
        </View>
      </View>

      {/* Hint */}
      <View style={wm.hintOverlay} pointerEvents="none">
        <View style={[wm.badge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
          <Text size="xs" style={{ color: '#ccc' }}>Click · drag pin · or search address above</Text>
        </View>
      </View>
    </View>
  );
}

const wm = StyleSheet.create({
  mapContainer: { height: 260, borderRadius: 14, overflow: 'hidden', position: 'relative' },
  coordOverlay: { position: 'absolute', bottom: 8, left: 0, right: 0, alignItems: 'center' },
  hintOverlay:  { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center' },
  badge:        { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
});

// ─── MapPickerModal ───────────────────────────────────────────────────────────

export function MapPickerModal({
  visible,
  initialLat   = 0,
  initialLng   = 0,
  radiusMeters = 100,
  onConfirm,
  onClose,
}: {
  visible:       boolean;
  initialLat?:   number;
  initialLng?:   number;
  radiusMeters?: number;
  onConfirm:     (result: MapPickerResult) => void;
  onClose:       () => void;
}) {
  const { theme }      = useThemeStore();
  const c              = theme.colors;
  const { organization } = useAuthStore();

  const [lat,          setLat]          = useState(initialLat);
  const [lng,          setLng]          = useState(initialLng);
  const [address,      setAddress]      = useState('');
  const [searchText,   setSearchText]   = useState('');
  const [geocoding,    setGeocoding]    = useState(false);
  const [searching,    setSearching]    = useState(false);
  const [searchErr,    setSearchErr]    = useState('');
  const [favoriting,   setFavoriting]   = useState(false);
  const [favorited,    setFavorited]    = useState(false);
  const [favName,      setFavName]      = useState('');
  const [showFavInput, setShowFavInput] = useState(false);

  const geoTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapMoveRef = useRef<((lat: number, lng: number) => void) | null>(null);

  useEffect(() => {
    if (visible) {
      setLat(initialLat); setLng(initialLng);
      setAddress(''); setSearchText(''); setFavorited(false);
      setShowFavInput(false); setFavName('');
    }
  }, [visible, initialLat, initialLng]);

  function handleMove(newLat: number, newLng: number) {
    setLat(newLat); setLng(newLng);
    setFavorited(false);
    if (geoTimer.current) clearTimeout(geoTimer.current);
    setGeocoding(true);
    geoTimer.current = setTimeout(async () => {
      const addr = await reverseGeocode(newLat, newLng);
      setAddress(addr); setSearchText(addr); setGeocoding(false);
    }, 800);
  }

  async function handleSearch() {
    if (!searchText.trim()) return;
    setSearching(true); setSearchErr('');
    const result = await forwardGeocode(searchText);
    setSearching(false);
    if (!result) { setSearchErr('Address not found — try a different query'); return; }
    setLat(result.lat); setLng(result.lng); setAddress(result.display);
    setSearchText(result.display);
    // The WebMap uses key-based re-render so it will re-center on the new coords
  }

  async function handleFavorite() {
    if (!showFavInput) { setShowFavInput(true); setFavName(address.split(',')[0] ?? ''); return; }
    if (!favName.trim() || !organization?.id) return;
    setFavoriting(true);
    await supabase.from('org_locations').insert({
      org_id:        organization.id,
      name:          favName.trim(),
      address:       address.trim() || null,
      latitude:      lat || null,
      longitude:     lng || null,
      radius_meters: radiusMeters,
      is_deleted:    false,
    });
    setFavoriting(false);
    setFavorited(true);
    setShowFavInput(false);
  }

  const hasPin = lat !== 0 || lng !== 0;

  return (
    <Modal visible={visible} animationType="slide" transparent
      presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={mp.overlay}>
        <View style={[mp.sheet, { backgroundColor: c.surface }]}>
          <View style={[mp.handle, { backgroundColor: c.border }]} />

          {/* Header */}
          <View style={mp.header}>
            <Pressable onPress={onClose}>
              <Text size="sm" color={c.textMuted}>Cancel</Text>
            </Pressable>
            <Text size="md" weight="bold">Set location</Text>
            <Pressable onPress={() => onConfirm({ lat, lng, address: address.trim() })}>
              <Text size="sm" weight="bold" color={c.primary}>Done</Text>
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            <View style={{ padding: 16, gap: 12 }}>

              {/* ── Address search ── */}
              <View style={[mp.searchRow, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                <TextInput
                  style={[mp.searchInput, { color: c.text }]}
                  value={searchText}
                  onChangeText={t => { setSearchText(t); setSearchErr(''); }}
                  onSubmitEditing={handleSearch}
                  placeholder="Search address or place name…"
                  placeholderTextColor={c.textSubtle}
                  returnKeyType="search"
                />
                <Pressable onPress={handleSearch} disabled={searching}
                  style={[mp.searchBtn, { backgroundColor: c.primary }]}>
                  {searching
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text size="xs" weight="bold" style={{ color: '#fff' }}>GO</Text>
                  }
                </Pressable>
              </View>
              {!!searchErr && <Text size="xs" color="#EF4444">{searchErr}</Text>}

              {/* ── Map ── */}
              <WebMap lat={lat} lng={lng} radiusMeters={radiusMeters} onMove={handleMove} />

              {/* ── Address display / edit ── */}
              <View style={[mp.addrBox, { borderTopColor: c.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text size="xs" weight="medium" color={c.textMuted}>ADDRESS</Text>
                  {/* Favourite button */}
                  {hasPin && !showFavInput && (
                    <Pressable onPress={handleFavorite}
                      style={[mp.favBtn, { borderColor: favorited ? c.primary : c.border,
                        backgroundColor: favorited ? c.primary + '15' : 'transparent' }]}>
                      <Text size="xs" color={favorited ? c.primary : c.textMuted}>
                        {favorited ? '♥ Saved' : '♡ Save location'}
                      </Text>
                    </Pressable>
                  )}
                </View>

                {geocoding ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color={c.primary} />
                    <Text size="sm" color={c.textSubtle}>Looking up address…</Text>
                  </View>
                ) : (
                  <TextInput
                    style={[mp.addrInput, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Click the map or search above"
                    placeholderTextColor={c.textSubtle}
                    multiline
                  />
                )}

                {/* Favourite name input */}
                {showFavInput && (
                  <View style={[mp.favNameBox, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
                    <Text size="xs" weight="medium" color={c.textMuted} style={{ marginBottom: 6 }}>
                      SAVE AS (name for this location)
                    </Text>
                    <TextInput
                      style={[mp.addrInput, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
                      value={favName}
                      onChangeText={setFavName}
                      placeholder="e.g. Chapter House, Main Hall…"
                      placeholderTextColor={c.textSubtle}
                      autoFocus
                    />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <Pressable onPress={() => setShowFavInput(false)}
                        style={[mp.favCancelBtn, { borderColor: c.border }]}>
                        <Text size="sm" color={c.textMuted}>Cancel</Text>
                      </Pressable>
                      <Pressable onPress={handleFavorite} disabled={favoriting || !favName.trim()}
                        style={[mp.favSaveBtn, { backgroundColor: c.primary, opacity: favoriting ? 0.6 : 1 }]}>
                        {favoriting
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text size="sm" weight="bold" style={{ color: '#fff' }}>♥ Save to locations</Text>
                        }
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>

              {/* Coords + radius */}
              {hasPin && (
                <View style={[mp.coordRow, { backgroundColor: c.surfaceAlt }]}>
                  <Text size="xs" color={c.textMuted}>{lat.toFixed(6)}, {lng.toFixed(6)}</Text>
                  <Text size="xs" color={c.textMuted}>Radius: {radiusMeters}m</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const mp = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '94%', flex: 1 },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  searchRow:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  searchInput:{ flex: 1, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  searchBtn:  { paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  addrBox:    { borderTopWidth: 1, paddingTop: 12 },
  addrInput:  { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 52 },
  favBtn:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  favNameBox: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 10 },
  favCancelBtn:{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, flex: 1, alignItems: 'center' },
  favSaveBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, flex: 2, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  coordRow:   { flexDirection: 'row', justifyContent: 'space-between', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
});
