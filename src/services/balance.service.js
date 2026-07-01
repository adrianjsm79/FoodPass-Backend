import pool from '../config/db.js';

/**
 * Obtener todos los turnos de caja para el balance (Arqueos)
 */
export async function listarArqueos(institucion_id, fechaInicio, fechaFin) {
  let query = `
    SELECT 
      t.id, 
      t.fecha_apertura, 
      t.fecha_cierre, 
      t.monto_inicial, 
      t.monto_sistema, 
      t.monto_declarado, 
      t.estado,
      u.nombre_completo as cajero_nombre,
      (COALESCE(t.monto_declarado, 0) - COALESCE(t.monto_sistema, 0)) as diferencia
    FROM turnos_caja t
    JOIN usuarios u ON u.id = t.cajero_id
    WHERE t.institucion_id = $1
  `;
  const params = [institucion_id];
  let paramIndex = 2;

  if (fechaInicio) {
    query += ` AND t.fecha_apertura >= $${paramIndex}`;
    params.push(fechaInicio);
    paramIndex++;
  }

  if (fechaFin) {
    query += ` AND t.fecha_apertura <= $${paramIndex}::timestamp + interval '1 day' - interval '1 second'`;
    params.push(fechaFin);
    paramIndex++;
  }

  query += ` ORDER BY t.fecha_apertura DESC`;

  const { rows } = await pool.query(query, params);
  return rows;
}
