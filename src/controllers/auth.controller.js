import * as authService from '../services/auth.service.js';
import * as otpService from '../services/otp.service.js';

export async function registro(req, res, next) {
  try {
    const usuario = await authService.registro(req.body);
    res.status(201).json(usuario);
  } catch (err) { next(err); }
}

export async function login(req, res, next) {
  try {
    const { correo, contrasena } = req.body;
    const data = await authService.login(correo, contrasena);
    res.json(data);
  } catch (err) { next(err); }
}

export async function refreshToken(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const data = await authService.refreshAccessToken(refreshToken);
    res.json(data);
  } catch (err) { next(err); }
}

export async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    res.json({ mensaje: 'Sesión cerrada correctamente' });
  } catch (err) { next(err); }
}

export async function getMe(req, res, next) {
  try {
    const usuario = await authService.getMe(req.user.id);
    res.json(usuario);
  } catch (err) { next(err); }
}

export async function enviarOTP(req, res, next) {
  try {
    const { correo } = req.body;
    if (!correo) {
      return res.status(400).json({ error: 'correo es requerido' });
    }
    const usuario = await authService.getUserByEmail(correo);
    const resultado = await otpService.enviarOTP(usuario.id, correo, usuario.nombre_completo);
    res.json(resultado);
  } catch (err) { next(err); }
}

export async function verificarOTP(req, res, next) {
  try {
    const { correo, codigo } = req.body;
    if (!correo || !codigo) {
      return res.status(400).json({ error: 'correo y codigo son requeridos' });
    }
    const usuario = await authService.getUserByEmail(correo);
    await otpService.verificarOTP(usuario.id, codigo);
    
    // Login con OTP y generar tokens
    const data = await authService.loginWithOTP(usuario.id);
    res.json(data);
  } catch (err) { next(err); }
}