import { Router } from 'express';
import { verifyToken, requireRole } from '../middlewares/auth.middleware.js';
import { attachTenant } from '../middlewares/tenant.middleware.js';
import * as ctrl from '../controllers/reportes.controller.js';

const router = Router({ mergeParams: true });

router.use(verifyToken, attachTenant, requireRole('ADMIN_INSTITUCION'));

// Reporte de ventas (parámetros: desde, hasta, agrupar_por: dia|semana|mes)
router.get('/ventas', ctrl.ventas);

// Consumo por usuario (parámetros: desde, hasta, usuario_id?)
router.get('/consumo-usuario', ctrl.consumoPorUsuario);

// Deuda acumulada postpago
router.get('/deuda-postpago', ctrl.deudaPostpago);

// Resumen general del dashboard
router.get('/resumen', ctrl.resumen);

// Métodos de pago agrupados (para gráfico donut)
router.get('/metodos-pago', ctrl.metodosPago);

// Ventas semanales por canal APP vs POS (para gráfico de barras)
router.get('/ventas-semanales', ctrl.ventasSemanales);

// Productos más vendidos (parámetros: desde, hasta, limit)
router.get('/productos-top', ctrl.productosTop);

// Ventas por canal con rango de fechas (parámetros: desde, hasta, agrupar_por)
router.get('/ventas-por-canal', ctrl.ventasPorCanal);

export default router;