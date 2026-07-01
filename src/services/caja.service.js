import pool from '../config/db.js';

export async function obtenerTurnoActual(institucion_id, cajero_id) {
  const res = await pool.query(
    `SELECT * FROM turnos_caja 
     WHERE institucion_id = $1 AND cajero_id = $2 AND estado = 'ABIERTA' 
     ORDER BY fecha_apertura DESC LIMIT 1`,
    [institucion_id, cajero_id]
  );
  return res.rows[0] || null;
}

export async function abrirTurno(institucion_id, cajero_id, monto_inicial) {
  // Verificar si ya tiene uno abierto
  const actual = await obtenerTurnoActual(institucion_id, cajero_id);
  if (actual) {
    throw new Error('El cajero ya tiene un turno abierto.');
  }

  const res = await pool.query(
    `INSERT INTO turnos_caja (institucion_id, cajero_id, monto_inicial, estado)
     VALUES ($1, $2, $3, 'ABIERTA')
     RETURNING *`,
    [institucion_id, cajero_id, monto_inicial]
  );
  return res.rows[0];
}

export async function cerrarTurno(institucion_id, cajero_id, turno_id, monto_declarado) {
  const actual = await obtenerTurnoActual(institucion_id, cajero_id);
  if (!actual || actual.id !== turno_id) {
    throw new Error('El turno indicado no está abierto o no corresponde al cajero.');
  }

  // Calcular las ventas POS pagadas durante este turno
  const ventas = await pool.query(
    `SELECT COALESCE(SUM(p.monto_total), 0) as total_ventas
     FROM pedidos p
     JOIN pagos pg ON p.id = pg.pedido_id
     JOIN metodos_pago mp ON pg.metodo_pago_id = mp.id
     WHERE p.institucion_id = $1 
       AND p.cajero_id = $2
       AND p.canal = 'POS' 
       AND p.estado = 'PAGADO'
       AND p.creado_en >= $3
       AND LOWER(mp.nombre) = 'efectivo'`,
    [institucion_id, cajero_id, actual.fecha_apertura]
  );
  const totalVentas = parseFloat(ventas.rows[0].total_ventas) || 0;
  
  const montoInicial = parseFloat(actual.monto_inicial);
  const montoSistema = montoInicial + totalVentas;

  const res = await pool.query(
    `UPDATE turnos_caja 
     SET estado = 'CERRADA', 
         fecha_cierre = CURRENT_TIMESTAMP,
         monto_declarado = $1,
         monto_sistema = $2
     WHERE id = $3
     RETURNING *`,
    [monto_declarado, montoSistema, turno_id]
  );
  
  return res.rows[0];
}
