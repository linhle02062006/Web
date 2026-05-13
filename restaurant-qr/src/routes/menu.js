/**
 * Menu Routes
 */
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { validateMenuItem } = require('../middleware/validators');
const menuService = require('../services/menuService');

// Get public menu (customer facing)
router.get('/', async (req, res) => {
  try {
    const data = await menuService.getPublicMenu();
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all items (admin - including hidden)
router.get('/all', authMiddleware, async (req, res) => {
  try {
    const items = await menuService.getAllItems();
    res.json(items);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add menu item
router.post('/', authMiddleware, validateMenuItem, async (req, res) => {
  try {
    const result = await menuService.addItem(req.body);
    if (req.io) req.io.emit('menu-updated', {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Toggle item visibility
router.put('/:id/toggle', authMiddleware, async (req, res) => {
  try {
    const result = await menuService.toggleItem(req.params.id);
    if (req.io) req.io.emit('menu-updated', {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete item
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await menuService.deleteItem(req.params.id);
    if (req.io) req.io.emit('menu-updated', {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
