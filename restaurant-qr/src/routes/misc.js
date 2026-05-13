/**
 * Stats, History, QR, Export routes
 */
const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const ExcelJS = require('exceljs');
const { authMiddleware } = require('../middleware/auth');
const orderService = require('../services/orderService');
const menuService = require('../services/menuService');
const config = require('../config');
const { getDB } = require('../database/connection');

// ==================== CATEGORIES ====================
router.post('/categories', authMiddleware, async (req, res) => {
  try {
    const result = await menuService.addCategory(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== UPLOAD ====================
router.post('/upload', authMiddleware, async (req, res) => {
  try {
    const result = await menuService.uploadImage(req.body.image);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/images/:id', async (req, res) => {
  try {
    const img = await menuService.getImage(req.params.id);
    if (!img) return res.status(404).json({ error: 'Image not found' });
    res.set('Content-Type', `image/${img.ext}`);
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(img.buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== STATS ====================
router.get('/stats', async (req, res) => {
  try {
    const stats = await orderService.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/stats/top-products', async (req, res) => {
  try {
    const result = await orderService.getTopProducts();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/stats/chart', async (req, res) => {
  try {
    const result = await orderService.getChartData();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== HISTORY ====================
router.get('/history', async (req, res) => {
  try {
    const { from, to, q, filter } = req.query;
    const orders = await orderService.getHistory({ from, to, q, filter });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== SHOP CONFIG (for frontend) ====================
router.get('/shop-config', (req, res) => {
  res.json({
    shop: config.SHOP,
    bank: config.BANK,
  });
});

// ==================== QR ====================
router.get('/qr/takeaway', async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const url = `${protocol}://${host}/customer?table=takeaway`;
    const qr = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });
    res.json({ qr, url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/qr/:tableId', async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const url = `${protocol}://${host}/customer?table=${encodeURIComponent(req.params.tableId)}`;
    const qr = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });
    res.json({ qr, url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== EXPORT EXCEL ====================
router.get('/export/excel', async (req, res) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'Database not available' });

  try {
    const { start_date, end_date, from, to } = req.query;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - config.ORDER.dataRetentionDays);
    let query = { created_at: { $gte: cutoff } };

    const sd = start_date || from;
    const ed = end_date || to;
    if (sd || ed) {
      query.created_at = {};
      if (sd) {
        const fromDate = new Date(sd + 'T00:00:00');
        query.created_at.$gte = fromDate > cutoff ? fromDate : cutoff;
      } else {
        query.created_at.$gte = cutoff;
      }
      if (ed) {
        const end = new Date(ed + 'T23:59:59.999');
        query.created_at.$lte = end;
      }
    }

    const orders = await db.collection('orders').find(query).sort({ created_at: -1 }).toArray();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Restaurant QR System';
    const sheet1 = workbook.addWorksheet('Đơn hàng');
    sheet1.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Mã đơn', key: 'order_code', width: 18 },
      { header: 'Ngày tạo', key: 'created_at', width: 18 },
      { header: 'Khách hàng', key: 'customer', width: 20 },
      { header: 'Tạm tính', key: 'subtotal', width: 15 },
      { header: 'Phí ship', key: 'shipping_fee', width: 12 },
      { header: 'Tổng tiền', key: 'total', width: 15 },
      { header: 'Trạng thái', key: 'payment_status', width: 18 },
      { header: 'Ghi chú', key: 'notes', width: 30 },
    ];
    sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    sheet1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };

    let stt = 1;
    let totalRevenue = 0;
    const dateOptions = { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };

    orders.forEach(order => {
      let ps = 'Chưa thanh toán';
      if (order.payment_status === 'paid') ps = 'Đã thanh toán';
      if (order.payment_status === 'cancelled') ps = 'Đã hủy';

      const total = order.total_price || order.total || 0;
      if (order.payment_status === 'paid') totalRevenue += total;

      sheet1.addRow({
        stt: stt++,
        order_code: order.order_code || order.short_id || order._id.toString().slice(-6),
        created_at: order.created_at ? new Date(order.created_at).toLocaleString('vi-VN', dateOptions) : '',
        customer: order.customer_name || '',
        subtotal: order.subtotal || total,
        shipping_fee: order.shipping_fee || 0,
        total,
        payment_status: ps,
        notes: order.notes || '',
      });
    });

    sheet1.addRow({});
    sheet1.addRow({ stt: '', order_code: 'TỔNG DOANH THU', total: totalRevenue });
    sheet1.getRow(sheet1.rowCount).font = { bold: true };
    sheet1.getColumn(5).numFmt = '#,##0';
    sheet1.getColumn(6).numFmt = '#,##0';
    sheet1.getColumn(7).numFmt = '#,##0';

    const fileName = `bao-cao-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Also support /api/menu-items as alias
router.post('/menu-items', authMiddleware, async (req, res) => {
  try {
    req.body.category = req.body.category_id;
    const menuService = require('../services/menuService');
    const result = await menuService.addItem(req.body);
    if (req.io) req.io.emit('menu-updated', {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
