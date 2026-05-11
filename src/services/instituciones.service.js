// ─── instituciones.service.js ──────────────────────────────────────────────────
import pool from '../config/db.js';
import { createError } from '../middlewares/error.middleware.js';

export async function listar() {
  const { rows } = await pool.query(
    'SELECT id, nombre, slug, logo_url, correo_contacto, activo, creado_en FROM instituciones ORDER BY nombre'
  );
  return rows;
}

export async function crear(data) {
  const { nombre, slug, logo_url, correo_contacto } = data;
  if (!nombre || !slug) throw createError(400, 'nombre y slug son requeridos');
  const { rows } = await pool.query(
    `INSERT INTO instituciones (nombre, slug, logo_url, correo_contacto)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [nombre, slug, logo_url || null, correo_contacto || null]
  );
  // Crear configuración por defecto
  await pool.query(
    'INSERT INTO configuracion_institucion (institucion_id) VALUES ($1) ON CONFLICT DO NOTHING',
    [rows[0].id]
  );
  return rows[0];
}

export async function obtener(id) {
  const { rows } = await pool.query('SELECT * FROM instituciones WHERE id = $1', [id]);
  if (!rows[0]) throw createError(404, 'Institución no encontrada');
  return rows[0];
}

export async function actualizar(id, data) {
  const { nombre, logo_url, correo_contacto, activo } = data;
  const { rows } = await pool.query(
    `UPDATE instituciones
     SET nombre = COALESCE($1, nombre),
         logo_url = COALESCE($2, logo_url),
         correo_contacto = COALESCE($3, correo_contacto),
         activo = COALESCE($4, activo)
     WHERE id = $5 RETURNING *`,
    [nombre, logo_url, correo_contacto, activo, id]
  );
  if (!rows[0]) throw createError(404, 'Institución no encontrada');
  return rows[0];
}

export async function obtenerConfig(institucionId) {
  const { rows } = await pool.query(
    'SELECT * FROM configuracion_institucion WHERE institucion_id = $1',
    [institucionId]
  );
  return rows[0];
}

export async function actualizarConfig(institucionId, data) {
  const { formato_ticket, horas_expiracion_ticket, permite_postpago, permite_ventas_anonimas, requiere_aprobacion_postpago, ajustes_extra } = data;
  const { rows } = await pool.query(
    `UPDATE configuracion_institucion
     SET formato_ticket = COALESCE($1, formato_ticket),
         horas_expiracion_ticket = COALESCE($2, horas_expiracion_ticket),
         permite_postpago = COALESCE($3, permite_postpago),
         permite_ventas_anonimas = COALESCE($4, permite_ventas_anonimas),
         requiere_aprobacion_postpago = COALESCE($5, requiere_aprobacion_postpago),
         ajustes_extra = COALESCE($6::jsonb, ajustes_extra)
     WHERE institucion_id = $7 RETURNING *`,
    [formato_ticket, horas_expiracion_ticket, permite_postpago, permite_ventas_anonimas, requiere_aprobacion_postpago, ajustes_extra ? JSON.stringify(ajustes_extra) : null, institucionId]
  );
  return rows[0];
}

export async function listarMetodosPago() {
  const { rows } = await pool.query('SELECT * FROM metodos_pago WHERE activo = true ORDER BY nombre');
  return rows;
}