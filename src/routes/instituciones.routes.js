import { Router } from 'express';
import { verifyToken, requireRole } from '../middlewares/auth.middleware.js';
import { attachTenant } from '../middlewares/tenant.middleware.js';
import * as ctrl from '../controllers/instituciones.controller.js';

const router = Router();

// Listar todas (solo superadmin en producción — simplificado aquí)
router.get('/', verifyToken, ctrl.listar);

// Crear nueva institución
router.post('/', verifyToken, ctrl.crear);

// Rutas de una institución específica
router.get('/:institucionId', verifyToken, attachTenant, ctrl.obtener);
router.patch('/:institucionId', verifyToken, attachTenant, requireRole('ADMIN_INSTITUCION'), ctrl.actualizar);

// Configuración de institución
router.get('/:institucionId/configuracion', verifyToken, attachTenant, ctrl.obtenerConfig);
router.patch('/:institucionId/configuracion', verifyToken, attachTenant, requireRole('ADMIN_INSTITUCION'), ctrl.actualizarConfig);

// Métodos de pago disponibles (lectura pública por institución)
router.get('/metodos-pago', ctrl.listarMetodosPago);

export default router;