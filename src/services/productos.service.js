import pool from '../config/db.js';
import { createError } from '../middlewares/error.middleware.js';

export async function listar(institucionId, { solo_activos = true, categoria_id } = {}) {
  const conditions = ['p.institucion_id = $1'];
  const params = [institucionId];
  let i = 2;
  if (solo_activos === 'true' || solo_activos === true) {
    conditions.push(`p.activo = true`);
  }
  if (categoria_id) { conditions.push(`p.categoria_id = $${i++}`); params.push(categoria_id); }

  const { rows } = await pool.query(
    `SELECT p.*, c.nombre AS categoria_nombre,
            s.cantidad        AS stock_actual,
            s.umbral_stock_bajo
     FROM productos p
     JOIN categorias_producto c ON c.id = p.categoria_id
     LEFT JOIN stock_producto  s ON s.producto_id = p.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.nombre, p.nombre`,
    params
  );
  return rows;
}

export async function obtener(productoId, institucionId) {
  const { rows } = await pool.query(
    `SELECT p.*, c.nombre AS categoria_nombre,
            s.cantidad        AS stock_actual,
            s.umbral_stock_bajo
     FROM productos p
     JOIN categorias_producto c ON c.id = p.categoria_id
     LEFT JOIN stock_producto  s ON s.producto_id = p.id
     WHERE p.id = $1 AND p.institucion_id = $2`,
    [productoId, institucionId]
  );
  if (!rows[0]) throw createError(404, 'Producto no encontrado');
  return rows[0];
}

export async function crear(institucionId, data) {
  const {
    categoria_id, nombre, descripcion,
    precio, genera_ticket = false,
    stock_inicial = 0, imagen_url = null,
  } = data;

  if (!categoria_id || !nombre || precio === undefined) {
    throw createError(400, 'categoria_id, nombre y precio son requeridos');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO productos
         (institucion_id, categoria_id, nombre, descripcion, precio, genera_ticket, imagen_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [institucionId, categoria_id, nombre, descripcion || null, precio, genera_ticket, imagen_url]
    );

    await client.query(
      `INSERT INTO stock_producto (producto_id, cantidad) VALUES ($1, $2)`,
      [rows[0].id, stock_inicial]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function actualizar(productoId, institucionId, data) {
  const { nombre, descripcion, precio, genera_ticket, activo, categoria_id, imagen_url } = data;

  const { rows } = await pool.query(
    `UPDATE productos
     SET nombre       = COALESCE($1, nombre),
         descripcion  = COALESCE($2, descripcion),
         precio       = COALESCE($3, precio),
         genera_ticket= COALESCE($4, genera_ticket),
         activo       = COALESCE($5, activo),
         categoria_id = COALESCE($6, categoria_id),
         imagen_url   = COALESCE($7, imagen_url)
     WHERE id = $8 AND institucion_id = $9
     RETURNING *`,
    [nombre, descripcion, precio, genera_ticket, activo, categoria_id, imagen_url, productoId, institucionId]
  );
  if (!rows[0]) throw createError(404, 'Producto no encontrado');
  return rows[0];
}

export async function desactivar(productoId, institucionId) {
  const { rows } = await pool.query(
    'UPDATE productos SET activo = false WHERE id = $1 AND institucion_id = $2 RETURNING id',
    [productoId, institucionId]
  );
  if (!rows[0]) throw createError(404, 'Producto no encontrado');
  return { mensaje: 'Producto desactivado' };
}