/**
 * Order Routes
 */
const express = require('express');
const router = express.Router();
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { validateOrderInput, validateCancelOrder } = require('../middleware/validators');
const orderService = require('../services/orderService');
const config = require('../config');

// Create order (public - customer facing)
router.post('/', validateOrderInput, async (req, res) => {
  try {
    const { table_id, items, notes, customer_name, customer_phone, customer_address, idempotency_key, payment_method } = req.body;
    
    const result = await orderService.createOrder({
      table_id, items, notes,
      customer_name, customer_phone, customer_address,
      idempotency_key,
      payment_method,
    });

    // Emit via socket
    if (!result.duplicate && req.io) {
      req.io.emit('new-order', result.orderData);
    }

    res.json({
      success: true,
      order_id: result.order_id,
      order_code: result.order_code,
      _id: result._id,
      total: result.total,
      subtotal: result.subtotal,
      shipping_fee: result.shipping_fee,
      discount: result.discount,
      payment_method: result.orderData?.payment_method || 'CASH',
      duplicate: result.duplicate || false,
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get all orders
router.get('/', async (req, res) => {
  try {
    const orders = await orderService.getOrders({ payment_status: req.query.payment_status });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single order
router.get('/:id', async (req, res) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Đơn hàng không tồn tại' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get invoice for an order (includes QR info)
router.get('/:id/invoice', async (req, res) => {
  try {
    const invoice = await orderService.getInvoice(req.params.id);
    res.json({ success: true, invoice });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// Checkout (mark as paid)
router.post('/:id/checkout', authMiddleware, async (req, res) => {
  try {
    const paymentMethod = req.body.payment_method || 'CASH';
    await orderService.checkout(req.params.id, paymentMethod);
    if (req.io) req.io.emit('order-updated', { _id: req.params.id, payment_status: 'paid', order_status: 'completed', payment_method: paymentMethod });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Update payment status
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { payment_status, payment_method } = req.body;
    await orderService.updatePaymentStatus(req.params.id, payment_status, payment_method);
    const updatePayload = { _id: req.params.id };
    if (payment_status) updatePayload.payment_status = payment_status;
    if (payment_method) updatePayload.payment_method = payment_method;
    if (req.io) req.io.emit('order-updated', updatePayload);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Update order status
router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { order_status } = req.body;
    const result = await orderService.updateOrderStatus(req.params.id, order_status);
    if (req.io) req.io.emit('order-updated', { _id: req.params.id, order_status, ...result.updateData });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Cancel order
router.post('/:id/cancel', authMiddleware, validateCancelOrder, async (req, res) => {
  try {
    await orderService.cancelOrder(req.params.id, req.body.reason);
    if (req.io) req.io.emit('order-updated', { _id: req.params.id, payment_status: 'cancelled', cancellation_reason: req.body.reason });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete order (admin only)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await orderService.deleteOrder(req.params.id);
    if (req.io) req.io.emit('order-deleted', { _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
