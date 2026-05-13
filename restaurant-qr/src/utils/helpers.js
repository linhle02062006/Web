/**
 * Utility helpers
 */
const config = require('../config');
const { getDB } = require('../database/connection');

/**
 * Generate a unique order code like DH20260513001
 */
async function generateOrderCode() {
  const db = getDB();
  try {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    
    const result = await db.collection('counters').findOneAndUpdate(
      { _id: `order_${dateStr}` },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    const num = result.seq || result.value?.seq || 1;
    return `${config.ORDER.codePrefix}${dateStr}${String(num).padStart(3, '0')}`;
  } catch (err) {
    // Fallback: timestamp-based code
    const ts = Date.now().toString(36).toUpperCase();
    return `${config.ORDER.codePrefix}${ts}`;
  }
}

/**
 * Generate a short display ID (kept for backward compat)
 */
async function generateShortId() {
  const db = getDB();
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

/**
 * Build VietQR URL for payment
 */
function buildVietQRUrl(amount, orderCode) {
  const { bankId, accountNumber, template } = config.BANK;
  const addInfo = `THANH TOAN ${orderCode}`;
  return `https://img.vietqr.io/image/${bankId}-${accountNumber}-${template}.png?amount=${amount}&addInfo=${encodeURIComponent(addInfo)}`;
}

/**
 * Format currency for display
 */
function formatCurrency(amount) {
  return (amount || 0).toLocaleString('vi-VN') + 'đ';
}

/**
 * Format date for Vietnamese locale
 */
function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

module.exports = {
  generateOrderCode,
  generateShortId,
  buildVietQRUrl,
  formatCurrency,
  formatDate,
};
