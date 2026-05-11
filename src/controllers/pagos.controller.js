import * as svc from '../services/pagos.service.js';
export const registrar = async (req, res, next) => { try { res.status(201).json(await svc.registrar({ ...req.body, institucion_id: req.institucionId })); } catch(e){ next(e); } };
export const listar = async (req, res, next) => { try { res.json(await svc.listar({ ...req.query, institucion_id: req.institucionId })); } catch(e){ next(e); } };
export const obtener = async (req, res, next) => { try { res.json(await svc.obtener(req.params.pagoId, req.institucionId)); } catch(e){ next(e); } };