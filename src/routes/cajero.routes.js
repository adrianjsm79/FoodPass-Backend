import { Router } from 'express';
import { verifyToken, requireRole } from '../middlewares/auth.middleware.js';
import { attachTenant } from '../middlewares/tenant.middleware.js';
import * as ctrl from '../controllers/cajero.controller.js';

const router = Router({ mergeParams: true });

// Protect all routes with auth, tenant context, and CAJERO role (admins can access too)
router.use(verifyToken, attachTenant, requireRole('CAJERO', 'ADMIN_INSTITUCION', 'SUPERADMIN'));

// Dashboard resumen para el cajero
router.get('/dashboard', ctrl.dashboard);

// Historial del día
router.get('/historial', ctrl.historial);

// Anulación de venta
router.post('/anular/:pedidoId', ctrl.anularVenta);

export default router;
