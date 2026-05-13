/**
 * Authentication middleware
 */
const sessions = {};

function authMiddleware(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token || !sessions[token]) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  req.adminUser = sessions[token];
  next();
}

function adminOnly(req, res, next) {
  if (req.adminUser && req.adminUser.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
}

function getSessions() {
  return sessions;
}

module.exports = { authMiddleware, adminOnly, getSessions };
