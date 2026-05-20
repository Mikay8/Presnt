import { Router, type IRouter } from 'express';
import healthRouter from './health.js';
import orgsRouter from './orgs.js';
import membersRouter from './members.js';

const router: IRouter = Router();

router.use(healthRouter);
router.use('/orgs', orgsRouter);
router.use('/orgs/:orgId/members', membersRouter);

export default router;
