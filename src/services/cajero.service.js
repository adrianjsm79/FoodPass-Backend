import pool from '../config/db.js';

export async function resumenDashboardCajero(institucion_id, cajero_id) {
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  
  // 1. Tickets Validados (pedidos APP validados por este cajero hoy)
  const queryTickets = await pool.query(
    `SELECT COUNT(*) AS total
     FROM pedidos
     WHERE institucion_id = $1 
       AND canal = 'APP' 
       AND estado = 'PAGADO' 
       AND creado_en >= $2
       /* Asumiendo que el cajero que escanea se guarda de alguna manera, 
          pero en el MVP original los tickets escaneados cambian el pedido a PAGADO/ENTREGADO.
          Por ahora contamos todos los del día o los validados.
          Si no hay trazabilidad de qué cajero lo validó, mostramos el global del día. */`,
    [institucion_id, inicioHoy]
  );
  const ticketsValidados = parseInt(queryTickets.rows[0].total) || 0;

  // 2. Ventas Realizadas (POS)
  const queryVentas = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(monto_total), 0) AS ingresos
     FROM pedidos
     WHERE institucion_id = $1 
       AND canal = 'POS' 
       AND estado = 'PAGADO' 
       AND creado_en >= $2`,
    [institucion_id, inicioHoy]
  );
  const ventasRealizadas = parseInt(queryVentas.rows[0].total) || 0;
  const ingresosPos = parseFloat(queryVentas.rows[0].ingresos) || 0;

  // 3. Usuarios Atendidos Hoy (Únicos)
  const queryUsuarios = await pool.query(
    `SELECT COUNT(DISTINCT usuario_id) AS total
     FROM pedidos
     WHERE institucion_id = $1 
       AND estado = 'PAGADO' 
       AND creado_en >= $2`,
    [institucion_id, inicioHoy]
  );
  const usuariosAtendidos = parseInt(queryUsuarios.rows[0].total) || 0;

  // 4. Alertas de Stock Bajo
  const queryStock = await pool.query(
    `SELECT p.nombre, sp.cantidad, sp.umbral_stock_bajo
     FROM stock_producto sp
     JOIN productos p ON p.id = sp.producto_id
     WHERE p.institucion_id = $1 
       AND p.activo = true 
       AND sp.cantidad <= sp.umbral_stock_bajo
     ORDER BY sp.cantidad ASC
     LIMIT 5`,
    [institucion_id]
  );
  const alertasStock = queryStock.rows.map(r => ({
    nombre: r.nombre,
    cantidad: parseInt(r.cantidad),
    umbral: parseInt(r.umbral_stock_bajo)
  }));

  // 5. Actividad Reciente
  const queryActividad = await pool.query(
    `SELECT id, canal, monto_total, creado_en
     FROM pedidos
     WHERE institucion_id = $1 
       AND estado = 'PAGADO'
     ORDER BY creado_en DESC
     LIMIT 5`,
    [institucion_id]
  );
  
  const actividadReciente = queryActividad.rows.map(r => ({
    id: r.id,
    type: r.canal === 'APP' ? 'ticket' : 'sale',
    description: r.canal === 'APP' ? 'Ticket escaneado/validado' : 'Venta en POS',
    amount: parseFloat(r.monto_total),
    timestamp: r.creado_en
  }));

  return {
    ticketsValidados,
    ventasRealizadas,
    ingresosPos,
    usuariosAtendidos,
    alertasStock,
    actividadReciente,
  };
}
