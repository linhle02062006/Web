const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');

// ===================== CẤU HÌNH SQLite =====================
const dbPath = path.join(__dirname, 'restaurant.db');
const db = new Database(dbPath);

// Tạo bảng nếu chưa có
db.exec(`
  CREATE TABLE IF NOT EXISTS Menu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT,
    image TEXT,
    available INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS Tables (
    tableId TEXT PRIMARY KEY,
    tableName TEXT NOT NULL,
    status TEXT DEFAULT 'available',
    currentSession TEXT
  );

  CREATE TABLE IF NOT EXISTS Orders (
    orderId TEXT PRIMARY KEY,
    tableId TEXT,
    tableName TEXT,
    customerName TEXT,
    items TEXT,
    note TEXT,
    total INTEGER,
    status TEXT DEFAULT 'pending',
    createdAt TEXT,
    paidAt TEXT
  );
`);

// Insert dữ liệu mẫu nếu chưa có
const menuCount = db.prepare('SELECT COUNT(*) as count FROM Menu').get().count;
if (menuCount === 0) {
  const insertMenu = db.prepare('INSERT INTO Menu (name, price, category, image, available) VALUES (?, ?, ?, ?, ?)');
  const menuItems = [
    ['Bánh Mì Chả Cá + Tặng Trà Tắc', 17000, 'Món chính', '/menu/banhmichaca.jpg', 1],
    ['Bánh Mì Chả Cá Trứng + Tặng Trà Tắc', 22000, 'Món chính', '/menu/banhmichatrung.jpg', 1],
    ['Bánh Mì Chả Cá Chả Lụa + Tặng Trà Tắc', 22000, 'Món chính', '/menu/banhmicalua.jpg', 1],
    ['Bánh Mì Chả Cá Đặc Biệt + Tặng Trà Tắc', 27000, 'Món chính', '/menu/banhmidacbiet.jpg', 1],
    ['Trứng Thêm', 5000, 'Thêm', '/menu/trung.png', 1],
    ['Chả Cá Thêm', 5000, 'Thêm', '/menu/chaca.jpg', 1],
    ['Chả Lụa Thêm', 5000, 'Thêm', '/menu/images.jpg', 1],
  ];
  menuItems.forEach(item => insertMenu.run(...item));
}

// Insert bàn takeaway nếu chưa có
const tableCount = db.prepare('SELECT COUNT(*) as count FROM Tables').get().count;
if (tableCount === 0) {
  db.prepare('INSERT INTO Tables (tableId, tableName, status) VALUES (?, ?, ?)').run('takeaway', 'Khách Mang Đi', 'available');
}

console.log('✅ Kết nối SQLite thành công');

// Hàm load dữ liệu từ SQLite
function loadFromDB() {
  menu = db.prepare('SELECT * FROM Menu WHERE available = 1').all();
  const tablesData = db.prepare('SELECT * FROM Tables').all();
  tables = {};
  tablesData.forEach(t => tables[t.tableId] = t);
  
  const ordersData = db.prepare('SELECT * FROM Orders ORDER BY createdAt DESC').all();
  orders = {};
  ordersData.forEach(o => {
    o.items = JSON.parse(o.items);
    orders[o.orderId] = o;
  });
  
  console.log(`📋 Đã tải ${menu.length} món, ${Object.keys(tables).length} bàn, ${Object.keys(orders).length} đơn`);
}

// Hàm lưu đơn vào SQLite
function saveOrderToDB(order) {
  try {
    db.prepare(`
      INSERT INTO Orders (orderId, tableId, tableName, customerName, items, note, total, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      order.orderId,
      order.tableId,
      order.tableName,
      order.customerName,
      JSON.stringify(order.items),
      order.note || '',
      order.total,
      order.status,
      order.createdAt
    );
    console.log(` Đã lưu đơn ${order.orderId} vào SQLite`);
  } catch (err) {
    console.error(' Lỗi lưu đơn:', err.message);
  }
}

// Hàm cập nhật trạng thái đơn
function updateOrderStatusInDB(orderId, status) {
  try {
    db.prepare('UPDATE Orders SET status = ?, paidAt = CASE WHEN ? = "paid" THEN datetime("now") ELSE paidAt END WHERE orderId = ?').run(status, status, orderId);
  } catch (err) {
    console.error(' Lỗi cập nhật:', err.message);
  }
}

// Load dữ liệu khi khởi động
loadFromDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST", "PUT"]
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===================== DỮ LIỆU MẶC ĐỊNH (nếu không kết nối được DB) =====================
let menu = [
  { id: 1, name: 'Bánh Mì Chả Cá + Tặng Trà Tắc', price: 17000, category: 'Món chính',image: '/menu/banhmichaca.jpg', available: true },
  { id: 2, name: 'Bánh Mì Chả Cá Trứng + Tặng Trà Tắc', price: 22000, category: 'Món chính',image: '/menu/banhmichatrung.jpg', available: true },
  { id: 3, name: 'Bánh Mì Chả Cá Chả Lụa + Tặng Trà Tắc', price: 22000, category: 'Món chính',image: '/menu/banhmicalua.jpg', available: true },
  { id: 4, name: 'Bánh Mì Chả Cá Đặc Biệt + Tặng Trà Tắc', price: 27000, category: 'Món chính',image: '/menu/banhmidacbiet.jpg', available: true },
  { id: 5, name: 'Trứng Thêm', price: 5000, category: 'Thêm',image: '/menu/trung.png', available: true },
  { id: 6, name: 'Chả Cá Thêm', price: 5000, category: 'Thêm',image: '/menu/chaca.jpg', available: true },
  { id: 7, name: 'Chả Lụa Thêm', price: 5000, category: 'Thêm',image: '/menu/images.jpg', available: true },
];

let orders = {}; 
let tables = {
  'takeaway': {
    tableId: 'takeaway',
    tableName: 'Khách Mang Đi',
    status: 'available',
    currentSession: null,
  }
};

// Khởi tạo kết nối database
connectDB();

app.get('/', (req, res) => {
  res.redirect('/customer?table=takeaway');
});

app.get('/api/menu', (req, res) => res.json(menu));

app.get('/api/tables', (req, res) => res.json(Object.values(tables)));

// API Tạo QR cố định cho Bán mang đi
app.get('/api/qr/takeaway', async (req, res) => {
  const url = `https://banh-mi-cha-ca-nong.onrender.com/customer?table=takeaway`;
  try {
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 500,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' }
    });
    res.json({ qr: qrDataUrl, url });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tạo QR' });
  }
});

app.get('/api/orders', (req, res) => {
  res.json(Object.values(orders).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// Thanh toán và hoàn tất đơn
app.post('/api/orders/:orderId/checkout', (req, res) => {
  const { orderId } = req.params;
  if (!orders[orderId]) return res.status(404).json({ error: 'Không tìm thấy' });
  orders[orderId].status = 'paid';
  orders[orderId].paidAt = new Date().toISOString();
  
  // Cập nhật SQLite
  updateOrderStatusInDB(orderId, 'paid');
  
  io.emit('order_updated', orders[orderId]);
  res.json({ success: true });
});

// ===================== STATIC PAGES =====================
app.get('/customer', (req, res) => res.sendFile(path.join(__dirname, 'public/customer/index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));

// ===================== SOCKET.IO =====================
io.on('connection', (socket) => {
  console.log('Có người truy cập:', socket.id);

  socket.on('join_admin', () => socket.join('admin_room'));
  socket.on('join_kitchen', () => socket.join('kitchen_room'));

  socket.on('place_order', (data) => {
    const orderId = uuidv4().slice(0, 6).toUpperCase();
    const order = {
      orderId,
      tableId: 'takeaway',
      tableName: 'Mang Đi',
      customerName: data.customerName || 'Khách',
      items: data.items.map(item => ({ ...item, status: 'pending' })),
      note: data.note || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
      total: data.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    };
    orders[orderId] = order;
    
    // Lưu vào SQLite
    saveOrderToDB(order);
    
    socket.emit('order_confirmed', order);
    io.to('admin_room').emit('new_order', order);
    io.to('kitchen_room').emit('new_order', order);
    console.log(`Đơn mang đi mới: ${orderId}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(` Server Bánh Mì Chả Cá đang chạy cổng ${PORT}`);
});

// Cập nhật trạng thái toàn bộ đơn (bếp bấm "Bắt đầu nấu" / "Hoàn thành")
app.put('/api/orders/:orderId/status', (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  if (!orders[orderId]) return res.status(404).json({ error: 'Không tìm thấy' });
  orders[orderId].status = status;
  
  // Cập nhật SQLite
  updateOrderStatusInDB(orderId, status);
  
  io.emit('order_updated', orders[orderId]);
  res.json({ success: true });
});

// Cập nhật trạng thái từng món (bếp bấm toggle từng item)
app.put('/api/orders/:orderId/items/:idx', (req, res) => {
  const { orderId, idx } = req.params;
  const { status } = req.body;
  const order = orders[orderId];
  if (!order) return res.status(404).json({ error: 'Không tìm thấy' });
  order.items[parseInt(idx)].status = status;
  io.emit('order_updated', order);
  res.json({ success: true });
});

// Route cho màn hình bếp
app.get('/kitchen', (req, res) => res.sendFile(path.join(__dirname, 'public/kitchen/index.html')));

// ===================== API XUẤT EXCEL =====================
app.get('/api/export/excel', async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Restaurant QR';
    workbook.created = new Date();

    // --- Sheet 1: Doanh thu theo ngày ---
    const revenueSheet = workbook.addWorksheet('Doanh Thu');
    revenueSheet.columns = [
      { header: 'Mã Đơn', key: 'orderId', width: 15 },
      { header: 'Ngày', key: 'date', width: 15 },
      { header: 'Khách Hàng', key: 'customerName', width: 20 },
      { header: 'Tổng Tiền', key: 'total', width: 15 },
      { header: 'Trạng Thái', key: 'status', width: 15 },
    ];

    const ordersList = Object.values(orders);
    let totalRevenue = 0;
    ordersList.forEach(order => {
      revenueSheet.addRow({
        orderId: order.orderId,
        date: new Date(order.createdAt).toLocaleDateString('vi-VN'),
        customerName: order.customerName,
        total: order.total,
        status: order.status
      });
      if (order.status === 'paid') totalRevenue += order.total;
    });

    // Thêm dòng tổng cộng
    revenueSheet.addRow({});
    revenueSheet.addRow({ orderId: 'TỔNG CỘNG', total: totalRevenue });

    // --- Sheet 2: Số lượng bán ra ---
    const itemsSheet = workbook.addWorksheet('Chi Tiết Món');
    itemsSheet.columns = [
      { header: 'Mã Đơn', key: 'orderId', width: 15 },
      { header: 'Tên Món', key: 'name', width: 35 },
      { header: 'Số Lượng', key: 'quantity', width: 12 },
      { header: 'Đơn Giá', key: 'price', width: 12 },
      { header: 'Thành Tiền', key: 'subtotal', width: 15 },
    ];

    const itemStats = {};
    ordersList.forEach(order => {
      order.items.forEach(item => {
        const key = item.name;
        if (!itemStats[key]) {
          itemStats[key] = { quantity: 0, price: item.price };
        }
        itemStats[key].quantity += item.quantity;
        itemsSheet.addRow({
          orderId: order.orderId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          subtotal: item.price * item.quantity
        });
      });
    });

    // --- Sheet 3: Thống kê tổng hợp ---
    const statsSheet = workbook.addWorksheet('Tổng Kết');
    statsSheet.addRow(['BÁNH MÌ CHẢ CÁ NÓNG - BÁO CÁO']);
    statsSheet.addRow(['Ngày:', new Date().toLocaleDateString('vi-VN')]);
    statsSheet.addRow([]);
    statsSheet.addRow(['TỔNG QUAN']);
    statsSheet.addRow(['Tổng số đơn:', ordersList.length]);
    statsSheet.addRow(['Đơn đã thanh toán:', ordersList.filter(o => o.status === 'paid').length]);
    statsSheet.addRow(['Đơn chờ xử lý:', ordersList.filter(o => o.status === 'pending').length]);
    statsSheet.addRow(['Doanh thu:', totalRevenue + 'đ']);
    statsSheet.addRow([]);
    statsSheet.addRow(['TOP MÓN BÁN CHẠY']);
    
    // Sort items by quantity
    const topItems = Object.entries(itemStats)
      .sort((a, b) => b[1].quantity - a[1].quantity)
      .slice(0, 10);
    
    topItems.forEach(([name, data]) => {
      statsSheet.addRow([name, data.quantity + ' cái']);
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=bao-cao-ban-hang-' + new Date().toISOString().slice(0,10) + '.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('❌ Lỗi xuất Excel:', err);
    res.status(500).json({ error: err.message });
  }
});