import jwt from 'jsonwebtoken';

/**
 * verifyToken
 * Verifica el JWT del header Authorization y adjunta req.user
 */
export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, correo, nombre_completo }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
}

/**
 * requireRole(...roles)
 * Middleware de fábrica: verifica que el usuario tenga uno de los roles indicados
 * dentro de la institución actual (req.institucionId).
 * Debe usarse DESPUÉS de verifyToken y attachTenant.
 * 
 * Roles disponibles: 'SUPERADMIN', 'ADMIN_INSTITUCION', 'CAJERO', 'USUARIO'
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const userRol = req.userRolEnInstitucion; // adjuntado por tenant.middleware
    if (!userRol) {
      return res.status(403).json({ error: 'Sin acceso a esta institución' });
    }
    if (!allowedRoles.includes(userRol)) {
      return res.status(403).json({
        error: `Rol insuficiente. Se requiere uno de: ${allowedRoles.join(', ')}`,
      });
    }
    next();
  };
}

/**
 * optionalToken
 * Intenta verificar el token pero no falla si no existe.
 * Útil para rutas que soportan acceso anónimo y autenticado.
 */
export function optionalToken(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    } catch (_) {
      // Sin token válido → continúa como anónimo
    }
  }
  next();
}