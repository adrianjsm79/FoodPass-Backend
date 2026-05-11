import crypto from 'crypto';

/**
 * Genera un código de ticket único.
 * Formato: FP-XXXX-XXXX (alfanumérico en mayúsculas, sin caracteres ambiguos)
 * Ejemplo: FP-A3K9-2BX7
 *
 * Tiene baja probabilidad de colisión; la DB tiene constraint UNIQUE en la columna codigo.
 * Si hubiera colisión, el INSERT fallaría y el service lo reintentaría.
 */
export function generarCodigoTicket() {
  // Caracteres que no se confunden visualmente (sin 0/O, 1/I/L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let parte1 = '';
  let parte2 = '';

  for (let i = 0; i < 4; i++) {
    parte1 += chars[bytes[i] % chars.length];
    parte2 += chars[bytes[i + 4] % chars.length];
  }

  return `FP-${parte1}-${parte2}`;
}