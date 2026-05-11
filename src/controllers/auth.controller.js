import * as authService from '../services/auth.service.js';

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