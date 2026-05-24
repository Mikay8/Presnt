/**
 * Phase 5 — Excuses & Appeals
 *
 * POST   /excuses                              — member submits an excuse
 * GET    /excuses/:excuseId                    — get one excuse (member own / officer org)
 * PATCH  /excuses/:excuseId/approve            — officer approves
 * PATCH  /excuses/:excuseId/deny               — officer denies
 * PATCH  /excuses/:excuseId/escalate           — officer escalates
 * PATCH  /excuses/:excuseId/withdraw           — member withdraws pending excuse
 * GET    /orgs/:orgId/excuses                  — officer: all excuses in org
 * GET    /members/:membershipId/excuses        — member own excuse history
 */

import { Router } from 'express';
import { and, eq, desc } from 'drizzle-orm';
import { db, excuses, excuseAuditLog, memberships, profiles } from '@workspace/db';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get membership for userId in orgId (must be active, not deleted). */
async function getMembership(userId: string, orgId: string) {
  const [m] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.orgId, orgId),
        eq(memberships.isDeleted, false),
      ),
    )
    .limit(1);
  return m ?? null;
}

/** Write an audit log entry for an excuse status change. */
async function logExcuseAudit(
  excuseId: string,
  changedBy: string,
  previousStatus: string | null,
  newStatus: string,
  note?: string,
) {
  await db.insert(excuseAuditLog).values({
    excuseId,
    changedBy,
    previousStatus,
    newStatus,
    note: note ?? null,
  });
}

// ─── POST /excuses ─────────────────────────────────────────────────────────────
// Member submits an excuse for a missed event.

router.post('/', requireAuth, async (req, res) => {
  const { org_id, event_id, reason } = req.body as {
    org_id: string;
    event_id: string;
    reason: string;
  };

  if (!org_id || !event_id || !reason?.trim()) {
    res.status(400).json({ error: 'org_id, event_id, and reason are required' });
    return;
  }

  const membership = await getMembership(req.user.id, org_id);
  if (!membership) {
    res.status(403).json({ error: 'Not a member of this organization' });
    return;
  }

  if (membership.canSubmitExcuses === false) {
    res.status(403).json({ error: 'You are not permitted to submit excuses' });
    return;
  }

  // Check for duplicate pending excuse for same event
  const [existing] = await db
    .select({ id: excuses.id })
    .from(excuses)
    .where(
      and(
        eq(excuses.membershipId, membership.id),
        eq(excuses.eventId, event_id),
        eq(excuses.status, 'pending'),
      ),
    )
    .limit(1);

  if (existing) {
    res.status(409).json({ error: 'A pending excuse already exists for this event' });
    return;
  }

  const [excuse] = await db
    .insert(excuses)
    .values({
      orgId:        org_id,
      userId:       req.user.id,
      membershipId: membership.id,
      eventId:      event_id,
      reason:       reason.trim(),
      status:       'pending',
    })
    .returning();

  await logExcuseAudit(excuse!.id, req.user.id, null, 'pending', 'Excuse submitted');

  res.status(201).json({ excuse });
});

// ─── GET /excuses/:excuseId ───────────────────────────────────────────────────

router.get('/:excuseId', requireAuth, async (req, res) => {
  let { excuseId } = req.params;
  if (Array.isArray(excuseId)) excuseId = excuseId[0];

  const [excuse] = await db
    .select()
    .from(excuses)
    .where(eq(excuses.id, excuseId))
    .limit(1);

  if (!excuse) {
    res.status(404).json({ error: 'Excuse not found' });
    return;
  }

  // Allow if owner OR member of the same org
  if (excuse.userId !== req.user.id) {
    const membership = await getMembership(req.user.id, excuse.orgId);
    if (!membership) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  }

  // Fetch audit trail
  const auditTrail = await db
    .select()
    .from(excuseAuditLog)
    .where(eq(excuseAuditLog.excuseId, excuseId))
    .orderBy(desc(excuseAuditLog.changedAt));

  res.json({ excuse, auditTrail });
});

// ─── PATCH /excuses/:excuseId/approve ────────────────────────────────────────

router.patch('/:excuseId/approve', requireAuth, async (req, res) => {
  let { excuseId } = req.params;
  if (Array.isArray(excuseId)) excuseId = excuseId[0];
  const { note } = req.body as { note?: string };

  const [excuse] = await db
    .select()
    .from(excuses)
    .where(eq(excuses.id, excuseId))
    .limit(1);

  if (!excuse) { res.status(404).json({ error: 'Excuse not found' }); return; }

  const membership = await getMembership(req.user.id, excuse.orgId);
  if (!membership) { res.status(403).json({ error: 'Forbidden' }); return; }

  if (excuse.status !== 'pending' && excuse.status !== 'escalated') {
    res.status(409).json({ error: `Cannot approve an excuse with status '${excuse.status}'` });
    return;
  }

  const prev = excuse.status;
  const [updated] = await db
    .update(excuses)
    .set({
      status:      'approved',
      reviewedBy:  req.user.id,
      reviewedAt:  new Date(),
      reviewerNote: note ?? null,
      updatedAt:   new Date(),
    })
    .where(eq(excuses.id, excuseId))
    .returning();

  await logExcuseAudit(excuseId, req.user.id, prev, 'approved', note);

  res.json({ excuse: updated });
});

// ─── PATCH /excuses/:excuseId/deny ───────────────────────────────────────────

router.patch('/:excuseId/deny', requireAuth, async (req, res) => {
  let { excuseId } = req.params;
  if (Array.isArray(excuseId)) excuseId = excuseId[0];
  const { note } = req.body as { note?: string };

  const [excuse] = await db
    .select()
    .from(excuses)
    .where(eq(excuses.id, excuseId))
    .limit(1);

  if (!excuse) { res.status(404).json({ error: 'Excuse not found' }); return; }

  const membership = await getMembership(req.user.id, excuse.orgId);
  if (!membership) { res.status(403).json({ error: 'Forbidden' }); return; }

  if (excuse.status !== 'pending' && excuse.status !== 'escalated') {
    res.status(409).json({ error: `Cannot deny an excuse with status '${excuse.status}'` });
    return;
  }

  const prev = excuse.status;
  const [updated] = await db
    .update(excuses)
    .set({
      status:      'denied',
      reviewedBy:  req.user.id,
      reviewedAt:  new Date(),
      reviewerNote: note ?? null,
      updatedAt:   new Date(),
    })
    .where(eq(excuses.id, excuseId))
    .returning();

  await logExcuseAudit(excuseId, req.user.id, prev, 'denied', note);

  res.json({ excuse: updated });
});

// ─── PATCH /excuses/:excuseId/escalate ───────────────────────────────────────

router.patch('/:excuseId/escalate', requireAuth, async (req, res) => {
  let { excuseId } = req.params;
  if (Array.isArray(excuseId)) excuseId = excuseId[0];
  const { escalated_to, escalation_reason } = req.body as {
    escalated_to?: string;
    escalation_reason?: string;
  };

  const [excuse] = await db
    .select()
    .from(excuses)
    .where(eq(excuses.id, excuseId))
    .limit(1);

  if (!excuse) { res.status(404).json({ error: 'Excuse not found' }); return; }

  const membership = await getMembership(req.user.id, excuse.orgId);
  if (!membership) { res.status(403).json({ error: 'Forbidden' }); return; }

  if (excuse.status !== 'pending') {
    res.status(409).json({ error: `Cannot escalate an excuse with status '${excuse.status}'` });
    return;
  }

  const prev = excuse.status;
  const [updated] = await db
    .update(excuses)
    .set({
      status:           'escalated',
      escalatedTo:      escalated_to ?? null,
      escalatedAt:      new Date(),
      escalationReason: escalation_reason ?? null,
      updatedAt:        new Date(),
    })
    .where(eq(excuses.id, excuseId))
    .returning();

  await logExcuseAudit(excuseId, req.user.id, prev, 'escalated', escalation_reason);

  res.json({ excuse: updated });
});

// ─── PATCH /excuses/:excuseId/withdraw ───────────────────────────────────────

router.patch('/:excuseId/withdraw', requireAuth, async (req, res) => {
  let { excuseId } = req.params;
  if (Array.isArray(excuseId)) excuseId = excuseId[0];

  const [excuse] = await db
    .select()
    .from(excuses)
    .where(eq(excuses.id, excuseId))
    .limit(1);

  if (!excuse) { res.status(404).json({ error: 'Excuse not found' }); return; }

  // Only the excuse owner can withdraw
  if (excuse.userId !== req.user.id) {
    res.status(403).json({ error: 'Only the submitter can withdraw an excuse' });
    return;
  }

  if (excuse.status !== 'pending') {
    res.status(409).json({ error: `Cannot withdraw an excuse with status '${excuse.status}'` });
    return;
  }

  const [updated] = await db
    .update(excuses)
    .set({ status: 'withdrawn', updatedAt: new Date() })
    .where(eq(excuses.id, excuseId))
    .returning();

  await logExcuseAudit(excuseId, req.user.id, 'pending', 'withdrawn');

  res.json({ excuse: updated });
});

// ─── GET /orgs/:orgId/excuses ─────────────────────────────────────────────────
// Officer: all excuses for the org, optional ?status= filter.

router.get('/orgs/:orgId/excuses', requireAuth, async (req, res) => {
  let { orgId } = req.params;
  if (Array.isArray(orgId)) orgId = orgId[0];
  let statusFilter = req.query.status as string | undefined;
  if (Array.isArray(statusFilter)) statusFilter = statusFilter[0];

  const membership = await getMembership(req.user.id, orgId);
  if (!membership) {
    res.status(403).json({ error: 'Not a member of this organization' });
    return;
  }

  const conditions = [eq(excuses.orgId, orgId)];
  if (statusFilter) {
    conditions.push(eq(excuses.status, statusFilter));
  }

  const rows = await db
    .select({
      excuse:   excuses,
      profile:  {
        id:        profiles.id,
        firstName: profiles.firstName,
        lastName:  profiles.lastName,
        email:     profiles.email,
      },
    })
    .from(excuses)
    .leftJoin(profiles, eq(profiles.id, excuses.userId))
    .where(and(...conditions))
    .orderBy(desc(excuses.submittedAt));

  res.json({ excuses: rows });
});

// ─── GET /members/:membershipId/excuses ───────────────────────────────────────
// Member's own excuse history (or officer viewing a member).

router.get('/members/:membershipId/excuses', requireAuth, async (req, res) => {
  let { membershipId } = req.params;
  if (Array.isArray(membershipId)) membershipId = membershipId[0];

  // Fetch the membership to verify access
  const [targetMembership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);

  if (!targetMembership) {
    res.status(404).json({ error: 'Membership not found' });
    return;
  }

  // Allow if the requesting user owns this membership OR is in the same org
  if (targetMembership.userId !== req.user.id) {
    const callerMembership = await getMembership(req.user.id, targetMembership.orgId);
    if (!callerMembership) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  }

  const rows = await db
    .select()
    .from(excuses)
    .where(eq(excuses.membershipId, membershipId))
    .orderBy(desc(excuses.submittedAt));

  res.json({ excuses: rows });
});

export default router;
