import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db, organizations, memberships, academicTerms } from '@workspace/db';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

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

// GET /orgs/:orgId
router.get('/:orgId', requireAuth, async (req, res) => {
  const orgId = req.params.orgId as string;

  const membership = await getActiveMembership(req.user.id, orgId);
  if (!membership) {
    res.status(403).json({ error: 'Not a member of this organization' });
    return;
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, orgId), eq(organizations.isDeleted, false)))
    .limit(1);

  if (!org) {
    res.status(404).json({ error: 'Organization not found' });
    return;
  }

  res.json(org);
});

// PATCH /orgs/:orgId
router.patch('/:orgId', requireAuth, async (req, res) => {
  const orgId = req.params.orgId as string;

  const membership = await getActiveMembership(req.user.id, orgId);
  if (!membership) {
    res.status(403).json({ error: 'Not a member of this organization' });
    return;
  }

  const allowed = [
    'name',
    'institution',
    'greekLetterOrg',
    'timezone',
    'appDisplayName',
    'customFont',
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  const [updated] = await db
    .update(organizations)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(organizations.id, orgId), eq(organizations.isDeleted, false)))
    .returning();

  res.json(updated);
});

// PATCH /orgs/:orgId/branding
router.patch('/:orgId/branding', requireAuth, async (req, res) => {
  const orgId = req.params.orgId as string;

  const membership = await getActiveMembership(req.user.id, orgId);
  if (!membership) {
    res.status(403).json({ error: 'Not a member of this organization' });
    return;
  }

  const hexColor = /^#[0-9A-Fa-f]{6}$/;
  const brandingFields = [
    'primaryColor',
    'secondaryColor',
    'accentColor',
    'backgroundColor',
    'textColor',
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const key of brandingFields) {
    if (key in req.body) {
      if (!hexColor.test(req.body[key])) {
        res.status(400).json({ error: `${key} must be a valid hex color (#RRGGBB)` });
        return;
      }
      updates[key] = req.body[key];
    }
  }
  if ('colorScheme' in req.body) {
    if (!['dark', 'light', 'system'].includes(req.body.colorScheme)) {
      res.status(400).json({ error: 'colorScheme must be dark, light, or system' });
      return;
    }
    updates.colorScheme = req.body.colorScheme;
  }
  if ('logoUrl' in req.body) updates.logoUrl = req.body.logoUrl;
  if ('bannerUrl' in req.body) updates.bannerUrl = req.body.bannerUrl;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No valid branding fields to update' });
    return;
  }

  const [updated] = await db
    .update(organizations)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(organizations.id, orgId), eq(organizations.isDeleted, false)))
    .returning();

  res.json(updated);
});

// GET /orgs/:orgId/terms
router.get('/:orgId/terms', requireAuth, async (req, res) => {
  const orgId = req.params.orgId as string;

  const membership = await getActiveMembership(req.user.id, orgId);
  if (!membership) {
    res.status(403).json({ error: 'Not a member of this organization' });
    return;
  }

  const terms = await db
    .select()
    .from(academicTerms)
    .where(eq(academicTerms.orgId, orgId))
    .orderBy(academicTerms.startDate);

  res.json(terms);
});

// POST /orgs/:orgId/terms
router.post('/:orgId/terms', requireAuth, async (req, res) => {
  const orgId = req.params.orgId as string;

  const membership = await getActiveMembership(req.user.id, orgId);
  if (!membership) {
    res.status(403).json({ error: 'Not a member of this organization' });
    return;
  }

  const { name, startDate, endDate, isActive } = req.body;
  if (!name || !startDate || !endDate) {
    res.status(400).json({ error: 'name, startDate, and endDate are required' });
    return;
  }

  const [term] = await db
    .insert(academicTerms)
    .values({ orgId, name, startDate, endDate, isActive: isActive ?? false })
    .returning();

  res.status(201).json(term);
});

export default router;
