# TODO - Nhà Hàng QR (Takeaway) - ĐÃ HOÀN THÀNH

## 1. Server (restaurant-qr/server.js) ✅
- [x] Fix crash TDZ: `loadFromDB()` gọi sau khi khai báo `let menu/orders/tables`
- [x] Lưu đơn hàng vào SQLite (bảng `Orders`) – không còn chỉ dùng RAM
- [x] API đọc lịch sử/xuất Excel query thẳng từ SQLite (`queryOrdersFromDB`)
- [x] `/api/history` nhận `from`, `to`, `q` – validate khoảng tối đa 3 tháng (92 ngày)
- [x] `/api/export/excel` nhận `from`, `to`, tên file theo khoảng ngày, giới hạn 92 ngày
- [x] Thêm CRUD menu: `POST /api/menu`, `PUT /api/menu/:id/toggle`, `DELETE /api/menu/:id`
- [x] Thêm `GET /api/qr/:tableId` (generic QR cho khách)
- [x] Gỡ bỏ hoàn toàn tuyến bếp (`/kitchen`, `join_kitchen`, `kitchen_room`)
- [x] **Cleanup job**: tự động xoá đơn cũ hơn 92 ngày (chạy lúc start + mỗi 24h)
- [x] Trong vòng 3 tháng: lịch sử không cho xoá thủ công (không có endpoint DELETE)

## 2. Trang Customer (restaurant-qr/public/customer/index.html) ✅
- [x] Luôn dùng `tableId=takeaway`, badge hiển thị "Mang đi"
- [x] Socket dùng URL tương đối (chạy mọi host/port)
- [x] Thay "Bếp" → "Nhà hàng" trong UI và ghi chú

## 3. Trang Admin (restaurant-qr/public/admin/index.html) ✅
### Cấu trúc mới (không còn trang Bếp)
- [x] Đổi "Bàn & QR Code" → "QR bán hàng" – chỉ 1 QR duy nhất cho khách mang đi
- [x] Đổi cột "Bàn" → "Khách hàng" (dùng `customerName || tableName`)
- [x] Đổi chỉ số "Bàn đang dùng" → "Đơn chưa thanh toán"

### Notification đơn mới (admin = thu ngân)
- [x] `notifyNewOrder()`: phát beep 2 tiếng (WebAudio)
- [x] Toast nổi góc phải màn hình 4 giây
- [x] Nhấp nháy tab title khi đơn mới + khoá khi user focus tab
- [x] Badge đỏ hiển thị số đơn chưa thanh toán trên nav "Đơn hàng"

### Trang Doanh thu / Lịch sử
- [x] Thanh bộ lọc: From – To + ô tìm kiếm mã đơn / tên khách
- [x] Nút nhanh: Hôm nay / 7 / 30 / 90 ngày / Tất cả
- [x] Giới hạn tối đa 3 tháng (client + server cùng validate)
- [x] `applyFilter()` gọi `/api/history` → query thẳng SQLite (không đụng RAM)
- [x] Thống kê: tổng doanh thu, số đơn đã TT, trung bình/đơn
- [x] Nút "Xuất Excel" truyền `from` / `to` hiện tại

### Responsive
- [x] Sidebar mobile: drawer trượt + overlay
- [x] Topbar: nút ☰ hiện trên mobile
- [x] Stat grid: 4 → 2 → 1 cột theo breakpoint
- [x] Revenue cards: 3 → 2 → 1 cột
- [x] Bảng: `overflow-x:auto`, ẩn cột phụ bằng `.hide-sm` dưới 768px
- [x] Modal QR: scale vừa màn hình điện thoại
- [x] Form thêm món: stack dọc trên mobile
- [x] Filter tabs + date filter: wrap/stack khi chật
- [x] Takeaway QR card: căn giữa, nổi bật với gradient cam

## 4. Kiểm tra ✅
- [x] `GET /admin` → 301 (redirect to `/admin/`) rồi 200
- [x] `GET /customer` → 301 rồi 200
- [x] `GET /kitchen` → 404 (đã gỡ bỏ)
- [x] `GET /api/qr/takeaway` → 200
- [x] `GET /api/menu` → 200, `GET /api/history` → 200
- [x] `GET /api/export/excel` → 200, 8748 bytes
- [x] `GET /api/export/excel?from=2024-10-01&to=2024-12-31` → 200, 8755 bytes
- [x] `GET /api/export/excel?from=2024-01-01&to=2024-12-31` → 400 (vượt 92 ngày) ✓

## Tổng kết
- Đã chuyển hoàn toàn từ bàn ăn sang **takeaway-only**, admin = thu ngân
- Đơn hàng được **persist trong SQLite**, khôi phục sau restart, tự huỷ sau 3 tháng
- UI responsive cho cả desktop và mobile, không còn layout gãy
- Có âm báo + toast + badge + title nhấp nháy khi có đơn mới
