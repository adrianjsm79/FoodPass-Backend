import * as ticketsService from '../services/tickets.service.js';

export async function canjear(req, res, next) {
  try {
    const resultado = await ticketsService.canjearTicket(
      req.params.codigo,
      req.institucionId,
      req.user.id,
      req.io
    );
    res.json(resultado);
  } catch (err) { next(err); }
}

export async function buscarPorCodigo(req, res, next) {
  try {
    const ticket = await ticketsService.buscarPorCodigo(req.params.codigo, req.institucionId);
    res.json(ticket);
  } catch (err) { next(err); }
}

export async function obtener(req, res, next) {
  try {
    const ticket = await ticketsService.obtenerTicket(req.params.ticketId, req.institucionId);
    res.json(ticket);
  } catch (err) { next(err); }
}

export async function listar(req, res, next) {
  try {
    const { estado, desde, hasta, usuario_id, limit, offset } = req.query;
    const tickets = await ticketsService.listarTickets({
      institucion_id: req.institucionId,
      estado, desde, hasta, usuario_id,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
    });
    res.json(tickets);
  } catch (err) { next(err); }
}