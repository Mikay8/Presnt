/**
 * Phase 8 — Passive Geofence Check-In
 *
 * POST /attendance/geofence-checkin
 *   Called by the mobile background task when a member's device enters
 *   an event geofence region. This is the single write path for geofence
 *   check-ins — it:
 *
 *   1. Validates the event is still open for check-in
 *   2. Resolves the caller's membership for this org
 *   3. Checks can_attend_events restriction flag
 *   4. Calculates distance from event coordinates to submitted coordinates
 *   5. Inserts a geofence_events row (raw audit log)
 *   6. Upserts event_attendance — NEVER overwrites an existing
 *      'present' or 'manual' record so QR and officer-entered check-ins
 *      are not clobbered
 *   7. Marks the geofence_events row as processed
 */

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// ─── Per-request Supabase client (anon key + user JWT) ───────────────────────
// Passes the caller's Bearer token so Supabase treats every query as that
// authenticated user — RLS policies that allow the user to write their own
// records will pass without needing the service-role key.
function getSupabase(req: import('express').Request) {
  const token = req.headers.authorization!.slice(7); // strip "Bearer "
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

// ─── Haversine distance (metres) ─────────────────────────────────────────────

function haversineMetres(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000; // Earth radius in metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── POST /attendance/geofence-checkin ───────────────────────────────────────

router.post('/attendance/geofence-checkin', requireAuth, async (req, res) => {
  const supabase = getSupabase(req);
  const userId = (req as any).user.id;
  const {
    event_id,
    trigger_type = 'enter',
    lat,
    lng,
    accuracy_m,
  } = req.body as {
    event_id:     string;
    trigger_type?: string;
    lat?:         number;
    lng?:         number;
    accuracy_m?:  number;
  };

  if (!event_id) {
    return res.status(400).json({ error: 'event_id is required' });
  }

  // ── 1. Fetch event ──────────────────────────────────────────────────────────
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('id, org_id, title, start_time, end_time, location_lat, location_lng, geofence_radius_m, geofence_required, is_deleted, is_cancelled, checkin_open_minutes, checkin_grace_minutes')
    .eq('id', event_id)
    .single();

  if (eventErr || !event) {
    return res.status(404).json({ error: 'Event not found' });
  }
  if (event.is_deleted || event.is_cancelled) {
    return res.status(409).json({ error: 'Event is cancelled or deleted' });
  }

  // ── 2. Check event timing ───────────────────────────────────────────────────
  const now       = new Date();
  const startTime = new Date(event.start_time);
  const endTime   = event.end_time ? new Date(event.end_time) : null;

  // Checkin opens `checkin_open_minutes` before start (default 15)
  const openMinutes  = event.checkin_open_minutes  ?? 15;
  const graceMinutes = event.checkin_grace_minutes ?? 15;
  const checkinOpens = new Date(startTime.getTime() - openMinutes * 60_000);
  const checkinCloses = endTime
    ? new Date(endTime.getTime() + graceMinutes * 60_000)
    : new Date(startTime.getTime() + (120 + graceMinutes) * 60_000); // 2h default

  if (now < checkinOpens) {
    return res.status(409).json({ error: 'Check-in has not opened yet' });
  }
  if (now > checkinCloses) {
    return res.status(409).json({ error: 'Check-in window has closed' });
  }

  // ── 3. Resolve membership ───────────────────────────────────────────────────
  const { data: membership, error: mErr } = await supabase
    .from('memberships')
    .select('id, role, can_attend_events, dues_hold, is_blocked, status')
    .eq('user_id', userId)
    .eq('org_id', event.org_id)
    .eq('is_deleted', false)
    .single();

  if (mErr || !membership) {
    return res.status(403).json({ error: 'Not a member of this organization' });
  }
  if (membership.status !== 'active') {
    return res.status(403).json({ error: 'Membership is not active' });
  }

  // ── 4. Check restrictions ───────────────────────────────────────────────────
  if (membership.is_blocked) {
    return res.status(403).json({ error: 'Account is blocked' });
  }
  if (membership.can_attend_events === false) {
    return res.status(403).json({ error: 'Check-in restricted: attendance not permitted' });
  }
  if (membership.dues_hold) {
    return res.status(403).json({ error: 'Check-in restricted: dues hold active' });
  }

  // ── 5. Distance validation (if event has coordinates) ───────────────────────
  let distanceFromEvent: number | null = null;
  if (lat != null && lng != null && event.location_lat != null && event.location_lng != null) {
    distanceFromEvent = Math.round(
      haversineMetres(event.location_lat, event.location_lng, lat, lng)
    );

    // If geofence_required and the event has a defined radius, enforce it
    // with a 50% slop factor to account for GPS inaccuracy
    const maxRadius = (event.geofence_radius_m ?? 100) * 1.5;
    if (event.geofence_required && distanceFromEvent > maxRadius) {
      return res.status(409).json({
        error: `Too far from event location (${distanceFromEvent}m, max ${maxRadius}m)`,
        distance_m: distanceFromEvent,
      });
    }
  }

  // ── 6. Insert geofence_events raw log ────────────────────────────────────────
  const { data: geofenceRow, error: gErr } = await supabase
    .from('geofence_events')
    .insert({
      event_id:      event_id,
      membership_id: membership.id,
      trigger_type,
      lat:           lat ?? null,
      lng:           lng ?? null,
      accuracy_m:    accuracy_m ?? null,
      triggered_at:  now.toISOString(),
    })
    .select('id')
    .single();

  if (gErr) {
    console.error('[Geofence] Failed to insert geofence_events row:', gErr.message);
    // Non-fatal — still attempt the attendance upsert
  }

  // ── 7. Upsert event_attendance ───────────────────────────────────────────────
  // Do NOT clobber an existing 'present' or 'manual' record — geofence is
  // weaker evidence than a QR scan or officer manual entry.
  const { data: existing } = await supabase
    .from('event_attendance')
    .select('id, status, check_in_method')
    .eq('event_id', event_id)
    .eq('user_id', userId)
    .maybeSingle();

  let attendanceAction: 'created' | 'skipped' | 'already_present' = 'created';

  if (existing) {
    if (['present', 'manual'].includes(existing.status) || existing.check_in_method !== 'geofence') {
      // Already checked in by a more authoritative method — skip
      attendanceAction = 'already_present';
    } else {
      // Update the existing geofence row with fresh timestamp
      await supabase
        .from('event_attendance')
        .update({
          status:          'present',
          check_in_method: 'geofence',
          distance_m:      distanceFromEvent,
          checked_in_at:   now.toISOString(),
        })
        .eq('id', existing.id);
      attendanceAction = 'created';
    }
  } else {
    // Fresh insert
    const { error: attErr } = await supabase
      .from('event_attendance')
      .insert({
        event_id:        event_id,
        user_id:         userId,
        org_id:          event.org_id,
        membership_id:   membership.id,
        status:          'present',
        check_in_method: 'geofence',
        distance_m:      distanceFromEvent,
        checked_in_at:   now.toISOString(),
      });

    if (attErr) {
      console.error('[Geofence] Failed to upsert event_attendance:', attErr.message);
      // Mark geofence row as unprocessed so it can be retried
      if (geofenceRow) {
        await supabase
          .from('geofence_events')
          .update({ processed: false })
          .eq('id', geofenceRow.id);
      }
      return res.status(500).json({ error: 'Failed to record attendance' });
    }
  }

  // Mark geofence_events row as processed
  if (geofenceRow) {
    await supabase
      .from('geofence_events')
      .update({ processed: true, processed_at: now.toISOString() })
      .eq('id', geofenceRow.id);
  }

  return res.status(200).json({
    ok:              true,
    attendance:      attendanceAction,
    distance_m:      distanceFromEvent,
  });
});

export default router;
