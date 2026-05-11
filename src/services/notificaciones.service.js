import pool from '../config/db.js';

export async function listar(usuarioId, { solo_no_leidas = false } = {}) {
  const { rows } = await pool.query(
    `SELECT n.*, i.nombre AS institucion_nombre
     FROM notificaciones n
     JOIN instituciones i ON i.id = n.institucion_id
     WHERE n.usuario_id = $1 ${solo_no_leidas ? 'AND n.leido = false' : ''}
     ORDER BY n.creado_en DESC
     LIMIT 50`,
    [usuarioId]
  );
  return rows;
}

export async function marcarLeida(notificacionId, usuarioId) {
  await pool.query(
    'UPDATE notificaciones SET leido = true WHERE id = $1 AND usuario_id = $2',
    [notificacionId, usuarioId]
  );
  return { mensaje: 'Notificación marcada como leída' };
}

export async function marcarTodasLeidas(usuarioId) {
  const { rowCount } = await pool.query(
    'UPDATE notificaciones SET leido = true WHERE usuario_id = $1 AND leido = false',
    [usuarioId]
  );
  return { actualizadas: rowCount };
}

/**
 * Helper para crear notificaciones desde otros services.
 */
export async function crear({ usuario_id, institucion_id, tipo, titulo, cuerpo }) {
  await pool.query(
    `INSERT INTO notificaciones (usuario_id, institucion_id, tipo, titulo, cuerpo)
     VALUES ($1, $2, $3, $4, $5)`,
    [usuario_id, institucion_id, tipo, titulo, cuerpo]
  );
}