import * as svc from '../services/notificaciones.service.js';
export const listar = async (req, res, next) => { try { res.json(await svc.listar(req.user.id, req.query)); } catch(e){ next(e); } };
export const marcarLeida = async (req, res, next) => { try { res.json(await svc.marcarLeida(req.params.notificacionId, req.user.id)); } catch(e){ next(e); } };
export const marcarTodasLeidas = async (req, res, next) => { try { res.json(await svc.marcarTodasLeidas(req.user.id)); } catch(e){ next(e); } };