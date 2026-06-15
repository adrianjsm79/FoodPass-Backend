import pool from '../config/db.js';

/** GET /api/instituciones/:institucionId/pedidos?usuario_id=&estado=&canal=&fecha_desde=&fecha_hasta= */
export async function listar(req, res, next) {
  try {
    const institucionId = req.institucionId;
    const { usuario_id, estado, canal, fecha_desde, fecha_hasta } = req.query;

    let queryText = `
      SELECT
        p.id,
        p.usuario_id,
        p.cajero_id,
        p.canal,
        p.estado,
        p.monto_total,
        p.creado_en,
        (SELECT COUNT(*) FROM items_pedido WHERE pedido_id = p.id) AS total_items
      FROM pedidos p
      WHERE p.institucion_id = $1
    `;

    const params = [institucionId];
    let i = 2;

    if (usuario_id)   { queryText += ` AND p.usuario_id = $${i++}`;                    params.push(usuario_id);   }
    if (estado)       { queryText += ` AND p.estado = $${i++}`;                         params.push(estado);       }
    if (canal)        { queryText += ` AND p.canal = $${i++}`;                          params.push(canal);        }
    if (fecha_desde)  { queryText += ` AND p.creado_en >= $${i++}`;                     params.push(fecha_desde);  }
    if (fecha_hasta)  { queryText += ` AND p.creado_en <= $${i++}::date + interval '1 day'`; params.push(fecha_hasta); }

    queryText += ` ORDER BY p.creado_en DESC`;

    const result = await pool.query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
}

/** GET /api/instituciones/:institucionId/pedidos/:pedidoId */
export async function obtener(req, res, next) {
  try {
    const institucionId = req.institucionId;
    const { pedidoId } = req.params;

    const pedidoResult = await pool.query(
      `SELECT p.id, p.usuario_id, p.cajero_id, p.canal, p.estado, p.monto_total, p.creado_en
       FROM pedidos p
       WHERE p.id = $1 AND p.institucion_id = $2`,
      [pedidoId, institucionId]
    );

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const itemsResult = await pool.query(
      `SELECT
         ip.id, ip.producto_id, ip.cantidad, ip.precio_unitario, ip.subtotal,
         pr.nombre AS producto_nombre
       FROM items_pedido ip
       JOIN productos pr ON ip.producto_id = pr.id
       WHERE ip.pedido_id = $1`,
      [pedidoId]
    );

    res.json({
      ...pedidoResult.rows[0],
      items: itemsResult.rows,
    });
  } catch (error) {
    next(error);
  }
}

/** POST /api/instituciones/:institucionId/pedidos */
export async function crear(req, res, next) {
  const client = await pool.connect();
  try {
    const institucionId = req.institucionId;
    const { usuario_id, cajero_id, canal, items, metodo_pago, cuenta_postpago_id } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos un item' });
    }

    if (!metodo_pago) {
      return res.status(400).json({ error: 'Se requiere especificar metodo_pago' });
    }

    if (metodo_pago.toLowerCase() === 'postpago' && !cuenta_postpago_id) {
      return res.status(400).json({ error: 'Se requiere cuenta_postpago_id para método postpago' });
    }

    const montoTotal = items.reduce(
      (sum, item) => sum + item.precio_unitario * item.cantidad,
      0
    );

    await client.query('BEGIN');

    // 1. Obtener ID del método de pago
    const mpResult = await client.query(
      `SELECT id FROM metodos_pago WHERE LOWER(nombre) = LOWER($1)`,
      [metodo_pago]
    );

    if (mpResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Método de pago no reconocido: ${metodo_pago}` });
    }
    const metodoPagoId = mpResult.rows[0].id;

    // Si es postpago, validamos la cuenta primero y obtenemos el usuario dueño
    let usuarioFinalId = usuario_id || null;
    
    if (metodo_pago.toLowerCase() === 'postpago') {
      const cuentaResult = await client.query(
        `SELECT usuario_id FROM cuentas_postpago WHERE id = $1 AND institucion_id = $2`,
        [cuenta_postpago_id, institucionId]
      );
      if (cuentaResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cuenta postpago no encontrada o no pertenece a la institución' });
      }
      // Asignar el pedido al dueño de la cuenta postpago
      usuarioFinalId = cuentaResult.rows[0].usuario_id;
    }

    const pedidoResult = await client.query(
      `INSERT INTO pedidos (institucion_id, usuario_id, cajero_id, canal, estado, monto_total)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, usuario_id, cajero_id, canal, estado, monto_total, creado_en`,
      [
        institucionId,
        usuarioFinalId,
        cajero_id    || null,
        canal        || 'POS',
        'PAGADO',
        montoTotal,
      ]
    );

    const pedido = pedidoResult.rows[0];

    for (const item of items) {
      const subtotal = item.precio_unitario * item.cantidad;

      await client.query(
        `INSERT INTO items_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [pedido.id, item.producto_id, item.cantidad, item.precio_unitario, subtotal]
      );

      // Reducir stock
      await client.query(
        `UPDATE stock_producto SET cantidad = cantidad - $1 WHERE producto_id = $2`,
        [item.cantidad, item.producto_id]
      );

      // Registrar movimiento de stock
      await client.query(
        `INSERT INTO movimientos_stock
           (producto_id, institucion_id, cambio_cantidad, motivo, tipo_origen, origen_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [item.producto_id, institucionId, -item.cantidad, 'VENTA', 'PEDIDO', pedido.id]
      );
    }

    // 3. Registrar el pago
    await client.query(
      `INSERT INTO pagos (pedido_id, institucion_id, metodo_pago_id, monto, estado)
       VALUES ($1, $2, $3, $4, $5)`,
      [pedido.id, institucionId, metodoPagoId, montoTotal, 'COMPLETADO']
    );

    // 4. Lógica extra si es POSTPAGO
    if (metodo_pago.toLowerCase() === 'postpago') {
      // Insertar transacción de postpago
      await client.query(
        `INSERT INTO transacciones_postpago (cuenta_id, pedido_id, monto, tipo, descripcion)
         VALUES ($1, $2, $3, $4, $5)`,
        [cuenta_postpago_id, pedido.id, montoTotal, 'CARGO', 'Compra en POS']
      );

      // Actualizar deuda
      await client.query(
        `UPDATE cuentas_postpago
         SET saldo_deuda = saldo_deuda + $1, actualizado_en = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [montoTotal, cuenta_postpago_id]
      );
    }

    await client.query('COMMIT');

    // Emitir evento por Socket.IO si está disponible
    if (req.io) {
      req.io.to(institucionId).emit('nuevo_pedido', pedido);
    }

    res.status(201).json({
      ...pedido,
      monto_total:  parseFloat(pedido.monto_total),
      items_count:  items.length,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/** PATCH /api/instituciones/:institucionId/pedidos/:pedidoId/cancelar */
export async function cancelar(req, res, next) {
  const client = await pool.connect();
  try {
    const institucionId = req.institucionId;
    const { pedidoId } = req.params;

    await client.query('BEGIN');

    const pedidoResult = await client.query(
      `SELECT id, estado FROM pedidos WHERE id = $1 AND institucion_id = $2`,
      [pedidoId, institucionId]
    );

    if (pedidoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    if (pedidoResult.rows[0].estado !== 'PENDIENTE') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Solo se pueden cancelar pedidos en estado PENDIENTE' });
    }

    // Revertir stock
    const itemsResult = await client.query(
      `SELECT producto_id, cantidad FROM items_pedido WHERE pedido_id = $1`,
      [pedidoId]
    );

    for (const item of itemsResult.rows) {
      await client.query(
        `UPDATE stock_producto SET cantidad = cantidad + $1 WHERE producto_id = $2`,
        [item.cantidad, item.producto_id]
      );
    }

    const result = await client.query(
      `UPDATE pedidos SET estado = 'CANCELADO'
       WHERE id = $1 RETURNING id, estado`,
      [pedidoId]
    );

    await client.query('COMMIT');

    if (req.io) {
      req.io.to(institucionId).emit('pedido_cancelado', { id: pedidoId });
    }

    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}