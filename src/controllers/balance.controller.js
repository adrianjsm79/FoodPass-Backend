import * as svc from '../services/balance.service.js';

export const listarArqueos = async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    const data = await svc.listarArqueos(req.institucionId, fechaInicio, fechaFin);
    res.json(data);
  } catch (e) {
    next(e);
  }
};
