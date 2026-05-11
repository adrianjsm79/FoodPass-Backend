import { Router } from 'express';
import { verifyToken, requireRole } from '../middlewares/auth.middleware.js';
import { attachTenant } from '../middlewares/tenant.middleware.js';
import * as ctrl from '../controllers/postpago.controller.js';

const router = Router({ mergeParams: true });

router.use(verifyToken, attachTenant);

// Listar todas las cuentas postpago de la institución
router.get('/cuentas', requireRole('ADMIN_INSTITUCION', 'CAJERO'), ctrl.listarCuentas);

// Crear o activar cuenta postpago para un usuario
router.post('/cuentas', requireRole('ADMIN_INSTITUCION'), ctrl.crearCuenta);

// Obtener cuenta postpago de un usuario específico
router.get('/cuentas/:usuarioId', requireRole('ADMIN_INSTITUCION', 'CAJERO'), ctrl.obtenerCuenta);

// Actualizar límite de crédito
router.patch('/cuentas/:usuarioId', requireRole('ADMIN_INSTITUCION'), ctrl.actualizarLimite);

// Registrar abono (pago de deuda)
router.post('/cuentas/:usuarioId/abonar', requireRole('ADMIN_INSTITUCION', 'CAJERO'), ctrl.abonar);

// Historial de transacciones
router.get('/transacciones', requireRole('ADMIN_INSTITUCION', 'CAJERO'), ctrl.listarTransacciones);

export default router;