import pool from '../config/db.js';
import { createError } from '../middlewares/error.middleware.js';
import { SOCKET_EVENTS } from '../config/socket.js';
import { generarCodigoTicket } from '../utils/ticketCode.js';

// ─── Obtener configuración de institución ──────────────────────────────────────
async function getConfigInstitucion(client, institucionId) {
  const { rows } = await client.query(
    `SELECT horas_expiracion_ticket, permite_postpago, permite_ventas_anonimas, requiere_aprobacion_postpago
     FROM configuracion_institucion
     WHERE institucion_id = $1`,
    [institucionId]
  );
  return rows[0] || { horas_expiracion_ticket: 48, permite_postpago: false, permite_ventas_anonimas: true };
}

// ─── Crear pedido (transacción completa) ───────────────────────────────────────
/**
 * data = {
 *   institucion_id, usuario_id (null si anónimo), cajero_id (null si es APP),
 *   canal: 'APP' | 'POS',
 *   modalidad_pago: 'PREPAGO' | 'POSTPAGO',
 *   items: [{ producto_id, cantidad }]
 * }
 */
export async function crearPedido(data, io) {
  const { institucion_id, usuario_id, cajero_id, canal, modalidad_pago = 'PREPAGO', items } = data;

  if (!items || items.length === 0) throw createError(400, 'El pedido debe tener al menos un item');
  if (!canal || !['APP', 'POS'].includes(canal)) throw createError(400, 'Canal inválido. Debe ser APP o POS');
  if (canal === 'APP' && !usuario_id) throw createError(400, 'El canal APP requiere un usuario autenticado');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const config = await getConfigInstitucion(client, institucion_id);

    // Validar ventas anónimas
    if (!usuario_id && !config.permite_ventas_anonimas) {
      throw createError(403, 'Esta institución no permite ventas anónimas');
    }

    // Validar postpago habilitado
    if (modalidad_pago === 'POSTPAGO' && !config.permite_postpago) {
      throw createError(403, 'Esta institución no tiene habilitado el postpago');
    }

    // ── 1. Validar y bloquear stock de cada producto ──────────────────────────
    let monto_total = 0;
    const processedItems = [];

    for (const item of items) {
      if (!item.producto_id || !item.cantidad || item.cantidad < 1) {
        throw createError(400, 'Cada item requiere producto_id y cantidad >= 1');
      }

      // FOR UPDATE bloquea la fila de stock para evitar condiciones de carrera
      const { rows } = await client.query(
        `SELECT p.id, p.nombre, p.precio, p.genera_ticket, p.activo,
                s.cantidad AS stock_disponible
         FROM productos p
         JOIN stock_producto s ON s.producto_id = p.id
         WHERE p.id = $1 AND p.institucion_id = $2
         FOR UPDATE OF s`,
        [item.producto_id, institucion_id]
      );

      const producto = rows[0];
      if (!producto) throw createError(404, `Producto ${item.producto_id} no encontrado`);
      if (!producto.activo) throw createError(400, `El producto "${producto.nombre}" no está disponible`);
      if (producto.stock_disponible < item.cantidad) {
        throw createError(400, `Stock insuficiente para "${producto.nombre}". Disponible: ${producto.stock_disponible}`);
      }

      const subtotal = parseFloat(producto.precio) * item.cantidad;
      monto_total += subtotal;
      processedItems.push({
        producto_id: item.producto_id,
        nombre_producto: producto.nombre,
        cantidad: item.cantidad,
        precio_unitario: parseFloat(producto.precio),
        subtotal,
        genera_ticket: producto.genera_ticket,
      });
    }

    monto_total = parseFloat(monto_total.toFixed(2));

    // ── 2. Si es postpago: validar límite de crédito ──────────────────────────
    if (modalidad_pago === 'POSTPAGO' && usuario_id) {
      const { rows: cuentaRows } = await client.query(
        `SELECT saldo_deuda, limite_credito FROM cuentas_postpago
         WHERE usuario_id = $1 AND institucion_id = $2 AND activo = true
         FOR UPDATE`,
        [usuario_id, institucion_id]
      );

      if (cuentaRows.length === 0) {
        throw createError(400, 'El usuario no tiene cuenta postpago activa en esta institución');
      }

      const cuenta = cuentaRows[0];
      const nuevaDeuda = parseFloat(cuenta.saldo_deuda) + monto_total;
      if (nuevaDeuda > parseFloat(cuenta.limite_credito)) {
        throw createError(400, `Límite de crédito excedido. Deuda actual: S/ ${cuenta.saldo_deuda}, Límite: S/ ${cuenta.limite_credito}`);
      }
    }

    // ── 3. Crear el pedido ────────────────────────────────────────────────────
    const { rows: pedidoRows } = await client.query(
      `INSERT INTO pedidos (institucion_id, usuario_id, cajero_id, canal, estado, monto_total)
       VALUES ($1, $2, $3, $4, 'PAGADO', $5)
       RETURNING *`,
      [institucion_id, usuario_id || null, cajero_id || null, canal, monto_total]
    );
    const pedido = pedidoRows[0];

    // ── 4. Crear items, descontar stock, generar tickets ──────────────────────
    const ticketsGenerados = [];

    for (const item of processedItems) {
      // Insertar item
      const { rows: itemRows } = await client.query(
        `INSERT INTO items_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [pedido.id, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal]
      );
      const itemId = itemRows[0].id;

      // Descontar stock
      await client.query(
        `UPDATE stock_producto SET cantidad = cantidad - $1, actualizado_en = NOW()
         WHERE producto_id = $2`,
        [item.cantidad, item.producto_id]
      );

      // Registrar movimiento de stock
      await client.query(
        `INSERT INTO movimientos_stock
           (producto_id, institucion_id, cambio_cantidad, motivo, tipo_origen, origen_id, realizado_por)
         VALUES ($1, $2, $3, 'VENTA', 'PEDIDO', $4, $5)`,
        [item.producto_id, institucion_id, -item.cantidad, pedido.id, cajero_id || usuario_id || null]
      );

      // Generar ticket si aplica
      if (item.genera_ticket) {
        const codigo = generarCodigoTicket();
        const expiracion = new Date(Date.now() + config.horas_expiracion_ticket * 3_600_000);

        const { rows: ticketRows } = await client.query(
          `INSERT INTO tickets (item_pedido_id, institucion_id, codigo, estado, expira_en)
           VALUES ($1, $2, $3, 'VIGENTE', $4)
           RETURNING *`,
          [itemId, institucion_id, codigo, expiracion]
        );

        // Historial de estado inicial
        await client.query(
          `INSERT INTO historial_estado_ticket
             (ticket_id, estado_anterior, estado_nuevo, cambiado_por, motivo)
           VALUES ($1, 'CREADO', 'VIGENTE', $2, 'Ticket generado al crear pedido')`,
          [ticketRows[0].id, cajero_id || usuario_id || null]
        );

        ticketsGenerados.push({ ...ticketRows[0], nombre_producto: item.nombre_producto });
      }
    }

    // ── 5. Si postpago: cargar deuda ──────────────────────────────────────────
    if (modalidad_pago === 'POSTPAGO' && usuario_id) {
      await client.query(
        `UPDATE cuentas_postpago
         SET saldo_deuda = saldo_deuda + $1, actualizado_en = NOW()
         WHERE usuario_id = $2 AND institucion_id = $3`,
        [monto_total, usuario_id, institucion_id]
      );

      await client.query(
        `INSERT INTO transacciones_postpago (cuenta_id, pedido_id, monto, tipo, descripcion)
         SELECT id, $1, $2, 'CARGO', 'Compra pedido'
         FROM cuentas_postpago
         WHERE usuario_id = $3 AND institucion_id = $4`,
        [pedido.id, monto_total, usuario_id, institucion_id]
      );
    }

    await client.query('COMMIT');

    const resultado = { ...pedido, items: processedItems, tickets: ticketsGenerados };

    // ── 6. Emitir eventos Socket.IO a la room de la institución ──────────────
    if (io) {
      io.to(`institucion:${institucion_id}`).emit(SOCKET_EVENTS.NUEVA_VENTA, {
        pedido_id: pedido.id,
        monto_total,
        canal,
        tickets_count: ticketsGenerados.length,
        creado_en: pedido.creado_en,
      });

      // Notificar stock actualizado por cada producto
      for (const item of processedItems) {
        const { rows: stockRows } = await pool.query(
          'SELECT cantidad FROM stock_producto WHERE producto_id = $1',
          [item.producto_id]
        );
        if (stockRows[0]) {
          io.to(`institucion:${institucion_id}`).emit(SOCKET_EVENTS.STOCK_ACTUALIZADO, {
            producto_id: item.producto_id,
            nombre: item.nombre_producto,
            stock_actual: stockRows[0].cantidad,
          });
        }
      }

      if (modalidad_pago === 'POSTPAGO') {
        io.to(`institucion:${institucion_id}`).emit(SOCKET_EVENTS.NUEVA_DEUDA, {
          usuario_id,
          monto: monto_total,
        });
      }
    }

    return resultado;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Listar pedidos ────────────────────────────────────────────────────────────
export async function listarPedidos({ institucion_id, desde, hasta, estado, usuario_id, canal, limit = 50, offset = 0 }) {
  const conditions = ['p.institucion_id = $1'];
  const params = [institucion_id];
  let i = 2;

  if (desde) { conditions.push(`p.creado_en >= $${i++}`); params.push(desde); }
  if (hasta) { conditions.push(`p.creado_en <= $${i++}`); params.push(hasta); }
  if (estado) { conditions.push(`p.estado = $${i++}`); params.push(estado); }
  if (usuario_id) { conditions.push(`p.usuario_id = $${i++}`); params.push(usuario_id); }
  if (canal) { conditions.push(`p.canal = $${i++}`); params.push(canal); }

  const where = conditions.join(' AND ');
  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT p.*, u.nombre_completo AS nombre_usuario, c.nombre_completo AS nombre_cajero
     FROM pedidos p
     LEFT JOIN usuarios u ON u.id = p.usuario_id
     LEFT JOIN usuarios c ON c.id = p.cajero_id
     WHERE ${where}
     ORDER BY p.creado_en DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  return rows;
}

// ─── Obtener pedido con items y tickets ────────────────────────────────────────
export async function obtenerPedido(pedidoId, institucionId) {
  const { rows } = await pool.query(
    `SELECT p.*, u.nombre_completo AS nombre_usuario
     FROM pedidos p
     LEFT JOIN usuarios u ON u.id = p.usuario_id
     WHERE p.id = $1 AND p.institucion_id = $2`,
    [pedidoId, institucionId]
  );
  if (!rows[0]) throw createError(404, 'Pedido no encontrado');

  const { rows: items } = await pool.query(
    `SELECT ip.*, pr.nombre AS nombre_producto,
            t.id AS ticket_id, t.codigo AS ticket_codigo, t.estado AS ticket_estado, t.expira_en
     FROM items_pedido ip
     JOIN productos pr ON pr.id = ip.producto_id
     LEFT JOIN tickets t ON t.item_pedido_id = ip.id
     WHERE ip.pedido_id = $1`,
    [pedidoId]
  );

  return { ...rows[0], items };
}

// ─── Cancelar pedido ───────────────────────────────────────────────────────────
export async function cancelarPedido(pedidoId, institucionId, usuarioId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM pedidos WHERE id = $1 AND institucion_id = $2 FOR UPDATE`,
      [pedidoId, institucionId]
    );
    const pedido = rows[0];
    if (!pedido) throw createError(404, 'Pedido no encontrado');
    if (pedido.estado !== 'PENDIENTE') throw createError(400, 'Solo se pueden cancelar pedidos en estado PENDIENTE');

    // Restaurar stock
    const { rows: items } = await client.query(
      'SELECT producto_id, cantidad FROM items_pedido WHERE pedido_id = $1',
      [pedidoId]
    );

    for (const item of items) {
      await client.query(
        'UPDATE stock_producto SET cantidad = cantidad + $1, actualizado_en = NOW() WHERE producto_id = $2',
        [item.cantidad, item.producto_id]
      );
      await client.query(
        `INSERT INTO movimientos_stock (producto_id, institucion_id, cambio_cantidad, motivo, tipo_origen, origen_id, realizado_por)
         VALUES ($1, $2, $3, 'AJUSTE', 'PEDIDO', $4, $5)`,
        [item.producto_id, institucionId, item.cantidad, pedidoId, usuarioId]
      );
    }

    // Invalidar tickets VIGENTES del pedido
    await client.query(
      `UPDATE tickets t SET estado = 'EXPIRADO'
       FROM items_pedido ip
       WHERE t.item_pedido_id = ip.id AND ip.pedido_id = $1 AND t.estado = 'VIGENTE'`,
      [pedidoId]
    );

    await client.query(
      `UPDATE pedidos SET estado = 'CANCELADO' WHERE id = $1`,
      [pedidoId]
    );

    await client.query('COMMIT');
    return { mensaje: 'Pedido cancelado correctamente' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}