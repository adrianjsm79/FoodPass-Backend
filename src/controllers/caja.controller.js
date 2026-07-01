import * as svc from '../services/caja.service.js';

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
    res.status(201).json(data);
  } catch (e) {
    next(e);
  }
};

export const cerrarTurno = async (req, res, next) => {
  try {
    const { turno_id, monto_declarado } = req.body;
    const data = await svc.cerrarTurno(req.institucionId, req.user.id, turno_id, monto_declarado);
    res.json(data);
  } catch (e) {
    next(e);
  }
};
