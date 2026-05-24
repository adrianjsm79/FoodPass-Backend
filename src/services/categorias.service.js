import pool from '../config/db.js';
import { createError } from '../middlewares/error.middleware.js';

export async function listar(institucionId) {
  const { rows } = await pool.query(
    'SELECT * FROM categorias_producto WHERE institucion_id = $1 AND activo = true ORDER BY nombre',
    [institucionId]
  );
  return rows;
}

export async function crear(institucionId, { nombre, icono, imagen_url }) {
  if (!nombre) throw createError(400, 'nombre es requerido');
  const { rows } = await pool.query(
    `INSERT INTO categorias_producto (institucion_id, nombre, icono, imagen_url)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [institucionId, nombre, icono || null, imagen_url || null]
  );
  return rows[0];
}

export async function actualizar(categoriaId, institucionId, data) {
  const { nombre, icono, activo, imagen_url } = data;
  const { rows } = await pool.query(
    `UPDATE categorias_producto
     SET nombre     = COALESCE($1, nombre),
         icono      = COALESCE($2, icono),
         activo     = COALESCE($3, activo),
         imagen_url = COALESCE($4, imagen_url)
     WHERE id = $5 AND institucion_id = $6 RETURNING *`,
    [nombre, icono, activo, imagen_url, categoriaId, institucionId]
  );
  if (!rows[0]) throw createError(404, 'Categoría no encontrada');
  return rows[0];
}

export async function desactivar(categoriaId, institucionId) {
  const { rows } = await pool.query(
    'UPDATE categorias_producto SET activo = false WHERE id = $1 AND institucion_id = $2 RETURNING id',
    [categoriaId, institucionId]
  );
  if (!rows[0]) throw createError(404, 'Categoría no encontrada');
  return { mensaje: 'Categoría desactivada' };
}