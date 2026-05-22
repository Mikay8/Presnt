/**
 * QRScannerModal — cross-platform QR code scanner
 *
 * Native (iOS / Android): uses expo-camera's CameraView with barcode scanning.
 * Web: shows a manual text-input fallback (camera APIs differ too much across
 *      browsers and are blocked in some iframe/PWA contexts).
 *
 * Props:
 *   visible      — show/hide the modal
 *   onScan(data) — called once with the decoded string when a QR is detected;
 *                  the modal does NOT close itself — caller controls `visible`
 *   onClose      — called when the user dismisses the modal
 */

import { Ionicons } from '@expo/vector-icons';
import {
  CameraView,
  useCameraPermissions,
  BarcodeScanningResult,
} from 'expo-camera';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Text } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

// ─── Props ────────────────────────────────────────────────────────────────────

export type QRScannerModalProps = {
  visible:  boolean;
  onScan:   (data: string) => void;
  onClose:  () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function QRScannerModal({ visible, onScan, onClose }: QRScannerModalProps) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  // ── Web fallback ─────────────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    return (
      <WebFallbackScanner
        visible={visible}
        onScan={onScan}
        onClose={onClose}
      />
    );
  }

  // ── Native ───────────────────────────────────────────────────────────────────
  return (
    <NativeScanner
      visible={visible}
      onScan={onScan}
      onClose={onClose}
    />
  );
}

// ─── Native Camera Scanner ───────────────────────────────────────────────────

function NativeScanner({ visible, onScan, onClose }: QRScannerModalProps) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  // Reset scanned flag each time modal opens
  useEffect(() => {
    if (visible) scannedRef.current = false;
  }, [visible]);

  function handleBarcode(result: BarcodeScanningResult) {
    if (scannedRef.current) return;   // prevent double-fires
    scannedRef.current = true;
    onScan(result.data);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {/* Header */}
        <View style={[ns.header]}>
          <Pressable onPress={onClose} style={ns.closeBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <Text size="lg" weight="bold" style={{ color: '#fff' }}>Scan Member QR</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Camera / permission states */}
        {!permission ? (
          <View style={ns.center}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : !permission.granted ? (
          <View style={ns.center}>
            <Ionicons name="camera-outline" size={48} color="rgba(255,255,255,0.5)" />
            <Text size="md" style={{ color: '#fff', marginTop: 16, textAlign: 'center', paddingHorizontal: 32 }}>
              Camera permission is needed to scan QR codes.
            </Text>
            <Pressable onPress={requestPermission} style={ns.permBtn}>
              <Text size="sm" weight="bold" style={{ color: '#fff' }}>Grant permission</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarcode}
            />
            {/* Targeting overlay */}
            <View style={ns.overlay} pointerEvents="none">
              <View style={ns.topShade} />
              <View style={ns.middleRow}>
                <View style={ns.sideShade} />
                <View style={ns.frame}>
                  <View style={[ns.corner, ns.cornerTL]} />
                  <View style={[ns.corner, ns.cornerTR]} />
                  <View style={[ns.corner, ns.cornerBL]} />
                  <View style={[ns.corner, ns.cornerBR]} />
                </View>
                <View style={ns.sideShade} />
              </View>
              <View style={ns.bottomShade}>
                <Text size="sm" style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>
                  Point at a member's QR code
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const FRAME = 240;
const CORNER = 24;
const BORDER = 3;
const SHADE = 'rgba(0,0,0,0.55)';

const ns = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16, backgroundColor: '#000' },
  closeBtn:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  permBtn:   { marginTop: 24, backgroundColor: '#F08862', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },

  overlay:    { ...StyleSheet.absoluteFillObject },
  topShade:   { backgroundColor: SHADE, height: '30%' },
  middleRow:  { flexDirection: 'row', height: FRAME },
  sideShade:  { flex: 1, backgroundColor: SHADE },
  frame:      { width: FRAME, height: FRAME },
  bottomShade:{ flex: 1, backgroundColor: SHADE, alignItems: 'center', paddingTop: 20 },

  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#fff', borderRadius: 4 },
  cornerTL: { top: 0,    left: 0,    borderTopWidth: BORDER,    borderLeftWidth: BORDER },
  cornerTR: { top: 0,    right: 0,   borderTopWidth: BORDER,    borderRightWidth: BORDER },
  cornerBL: { bottom: 0, left: 0,    borderBottomWidth: BORDER, borderLeftWidth: BORDER },
  cornerBR: { bottom: 0, right: 0,   borderBottomWidth: BORDER, borderRightWidth: BORDER },
});

// ─── Web Text-input Fallback ──────────────────────────────────────────────────

function WebFallbackScanner({ visible, onScan, onClose }: QRScannerModalProps) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  // Reset on open
  useEffect(() => {
    if (visible) { setValue(''); setError(''); }
  }, [visible]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) { setError('Please paste or type a user ID.'); return; }
    // Accept a raw UUID or a presnt://user/<uuid> deep link
    const match = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (!match) { setError('That doesn\'t look like a valid member ID.'); return; }
    onScan(match[0]);
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={wb.overlay}>
        <View style={[wb.sheet, { backgroundColor: c.surface }]}>
          <View style={wb.handleBar} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <Text size="xl" weight="bold">Scan QR Code</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={22} color={c.textMuted} />
            </Pressable>
          </View>

          <View style={[wb.infoBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
            <Ionicons name="information-circle-outline" size={16} color={c.textMuted} />
            <Text size="sm" color={c.textMuted} style={{ flex: 1, lineHeight: 20 }}>
              Camera scanning is only available in the mobile app. On web, paste the member's user ID below (found in their profile QR).
            </Text>
          </View>

          <Text size="xs" weight="medium" color={c.textMuted}
            style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 6 }}>
            Member ID
          </Text>
          <TextInput
            style={[wb.input, { backgroundColor: c.surfaceAlt, borderColor: error ? '#EF4444' : c.border, color: c.text }]}
            value={value}
            onChangeText={v => { setValue(v); setError(''); }}
            placeholder="Paste user ID or deep link…"
            placeholderTextColor={c.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={submit}
          />
          {error ? <Text size="xs" style={{ color: '#EF4444', marginTop: 4 }}>{error}</Text> : null}

          <Pressable
            onPress={submit}
            style={[wb.submitBtn, { backgroundColor: c.primary, marginTop: 16 }]}
          >
            <Text size="md" weight="bold" style={{ color: '#fff' }}>Check In</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const wb = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  sheet:     { width: '90%', maxWidth: 420, borderRadius: 20, padding: 24 },
  handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 16 },
  infoBox:   { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'flex-start' },
  input:     { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  submitBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
});
