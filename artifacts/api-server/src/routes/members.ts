import { Router } from 'express';
import { and, eq, ne } from 'drizzle-orm';
import { db, memberships, profiles } from '@workspace/db';
import { requireAuth } from '../middlewares/auth.js';

const router = Router({ mergeParams: true });

async function getActiveMembership(userId: string, orgId: string) {
  const [membership] = await db
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
  return membership ?? null;
}

// GET /orgs/:orgId/members
router.get('/', requireAuth, async (req, res) => {
  const orgId = req.params.orgId as string;

  const requesterMembership = await getActiveMembership(req.user.id, orgId);
  if (!requesterMembership) {
    res.status(403).json({ error: 'Not a member of this organization' });
    return;
  }

  const rows = await db
    .select({
      membership: memberships,
      profile: {
        id: profiles.id,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        email: profiles.email,
        avatarUrl: profiles.avatarUrl,
        graduationYear: profiles.graduationYear,
        major: profiles.major,
      },
    })
    .from(memberships)
    .innerJoin(profiles, eq(memberships.userId, profiles.id))
    .where(
      and(
        eq(memberships.orgId, orgId),
        eq(memberships.isDeleted, false),
        ne(memberships.status, 'inactive'),
      ),
    )
    .orderBy(profiles.lastName, profiles.firstName);

  res.json(rows);
});

// PATCH /orgs/:orgId/members/:membershipId
router.patch('/:membershipId', requireAuth, async (req, res) => {
  const orgId = req.params.orgId as string;
  const membershipId = req.params.membershipId as string;

  const requesterMembership = await getActiveMembership(req.user.id, orgId);
  if (!requesterMembership) {
    res.status(403).json({ error: 'Not a member of this organization' });
    return;
  }

  const [target] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.orgId, orgId),
        eq(memberships.isDeleted, false),
      ),
    )
    .limit(1);

  if (!target) {
    res.status(404).json({ error: 'Membership not found' });
    return;
  }

  const allowed = [
    'status',
    'isBlocked',
    'blockReason',
    'canAttendEvents',
    'canRsvpEvents',
    'canViewCalendar',
    'canSubmitExcuses',
    'duesStatus',
    'duesBalance',
    'duesHold',
    'memberNumber',
    'pinNumber',
    'isVisible',
    'joinedAt',
    'initiatedAt',
    'graduatedAt',
  ] as const;

  const validStatuses = ['active', 'inactive', 'alumni', 'suspended', 'pending', 'new_member'];
  const validDuesStatuses = ['current', 'overdue', 'delinquent', 'waived', 'payment_plan'];

  if ('status' in req.body && !validStatuses.includes(req.body.status)) {
    res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    return;
  }
  if ('duesStatus' in req.body && !validDuesStatuses.includes(req.body.duesStatus)) {
    res.status(400).json({ error: `duesStatus must be one of: ${validDuesStatuses.join(', ')}` });
    return;
  }

  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }

  if (updates.isBlocked === true) {
    updates.blockedAt = new Date();
    updates.blockedBy = req.user.id;
  } else if (updates.isBlocked === false) {
    updates.blockedAt = null;
    updates.blockedBy = null;
    updates.blockReason = null;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  const [updated] = await db
    .update(memberships)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(memberships.id, membershipId))
    .returning();

  res.json(updated);
});

// DELETE (soft) /orgs/:orgId/members/:membershipId
router.delete('/:membershipId', requireAuth, async (req, res) => {
  const orgId = req.params.orgId as string;
  const membershipId = req.params.membershipId as string;

  const requesterMembership = await getActiveMembership(req.user.id, orgId);
  if (!requesterMembership) {
    res.status(403).json({ error: 'Not a member of this organization' });
    return;
  }

  const [target] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.orgId, orgId),
        eq(memberships.isDeleted, false),
      ),
    )
    .limit(1);

  if (!target) {
    res.status(404).json({ error: 'Membership not found' });
    return;
  }

  await db
    .update(memberships)
    .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(memberships.id, membershipId));

  res.status(204).send();
});

export default router;
