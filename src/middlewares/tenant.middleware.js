import pool from '../config/db.js';

export async function attachTenant(req, res, next) {
  const institucionId = req.params.institucionId;

  if (!institucionId) {
    return res.status(400).json({ error: 'institucionId no proporcionado en la URL' });
  }

  const client = await pool.connect(); // ← igual que testConnection
  try {
    const instResult = await client.query(
      'SELECT id FROM instituciones WHERE id = $1 AND activo = true',
      [institucionId]
    );

    if (instResult.rowCount === 0) {
      return res.status(404).json({ error: 'Institución no encontrada o inactiva' });
    }

    req.institucionId = institucionId;

    if (req.user) {
      const rolResult = await client.query(
        `SELECT r.nombre, uir.modalidad_pago
         FROM usuario_institucion_roles uir
         JOIN roles r ON r.id = uir.rol_id
         WHERE uir.usuario_id = $1
           AND uir.institucion_id = $2
           AND uir.activo = true`,
        [req.user.id, institucionId]
      );

      if (rolResult.rowCount > 0) {
        req.userRolEnInstitucion = rolResult.rows[0].nombre;
        req.userModalidadPago = rolResult.rows[0].modalidad_pago;
      }
    }

    next();
  } catch (err) {
    next(err);
  } finally {
    client.release(); // ← siempre libera
  }
}