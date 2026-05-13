/**
 * Menu Service - Business logic for menu management
 */
const { ObjectId } = require('mongodb');
const { getDB } = require('../database/connection');

class MenuService {
  async getPublicMenu() {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const [categories, items] = await Promise.all([
      db.collection('categories').find({ is_hidden: { $ne: true } }).sort({ display_order: 1 }).toArray(),
      db.collection('menu_items').find({ is_hidden: { $ne: true } }).sort({ display_order: 1 }).toArray(),
    ]);

    return {
      categories: categories.map(c => ({ ...c, _id: c._id.toString() })),
      items: items.map(i => ({ ...i, _id: i._id.toString() })),
    };
  }

  async getAllItems() {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const items = await db.collection('menu_items').find({}).sort({ display_order: 1 }).toArray();
    return items.map(i => ({ ...i, _id: i._id.toString() }));
  }

  async addCategory({ name, display_order }) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const result = await db.collection('categories').insertOne({
      name,
      display_order: display_order || 0,
      is_hidden: false,
      created_at: new Date(),
    });

    return { success: true, category_id: result.insertedId.toString() };
  }

  async addItem({ name, price, category, category_id, description, image }) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const maxOrder = await db.collection('menu_items').find().sort({ display_order: -1 }).limit(1).toArray();
    const nextOrder = (maxOrder[0]?.display_order || 0) + 1;

    const item = {
      name: name.trim(),
      price: parseFloat(price),
      category_id: category_id || category || 'Khác',
      description: (description || '').trim(),
      image: image || '',
      display_order: nextOrder,
      is_hidden: false,
      created_at: new Date(),
    };

    const result = await db.collection('menu_items').insertOne(item);
    return { success: true, item_id: result.insertedId.toString() };
  }

  async toggleItem(id) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const item = await db.collection('menu_items').findOne({ _id: new ObjectId(id) });
    if (!item) throw new Error('Không tìm thấy sản phẩm');

    await db.collection('menu_items').updateOne(
      { _id: new ObjectId(id) },
      { $set: { is_hidden: !item.is_hidden } }
    );

    return { success: true, is_hidden: !item.is_hidden };
  }

  async deleteItem(id) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    await db.collection('menu_items').deleteOne({ _id: new ObjectId(id) });
    return { success: true };
  }

  async uploadImage(imageData) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    if (!imageData || !imageData.startsWith('data:image/')) {
      throw new Error('Invalid image data');
    }

    const result = await db.collection('images').insertOne({
      data: imageData,
      created_at: new Date(),
    });

    return { success: true, url: `/api/images/${result.insertedId.toString()}` };
  }

  async getImage(id) {
    const db = getDB();
    if (!db) throw new Error('Database not available');

    const img = await db.collection('images').findOne({ _id: new ObjectId(id) });
    if (!img) return null;

    const matches = img.data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) return null;

    return {
      ext: matches[1],
      buffer: Buffer.from(matches[2], 'base64'),
    };
  }
}

module.exports = new MenuService();
