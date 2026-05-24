import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { initSocket } from './src/config/socket.js';
import { testConnection } from './src/config/db.js';
import pool from './src/config/db.js';
import { router as apiRouter } from './src/routes/index.js';
import { errorHandler } from './src/middlewares/error.middleware.js';
import { startExpireTicketsJob } from './src/jobs/expireTickets.job.js';

const app = express();
const httpServer = createServer(app);

// Socket.IO
const io = initSocket(httpServer);

// Adjuntar instancia de io a cada request para usarla en controllers/services
app.use((req, _res, next) => {
  req.io = io;
  next();
});

// Middlewares globales
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' })); // ← limit para aceptar imágenes base64

// Rutas
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));
app.use('/api', apiRouter);

// Manejador de errores global
app.use(errorHandler);

// Arranque del servidor
const PORT = process.env.PORT;

async function start() {
  await testConnection();

  // Keep-alive: evita que Render corte el pool por inactividad
  setInterval(async () => {
    try {
      await pool.query('SELECT 1');
      console.log('🔄 Keep-alive DB OK');
    } catch (e) {
      console.warn('⚠️ Keep-alive falló:', e.message);
    }
  }, 4 * 60 * 1000); // cada 4 minutos

  startExpireTicketsJob(io);
  httpServer.listen(PORT, () => {
    console.log(`Backend corriendo en el puerto ${PORT}`);
  });
}

start();