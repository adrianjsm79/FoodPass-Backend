import pool from '../config/db.js';
import { createError } from '../middlewares/error.middleware.js';
import { SOCKET_EVENTS } from '../config/socket.js';

export async function listarCuentas(institucionId) {
  const { rows } = await pool.query(
    `SELECT cp.*, u.nombre_completo, u.correo
     FROM cuentas_postpago cp
     JOIN usuarios u ON u.id = cp.usuario_id
     WHERE cp.institucion_id = $1
     ORDER BY cp.saldo_deuda DESC`,
    [institucionId]
  );
  return rows;
}

export async function crearCuenta({ usuario_id, institucion_id, limite_credito }) {
  if (!usuario_id || !limite_credito) throw createError(400, 'usuario_id y limite_credito son requeridos');

  // Verificar que el usuario existe en la institución
  const { rows: uir } = await pool.query(
    `SELECT id FROM usuario_institucion_roles
     WHERE usuario_id = $1 AND institucion_id = $2 AND activo = true`,
    [usuario_id, institucion_id]
  );
  if (uir.length === 0) throw createError(404, 'El usuario no pertenece a esta institución');

  const { rows } = await pool.query(
    `INSERT INTO cuentas_postpago (usuario_id, institucion_id, limite_credito)
     VALUES ($1, $2, $3)
     ON CONFLICT (usuario_id, institucion_id) DO UPDATE
       SET activo = true, limite_credito = EXCLUDED.limite_credito, actualizado_en = NOW()
     RETURNING *`,
    [usuario_id, institucion_id, limite_credito]
  );
  return rows[0];
}

export async function obtenerCuenta(usuarioId, institucionId) {
  const { rows } = await pool.query(
    `SELECT cp.*, u.nombre_completo, u.correo
     FROM cuentas_postpago cp
     JOIN usuarios u ON u.id = cp.usuario_id
     WHERE cp.usuario_id = $1 AND cp.institucion_id = $2`,
    [usuarioId, institucionId]
  );
  if (!rows[0]) throw createError(404, 'Cuenta postpago no encontrada');
  return rows[0];
}

export async function actualizarLimite(usuarioId, institucionId, limite_credito) {
  const { rows } = await pool.query(
    `UPDATE cuentas_postpago SET limite_credito = $1, actualizado_en = NOW()
     WHERE usuario_id = $2 AND institucion_id = $3
     RETURNING *`,
    [limite_credito, usuarioId, institucionId]
  );
  if (!rows[0]) throw createError(404, 'Cuenta postpago no encontrada');
  return rows[0];
}

export async function abonar({ usuario_id, institucion_id, monto, descripcion, realizado_por }, io) {
  if (!monto || monto <= 0) throw createError(400, 'El monto del abono debe ser mayor a 0');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM cuentas_postpago
       WHERE usuario_id = $1 AND institucion_id = $2 AND activo = true
       FOR UPDATE`,
      [usuario_id, institucion_id]
    );
    const cuenta = rows[0];
    if (!cuenta) throw createError(404, 'Cuenta postpago no encontrada o inactiva');

    if (monto > parseFloat(cuenta.saldo_deuda)) {
      throw createError(400, `El abono (S/ ${monto}) supera la deuda actual (S/ ${cuenta.saldo_deuda})`);
    }

    await client.query(
      `UPDATE cuentas_postpago SET saldo_deuda = saldo_deuda - $1, actualizado_en = NOW()
       WHERE id = $2`,
      [monto, cuenta.id]
    );

    const { rows: transRows } = await client.query(
      `INSERT INTO transacciones_postpago (cuenta_id, monto, tipo, descripcion)
       VALUES ($1, $2, 'ABONO', $3)
       RETURNING *`,
      [cuenta.id, monto, descripcion || 'Abono de deuda']
    );

    await client.query('COMMIT');

    if (io) {
      io.to(`institucion:${institucion_id}`).emit(SOCKET_EVENTS.ABONO_REGISTRADO, {
        usuario_id,
        monto,
        nuevo_saldo: parseFloat(cuenta.saldo_deuda) - monto,
      });
    }

    return transRows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listarTransacciones({ institucion_id, usuario_id, tipo, limit = 50, offset = 0 }) {
  const conditions = ['cp.institucion_id = $1'];
  const params = [institucion_id];
  let i = 2;

  if (usuario_id) { conditions.push(`cp.usuario_id = $${i++}`); params.push(usuario_id); }
  if (tipo) { conditions.push(`tp.tipo = $${i++}`); params.push(tipo); }

  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT tp.*, u.nombre_completo AS nombre_usuario, u.correo
     FROM transacciones_postpago tp
     JOIN cuentas_postpago cp ON cp.id = tp.cuenta_id
     JOIN usuarios u ON u.id = cp.usuario_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY tp.creado_en DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  return rows;
}