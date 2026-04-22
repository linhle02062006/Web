const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===================== DỮ LIỆU MENU BÁNH MÌ =====================
let menu = [
  { id: 1, name: 'Bánh Mì Chả Cá + Tặng Trà Tắc', price: 17000, category: 'Món chính',Image: 'menu/banhmichaca.jpg', available: true },
  { id: 2, name: 'Bánh Mì Chả Cá Trứng + Tặng Trà Tắc', price: 22000, category: 'Món chính',Image: 'menu/banhmichatrung.jpg', available: true },
  { id: 3, name: 'Bánh Mì Chả Cá Chả Lụa + Tặng Trà Tắc', price: 22000, category: 'Món chính',Image: 'menu/banhmicalua.jpg', available: true },
  { id: 4, name: 'Bánh Mì Chả Cá Đặc Biệt + Tặng Trà Tắc', price: 27000, category: 'Món chính',Image: 'menu/banhmidacbiet.jpg', available: true },
  { id: 5, name: 'Trứng Thêm', price: 5000, category: 'Thêm',Image: 'menu/trung.png', available: true },
  { id: 6, name: 'Chả Cá Thêm', price: 5000, category: 'Thêm',Image: 'menu/chaca.jpg', available: true },
  { id: 7, name: 'Chả Lụa Thêm', price: 5000, category: 'Thêm',Image: 'menu/images.jpg', available: true },
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
    
    socket.emit('order_confirmed', order);
    io.to('admin_room').emit('new_order', order);
    console.log(`Đơn mang đi mới: ${orderId}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(` Server Bánh Mì Chả Cá đang chạy cổng ${PORT}`);
});