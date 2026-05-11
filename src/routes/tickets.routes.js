import { Router } from 'express';
import { verifyToken, requireRole } from '../middlewares/auth.middleware.js';
import { attachTenant } from '../middlewares/tenant.middleware.js';
import * as ctrl from '../controllers/tickets.controller.js';

const router = Router({ mergeParams: true });

router.use(verifyToken, attachTenant);

// Listar tickets de la institución (con filtros: estado, fecha, usuario)
router.get('/', requireRole('ADMIN_INSTITUCION', 'CAJERO'), ctrl.listar);

// Buscar ticket por código (para canje manual desde POS/dashboard)
router.get('/buscar/:codigo', requireRole('ADMIN_INSTITUCION', 'CAJERO'), ctrl.buscarPorCodigo);

// Canjear ticket — endpoint principal del flujo de retiro
router.post('/:codigo/canjear', requireRole('ADMIN_INSTITUCION', 'CAJERO'), ctrl.canjear);

// Obtener ticket por ID con su historial de estados
router.get('/:ticketId', ctrl.obtener);

export default router;