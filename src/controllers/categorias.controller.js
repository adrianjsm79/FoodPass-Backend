import * as svc from '../services/categorias.service.js';
export const listar = async (req, res, next) => { try { res.json(await svc.listar(req.institucionId)); } catch(e){ next(e); } };
export const crear = async (req, res, next) => { try { res.status(201).json(await svc.crear(req.institucionId, req.body)); } catch(e){ next(e); } };
export const actualizar = async (req, res, next) => { try { res.json(await svc.actualizar(req.params.categoriaId, req.institucionId, req.body)); } catch(e){ next(e); } };
export const desactivar = async (req, res, next) => { try { res.json(await svc.desactivar(req.params.categoriaId, req.institucionId)); } catch(e){ next(e); } };