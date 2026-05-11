import * as svc from '../services/instituciones.service.js';
export const listar = async (req, res, next) => { try { res.json(await svc.listar()); } catch(e){ next(e); } };
export const crear = async (req, res, next) => { try { res.status(201).json(await svc.crear(req.body)); } catch(e){ next(e); } };
export const obtener = async (req, res, next) => { try { res.json(await svc.obtener(req.params.institucionId)); } catch(e){ next(e); } };
export const actualizar = async (req, res, next) => { try { res.json(await svc.actualizar(req.params.institucionId, req.body)); } catch(e){ next(e); } };
export const obtenerConfig = async (req, res, next) => { try { res.json(await svc.obtenerConfig(req.params.institucionId)); } catch(e){ next(e); } };
export const actualizarConfig = async (req, res, next) => { try { res.json(await svc.actualizarConfig(req.params.institucionId, req.body)); } catch(e){ next(e); } };
export const listarMetodosPago = async (req, res, next) => { try { res.json(await svc.listarMetodosPago()); } catch(e){ next(e); } };