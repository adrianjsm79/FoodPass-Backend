import { Router } from 'express';
import authRouter from './auth.routes.js';
import institucionesRouter from './instituciones.routes.js';
import usuariosRouter from './usuarios.routes.js';
import productosRouter from './productos.routes.js';
import categoriasRouter from './categorias.routes.js';
import pedidosRouter from './pedidos.routes.js';
import ticketsRouter from './tickets.routes.js';
import pagosRouter from './pagos.routes.js';
import postpagoRouter from './postpago.routes.js';
import stockRouter from './stock.routes.js';
import reportesRouter from './reportes.routes.js';
import cajeroRouter from './cajero.routes.js';
import cajaRouter from './caja.routes.js';
import notificacionesRouter from './notificaciones.routes.js';

export const router = Router();

// ─── Autenticación (sin prefijo de institución) ────────────────────────────────
router.use('/auth', authRouter);

// ─── Recursos globales ─────────────────────────────────────────────────────────
router.use('/instituciones', institucionesRouter);
router.use('/notificaciones', notificacionesRouter);

// ─── Recursos multi-tenant (todo bajo /instituciones/:institucionId) ───────────
// El attachTenant middleware se aplica en cada sub-router
router.use('/instituciones/:institucionId/usuarios', usuariosRouter);
router.use('/instituciones/:institucionId/categorias', categoriasRouter);
router.use('/instituciones/:institucionId/productos', productosRouter);
router.use('/instituciones/:institucionId/pedidos', pedidosRouter);
router.use('/instituciones/:institucionId/tickets', ticketsRouter);
router.use('/instituciones/:institucionId/pagos', pagosRouter);
router.use('/instituciones/:institucionId/postpago', postpagoRouter);
router.use('/instituciones/:institucionId/stock', stockRouter);
router.use('/instituciones/:institucionId/reportes', reportesRouter);
router.use('/instituciones/:institucionId/cajero', cajeroRouter);
router.use('/instituciones/:institucionId/caja', cajaRouter);