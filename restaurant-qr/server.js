const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===================== DỮ LIỆU IN-MEMORY =====================
let menu = [
  { id: 1, name: 'Phở Bò Tái', price: 65000, category: 'Món chính', image: '🍜', available: true },
  { id: 2, name: 'Bún Bò Huế', price: 60000, category: 'Món chính', image: '🍲', available: true },
  { id: 3, name: 'Cơm Sườn Nướng', price: 75000, category: 'Món chính', image: '🍚', available: true },
  { id: 4, name: 'Gỏi Cuốn (4 cuốn)', price: 45000, category: 'Khai vị', image: '🥗', available: true },
  { id: 5, name: 'Chả Giò (6 cái)', price: 50000, category: 'Khai vị', image: '🥟', available: true },
  { id: 6, name: 'Trà Đá', price: 10000, category: 'Đồ uống', image: '🧊', available: true },
  { id: 7, name: 'Nước Ngọt', price: 20000, category: 'Đồ uống', image: '🥤', available: true },
  { id: 8, name: 'Bia Lon', price: 30000, category: 'Đồ uống', image: '🍺', available: true },
  { id: 9, name: 'Chè Ba Màu', price: 35000, category: 'Tráng miệng', image: '🍨', available: true },
  { id: 10, name: 'Bánh Flan', price: 25000, category: 'Tráng miệng', image: '🍮', available: true },
];

let orders = {}; // { orderId: orderObject }
let tables = {}; // { tableId: { tableId, tableName, sessionId, status } }

// Khởi tạo 8 bàn mặc định
for (let i = 1; i <= 8; i++) {
  tables[`table_${i}`] = {
    tableId: `table_${i}`,
    tableName: `Bàn ${i}`,
    status: 'available', // available | occupied
    currentSession: null,
  };
}

// ===================== REST API =====================

// Lấy menu
app.get('/api/menu', (req, res) => {
  res.json(menu);
});

// Thêm món vào menu (admin)
app.post('/api/menu', (req, res) => {
  const { name, price, category, image } = req.body;
  if (!name || !price || !category) return res.status(400).json({ error: 'Thiếu thông tin' });
  const newItem = { id: Date.now(), name, price: Number(price), category, image: image || '🍽️', available: true };
  menu.push(newItem);
  io.emit('menu_updated', menu);
  res.json(newItem);
});

// Cập nhật món (admin)
app.put('/api/menu/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const idx = menu.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
  menu[idx] = { ...menu[idx], ...req.body, id };
  io.emit('menu_updated', menu);
  res.json(menu[idx]);
});

// Xóa món (admin)
app.delete('/api/menu/:id', (req, res) => {
  const id = parseInt(req.params.id);
  menu = menu.filter(m => m.id !== id);
  io.emit('menu_updated', menu);
  res.json({ success: true });
});

// Lấy tất cả bàn
app.get('/api/tables', (req, res) => {
  res.json(Object.values(tables));
});

// Tạo QR cho bàn
app.get('/api/qr/:tableId', async (req, res) => {
  const { tableId } = req.params;
  const host = req.headers.host;
  const url = `http://${host}/customer?table=${tableId}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' }
    });
    res.json({ qr: qrDataUrl, url });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tạo QR' });
  }
});

// Lấy tất cả orders (bếp/admin)
app.get('/api/orders', (req, res) => {
  res.json(Object.values(orders).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// Cập nhật trạng thái order
app.put('/api/orders/:orderId/status', (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  if (!orders[orderId]) return res.status(404).json({ error: 'Không tìm thấy order' });
  orders[orderId].status = status;
  orders[orderId].updatedAt = new Date().toISOString();
  io.emit('order_updated', orders[orderId]);
  res.json(orders[orderId]);
});

// Cập nhật trạng thái từng món trong order
app.put('/api/orders/:orderId/items/:itemIndex', (req, res) => {
  const { orderId, itemIndex } = req.params;
  const { status } = req.body;
  const idx = parseInt(itemIndex);
  if (!orders[orderId] || !orders[orderId].items[idx]) return res.status(404).json({ error: 'Không tìm thấy' });
  orders[orderId].items[idx].status = status;
  orders[orderId].updatedAt = new Date().toISOString();
  io.emit('order_updated', orders[orderId]);
  res.json(orders[orderId]);
});

// Thanh toán / đóng bàn
app.post('/api/orders/:orderId/checkout', (req, res) => {
  const { orderId } = req.params;
  if (!orders[orderId]) return res.status(404).json({ error: 'Không tìm thấy' });
  orders[orderId].status = 'paid';
  orders[orderId].paidAt = new Date().toISOString();
  const tableId = orders[orderId].tableId;
  if (tables[tableId]) {
    tables[tableId].status = 'available';
    tables[tableId].currentSession = null;
  }
  io.emit('order_updated', orders[orderId]);
  io.emit('table_updated', tables[tableId]);
  res.json({ success: true, order: orders[orderId] });
});

// ===================== STATIC PAGES =====================
app.get('/customer', (req, res) => res.sendFile(path.join(__dirname, 'public/customer/index.html')));
app.get('/kitchen', (req, res) => res.sendFile(path.join(__dirname, 'public/kitchen/index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));

// ===================== SOCKET.IO =====================
io.on('connection', (socket) => {
  console.log('Client kết nối:', socket.id);

  // Khách hàng tham gia phòng bàn
  socket.on('join_table', ({ tableId }) => {
    socket.join(`table_${tableId}`);
    console.log(`Socket ${socket.id} vào bàn ${tableId}`);
  });

  // Bếp tham gia phòng kitchen
  socket.on('join_kitchen', () => {
    socket.join('kitchen');
    console.log('Bếp kết nối:', socket.id);
  });

  // Admin tham gia phòng admin
  socket.on('join_admin', () => {
    socket.join('admin_room');
  });

  // Khách đặt món
  socket.on('place_order', (data) => {
    const { tableId, items, note, customerName } = data;
    const orderId = uuidv4().slice(0, 8).toUpperCase();
    const order = {
      orderId,
      tableId,
      tableName: tables[tableId]?.tableName || tableId,
      customerName: customerName || 'Khách',
      items: items.map(item => ({ ...item, status: 'pending' })),
      note: note || '',
      status: 'pending', // pending | preparing | ready | paid
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      total: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    };
    orders[orderId] = order;

    // Cập nhật trạng thái bàn
    if (tables[tableId]) {
      tables[tableId].status = 'occupied';
      tables[tableId].currentSession = orderId;
    }

    // Gửi xác nhận cho khách
    socket.to(`table_${tableId}`).emit('order_confirmed', order);
    socket.emit('order_confirmed', order);

    // Thông báo bếp
    io.to('kitchen').emit('new_order', order);
    io.to('admin_room').emit('new_order', order);
    io.to('admin_room').emit('table_updated', tables[tableId]);

    console.log(`Order mới: ${orderId} - Bàn ${tableId}`);
  });

  // Gọi thêm món
  socket.on('add_to_order', (data) => {
    const { orderId, items } = data;
    if (!orders[orderId]) return;
    const newItems = items.map(item => ({ ...item, status: 'pending' }));
    orders[orderId].items.push(...newItems);
    orders[orderId].total += items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    orders[orderId].updatedAt = new Date().toISOString();
    io.to('kitchen').emit('order_updated', orders[orderId]);
    io.to('admin_room').emit('order_updated', orders[orderId]);
    socket.emit('order_confirmed', orders[orderId]);
  });

  // Bếp cập nhật trạng thái
  socket.on('update_item_status', ({ orderId, itemIndex, status }) => {
    if (!orders[orderId]) return;
    orders[orderId].items[itemIndex].status = status;
    orders[orderId].updatedAt = new Date().toISOString();

    // Kiểm tra tất cả món xong chưa
    const allReady = orders[orderId].items.every(i => i.status === 'ready');
    if (allReady) orders[orderId].status = 'ready';
    else orders[orderId].status = 'preparing';

    io.emit('order_updated', orders[orderId]);
  });

  socket.on('disconnect', () => {
    console.log('Client ngắt kết nối:', socket.id);
  });
});

// ===================== KHỞI ĐỘNG =====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🍜 Restaurant QR Order System`);
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`📱 Trang khách hàng: http://localhost:${PORT}/customer?table=table_1`);
  console.log(`👨‍🍳 Màn hình bếp:     http://localhost:${PORT}/kitchen`);
  console.log(`⚙️  Trang quản trị:   http://localhost:${PORT}/admin\n`);
});
