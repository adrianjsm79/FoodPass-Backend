// src/services/otp.service.js
import crypto from 'crypto';
import pool from '../config/db.js';
import { Resend } from 'resend';
import { createError } from '../middlewares/error.middleware.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const OTP_EXPIRY_MINUTES = 10;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

export async function enviarOTP(usuarioId, correo, nombre) {
  // Invalidar OTPs anteriores del mismo usuario
  await pool.query(
    'UPDATE otp_verificacion SET usado = true WHERE usuario_id = $1 AND usado = false',
    [usuarioId]
  );

  // Generar código de 6 dígitos
  const codigo = String(crypto.randomInt(100000, 999999));
  const expira = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);

  await pool.query(
    'INSERT INTO otp_verificacion (usuario_id, codigo, expira_en) VALUES ($1, $2, $3)',
    [usuarioId, codigo, expira]
  );

  // Enviar correo
  await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: correo,
    subject: `${codigo} es tu código de FoodPass`,
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto">
        <h2>Hola ${nombre.split(' ')[0]} 👋</h2>
        <p>Tu código de verificación es:</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;
                    background:#f5f5f5;padding:20px;text-align:center;
                    border-radius:8px;margin:20px 0">${codigo}</div>
        <p style="color:#888;font-size:13px">
          Válido por ${OTP_EXPIRY_MINUTES} minutos. No lo compartas con nadie.
        </p>
      </div>
    `,
  });

  return { mensaje: `Código enviado a ${correo}` };
}

export async function verificarOTP(usuarioId, codigoIngresado) {
  const { rows } = await pool.query(
    `SELECT * FROM otp_verificacion
     WHERE usuario_id = $1 AND usado = false AND expira_en > NOW()
     ORDER BY creado_en DESC LIMIT 1`,
    [usuarioId]
  );

  const otp = rows[0];
  if (!otp)                      throw createError(400, 'Código expirado o inexistente');
  if (otp.codigo !== codigoIngresado) throw createError(400, 'Código incorrecto');

  // Marcar como usado y verificar el correo
  await pool.query('UPDATE otp_verificacion SET usado = true WHERE id = $1', [otp.id]);
  await pool.query('UPDATE usuarios SET correo_verificado = true WHERE id = $1', [usuarioId]);

  return { mensaje: 'Correo verificado correctamente' };
}