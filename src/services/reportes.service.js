import pool from '../config/db.js';

// ─── Reporte de ventas ─────────────────────────────────────────────────────────
/**
 * agrupar_por: 'dia' | 'semana' | 'mes'
 */
export async function reporteVentas({ institucion_id, desde, hasta, agrupar_por = 'dia' }) {
  const formatMap = { dia: 'YYYY-MM-DD', semana: 'IYYY-IW', mes: 'YYYY-MM' };
  const formato = formatMap[agrupar_por] || 'YYYY-MM-DD';

  const params = [institucion_id];
  let dateFilter = '';
  if (desde) { params.push(desde); dateFilter += ` AND p.creado_en >= $${params.length}`; }
  if (hasta) { params.push(hasta); dateFilter += ` AND p.creado_en <= $${params.length}`; }

  const { rows } = await pool.query(
    `SELECT
       TO_CHAR(p.creado_en, '${formato}') AS periodo,
       COUNT(DISTINCT p.id)              AS total_pedidos,
       SUM(p.monto_total)                AS ingresos_totales,
       COUNT(DISTINCT p.usuario_id)      AS usuarios_unicos,
       SUM(CASE WHEN p.canal = 'APP' THEN 1 ELSE 0 END) AS pedidos_app,
       SUM(CASE WHEN p.canal = 'POS' THEN 1 ELSE 0 END) AS pedidos_pos
     FROM pedidos p
     WHERE p.institucion_id = $1 AND p.estado = 'PAGADO' ${dateFilter}
     GROUP BY periodo
     ORDER BY periodo DESC`,
    params
  );
  return rows;
}

// ─── Consumo por usuario ───────────────────────────────────────────────────────
export async function consumoPorUsuario({ institucion_id, desde, hasta, usuario_id }) {
  const params = [institucion_id];
  let dateFilter = '';
  let userFilter = '';
  if (desde) { params.push(desde); dateFilter += ` AND p.creado_en >= $${params.length}`; }
  if (hasta) { params.push(hasta); dateFilter += ` AND p.creado_en <= $${params.length}`; }
  if (usuario_id) { params.push(usuario_id); userFilter = ` AND p.usuario_id = $${params.length}`; }

  const { rows } = await pool.query(
    `SELECT
       u.id AS usuario_id,
       u.nombre_completo,
       u.correo,
       COUNT(DISTINCT p.id)  AS total_pedidos,
       SUM(p.monto_total)    AS total_gastado,
       MAX(p.creado_en)      AS ultima_compra
     FROM pedidos p
     JOIN usuarios u ON u.id = p.usuario_id
     WHERE p.institucion_id = $1 AND p.estado = 'PAGADO' AND p.usuario_id IS NOT NULL
           ${dateFilter} ${userFilter}
     GROUP BY u.id, u.nombre_completo, u.correo
     ORDER BY total_gastado DESC`,
    params
  );
  return rows;
}

// ─── Deuda postpago ────────────────────────────────────────────────────────────
export async function deudaPostpago(institucion_id) {
  const { rows } = await pool.query(
    `SELECT
       u.id AS usuario_id,
       u.nombre_completo,
       u.correo,
       cp.saldo_deuda,
       cp.limite_credito,
       cp.actualizado_en,
       ROUND((cp.saldo_deuda / NULLIF(cp.limite_credito, 0)) * 100, 1) AS porcentaje_uso
     FROM cuentas_postpago cp
     JOIN usuarios u ON u.id = cp.usuario_id
     WHERE cp.institucion_id = $1 AND cp.activo = true AND cp.saldo_deuda > 0
     ORDER BY cp.saldo_deuda DESC`,
    [institucion_id]
  );
  return rows;
}

// ─── Resumen del dashboard ─────────────────────────────────────────────────────
export async function resumenDashboard(institucion_id) {
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const params = [institucion_id, inicioHoy];

  const [ventasHoy, ticketsActivos, stockBajo, deudaTotal] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total_pedidos, COALESCE(SUM(monto_total), 0) AS ingresos
       FROM pedidos
       WHERE institucion_id = $1 AND estado = 'PAGADO' AND creado_en >= $2`,
      params
    ),
    pool.query(
      `SELECT COUNT(*) AS total FROM tickets
       WHERE institucion_id = $1 AND estado = 'VIGENTE'`,
      [institucion_id]
    ),
    pool.query(
      `SELECT COUNT(*) AS total FROM stock_producto sp
       JOIN productos p ON p.id = sp.producto_id
       WHERE p.institucion_id = $1 AND sp.cantidad <= sp.umbral_stock_bajo AND p.activo = true`,
      [institucion_id]
    ),
    pool.query(
      `SELECT COALESCE(SUM(saldo_deuda), 0) AS total_deuda
       FROM cuentas_postpago
       WHERE institucion_id = $1 AND activo = true`,
      [institucion_id]
    ),
  ]);

  return {
    ventas_hoy: {
      total_pedidos: parseInt(ventasHoy.rows[0].total_pedidos),
      ingresos: parseFloat(ventasHoy.rows[0].ingresos),
    },
    tickets_activos: parseInt(ticketsActivos.rows[0].total),
    productos_con_stock_bajo: parseInt(stockBajo.rows[0].total),
    total_deuda_postpago: parseFloat(deudaTotal.rows[0].total_deuda),
  };
}

// ─── Métodos de pago agrupados ─────────────────────────────────────────────────
export async function metodosPago(institucion_id) {
  const { rows } = await pool.query(
    `SELECT
       mp.nombre AS name,
       COUNT(pa.id)::int AS value,
       COALESCE(SUM(pa.monto), 0)::numeric AS amount
     FROM pagos pa
     JOIN metodos_pago mp ON mp.id = pa.metodo_pago_id
     WHERE pa.institucion_id = $1 AND pa.estado = 'COMPLETADO'
     GROUP BY mp.nombre
     ORDER BY amount DESC`,
    [institucion_id]
  );
  return rows.map(r => ({
    name: r.name,
    value: parseInt(r.value),
    amount: parseFloat(r.amount),
  }));
}

// ─── Ventas semanales por canal (APP vs POS) ───────────────────────────────────
export async function ventasSemanalesPorCanal(institucion_id) {
  const { rows } = await pool.query(
    `SELECT
       TO_CHAR(p.creado_en, 'Dy') AS day,
       p.creado_en::date AS fecha,
       COALESCE(SUM(CASE WHEN p.canal = 'APP' THEN p.monto_total ELSE 0 END), 0)::numeric AS "APP",
       COALESCE(SUM(CASE WHEN p.canal = 'POS' THEN p.monto_total ELSE 0 END), 0)::numeric AS "POS"
     FROM pedidos p
     WHERE p.institucion_id = $1
       AND p.estado = 'PAGADO'
       AND p.creado_en >= CURRENT_DATE - INTERVAL '6 days'
     GROUP BY p.creado_en::date, TO_CHAR(p.creado_en, 'Dy')
     ORDER BY fecha`,
    [institucion_id]
  );

  // Map day abbreviations to Spanish
  const dayMap = { Mon: 'Lun', Tue: 'Mar', Wed: 'Mié', Thu: 'Jue', Fri: 'Vie', Sat: 'Sáb', Sun: 'Dom' };

  return rows.map(r => ({
    day: dayMap[r.day?.trim()] || r.day?.trim(),
    APP: parseFloat(r.APP),
    POS: parseFloat(r.POS),
  }));
}

// ─── Productos top ventas ──────────────────────────────────────────────────────
export async function productosTopVentas({ institucion_id, desde, hasta, limit = 10 }) {
  const params = [institucion_id];
  let dateFilter = '';
  if (desde) { params.push(desde); dateFilter += ` AND pe.creado_en >= $${params.length}`; }
  if (hasta) { params.push(hasta); dateFilter += ` AND pe.creado_en <= $${params.length}`; }
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT
       p.nombre AS name,
       SUM(ip.cantidad)::int AS qty,
       SUM(ip.subtotal)::numeric AS revenue
     FROM items_pedido ip
     JOIN pedidos pe ON pe.id = ip.pedido_id
     JOIN productos p ON p.id = ip.producto_id
     WHERE pe.institucion_id = $1 AND pe.estado = 'PAGADO' ${dateFilter}
     GROUP BY p.id, p.nombre
     ORDER BY revenue DESC
     LIMIT $${params.length}`,
    params
  );

  return rows.map(r => ({
    name: r.name,
    qty: parseInt(r.qty),
    revenue: parseFloat(r.revenue),
  }));
}

// ─── Ventas por canal con rango de fechas ──────────────────────────────────────
export async function ventasPorCanal({ institucion_id, desde, hasta, agrupar_por = 'dia' }) {
  const formatMap = { dia: 'YYYY-MM-DD', semana: 'IYYY-IW', mes: 'YYYY-MM' };
  const labelMap = { dia: 'DD Mon', semana: 'IYYY-IW', mes: 'Mon YYYY' };
  const formato = formatMap[agrupar_por] || 'YYYY-MM-DD';
  const labelFormato = labelMap[agrupar_por] || 'DD Mon';

  const params = [institucion_id];
  let dateFilter = '';
  if (desde) { params.push(desde); dateFilter += ` AND p.creado_en >= $${params.length}`; }
  if (hasta) { params.push(hasta); dateFilter += ` AND p.creado_en <= $${params.length}`; }

  const { rows } = await pool.query(
    `SELECT
       TO_CHAR(MIN(p.creado_en), '${labelFormato}') AS label,
       TO_CHAR(p.creado_en, '${formato}') AS periodo,
       COALESCE(SUM(CASE WHEN p.canal = 'APP' THEN p.monto_total ELSE 0 END), 0)::numeric AS app,
       COALESCE(SUM(CASE WHEN p.canal = 'POS' THEN p.monto_total ELSE 0 END), 0)::numeric AS pos,
       COUNT(DISTINCT p.id)::int AS total_pedidos,
       COUNT(DISTINCT p.usuario_id)::int AS usuarios_unicos
     FROM pedidos p
     WHERE p.institucion_id = $1 AND p.estado = 'PAGADO' ${dateFilter}
     GROUP BY periodo
     ORDER BY periodo ASC`,
    params
  );

  return rows.map(r => ({
    label: r.label?.trim(),
    periodo: r.periodo,
    app: parseFloat(r.app),
    pos: parseFloat(r.pos),
    total_pedidos: parseInt(r.total_pedidos),
    usuarios_unicos: parseInt(r.usuarios_unicos),
  }));
}
