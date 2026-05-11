import { Server } from 'socket.io';

let io;

/**
 * Inicializa Socket.IO.
 * Cada institución tiene su propia "room": `institucion:<uuid>`
 * Los clientes (dashboard/app) hacen join a la room de su institución
 * para recibir solo los eventos que les corresponden.
 */
export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Cliente conectado: ${socket.id}`);

    // El cliente envía el institucion_id para unirse a la room correcta
    socket.on('join:institucion', (institucionId) => {
      if (!institucionId) return;
      socket.join(`institucion:${institucionId}`);
      console.log(`   Socket ${socket.id} → room: institucion:${institucionId}`);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Cliente desconectado: ${socket.id}`);
    });
  });

  return io;
}

/**
 * Devuelve la instancia de io ya inicializada.
 * Útil en services que no tienen acceso a req.io.
 */
export function getIO() {
  if (!io) throw new Error('Socket.IO no inicializado');
  return io;
}

// Eventos emitidos desde el backend
// Los nombres están centralizados aquí para evitar typos.
export const SOCKET_EVENTS = {
  NUEVA_VENTA: 'nueva_venta',
  TICKET_CANJEADO: 'ticket_canjeado',
  TICKET_EXPIRADO: 'ticket_expirado',
  STOCK_ACTUALIZADO: 'stock_actualizado',
  NUEVA_DEUDA: 'nueva_deuda',
  ABONO_REGISTRADO: 'abono_registrado',
};