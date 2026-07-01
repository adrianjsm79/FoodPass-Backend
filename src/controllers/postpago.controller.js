import * as svc from '../services/postpago.service.js';
import * as audit from '../services/audit.service.js';
export const listarCuentas = async (req, res, next) => { try { res.json(await svc.listarCuentas(req.institucionId)); } catch(e){ next(e); } };
export const crearCuenta = async (req, res, next) => { try { res.status(201).json(await svc.crearCuenta({ ...req.body, institucion_id: req.institucionId })); } catch(e){ next(e); } };
export const obtenerCuenta = async (req, res, next) => { try { res.json(await svc.obtenerCuenta(req.params.usuarioId, req.institucionId)); } catch(e){ next(e); } };
export const actualizarLimite = async (req, res, next) => { try { res.json(await svc.actualizarLimite(req.params.usuarioId, req.institucionId, req.body.limite_credito)); } catch(e){ next(e); } };
export const abonar = async (req, res, next) => {
  try {
    const data = await svc.abonar({ ...req.body, usuario_id: req.params.usuarioId, institucion_id: req.institucionId, realizado_por: req.user.id }, req.io);

    audit.registrar({
      institucion_id: req.institucionId,
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre_completo || 'Sistema',
      accion: 'ABONO_POSTPAGO',
      categoria: 'POSTPAGO',
      descripcion: `Abono de S/. ${parseFloat(req.body.monto).toFixed(2)} registrado a cuenta del usuario ID: ${req.params.usuarioId.substring(0,8)}`,
      metadata: { cuenta_id: data.cuenta_postpago_id, monto: parseFloat(req.body.monto) },
      ip: req.ip,
    }).catch(() => {});

    res.status(201).json(data);
  } catch(e) {
    next(e);
  }
};
export const listarTransacciones = async (req, res, next) => { try { res.json(await svc.listarTransacciones({ ...req.query, institucion_id: req.institucionId })); } catch(e){ next(e); } };