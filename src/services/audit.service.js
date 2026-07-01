import pool from '../config/db.js';
import { getIO } from '../config/socket.js';
import { SOCKET_EVENTS } from '../config/socket.js';

/**
 * Registra una entrada de auditoría y emite el evento en tiempo real.
 */
export async function registrar({ institucion_id, usuario_id, usuario_nombre, accion, categoria, descripcion, metadata = {}, ip }) {
  const { rows } = await pool.query(
    `INSERT INTO audit_log 
       (institucion_id, usuario_id, usuario_nombre, accion, categoria, descripcion, metadata, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [institucion_id, usuario_id, usuario_nombre, accion, categoria, descripcion, JSON.stringify(metadata), ip || null]
  );

  const entrada = rows[0];

  // Emitir en tiempo real a todos los admins conectados a la institución
  try {
    const io = getIO();
    io.to(`institucion:${institucion_id}`).emit(SOCKET_EVENTS.AUDIT_NUEVA_ENTRADA, entrada);
  } catch (_) {
    // Socket no disponible (tests, etc.)
  }

  return entrada;
}

/**
 * Lista las entradas de auditoría con filtros y paginación.
 */
export async function listar(institucion_id, { categoria, fechaInicio, fechaFin, limite = 50, offset = 0 } = {}) {
  let query = `
    SELECT * FROM audit_log
    WHERE institucion_id = $1
  `;
  const params = [institucion_id];
  let idx = 2;

  if (categoria) {
    query += ` AND categoria = $${idx}`;
    params.push(categoria);
    idx++;
  }

  if (fechaInicio) {
    query += ` AND creado_en >= $${idx}`;
    params.push(fechaInicio);
    idx++;
  }

  if (fechaFin) {
    query += ` AND creado_en <= $${idx}::timestamp + interval '1 day' - interval '1 second'`;
    params.push(fechaFin);
    idx++;
  }

  query += ` ORDER BY creado_en DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  params.push(limite, offset);

  const { rows } = await pool.query(query, params);
  return rows;
}
