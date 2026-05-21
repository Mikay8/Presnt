import type { RequestHandler } from 'express';
import { db } from '@workspace/db';
import { profiles } from '@workspace/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Express middleware that rejects any request where the authenticated user
 * does not have profiles.is_superuser = true.
 *
 * Must be used AFTER requireAuth (which populates req.user).
 */
export const requireSuperuser: RequestHandler = async (req, res, next) => {
  const { data, error } = await db
    .select({ isSuperuser: profiles.isSuperuser })
    .from(profiles)
    .where(eq(profiles.id, req.user.id))
    .limit(1)
    .then((rows) => ({ data: rows[0] ?? null, error: null }))
    .catch((e: unknown) => ({ data: null, error: e }));

  if (error || !data?.isSuperuser) {
    res.status(403).json({ error: 'Superuser access required.' });
    return;
  }

  next();
};
