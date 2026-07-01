import { Router } from 'express';
import { verifyToken, requireRole } from '../middlewares/auth.middleware.js';
import { attachTenant } from '../middlewares/tenant.middleware.js';
import * as ctrl from '../controllers/audit.controller.js';

const router = Router({ mergeParams: true });

router.use(verifyToken, attachTenant);

// Solo administradores pueden ver el log de auditoría
router.get('/', requireRole('ADMIN_INSTITUCION'), ctrl.listarAuditoria);

export default router;
