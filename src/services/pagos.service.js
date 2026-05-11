import pool from '../config/db.js';
import { createError } from '../middlewares/error.middleware.js';

export async function registrar({ pedido_id, institucion_id, metodo_pago_id, monto, referencia_externa }) {
  if (!pedido_id || !metodo_pago_id || !monto) {
    throw createError(400, 'pedido_id, metodo_pago_id y monto son requeridos');
  }

  // Verificar que el pedido pertenece a la institución
  const { rows: pedidoRows } = await pool.query(
    'SELECT id, monto_total, estado FROM pedidos WHERE id = $1 AND institucion_id = $2',
    [pedido_id, institucion_id]
  );
  if (!pedidoRows[0]) throw createError(404, 'Pedido no encontrado');
  if (pedidoRows[0].estado === 'CANCELADO') throw createError(400, 'No se puede pagar un pedido cancelado');

  const { rows } = await pool.query(
    `INSERT INTO pagos (pedido_id, institucion_id, metodo_pago_id, monto, estado, referencia_externa)
     VALUES ($1, $2, $3, $4, 'COMPLETADO', $5) RETURNING *`,
    [pedido_id, institucion_id, metodo_pago_id, monto, referencia_externa || null]
  );
  return rows[0];
}

export async function listar({ institucion_id, desde, hasta, limit = 50, offset = 0 }) {
  const params = [institucion_id];
  let dateFilter = '';
  let i = 2;
  if (desde) { params.push(desde); dateFilter += ` AND pa.creado_en >= $${i++}`; }
  if (hasta) { params.push(hasta); dateFilter += ` AND pa.creado_en <= $${i++}`; }
  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT pa.*, mp.nombre AS metodo_pago_nombre
     FROM pagos pa
     JOIN metodos_pago mp ON mp.id = pa.metodo_pago_id
     WHERE pa.institucion_id = $1 ${dateFilter}
     ORDER BY pa.creado_en DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  return rows;
}

export async function obtener(pagoId, institucionId) {
  const { rows } = await pool.query(
    `SELECT pa.*, mp.nombre AS metodo_pago_nombre
     FROM pagos pa
     JOIN metodos_pago mp ON mp.id = pa.metodo_pago_id
     WHERE pa.id = $1 AND pa.institucion_id = $2`,
    [pagoId, institucionId]
  );
  if (!rows[0]) throw createError(404, 'Pago no encontrado');
  return rows[0];
}