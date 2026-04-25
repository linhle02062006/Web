const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const ExcelJS = require('exceljs');

// Cấu hình từ environment variables
const PORT = process.env.PORT || 3000;
// Ưu tiên: MONGODB_URI (Render) -> MONGO_URI -> default
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb+srv://gacool2k6_db_user:h3kL0DjqVhfCm4d3@cluster0.j0ynlz1.mongodb.net/?appName=Cluster0';
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
let client;

async function connectDB() {
  const maxRetries = 5;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      client = new MongoClient(MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      
      await client.connect();
      db = client.db(DB_NAME);
      
      // Tạo indexes để tối ưu query
      await db.collection('orders').createIndex({ created_at: -1 });
      await db.collection('orders').createIndex({ table_id: 1 });
      await db.collection('orders').createIndex({ status: 1 });
      await db.collection('categories').createIndex({ display_order: 1 });
      await db.collection('menu_items').createIndex({ display_order: 1 });
      
      console.log('✅ Kết nối MongoDB thành công');
      console.log(`   Database: ${DB_NAME}`);
      console.log(`   URI: ${MONGO_URI.replace(/\/\/.*:.*@/, '//****:****@')}`);
      
      // Seed data nếu database trống
      await seedDataIfEmpty();
      
      return true;
    } catch (err) {
      retries++;
      console.log(`⚠️ Kết nối MongoDB thất bại (lần ${retries}/${maxRetries}): ${err.message}`);
      if (retries >= maxRetries) {
        console.log('❌ Không thể kết nối MongoDB sau nhiều lần thử');
        db = null;
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  return false;
}

// Khởi động kết nối database
connectDB();

// Seed data nếu database trống
async function seedDataIfEmpty() {
  try {
    const itemCount = await db.collection('menu_items').countDocuments();
    if (itemCount > 0) {
      console.log(`   📋 Có ${itemCount} món trong menu`);
      return;
    }
    
    console.log('   🌱 Đang tạo dữ liệu mẫu...');
    
    // Tạo categories
    const categories = [
      { name: 'Bánh mì', display_order: 1 },
      { name: 'Nước uống', display_order: 2 },
      { name: 'Combo', display_order: 3 }
    ];
    await db.collection('categories').insertMany(categories);
    
    // Tạo menu items
    const menuItems = [
      { name: 'Bánh mì chả cá', price: 25000, category_id: 'Bánh mì', description: 'Bánh mì giòn with chả cá', image: '', display_order: 1 },
      { name: 'Bánh mì pate', price: 20000, category_id: 'Bánh mì', description: 'Bánh mì with pate', image: '', display_order: 2 },
      { name: 'Bánh mì xá xíu', price: 30000, category_id: 'Bánh mì', description: 'Bánh mì with xá xíu', image: '', display_order: 3 },
      { name: 'Bánh mì trứng', price: 18000, category_id: 'Bánh mì', description: 'Bánh mì with trứng', image: '', display_order: 4 },
      { name: 'Cà phê sữa đá', price: 20000, category_id: 'Nước uống', description: 'Cà phê sữa đá classic', image: '', display_order: 5 },
      { name: 'Trà đá', price: 15000, category_id: 'Nước uống', description: 'Trà đá mát lạnh', image: '', display_order: 6 },
      { name: 'Nước cam', price: 25000, category_id: 'Nước uống', description: 'Nước cam tươi', image: '', display_order: 7 },
      { name: 'Combo 1', price: 45000, category_id: 'Combo', description: 'Bánh mì + Nước', image: '', display_order: 8 },
      { name: 'Combo 2', price: 55000, category_id: 'Combo', description: 'Bánh mì + Trà', image: '', display_order: 9 }
    ];
    
    await db.collection('menu_items').insertMany(menuItems);
    console.log('   ✅ Đã tạo 9 món mẫu');
  } catch (err) {
    console.log('   ⚠️ Lỗi seed data:', err.message);
  }
}

// API: Lấy menu
app.get('/api/menu', async (req, res) => {
  if (!db) {
    return res.status(503).json({ error: 'Database not available', code: 'DB_NOT_CONNECTED' });
  }
  try {
    const categories = await db.collection('categories')
      .find({ is_hidden: { $ne: true } })
      .sort({ display_order: 1 })
      .toArray();
    
    const items = await db.collection('menu_items')
      .find({ is_hidden: { $ne: true } })
      .sort({ display_order: 1 })
      .toArray();
    
    res.json({ categories, items });
  } catch (err) {
    console.error('Error fetching menu:', err);
    res.status(500).json({ error: err.message });
  }
});

// Thêm category mới
app.post('/api/categories', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  const { name, display_order, is_hidden } = req.body;
  try {
    const result = await db.collection('categories').insertOne({
      name,
      display_order: display_order || 0,
      is_hidden: is_hidden || false,
      created_at: new Date()
    });
    res.json({ success: true, category_id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Thêm menu item mới
app.post('/api/menu-items', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  const { name, price, category_id, description, image, display_order, is_hidden } = req.body;
  try {
    const item = {
      name,
      price: parseFloat(price),
      category_id,
      description: description || '',
      image: image || '',
      display_order: display_order || 0,
      is_hidden: is_hidden || false,
      created_at: new Date()
    };
    const result = await db.collection('menu_items').insertOne(item);
    res.json({ success: true, item_id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Tạo đơn hàng
app.post('/api/orders', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  
  const { table_id, items, notes, customer_name } = req.body;
  
  if (!table_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Thiếu thông tin đơn hàng' });
  }
  
  try {
    // Tính tổng tiền
    let total = 0;
    const orderItems = items.map(item => {
      total += item.price * item.quantity;
      return {
        menu_item_id: item.id || item.menu_item_id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        subtotal: item.price * item.quantity
      };
    });
    
    const order = {
      table_id: String(table_id),
      customer_name: customer_name || '',
      items: orderItems,
      notes: notes || '',
      total: total,
      status: 'pending',
      payment_status: 'unpaid',
      created_at: new Date(),
      updated_at: new Date()
    };
    
    const result = await db.collection('orders').insertOne(order);
    const orderId = result.insertedId;
    
    // Gửi thông báo realtime cho kitchen
    io.emit('new-order', {
      order_id: orderId.toString(),
      table_id,
      items: orderItems,
      notes,
      status: 'pending',
      total,
      created_at: order.created_at
    });
    
    res.json({ 
      success: true, 
      order_id: orderId.toString(),
      total 
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Lấy đơn hàng
app.get('/api/orders', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  
  try {
    const status = req.query.status;
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const orders = await db.collection('orders')
      .find(query)
      .sort({ created_at: -1 })
      .limit(100)
      .toArray();
    
    // Chuyển đổi ObjectId sang string
    const ordersWithStringId = orders.map(order => ({
      ...order,
      _id: order._id.toString()
    }));
    
    res.json(ordersWithStringId);
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: err.message });
  }
});

// Lấy chi tiết một đơn hàng
app.get('/api/orders/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  
  try {
    const order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!order) {
      return res.status(404).json({ error: 'Đơn hàng không tồn tại' });
    }
    
    res.json({ ...order, _id: order._id.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Cập nhật trạng thái đơn
app.patch('/api/orders/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  
  const { status, payment_status } = req.body;
  
  try {
    const updateData = { updated_at: new Date() };
    if (status) updateData.status = status;
    if (payment_status) updateData.payment_status = payment_status;
    
    const result = await db.collection('orders').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Đơn hàng không tồn tại' });
    }
    
    // Thông báo realtime
    io.emit('order-updated', { 
      order_id: req.params.id, 
      status,
      payment_status 
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating order:', err);
    res.status(500).json({ error: err.message });
  }
});

// Xóa đơn hàng
app.delete('/api/orders/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  
  try {
    const result = await db.collection('orders').deleteOne({ _id: new ObjectId(req.params.id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Đơn hàng không tồn tại' });
    }
    
    io.emit('order-deleted', { order_id: req.params.id });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Lịch sử
app.get('/api/history', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  
  try {
    const filter = req.query.filter || 'all';
    let query = {};
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (filter === 'today') {
      query.created_at = { $gte: today };
    } else if (filter === 'week') {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      query.created_at = { $gte: weekAgo };
    } else if (filter === 'month') {
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      query.created_at = { $gte: monthAgo };
    } else if (filter === 'completed') {
      query.status = 'completed';
    } else if (filter === 'cancelled') {
      query.status = 'cancelled';
    }
    
    const orders = await db.collection('orders')
      .find(query)
      .sort({ created_at: -1 })
      .limit(200)
      .toArray();
    
    // Chuyển đổi ObjectId sang string
    const ordersWithStringId = orders.map(order => ({
      ...order,
      _id: order._id.toString()
    }));
    
    res.json(ordersWithStringId);
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== API: EXPORT EXCEL ====================

// Export đơn hàng ra file Excel
app.get('/api/export/excel', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  
  try {
    const { start_date, end_date, status } = req.query;
    
    let query = {};
    
    // Lọc theo ngày
    if (start_date || end_date) {
      query.created_at = {};
      if (start_date) query.created_at.$gte = new Date(start_date);
      if (end_date) {
        const end = new Date(end_date);
        end.setHours(23, 59, 59, 999);
        query.created_at.$lte = end;
      }
    }
    
    // Lọc theo trạng thái
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const orders = await db.collection('orders')
      .find(query)
      .sort({ created_at: -1 })
      .toArray();
    
    // Tạo workbook Excel
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Restaurant QR System';
    workbook.created = new Date();
    
    // Sheet 1: Tổng quan đơn hàng
    const sheet1 = workbook.addWorksheet('Danh sách đơn hàng');
    
    // Header
    sheet1.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Mã đơn', key: 'order_id', width: 20 },
      { header: 'Ngày tạo', key: 'created_at', width: 18 },
      { header: 'Bàn', key: 'table_id', width: 10 },
      { header: 'Khách hàng', key: 'customer_name', width: 20 },
      { header: 'Tổng tiền', key: 'total', width: 15 },
      { header: 'Trạng thái', key: 'status', width: 15 },
      { header: 'Thanh toán', key: 'payment_status', width: 15 },
      { header: 'Ghi chú', key: 'notes', width: 30 }
    ];
    
    // Style header
    sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    sheet1.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4472C4' }
    };
    sheet1.getRow(1).alignment = { horizontal: 'center' };
    
    // Thêm dữ liệu
    let stt = 1;
    let totalRevenue = 0;
    
    orders.forEach(order => {
      const createdAt = order.created_at ? new Date(order.created_at).toLocaleString('vi-VN') : '';
      const statusText = {
        'pending': 'Chờ xác nhận',
        'cooking': 'Đang nấu',
        'ready': 'Hoàn thành',
        'completed': 'Đã phục vụ',
        'cancelled': 'Đã hủy'
      }[order.status] || order.status;
      
      const paymentText = order.payment_status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán';
      
      if (order.status === 'completed' || order.status === 'ready') {
        totalRevenue += order.total || 0;
      }
      
      sheet1.addRow({
        stt: stt++,
        order_id: order._id.toString(),
        created_at: createdAt,
        table_id: order.table_id,
        customer_name: order.customer_name || '',
        total: order.total || 0,
        status: statusText,
        payment_status: paymentText,
        notes: order.notes || ''
      });
    });
    
    // Thêm dòng tổng cộng
    sheet1.addRow({});
    sheet1.addRow({
      stt: '',
      order_id: 'TỔNG DOANH THU',
      total: totalRevenue
    });
    sheet1.getRow(sheet1.rowCount).font = { bold: true };
    sheet1.getRow(sheet1.rowCount).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'E2EFDA' }
    };
    
    // Sheet 2: Chi tiết món ăn
    const sheet2 = workbook.addWorksheet('Chi tiết món');
    
    sheet2.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Mã đơn', key: 'order_id', width: 20 },
      { header: 'Ngày', key: 'created_at', width: 18 },
      { header: 'Bàn', key: 'table_id', width: 10 },
      { header: 'Tên món', key: 'item_name', width: 25 },
      { header: 'Giá', key: 'price', width: 12 },
      { header: 'Số lượng', key: 'quantity', width: 12 },
      { header: 'Thành tiền', key: 'subtotal', width: 15 }
    ];
    
    sheet2.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    sheet2.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '70AD47' }
    };
    sheet2.getRow(1).alignment = { horizontal: 'center' };
    
    let stt2 = 1;
    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          sheet2.addRow({
            stt: stt2++,
            order_id: order._id.toString(),
            created_at: order.created_at ? new Date(order.created_at).toLocaleDateString('vi-VN') : '',
            table_id: order.table_id,
            item_name: item.name,
            price: item.price,
            quantity: item.quantity,
            subtotal: item.subtotal
          });
        });
      }
    });
    
    // Sheet 3: Thống kê
    const sheet3 = workbook.addWorksheet('Thống kê');
    
    // Tính toán thống kê
    const totalOrders = orders.length;
    const completedOrders = orders.filter(o => o.status === 'completed' || o.status === 'ready').length;
    const cancelledOrders = orders.filter(o => o.status === 'cancelled').length;
    const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'cooking').length;
    
    const totalRevenueAll = orders
      .filter(o => o.status === 'completed' || o.status === 'ready')
      .reduce((sum, o) => sum + (o.total || 0), 0);
    
    // Đếm món bán chạy
    const itemCount = {};
    orders.forEach(order => {
      if (order.items) {
        order.items.forEach(item => {
          const name = item.name;
          itemCount[name] = (itemCount[name] || 0) + item.quantity;
        });
      }
    });
    
    const topItems = Object.entries(itemCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    sheet3.columns = [
      { header: 'Chỉ tiêu', key: 'metric', width: 30 },
      { header: 'Giá trị', key: 'value', width: 20 }
    ];
    
    sheet3.getRow(1).font = { bold: true };
    sheet3.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC000' }
    };
    
    sheet3.addRow({ metric: 'BÁO CÁO DOANH THU', value: '' });
    sheet3.addRow({ metric: 'Ngày xuất:', value: new Date().toLocaleString('vi-VN') });
    sheet3.addRow({});
    sheet3.addRow({ metric: 'Tổng số đơn:', value: totalOrders });
    sheet3.addRow({ metric: 'Đơn hoàn thành:', value: completedOrders });
    sheet3.addRow({ metric: 'Đơn hủy:', value: cancelledOrders });
    sheet3.addRow({ metric: 'Đơn đang xử lý:', value: pendingOrders });
    sheet3.addRow({});
    sheet3.addRow({ metric: 'Tổng doanh thu:', value: totalRevenueAll });
    sheet3.addRow({ metric: 'Trung bình/đơn:', value: completedOrders > 0 ? Math.round(totalRevenueAll / completedOrders) : 0 });
    sheet3.addRow({});
    sheet3.addRow({ metric: 'TOP 10 MÓN BÁN CHẠY', value: '' });
    topItems.forEach(([name, qty]) => {
      sheet3.addRow({ metric: name, value: qty });
    });
    
    // Format number cho các sheet
    sheet1.getColumn(6).numFmt = '#,##0';
    sheet2.getColumn(6).numFmt = '#,##0';
    sheet2.getColumn(8).numFmt = '#,##0';
    sheet3.getColumn(2).numFmt = '#,##0';
    
    // Set response headers
    const fileName = `bao-cao-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    
    // Ghi file
    await workbook.xlsx.write(res);
    res.end();
    
    console.log(`✅ Export Excel thành công: ${orders.length} đơn hàng`);
  } catch (err) {
    console.error('Error exporting Excel:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== API: STATS ====================

// Thống kê nhanh
app.get('/api/stats', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not available' });
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [
      todayOrders,
      pendingOrders,
      completedToday,
      revenueToday
    ] = await Promise.all([
      db.collection('orders').find({ created_at: { $gte: today } }).toArray(),
      db.collection('orders').find({ status: { $in: ['pending', 'cooking'] } }).toArray(),
      db.collection('orders').find({ 
        status: { $in: ['completed', 'ready'] },
        created_at: { $gte: today }
      }).toArray(),
      db.collection('orders').aggregate([
        { $match: { status: { $in: ['completed', 'ready'] }, created_at: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]).toArray()
    ]);
    
    res.json({
      today_total: todayOrders.length,
      pending: pendingOrders.length,
      completed_today: completedToday.length,
      revenue_today: revenueToday[0]?.total || 0
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-kitchen', () => {
    socket.join('kitchen');
    console.log('Client joined kitchen room');
  });
  
  socket.on('join-admin', () => {
    socket.join('admin');
    console.log('Client joined admin room');
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ==================== ROUTES ====================

// Serve SPA
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin/index.html'));
});

app.get('/kitchen', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/kitchen/index.html'));
});

app.get('/customer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/customer/index.html'));
});

app.get('/', (req, res) => {
  res.redirect('/admin');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ==================== START SERVER ====================

server.listen(PORT, () => {
  console.log('========================================');
  console.log(`🍽️  Restaurant QR System`);
  console.log(`   Server đang chạy tại http://localhost:${PORT}`);
  console.log(`   MongoDB: ${db ? '✅ Đã kết nối' : '⏳ Chờ kết nối...'}`);
  console.log('========================================');
});

// Xử lý graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Nhận tín hiệu dừng server...');
  if (client) {
    await client.close();
    console.log('Đóng kết nối MongoDB');
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Nhận Ctrl+C, dừng server...');
  if (client) {
    await client.close();
    console.log('Đóng kết nối MongoDB');
  }
  process.exit(0);
});
