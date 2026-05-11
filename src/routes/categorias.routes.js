import { Router } from 'express';
import { verifyToken, requireRole } from '../middlewares/auth.middleware.js';
import { attachTenant } from '../middlewares/tenant.middleware.js';
import * as ctrl from '../controllers/categorias.controller.js';

const router = Router({ mergeParams: true });

router.use(verifyToken, attachTenant);

router.get('/', ctrl.listar);
router.post('/', requireRole('ADMIN_INSTITUCION'), ctrl.crear);
router.patch('/:categoriaId', requireRole('ADMIN_INSTITUCION'), ctrl.actualizar);
router.delete('/:categoriaId', requireRole('ADMIN_INSTITUCION'), ctrl.desactivar);

export default router;