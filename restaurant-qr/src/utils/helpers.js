/**
 * Utility helpers
 */
const config = require('../config');
const { getDB } = require('../database/connection');

/**
 * Generate a short readable order code like HD260513 (format: PREFIX + YYMM + DD + SEQ)
 * Examples: HD260513, HD260514, HD26052001
 */
async function generateOrderCode() {
  const db = getDB();
  try {
    const today = new Date();
    const year = today.getFullYear().toString().slice(-2);
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateKey = `${year}${month}${day}`;

    const result = await db.collection('counters').findOneAndUpdate(
      { _id: `order_${dateKey}` },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    const num = result.seq || result.value?.seq || 1;

    // Format: PREFIX + YYMMDD + 2-digit sequence
    // Example: HD260513, HD260514, HD26052001
    if (num < 100) {
      return `${config.ORDER.codePrefix}${dateKey}${String(num).padStart(2, '0')}`;
    }
    return `${config.ORDER.codePrefix}${dateKey}${String(num).padStart(4, '0')}`;
  } catch (err) {
    // Fallback: timestamp-based code
    const ts = Date.now().toString(36).toUpperCase();
    return `${config.ORDER.codePrefix}${ts.slice(-6)}`;
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
