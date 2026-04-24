const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { MongoClient } = require('mongodb');

// Cấu hình
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'restaurant_qr';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB
let db;
const client = new MongoClient(MONGO_URI);

async function connectDB() {
  try {
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ Kết nối MongoDB thành công');
    
    // Tạo indexes
    await db.collection('orders').createIndex({ created_at: -1 });
    await db.collection('orders').createIndex({ table_id: 1 });
  } catch (err) {
    console.log('⚠️ MongoDB not available:', err.message);
    db = null;
  }
}
connectDB();

// API: Lấy menu
app.get('/api/menu', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const categories = await db.collection('categories').find({ is_hidden: { $ne: true } }).sort({ display_order: 1 }).toArray();
    const items = await db.collection('menu_items').find({ is_hidden: { $ne: true } }).sort({ display_order: 1 }).toArray();
    res.json({ categories, items });
  } catch (err) {
    res.json({ categories: [], items: [] });
  }
});

// API: Tạo đơn hàng
app.post('/api/orders', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  const { table_id, items, notes } = req.body;
  try {
    const order = {
      table_id,
      items,
      notes: notes || '',
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date()
    };
    const result = await db.collection('orders').insertOne(order);
    const orderId = result.insertedId;
    io.emit('new-order', { order_id: orderId, table_id, items, notes, status: 'pending' });
    res.json({ success: true, order_id: orderId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Lấy đơn hàng
app.get('/api/orders', async (req, res) => {
  if (!db) return res.json([]);
  try {
    const orders = await db.collection('orders').find().sort({ created_at: -1 }).limit(50).toArray();
    res.json(orders);
  } catch (err) {
    res.json([]);
  }
});

// API: Cập nhật trạng thái đơn
app.patch('/api/orders/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  const { status } = req.body;
  try {
    const { ObjectId } = require('mongodb');
    await db.collection('orders').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status, updated_at: new Date() } }
    );
    io.emit('order-updated', { order_id: req.params.id, status });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Lịch sử
app.get('/api/history', async (req, res) => {
  if (!db) return res.json([]);
  try {
    const filter = req.query.filter || 'all';
    let query = {};
    if (filter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = { created_at: { $gte: today } };
    } else if (filter === 'completed') {
      query = { status: 'completed' };
    }
    const orders = await db.collection('orders').find(query).sort({ created_at: -1 }).limit(100).toArray();
    res.json(orders);
  } catch (err) {
    res.json([]);
  }
});

// Socket.io
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// Serve SPA
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));
app.get('/kitchen', (req, res) => res.sendFile(path.join(__dirname, 'public/kitchen/index.html')));
app.get('/customer', (req, res) => res.sendFile(path.join(__dirname, 'public/customer/index.html')));
app.get('/', (req, res) => res.redirect('/admin'));

// Start server
server.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
