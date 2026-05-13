/**
 * Database seeding and initialization
 */
const bcrypt = require('bcryptjs');
const config = require('../config');
const { getDB } = require('./connection');

async function seedDataIfEmpty() {
  const db = getDB();
  if (!db) return;

  try {
    const count = await db.collection('menu_items').countDocuments();
    if (count > 0) {
      console.log(`   📋 ${count} menu items`);
      return;
    }

    console.log('   🌱 Seeding...');
    const cats = [
      { name: 'Bánh mì', display_order: 1 },
      { name: 'Nước uống', display_order: 2 },
      { name: 'Combo', display_order: 3 },
    ];
    await db.collection('categories').insertMany(cats);

    const items = [
      { name: 'Bánh mì chả cá', price: 25000, category_id: 'Bánh mì', description: '', image: '/menu/banhmichaca.jpg', display_order: 1 },
      { name: 'Bánh mì pate', price: 20000, category_id: 'Bánh mì', description: '', image: '/menu/banhmicalua.jpg', display_order: 2 },
      { name: 'Bánh mì xá xíu', price: 30000, category_id: 'Bánh mì', description: '', image: '/menu/banhmidacbiet.jpg', display_order: 3 },
      { name: 'Bánh mì trứng', price: 18000, category_id: 'Bánh mì', description: '', image: '/menu/banhmichatrung.jpg', display_order: 4 },
      { name: 'Cà phê sữa đá', price: 20000, category_id: 'Nước uống', description: '', image: '', display_order: 5 },
      { name: 'Trà đá', price: 15000, category_id: 'Nước uống', description: '', image: '', display_order: 6 },
      { name: 'Nước cam', price: 25000, category_id: 'Nước uống', description: '', image: '', display_order: 7 },
      { name: 'Combo 1', price: 45000, category_id: 'Combo', description: 'Bánh mì + Nước', image: '', display_order: 8 },
      { name: 'Combo 2', price: 55000, category_id: 'Combo', description: 'Bánh mì + Trà', image: '', display_order: 9 },
    ];
    await db.collection('menu_items').insertMany(items);
    console.log('   ✅ Seeded 9 items');
  } catch (err) {
    console.log('   ⚠️ Seed error:', err.message);
  }
}

async function ensureAdminUser() {
  const db = getDB();
  if (!db) return;

  try {
    // Admin user
    const existing = await db.collection('admin_users').findOne({ username: config.AUTH.defaultAdmin.username });
    if (!existing) {
      const hash = await bcrypt.hash(config.AUTH.defaultAdmin.password, config.AUTH.saltRounds);
      await db.collection('admin_users').insertOne({
        username: config.AUTH.defaultAdmin.username,
        password: hash,
        role: config.AUTH.defaultAdmin.role,
        created_at: new Date(),
      });
      console.log(`   🔑 Admin user created (${config.AUTH.defaultAdmin.username})`);
    } else if (!existing.role) {
      await db.collection('admin_users').updateOne(
        { username: config.AUTH.defaultAdmin.username },
        { $set: { role: 'admin' } }
      );
    }

    // Staff user
    const existingStaff = await db.collection('admin_users').findOne({ username: config.AUTH.defaultStaff.username });
    if (!existingStaff) {
      const hash = await bcrypt.hash(config.AUTH.defaultStaff.password, config.AUTH.saltRounds);
      await db.collection('admin_users').insertOne({
        username: config.AUTH.defaultStaff.username,
        password: hash,
        role: config.AUTH.defaultStaff.role,
        created_at: new Date(),
      });
      console.log(`   🔑 Staff user created (${config.AUTH.defaultStaff.username})`);
    }
  } catch (err) {
    console.log('   ⚠️ Admin user error:', err.message);
  }
}

async function cleanupOldData() {
  const db = getDB();
  if (!db) return;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.ORDER.dataRetentionDays);

  try {
    const result = await db.collection('orders').deleteMany({ created_at: { $lt: cutoff } });
    if (result.deletedCount > 0) {
      console.log(`   🧹 Cleanup: Deleted ${result.deletedCount} orders older than ${config.ORDER.dataRetentionDays} days`);
    }
  } catch (e) {
    console.error('   ⚠️ Cleanup error:', e.message);
  }
}

module.exports = { seedDataIfEmpty, ensureAdminUser, cleanupOldData };
