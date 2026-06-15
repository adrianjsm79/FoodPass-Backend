import pool from '../config/db.js';

/** GET /api/instituciones/:institucionId/productos?categoria_id=... */
export async function listar(req, res, next) {
  try {
    const institucionId = req.institucionId;
    const { categoria_id } = req.query;

    let queryText = `
      SELECT
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        c.nombre            AS categoria,
        c.id                AS categoria_id,
        COALESCE(sp.cantidad, 0)            AS stock,
        COALESCE(sp.umbral_stock_bajo, 5)   AS umbral,
        p.genera_ticket     AS "generaTicket",
        p.activo            AS estado,
        p.imagen_url        AS imagen
      FROM productos p
      LEFT JOIN categorias_producto c  ON p.categoria_id  = c.id
      LEFT JOIN stock_producto      sp ON p.id             = sp.producto_id
      WHERE p.institucion_id = $1
    `;

    const params = [institucionId];

    if (categoria_id) {
      params.push(categoria_id);
      queryText += ` AND p.categoria_id = $${params.length}`;
    }

    queryText += ` ORDER BY p.nombre`;

    const result = await pool.query(queryText, params);

    const productos = result.rows.map((p) => ({
      id:          p.id,
      nombre:      p.nombre,
      descripcion: p.descripcion,
      categoria:   p.categoria,
      categoriaId: p.categoria_id,
      precio:      parseFloat(p.precio),
      stock:       parseInt(p.stock),
      umbral:      parseInt(p.umbral),
      generaTicket: p.generaTicket,
      estado:      p.estado ? 'activo' : 'inactivo',
      imagen:      p.imagen,
    }));

    res.json(productos);
  } catch (error) {
    next(error);
  }
}

/** GET /api/instituciones/:institucionId/productos/:productoId */
export async function obtener(req, res, next) {
  try {
    const institucionId = req.institucionId;
    const { productoId } = req.params;

    const result = await pool.query(
      `SELECT
         p.id, p.nombre, p.descripcion, p.precio,
         c.nombre AS categoria, c.id AS categoria_id,
         COALESCE(sp.cantidad, 0)          AS stock,
         COALESCE(sp.umbral_stock_bajo, 5) AS umbral,
         p.genera_ticket AS "generaTicket",
         p.activo        AS estado,
         p.imagen_url    AS imagen
       FROM productos p
       LEFT JOIN categorias_producto c  ON p.categoria_id = c.id
       LEFT JOIN stock_producto      sp ON p.id            = sp.producto_id
       WHERE p.id = $1 AND p.institucion_id = $2`,
      [productoId, institucionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const p = result.rows[0];
    res.json({
      id:          p.id,
      nombre:      p.nombre,
      descripcion: p.descripcion,
      categoria:   p.categoria,
      categoriaId: p.categoria_id,
      precio:      parseFloat(p.precio),
      stock:       parseInt(p.stock),
      umbral:      parseInt(p.umbral),
      generaTicket: p.generaTicket,
      estado:      p.estado ? 'activo' : 'inactivo',
      imagen:      p.imagen,
    });
  } catch (error) {
    next(error);
  }
}

/** POST /api/instituciones/:institucionId/productos */
export async function crear(req, res, next) {
  try {
    const institucionId = req.institucionId;
    const { nombre, descripcion, precio, categoria_id, genera_ticket, imagen_url } = req.body;

    if (!nombre || !precio || !categoria_id) {
      return res.status(400).json({
        error: 'Campos requeridos: nombre, precio, categoria_id',
      });
    }

    const insertResult = await pool.query(
      `INSERT INTO productos
         (institucion_id, categoria_id, nombre, descripcion, precio, genera_ticket, imagen_url, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING id, nombre, descripcion, precio,
         (SELECT nombre FROM categorias_producto WHERE id = $2) AS categoria,
         genera_ticket AS "generaTicket",
         activo AS estado,
         imagen_url AS imagen`,
      [
        institucionId,
        categoria_id,
        nombre,
        descripcion || null,
        parseFloat(precio),
        genera_ticket || false,
        imagen_url || null,
      ]
    );

    const producto = insertResult.rows[0];

    // Crear registro de stock inicial
    await pool.query(
      `INSERT INTO stock_producto (producto_id, cantidad, umbral_stock_bajo)
       VALUES ($1, 0, 5)`,
      [producto.id]
    );

    res.status(201).json({
      id:          producto.id,
      nombre:      producto.nombre,
      descripcion: producto.descripcion,
      categoria:   producto.categoria,
      precio:      parseFloat(producto.precio),
      stock:       0,
      umbral:      5,
      generaTicket: producto.generaTicket,
      estado:      'activo',
      imagen:      producto.imagen,
    });
  } catch (error) {
    next(error);
  }
}

/** PATCH /api/instituciones/:institucionId/productos/:productoId */
export async function actualizar(req, res, next) {
  try {
    const institucionId = req.institucionId;
    const { productoId } = req.params;
    const { nombre, descripcion, precio, categoria_id, genera_ticket, imagen_url, activo } = req.body;

    const fields = [];
    const values = [];
    let i = 1;

    if (nombre       !== undefined) { fields.push(`nombre = $${i++}`);        values.push(nombre);                }
    if (descripcion  !== undefined) { fields.push(`descripcion = $${i++}`);   values.push(descripcion);           }
    if (precio       !== undefined) { fields.push(`precio = $${i++}`);        values.push(parseFloat(precio));    }
    if (categoria_id !== undefined) { fields.push(`categoria_id = $${i++}`);  values.push(categoria_id);          }
    if (genera_ticket!== undefined) { fields.push(`genera_ticket = $${i++}`); values.push(genera_ticket);         }
    if (imagen_url   !== undefined) { fields.push(`imagen_url = $${i++}`);    values.push(imagen_url);            }
    if (activo       !== undefined) { fields.push(`activo = $${i++}`);        values.push(activo);                }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    values.push(productoId, institucionId);

    const result = await pool.query(
      `UPDATE productos
       SET ${fields.join(', ')}
       WHERE id = $${i} AND institucion_id = $${i + 1}
       RETURNING id, nombre, descripcion, precio, genera_ticket, activo`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/instituciones/:institucionId/productos/:productoId */
export async function desactivar(req, res, next) {
  try {
    const institucionId = req.institucionId;
    const { productoId } = req.params;

    const result = await pool.query(
      `DELETE FROM productos
       WHERE id = $1 AND institucion_id = $2
       RETURNING id`,
      [productoId, institucionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ error: 'No se puede eliminar el producto porque ya tiene ventas o pedidos registrados' });
    }
    next(error);
  }
}