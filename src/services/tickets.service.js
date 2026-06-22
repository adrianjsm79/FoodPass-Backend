import pool from '../config/db.js';
import { createError } from '../middlewares/error.middleware.js';
import { SOCKET_EVENTS } from '../config/socket.js';

// ─── Canjear ticket ────────────────────────────────────────────────────────────
export async function canjearTicket(codigo, institucionId, cajeroId, io) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Buscar y bloquear el ticket
    const { rows } = await client.query(
      `SELECT t.*, u.nombre_completo AS nombre_usuario, pr.nombre AS nombre_producto
       FROM tickets t
       JOIN items_pedido ip ON ip.id = t.item_pedido_id
       JOIN pedidos p ON p.id = ip.pedido_id
       JOIN productos pr ON pr.id = ip.producto_id
       LEFT JOIN usuarios u ON u.id = p.usuario_id
       WHERE t.codigo = $1 AND t.institucion_id = $2
       FOR UPDATE OF t`,
      [codigo, institucionId]
    );

    const ticket = rows[0];
    if (!ticket) throw createError(404, 'Ticket no encontrado en esta institución');

    if (ticket.estado === 'CANJEADO') {
      throw createError(400, `Ticket ya fue canjeado el ${new Date(ticket.canjeado_en).toLocaleString('es-PE')}`);
    }

    if (ticket.estado === 'EXPIRADO' || new Date(ticket.expira_en) < new Date()) {
      // Si aún no está marcado como expirado, actualizarlo
      if (ticket.estado !== 'EXPIRADO') {
        await client.query(
          `UPDATE tickets SET estado = 'EXPIRADO' WHERE id = $1`,
          [ticket.id]
        );
      }
      throw createError(400, 'El ticket ha expirado');
    }

    // Canjear
    await client.query(
      `UPDATE tickets
       SET estado = 'CANJEADO', canjeado_en = NOW(), canjeado_por = $1
       WHERE id = $2`,
      [cajeroId, ticket.id]
    );

    // Historial
    await client.query(
      `INSERT INTO historial_estado_ticket (ticket_id, estado_anterior, estado_nuevo, cambiado_por, motivo)
       VALUES ($1, 'VIGENTE', 'CANJEADO', $2, 'Canje en comedor')`,
      [ticket.id, cajeroId]
    );

    await client.query('COMMIT');

    const resultado = {
      ticket_id: ticket.id,
      codigo: ticket.codigo,
      estado: 'CANJEADO',
      nombre_producto: ticket.nombre_producto,
      nombre_usuario: ticket.nombre_usuario,
      canjeado_en: new Date(),
    };

    // Emitir evento en tiempo real
    if (io) {
      io.to(`institucion:${institucionId}`).emit(SOCKET_EVENTS.TICKET_CANJEADO, resultado);
    }

    return resultado;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Buscar ticket por código ──────────────────────────────────────────────────
export async function buscarPorCodigo(codigo, institucionId) {
  const { rows } = await pool.query(
    `SELECT t.*, u.nombre_completo AS nombre_usuario, pr.nombre AS nombre_producto,
            p.canal, p.creado_en AS pedido_fecha
     FROM tickets t
     JOIN items_pedido ip ON ip.id = t.item_pedido_id
     JOIN pedidos p ON p.id = ip.pedido_id
     JOIN productos pr ON pr.id = ip.producto_id
     LEFT JOIN usuarios u ON u.id = p.usuario_id
     WHERE t.codigo = $1 AND t.institucion_id = $2`,
    [codigo, institucionId]
  );
  if (!rows[0]) throw createError(404, 'Ticket no encontrado');
  return rows[0];
}

// ─── Obtener ticket con historial ─────────────────────────────────────────────
export async function obtenerTicket(ticketId, institucionId) {
  const { rows } = await pool.query(
    `SELECT t.*, u.nombre_completo AS nombre_usuario, pr.nombre AS nombre_producto
     FROM tickets t
     JOIN items_pedido ip ON ip.id = t.item_pedido_id
     JOIN pedidos p ON p.id = ip.pedido_id
     JOIN productos pr ON pr.id = ip.producto_id
     LEFT JOIN usuarios u ON u.id = p.usuario_id
     WHERE t.id = $1 AND t.institucion_id = $2`,
    [ticketId, institucionId]
  );
  if (!rows[0]) throw createError(404, 'Ticket no encontrado');

  const { rows: historial } = await pool.query(
    `SELECT h.*, u.nombre_completo AS cambiado_por_nombre
     FROM historial_estado_ticket h
     LEFT JOIN usuarios u ON u.id = h.cambiado_por
     WHERE h.ticket_id = $1
     ORDER BY h.creado_en ASC`,
    [ticketId]
  );

  return { ...rows[0], historial };
}

// ─── Listar tickets ────────────────────────────────────────────────────────────
export async function listarTickets({ institucion_id, estado, desde, hasta, usuario_id, limit = 50, offset = 0 }) {
  const conditions = ['t.institucion_id = $1'];
  const params = [institucion_id];
  let i = 2;

  if (estado) { conditions.push(`t.estado = $${i++}`); params.push(estado); }
  if (desde) { conditions.push(`t.creado_en >= $${i++}`); params.push(desde); }
  if (hasta) { conditions.push(`t.creado_en <= $${i++}`); params.push(hasta); }
  if (usuario_id) { conditions.push(`p.usuario_id = $${i++}`); params.push(usuario_id); }

  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT t.id, t.codigo, t.estado, t.expira_en, t.canjeado_en, t.creado_en,
            u.nombre_completo AS nombre_usuario, pr.nombre AS nombre_producto,
            p.canal
     FROM tickets t
     JOIN items_pedido ip ON ip.id = t.item_pedido_id
     JOIN pedidos p ON p.id = ip.pedido_id
     JOIN productos pr ON pr.id = ip.producto_id
     LEFT JOIN usuarios u ON u.id = p.usuario_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.creado_en DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  return rows;
}