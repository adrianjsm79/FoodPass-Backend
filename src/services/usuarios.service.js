// ─── usuarios.service.js ───────────────────────────────────────────────────────
import pool from '../config/db.js';
import { createError } from '../middlewares/error.middleware.js';

export async function listar(institucionId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre_completo, u.correo, u.telefono,
            r.nombre AS rol, uir.modalidad_pago, uir.activo, uir.creado_en
     FROM usuario_institucion_roles uir
     JOIN usuarios u ON u.id = uir.usuario_id
     JOIN roles r ON r.id = uir.rol_id
     WHERE uir.institucion_id = $1
     ORDER BY u.nombre_completo`,
    [institucionId]
  );
  return rows;
}

export async function obtener(usuarioId, institucionId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre_completo, u.correo, u.telefono,
            r.nombre AS rol, uir.modalidad_pago, uir.activo
     FROM usuario_institucion_roles uir
     JOIN usuarios u ON u.id = uir.usuario_id
     JOIN roles r ON r.id = uir.rol_id
     WHERE uir.usuario_id = $1 AND uir.institucion_id = $2`,
    [usuarioId, institucionId]
  );
  if (!rows[0]) throw createError(404, 'Usuario no encontrado en esta institución');
  return rows[0];
}

export async function agregarUsuario({ usuario_id, institucion_id, rol_nombre, modalidad_pago = 'PREPAGO' }) {
  const { rows: rolRows } = await pool.query('SELECT id FROM roles WHERE nombre = $1', [rol_nombre]);
  if (!rolRows[0]) throw createError(400, `Rol "${rol_nombre}" no existe`);

  const { rows } = await pool.query(
    `INSERT INTO usuario_institucion_roles (usuario_id, institucion_id, rol_id, modalidad_pago)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (usuario_id, institucion_id, rol_id) DO UPDATE SET activo = true, modalidad_pago = EXCLUDED.modalidad_pago
     RETURNING *`,
    [usuario_id, institucion_id, rolRows[0].id, modalidad_pago]
  );
  return rows[0];
}

export async function actualizarRol(usuarioId, institucionId, { rol_nombre, modalidad_pago }) {
  const { rows: rolRows } = await pool.query('SELECT id FROM roles WHERE nombre = $1', [rol_nombre]);
  if (!rolRows[0]) throw createError(400, `Rol "${rol_nombre}" no existe`);

  const { rows } = await pool.query(
    `UPDATE usuario_institucion_roles
     SET rol_id = $1, modalidad_pago = COALESCE($2, modalidad_pago)
     WHERE usuario_id = $3 AND institucion_id = $4 RETURNING *`,
    [rolRows[0].id, modalidad_pago, usuarioId, institucionId]
  );
  if (!rows[0]) throw createError(404, 'Relación usuario-institución no encontrada');
  return rows[0];
}

export async function desactivar(usuarioId, institucionId) {
  await pool.query(
    'UPDATE usuario_institucion_roles SET activo = false WHERE usuario_id = $1 AND institucion_id = $2',
    [usuarioId, institucionId]
  );
  return { mensaje: 'Acceso del usuario revocado' };
}