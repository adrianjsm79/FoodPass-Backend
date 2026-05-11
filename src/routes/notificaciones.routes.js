import { Router } from 'express';
import { verifyToken } from '../middlewares/auth.middleware.js';
import * as ctrl from '../controllers/notificaciones.controller.js';

const router = Router();

router.use(verifyToken);

// Listar notificaciones del usuario autenticado
router.get('/', ctrl.listar);

// Marcar como leída
router.patch('/:notificacionId/leer', ctrl.marcarLeida);

// Marcar todas como leídas
router.patch('/leer-todas', ctrl.marcarTodasLeidas);

export default router;