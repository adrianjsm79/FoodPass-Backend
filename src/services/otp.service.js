import pool from '../config/db.js';
import crypto from 'crypto';
import { createError } from '../middlewares/error.middleware.js';

const OTP_EXPIRY_MINUTES = 10;

// ─── Enviar OTP ─────────────────────────────────────────────────────────────────

export async function enviarOTP(usuarioId, correo, nombreCompleto) {
  // Generar código de 6 dígitos
  const codigo = crypto.randomInt(100000, 999999).toString();

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

  // Invalidar OTPs anteriores sin usar
  await pool.query(
    `UPDATE otp_verificacion SET usado = true
     WHERE usuario_id = $1 AND usado = false`,
    [usuarioId]
  );

  // Guardar nuevo OTP
  await pool.query(
    `INSERT INTO otp_verificacion (usuario_id, codigo, expira_en)
     VALUES ($1, $2, $3)`,
    [usuarioId, codigo, expiresAt]
  );

  // Intentar enviar por email con Resend (si está configurado)
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'FoodPass <noreply@foodpass.app>';

  if (resendApiKey) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(resendApiKey);

      await resend.emails.send({
        from: fromEmail,
        to: correo,
        subject: `Tu código de verificación FoodPass: ${codigo}`,
        html: `
          <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #16a34a;">FoodPass</h2>
            <p>Hola <strong>${nombreCompleto}</strong>,</p>
            <p>Tu código de verificación es:</p>
            <div style="background: #f0fdf4; border: 2px solid #16a34a; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #16a34a;">${codigo}</span>
            </div>
            <p style="color: #64748b; font-size: 14px;">Este código expira en ${OTP_EXPIRY_MINUTES} minutos.</p>
          </div>
        `,
      });

      console.log(`📧 OTP enviado a ${correo}`);
    } catch (emailErr) {
      console.warn(`⚠️ No se pudo enviar el email OTP: ${emailErr.message}`);
      // No lanzar error — el OTP se guardó en BD y se puede ver en logs (dev)
    }
  } else {
    // Sin Resend configurado, mostrar en logs (solo para desarrollo)
    console.log(`🔑 OTP para ${correo}: ${codigo} (Resend no configurado)`);
  }

  return {
    mensaje: 'Código de verificación enviado',
    expira_en: expiresAt,
    // Solo incluir código en desarrollo para facilitar pruebas
    ...(process.env.NODE_ENV !== 'production' ? { codigo } : {}),
  };
}

// ─── Verificar OTP ──────────────────────────────────────────────────────────────

export async function verificarOTP(usuarioId, codigo) {
  if (!codigo) throw createError(400, 'El código es requerido');

  const { rows } = await pool.query(
    `SELECT id, codigo, expira_en
     FROM otp_verificacion
     WHERE usuario_id = $1 AND usado = false
     ORDER BY creado_en DESC
     LIMIT 1`,
    [usuarioId]
  );

  if (!rows[0]) {
    throw createError(400, 'No hay un código de verificación pendiente. Solicita uno nuevo.');
  }

  const otp = rows[0];

  if (new Date() > new Date(otp.expira_en)) {
    // Marcar como usado para que no se reutilice
    await pool.query('UPDATE otp_verificacion SET usado = true WHERE id = $1', [otp.id]);
    throw createError(400, 'El código ha expirado. Solicita uno nuevo.');
  }

  if (otp.codigo !== codigo) {
    throw createError(400, 'Código incorrecto');
  }

  // Marcar como usado
  await pool.query('UPDATE otp_verificacion SET usado = true WHERE id = $1', [otp.id]);

  // Marcar correo como verificado
  await pool.query('UPDATE usuarios SET correo_verificado = true WHERE id = $1', [usuarioId]);

  return { verificado: true };
}
