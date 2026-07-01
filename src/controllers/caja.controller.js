import * as svc from '../services/caja.service.js';
import * as audit from '../services/audit.service.js';

export const getTurnoActual = async (req, res, next) => {
  try {
    const data = await svc.obtenerTurnoActual(req.institucionId, req.user.id);
    res.json({ turno: data });
  } catch (e) {
    next(e);
  }
};

export const abrirTurno = async (req, res, next) => {
  try {
    const { monto_inicial } = req.body;
    const data = await svc.abrirTurno(req.institucionId, req.user.id, monto_inicial);

    audit.registrar({
      institucion_id: req.institucionId,
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre_completo || 'Cajero',
      accion: 'CAJA_ABIERTA',
      categoria: 'CAJA',
      descripcion: `Caja abierta con monto inicial S/. ${parseFloat(monto_inicial).toFixed(2)}`,
      metadata: { turno_id: data.id, monto_inicial: parseFloat(monto_inicial) },
      ip: req.ip,
    }).catch(() => {});

    res.status(201).json(data);
  } catch (e) {
    next(e);
  }
};

export const cerrarTurno = async (req, res, next) => {
  try {
    const { turno_id, monto_declarado } = req.body;
    const data = await svc.cerrarTurno(req.institucionId, req.user.id, turno_id, monto_declarado);

    const diferencia = parseFloat(data.monto_declarado) - parseFloat(data.monto_sistema);
    const descuadre = diferencia !== 0 ? ` (Descuadre: ${diferencia > 0 ? '+' : ''}${diferencia.toFixed(2)})` : ' (Cuadrado)';

    audit.registrar({
      institucion_id: req.institucionId,
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre_completo || 'Cajero',
      accion: 'CAJA_CERRADA',
      categoria: 'CAJA',
      descripcion: `Caja cerrada — Sistema: S/. ${parseFloat(data.monto_sistema).toFixed(2)}, Declarado: S/. ${parseFloat(data.monto_declarado).toFixed(2)}${descuadre}`,
      metadata: { turno_id, monto_sistema: parseFloat(data.monto_sistema), monto_declarado: parseFloat(data.monto_declarado), diferencia },
      ip: req.ip,
    }).catch(() => {});

    res.json(data);
  } catch (e) {
    next(e);
  }
};
