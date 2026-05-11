import * as svc from '../services/productos.service.js';
export const listar = async (req, res, next) => { try { res.json(await svc.listar(req.institucionId, req.query)); } catch(e){ next(e); } };
export const obtener = async (req, res, next) => { try { res.json(await svc.obtener(req.params.productoId, req.institucionId)); } catch(e){ next(e); } };
export const crear = async (req, res, next) => { try { res.status(201).json(await svc.crear(req.institucionId, req.body)); } catch(e){ next(e); } };
export const actualizar = async (req, res, next) => { try { res.json(await svc.actualizar(req.params.productoId, req.institucionId, req.body)); } catch(e){ next(e); } };
export const desactivar = async (req, res, next) => { try { res.json(await svc.desactivar(req.params.productoId, req.institucionId)); } catch(e){ next(e); } };