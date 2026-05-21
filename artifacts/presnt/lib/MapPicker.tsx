/**
 * lib/MapPicker.tsx
 *
 * Cross-platform map-based location picker.
 *
 * Web (Platform.OS === 'web'):
 *   Uses react-map-gl + mapbox-gl for a full interactive map.
 *   The user can drag the center marker or tap to place a pin.
 *   Requires EXPO_PUBLIC_MAPBOX_TOKEN env var.
 *
 * Native (iOS / Android):
 *   Uses expo-location to get current GPS coords and renders a
 *   simple visual approximation — an SVG "radar" circle over a
 *   styled placeholder that shows lat/lng + address.
 *   A "Use my location" button fills coordinates from GPS.
 *
 * Usage:
 *   <MapPickerModal
 *     visible={show}
 *     initialLat={lat}
 *     initialLng={lng}
 *     radiusMeters={100}
 *     onConfirm={({ lat, lng, address }) => { ... }}
 *     onClose={() => setShow(false)}
 *   />
 */

import * as ExpoLocation from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MapPickerResult = {
  lat:     number;
  lng:     number;
  address: string;
};

// ─── Reverse geocode using Nominatim (free, no key required) ─────────────────

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'Presnt/1.0 (app)' } }
    );
    const data = await res.json();
    return data?.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

// ─── Native map placeholder ───────────────────────────────────────────────────

function NativeMapView({
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

  const [locating, setLocating] = useState(false);

  async function useMyLocation() {
    setLocating(true);
    try {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location permission is required to use this feature.');
        return;
      }
      const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High });
      onMove(loc.coords.latitude, loc.coords.longitude);
    } catch {
      Alert.alert('Error', 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  }

  const hasCords = lat !== 0 || lng !== 0;

  return (
    <View style={[nm.container, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
      {/* Visual placeholder */}
      <View style={nm.mapArea}>
        <Svg width={120} height={120} viewBox="0 0 120 120">
          {/* Outer rings */}
          <Circle cx={60} cy={60} r={50} fill="none" stroke={c.border} strokeWidth={1} />
          <Circle cx={60} cy={60} r={35} fill="none" stroke={c.border} strokeWidth={1} />
          <Circle cx={60} cy={60} r={20} fill="none" stroke={c.border} strokeWidth={1} />
          {/* Geofence radius ring */}
          <Circle cx={60} cy={60} r={44} fill={c.primary + '20'} stroke={c.primary + '60'} strokeWidth={1.5} strokeDasharray="4 3" />
          {/* Center pin */}
          <Circle cx={60} cy={60} r={8} fill={c.primary} />
          <Circle cx={60} cy={60} r={4} fill="#fff" />
        </Svg>

        {hasCords && (
          <View style={nm.coordBadge}>
            <Text size="xs" color={c.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </Text>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={[nm.controls, { borderTopColor: c.border }]}>
        <Text size="xs" color={c.textMuted} style={{ flex: 1, lineHeight: 18 }}>
          {hasCords
            ? `Geofence radius: ${radiusMeters}m`
            : 'Use your location or enter coordinates below'}
        </Text>
        <Pressable
          onPress={useMyLocation}
          disabled={locating}
          style={[nm.gpsBtn, { backgroundColor: c.primary }]}
        >
          {locating
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text size="xs" weight="bold" style={{ color: '#fff' }}>📍 Use GPS</Text>
          }
        </Pressable>
      </View>

      {/* Manual lat/lng input */}
      <View style={[nm.manualRow, { borderTopColor: c.border }]}>
        <LatLngInput label="Lat" value={lat} onChange={(v) => onMove(v, lng)} />
        <LatLngInput label="Lng" value={lng} onChange={(v) => onMove(lat, v)} />
      </View>
    </View>
  );
}

function LatLngInput({
  label,
  value,
  onChange,
}: {
  label:    string;
  value:    number;
  onChange: (v: number) => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [text, setText] = useState(value !== 0 ? String(value) : '');

  useEffect(() => {
    setText(value !== 0 ? String(value) : '');
  }, [value]);

  return (
    <View style={{ flex: 1 }}>
      <Text size="xs" weight="medium" color={c.textMuted} style={{ marginBottom: 4 }}>{label}</Text>
      <TextInput
        style={[nm.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
        value={text}
        onChangeText={setText}
        onBlur={() => {
          const n = parseFloat(text);
          if (!isNaN(n)) onChange(n);
        }}
        placeholder="0.00000"
        placeholderTextColor={c.textSubtle}
        keyboardType="numbers-and-punctuation"
      />
    </View>
  );
}

const nm = StyleSheet.create({
  container:  { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  mapArea:    { height: 180, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  coordBadge: { position: 'absolute', bottom: 8, left: 0, right: 0, alignItems: 'center' },
  controls:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderTopWidth: 1 },
  gpsBtn:     { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  manualRow:  { flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1 },
  input:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
});

// ─── Web map view using react-map-gl ─────────────────────────────────────────

// Dynamic import so native builds don't try to bundle mapbox-gl
let WebMapViewImpl: React.ComponentType<{
  lat: number;
  lng: number;
  radiusMeters: number;
  onMove: (lat: number, lng: number) => void;
}> | null = null;

if (Platform.OS === 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RMG = require('react-map-gl');
  const { Map, Marker, Source, Layer } = RMG;

  const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

  WebMapViewImpl = function WebMapView({ lat, lng, radiusMeters, onMove }) {
    const { theme } = useThemeStore();
    const c = theme.colors;

    const [viewport, setViewport] = useState({
      latitude:  lat || 37.7749,
      longitude: lng || -122.4194,
      zoom:      15,
    });
    const [marker, setMarker] = useState({ lat: lat || 37.7749, lng: lng || -122.4194 });
    const [dragging, setDragging] = useState(false);

    const geojsonCircle = useMemo(() => {
      const points = 64;
      const coords = [];
      const kmRadius = radiusMeters / 1000;
      for (let i = 0; i < points; i++) {
        const angle = (i * 360) / points;
        const dx = kmRadius * Math.cos((angle * Math.PI) / 180);
        const dy = kmRadius * Math.sin((angle * Math.PI) / 180);
        const lat2 = marker.lat + (dy / 111.32);
        const lng2 = marker.lng + (dx / (111.32 * Math.cos((marker.lat * Math.PI) / 180)));
        coords.push([lng2, lat2]);
      }
      coords.push(coords[0]);
      return {
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [coords] },
        properties: {},
      };
    }, [marker.lat, marker.lng, radiusMeters]);

    return (
      <View style={{ height: 260, borderRadius: 14, overflow: 'hidden' }}>
        {MAPBOX_TOKEN ? (
          <Map
            mapboxAccessToken={MAPBOX_TOKEN}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            {...viewport}
            onMove={(evt: any) => setViewport(evt.viewState)}
            onClick={(evt: any) => {
              const { lat: la, lng: lo } = evt.lngLat;
              setMarker({ lat: la, lng: lo });
              onMove(la, lo);
            }}
          >
            {/* Geofence circle */}
            <Source id="geofence" type="geojson" data={geojsonCircle}>
              <Layer
                id="geofence-fill"
                type="fill"
                paint={{ 'fill-color': c.primary, 'fill-opacity': 0.15 }}
              />
              <Layer
                id="geofence-border"
                type="line"
                paint={{ 'line-color': c.primary, 'line-width': 2 }}
              />
            </Source>

            {/* Draggable marker */}
            <Marker
              latitude={marker.lat}
              longitude={marker.lng}
              draggable
              onDragStart={() => setDragging(true)}
              onDragEnd={(evt: any) => {
                setDragging(false);
                const { lat: la, lng: lo } = evt.lngLat;
                setMarker({ lat: la, lng: lo });
                onMove(la, lo);
              }}
            >
              <View style={wm.pin}>
                <View style={[wm.pinDot, { backgroundColor: c.primary }]} />
              </View>
            </Marker>
          </Map>
        ) : (
          <View style={[{ height: 260, alignItems: 'center', justifyContent: 'center' }, { backgroundColor: c.surfaceAlt }]}>
            <Text size="sm" color={c.textMuted}>Set EXPO_PUBLIC_MAPBOX_TOKEN to enable map</Text>
          </View>
        )}
      </View>
    );
  };
}

// Need useMemo in Web component but can't conditionally call hooks so require it here
const { useMemo } = React;

const wm = StyleSheet.create({
  pin:    { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  pinDot: { width: 16, height: 16, borderRadius: 8 },
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

  const [lat,         setLat]         = useState(initialLat);
  const [lng,         setLng]         = useState(initialLng);
  const [address,     setAddress]     = useState('');
  const [geocoding,   setGeocoding]   = useState(false);

  const pendingGeocode = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setLat(initialLat);
      setLng(initialLng);
    }
  }, [visible, initialLat, initialLng]);

  function handleMove(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);

    // Debounce reverse geocode
    if (pendingGeocode.current) clearTimeout(pendingGeocode.current);
    setGeocoding(true);
    pendingGeocode.current = setTimeout(async () => {
      const addr = await reverseGeocode(newLat, newLng);
      setAddress(addr);
      setGeocoding(false);
    }, 800);
  }

  function handleConfirm() {
    if (!lat && !lng) {
      onConfirm({ lat: 0, lng: 0, address: address.trim() });
    } else {
      onConfirm({ lat, lng, address: address.trim() });
    }
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
            <Pressable onPress={handleConfirm}>
              <Text size="sm" weight="bold" color={c.primary}>Done</Text>
            </Pressable>
          </View>

          <View style={{ padding: 16 }}>
            {/* Map */}
            {Platform.OS === 'web' && WebMapViewImpl ? (
              <WebMapViewImpl
                lat={lat}
                lng={lng}
                radiusMeters={radiusMeters}
                onMove={handleMove}
              />
            ) : (
              <NativeMapView
                lat={lat}
                lng={lng}
                radiusMeters={radiusMeters}
                onMove={handleMove}
              />
            )}

            {/* Address output */}
            <View style={[mp.addrRow, { borderColor: c.border }]}>
              <Text size="xs" weight="medium" color={c.textMuted} style={{ marginBottom: 6 }}>
                ADDRESS
              </Text>
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
                  placeholder="Address will appear here after dropping pin"
                  placeholderTextColor={c.textSubtle}
                  multiline
                />
              )}
            </View>

            {/* Coords readout */}
            {(lat !== 0 || lng !== 0) && (
              <View style={[mp.coordRow, { backgroundColor: c.surfaceAlt }]}>
                <Text size="xs" color={c.textMuted}>
                  {lat.toFixed(6)}, {lng.toFixed(6)}
                </Text>
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
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  handle:  { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  addrRow: { marginTop: 12, borderTopWidth: 1, paddingTop: 12 },
  addrInput:{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 52 },
  coordRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
});
