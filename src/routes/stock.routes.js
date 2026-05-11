import { Router } from 'express';
import { verifyToken, requireRole } from '../middlewares/auth.middleware.js';
import { attachTenant } from '../middlewares/tenant.middleware.js';
import * as ctrl from '../controllers/stock.controller.js';

const router = Router({ mergeParams: true });

router.use(verifyToken, attachTenant);

// Stock actual de todos los productos de la institución
router.get('/', requireRole('ADMIN_INSTITUCION', 'CAJERO'), ctrl.listarStock);

// Ajuste manual de stock (positivo o negativo)
router.post('/ajuste', requireRole('ADMIN_INSTITUCION'), ctrl.ajustar);

// Historial de movimientos de stock
router.get('/movimientos', requireRole('ADMIN_INSTITUCION'), ctrl.listarMovimientos);

// Movimientos de un producto específico
router.get('/movimientos/:productoId', requireRole('ADMIN_INSTITUCION'), ctrl.movimientosPorProducto);

export default router;