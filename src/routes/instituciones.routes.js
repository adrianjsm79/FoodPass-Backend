import { Router } from 'express';
import { verifyToken, requireRole } from '../middlewares/auth.middleware.js';
import { attachTenant } from '../middlewares/tenant.middleware.js';
import * as ctrl from '../controllers/instituciones.controller.js';

const router = Router();

// Catálogo global de métodos de pago (sin autenticación requerida)
router.get('/metodos-pago', ctrl.listarMetodosPago);
 
// Listar todas las instituciones — público para permitir el registro desde la app móvil
router.get('/', ctrl.listar);
 
// Crear nueva institución
router.post('/', verifyToken, ctrl.crear);

// Obtener y editar institución específica
router.get('/:institucionId', verifyToken, attachTenant, ctrl.obtener);
router.patch('/:institucionId', verifyToken, attachTenant, requireRole('ADMIN_INSTITUCION'), ctrl.actualizar);

// Configuración de institución
router.get('/:institucionId/configuracion', verifyToken, attachTenant, ctrl.obtenerConfig);
router.patch('/:institucionId/configuracion', verifyToken, attachTenant, requireRole('ADMIN_INSTITUCION'), ctrl.actualizarConfig);

export default router;