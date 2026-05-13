/**
 * Application configuration
 * Centralized config management - all env vars accessed from here
 */
module.exports = {
  PORT: process.env.PORT || 3000,
  
  // Database
  MONGO_URI: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb+srv://gacool2k6_db_user:h3kL0DjqVhfCm4d3@cluster0.j0ynlz1.mongodb.net/?appName=Cluster0',
  DB_NAME: process.env.DB_NAME || 'restaurant_qr',
  
  // Shop info (used in bills)
  SHOP: {
    name: 'Bánh Mì Kim Phát',
    tagline: 'Bánh mì tươi ngon mỗi ngày',
    hotline: '0123.456.789',
    address: 'TP. Hồ Chí Minh',
    logoText: 'KP',
  },

  // Payment / Bank info for VietQR
  BANK: {
    bankId: '970415',        // VietinBank
    accountNumber: '102870682710',
    accountName: 'BANH MI KIM PHAT',
    bankName: 'VietinBank',
    template: 'compact',
  },

  // Order config
  ORDER: {
    codePrefix: 'HD',
    defaultShippingFee: 0,
    defaultDiscount: 0,
    dataRetentionDays: 40,
  },

  // Auth
  AUTH: {
    saltRounds: 10,
    defaultAdmin: { username: 'admin', password: 'admin123', role: 'admin' },
    defaultStaff: { username: 'staff', password: 'staff123', role: 'staff' },
  },
};
