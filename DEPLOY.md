# 🚀 Hướng dẫn deploy lên Render

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

### Bước 2 — Render sẽ tự redeploy

Nhờ `autoDeploy: true` trong `render.yaml`, Render thấy commit mới sẽ tự build lại.

**HOẶC** bạn vào Render dashboard → service → **Manual Deploy** → *Clear build cache & deploy* (để xoá cache node_modules Linux cũ nếu có).

### Bước 3 — Kiểm tra build log

Lần này phải thấy:
```
==> Running build command 'npm install'...
added 245 packages, and audited 246 packages in 15s   ← build lại thật sự
```
Và:
```
📂 DB path: /opt/render/project/src/restaurant-qr/restaurant.db
✅ Kết nối SQLite thành công
📋 Đã tải 7 món, 1 bàn, 0 đơn
Server Bánh Mì Chả Cá đang chạy cổng 10000
```

---

## ⚠️ LƯU Ý QUAN TRỌNG về SQLite trên Render Free

**Render free tier có filesystem EPHEMERAL** → mỗi lần deploy / service sleep 15 phút, ổ đĩa bị reset → **dữ liệu đơn hàng & menu sẽ mất**.

### Giải pháp

| Giải pháp | Chi phí | Ưu/nhược |
|---|---|---|
| **Persistent Disk** (Render Starter) | $7/tháng | Mount `/var/data`, data không mất. Bỏ comment block `disk` trong `render.yaml` |
| **Chuyển sang PostgreSQL Render** | Free (90 ngày) | Cần refactor code từ `better-sqlite3` sang `pg` |
| **Upstash Redis / Turso (SQLite cloud)** | Free tier | Cần refactor, nhưng ít thay đổi nhất |
| **Chấp nhận dữ liệu tạm** | $0 | Test / demo thôi, không production được |

### Nâng cấp có disk persistent

1. Render dashboard → Service → **Settings** → đổi plan từ `Free` → `Starter` ($7/tháng)
2. Mở `render.yaml`, bỏ comment block:
   ```yaml
   disk:
     name: data
     mountPath: /var/data
     sizeGB: 1
   ```
3. Commit & push → Render sẽ mount disk vào `/var/data`. DB tự tạo ở đó (qua env `DATA_DIR`).

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
