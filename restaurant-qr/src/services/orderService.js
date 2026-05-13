/**
 * Order Service - Business logic for orders
 * Critical fix: Server-side price validation to prevent price manipulation
 */
const { ObjectId } = require('mongodb');
const { getDB } = require('../database/connection');
const { generateOrderCode, generateShortId, buildVietQRUrl } = require('../utils/helpers');
const config = require('../config');

class OrderService {
  /**
   * Create a new order with server-side price validation
   * FIX: Prices are looked up from the DB, not trusted from client
   */
  async createOrder({ table_id, items, notes, customer_name, customer_phone, customer_address, idempotency_key, payment_method }) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    // Validate payment method
    const validPaymentMethods = ['CASH', 'BANK_TRANSFER'];
    const orderPaymentMethod = validPaymentMethods.includes(payment_method) ? payment_method : 'CASH';

    // Idempotency check: prevent duplicate orders on refresh
    if (idempotency_key) {
      const existing = await db.collection('orders').findOne({ idempotency_key });
      if (existing) {
        return {
          success: true,
          duplicate: true,
          order_id: existing.short_id,
          order_code: existing.order_code,
          _id: existing._id.toString(),
          total: existing.total_price,
        };
      }
    }

    // Collect all menu item IDs from the request
    const itemIds = items.map(i => i.id || i.menu_item_id).filter(Boolean);
    
    // FIX: Lookup actual prices from database instead of trusting client
    const menuItems = await db.collection('menu_items').find({
      _id: { $in: itemIds.map(id => {
        try { return new ObjectId(id); } catch { return id; }
      }) }
    }).toArray();

    // Build a lookup map: string ID -> menu item
    const menuMap = {};
    menuItems.forEach(m => {
      menuMap[m._id.toString()] = m;
    });

    // Validate and build order items with server-side prices
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const itemId = item.id || item.menu_item_id;
      const menuItem = menuMap[itemId];

      if (!menuItem) {
        throw new Error(`Sản phẩm "${item.name || itemId}" không tồn tại hoặc đã ngừng bán`);
      }

      if (menuItem.is_hidden) {
        throw new Error(`Sản phẩm "${menuItem.name}" hiện không khả dụng`);
      }

      const quantity = Math.max(1, Math.min(50, parseInt(item.quantity) || 1));
      const serverPrice = menuItem.price; // Use DB price, not client price
      const itemSubtotal = serverPrice * quantity;

      orderItems.push({
        menu_item_id: itemId,
        name: menuItem.name,
        price: serverPrice,
        quantity,
        subtotal: itemSubtotal,
      });

      subtotal += itemSubtotal;
    }

    const shippingFee = config.ORDER.defaultShippingFee;
    const discount = config.ORDER.defaultDiscount;
    const totalPrice = subtotal + shippingFee - discount;

    const [orderCode, shortId] = await Promise.all([
      generateOrderCode(),
      generateShortId(),
    ]);

    const order = {
      short_id: shortId,
      order_code: orderCode,
      table_id: String(table_id || 'takeaway'),
      customer_name: (customer_name || '').trim(),
      customer_phone: (customer_phone || '').trim(),
      customer_address: (customer_address || '').trim(),
      items: orderItems,
      notes: (notes || '').trim(),
      subtotal,
      shipping_fee: shippingFee,
      discount,
      total_price: totalPrice,
      // Backward compat
      total: totalPrice,
      payment_method: orderPaymentMethod,
      payment_status: 'unpaid',
      order_status: 'pending',
      idempotency_key: idempotency_key || null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const result = await db.collection('orders').insertOne(order);
    const orderData = { ...order, _id: result.insertedId.toString() };

    return {
      success: true,
      order_id: shortId,
      order_code: orderCode,
      _id: result.insertedId.toString(),
      total: totalPrice,
      subtotal,
      shipping_fee: shippingFee,
      discount,
      orderData,
    };
  }

  /**
   * Get all orders with optional filtering
   */
  async getOrders({ payment_status, limit = 200 } = {}) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    let query = {};
    if (payment_status && payment_status !== 'all') {
      query.payment_status = payment_status;
    }

    const orders = await db.collection('orders')
      .find(query)
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();

    return orders.map(o => ({ ...o, _id: o._id.toString() }));
  }

  /**
   * Get a single order by ID
   */
  async getOrderById(id) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const order = await db.collection('orders').findOne({ _id: new ObjectId(id) });
    if (!order) return null;
    return { ...order, _id: order._id.toString() };
  }

  /**
   * Get order by order_code (for invoice/bill lookup)
   */
  async getOrderByCode(code) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const order = await db.collection('orders').findOne({
      $or: [
        { order_code: code },
        { short_id: code },
      ]
    });
    if (!order) return null;
    return { ...order, _id: order._id.toString() };
  }

  /**
   * Mark order as paid
   */
  async checkout(id, payment_method) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const updateData = { payment_status: 'paid', order_status: 'completed', updated_at: new Date() };
    if (payment_method) {
      updateData.payment_method = payment_method;
    }

    const result = await db.collection('orders').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) throw new Error('Đơn hàng không tồn tại');
    return { success: true };
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(id, payment_status, payment_method) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const updateData = { updated_at: new Date() };
    if (payment_status) updateData.payment_status = payment_status;
    if (payment_method) updateData.payment_method = payment_method;

    if (Object.keys(updateData).length === 1) return { success: true }; // Only updated_at

    const result = await db.collection('orders').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) throw new Error('Đơn hàng không tồn tại');
    return { success: true };
  }

  /**
   * Update order status
   */
  async updateOrderStatus(id, order_status) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const valid = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!valid.includes(order_status)) throw new Error('Trạng thái không hợp lệ');

    const updateData = { order_status, updated_at: new Date() };
    if (order_status === 'cancelled') updateData.payment_status = 'cancelled';
    if (order_status === 'completed') updateData.payment_status = 'paid';

    const result = await db.collection('orders').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) throw new Error('Đơn hàng không tồn tại');
    return { success: true, updateData };
  }

  /**
   * Cancel an order
   */
  async cancelOrder(id, reason) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const result = await db.collection('orders').updateOne(
      { _id: new ObjectId(id) },
      { $set: { payment_status: 'cancelled', order_status: 'cancelled', cancellation_reason: reason, updated_at: new Date() } }
    );

    if (result.matchedCount === 0) throw new Error('Đơn hàng không tồn tại');
    return { success: true };
  }

  /**
   * Delete an order (admin only)
   */
  async deleteOrder(id) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const result = await db.collection('orders').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) throw new Error('Đơn hàng không tồn tại');
    return { success: true };
  }

  /**
   * Get invoice data for an order (includes VietQR info)
   */
  async getInvoice(id) {
    const order = await this.getOrderById(id);
    if (!order) throw new Error('Đơn hàng không tồn tại');

    const orderCode = order.order_code || order.short_id;
    const totalPrice = order.total_price || order.total;
    const paymentMethod = order.payment_method || 'CASH';

    return {
      ...order,
      shop: config.SHOP,
      bank: config.BANK,
      qr_url: paymentMethod === 'BANK_TRANSFER' ? buildVietQRUrl(totalPrice, orderCode) : null,
      transfer_content: `THANH TOAN ${orderCode}`,
      payment_method_display: paymentMethod === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản',
    };
  }

  /**
   * Get order history with filters
   */
  async getHistory({ from, to, q, filter } = {}) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - config.ORDER.dataRetentionDays);
    let query = { created_at: { $gte: cutoff } };

    if (from || to) {
      query.created_at = {};
      if (from) {
        const fromDate = new Date(from + 'T00:00:00');
        query.created_at.$gte = fromDate > cutoff ? fromDate : cutoff;
      } else {
        query.created_at.$gte = cutoff;
      }
      if (to) {
        const end = new Date(to + 'T23:59:59.999');
        query.created_at.$lte = end;
      }
    } else if (filter && filter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (filter === 'today') query.created_at = { $gte: today };
      else if (filter === 'week') {
        const d = new Date(today);
        d.setDate(d.getDate() - 7);
        query.created_at = { $gte: d };
      } else if (filter === 'month') {
        const d = new Date(today);
        d.setMonth(d.getMonth() - 1);
        query.created_at = { $gte: d > cutoff ? d : cutoff };
      }
    }

    if (q) {
      query.$or = [
        { short_id: { $regex: q, $options: 'i' } },
        { order_code: { $regex: q, $options: 'i' } },
        { customer_name: { $regex: q, $options: 'i' } },
      ];
    }

    const orders = await db.collection('orders')
      .find(query)
      .sort({ created_at: -1 })
      .limit(500)
      .toArray();

    return orders.map(o => ({ ...o, _id: o._id.toString() }));
  }

  /**
   * Get dashboard stats
   */
  async getStats() {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayOrders, unpaidOrders, paidToday, revenueToday] = await Promise.all([
      db.collection('orders').countDocuments({ created_at: { $gte: today } }),
      db.collection('orders').countDocuments({ payment_status: 'unpaid' }),
      db.collection('orders').countDocuments({ payment_status: 'paid', created_at: { $gte: today } }),
      db.collection('orders').aggregate([
        { $match: { payment_status: 'paid', created_at: { $gte: today } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$total_price', '$total'] } } } },
      ]).toArray(),
    ]);

    return {
      today_total: todayOrders,
      unpaid: unpaidOrders,
      paid_today: paidToday,
      revenue_today: revenueToday[0]?.total || 0,
    };
  }

  /**
   * Get top selling products
   */
  async getTopProducts() {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    return db.collection('orders').aggregate([
      { $match: { payment_status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', total_qty: { $sum: '$items.quantity' }, total_revenue: { $sum: '$items.subtotal' } } },
      { $sort: { total_qty: -1 } },
      { $limit: 5 },
    ]).toArray();
  }

  /**
   * Get revenue chart data (last 7 days)
   */
  async getChartData() {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);

      const rev = await db.collection('orders').aggregate([
        { $match: { payment_status: 'paid', created_at: { $gte: d, $lt: next } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$total_price', '$total'] } }, count: { $sum: 1 } } },
      ]).toArray();

      days.push({
        date: d.toISOString().split('T')[0],
        revenue: rev[0]?.total || 0,
        orders: rev[0]?.count || 0,
      });
    }

    return days;
  }
}

module.exports = new OrderService();
