import { Router } from 'express';
import { verifyToken, requireRole } from '../middlewares/auth.middleware.js';
import { attachTenant } from '../middlewares/tenant.middleware.js';
import * as ctrl from '../controllers/caja.controller.js';

const router = Router({ mergeParams: true });

router.use(verifyToken, attachTenant, requireRole('CAJERO', 'ADMIN_INSTITUCION', 'SUPERADMIN'));

router.get('/turno-actual', ctrl.getTurnoActual);
router.post('/abrir-turno', ctrl.abrirTurno);
router.post('/cerrar-turno', ctrl.cerrarTurno);

export default router;
