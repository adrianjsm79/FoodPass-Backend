import { Router } from 'express';
import { verifyToken, requireRole } from '../middlewares/auth.middleware.js';
import { attachTenant } from '../middlewares/tenant.middleware.js';
import * as ctrl from '../controllers/pagos.controller.js';

const router = Router({ mergeParams: true });

router.use(verifyToken, attachTenant);

// Listar pagos de la institución
router.get('/', requireRole('ADMIN_INSTITUCION', 'CAJERO'), ctrl.listar);

// Registrar pago para un pedido (confirma pago prepago o presencial)
router.post('/', ctrl.registrar);

// Detalle de un pago
router.get('/:pagoId', ctrl.obtener);

export default router;