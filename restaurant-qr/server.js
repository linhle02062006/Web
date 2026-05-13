/**
 * Restaurant QR Order System - Server Entry Point
 * v3.0 Production-ready refactored version
 * 
 * Architecture:
 *   src/config/       - Configuration
 *   src/database/     - DB connection & seeding
 *   src/middleware/    - Auth & validation middleware
 *   src/services/     - Business logic
 *   src/routes/       - HTTP route handlers
 *   src/utils/        - Utility helpers
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const config = require('./src/config');
const { connectDB, closeDB } = require('./src/database/connection');
const { seedDataIfEmpty, ensureAdminUser, cleanupOldData } = require('./src/database/seed');

// Routes
const authRoutes = require('./src/routes/auth');
const menuRoutes = require('./src/routes/menu');
const orderRoutes = require('./src/routes/orders');
const miscRoutes = require('./src/routes/misc');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Inject io into requests so routes can emit events
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ==================== API ROUTES ====================
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', miscRoutes);

// ==================== PAGE ROUTES ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/order', (req, res) => res.sendFile(path.join(__dirname, 'public/customer/index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));
app.get('/customer', (req, res) => res.sendFile(path.join(__dirname, 'public/customer/index.html')));
app.get('/invoice', (req, res) => res.sendFile(path.join(__dirname, 'public/invoice/index.html')));

// ==================== ERROR HANDLING ====================
app.use((req, res) => res.status(404).json({ success: false, error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('join-kitchen', () => socket.join('kitchen'));
  socket.on('join-admin', () => socket.join('admin'));
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// ==================== STARTUP ====================
async function start() {
  const dbConnected = await connectDB();
  
  if (dbConnected) {
    await seedDataIfEmpty();
    await ensureAdminUser();
    await cleanupOldData();
    setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
  }

  server.listen(config.PORT, () => {
    console.log('========================================');
    console.log(`🍽️  Restaurant QR System v3.0`);
    console.log(`   http://localhost:${config.PORT}`);
    console.log(`   MongoDB: ${dbConnected ? '✅' : '⏳'}`);
    console.log(`   Architecture: Modular (routes/services/middleware)`);
    console.log('========================================');
  });
}

start();

// Graceful shutdown
process.on('SIGTERM', async () => { await closeDB(); process.exit(0); });
process.on('SIGINT', async () => { await closeDB(); process.exit(0); });
