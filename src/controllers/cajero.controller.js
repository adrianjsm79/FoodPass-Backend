import * as svc from '../services/cajero.service.js';

export const dashboard = async (req, res, next) => {
  try {
    const data = await svc.resumenDashboardCajero(req.institucionId, req.user?.id);
    res.json(data);
  } catch (e) {
    next(e);
  }
};

export const historial = async (req, res, next) => {
  try {
    const data = await svc.obtenerHistorialHoy(req.institucionId, req.user?.id);
    res.json(data);
  } catch (e) {
    next(e);
  }
};

export const anularVenta = async (req, res, next) => {
  try {
    const { pedidoId } = req.params;
    const data = await svc.anularVenta(req.institucionId, req.user?.id, pedidoId);
    res.json(data);
  } catch (e) {
    next(e);
  }
};
