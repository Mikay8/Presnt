import { Router } from 'express';
import { db } from '@workspace/db';
import { organizations, profiles, memberships, superuserAuditLog, platformConfig } from '@workspace/db/schema';
import { eq, ilike, and, desc } from 'drizzle-orm';
import { requireAuth } from '../middlewares/auth.js';
import { requireSuperuser } from '../middlewares/superuser.js';

const router = Router();

// All superadmin routes require auth + superuser
router.use(requireAuth, requireSuperuser);

// ─── Helper: write audit log ──────────────────────────────────────────────────
async function audit(
  performedBy: string,
  action: string,
  opts: {
    targetType?: string;
    targetId?: string;
    previousValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    notes?: string;
    ipAddress?: string;
  } = {},
) {
  await db.insert(superuserAuditLog).values({
    performedBy,
    action,
    targetType: opts.targetType ?? null,
    targetId: opts.targetId ?? null,
    previousValue: opts.previousValue ?? null,
    newValue: opts.newValue ?? null,
    notes: opts.notes ?? null,
    ipAddress: opts.ipAddress ?? null,
  });
}

// ─── Health ───────────────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  const start = Date.now();
  await db.select().from(organizations).limit(1);
  res.json({ status: 'ok', db_ms: Date.now() - start });
});

// ─── Orgs ─────────────────────────────────────────────────────────────────────
router.get('/orgs', async (req, res) => {
  const search = req.query['search'] as string | undefined;
  let q = db.select().from(organizations).$dynamic();
  if (search) q = q.where(ilike(organizations.name, `%${search}%`));
  const data = await q.orderBy(desc(organizations.createdAt)).limit(100);

  await audit(req.user.id, 'org.viewed', { notes: search ? `search: ${search}` : 'list all' });
  res.json(data);
});

router.get('/orgs/:orgId', async (req, res) => {
  const orgId = req.params['orgId'] as string;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) { res.status(404).json({ error: 'Org not found' }); return; }

  await audit(req.user.id, 'org.viewed', { targetType: 'org', targetId: orgId });
  res.json(org);
});

router.patch('/orgs/:orgId', async (req, res) => {
  const orgId = req.params['orgId'] as string;
  const [existing] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!existing) { res.status(404).json({ error: 'Org not found' }); return; }

  const allowed = ['name', 'institution', 'greekLetterOrg', 'timezone', 'primaryColor', 'appDisplayName', 'isActive'];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in req.body) patch[key] = req.body[key];
  }

  const [updated] = await db.update(organizations).set(patch).where(eq(organizations.id, orgId)).returning();
  await audit(req.user.id, 'org.field_edited', { targetType: 'org', targetId: orgId, previousValue: existing as Record<string, unknown>, newValue: updated as Record<string, unknown> });
  res.json(updated);
});

router.post('/orgs/:orgId/deactivate', async (req, res) => {
  const orgId = req.params['orgId'] as string;
  const [org] = await db.update(organizations).set({ isActive: false }).where(eq(organizations.id, orgId)).returning();
  await audit(req.user.id, 'org.deactivated', { targetType: 'org', targetId: orgId, notes: req.body.reason });
  res.json(org);
});

router.post('/orgs/:orgId/reactivate', async (req, res) => {
  const orgId = req.params['orgId'] as string;
  const [org] = await db.update(organizations).set({ isActive: true }).where(eq(organizations.id, orgId)).returning();
  await audit(req.user.id, 'org.reactivated', { targetType: 'org', targetId: orgId, notes: req.body.reason });
  res.json(org);
});

router.get('/orgs/:orgId/members', async (req, res) => {
  const orgId = req.params['orgId'] as string;
  const data = await db.select().from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.isDeleted, false))).limit(200);
  res.json(data);
});

// ─── Users ────────────────────────────────────────────────────────────────────
router.get('/profiles', async (req, res) => {
  const search = req.query['search'] as string | undefined;
  let q = db.select().from(profiles).$dynamic();
  if (search) q = q.where(ilike(profiles.email, `%${search}%`));
  const data = await q.orderBy(desc(profiles.createdAt)).limit(100);

  await audit(req.user.id, 'profile.viewed', { notes: search ? `search: ${search}` : 'list all' });
  res.json(data.map(({ isSuperuser: _, ...rest }) => rest)); // never expose is_superuser
});

router.get('/profiles/:profileId', async (req, res) => {
  const profileId = req.params['profileId'] as string;
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!profile) { res.status(404).json({ error: 'Profile not found' }); return; }

  await audit(req.user.id, 'profile.viewed', { targetType: 'profile', targetId: profileId });
  const { isSuperuser: _, ...safe } = profile;
  res.json(safe);
});

router.patch('/profiles/:profileId', async (req, res) => {
  const profileId = req.params['profileId'] as string;
  const [existing] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!existing) { res.status(404).json({ error: 'Profile not found' }); return; }

  const allowed = ['firstName', 'lastName', 'phone', 'major', 'bio', 'graduationYear'];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in req.body) patch[key] = req.body[key];
  }

  const [updated] = await db.update(profiles).set(patch).where(eq(profiles.id, profileId)).returning();
  await audit(req.user.id, 'profile.edited', { targetType: 'profile', targetId: profileId, notes: `fields: ${Object.keys(patch).join(', ')}` });
  const { isSuperuser: _, ...safe } = updated;
  res.json(safe);
});

router.post('/profiles/:profileId/force-logout', async (req, res) => {
  // Supabase admin API — requires service role; stubbed here until service role is added back
  await audit(req.user.id, 'profile.force_logged_out', { targetType: 'profile', targetId: req.params['profileId'] as string, notes: req.body.reason });
  res.status(501).json({ error: 'Requires Supabase service role — not yet connected.' });
});

// ─── Audit log ────────────────────────────────────────────────────────────────
router.get('/logs/platform', async (req, res) => {
  const data = await db.select().from(superuserAuditLog).orderBy(desc(superuserAuditLog.createdAt)).limit(100);
  res.json(data);
});

// ─── Platform config ──────────────────────────────────────────────────────────
router.get('/config/app', async (req, res) => {
  const data = await db.select().from(platformConfig);
  res.json(data);
});

router.patch('/config/app', async (req, res) => {
  const updates = req.body as Record<string, string>;
  for (const [key, value] of Object.entries(updates)) {
    await db.update(platformConfig)
      .set({ value, updatedBy: req.user.id, updatedAt: new Date() })
      .where(eq(platformConfig.key, key));
  }
  await audit(req.user.id, 'config.app_updated', { newValue: updates });
  const data = await db.select().from(platformConfig);
  res.json(data);
});

export default router;
