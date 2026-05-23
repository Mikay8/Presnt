/**
 * Phase 7 — Notifications & Announcements
 *
 * GET    /notifications                        — member: own notifications (newest first)
 * PATCH  /notifications/:id/read              — member: mark one notification read
 * PATCH  /notifications/read-all              — member: mark all unread as read
 *
 * POST   /orgs/:orgId/announcements           — admin/officer: create + send announcement
 * GET    /orgs/:orgId/announcements           — member/officer: list org announcements
 */

import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// ─── Per-request Supabase client (anon key + user JWT) ───────────────────────
// Passes the caller's Bearer token so Supabase treats every query as that
// authenticated user — RLS policies handle row-level access without needing
// the service-role key.
function getSupabase(req: import('express').Request) {
  const token = req.headers.authorization!.slice(7); // strip "Bearer "
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

// ─── Helper: send Expo push notifications ─────────────────────────────────────

type ExpoPushMessage = {
  to:    string;
  title: string;
  body:  string;
  data?: Record<string, unknown>;
  channelId?: string;
};

async function sendExpoPushBatch(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  // Expo push API accepts up to 100 per request
  const CHUNK = 100;
  for (let i = 0; i < messages.length; i += CHUNK) {
    const chunk = messages.slice(i, i + CHUNK);
    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify(chunk),
      });
    } catch (err) {
      console.warn('[Push] Batch delivery failed:', err);
    }
  }
}

// ─── GET /notifications ────────────────────────────────────────────────────────

router.get('/notifications', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const limit  = Math.min(Number(req.query.limit ?? 50), 100);
  const unreadOnly = req.query.unread === 'true';

  const svc = getSupabase(req);

  const { data, error } = await svc
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
    .then(r => unreadOnly
      ? svc.from('notifications').select('*').eq('user_id', userId).eq('is_read', false).order('created_at', { ascending: false }).limit(limit)
      : r
    );

  if (error) return res.status(500).json({ error: error.message });

  // Return unread count alongside list
  const { count } = await svc
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  res.json({ notifications: data ?? [], unread_count: count ?? 0 });
});

// ─── PATCH /notifications/:id/read ────────────────────────────────────────────

router.patch('/notifications/:id/read', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  const { error } = await getSupabase(req)
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId); // RLS: own only

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── PATCH /notifications/read-all ────────────────────────────────────────────

router.patch('/notifications/read-all', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;

  const { error } = await getSupabase(req)
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── POST /orgs/:orgId/announcements ──────────────────────────────────────────

router.post('/orgs/:orgId/announcements', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { orgId } = req.params;

  const svc = getSupabase(req);

  // Verify the user is an admin/officer in this org
  const { data: membership } = await svc
    .from('memberships')
    .select('id, role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .eq('is_deleted', false)
    .single();

  if (!membership || !['admin', 'org_admin', 'officer'].includes(membership.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  // org_admin can send org-wide; admin/officer can only send chapter
  const { title, body, scope = 'chapter', audience = 'all', send_push = true, send_email = false, expires_at } = req.body;

  if (!title?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'title and body are required' });
  }
  if (scope === 'org' && membership.role !== 'org_admin') {
    return res.status(403).json({ error: 'Only org admins can send org-wide announcements' });
  }

  const now = new Date().toISOString();

  // Insert announcement — DB trigger handles creating notification rows
  const { data: announcement, error } = await svc
    .from('announcements')
    .insert({
      org_id:       orgId,
      scope,
      title:        title.trim(),
      body:         body.trim(),
      author_id:    userId,
      created_by:   userId,
      audience,
      send_push,
      send_email,
      published_at: now,
      ...(expires_at ? { expires_at } : {}),
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Deliver push notifications to members with a push_token
  if (send_push) {
    const { data: members } = await svc
      .from('memberships')
      .select('profiles(push_token, id)')
      .eq('org_id', orgId)
      .eq('is_deleted', false)
      .eq('status', 'active')
      .neq('role', 'admin')
      .neq('role', 'org_admin');

    const tokens: string[] = [];
    for (const m of members ?? []) {
      const profile = (m as any).profiles;
      if (profile?.push_token) tokens.push(profile.push_token);
    }

    if (tokens.length > 0) {
      const messages: ExpoPushMessage[] = tokens.map(token => ({
        to:        token,
        title:     title.trim(),
        body:      body.trim(),
        channelId: 'announcements',
        data:      { type: 'announcement', announcement_id: announcement.id, org_id: orgId },
      }));
      await sendExpoPushBatch(messages);

      // Update recipient count
      await svc
        .from('announcements')
        .update({ recipient_count: tokens.length })
        .eq('id', announcement.id);
    }
  }

  res.status(201).json({ announcement });
});

// ─── GET /orgs/:orgId/announcements ───────────────────────────────────────────

router.get('/orgs/:orgId/announcements', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { orgId } = req.params;
  const limit  = Math.min(Number(req.query.limit ?? 20), 100);

  const svc = getSupabase(req);

  // Verify membership
  const { data: membership } = await svc
    .from('memberships')
    .select('id, role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .eq('is_deleted', false)
    .single();

  if (!membership) {
    return res.status(403).json({ error: 'Not a member of this org' });
  }

  const { data, error } = await svc
    .from('announcements')
    .select('id, title, body, scope, created_at, author_id, is_pinned, recipient_count, profiles!author_id(first_name, last_name)')
    .eq('org_id', orgId)
    .eq('is_deleted', false)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ announcements: data ?? [] });
});

export default router;
