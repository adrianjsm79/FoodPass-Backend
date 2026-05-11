/**
 * Manejador de errores global de Express.
 * Captura cualquier error pasado con next(err) en los controllers/services.
 */
export function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // Errores de negocio esperados (los lanzamos con statusCode en los services)
  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Error de constraint único de PostgreSQL (ej: correo duplicado)
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos únicos' });
  }

  // Error de FK de PostgreSQL
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referencia inválida: el recurso relacionado no existe' });
  }

  // Error genérico
  const statusCode = err.status || 500;
  const message = process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message;
  res.status(statusCode).json({ error: message });
}

/**
 * Helper para lanzar errores con código HTTP desde los services.
 * Uso: throw createError(404, 'Recurso no encontrado')
 */
export function createError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}