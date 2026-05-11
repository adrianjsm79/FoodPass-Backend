import * as svc from '../services/usuarios.service.js';
export const listar = async (req, res, next) => { try { res.json(await svc.listar(req.institucionId)); } catch(e){ next(e); } };
export const obtener = async (req, res, next) => { try { res.json(await svc.obtener(req.params.usuarioId, req.institucionId)); } catch(e){ next(e); } };
export const agregarUsuario = async (req, res, next) => { try { res.status(201).json(await svc.agregarUsuario({ ...req.body, institucion_id: req.institucionId })); } catch(e){ next(e); } };
export const actualizarRol = async (req, res, next) => { try { res.json(await svc.actualizarRol(req.params.usuarioId, req.institucionId, req.body)); } catch(e){ next(e); } };
export const desactivar = async (req, res, next) => { try { res.json(await svc.desactivar(req.params.usuarioId, req.institucionId)); } catch(e){ next(e); } };