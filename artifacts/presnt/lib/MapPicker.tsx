/**
 * lib/MapPicker.tsx  (NATIVE — iOS / Android)
 *
 * Metro automatically picks this file on native builds.
 * The web version lives in MapPicker.web.tsx and uses react-map-gl/mapbox.
 *
 * Native strategy:
 *   - SVG "radar" visual with geofence circle
 *   - "Use GPS" button via expo-location
 *   - Manual lat/lng text inputs
 *   - Reverse geocode via Nominatim (free, no key)
 */

import * as ExpoLocation from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

// ─── Shared type (must match MapPicker.web.tsx exactly) ───────────────────────

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

// ─── LatLng input ─────────────────────────────────────────────────────────────

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

  useEffect(() => { setText(value !== 0 ? String(value) : ''); }, [value]);

  return (
    <View style={{ flex: 1 }}>
      <Text size="xs" weight="medium" color={c.textMuted} style={{ marginBottom: 4 }}>{label}</Text>
      <TextInput
        style={[ll.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
        value={text}
        onChangeText={setText}
        onBlur={() => { const n = parseFloat(text); if (!isNaN(n)) onChange(n); }}
        placeholder="0.00000"
        placeholderTextColor={c.textSubtle}
        keyboardType="numbers-and-punctuation"
      />
    </View>
  );
}

const ll = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
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
  const [locating,  setLocating]  = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) { setLat(initialLat); setLng(initialLng); }
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

  async function useMyLocation() {
    setLocating(true);
    try {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location access is required.');
        return;
      }
      const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High });
      handleMove(loc.coords.latitude, loc.coords.longitude);
    } catch {
      Alert.alert('Error', 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  }

  const hasCoords = lat !== 0 || lng !== 0;

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
            {/* SVG visual */}
            <View style={[mp.mapArea, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Svg width={140} height={140} viewBox="0 0 140 140">
                <Circle cx={70} cy={70} r={60} fill="none" stroke={c.border} strokeWidth={1} />
                <Circle cx={70} cy={70} r={42} fill="none" stroke={c.border} strokeWidth={1} />
                <Circle cx={70} cy={70} r={24} fill="none" stroke={c.border} strokeWidth={1} />
                {/* Geofence */}
                <Circle cx={70} cy={70} r={52}
                  fill={c.primary + '20'} stroke={c.primary + '80'}
                  strokeWidth={1.5} strokeDasharray="4 3"
                />
                {/* Pin */}
                <Circle cx={70} cy={70} r={10} fill={hasCoords ? c.primary : c.border} />
                <Circle cx={70} cy={70} r={5}  fill="#fff" />
              </Svg>
              {hasCoords && (
                <Text size="xs" color={c.textMuted} style={mp.coordLabel}>
                  {lat.toFixed(5)}, {lng.toFixed(5)}
                </Text>
              )}
            </View>

            {/* GPS button */}
            <Pressable
              onPress={useMyLocation}
              disabled={locating}
              style={[mp.gpsBtn, { backgroundColor: c.primary, opacity: locating ? 0.7 : 1 }]}
            >
              {locating
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text size="sm" weight="bold" style={{ color: '#fff' }}>📍 Use my location</Text>
              }
            </Pressable>

            {/* Manual inputs */}
            <View style={[mp.manualRow, { borderTopColor: c.border }]}>
              <LatLngInput label="Latitude"  value={lat} onChange={(v) => handleMove(v, lng)} />
              <LatLngInput label="Longitude" value={lng} onChange={(v) => handleMove(lat, v)} />
            </View>

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
                  placeholder="Drop a pin or use GPS to get address"
                  placeholderTextColor={c.textSubtle}
                  multiline
                />
              )}
            </View>

            {/* Radius info */}
            {hasCoords && (
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
  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  mapArea:    { borderWidth: 1, borderRadius: 14, height: 200, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  coordLabel: { position: 'absolute', bottom: 8 },
  gpsBtn:     { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
  manualRow:  { flexDirection: 'row', gap: 10, paddingTop: 12, marginTop: 12, borderTopWidth: 1 },
  addrRow:    { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  addrInput:  { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 52 },
  coordRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
});
