/**
 * Auth Routes
 */
const express = require('express');
const router = express.Router();
const { validateLogin } = require('../middleware/validators');
const authService = require('../services/authService');

// Login
router.post('/login', validateLogin, async (req, res) => {
  try {
    const result = await authService.login(req.body.username, req.body.password);
    res.json(result);
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

// Check auth
router.get('/check', (req, res) => {
  const token = req.headers['x-auth-token'];
  res.json(authService.check(token));
});

// Logout
router.post('/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  res.json(authService.logout(token));
});

module.exports = router;
