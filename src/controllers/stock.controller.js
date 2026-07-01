import * as svc from '../services/stock.service.js';
import * as audit from '../services/audit.service.js';

export const listarStock = async (req, res, next) => { try { res.json(await svc.listarStock(req.institucionId)); } catch(e){ next(e); } };

export const ajustar = async (req, res, next) => {
  try {
    const data = await svc.ajustar({ ...req.body, institucion_id: req.institucionId, realizado_por: req.user.id }, req.io);

    audit.registrar({
      institucion_id: req.institucionId,
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre_completo || 'Sistema',
      accion: 'STOCK_AJUSTADO',
      categoria: 'PRODUCTOS',
      descripcion: `Ajuste de stock: ${req.body.cantidad} unidades (Motivo: ${req.body.motivo})`,
      metadata: { producto_id: req.body.producto_id, cantidad: req.body.cantidad, motivo: req.body.motivo },
      ip: req.ip,
    }).catch(() => {});

    res.status(201).json(data);
  } catch(e) {
    next(e);
  }
};

export const listarMovimientos = async (req, res, next) => { try { res.json(await svc.listarMovimientos({ ...req.query, institucion_id: req.institucionId })); } catch(e){ next(e); } };
export const movimientosPorProducto = async (req, res, next) => { try { res.json(await svc.listarMovimientos({ producto_id: req.params.productoId, institucion_id: req.institucionId })); } catch(e){ next(e); } };