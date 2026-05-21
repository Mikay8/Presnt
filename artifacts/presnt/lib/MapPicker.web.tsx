/**
 * lib/MapPicker.web.tsx  (WEB only)
 *
 * Metro automatically picks this file over MapPicker.tsx on web builds.
 * Imports from 'react-map-gl/mapbox' (the correct v8 subpath export).
 *
 * Features:
 *   - Mapbox dark tile layer
 *   - Click-to-place pin
 *   - Draggable marker
 *   - Geofence circle overlay (GeoJSON polygon)
 *   - Reverse geocode via Nominatim
 *   - Fallback placeholder when EXPO_PUBLIC_MAPBOX_TOKEN is not set
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Map, Marker, Source } from 'react-map-gl/mapbox';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Text } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

// ─── Shared type (must match MapPicker.tsx exactly) ───────────────────────────

export type MapPickerResult = {
  lat:     number;
  lng:     number;
  address: string;
};

// ─── Reverse geocode (Nominatim) ──────────────────────────────────────────────

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'Presnt/1.0' } },
    );
    const data = await res.json();
    return data?.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

// ─── Inject Mapbox CSS once into the document head ───────────────────────────

let cssInjected = false;
function useMapboxCSS() {
  useEffect(() => {
    if (cssInjected) return;
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.24.0/mapbox-gl.css';
    document.head.appendChild(link);
    cssInjected = true;
  }, []);
}

// ─── Build GeoJSON circle for geofence overlay ───────────────────────────────

function buildCircleGeoJSON(lat: number, lng: number, radiusMeters: number) {
  const points = 64;
  const kmRadius = radiusMeters / 1000;
  const coords: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const angle = (i * 360) / points;
    const dx    = kmRadius * Math.cos((angle * Math.PI) / 180);
    const dy    = kmRadius * Math.sin((angle * Math.PI) / 180);
    const lat2  = lat + dy / 111.32;
    const lng2  = lng + dx / (111.32 * Math.cos((lat * Math.PI) / 180));
    coords.push([lng2, lat2]);
  }
  coords.push(coords[0]); // close ring
  return {
    type: 'Feature' as const,
    geometry: { type: 'Polygon' as const, coordinates: [coords] },
    properties: {},
  };
}

// ─── Map component ────────────────────────────────────────────────────────────

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
const DEFAULT_LAT  = 37.7749;
const DEFAULT_LNG  = -122.4194;

function WebMap({
  lat,
  lng,
  radiusMeters,
  onMove,
}: {
  lat:          number;
  lng:          number;
  radiusMeters: number;
  onMove:       (lat: number, lng: number) => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  useMapboxCSS();

  const [viewState, setViewState] = useState({
    latitude:  lat || DEFAULT_LAT,
    longitude: lng || DEFAULT_LNG,
    zoom:      15,
  });
  const [markerPos, setMarkerPos] = useState({
    lat: lat || DEFAULT_LAT,
    lng: lng || DEFAULT_LNG,
  });

  // Update marker when external lat/lng change (e.g. GPS on mobile — not used
  // on web but kept for symmetry)
  useEffect(() => {
    if (lat !== 0 || lng !== 0) {
      setMarkerPos({ lat, lng });
      setViewState(v => ({ ...v, latitude: lat, longitude: lng }));
    }
  }, [lat, lng]);

  const geojson = useMemo(
    () => buildCircleGeoJSON(markerPos.lat, markerPos.lng, radiusMeters),
    [markerPos.lat, markerPos.lng, radiusMeters],
  );

  if (!MAPBOX_TOKEN) {
    return (
      <View style={[wm.noToken, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
        <Text size="sm" color={c.textMuted} style={{ textAlign: 'center', lineHeight: 22 }}>
          Add{' '}
          <Text size="sm" weight="bold" color={c.text}>EXPO_PUBLIC_MAPBOX_TOKEN</Text>
          {'\n'}to your .env to enable the interactive map.
        </Text>
      </View>
    );
  }

  return (
    <View style={wm.mapContainer}>
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        onClick={(evt) => {
          const { lat: newLat, lng: newLng } = evt.lngLat;
          setMarkerPos({ lat: newLat, lng: newLng });
          onMove(newLat, newLng);
        }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: '100%', height: '100%' }}
        reuseMaps
      >
        {/* Geofence circle */}
        <Source id="geofence" type="geojson" data={geojson}>
          <Layer
            id="geofence-fill"
            type="fill"
            paint={{ 'fill-color': c.primary, 'fill-opacity': 0.15 }}
          />
          <Layer
            id="geofence-line"
            type="line"
            paint={{ 'line-color': c.primary, 'line-width': 2, 'line-dasharray': [2, 2] }}
          />
        </Source>

        {/* Draggable marker */}
        <Marker
          latitude={markerPos.lat}
          longitude={markerPos.lng}
          draggable
          onDragEnd={(evt) => {
            const { lat: newLat, lng: newLng } = evt.lngLat;
            setMarkerPos({ lat: newLat, lng: newLng });
            onMove(newLat, newLng);
          }}
          anchor="center"
        >
          {/* Custom pin — a white circle with a primary-colored dot */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: '#fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'grab',
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                backgroundColor: c.primary,
              }}
            />
          </div>
        </Marker>
      </Map>

      {/* Coord overlay badge */}
      <View style={wm.coordOverlay} pointerEvents="none">
        <View style={[wm.coordBadge, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <Text size="xs" style={{ color: '#fff' }}>
            {markerPos.lat.toFixed(5)}, {markerPos.lng.toFixed(5)}
          </Text>
        </View>
      </View>

      {/* Instructions */}
      <View style={wm.hintOverlay} pointerEvents="none">
        <View style={[wm.hintBadge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
          <Text size="xs" style={{ color: '#ccc' }}>Click to place · drag pin to adjust</Text>
        </View>
      </View>
    </View>
  );
}

const wm = StyleSheet.create({
  mapContainer:  { height: 280, borderRadius: 14, overflow: 'hidden', position: 'relative' },
  noToken:       { height: 180, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 20 },
  coordOverlay:  { position: 'absolute', bottom: 8, left: 0, right: 0, alignItems: 'center' },
  coordBadge:    { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  hintOverlay:   { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center' },
  hintBadge:     { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
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
  const { theme } = useThemeStore();
  const c = theme.colors;

  const [lat,       setLat]       = useState(initialLat);
  const [lng,       setLng]       = useState(initialLng);
  const [address,   setAddress]   = useState('');
  const [geocoding, setGeocoding] = useState(false);

  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) { setLat(initialLat); setLng(initialLng); setAddress(''); }
  }, [visible, initialLat, initialLng]);

  function handleMove(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);
    if (geoTimer.current) clearTimeout(geoTimer.current);
    setGeocoding(true);
    geoTimer.current = setTimeout(async () => {
      const addr = await reverseGeocode(newLat, newLng);
      setAddress(addr);
      setGeocoding(false);
    }, 800);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
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

          <View style={{ padding: 16 }}>
            {/* Interactive map */}
            <WebMap
              lat={lat}
              lng={lng}
              radiusMeters={radiusMeters}
              onMove={handleMove}
            />

            {/* Address */}
            <View style={[mp.addrRow, { borderTopColor: c.border }]}>
              <Text size="xs" weight="medium" color={c.textMuted} style={{ marginBottom: 6 }}>ADDRESS</Text>
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
                  placeholder="Click the map or drag the pin to fill"
                  placeholderTextColor={c.textSubtle}
                  multiline
                />
              )}
            </View>

            {/* Coords + radius */}
            {(lat !== 0 || lng !== 0) && (
              <View style={[mp.coordRow, { backgroundColor: c.surfaceAlt }]}>
                <Text size="xs" color={c.textMuted}>{lat.toFixed(6)}, {lng.toFixed(6)}</Text>
                <Text size="xs" color={c.textMuted}>Radius: {radiusMeters}m</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const mp = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  handle:   { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  addrRow:  { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  addrInput:{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 52 },
  coordRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
});
