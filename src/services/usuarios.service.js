// ─── usuarios.service.js ───────────────────────────────────────────────────────
import pool from '../config/db.js';
import { createError } from '../middlewares/error.middleware.js';
import bcrypt from 'bcryptjs';

export async function listar(institucionId) {
  const { rows } = await pool.query(
    `SELECT
       u.id,
       u.nombre_completo,
       u.correo,
       u.telefono,
       r.nombre          AS rol,
       uir.modalidad_pago,
       uir.activo,
       uir.creado_en,
       -- saldo / deuda postpago (null si es prepago)
       cp.saldo_deuda,
       cp.limite_credito
     FROM usuario_institucion_roles uir
     JOIN usuarios  u  ON u.id  = uir.usuario_id
     JOIN roles     r  ON r.id  = uir.rol_id
     LEFT JOIN cuentas_postpago cp
            ON cp.usuario_id    = uir.usuario_id
           AND cp.institucion_id = uir.institucion_id
     WHERE uir.institucion_id = $1
     ORDER BY u.nombre_completo`,
    [institucionId]
  );
  return rows;
}

export async function obtener(usuarioId, institucionId) {
  const { rows } = await pool.query(
    `SELECT
       u.id,
       u.nombre_completo,
       u.correo,
       u.telefono,
       r.nombre          AS rol,
       uir.modalidad_pago,
       uir.activo,
       cp.saldo_deuda,
       cp.limite_credito
     FROM usuario_institucion_roles uir
     JOIN usuarios  u  ON u.id  = uir.usuario_id
     JOIN roles     r  ON r.id  = uir.rol_id
     LEFT JOIN cuentas_postpago cp
            ON cp.usuario_id    = uir.usuario_id
           AND cp.institucion_id = uir.institucion_id
     WHERE uir.usuario_id    = $1
       AND uir.institucion_id = $2`,
    [usuarioId, institucionId]
  );
  if (!rows[0]) throw createError(404, 'Usuario no encontrado en esta institución');
  return rows[0];
}

/**
 * Crea la cuenta de usuario Y la asigna a la institución en una sola transacción.
 *
 * Body esperado:
 *   nombre_completo  string  requerido
 *   correo           string  requerido
 *   telefono         string  opcional
 *   contrasena       string  opcional  (default: "FoodPass2025!")
 *   rol_nombre       string  requerido  ("USUARIO" | "CAJERO" | "ADMIN_INSTITUCION")
 *   modalidad_pago   string  opcional  ("PREPAGO" | "POSTPAGO", default: "PREPAGO")
 *   limite_credito   number  opcional  (solo si modalidad_pago = "POSTPAGO", default: 500)
 */
export async function agregarUsuario({
  nombre_completo,
  correo,
  telefono,
  contrasena = 'FoodPass2025!',
  institucion_id,
  rol_nombre,
  modalidad_pago = 'PREPAGO',
  limite_credito = 500,
}) {
  if (!nombre_completo || !correo || !rol_nombre) {
    throw createError(400, 'nombre_completo, correo y rol_nombre son obligatorios');
  }

  // Obtener rol
  const { rows: rolRows } = await pool.query(
    'SELECT id FROM roles WHERE nombre = $1',
    [rol_nombre]
  );
  if (!rolRows[0]) throw createError(400, `Rol "${rol_nombre}" no existe`);
  const rolId = rolRows[0].id;

  // Hash de contraseña
  const contrasena_hash = await bcrypt.hash(contrasena, 12);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Crear o recuperar usuario global
    const upsertUsuario = await client.query(
      `INSERT INTO usuarios (nombre_completo, correo, telefono, contrasena_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (correo) DO UPDATE
         SET nombre_completo = EXCLUDED.nombre_completo,
             telefono        = COALESCE(EXCLUDED.telefono, usuarios.telefono)
       RETURNING id, nombre_completo, correo, telefono, creado_en`,
      [nombre_completo, correo.toLowerCase().trim(), telefono ?? null, contrasena_hash]
    );
    const usuario = upsertUsuario.rows[0];

    // 2. Asignar rol en la institución
    const uirResult = await client.query(
      `INSERT INTO usuario_institucion_roles
         (usuario_id, institucion_id, rol_id, modalidad_pago)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (usuario_id, institucion_id, rol_id)
         DO UPDATE SET activo = true, modalidad_pago = EXCLUDED.modalidad_pago
       RETURNING *`,
      [usuario.id, institucion_id, rolId, modalidad_pago]
    );

    // 3. Si es POSTPAGO, crear / reactivar cuenta de crédito
    if (modalidad_pago === 'POSTPAGO') {
      await client.query(
        `INSERT INTO cuentas_postpago
           (usuario_id, institucion_id, limite_credito, saldo_deuda)
         VALUES ($1, $2, $3, 0.00)
         ON CONFLICT (usuario_id, institucion_id)
           DO UPDATE SET activo = true,
                         limite_credito = EXCLUDED.limite_credito`,
        [usuario.id, institucion_id, limite_credito]
      );
    }

    await client.query('COMMIT');

    return {
      ...usuario,
      rol:           rol_nombre,
      modalidad_pago,
      activo:        uirResult.rows[0].activo,
      contrasena_temporal: contrasena === 'FoodPass2025!' ? contrasena : undefined,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw createError(409, 'El correo ya está registrado en esta institución con ese rol');
    throw err;
  } finally {
    client.release();
  }
}

export async function actualizarRol(usuarioId, institucionId, { rol_nombre, modalidad_pago }) {
  const { rows: rolRows } = await pool.query(
    'SELECT id FROM roles WHERE nombre = $1',
    [rol_nombre]
  );
  if (!rolRows[0]) throw createError(400, `Rol "${rol_nombre}" no existe`);

  const { rows } = await pool.query(
    `UPDATE usuario_institucion_roles
     SET rol_id         = $1,
         modalidad_pago = COALESCE($2, modalidad_pago)
     WHERE usuario_id    = $3
       AND institucion_id = $4
     RETURNING *`,
    [rolRows[0].id, modalidad_pago, usuarioId, institucionId]
  );
  if (!rows[0]) throw createError(404, 'Relación usuario-institución no encontrada');
  return rows[0];
}

export async function desactivar(usuarioId, institucionId) {
  await pool.query(
    `UPDATE usuario_institucion_roles
     SET activo = false
     WHERE usuario_id    = $1
       AND institucion_id = $2`,
    [usuarioId, institucionId]
  );
  return { mensaje: 'Acceso del usuario revocado' };
}