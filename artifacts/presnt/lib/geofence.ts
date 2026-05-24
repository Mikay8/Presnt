/**
 * lib/geofence.ts
 *
 * Passive geofence check-in for Presnt.
 *
 * How it works:
 *   1. When an officer opens check-in for an event, the app calls
 *      `registerGeofenceForEvent()` — this registers a background geofence
 *      region using the event's lat/lng + radius.
 *
 *   2. When a member's device enters the region (even with the app closed),
 *      the OS wakes up the `PRESNT_GEOFENCE` background task. The task
 *      POSTs to `/attendance/geofence-checkin` with the event_id. The API
 *      server inserts a `geofence_events` row and — if the event is still
 *      open and the member isn't restricted — upserts `event_attendance`.
 *
 *   3. When check-in closes (officer ends it, or event time passes),
 *      `unregisterGeofenceForEvent()` removes the region so the task
 *      doesn't fire for stale events.
 *
 * Requirements:
 *   - expo-location ~19.x  (already in package.json)
 *   - expo-task-manager    (added in Phase 8)
 *   - Background location permission granted during onboarding
 *
 * Notes:
 *   - The background task MUST be defined at the top level of a module that
 *     is imported before the app tree renders. We import this file from
 *     app/_layout.tsx so TaskManager.defineTask() runs on every cold start.
 *   - Geofencing is iOS + Android only; we guard against web silently.
 *   - The API base URL is read from EXPO_PUBLIC_API_URL at build time.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

export const GEOFENCE_TASK = 'PRESNT_GEOFENCE';

/** Default radius (metres) if the event doesn't specify one. */
const DEFAULT_RADIUS_M = 100;

// ─── Background task definition ───────────────────────────────────────────────
// Must be called at module level (before any React tree renders) so that
// TaskManager can restore it after the OS wakes the app in the background.

if (Platform.OS !== 'web') {
  TaskManager.defineTask(
    GEOFENCE_TASK,
    async ({ data, error }: TaskManager.TaskManagerTaskBody<{
      eventType: Location.GeofencingEventType;
      region:    Location.LocationRegion;
    }>) => {
      if (error) {
        console.warn('[Geofence] Task error:', error.message);
        return;
      }

      const { eventType, region } = data;

      // We only care about entering a region (not exit/dwell for check-in)
      if (eventType !== Location.GeofencingEventType.Enter) return;

      // region.identifier = event_id
      const eventId = region.identifier;
      if (!eventId) return;

      // Retrieve the current session token from Supabase's storage layer.
      // supabase.auth.getSession() is safe to call in a background task.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          console.warn('[Geofence] No session — skipping check-in');
          return;
        }

        const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
        const resp = await fetch(`${apiUrl}/attendance/geofence-checkin`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            event_id:    eventId,
            trigger_type: 'enter',
            lat:          region.latitude,
            lng:          region.longitude,
          }),
        });

        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          console.warn('[Geofence] Check-in failed:', resp.status, txt);
        } else {
          console.log('[Geofence] Check-in recorded for event', eventId);
        }
      } catch (err) {
        console.warn('[Geofence] Network error during check-in:', err);
      }
    }
  );
}

// ─── Permission helpers ───────────────────────────────────────────────────────

/**
 * Request foreground + background location permissions.
 * Returns true if background permission is granted.
 * Safe to call multiple times.
 */
export async function requestGeofencePermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  // Foreground must be granted before background can be requested
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return false;

  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  return bg === 'granted';
}

/**
 * Returns true if background location permission is already granted.
 */
export async function hasGeofencePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status } = await Location.getBackgroundPermissionsAsync();
  return status === 'granted';
}

// ─── Register / unregister ────────────────────────────────────────────────────

export type GeofenceRegion = {
  eventId:   string;
  lat:       number;
  lng:       number;
  radiusM?:  number;
};

/**
 * Register a geofence region for a given event.
 * The region identifier is the event UUID so the background task knows
 * which event triggered the enter.
 *
 * Safe to call even if the region is already registered — expo-location
 * will merge by identifier.
 */
export async function registerGeofenceForEvent(region: GeofenceRegion): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const hasPermission = await hasGeofencePermission();
  if (!hasPermission) {
    console.warn('[Geofence] Background location permission not granted');
    return false;
  }

  try {
    // Fetch current regions and avoid duplicates
    const current = await (Location as any).getGeofencingTasksAsync(GEOFENCE_TASK).catch(() => []);
    const alreadyRegistered = current.some((r: Location.LocationRegion) => r.identifier === region.eventId);
    if (alreadyRegistered) {
      console.log('[Geofence] Region already registered for event', region.eventId);
      return true;
    }

    await Location.startGeofencingAsync(GEOFENCE_TASK, [
      {
        identifier: region.eventId,
        latitude:   region.lat,
        longitude:  region.lng,
        radius:     region.radiusM ?? DEFAULT_RADIUS_M,
        notifyOnEnter: true,
        notifyOnExit:  false,
      },
    ]);

    console.log('[Geofence] Registered region for event', region.eventId, `radius=${region.radiusM ?? DEFAULT_RADIUS_M}m`);
    return true;
  } catch (err) {
    console.warn('[Geofence] Failed to register region:', err);
    return false;
  }
}

/**
 * Unregister the geofence region for a specific event.
 * Call this when check-in closes or the event ends.
 */
export async function unregisterGeofenceForEvent(eventId: string): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const isRunning = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
    if (!isRunning) return;

    // Re-register with all regions EXCEPT the one being removed
    const current = await (Location as any).getGeofencingTasksAsync(GEOFENCE_TASK).catch(() => [] as Location.LocationRegion[]);
    const remaining = (current as Location.LocationRegion[]).filter(
      (r) => r.identifier !== eventId
    );

    if (remaining.length === 0) {
      // No more regions — stop geofencing entirely
      await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
    } else {
      await Location.startGeofencingAsync(GEOFENCE_TASK, remaining);
    }

    console.log('[Geofence] Unregistered region for event', eventId);
  } catch (err) {
    console.warn('[Geofence] Failed to unregister region:', err);
  }
}

/**
 * Stop all active geofence regions (e.g. on sign-out).
 */
export async function stopAllGeofences(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const isRunning = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
    if (isRunning) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
  } catch {
    // non-fatal
  }
}
