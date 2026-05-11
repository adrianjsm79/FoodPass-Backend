import * as svc from '../services/stock.service.js';
export const listarStock = async (req, res, next) => { try { res.json(await svc.listarStock(req.institucionId)); } catch(e){ next(e); } };
export const ajustar = async (req, res, next) => { try { res.status(201).json(await svc.ajustar({ ...req.body, institucion_id: req.institucionId, realizado_por: req.user.id }, req.io)); } catch(e){ next(e); } };
export const listarMovimientos = async (req, res, next) => { try { res.json(await svc.listarMovimientos({ ...req.query, institucion_id: req.institucionId })); } catch(e){ next(e); } };
export const movimientosPorProducto = async (req, res, next) => { try { res.json(await svc.listarMovimientos({ producto_id: req.params.productoId, institucion_id: req.institucionId })); } catch(e){ next(e); } };