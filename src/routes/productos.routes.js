import { Router } from 'express';
import { verifyToken, requireRole } from '../middlewares/auth.middleware.js';
import { attachTenant } from '../middlewares/tenant.middleware.js';
import * as ctrl from '../controllers/productos.controller.js';

const router = Router({ mergeParams: true });

router.use(verifyToken, attachTenant);

// Catálogo (accesible para todos los roles de la institución)
router.get('/', ctrl.listar);
router.get('/:productoId', ctrl.obtener);

// Gestión (solo admin)
router.post('/', requireRole('ADMIN_INSTITUCION'), ctrl.crear);
router.patch('/:productoId', requireRole('ADMIN_INSTITUCION'), ctrl.actualizar);
router.delete('/:productoId', requireRole('ADMIN_INSTITUCION'), ctrl.desactivar);

export default router;