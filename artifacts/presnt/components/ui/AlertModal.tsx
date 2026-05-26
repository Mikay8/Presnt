/**
 * AlertModal — web-safe replacement for React Native's Alert.alert()
 *
 * Alert.alert() button callbacks are silently broken on web (RNW falls back
 * to window.alert, which has no callback support). This component provides
 * two drop-in helpers:
 *
 *   showAlert(title, message?)           — info / error toast (OK button)
 *   confirm(title, message?, onConfirm, options?)  — destructive / confirm dialog
 *
 * Usage:
 *   1. Wrap your app root (or layout) with <AlertProvider>
 *   2. In any component: const { showAlert, confirm } = useAlert()
 *
 * On native the real Alert.alert() is used; on web a custom modal is shown.
 */

import { Ionicons } from '@expo/vector-icons';
import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Text } from './Text';

// ─── Types ────────────────────────────────────────────────────────────────────

type AlertKind = 'info' | 'confirm' | 'destructive';

interface AlertState {
  visible:   boolean;
  kind:      AlertKind;
  title:     string;
  message?:  string;
  confirmLabel: string;
  cancelLabel:  string;
  onConfirm: () => void;
  onCancel:  () => void;
}

interface AlertContextValue {
  /** Simple info/error alert — just an OK button, no callback needed. */
  showAlert: (title: string, message?: string) => void;
  /**
   * Confirmation dialog.
   * @param options.confirmLabel  defaults to "Confirm"
   * @param options.cancelLabel   defaults to "Cancel"
   * @param options.destructive   if true, confirm button is red
   */
  confirm: (
    title: string,
    message: string | undefined,
    onConfirm: () => void,
    options?: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean }
  ) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AlertContext = createContext<AlertContextValue | null>(null);

const BLANK: AlertState = {
  visible:      false,
  kind:         'info',
  title:        '',
  message:      undefined,
  confirmLabel: 'OK',
  cancelLabel:  'Cancel',
  onConfirm:    () => {},
  onCancel:     () => {},
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AlertState>(BLANK);
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const opacAnim  = useRef(new Animated.Value(0)).current;

  function open(next: Omit<AlertState, 'visible'>) {
    setState({ ...next, visible: true });
    scaleAnim.setValue(0.92);
    opacAnim.setValue(0);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 260, friction: 20 }),
      Animated.timing(opacAnim,  { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
  }

  function close() {
    Animated.timing(opacAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setState(BLANK);
    });
  }

  // ── showAlert ──────────────────────────────────────────────────────────────
  const showAlert = useCallback((title: string, message?: string) => {
    if (Platform.OS !== 'web') {
      Alert.alert(title, message);
      return;
    }
    open({
      kind:         'info',
      title,
      message,
      confirmLabel: 'OK',
      cancelLabel:  'Cancel',
      onConfirm:    close,
      onCancel:     close,
    });
  }, []);

  // ── confirm ────────────────────────────────────────────────────────────────
  const confirm = useCallback((
    title: string,
    message: string | undefined,
    onConfirm: () => void,
    options: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean } = {}
  ) => {
    const { confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive = false } = options;

    if (Platform.OS !== 'web') {
      Alert.alert(title, message, [
        { text: cancelLabel, style: 'cancel' },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
      ]);
      return;
    }

    open({
      kind:  destructive ? 'destructive' : 'confirm',
      title,
      message,
      confirmLabel,
      cancelLabel,
      onConfirm: () => { close(); onConfirm(); },
      onCancel:  close,
    });
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  const isInfo        = state.kind === 'info';
  const isDestructive = state.kind === 'destructive';
  const confirmColor  = isDestructive ? '#EF4444' : '#3B82F6';
  const iconName      = isInfo ? 'information-circle-outline'
                      : isDestructive ? 'warning-outline'
                      : 'help-circle-outline';
  const iconColor     = isInfo ? '#6B7280' : isDestructive ? '#EF4444' : '#F59E0B';

  return (
    <AlertContext.Provider value={{ showAlert, confirm }}>
      {children}

      {/* Only renders on web — native uses real Alert.alert() above */}
      {Platform.OS === 'web' && (
        <Modal
          transparent
          visible={state.visible}
          animationType="none"
          onRequestClose={state.onCancel}
          statusBarTranslucent
        >
          <Pressable style={s.backdrop} onPress={isInfo ? state.onCancel : undefined}>
            <Animated.View
              style={[s.card, { opacity: opacAnim, transform: [{ scale: scaleAnim }] }]}
            >
              {/* Icon */}
              <View style={[s.iconWrap, { backgroundColor: iconColor + '15' }]}>
                <Ionicons name={iconName as any} size={28} color={iconColor} />
              </View>

              {/* Text */}
              <Text size="md" weight="bold" style={s.title}>{state.title}</Text>
              {state.message ? (
                <Text size="sm" style={s.message}>{state.message}</Text>
              ) : null}

              {/* Buttons */}
              <View style={[s.btnRow, isInfo && s.btnRowCenter]}>
                {!isInfo && (
                  <Pressable
                    style={[s.btn, s.btnCancel]}
                    onPress={state.onCancel}
                  >
                    <Text size="sm" weight="medium" style={{ color: '#374151' }}>
                      {state.cancelLabel}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  style={[s.btn, { backgroundColor: confirmColor }, isInfo && s.btnFull]}
                  onPress={state.onConfirm}
                >
                  <Text size="sm" weight="bold" style={{ color: '#fff' }}>
                    {state.confirmLabel}
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          </Pressable>
        </Modal>
      )}
    </AlertContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAlert(): AlertContextValue {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    // Fallback so it never crashes if provider is missing — uses native alert
    return {
      showAlert: (title, message) => Alert.alert(title, message ?? ''),
      confirm: (title, message, onConfirm, options = {}) => {
        const { confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive = false } = options;
        Alert.alert(title, message, [
          { text: cancelLabel, style: 'cancel' },
          { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
        ]);
      },
    };
  }
  return ctx;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius:    20,
    padding:         28,
    width:           '100%',
    maxWidth:        380,
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOpacity:   0.18,
    shadowRadius:    24,
    shadowOffset:    { width: 0, height: 8 },
  },
  iconWrap: {
    width:         60,
    height:        60,
    borderRadius:  30,
    alignItems:    'center',
    justifyContent:'center',
    marginBottom:  16,
  },
  title: {
    textAlign:    'center',
    color:        '#111827',
    marginBottom: 8,
  },
  message: {
    textAlign:    'center',
    color:        '#6B7280',
    lineHeight:   20,
    marginBottom: 24,
  },
  btnRow: {
    flexDirection: 'row',
    gap:           10,
    width:         '100%',
    marginTop:     8,
  },
  btnRowCenter: {
    justifyContent: 'center',
  },
  btn: {
    flex:           1,
    borderRadius:   12,
    paddingVertical: 13,
    alignItems:     'center',
    justifyContent: 'center',
  },
  btnFull: {
    flex: 0,
    width: 160,
  },
  btnCancel: {
    backgroundColor: '#F3F4F6',
  },
});
