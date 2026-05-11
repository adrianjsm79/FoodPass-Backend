import { Router } from 'express';
import { verifyToken } from '../middlewares/auth.middleware.js';
import * as authCtrl from '../controllers/auth.controller.js';

const router = Router();

router.post('/registro', authCtrl.registro);
router.post('/login', authCtrl.login);
router.post('/refresh', authCtrl.refreshToken);
router.post('/logout', authCtrl.logout);
router.get('/me', verifyToken, authCtrl.getMe);

export default router;