import { Router } from 'express';
import { verifyToken, requireRole } from '../middlewares/auth.middleware.js';
import { attachTenant } from '../middlewares/tenant.middleware.js';
import * as ctrl from '../controllers/pedidos.controller.js';

const router = Router({ mergeParams: true });

router.use(verifyToken, attachTenant);

// Listar pedidos (con filtros por fecha, estado, usuario, canal)
router.get('/', requireRole('ADMIN_INSTITUCION', 'CAJERO'), ctrl.listar);

// Crear pedido — APP (usuario) o POS (cajero)
// Canal APP: viene del usuario autenticado
// Canal POS: viene del cajero, puede ser anónimo o vinculado a usuario
router.post('/', ctrl.crear);

// Detalle de pedido con items y tickets
router.get('/:pedidoId', ctrl.obtener);

// Cancelar pedido (solo si está PENDIENTE)
router.patch('/:pedidoId/cancelar', requireRole('ADMIN_INSTITUCION', 'CAJERO'), ctrl.cancelar);

export default router;