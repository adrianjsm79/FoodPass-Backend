import * as svc from '../services/cajero.service.js';

export const dashboard = async (req, res, next) => {
  try {
    const data = await svc.resumenDashboardCajero(req.institucionId, req.user?.id);
    res.json(data);
  } catch (e) {
    next(e);
  }
};
