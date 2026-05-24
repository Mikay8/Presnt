/**
 * Phase 6 — Member Restrictions & Dues
 *
 * Mounted at:
 *   /orgs/:orgId/members/:membershipId/restrictions  (via members router merge)
 *   /restrictions/:restrictionId/lift
 *   /orgs/:orgId/members/:membershipId/dues
 *   /dues/:balanceId/transactions
 *   /orgs/:orgId/dues/overdue
 */

import { and, desc, eq, gt, ne } from 'drizzle-orm';
import { Router } from 'express';

import {
  db,
  duesBalances,
  duesTransactions,
  insertDuesBalanceSchema,
  insertDuesTransactionSchema,
  insertMemberRestrictionSchema,
  memberRestrictions,
  memberships,
  profiles,
  restrictionAuditLog,
} from '@workspace/db';

import { requireAuth } from '../middlewares/auth.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function isOfficerOrAdmin(userId: string, orgId: string): Promise<boolean> {
  const [m] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId), eq(memberships.isDeleted, false)))
    .limit(1);
  return m ? ['officer', 'admin', 'org_admin'].includes(m.role) : false;
}

async function appendAuditLog(
  membershipId: string,
  restrictionId: string | null,
  orgId: string,
  action: string,
  performedBy: string,
  reason?: string,
  context?: object,
) {
  await db.insert(restrictionAuditLog).values({
    membershipId,
    restrictionId: restrictionId ?? undefined,
    orgId,
    action,
    performedBy,
    reason,
    context: context ?? undefined,
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router({ mergeParams: true });

// ── GET /orgs/:orgId/members/:membershipId/restrictions ──────────────────────
router.get('/orgs/:orgId/members/:membershipId/restrictions', requireAuth, async (req, res) => {
  let { orgId, membershipId } = req.params;
  if (Array.isArray(orgId)) orgId = orgId[0];
  if (Array.isArray(membershipId)) membershipId = membershipId[0];

  if (!(await isOfficerOrAdmin(req.user.id, orgId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const rows = await db
    .select()
    .from(memberRestrictions)
    .where(and(eq(memberRestrictions.membershipId, membershipId), eq(memberRestrictions.orgId, orgId)))
    .orderBy(desc(memberRestrictions.createdAt));

  res.json(rows);
});

// ── POST /orgs/:orgId/members/:membershipId/restrictions ─────────────────────
router.post('/orgs/:orgId/members/:membershipId/restrictions', requireAuth, async (req, res) => {
  let { orgId, membershipId } = req.params;
  if (Array.isArray(orgId)) orgId = orgId[0];
  if (Array.isArray(membershipId)) membershipId = membershipId[0];

  if (!(await isOfficerOrAdmin(req.user.id, orgId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = insertMemberRestrictionSchema.safeParse({
    ...req.body,
    membershipId,
    orgId,
    createdBy: req.user.id,
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [restriction] = await db.insert(memberRestrictions).values(parsed.data).returning();

  // Sync the shortcut flags on memberships for fast reads
  const updates: Partial<typeof memberships.$inferInsert> = {};
  if (restriction.blocksEventAttendance) updates.canAttendEvents = false;
  if (restriction.blocksEventRsvp)       updates.canRsvpEvents   = false;
  if (restriction.blocksExcuseSubmission)updates.canSubmitExcuses= false;
  if (restriction.restrictionType === 'dues_hold') {
    updates.duesHold      = true;
    updates.duesHoldSince = new Date();
    updates.duesStatus    = 'overdue';
  }
  if (Object.keys(updates).length > 0) {
    await db.update(memberships).set(updates).where(eq(memberships.id, membershipId));
  }

  await appendAuditLog(membershipId, restriction.id, orgId, 'restriction_applied', req.user.id, restriction.reason);

  res.status(201).json(restriction);
});

// ── PATCH /restrictions/:restrictionId/lift ───────────────────────────────────
router.patch('/restrictions/:restrictionId/lift', requireAuth, async (req, res) => {
  let { restrictionId } = req.params;
  if (Array.isArray(restrictionId)) restrictionId = restrictionId[0];
  const { liftReason } = req.body as { liftReason?: string };

  const [existing] = await db
    .select()
    .from(memberRestrictions)
    .where(eq(memberRestrictions.id, restrictionId))
    .limit(1);

  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }

  if (!(await isOfficerOrAdmin(req.user.id, existing.orgId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const [updated] = await db
    .update(memberRestrictions)
    .set({ isActive: false, liftedBy: req.user.id, liftedAt: new Date(), liftReason: liftReason ?? null })
    .where(eq(memberRestrictions.id, restrictionId))
    .returning();

  // Check if any other active restrictions still block the same things
  const activeRestrictions = await db
    .select()
    .from(memberRestrictions)
    .where(and(
      eq(memberRestrictions.membershipId, existing.membershipId),
      eq(memberRestrictions.isActive, true),
    ));

  const stillBlocksAttend  = activeRestrictions.some(r => r.blocksEventAttendance);
  const stillBlocksRsvp    = activeRestrictions.some(r => r.blocksEventRsvp);
  const stillBlocksExcuses = activeRestrictions.some(r => r.blocksExcuseSubmission);
  const stillHasDuesHold   = activeRestrictions.some(r => r.restrictionType === 'dues_hold');

  await db.update(memberships).set({
    canAttendEvents:  !stillBlocksAttend,
    canRsvpEvents:    !stillBlocksRsvp,
    canSubmitExcuses: !stillBlocksExcuses,
    duesHold:         stillHasDuesHold,
    ...(stillHasDuesHold ? {} : { duesStatus: 'current' }),
  }).where(eq(memberships.id, existing.membershipId));

  await appendAuditLog(existing.membershipId, restrictionId, existing.orgId, 'restriction_lifted', req.user.id, liftReason);

  res.json(updated);
});

// ── GET /orgs/:orgId/members/:membershipId/dues ───────────────────────────────
router.get('/orgs/:orgId/members/:membershipId/dues', requireAuth, async (req, res) => {
  let { orgId, membershipId } = req.params;
  if (Array.isArray(orgId)) orgId = orgId[0];
  if (Array.isArray(membershipId)) membershipId = membershipId[0];

  // Officers OR the member themselves can view
  const [callerMembership] = await db
    .select({ role: memberships.role, id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, req.user.id), eq(memberships.orgId, orgId), eq(memberships.isDeleted, false)))
    .limit(1);

  if (!callerMembership) { res.status(403).json({ error: 'Forbidden' }); return; }

  const isSelf = callerMembership.id === membershipId;
  const isStaff = ['officer', 'admin', 'org_admin'].includes(callerMembership.role);
  if (!isSelf && !isStaff) { res.status(403).json({ error: 'Forbidden' }); return; }

  const balances = await db
    .select()
    .from(duesBalances)
    .where(and(eq(duesBalances.membershipId, membershipId), eq(duesBalances.orgId, orgId)))
    .orderBy(desc(duesBalances.createdAt));

  res.json(balances);
});

// ── POST /orgs/:orgId/dues/balances ───────────────────────────────────────────
router.post('/orgs/:orgId/dues/balances', requireAuth, async (req, res) => {
  let { orgId } = req.params;
  if (Array.isArray(orgId)) orgId = orgId[0];

  if (!(await isOfficerOrAdmin(req.user.id, orgId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = insertDuesBalanceSchema.safeParse({ ...req.body, orgId });
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [balance] = await db.insert(duesBalances).values(parsed.data).returning();
  res.status(201).json(balance);
});

// ── POST /dues/:balanceId/transactions ────────────────────────────────────────
router.post('/dues/:balanceId/transactions', requireAuth, async (req, res) => {
  let { balanceId } = req.params;
  if (Array.isArray(balanceId)) balanceId = balanceId[0];

  const [balance] = await db
    .select()
    .from(duesBalances)
    .where(eq(duesBalances.id, balanceId))
    .limit(1);
  if (!balance) { res.status(404).json({ error: 'Not found' }); return; }

  if (!(await isOfficerOrAdmin(req.user.id, balance.orgId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = insertDuesTransactionSchema.safeParse({
    ...req.body,
    duesBalanceId: balanceId,
    membershipId:  balance.membershipId,
    orgId:         balance.orgId,
    recordedBy:    req.user.id,
  });
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [tx] = await db.insert(duesTransactions).values(parsed.data).returning();

  // Update balance amounts
  const isCredit = parsed.data.direction === 'credit';
  const amt      = parseFloat(parsed.data.amount);
  if (isCredit) {
    const newPaid = parseFloat(balance.amountPaid ?? '0') + amt;
    const newDue  = parseFloat(balance.amountDue ?? '0');
    const newStatus = newPaid >= newDue ? 'paid' : 'partial';
    await db.update(duesBalances)
      .set({ amountPaid: String(newPaid), status: newStatus, updatedAt: new Date() })
      .where(eq(duesBalances.id, balanceId));

    // Auto-lift dues_hold if fully paid
    if (newStatus === 'paid') {
      await db.update(memberRestrictions)
        .set({ isActive: false, liftedAt: new Date(), liftReason: 'Dues paid in full' })
        .where(and(
          eq(memberRestrictions.membershipId, balance.membershipId),
          eq(memberRestrictions.restrictionType, 'dues_hold'),
          eq(memberRestrictions.isActive, true),
        ));
      await db.update(memberships)
        .set({ duesHold: false, duesStatus: 'current', duesLastPaidAt: new Date() })
        .where(eq(memberships.id, balance.membershipId));
    }
  }

  res.status(201).json(tx);
});

// ── GET /orgs/:orgId/dues/overdue ─────────────────────────────────────────────
router.get('/orgs/:orgId/dues/overdue', requireAuth, async (req, res) => {
  let { orgId } = req.params;
  if (Array.isArray(orgId)) orgId = orgId[0];

  if (!(await isOfficerOrAdmin(req.user.id, orgId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const rows = await db
    .select({
      balance:    duesBalances,
      membership: memberships,
      profile: {
        id:        profiles.id,
        firstName: profiles.firstName,
        lastName:  profiles.lastName,
        email:     profiles.email,
        avatarUrl: profiles.avatarUrl,
      },
    })
    .from(duesBalances)
    .innerJoin(memberships, eq(duesBalances.membershipId, memberships.id))
    .innerJoin(profiles, eq(memberships.userId, profiles.id))
    .where(and(
      eq(duesBalances.orgId, orgId),
      ne(duesBalances.status, 'paid'),
      ne(duesBalances.status, 'waived'),
    ))
    .orderBy(desc(duesBalances.amountDue));

  res.json(rows);
});

export default router;
