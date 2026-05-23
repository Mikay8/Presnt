import { Router, type IRouter } from 'express';
import healthRouter        from './health.js';
import authRouter          from './auth.js';
import orgsRouter          from './orgs.js';
import membersRouter       from './members.js';
import superadminRouter    from './superadmin.js';
import excusesRouter       from './excuses.js';
import restrictionsRouter  from './restrictions.js';
import notificationsRouter from './notifications.js';
import geofenceRouter      from './geofence.js';

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use('/orgs', orgsRouter);
router.use('/orgs/:orgId/members', membersRouter);
router.use('/superadmin', superadminRouter);
// Phase 5 — Excuses
router.use('/excuses', excusesRouter);
router.use('/', excusesRouter); // handles /orgs/:orgId/excuses and /members/:membershipId/excuses
// Phase 6 — Restrictions & Dues
router.use('/', restrictionsRouter);
// Phase 7 — Notifications & Announcements
router.use('/', notificationsRouter);
// Phase 8 — Passive Geofence Check-In
router.use('/', geofenceRouter);

export default router;
