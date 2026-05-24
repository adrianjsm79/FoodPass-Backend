import pool from '../config/db.js';

/** GET /api/instituciones/:institucionId/categorias */
export async function listar(req, res, next) {
  try {
    const institucionId = req.institucionId;

    const result = await pool.query(
      `SELECT id, nombre, icono, activo
       FROM categorias_producto
       WHERE institucion_id = $1
       ORDER BY nombre`,
      [institucionId]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
}

/** POST /api/instituciones/:institucionId/categorias */
export async function crear(req, res, next) {
  try {
    const institucionId = req.institucionId;
    const { nombre, icono } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: 'El campo nombre es requerido' });
    }

    const result = await pool.query(
      `INSERT INTO categorias_producto (institucion_id, nombre, icono, activo)
       VALUES ($1, $2, $3, true)
       RETURNING id, nombre, icono, activo`,
      [institucionId, nombre, icono || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/** PATCH /api/instituciones/:institucionId/categorias/:categoriaId */
export async function actualizar(req, res, next) {
  try {
    const institucionId = req.institucionId;
    const { categoriaId } = req.params;
    const { nombre, icono, activo } = req.body;

    const fields = [];
    const values = [];
    let i = 1;

    if (nombre !== undefined) { fields.push(`nombre = $${i++}`); values.push(nombre); }
    if (icono  !== undefined) { fields.push(`icono = $${i++}`);  values.push(icono);  }
    if (activo !== undefined) { fields.push(`activo = $${i++}`); values.push(activo); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    values.push(categoriaId, institucionId);

    const result = await pool.query(
      `UPDATE categorias_producto
       SET ${fields.join(', ')}
       WHERE id = $${i} AND institucion_id = $${i + 1}
       RETURNING id, nombre, icono, activo`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/instituciones/:institucionId/categorias/:categoriaId */
export async function desactivar(req, res, next) {
  try {
    const institucionId = req.institucionId;
    const { categoriaId } = req.params;

    const result = await pool.query(
      `UPDATE categorias_producto
       SET activo = false
       WHERE id = $1 AND institucion_id = $2
       RETURNING id`,
      [categoriaId, institucionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}