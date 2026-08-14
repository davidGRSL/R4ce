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
import notificationRoutes from './routes/notificationRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { initSocket } from './socket.js';
import { query } from './db/pool.js';
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

// Orígenes permitidos (CORS). Además de WEB_URL/MOBILE_URL (que admiten
// varios valores separados por comas), se permiten siempre los orígenes de
// la app nativa Capacitor: Android usa https://localhost y iOS
// capacitor://localhost. Las peticiones sin Origin (curl, apps nativas que
// no lo envían) también pasan.
const allowedOrigins = [
  ...(process.env.WEB_URL || '').split(','),
  ...(process.env.MOBILE_URL || '').split(','),
  'https://localhost',
  'capacitor://localhost',
  'http://localhost',
].map((o) => o.trim()).filter(Boolean);

// Middleware de seguridad y parseo
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`Origen no permitido por CORS: ${origin}`));
  },
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
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/admin', adminRoutes);
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

  // Bootstrap de administradores: los usernames de ADMIN_USERNAMES
  // reciben rol admin al arrancar (para el primer admin; después se
  // gestionan desde el panel /admin).
  const adminNames = (process.env.ADMIN_USERNAMES || '')
    .split(',').map((u) => u.trim()).filter(Boolean);
  if (adminNames.length > 0) {
    try {
      const result = await query(
        `UPDATE users SET role = 'admin' WHERE username = ANY($1) AND role <> 'admin' RETURNING username`,
        [adminNames]
      );
      if (result.rows.length > 0) {
        console.log(`   Admins promovidos: ${result.rows.map((r) => r.username).join(', ')}`);
      }
    } catch (err) {
      console.error('   [admin bootstrap] falló:', err.message);
    }
  }
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
