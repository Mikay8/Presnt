/**
 * lib/notifications.ts
 *
 * Push notification helpers for Presnt.
 *
 * Responsibilities:
 *   1. Register the device for push notifications, get an Expo push token
 *   2. Save the token to profiles.push_token in Supabase
 *   3. Configure notification channels (Android)
 *   4. Handle foreground notification display
 *   5. Parse notification data payloads → deep-link targets
 *
 * Usage in _layout.tsx:
 *   import { registerForPushNotifications, setupNotificationHandlers } from '@/lib/notifications';
 */

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// ─── Foreground behaviour ──────────────────────────────────────────────────────
// Show a banner + play sound even when the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationPayload = {
  type:         NotificationType;
  resource_id?: string;       // event_id, excuse_id, membership_id, etc.
  org_id?:      string;
};

export type NotificationType =
  | 'excuse_submitted'
  | 'excuse_approved'
  | 'excuse_denied'
  | 'compliance_warning'
  | 'event_reminder'
  | 'event_open'
  | 'role_assigned'
  | 'dues_hold'
  | 'announcement'
  | 'generic';

// ─── Token registration ────────────────────────────────────────────────────────

/**
 * Request permission, obtain an Expo push token, save it to the DB.
 * Returns the token string, or null if permission denied / not a device.
 *
 * Safe to call multiple times — only performs DB write if the token changed.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('[Notifications] Skipping — not a physical device');
    return null;
  }

  // Android: create a notification channel before requesting permission
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name:                 'Default',
      importance:           Notifications.AndroidImportance.MAX,
      vibrationPattern:     [0, 250, 250, 250],
      lightColor:           '#6366F1',
      showBadge:            true,
      enableVibrate:        true,
    });

    await Notifications.setNotificationChannelAsync('announcements', {
      name:                 'Announcements',
      description:          'Chapter and org-wide announcements from officers',
      importance:           Notifications.AndroidImportance.HIGH,
      vibrationPattern:     [0, 250, 250, 250],
      lightColor:           '#6366F1',
      showBadge:            true,
    });

    await Notifications.setNotificationChannelAsync('events', {
      name:                 'Events',
      description:          'Event reminders and check-in notifications',
      importance:           Notifications.AndroidImportance.HIGH,
      vibrationPattern:     [0, 250, 250, 250],
      lightColor:           '#6366F1',
      showBadge:            true,
    });
  }

  // Request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Notifications] Permission denied');
    return null;
  }

  // Get token — requires a projectId from app.json / EAS
  let token: string | null = null;
  try {
    const result = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
    });
    token = result.data;
  } catch (err) {
    console.warn('[Notifications] Failed to get push token:', err);
    return null;
  }

  if (!token) return null;

  // Persist to Supabase — only write if changed to avoid unnecessary updates
  try {
    const { data: existing } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', userId)
      .single();

    if (existing?.push_token !== token) {
      await supabase
        .from('profiles')
        .update({ push_token: token, updated_at: new Date().toISOString() })
        .eq('id', userId);
      console.log('[Notifications] Push token saved');
    }
  } catch (err) {
    console.warn('[Notifications] Failed to save push token:', err);
  }

  return token;
}

// ─── Clear push token on sign-out ─────────────────────────────────────────────

export async function clearPushToken(userId: string): Promise<void> {
  try {
    await supabase
      .from('profiles')
      .update({ push_token: null, updated_at: new Date().toISOString() })
      .eq('id', userId);
  } catch {
    // non-fatal
  }
}

// ─── Notification handlers ────────────────────────────────────────────────────

type Cleanup = () => void;

/**
 * Set up foreground + background tap listeners.
 * Returns a cleanup function to call in useEffect's return.
 */
export function setupNotificationHandlers(): Cleanup {
  // Foreground: notification received while app is open
  const foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
    console.log('[Notifications] Received in foreground:', notification.request.content.title);
    // The default handler (setNotificationHandler above) shows the banner automatically.
  });

  // Background/quit: user tapped the notification
  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as NotificationPayload | undefined;
    if (data) handleNotificationTap(data);
  });

  return () => {
    foregroundSub.remove();
    responseSub.remove();
  };
}

/**
 * Handle cold-start deep link — call this once after app mounts.
 * If the app was killed and opened via a notification, Expo surfaces it here.
 */
export async function handleLastNotification(): Promise<void> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (response) {
    const data = response.notification.request.content.data as NotificationPayload | undefined;
    if (data) handleNotificationTap(data);
  }
}

// ─── Deep-link router ─────────────────────────────────────────────────────────

function handleNotificationTap(data: NotificationPayload): void {
  switch (data.type) {
    case 'event_reminder':
    case 'event_open':
      if (data.resource_id) {
        router.push(`/(member)/event/${data.resource_id}` as any);
      }
      break;

    case 'excuse_approved':
    case 'excuse_denied':
      router.push('/(member)/excuses/history' as any);
      break;

    case 'excuse_submitted':
      if (data.resource_id) {
        router.push(`/(officer)/excuses/${data.resource_id}` as any);
      } else {
        router.push('/(officer)/excuses' as any);
      }
      break;

    case 'compliance_warning':
      router.push('/(member)/status' as any);
      break;

    case 'role_assigned':
      router.push('/(member)/profile' as any);
      break;

    case 'dues_hold':
      router.push('/(member)/status' as any);
      break;

    case 'announcement':
      router.push('/(member)/' as any);
      break;

    default:
      // No deep link for generic or unknown types
      break;
  }
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

/** Set the app badge count (iOS) */
export async function setBadgeCount(count: number): Promise<void> {
  if (Platform.OS === 'ios') {
    await Notifications.setBadgeCountAsync(count);
  }
}

/** Clear the app badge */
export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0);
}
