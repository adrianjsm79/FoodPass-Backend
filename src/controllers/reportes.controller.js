import * as svc from '../services/reportes.service.js';
export const ventas = async (req, res, next) => { try { res.json(await svc.reporteVentas({ ...req.query, institucion_id: req.institucionId })); } catch(e){ next(e); } };
export const consumoPorUsuario = async (req, res, next) => { try { res.json(await svc.consumoPorUsuario({ ...req.query, institucion_id: req.institucionId })); } catch(e){ next(e); } };
export const deudaPostpago = async (req, res, next) => { try { res.json(await svc.deudaPostpago(req.institucionId)); } catch(e){ next(e); } };
export const resumen = async (req, res, next) => { try { res.json(await svc.resumenDashboard(req.institucionId)); } catch(e){ next(e); } };
export const metodosPago = async (req, res, next) => { try { res.json(await svc.metodosPago(req.institucionId)); } catch(e){ next(e); } };
export const ventasSemanales = async (req, res, next) => { try { res.json(await svc.ventasSemanalesPorCanal(req.institucionId)); } catch(e){ next(e); } };