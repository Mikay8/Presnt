import { Router, type IRouter } from 'express';
import healthRouter      from './health.js';
import authRouter        from './auth.js';
import orgsRouter        from './orgs.js';
import membersRouter     from './members.js';
import superadminRouter  from './superadmin.js';
import excusesRouter     from './excuses.js';

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use('/orgs', orgsRouter);
router.use('/orgs/:orgId/members', membersRouter);
router.use('/superadmin', superadminRouter);
// Phase 5 — Excuses
router.use('/excuses', excusesRouter);
router.use('/', excusesRouter); // handles /orgs/:orgId/excuses and /members/:membershipId/excuses

export default router;
