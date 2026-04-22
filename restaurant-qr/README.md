# 🍜 Hệ Thống Order Đồ Ăn Bằng QR Code

## Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────┐
│                     SERVER (Node.js)                    │
│           Express + Socket.io + QRCode                  │
└───────────┬─────────────────┬───────────────────────────┘
            │ REST API        │ WebSocket (real-time)
     ┌──────▼──────┐   ┌──────▼──────┐   ┌──────────────┐
     │  /customer  │   │  /kitchen   │   │   /admin     │
     │  Khách đặt  │   │  Màn hình   │   │  Quản trị    │
     │  món bằng   │◄──│    bếp      │◄──│  + QR Gen    │
     │  điện thoại │   │  real-time  │   │  + Menu      │
     └─────────────┘   └─────────────┘   └──────────────┘
```

## Tính năng

### 📱 Trang khách hàng (`/customer?table=table_1`)
- Xem menu theo danh mục
- Thêm/bớt món vào giỏ hàng
- Ghi chú cho bếp
- Đặt món và nhận xác nhận real-time
- Theo dõi trạng thái đơn hàng

### 👨‍🍳 Màn hình bếp (`/kitchen`)
- Nhận đơn mới real-time (có âm thanh thông báo)
- 3 cột: Đơn mới → Đang nấu → Xong
- Cập nhật trạng thái từng món
- Tính giờ chờ cho mỗi đơn

### ⚙️ Trang quản trị (`/admin`)
- Dashboard tổng quan
- Tạo và tải QR code cho từng bàn
- Quản lý đơn hàng (thanh toán)
- Thêm/xóa/ẩn món trong menu
- Thống kê doanh thu

---

## Cài đặt và chạy

### Yêu cầu
- Node.js 16+ (tải tại https://nodejs.org)

### Bước 1: Cài thư viện
```bash
cd restaurant-qr
npm install
```

### Bước 2: Chạy server
```bash
npm start
# hoặc để tự reload khi sửa code:
npm run dev
```

### Bước 3: Truy cập
- **Trang quản trị**: http://localhost:3000/admin
- **Màn hình bếp**: http://localhost:3000/kitchen
- **Test khách hàng**: http://localhost:3000/customer?table=table_1

---

## Quy trình sử dụng

```
1. Admin vào /admin → Bàn & QR Code → Tải QR về in
2. In QR dán lên bàn
3. Bếp mở /kitchen trên màn hình lớn
4. Khách quét QR bằng điện thoại
5. Khách chọn món → Đặt hàng
6. Bếp nhận thông báo tức thì
7. Bếp nấu xong → Bấm "Hoàn thành"
8. Admin bấm "Thanh toán" khi khách trả tiền
```

---

## Deploy lên mạng (để dùng thực tế)

### Cách 1: Railway (miễn phí, dễ nhất)
1. Tạo tài khoản tại https://railway.app
2. Kết nối GitHub và push code lên
3. Railway tự động deploy
4. Lấy URL dạng: `https://your-app.railway.app`

### Cách 2: Render
1. Tạo tài khoản tại https://render.com
2. Tạo Web Service mới
3. Chọn "Free" tier
4. Deploy tự động

### Cách 3: VPS (DigitalOcean/Vultr)
```bash
# Cài Node.js và PM2
npm install -g pm2
pm2 start server.js --name restaurant
pm2 startup
pm2 save
```

> ⚠️ Khi deploy, thay `http://localhost:3000` bằng domain thật
> QR code sẽ tự động dùng đúng domain

---

## Cấu trúc thư mục

```
restaurant-qr/
├── server.js              # Server chính
├── package.json
├── README.md
└── public/
    ├── customer/
    │   └── index.html     # Trang đặt món cho khách
    ├── kitchen/
    │   └── index.html     # Màn hình bếp
    └── admin/
        └── index.html     # Trang quản trị
```

---

## Tuỳ chỉnh

### Đổi tên nhà hàng
Trong `public/customer/index.html`, tìm và đổi:
```html
🍜 Nhà Hàng Của Bạn
```

### Thêm bàn
Trong `server.js`, đổi `8` thành số bàn bạn muốn:
```js
for (let i = 1; i <= 8; i++) {  // ← đổi số này
```

### Lưu dữ liệu vào database
Hiện tại data lưu trong RAM (mất khi restart).
Để lưu lâu dài, cần thêm MongoDB hoặc SQLite:
```bash
npm install mongoose  # MongoDB
# hoặc
npm install better-sqlite3  # SQLite (đơn giản hơn)
```
