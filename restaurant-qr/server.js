const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const ExcelJS = require('exceljs');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Config
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb+srv://gacool2k6_db_user:h3kL0DjqVhfCm4d3@cluster0.j0ynlz1.mongodb.net/?appName=Cluster0';
const DB_NAME = process.env.DB_NAME || 'restaurant_qr';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// In-memory sessions
const sessions = {};

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB
let db, client;

async function connectDB() {
  const maxRetries = 5;
  let retries = 0;
  while (retries < maxRetries) {
    try {
      client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 45000 });
      await client.connect();
      db = client.db(DB_NAME);
      await db.collection('orders').createIndex({ created_at: -1 });
      await db.collection('orders').createIndex({ table_id: 1 });
      await db.collection('orders').createIndex({ payment_status: 1 });
      await db.collection('categories').createIndex({ display_order: 1 });
      await db.collection('menu_items').createIndex({ display_order: 1 });
      console.log('✅ MongoDB connected - DB:', DB_NAME);
      await seedDataIfEmpty();
      await ensureAdminUser();
      
      // Cleanup old data (40 days retention)
      await cleanupOldData();
      setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
      
      return true;
    } catch (err) {
      retries++;
      console.log(`⚠️ MongoDB retry ${retries}/${maxRetries}: ${err.message}`);
      if (retries >= maxRetries) { db = null; return false; }
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  return false;
}
connectDB();

// Delete orders older than 40 days to save space
async function cleanupOldData() {
  if (!db) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 40);
  try {
    const result = await db.collection('orders').deleteMany({ created_at: { $lt: cutoff } });
    if (result.deletedCount > 0) {
      console.log(`   🧹 Cleanup: Deleted ${result.deletedCount} orders older than 40 days`);
    }
  } catch(e) { console.error('   ⚠️ Cleanup error:', e.message); }
}

// Seed data
async function seedDataIfEmpty() {
  try {
    const count = await db.collection('menu_items').countDocuments();
    if (count > 0) { console.log(`   📋 ${count} menu items`); return; }
    console.log('   🌱 Seeding...');
    const cats = [
      { name: 'Bánh mì', display_order: 1 },
      { name: 'Nước uống', display_order: 2 },
      { name: 'Combo', display_order: 3 }
    ];
    await db.collection('categories').insertMany(cats);
    const items = [
      { name: 'Bánh mì chả cá', price: 25000, category_id: 'Bánh mì', description: '', image: '/menu/banhmichaca.jpg', display_order: 1 },
      { name: 'Bánh mì pate', price: 20000, category_id: 'Bánh mì', description: '', image: '/menu/banhmicalua.jpg', display_order: 2 },
      { name: 'Bánh mì xá xíu', price: 30000, category_id: 'Bánh mì', description: '', image: '/menu/banhmidacbiet.jpg', display_order: 3 },
      { name: 'Bánh mì trứng', price: 18000, category_id: 'Bánh mì', description: '', image: '/menu/banhmichatrung.jpg', display_order: 4 },
      { name: 'Cà phê sữa đá', price: 20000, category_id: 'Nước uống', description: '', image: '', display_order: 5 },
      { name: 'Trà đá', price: 15000, category_id: 'Nước uống', description: '', image: '', display_order: 6 },
      { name: 'Nước cam', price: 25000, category_id: 'Nước uống', description: '', image: '', display_order: 7 },
      { name: 'Combo 1', price: 45000, category_id: 'Combo', description: 'Bánh mì + Nước', image: '', display_order: 8 },
      { name: 'Combo 2', price: 55000, category_id: 'Combo', description: 'Bánh mì + Trà', image: '', display_order: 9 }
    ];
    await db.collection('menu_items').insertMany(items);
    console.log('   ✅ Seeded 9 items');
  } catch (err) { console.log('   ⚠️ Seed error:', err.message); }
}

// Ensure admin user
async function ensureAdminUser() {
  try {
    const existing = await db.collection('admin_users').findOne({ username: 'admin' });
    if (!existing) {
      const hash = await bcrypt.hash('admin123', 10);
      await db.collection('admin_users').insertOne({ username: 'admin', password: hash, role: 'admin', created_at: new Date() });
      console.log('   🔑 Admin user created (admin/admin123)');
    } else if (!existing.role) {
      await db.collection('admin_users').updateOne({ username: 'admin' }, { $set: { role: 'admin' } });
    }
    
    const existingStaff = await db.collection('admin_users').findOne({ username: 'staff' });
    if (!existingStaff) {
      const hash = await bcrypt.hash('staff123', 10);
      await db.collection('admin_users').insertOne({ username: 'staff', password: hash, role: 'staff', created_at: new Date() });
      console.log('   🔑 Staff user created (staff/staff123)');
    }
  } catch (err) { console.log('   ⚠️ Admin user error:', err.message); }
}

// Generate short order ID
async function generateShortId() {
  try {
    const result = await db.collection('counters').findOneAndUpdate(
      { _id: 'order_id' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    const num = result.seq || result.value?.seq || 1;
    return 'ORD' + String(num).padStart(4, '0');
  } catch (err) {
    return 'ORD' + Math.floor(1000 + Math.random() * 9000);
  }
}

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token || !sessions[token]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.adminUser = sessions[token];
  next();
}

// ==================== AUTH API ====================

app.post('/api/auth/login', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  try {
    const user = await db.collection('admin_users').findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    sessions[token] = { username: user.username, id: user._id.toString(), role: user.role || 'admin' };
    res.json({ success: true, token, username: user.username, role: user.role || 'admin' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/check', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token && sessions[token]) {
    res.json({ authenticated: true, username: sessions[token].username, role: sessions[token].role });
  } else {
    res.json({ authenticated: false });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) delete sessions[token];
  res.json({ success: true });
});

// ==================== MENU API ====================

app.get('/api/menu', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const categories = await db.collection('categories').find({ is_hidden: { $ne: true } }).sort({ display_order: 1 }).toArray();
    const items = await db.collection('menu_items').find({ is_hidden: { $ne: true } }).sort({ display_order: 1 }).toArray();
    // Convert ObjectId to string
    const cats = categories.map(c => ({ ...c, _id: c._id.toString() }));
    const its = items.map(i => ({ ...i, _id: i._id.toString() }));
    res.json({ categories: cats, items: its });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get all menu items for admin (including hidden)
app.get('/api/menu/all', authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const items = await db.collection('menu_items').find({}).sort({ display_order: 1 }).toArray();
    const result = items.map(i => ({ ...i, _id: i._id.toString() }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/categories', authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  const { name, display_order } = req.body;
  try {
    const result = await db.collection('categories').insertOne({ name, display_order: display_order || 0, is_hidden: false, created_at: new Date() });
    res.json({ success: true, category_id: result.insertedId.toString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Upload image (stores in MongoDB as base64)
app.post('/api/upload', authMiddleware, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image data' });
    }
    // Store image in a separate collection to keep menu_items lightweight
    const result = await db.collection('images').insertOne({
      data: image,
      created_at: new Date()
    });
    const imageUrl = `/api/images/${result.insertedId.toString()}`;
    res.json({ success: true, url: imageUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Serve uploaded images
app.get('/api/images/:id', async (req, res) => {
  try {
    const img = await db.collection('images').findOne({ _id: new ObjectId(req.params.id) });
    if (!img) return res.status(404).json({ error: 'Image not found' });
    // Parse data URI: data:image/jpeg;base64,XXXX
    const matches = img.data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Invalid image format' });
    const ext = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    res.set('Content-Type', `image/${ext}`);
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Add menu item (POST /api/menu)
app.post('/api/menu', authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  const { name, price, category, category_id, description, image } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Missing name or price' });
  try {
    const maxOrder = await db.collection('menu_items').find().sort({ display_order: -1 }).limit(1).toArray();
    const nextOrder = (maxOrder[0]?.display_order || 0) + 1;
    const item = {
      name, price: parseFloat(price),
      category_id: category_id || category || 'Khác',
      description: description || '', image: image || '',
      display_order: nextOrder, is_hidden: false, created_at: new Date()
    };
    const result = await db.collection('menu_items').insertOne(item);
    io.emit('menu-updated', {});
    res.json({ success: true, item_id: result.insertedId.toString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Also support POST /api/menu-items
app.post('/api/menu-items', authMiddleware, async (req, res) => {
  req.body.category = req.body.category_id;
  return app.handle(Object.assign(req, { url: '/api/menu', method: 'POST' }), res);
});

// Toggle menu item visibility
app.put('/api/menu/:id/toggle', authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const item = await db.collection('menu_items').findOne({ _id: new ObjectId(req.params.id) });
    if (!item) return res.status(404).json({ error: 'Not found' });
    await db.collection('menu_items').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { is_hidden: !item.is_hidden } });
    io.emit('menu-updated', {});
    res.json({ success: true, is_hidden: !item.is_hidden });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete menu item
app.delete('/api/menu/:id', authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    await db.collection('menu_items').deleteOne({ _id: new ObjectId(req.params.id) });
    io.emit('menu-updated', {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== ORDERS API ====================

app.post('/api/orders', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  const { table_id, items, notes, customer_name } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Missing items' });
  try {
    const shortId = await generateShortId();
    let total = 0;
    const orderItems = items.map(item => {
      total += item.price * item.quantity;
      return { menu_item_id: item.id || item.menu_item_id, name: item.name, price: item.price, quantity: item.quantity, subtotal: item.price * item.quantity };
    });
    const order = {
      short_id: shortId,
      table_id: String(table_id || 'takeaway'),
      customer_name: customer_name || '',
      items: orderItems, notes: notes || '',
      total, payment_status: 'unpaid',
      created_at: new Date(), updated_at: new Date()
    };
    const result = await db.collection('orders').insertOne(order);
    const orderData = { ...order, _id: result.insertedId.toString() };
    io.emit('new-order', orderData);
    res.json({ success: true, order_id: shortId, _id: result.insertedId.toString(), total });
  } catch (err) { console.error('Error creating order:', err); res.status(500).json({ error: err.message }); }
});

app.get('/api/orders', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const ps = req.query.payment_status;
    let query = {};
    if (ps && ps !== 'all') query.payment_status = ps;
    const orders = await db.collection('orders').find(query).sort({ created_at: -1 }).limit(200).toArray();
    res.json(orders.map(o => ({ ...o, _id: o._id.toString() })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/orders/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    if (!order) return res.status(404).json({ error: 'Not found' });
    res.json({ ...order, _id: order._id.toString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Checkout (mark as paid)
app.post('/api/orders/:id/checkout', authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const result = await db.collection('orders').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { payment_status: 'paid', updated_at: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Not found' });
    io.emit('order-updated', { _id: req.params.id, payment_status: 'paid' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/orders/:id', authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  const { payment_status } = req.body;
  try {
    const updateData = { updated_at: new Date() };
    if (payment_status) updateData.payment_status = payment_status;
    const result = await db.collection('orders').updateOne({ _id: new ObjectId(req.params.id) }, { $set: updateData });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Not found' });
    io.emit('order-updated', { _id: req.params.id, payment_status });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/orders/:id', authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  if (req.adminUser.role === 'staff') return res.status(403).json({ error: 'Staff cannot delete orders' });
  try {
    const result = await db.collection('orders').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
    io.emit('order-deleted', { _id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/orders/:id/cancel', authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'Vui lòng chọn lý do hủy đơn.' });
  try {
    const result = await db.collection('orders').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { payment_status: 'cancelled', cancellation_reason: reason, updated_at: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Not found' });
    io.emit('order-updated', { _id: req.params.id, payment_status: 'cancelled', cancellation_reason: reason });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== QR API ====================

app.get('/api/qr/takeaway', async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const url = `${protocol}://${host}/customer?table=takeaway`;
    const qr = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });
    res.json({ qr, url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/qr/:tableId', async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const url = `${protocol}://${host}/customer?table=${encodeURIComponent(req.params.tableId)}`;
    const qr = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });
    res.json({ qr, url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== HISTORY & STATS ====================

app.get('/api/history', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const { from, to, q, filter } = req.query;
    
    // Default limit to 40 days to save memory/data
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 40);
    let query = { created_at: { $gte: cutoff } };
    
    if (from || to) {
      query.created_at = {};
      if (from) {
        const fromDate = new Date(from + 'T00:00:00');
        query.created_at.$gte = fromDate > cutoff ? fromDate : cutoff;
      } else {
        query.created_at.$gte = cutoff;
      }
      if (to) { const end = new Date(to + 'T23:59:59.999'); query.created_at.$lte = end; }
    } else if (filter && filter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (filter === 'today') query.created_at = { $gte: today };
      else if (filter === 'week') { const d = new Date(today); d.setDate(d.getDate()-7); query.created_at = { $gte: d }; }
      else if (filter === 'month') { const d = new Date(today); d.setMonth(d.getMonth()-1); query.created_at = { $gte: d > cutoff ? d : cutoff }; }
    }
    
    if (q) {
      query.$or = [
        { short_id: { $regex: q, $options: 'i' } },
        { customer_name: { $regex: q, $options: 'i' } }
      ];
    }
    const orders = await db.collection('orders').find(query).sort({ created_at: -1 }).limit(500).toArray();
    res.json(orders.map(o => ({ ...o, _id: o._id.toString() })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stats', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const [todayOrders, unpaidOrders, paidToday, revenueToday] = await Promise.all([
      db.collection('orders').countDocuments({ created_at: { $gte: today } }),
      db.collection('orders').countDocuments({ payment_status: 'unpaid' }),
      db.collection('orders').countDocuments({ payment_status: 'paid', created_at: { $gte: today } }),
      db.collection('orders').aggregate([
        { $match: { payment_status: 'paid', created_at: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]).toArray()
    ]);
    res.json({ today_total: todayOrders, unpaid: unpaidOrders, paid_today: paidToday, revenue_today: revenueToday[0]?.total || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== EXPORT EXCEL ====================

app.get('/api/export/excel', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const { start_date, end_date, from, to } = req.query;
    
    // Default limit to 40 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 40);
    let query = { created_at: { $gte: cutoff } };
    
    const sd = start_date || from, ed = end_date || to;
    if (sd || ed) {
      query.created_at = {};
      if (sd) {
        const fromDate = new Date(sd + 'T00:00:00');
        query.created_at.$gte = fromDate > cutoff ? fromDate : cutoff;
      } else {
        query.created_at.$gte = cutoff;
      }
      if (ed) { const end = new Date(ed + 'T23:59:59.999'); query.created_at.$lte = end; }
    }
    
    const orders = await db.collection('orders').find(query).sort({ created_at: -1 }).toArray();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Restaurant QR System';
    const sheet1 = workbook.addWorksheet('Đơn hàng');
    sheet1.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Mã đơn', key: 'short_id', width: 14 },
      { header: 'Ngày tạo', key: 'created_at', width: 18 },
      { header: 'Tổng tiền', key: 'total', width: 15 },
      { header: 'Trạng thái', key: 'payment_status', width: 18 },
      { header: 'Ghi chú', key: 'notes', width: 30 }
    ];
    sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    sheet1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
    let stt = 1, totalRevenue = 0;
    const dateOptions = { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    
    orders.forEach(order => {
      let ps = 'Chưa thanh toán';
      if (order.payment_status === 'paid') ps = 'Đã thanh toán';
      if (order.payment_status === 'cancelled') ps = 'Đã hủy';
      
      if (order.payment_status === 'paid') totalRevenue += order.total || 0;
      sheet1.addRow({ 
        stt: stt++, 
        short_id: order.short_id || order._id.toString().slice(-6), 
        created_at: order.created_at ? new Date(order.created_at).toLocaleString('vi-VN', dateOptions) : '', 
        total: order.total || 0, 
        payment_status: ps, 
        notes: order.notes || '' 
      });
    });
    sheet1.addRow({});
    sheet1.addRow({ stt: '', short_id: 'TỔNG DOANH THU', total: totalRevenue });
    sheet1.getRow(sheet1.rowCount).font = { bold: true };
    sheet1.getColumn(4).numFmt = '#,##0';
    const fileName = `bao-cao-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('join-kitchen', () => socket.join('kitchen'));
  socket.on('join-admin', () => socket.join('admin'));
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// ==================== ROUTES ====================

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));
app.get('/customer', (req, res) => res.sendFile(path.join(__dirname, 'public/customer/index.html')));
app.get('/', (req, res) => res.redirect('/admin'));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error('Server error:', err); res.status(500).json({ error: 'Internal server error' }); });

// ==================== START ====================

server.listen(PORT, () => {
  console.log('========================================');
  console.log(`🍽️  Restaurant QR System v2.0`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   MongoDB: ${db ? '✅' : '⏳'}`);
  console.log('========================================');
});

process.on('SIGTERM', async () => { if (client) await client.close(); process.exit(0); });
process.on('SIGINT', async () => { if (client) await client.close(); process.exit(0); });
