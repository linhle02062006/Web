/**
 * Request validation middleware
 */

function validateOrderInput(req, res, next) {
  const { items, customer_name, customer_phone } = req.body;

  const errors = [];

  if (!items || !Array.isArray(items) || items.length === 0) {
    errors.push('Vui lòng chọn ít nhất 1 món');
  } else {
    // Validate each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.id && !item.menu_item_id) {
        errors.push(`Món ${i + 1}: thiếu ID sản phẩm`);
      }
      if (!item.quantity || item.quantity < 1 || !Number.isInteger(item.quantity)) {
        errors.push(`Món ${i + 1}: số lượng không hợp lệ`);
      }
      if (item.quantity > 50) {
        errors.push(`Món ${i + 1}: số lượng tối đa là 50`);
      }
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  next();
}

function validateLogin(req, res, next) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Vui lòng nhập đầy đủ thông tin đăng nhập' });
  }
  if (username.length > 50 || password.length > 100) {
    return res.status(400).json({ success: false, error: 'Thông tin không hợp lệ' });
  }
  next();
}

function validateMenuItem(req, res, next) {
  const { name, price } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Tên món không hợp lệ' });
  }
  if (!price || isNaN(price) || price <= 0) {
    return res.status(400).json({ success: false, error: 'Giá không hợp lệ' });
  }
  next();
}

function validateCancelOrder(req, res, next) {
  const { reason } = req.body;
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Vui lòng chọn lý do hủy đơn' });
  }
  next();
}

module.exports = { validateOrderInput, validateLogin, validateMenuItem, validateCancelOrder };
