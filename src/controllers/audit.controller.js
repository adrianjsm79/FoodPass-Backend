import * as svc from '../services/audit.service.js';

export const listarAuditoria = async (req, res, next) => {
  try {
    const { categoria, fechaInicio, fechaFin, limite, offset } = req.query;
    const data = await svc.listar(req.institucionId, {
      categoria,
      fechaInicio,
      fechaFin,
      limite: parseInt(limite) || 50,
      offset: parseInt(offset) || 0,
    });
    res.json(data);
  } catch (e) {
    next(e);
  }
};
