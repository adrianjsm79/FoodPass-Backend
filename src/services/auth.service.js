import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createError } from '../middlewares/error.middleware.js';

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = '2h';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

// ─── Helpers ────────────────────────────────────────────────────────────────────

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, correo: user.correo, nombre_completo: user.nombre_completo },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

async function saveRefreshToken(usuarioId, token) {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await pool.query(
    `INSERT INTO tokens_refresco (usuario_id, token_hash, expira_en)
     VALUES ($1, $2, $3)`,
    [usuarioId, hash, expiresAt]
  );

  return token;
}

async function getUserInstituciones(userId) {
  const { rows } = await pool.query(
    `SELECT i.id, i.nombre, i.slug, r.nombre AS rol, uir.modalidad_pago
     FROM usuario_institucion_roles uir
     JOIN instituciones i ON i.id = uir.institucion_id
     JOIN roles r ON r.id = uir.rol_id
     WHERE uir.usuario_id = $1 AND uir.activo = true AND i.activo = true`,
    [userId]
  );
  return rows;
}

// ─── Registro ───────────────────────────────────────────────────────────────────

export async function registro({ nombre_completo, correo, telefono, contrasena, institucion_id }) {
  if (!nombre_completo || !correo || !contrasena || !institucion_id) {
    throw createError(400, 'nombre_completo, correo, contrasena e institucion_id son requeridos');
  }

  const hash = await bcrypt.hash(contrasena, 12);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insertar usuario
    const { rows } = await client.query(
      `INSERT INTO usuarios (nombre_completo, correo, telefono, contrasena_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre_completo, correo, telefono, correo_verificado, creado_en`,
      [nombre_completo, correo, telefono || null, hash]
    );

    const newUser = rows[0];

    // 2. Vincular a institución con rol USUARIO
    await client.query(
      `INSERT INTO usuario_institucion_roles (usuario_id, institucion_id, rol_id, modalidad_pago)
       SELECT $1, $2, id, 'PREPAGO' FROM roles WHERE nombre = 'USUARIO'`,
      [newUser.id, institucion_id]
    );

    await client.query('COMMIT');
    return newUser;
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw createError(409, 'Ya existe un usuario con ese correo');
    }
    throw err;
  } finally {
    client.release();
  }
}

// ─── Login ──────────────────────────────────────────────────────────────────────

export async function login(correo, contrasena) {
  if (!correo || !contrasena) {
    throw createError(400, 'correo y contrasena son requeridos');
  }

  const { rows } = await pool.query(
    `SELECT id, nombre_completo, correo, contrasena_hash, activo, correo_verificado
     FROM usuarios WHERE correo = $1`,
    [correo]
  );

  const user = rows[0];
  if (!user) throw createError(401, 'Credenciales inválidas');
  if (!user.activo) throw createError(403, 'Usuario desactivado');

  const match = await bcrypt.compare(contrasena, user.contrasena_hash);
  if (!match) throw createError(401, 'Credenciales inválidas');

  const accessToken = generateAccessToken(user);
  const refreshToken = await saveRefreshToken(user.id, generateRefreshToken());
  const instituciones = await getUserInstituciones(user.id);

  return {
    accessToken,
    refreshToken,
    usuario: {
      id: user.id,
      nombre_completo: user.nombre_completo,
      correo: user.correo,
      correo_verificado: user.correo_verificado,
    },
    instituciones,
  };
}

// ─── Login con OTP (sin contraseña) ─────────────────────────────────────────────

export async function loginWithOTP(userId) {
  const { rows } = await pool.query(
    `SELECT id, nombre_completo, correo FROM usuarios WHERE id = $1 AND activo = true`,
    [userId]
  );

  const user = rows[0];
  if (!user) throw createError(404, 'Usuario no encontrado');

  // Marcar correo como verificado
  await pool.query('UPDATE usuarios SET correo_verificado = true WHERE id = $1', [userId]);

  const accessToken = generateAccessToken(user);
  const refreshToken = await saveRefreshToken(user.id, generateRefreshToken());
  const instituciones = await getUserInstituciones(user.id);

  return {
    accessToken,
    refreshToken,
    usuario: {
      id: user.id,
      nombre_completo: user.nombre_completo,
      correo: user.correo,
    },
    instituciones,
  };
}

// ─── Refresh Token ──────────────────────────────────────────────────────────────

export async function refreshAccessToken(refreshToken) {
  if (!refreshToken) throw createError(400, 'refreshToken es requerido');

  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  const { rows } = await pool.query(
    `SELECT tr.id, tr.usuario_id, u.nombre_completo, u.correo
     FROM tokens_refresco tr
     JOIN usuarios u ON u.id = tr.usuario_id
     WHERE tr.token_hash = $1 AND tr.revocado = false AND tr.expira_en > NOW()`,
    [hash]
  );

  if (!rows[0]) throw createError(401, 'Refresh token inválido o expirado');

  const user = { id: rows[0].usuario_id, nombre_completo: rows[0].nombre_completo, correo: rows[0].correo };
  const accessToken = generateAccessToken(user);

  return { accessToken };
}

// ─── Logout ─────────────────────────────────────────────────────────────────────

export async function logout(refreshToken) {
  if (!refreshToken) return;

  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await pool.query(
    'UPDATE tokens_refresco SET revocado = true WHERE token_hash = $1',
    [hash]
  );
}

// ─── Get Me ─────────────────────────────────────────────────────────────────────

export async function getMe(userId) {
  const { rows } = await pool.query(
    `SELECT id, nombre_completo, correo, telefono, correo_verificado, creado_en
     FROM usuarios WHERE id = $1`,
    [userId]
  );

  if (!rows[0]) throw createError(404, 'Usuario no encontrado');

  const instituciones = await getUserInstituciones(userId);

  return {
    ...rows[0],
    instituciones,
  };
}

// ─── Get User by Email ──────────────────────────────────────────────────────────

export async function getUserByEmail(correo) {
  if (!correo) throw createError(400, 'correo es requerido');

  const { rows } = await pool.query(
    `SELECT id, nombre_completo, correo, activo FROM usuarios WHERE correo = $1`,
    [correo]
  );

  if (!rows[0]) throw createError(404, 'No se encontró un usuario con ese correo');
  if (!rows[0].activo) throw createError(403, 'Usuario desactivado');

  return rows[0];
}
