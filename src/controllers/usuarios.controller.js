import * as svc from '../services/usuarios.service.js';
import * as audit from '../services/audit.service.js';

export const listar = async (req, res, next) => { try { res.json(await svc.listar(req.institucionId)); } catch(e){ next(e); } };
export const obtener = async (req, res, next) => { try { res.json(await svc.obtener(req.params.usuarioId, req.institucionId)); } catch(e){ next(e); } };

export const agregarUsuario = async (req, res, next) => {
  try {
    const data = await svc.agregarUsuario({ ...req.body, institucion_id: req.institucionId });

    audit.registrar({
      institucion_id: req.institucionId,
      usuario_id: req.user?.id,
      usuario_nombre: req.user?.nombre_completo || 'Sistema',
      accion: 'USUARIO_CREADO',
      categoria: 'USUARIOS',
      descripcion: `Usuario creado: ${data.correo} (Rol: ${data.rol})`,
      metadata: { usuario_creado_id: data.id, rol: data.rol },
      ip: req.ip,
    }).catch(() => {});

    res.status(201).json(data);
  } catch(e) {
    next(e);
  }
};

export const actualizarRol = async (req, res, next) => {
  try {
    const data = await svc.actualizarRol(req.params.usuarioId, req.institucionId, req.body);

    audit.registrar({
      institucion_id: req.institucionId,
      usuario_id: req.user?.id,
      usuario_nombre: req.user?.nombre_completo || 'Sistema',
      accion: 'USUARIO_ROL_MODIFICADO',
      categoria: 'USUARIOS',
      descripcion: `Rol de usuario ${req.params.usuarioId.substring(0,8)} cambiado a ${req.body.rol}`,
      metadata: { usuario_modificado_id: req.params.usuarioId, nuevo_rol: req.body.rol },
      ip: req.ip,
    }).catch(() => {});

    res.json(data);
  } catch(e) {
    next(e);
  }
};

export const desactivar = async (req, res, next) => {
  try {
    const data = await svc.desactivar(req.params.usuarioId, req.institucionId);

    audit.registrar({
      institucion_id: req.institucionId,
      usuario_id: req.user?.id,
      usuario_nombre: req.user?.nombre_completo || 'Sistema',
      accion: 'USUARIO_DESACTIVADO',
      categoria: 'USUARIOS',
      descripcion: `Usuario ${req.params.usuarioId.substring(0,8)} ha sido desactivado/eliminado`,
      metadata: { usuario_modificado_id: req.params.usuarioId },
      ip: req.ip,
    }).catch(() => {});

    res.json(data);
  } catch(e) {
    next(e);
  }
};