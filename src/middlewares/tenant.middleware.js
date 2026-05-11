import pool from '../config/db.js';

/**
 * attachTenant
 * 
 * Extrae el :institucionId de los parámetros de la URL y:
 *  1. Verifica que la institución existe y está activa.
 *  2. Busca el rol del usuario autenticado en esa institución.
 *  3. Adjunta req.institucionId y req.userRolEnInstitucion para uso en controllers.
 * 
 * Debe montarse DESPUÉS de verifyToken en las rutas protegidas por institución.
 */
export async function attachTenant(req, res, next) {
  const institucionId = req.params.institucionId;

  if (!institucionId) {
    return res.status(400).json({ error: 'institucionId no proporcionado en la URL' });
  }

  try {
    // 1. Verificar que la institución existe y está activa
    const instResult = await pool.query(
      'SELECT id FROM instituciones WHERE id = $1 AND activo = true',
      [institucionId]
    );

    if (instResult.rowCount === 0) {
      return res.status(404).json({ error: 'Institución no encontrada o inactiva' });
    }

    req.institucionId = institucionId;

    // 2. Buscar el rol del usuario dentro de la institución
    if (req.user) {
      const rolResult = await pool.query(
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
      // Si no tiene rol en esta institución, req.userRolEnInstitucion queda undefined
      // El middleware requireRole() se encargará de bloquearlo si es necesario
    }

    next();
  } catch (err) {
    next(err);
  }
}