/**
 * Auth Service - Authentication business logic
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDB } = require('../database/connection');
const { getSessions } = require('../middleware/auth');

class AuthService {
  async login(username, password) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const user = await db.collection('admin_users').findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new Error('Sai tên đăng nhập hoặc mật khẩu');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const sessions = getSessions();
    sessions[token] = {
      username: user.username,
      id: user._id.toString(),
      role: user.role || 'admin',
    };

    return {
      success: true,
      token,
      username: user.username,
      role: user.role || 'admin',
    };
  }

  check(token) {
    const sessions = getSessions();
    if (token && sessions[token]) {
      return {
        authenticated: true,
        username: sessions[token].username,
        role: sessions[token].role,
      };
    }
    return { authenticated: false };
  }

  logout(token) {
    const sessions = getSessions();
    if (token) delete sessions[token];
    return { success: true };
  }
}

module.exports = new AuthService();
