import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../config/db.js';
import { createError } from '../middlewares/error.middleware.js';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

// ─── Helpers de token ──────────────────────────────────────────────────────────

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, correo: user.correo, nombre_completo: user.nombre_completo },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

// ─── Servicios ─────────────────────────────────────────────────────────────────

export async function registro(data) {
  const { nombre_completo, correo, contrasena, telefono } = data;

  if (!nombre_completo || !correo || !contrasena) {
    throw createError(400, 'nombre_completo, correo y contrasena son requeridos');
  }

  const existe = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [correo]);
  if (existe.rowCount > 0) {
    throw createError(409, 'Ya existe una cuenta con ese correo');
  }

  const contrasena_hash = await bcrypt.hash(contrasena, 12);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre_completo, correo, telefono, contrasena_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nombre_completo, correo, telefono, creado_en`,
    [nombre_completo, correo, telefono || null, contrasena_hash]
  );

  return rows[0];
}

export async function login(correo, contrasena) {
  if (!correo || !contrasena) {
    throw createError(400, 'correo y contrasena son requeridos');
  }

  const { rows } = await pool.query(
    'SELECT id, nombre_completo, correo, contrasena_hash, activo FROM usuarios WHERE correo = $1',
    [correo]
  );

  const user = rows[0];
  if (!user || !(await bcrypt.compare(contrasena, user.contrasena_hash))) {
    throw createError(401, 'Credenciales inválidas');
  }

  if (!user.activo) {
    throw createError(403, 'Cuenta desactivada');
  }

  const accessToken = generateAccessToken(user);
  const refreshTokenRaw = generateRefreshToken();
  const refreshTokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 86400000);

  await pool.query(
    `INSERT INTO tokens_refresco (usuario_id, token_hash, expira_en)
     VALUES ($1, $2, $3)`,
    [user.id, refreshTokenHash, expiresAt]
  );

  // Obtener instituciones del usuario
  const { rows: instituciones } = await pool.query(
    `SELECT i.id, i.nombre, i.slug, i.logo_url, r.nombre AS rol, uir.modalidad_pago
     FROM usuario_institucion_roles uir
     JOIN instituciones i ON i.id = uir.institucion_id
     JOIN roles r ON r.id = uir.rol_id
     WHERE uir.usuario_id = $1 AND uir.activo = true AND i.activo = true`,
    [user.id]
  );

  return {
    accessToken,
    refreshToken: refreshTokenRaw,
    user: {
      id: user.id,
      nombre_completo: user.nombre_completo,
      correo: user.correo,
    },
    instituciones,
  };
}

export async function refreshAccessToken(refreshTokenRaw) {
  if (!refreshTokenRaw) throw createError(400, 'refreshToken requerido');

  const tokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');

  const { rows } = await pool.query(
    `SELECT t.id, t.usuario_id, t.expira_en, t.revocado, u.nombre_completo, u.correo, u.activo
     FROM tokens_refresco t
     JOIN usuarios u ON u.id = t.usuario_id
     WHERE t.token_hash = $1`,
    [tokenHash]
  );

  const token = rows[0];
  if (!token) throw createError(401, 'Refresh token inválido');
  if (token.revocado) throw createError(401, 'Refresh token revocado');
  if (new Date(token.expira_en) < new Date()) throw createError(401, 'Refresh token expirado');
  if (!token.activo) throw createError(403, 'Cuenta desactivada');

  const accessToken = generateAccessToken({
    id: token.usuario_id,
    correo: token.correo,
    nombre_completo: token.nombre_completo,
  });

  return { accessToken };
}

export async function logout(refreshTokenRaw) {
  if (!refreshTokenRaw) return;
  const tokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');
  await pool.query(
    'UPDATE tokens_refresco SET revocado = true WHERE token_hash = $1',
    [tokenHash]
  );
}

export async function getMe(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre_completo, u.correo, u.telefono, u.creado_en,
            json_agg(json_build_object(
              'institucion_id', i.id,
              'institucion', i.nombre,
              'slug', i.slug,
              'logo_url', i.logo_url,
              'rol', r.nombre,
              'modalidad_pago', uir.modalidad_pago
            )) FILTER (WHERE i.id IS NOT NULL) AS instituciones
     FROM usuarios u
     LEFT JOIN usuario_institucion_roles uir ON uir.usuario_id = u.id AND uir.activo = true
     LEFT JOIN instituciones i ON i.id = uir.institucion_id AND i.activo = true
     LEFT JOIN roles r ON r.id = uir.rol_id
     WHERE u.id = $1
     GROUP BY u.id`,
    [userId]
  );
  if (!rows[0]) throw createError(404, 'Usuario no encontrado');
  return rows[0];
}