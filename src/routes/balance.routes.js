import { Router } from 'express';
import { verifyToken, requireRole } from '../middlewares/auth.middleware.js';
import { attachTenant } from '../middlewares/tenant.middleware.js';
import * as ctrl from '../controllers/balance.controller.js';

const router = Router({ mergeParams: true });

router.use(verifyToken, attachTenant);

// Sólo para administradores
router.get('/cajas', requireRole('ADMIN_INSTITUCION'), ctrl.listarArqueos);

export default router;
