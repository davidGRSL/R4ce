import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { testConnection } from './db/pool.js';
import authRoutes from './routes/authRoutes.js';
import stageRoutes from './routes/stageRoutes.js';
import timeRoutes from './routes/timeRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import vehicleRoutes from './routes/vehicleRoutes.js';
import { initSocket } from './socket.js';
// Cargar variables de entorno
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Crear app Express
const app = express();
const httpServer = createServer(app);

// Detrás del proxy de Vite (dev) o un reverse proxy (prod): req.ip debe ser
// la IP real del cliente (X-Forwarded-For), no la del proxy. Lo usa el
// rate limiting. Nivel 1 = confiar solo en el primer proxy.
app.set('trust proxy', 1);

// Socket.io (auth JWT + rooms de grupo) — ver src/socket.js
const io = initSocket(httpServer);

// Middleware de seguridad y parseo
app.use(helmet());
app.use(cors({
  origin: [process.env.WEB_URL, process.env.MOBILE_URL],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de logging simple (desarrollo)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// Archivos subidos (fotos de perfil, coches y modelos 3D — driver local)
app.use('/uploads', express.static(process.env.UPLOAD_DIR || '/app/uploads', {
  maxAge: '7d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.glb')) res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/stages', stageRoutes);
app.use('/api/v1/times', timeRoutes);
app.use('/api/v1/groups', groupRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/vehicles', vehicleRoutes);
app.get('/api/v1/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      status: err.status || 500,
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Not found',
      status: 404,
    },
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n🚀 Rally App Backend`);
  console.log(`   Escuchando en http://0.0.0.0:${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV}`);
  console.log(`   WebSocket activo en wss://localhost:${PORT}/socket.io`);
  console.log('');
  await testConnection();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM recibido, cerrando servidor...');
  httpServer.close(() => {
    console.log('Servidor cerrado');
    process.exit(0);
  });
});

export { app, io, httpServer };
