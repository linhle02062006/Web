/**
 * MongoDB connection management
 */
const { MongoClient } = require('mongodb');
const config = require('../config');

let db = null;
let client = null;

async function connectDB() {
  const maxRetries = 5;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      client = new MongoClient(config.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      await client.connect();
      db = client.db(config.DB_NAME);

      // Create indexes
      await Promise.all([
        db.collection('orders').createIndex({ created_at: -1 }),
        db.collection('orders').createIndex({ table_id: 1 }),
        db.collection('orders').createIndex({ payment_status: 1 }),
        db.collection('orders').createIndex({ order_code: 1 }, { unique: true, sparse: true }),
        db.collection('categories').createIndex({ display_order: 1 }),
        db.collection('menu_items').createIndex({ display_order: 1 }),
      ]);

      console.log('✅ MongoDB connected - DB:', config.DB_NAME);
      return true;
    } catch (err) {
      retries++;
      console.log(`⚠️ MongoDB retry ${retries}/${maxRetries}: ${err.message}`);
      if (retries >= maxRetries) {
        db = null;
        return false;
      }
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  return false;
}

function getDB() {
  return db;
}

function getClient() {
  return client;
}

async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

module.exports = { connectDB, getDB, getClient, closeDB };
