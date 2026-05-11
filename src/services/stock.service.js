import pool from '../config/db.js';
import { createError } from '../middlewares/error.middleware.js';
import { SOCKET_EVENTS } from '../config/socket.js';

export async function listarStock(institucionId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.nombre, c.nombre AS categoria,
            s.cantidad, s.umbral_stock_bajo, s.actualizado_en,
            CASE WHEN s.cantidad <= s.umbral_stock_bajo THEN true ELSE false END AS stock_bajo
     FROM productos p
     JOIN categorias_producto c ON c.id = p.categoria_id
     LEFT JOIN stock_producto s ON s.producto_id = p.id
     WHERE p.institucion_id = $1 AND p.activo = true
     ORDER BY stock_bajo DESC, s.cantidad ASC`,
    [institucionId]
  );
  return rows;
}

export async function ajustar({ producto_id, institucion_id, cambio_cantidad, motivo = 'AJUSTE', realizado_por }, io) {
  if (!cambio_cantidad || cambio_cantidad === 0) throw createError(400, 'cambio_cantidad no puede ser 0');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: stockRows } = await client.query(
      `SELECT sp.cantidad FROM stock_producto sp
       JOIN productos p ON p.id = sp.producto_id
       WHERE sp.producto_id = $1 AND p.institucion_id = $2
       FOR UPDATE`,
      [producto_id, institucion_id]
    );

    if (!stockRows[0]) throw createError(404, 'Producto o stock no encontrado');

    const nuevaCantidad = stockRows[0].cantidad + cambio_cantidad;
    if (nuevaCantidad < 0) throw createError(400, `Stock insuficiente. Actual: ${stockRows[0].cantidad}`);

    await client.query(
      'UPDATE stock_producto SET cantidad = $1, actualizado_en = NOW() WHERE producto_id = $2',
      [nuevaCantidad, producto_id]
    );

    const { rows: movRows } = await client.query(
      `INSERT INTO movimientos_stock (producto_id, institucion_id, cambio_cantidad, motivo, tipo_origen, realizado_por)
       VALUES ($1, $2, $3, $4, 'MANUAL', $5) RETURNING *`,
      [producto_id, institucion_id, cambio_cantidad, motivo, realizado_por]
    );

    await client.query('COMMIT');

    if (io) {
      io.to(`institucion:${institucion_id}`).emit(SOCKET_EVENTS.STOCK_ACTUALIZADO, {
        producto_id,
        stock_actual: nuevaCantidad,
      });
    }

    return movRows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listarMovimientos({ institucion_id, producto_id, motivo, limit = 50, offset = 0 }) {
  const conditions = ['ms.institucion_id = $1'];
  const params = [institucion_id];
  let i = 2;
  if (producto_id) { conditions.push(`ms.producto_id = $${i++}`); params.push(producto_id); }
  if (motivo) { conditions.push(`ms.motivo = $${i++}`); params.push(motivo); }
  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT ms.*, p.nombre AS nombre_producto, u.nombre_completo AS realizado_por_nombre
     FROM movimientos_stock ms
     JOIN productos p ON p.id = ms.producto_id
     LEFT JOIN usuarios u ON u.id = ms.realizado_por
     WHERE ${conditions.join(' AND ')}
     ORDER BY ms.creado_en DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  return rows;
}