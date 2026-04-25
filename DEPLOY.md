# 🚀 Hướng dẫn deploy lên Render

## ✅ Cập nhật mới nhất (25/04/2026)

- **Database**: MongoDB (dữ liệu được lưu vĩnh viễn)
- **Export Excel**: `/api/export/excel` với 3 sheet (danh sách đơn, chi tiết món, thống kê)
- **Persistence**: Dữ liệu không bị mất khi thoát web

---

## ❗ Lỗi hiện tại của bạn

```
Error: ... better_sqlite3.node: invalid ELF header
==> Running build command 'npm install'...
up to date, audited 432 packages in 1s   ← dấu hiệu sai!
```

**Nguyên nhân**: Bạn đã commit thư mục `node_modules/` (build trên Windows) lên GitHub. Render chạy Linux nên không load được file `.node` (DLL Windows).

---

## ✅ CÁC BƯỚC FIX (làm theo thứ tự)

### Bước 1 — Xoá `node_modules` khỏi Git & push lại

Mở terminal tại thư mục repo (`d:/restaurant-qr-system`), chạy:

```bash
# Xoá node_modules khỏi Git (vẫn giữ trên máy local)
git rm -r --cached restaurant-qr/node_modules
git rm -r --cached node_modules  2>$null
git rm --cached restaurant-qr/restaurant.db  2>$null
git rm --cached package.json package-lock.json 2>$null

# Commit các file đã sửa
git add .gitignore render.yaml restaurant-qr/package.json restaurant-qr/server.js DEPLOY.md
git commit -m "Fix Render deploy: remove node_modules, pin Node 20, add render.yaml"

# Push lên GitHub
git push origin main
```

### Bước 2 — Cấu hình MongoDB trên Render

1. Vào https://dashboard.render.com/
2. **New +** → **MongoDB** (hoặc dùng MongoDB Atlas free)
3. Lấy connection string (URI)
4. Vào service **restaurant-qr** → **Environment**
5. Thêm biến:
   - `MONGODB_URI`: `mongodb+srv://gacool2k6_db_user:h3kL0DjqVhfCm4d3@cluster0.j0ynlz1.mongodb.net/?appName=Cluster0`
   - `DB_NAME`: `restaurant_qr`

### Bước 3 — Render sẽ tự redeploy

Nhờ `autoDeploy: true` trong `render.yaml`, Render thấy commit mới sẽ tự build lại.

**HOẶC** bạn vào Render dashboard → service → **Manual Deploy** → *Clear build cache & deploy* (để xoá cache node_modules Linux cũ nếu có).

### Bước 4 — Kiểm tra build log

Lần này phải thấy:
```
==> Running build command 'npm install'...
added 245 packages, and audited 246 packages in 15s   ← build lại thật sự
```
Và:
```
✅ Kết nối MongoDB thành công
   Database: restaurant_qr
Server đang chạy tại http://localhost:3000
```

---

## 🔧 Cách tạo Service trên Render (lần đầu)

### Cách A — Dùng Blueprint (khuyên dùng)

1. Vào https://dashboard.render.com/blueprints
2. **New Blueprint Instance** → chọn repo GitHub
3. Render tự đọc `render.yaml` → xác nhận & tạo service

### Cách B — Tạo thủ công

1. **New +** → **Web Service** → kết nối repo GitHub
2. Điền form:
   - **Name**: `restaurant-qr`
   - **Region**: Singapore (gần VN)
   - **Branch**: `main`
   - **Root Directory**: `restaurant-qr`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
3. Trong phần **Environment**, thêm:
   - `MONGODB_URI`: URI từ MongoDB Atlas hoặc Render MongoDB
   - `DB_NAME`: `restaurant_qr`

---

## 📊 API Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/menu` | Lấy danh sách menu |
| GET | `/api/orders` | Lấy danh sách đơn hàng |
| POST | `/api/orders` | Tạo đơn hàng mới |
| PATCH | `/api/orders/:id` | Cập nhật trạng thái đơn |
| GET | `/api/history` | Lịch sử đơn hàng (filter: today/week/month/completed) |
| GET | `/api/export/excel` | **Export Excel** (params: start_date, end_date, status) |
| GET | `/api/stats` | Thống kê nhanh |

### Ví dụ export Excel:
```
GET /api/export/excel?start_date=2026-04-01&end_date=2026-04-25&status=completed
```
   - **Root Directory**: `restaurant-qr`  ⬅️ **RẤT QUAN TRỌNG**
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free (hoặc Starter nếu muốn disk)
3. **Environment Variables** (Advanced):
   - `NODE_VERSION` = `20.18.0`
   - `DATA_DIR` = `/var/data` (chỉ khi có disk)
4. **Create Web Service**

---

## 🧪 Test sau deploy

Khi Render hiển thị trạng thái `Live` (chấm xanh):

- Admin: `https://<your-app>.onrender.com/admin`
- Khách đặt món: `https://<your-app>.onrender.com/customer?table=takeaway`
- QR cho khách: Vào admin → tab "QR bán hàng" → tải QR về in dán

---

## 🐛 Troubleshoot

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| `invalid ELF header` | `node_modules` commit từ Windows | Bước 1 ở trên |
| `Cannot find module 'better-sqlite3'` | Build cache cũ | Manual deploy → *Clear build cache* |
| Port conflict / `EADDRINUSE` | Hardcode port | Code đã dùng `process.env.PORT` ✓ |
| `SQLITE_CANTOPEN` | DATA_DIR không tồn tại | Code tự `mkdirSync` → OK |
| Dữ liệu mất sau deploy | Free tier ephemeral | Nâng plan Starter + disk |
| 502 Bad Gateway | App chưa listen xong healthcheck | Đã set `healthCheckPath: /api/menu` |
| App sleep sau 15 phút idle | Free tier chính sách | Dùng UptimeRobot ping mỗi 10 phút, hoặc nâng plan |
