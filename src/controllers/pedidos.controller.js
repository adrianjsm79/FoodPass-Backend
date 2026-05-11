import * as pedidosService from '../services/pedidos.service.js';

export async function crear(req, res, next) {
  try {
    const { items, modalidad_pago } = req.body;
    const canal = req.body.canal || (req.user ? 'APP' : 'POS');

    const pedido = await pedidosService.crearPedido(
      {
        institucion_id: req.institucionId,
        usuario_id: req.body.usuario_id || req.user?.id || null,
        cajero_id: canal === 'POS' ? req.user?.id : null,
        canal,
        modalidad_pago: modalidad_pago || req.userModalidadPago || 'PREPAGO',
        items,
      },
      req.io
    );
    res.status(201).json(pedido);
  } catch (err) { next(err); }
}

export async function listar(req, res, next) {
  try {
    const { desde, hasta, estado, usuario_id, canal, limit, offset } = req.query;
    const pedidos = await pedidosService.listarPedidos({
      institucion_id: req.institucionId,
      desde, hasta, estado, usuario_id, canal,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
    });
    res.json(pedidos);
  } catch (err) { next(err); }
}

export async function obtener(req, res, next) {
  try {
    const pedido = await pedidosService.obtenerPedido(req.params.pedidoId, req.institucionId);
    res.json(pedido);
  } catch (err) { next(err); }
}

export async function cancelar(req, res, next) {
  try {
    const resultado = await pedidosService.cancelarPedido(req.params.pedidoId, req.institucionId, req.user.id);
    res.json(resultado);
  } catch (err) { next(err); }
}