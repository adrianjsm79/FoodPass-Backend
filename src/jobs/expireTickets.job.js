import cron from 'node-cron';
import pool from '../config/db.js';
import { SOCKET_EVENTS } from '../config/socket.js';

/**
 * Job de expiración de tickets
 * Se ejecuta cada hora y expira todos los tickets VIGENTES cuya fecha expira_en ya pasó.
 * También registra el cambio en historial_estado_ticket y emite eventos Socket.IO
 * a cada room de institución afectada.
 */
export function startExpireTicketsJob(io) {
  // Ejecutar cada hora (minuto 0 de cada hora)
  cron.schedule('0 * * * *', async () => {
    console.log(`[JOB] Verificando tickets expirados... ${new Date().toISOString()}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Obtener y bloquear tickets vencidos
      const { rows: ticketsExpirados } = await client.query(
        `SELECT t.id, t.institucion_id, pr.nombre AS nombre_producto
         FROM tickets t
         JOIN items_pedido ip ON ip.id = t.item_pedido_id
         JOIN productos pr ON pr.id = ip.producto_id
         WHERE t.estado = 'VIGENTE' AND t.expira_en < NOW()
         FOR UPDATE OF t SKIP LOCKED`
      );

      if (ticketsExpirados.length === 0) {
        await client.query('ROLLBACK');
        console.log('[JOB] Sin tickets para expirar.');
        return;
      }

      const ids = ticketsExpirados.map((t) => t.id);

      // Actualizar estado en batch
      await client.query(
        `UPDATE tickets SET estado = 'EXPIRADO' WHERE id = ANY($1::uuid[])`,
        [ids]
      );

      // Registrar en historial en batch
      const historialValues = ids
        .map((_, i) => `($${i * 2 + 1}, 'VIGENTE', 'EXPIRADO', NULL, 'Expiración automática')`)
        .join(', ');
      const historialParams = ids.flatMap((id) => [id, id]);
      // Simplificado: insertar uno a uno para claridad
      for (const id of ids) {
        await client.query(
          `INSERT INTO historial_estado_ticket (ticket_id, estado_anterior, estado_nuevo, motivo)
           VALUES ($1, 'VIGENTE', 'EXPIRADO', 'Expiración automática por job programado')`,
          [id]
        );
      }

      await client.query('COMMIT');

      // Emitir eventos por institución afectada
      if (io) {
        const porInstitucion = ticketsExpirados.reduce((acc, t) => {
          if (!acc[t.institucion_id]) acc[t.institucion_id] = 0;
          acc[t.institucion_id]++;
          return acc;
        }, {});

        for (const [institucionId, count] of Object.entries(porInstitucion)) {
          io.to(`institucion:${institucionId}`).emit(SOCKET_EVENTS.TICKET_EXPIRADO, {
            cantidad_expirados: count,
            timestamp: new Date(),
          });
        }
      }

      console.log(`[JOB] ${ids.length} ticket(s) expirado(s) correctamente.`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[JOB] Error al expirar tickets:', err.message);
    } finally {
      client.release();
    }
  });

  console.log('⏰ Job de expiración de tickets iniciado');
}