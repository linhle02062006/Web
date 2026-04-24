const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');

// ===================== CẤU HÌNH SQLite =====================
// DATA_DIR: dùng cho Render persistent disk, fallback về thư mục project khi chạy local
const dataDir = process.env.DATA_DIR || __dirname;
try {
  if (!require('fs').existsSync(dataDir)) {
    require('fs').mkdirSync(dataDir, { recursive: true });
  }
} catch (e) {
  console.warn('⚠️ Không tạo được DATA_DIR, fallback về __dirname:', e.message);
}
const dbPath = path.join(dataDir, 'restaurant.db');
console.log('📂 DB path:', dbPath);
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
let menu = [];
let orders = {};
let tables = {};

// Load dữ liệu từ SQLite vào biến RAM (cache)
loadFromDB();

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

// API tạo QR generic cho bất kỳ bàn nào
app.get('/api/qr/:tableId', async (req, res) => {
  const { tableId } = req.params;
  const host = req.get('host');
  const proto = req.protocol;
  const url = `${proto}://${host}/customer?table=${encodeURIComponent(tableId)}`;
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

// ===================== API MENU CRUD =====================
app.post('/api/menu', (req, res) => {
  try {
    const { name, price, category, image } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Thiếu tên hoặc giá' });
    const result = db.prepare(
      'INSERT INTO Menu (name, price, category, image, available) VALUES (?, ?, ?, ?, 1)'
    ).run(name, Number(price), category || '', image || '');
    const newItem = db.prepare('SELECT * FROM Menu WHERE id = ?').get(result.lastInsertRowid);
    // Refresh cache
    menu = db.prepare('SELECT * FROM Menu').all();
    io.emit('menu_updated', menu.filter(m => m.available));
    res.json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/menu/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM Menu WHERE id = ?').get(id);
    if (!item) return res.status(404).json({ error: 'Không tìm thấy món' });
    const newAvail = item.available ? 0 : 1;
    db.prepare('UPDATE Menu SET available = ? WHERE id = ?').run(newAvail, id);
    menu = db.prepare('SELECT * FROM Menu').all();
    io.emit('menu_updated', menu.filter(m => m.available));
    res.json({ success: true, available: newAvail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/menu/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM Menu WHERE id = ?').run(id);
    menu = db.prepare('SELECT * FROM Menu').all();
    io.emit('menu_updated', menu.filter(m => m.available));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    console.log(`🛎️  Đơn mang đi mới: ${orderId}`);
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

// ===================== AUTO-DELETE ĐƠN CŨ (>92 ngày) =====================
function cleanupOldOrders() {
  try {
    // Lấy mốc thời gian 92 ngày trước (ISO string)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 92);
    const cutoffISO = cutoff.toISOString();

    const result = db.prepare('DELETE FROM Orders WHERE createdAt < ?').run(cutoffISO);
    if (result.changes > 0) {
      console.log(`🧹 Đã tự động xóa ${result.changes} đơn cũ hơn 92 ngày (trước ${cutoffISO})`);
      // Refresh cache RAM
      const ordersData = db.prepare('SELECT * FROM Orders ORDER BY createdAt DESC').all();
      orders = {};
      ordersData.forEach(o => {
        try { o.items = JSON.parse(o.items); } catch { o.items = []; }
        orders[o.orderId] = o;
      });
    }
  } catch (err) {
    console.error('❌ Lỗi cleanup orders:', err.message);
  }
}

// Chạy cleanup ngay khi khởi động
cleanupOldOrders();
// Lặp lại mỗi 24 giờ
setInterval(cleanupOldOrders, 24 * 60 * 60 * 1000);

// Hàm helper: query orders từ SQLite theo khoảng ngày
function queryOrdersFromDB({ from, to, status, q }) {
  let sql = 'SELECT * FROM Orders WHERE 1=1';
  const params = [];
  if (from) {
    sql += ' AND createdAt >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND createdAt <= ?';
    params.push(to);
  }
  if (status && status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY createdAt DESC';
  let rows = db.prepare(sql).all(...params);
  rows = rows.map(r => {
    try { r.items = JSON.parse(r.items); } catch { r.items = []; }
    return r;
  });
  if (q) {
    const kw = q.toLowerCase();
    rows = rows.filter(o =>
      (o.orderId || '').toLowerCase().includes(kw) ||
      (o.tableName || '').toLowerCase().includes(kw) ||
      (o.customerName || '').toLowerCase().includes(kw)
    );
  }
  return rows;
}

// ===================== API LỊCH SỬ ĐƠN HÀNG (có lọc ngày) =====================
app.get('/api/history', (req, res) => {
  try {
    const { from, to, status, q } = req.query;
    const MAX_DAYS = 92; // ~3 tháng

    if (from && to) {
      const f = new Date(from + 'T00:00:00');
      const t = new Date(to + 'T23:59:59');
      if (f > t) return res.status(400).json({ error: 'Ngày bắt đầu phải trước ngày kết thúc' });
      const diffDays = (t - f) / (1000 * 60 * 60 * 24);
      if (diffDays > MAX_DAYS) {
        return res.status(400).json({ error: 'Khoảng thời gian tối đa 3 tháng' });
      }
    }

    const fromISO = from ? new Date(from + 'T00:00:00').toISOString() : null;
    const toISO = to ? new Date(to + 'T23:59:59').toISOString() : null;

    const list = queryOrdersFromDB({ from: fromISO, to: toISO, status, q });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== API XUẤT EXCEL =====================
app.get('/api/export/excel', async (req, res) => {
  try {
    const { from, to } = req.query;
    const MAX_DAYS = 92; // ~3 tháng

    let fromDate = from ? new Date(from + 'T00:00:00') : null;
    let toDate = to ? new Date(to + 'T23:59:59') : null;

    if (fromDate && toDate) {
      const diffDays = (toDate - fromDate) / (1000 * 60 * 60 * 24);
      if (diffDays > MAX_DAYS) {
        return res.status(400).json({ error: 'Khoảng thời gian tối đa 3 tháng' });
      }
      if (fromDate > toDate) {
        return res.status(400).json({ error: 'Ngày bắt đầu phải trước ngày kết thúc' });
      }
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Restaurant QR';
    workbook.created = new Date();

    // Lấy orders từ SQLite theo khoảng ngày
    const fromISO = fromDate ? fromDate.toISOString() : null;
    const toISO = toDate ? toDate.toISOString() : null;
    let ordersList = queryOrdersFromDB({ from: fromISO, to: toISO });
    ordersList.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Tiêu đề khoảng ngày
    const rangeLabel = (fromDate || toDate)
      ? `${fromDate ? fromDate.toLocaleDateString('vi-VN') : '...'} - ${toDate ? toDate.toLocaleDateString('vi-VN') : '...'}`
      : 'Tất cả thời gian';

    // --- Sheet 1: Doanh thu ---
    const revenueSheet = workbook.addWorksheet('Doanh Thu');
    revenueSheet.mergeCells('A1:F1');
    const titleCell = revenueSheet.getCell('A1');
    titleCell.value = `BÁO CÁO DOANH THU - ${rangeLabel}`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    revenueSheet.getRow(1).height = 28;

    revenueSheet.getRow(3).values = ['STT', 'Mã Đơn', 'Ngày/Giờ', 'Bàn/Khách', 'Tổng Tiền', 'Trạng Thái'];
    revenueSheet.getRow(3).font = { bold: true };
    revenueSheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE1E4E8' } };
    revenueSheet.columns = [
      { key: 'stt', width: 6 },
      { key: 'orderId', width: 14 },
      { key: 'date', width: 20 },
      { key: 'customerName', width: 22 },
      { key: 'total', width: 15 },
      { key: 'status', width: 18 },
    ];

    let totalRevenue = 0;
    let paidCount = 0;
    ordersList.forEach((order, idx) => {
      const row = revenueSheet.addRow({
        stt: idx + 1,
        orderId: order.orderId,
        date: new Date(order.createdAt).toLocaleString('vi-VN'),
        customerName: order.tableName || order.customerName,
        total: order.total,
        status: order.status === 'paid' ? 'Đã thanh toán'
              : order.status === 'pending' ? 'Chờ xử lý'
              : order.status === 'preparing' ? 'Đang nấu'
              : order.status === 'ready' ? 'Sẵn sàng' : order.status
      });
      row.getCell('total').numFmt = '#,##0 "đ"';
      if (order.status === 'paid') {
        totalRevenue += order.total;
        paidCount++;
      }
    });

    revenueSheet.addRow({});
    const totalRow = revenueSheet.addRow({ orderId: 'TỔNG DOANH THU', total: totalRevenue });
    totalRow.font = { bold: true };
    totalRow.getCell('total').numFmt = '#,##0 "đ"';
    totalRow.getCell('total').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };

    // --- Sheet 2: Chi tiết món ---
    const itemsSheet = workbook.addWorksheet('Chi Tiết Món');
    itemsSheet.columns = [
      { header: 'Mã Đơn', key: 'orderId', width: 14 },
      { header: 'Ngày', key: 'date', width: 20 },
      { header: 'Tên Món', key: 'name', width: 40 },
      { header: 'Số Lượng', key: 'quantity', width: 12 },
      { header: 'Đơn Giá', key: 'price', width: 14 },
      { header: 'Thành Tiền', key: 'subtotal', width: 16 },
    ];
    itemsSheet.getRow(1).font = { bold: true };
    itemsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE1E4E8' } };

    const itemStats = {};
    ordersList.forEach(order => {
      order.items.forEach(item => {
        const key = item.name;
        if (!itemStats[key]) itemStats[key] = { quantity: 0, revenue: 0 };
        itemStats[key].quantity += item.quantity;
        itemStats[key].revenue += item.price * item.quantity;
        const r = itemsSheet.addRow({
          orderId: order.orderId,
          date: new Date(order.createdAt).toLocaleString('vi-VN'),
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          subtotal: item.price * item.quantity
        });
        r.getCell('price').numFmt = '#,##0 "đ"';
        r.getCell('subtotal').numFmt = '#,##0 "đ"';
      });
    });

    // --- Sheet 3: Tổng kết ---
    const statsSheet = workbook.addWorksheet('Tổng Kết');
    statsSheet.columns = [{ width: 28 }, { width: 22 }];
    statsSheet.addRow(['BÁNH MÌ CHẢ CÁ NÓNG - BÁO CÁO']).font = { bold: true, size: 14 };
    statsSheet.addRow(['Khoảng thời gian:', rangeLabel]);
    statsSheet.addRow(['Ngày xuất:', new Date().toLocaleString('vi-VN')]);
    statsSheet.addRow([]);
    statsSheet.addRow(['TỔNG QUAN']).font = { bold: true };
    statsSheet.addRow(['Tổng số đơn:', ordersList.length]);
    statsSheet.addRow(['Đơn đã thanh toán:', paidCount]);
    statsSheet.addRow(['Đơn chờ xử lý:', ordersList.filter(o => o.status === 'pending').length]);
    const revRow = statsSheet.addRow(['Doanh thu:', totalRevenue]);
    revRow.getCell(2).numFmt = '#,##0 "đ"';
    revRow.font = { bold: true };
    statsSheet.addRow(['Trung bình/đơn:', paidCount ? Math.round(totalRevenue / paidCount) : 0])
      .getCell(2).numFmt = '#,##0 "đ"';
    statsSheet.addRow([]);
    statsSheet.addRow(['TOP MÓN BÁN CHẠY']).font = { bold: true };
    statsSheet.addRow(['Tên món', 'Số lượng', 'Doanh thu']).font = { bold: true };

    const topItems = Object.entries(itemStats)
      .sort((a, b) => b[1].quantity - a[1].quantity)
      .slice(0, 10);
    topItems.forEach(([name, data]) => {
      const r = statsSheet.addRow([name, data.quantity, data.revenue]);
      r.getCell(3).numFmt = '#,##0 "đ"';
    });

    // Tên file
    const fromStr = fromDate ? fromDate.toISOString().slice(0, 10) : 'all';
    const toStr = toDate ? toDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const fileName = `bao-cao-${fromStr}_${toStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('❌ Lỗi xuất Excel:', err);
    res.status(500).json({ error: err.message });
  }
});
