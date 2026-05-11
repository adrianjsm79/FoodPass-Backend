import { Router } from 'express';
import { verifyToken, requireRole } from '../middlewares/auth.middleware.js';
import { attachTenant } from '../middlewares/tenant.middleware.js';
import * as ctrl from '../controllers/usuarios.controller.js';

// mergeParams: true para acceder a req.params.institucionId desde el router padre
const router = Router({ mergeParams: true });

router.use(verifyToken, attachTenant);

// Listar usuarios de la institución
router.get('/', requireRole('ADMIN_INSTITUCION', 'CAJERO'), ctrl.listar);

// Añadir usuario a la institución (con rol)
router.post('/', requireRole('ADMIN_INSTITUCION'), ctrl.agregarUsuario);

// Ver detalle de un usuario
router.get('/:usuarioId', requireRole('ADMIN_INSTITUCION', 'CAJERO'), ctrl.obtener);

// Actualizar rol o modalidad de pago
router.patch('/:usuarioId/rol', requireRole('ADMIN_INSTITUCION'), ctrl.actualizarRol);

// Desactivar acceso del usuario a la institución (no elimina la cuenta global)
router.delete('/:usuarioId', requireRole('ADMIN_INSTITUCION'), ctrl.desactivar);

export default router;