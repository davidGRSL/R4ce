import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { testConnection } from './db/pool.js';
import authRoutes from './routes/authRoutes.js';

// Cargar variables de entorno
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Crear app Express
const app = express();
const httpServer = createServer(app);

// Socket.io con configuración CORS
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: [process.env.WEB_URL, process.env.MOBILE_URL],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

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

app.get('/api/v1/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`✓ Cliente conectado: ${socket.id}`);

  // User joins a group chat room
  socket.on('join_group', (groupId, userId) => {
    const room = `group_${groupId}`;
    socket.join(room);
    console.log(`  ${socket.id} unido a ${room}`);
    
    // Notificar al grupo que alguien se unió
    io.to(room).emit('user_joined', {
      userId,
      timestamp: new Date().toISOString(),
    });
  });

  // Manejar mensajes (los detalles de cifrado y DB se hacen en services)
  socket.on('message', (data) => {
    console.log(`  Mensaje en ${data.groupId}: ${data.content.substring(0, 50)}...`);
    const room = `group_${data.groupId}`;
    io.to(room).emit('message_received', data);
  });

  // User leaves a group
  socket.on('leave_group', (groupId) => {
    const room = `group_${groupId}`;
    socket.leave(room);
    console.log(`  ${socket.id} salió de ${room}`);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`✗ Cliente desconectado: ${socket.id}`);
  });

  // Error handling
  socket.on('error', (error) => {
    console.error(`Error en socket ${socket.id}:`, error);
  });
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
