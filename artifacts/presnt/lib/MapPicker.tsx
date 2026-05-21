/**
 * lib/MapPicker.tsx  (NATIVE — iOS / Android)
 *
 * SVG radar visual + address search + GPS + favourite save.
 */

import * as ExpoLocation from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

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

// ─── Lat/Lng manual input ─────────────────────────────────────────────────────

function LatLngInput({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
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
  const { theme }        = useThemeStore();
  const c                = theme.colors;
  const { organization } = useAuthStore();

  const [lat,          setLat]          = useState(initialLat);
  const [lng,          setLng]          = useState(initialLng);
  const [address,      setAddress]      = useState('');
  const [searchText,   setSearchText]   = useState('');
  const [locating,     setLocating]     = useState(false);
  const [geocoding,    setGeocoding]    = useState(false);
  const [searching,    setSearching]    = useState(false);
  const [searchErr,    setSearchErr]    = useState('');
  const [favoriting,   setFavoriting]   = useState(false);
  const [favorited,    setFavorited]    = useState(false);
  const [favName,      setFavName]      = useState('');
  const [showFavInput, setShowFavInput] = useState(false);

  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setLat(initialLat); setLng(initialLng);
      setAddress(''); setSearchText('');
      setFavorited(false); setShowFavInput(false); setFavName('');
    }
  }, [visible, initialLat, initialLng]);

  function handleMove(newLat: number, newLng: number) {
    setLat(newLat); setLng(newLng); setFavorited(false);
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
    handleMove(result.lat, result.lng);
  }

  async function useMyLocation() {
    setLocating(true);
    try {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Location access is required.'); return; }
      const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High });
      handleMove(loc.coords.latitude, loc.coords.longitude);
    } catch {
      Alert.alert('Error', 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  }

  async function handleFavorite() {
    if (!showFavInput) {
      setShowFavInput(true);
      setFavName(address.split(',')[0] ?? '');
      return;
    }
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

  const hasCoords = lat !== 0 || lng !== 0;

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
                  placeholder="Search address or place…"
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

              {/* ── SVG radar visual ── */}
              <View style={[mp.mapArea, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                <Svg width={140} height={140} viewBox="0 0 140 140">
                  <Circle cx={70} cy={70} r={60} fill="none" stroke={c.border} strokeWidth={1} />
                  <Circle cx={70} cy={70} r={42} fill="none" stroke={c.border} strokeWidth={1} />
                  <Circle cx={70} cy={70} r={24} fill="none" stroke={c.border} strokeWidth={1} />
                  <Circle cx={70} cy={70} r={52}
                    fill={c.primary + '20'} stroke={c.primary + '80'}
                    strokeWidth={1.5} strokeDasharray="4 3" />
                  <Circle cx={70} cy={70} r={10} fill={hasCoords ? c.primary : c.border} />
                  <Circle cx={70} cy={70} r={5}  fill="#fff" />
                </Svg>
                {hasCoords && (
                  <Text size="xs" color={c.textMuted} style={mp.coordLabel}>
                    {lat.toFixed(5)}, {lng.toFixed(5)}
                  </Text>
                )}
              </View>

              {/* ── GPS button ── */}
              <Pressable onPress={useMyLocation} disabled={locating}
                style={[mp.gpsBtn, { backgroundColor: c.primary, opacity: locating ? 0.7 : 1 }]}>
                {locating
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text size="sm" weight="bold" style={{ color: '#fff' }}>📍 Use my location</Text>
                }
              </Pressable>

              {/* ── Manual lat/lng inputs ── */}
              <View style={[mp.manualRow, { borderTopColor: c.border }]}>
                <LatLngInput label="Latitude"  value={lat} onChange={v => handleMove(v, lng)} />
                <LatLngInput label="Longitude" value={lng} onChange={v => handleMove(lat, v)} />
              </View>

              {/* ── Address display ── */}
              <View style={[mp.addrBox, { borderTopColor: c.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text size="xs" weight="medium" color={c.textMuted}>ADDRESS</Text>
                  {hasCoords && !showFavInput && (
                    <Pressable onPress={handleFavorite}
                      style={[mp.favBtn, {
                        borderColor: favorited ? c.primary : c.border,
                        backgroundColor: favorited ? c.primary + '15' : 'transparent',
                      }]}>
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
                    placeholder="Search above, drop a pin, or use GPS"
                    placeholderTextColor={c.textSubtle}
                    multiline
                  />
                )}

                {/* Favourite name input */}
                {showFavInput && (
                  <View style={[mp.favNameBox, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
                    <Text size="xs" weight="medium" color={c.textMuted} style={{ marginBottom: 6 }}>
                      SAVE AS
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

              {/* Radius info */}
              {hasCoords && (
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
  overlay:     { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', flex: 1 },
  handle:      { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  searchRow:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  searchInput: { flex: 1, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  searchBtn:   { paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  mapArea:     { borderWidth: 1, borderRadius: 14, height: 200, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  coordLabel:  { position: 'absolute', bottom: 8 },
  gpsBtn:      { borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  manualRow:   { flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: 1 },
  addrBox:     { borderTopWidth: 1, paddingTop: 12 },
  addrInput:   { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 52 },
  favBtn:      { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  favNameBox:  { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 10 },
  favCancelBtn:{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, flex: 1, alignItems: 'center' },
  favSaveBtn:  { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, flex: 2, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  coordRow:    { flexDirection: 'row', justifyContent: 'space-between', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
});
