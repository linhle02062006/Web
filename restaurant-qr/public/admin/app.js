const socket = io();
let token = localStorage.getItem('admin_token') || '';
let orders = [];
let menuItems = [];
let menuCats = [];
let orderFilter = 'all';
let historyList = [];

// ===== AUTH =====
async function checkAuth() {
  if (!token) { showLogin(); return; }
  try {
    const r = await api('/api/auth/check');
    if (r.authenticated) { localStorage.setItem('admin_role', r.role); showApp(); }
    else { token = ''; localStorage.removeItem('admin_token'); localStorage.removeItem('admin_role'); showLogin(); }
  } catch { showLogin(); }
}

function showLogin() { document.getElementById('loginWrap').style.display = 'flex'; document.getElementById('app').style.display = 'none'; }
function showApp() { 
  document.getElementById('loginWrap').style.display = 'none'; 
  document.getElementById('app').style.display = 'block'; 
  
  const role = localStorage.getItem('admin_role');
  if (role === 'staff') {
    if(document.getElementById('nav-qr')) document.getElementById('nav-qr').style.display = 'none';
    if(document.getElementById('nav-menu')) document.getElementById('nav-menu').style.display = 'none';
    if(document.getElementById('nav-rev')) document.getElementById('nav-rev').style.display = 'none';
  } else {
    if(document.getElementById('nav-qr')) document.getElementById('nav-qr').style.display = 'block';
    if(document.getElementById('nav-menu')) document.getElementById('nav-menu').style.display = 'block';
    if(document.getElementById('nav-rev')) document.getElementById('nav-rev').style.display = 'block';
  }
  loadData(); 
}

async function doLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const err = document.getElementById('loginErr');
  if (!u || !p) { err.textContent = 'Nhập đầy đủ thông tin'; err.style.display = 'block'; return; }
  try {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    const d = await r.json();
    if (d.success) { token = d.token; localStorage.setItem('admin_token', token); localStorage.setItem('admin_role', d.role); showApp(); }
    else { err.textContent = d.error || 'Sai thông tin'; err.style.display = 'block'; }
  } catch (e) { err.textContent = 'Lỗi kết nối'; err.style.display = 'block'; }
}

async function doLogout() {
  try { await api('/api/auth/logout', 'POST'); } catch {}
  token = ''; localStorage.removeItem('admin_token'); localStorage.removeItem('admin_role'); showLogin();
}

function api(url, method, body) {
  const opts = { method: method || 'GET', headers: { 'x-auth-token': token } };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  return fetch(url, opts).then(r => r.json());
}

// ===== INIT =====
checkAuth();

socket.on('connect', () => { document.getElementById('connTxt').textContent = 'Đã kết nối'; });
socket.on('disconnect', () => { document.getElementById('connTxt').textContent = 'Mất kết nối'; });

socket.on('new-order', (o) => { orders.unshift(o); renderAll(); notifyNew(o); });
socket.on('order-updated', (u) => { 
  const i = orders.findIndex(o => o._id === u._id); 
  if (i >= 0) {
    if (u.payment_status) orders[i].payment_status = u.payment_status;
    if (u.payment_method) orders[i].payment_method = u.payment_method;
  }
  renderAll(); 
});
socket.on('order-deleted', (u) => { orders = orders.filter(o => o._id !== u._id); renderAll(); });
socket.on('menu-updated', () => loadMenu());

async function loadData() {
  try {
    const [ordData, menuData, statsData] = await Promise.all([
      api('/api/orders'), api('/api/menu'), api('/api/stats')
    ]);
    orders = ordData || [];
    menuItems = (menuData.items || []).map(i => ({ ...i, _id: i._id }));
    menuCats = (menuData.categories || []).map(c => c.name || c);
    renderAll();
    setPre('today');
  } catch (e) { console.error('Load error:', e); }
}

async function loadMenu() {
  try {
    const d = await api('/api/menu');
    menuItems = (d.items || []).map(i => ({ ...i, _id: i._id }));
    menuCats = (d.categories || []).map(c => c.name || c);
    renderMenu();
    updateCatSelect();
  } catch {}
}

function renderAll() { renderDash(); renderOrders(); renderMenu(); updateCatSelect(); }

// ===== NAV =====
const titles = { dash: 'Dashboard', qr: 'QR bán hàng', orders: 'Đơn hàng', menu: 'Quản lý menu', rev: 'Doanh thu & Lịch sử' };
function go(p, el) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-i').forEach(x => x.classList.remove('active'));
  document.getElementById('p-' + p).classList.add('active');
  if (el) el.classList.add('active');
  document.getElementById('pageTitle').textContent = titles[p] || p;
  closeMenu();
  if (p === 'rev') applyF();
}
function toggleMenu() { document.getElementById('sidebar').classList.toggle('show'); document.getElementById('sOverlay').classList.toggle('show'); }
function closeMenu() { document.getElementById('sidebar').classList.remove('show'); document.getElementById('sOverlay').classList.remove('show'); }

// ===== HELPERS =====
function fm(n) { return (n || 0).toLocaleString('vi') + 'đ'; }
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function badge(ps) {
  if (ps === 'paid') return '<span class="badge b-paid">Đã thanh toán</span>';
  if (ps === 'cancelled') return '<span class="badge b-del" style="background:var(--red);color:#fff">Đã hủy</span>';
  return '<span class="badge b-unpaid">Chưa thanh toán</span>';
}
function shortId(o) { return o.short_id || o._id?.slice(-6) || '---'; }
function fmtTime(d) { if (!d) return ''; return new Date(d).toLocaleString('vi', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); }

// ===== DASHBOARD =====
function renderDash() {
  const today = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString());
  const unpaid = orders.filter(o => o.payment_status !== 'paid');
  const paidToday = today.filter(o => o.payment_status === 'paid');
  const rev = paidToday.reduce((s, o) => s + (o.total || 0), 0);
  document.getElementById('sTotal').textContent = today.length;
  document.getElementById('sUnpaid').textContent = unpaid.length;
  document.getElementById('sPaid').textContent = paidToday.length;
  document.getElementById('sRev').textContent = fm(rev);

  const b = document.getElementById('badge');
  if (unpaid.length > 0) { b.textContent = unpaid.length; b.style.display = 'inline-flex'; } else b.style.display = 'none';

  const recent = orders.slice(0, 10);
  const body = document.getElementById('dashBody');
  if (!recent.length) { body.innerHTML = '<tr><td colspan="5" class="empty">Chưa có đơn</td></tr>'; return; }
  body.innerHTML = recent.map(o => `<tr>
    <td><strong style="color:var(--accent)">#${esc(shortId(o))}</strong></td>
    <td><strong>${fm(o.total)}</strong></td>
    <td>${badge(o.payment_status)}</td>
    <td class="hide-sm" style="color:var(--muted);font-size:12px">${fmtTime(o.created_at)}</td>
    <td>${o.payment_status !== 'paid' ? `<button class="btn-sm btn-pay" onclick="openPaymentModal('${o._id}')">Thanh toán</button>` : '—'}</td>
  </tr>`).join('');
}

// ===== ORDERS =====
// renderOrders is defined below (after filter functions) to support payment method filtering

function fOrd(f, btn) {
  orderFilter = f;
  document.querySelectorAll('#p-orders .ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOrders();
}

// Payment method filter state
let paymentMethodFilter = 'all';

function fOrdPm(pm, btn) {
  paymentMethodFilter = pm;
  document.querySelectorAll('.pm-ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOrders();
}

// ===== ORDERS =====
renderOrders = function() {
  let list = orders;
  if (orderFilter !== 'all') list = list.filter(o => o.payment_status === orderFilter);
  if (paymentMethodFilter !== 'all') list = list.filter(o => (o.payment_method || 'CASH') === paymentMethodFilter);

  const body = document.getElementById('ordBody');
  if (!list.length) { body.innerHTML = '<tr><td colspan="6" class="empty">Không có đơn</td></tr>'; return; }
  body.innerHTML = list.map(o => {
    const itemsText = (o.items||[]).map(i => esc(i.name) + ' ×' + i.quantity).join(', ');
    const role = localStorage.getItem('admin_role');
    const isCancelled = o.payment_status === 'cancelled';
    const isPaid = o.payment_status === 'paid';
    const isCompleted = isPaid;
    const oCode = o.order_code || o.short_id || o._id?.slice(-6) || '---';
    const total = o.total_price || o.total || 0;
    const paymentMethod = o.payment_method || 'CASH';
    const paymentMethodLabel = paymentMethod === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản';
    const paymentMethodClass = paymentMethod === 'CASH' ? 'pm-cash' : 'pm-bank';
    const custInfo = o.customer_name ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(o.customer_name)}${o.customer_phone ? ' · ' + esc(o.customer_phone) : ''}</div>` : '';
    const noteHtml = o.notes ? `<div class="order-note"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> ${esc(o.notes)}</div>` : '';

    // Payment method badge
    const pmBadge = `<span class="pm-badge ${paymentMethodClass}">${paymentMethodLabel}</span>`;

    return `<tr class="${isCancelled ? 'cancelled-row' : ''}">
    <td data-label="Mã đơn"><strong style="color:var(--accent);${isCancelled ? 'text-decoration:line-through;color:var(--red)' : ''}">#${esc(oCode)}</strong>${pmBadge}${custInfo}<div class="ord-time">${fmtTime(o.created_at)}</div></td>
    <td class="hide-sm" style="font-size:12px;max-width:220px;${isCancelled ? 'text-decoration:line-through;color:var(--red)' : ''}"><div>${itemsText}</div>${noteHtml}</td>
    <td class="mobile-items" style="display:none;font-size:12px;color:var(--text);${isCancelled ? 'text-decoration:line-through;color:var(--red)' : ''}"><div>${itemsText}</div>${noteHtml}</td>
    <td data-label="Tổng tiền" style="${isCancelled ? 'text-decoration:line-through;color:var(--red)' : ''}"><strong class="ord-total">${fm(total)}</strong></td>
    <td data-label="Trạng thái">${badge(o.payment_status)}
      ${isCancelled && o.cancellation_reason ? `<div style="font-size:11px;color:var(--red);margin-top:4px;font-style:italic">Lý do: ${esc(o.cancellation_reason)}</div>` : ''}
    </td>
    <td>
      <div class="action-buttons">
        ${(!isPaid && !isCancelled) ? `<button class="btn-sm btn-pay" onclick="openPaymentModal('${o._id}')">Thanh toán</button>` : ''}
        ${(isPaid) ? `<button class="btn-sm" style="background:#f0f0ff;color:#4f46e5" onclick="printThermal('${o._id}', '${paymentMethod}')">In lại bill</button>` : ''}
        ${(!isCompleted && !isCancelled) ? `<button class="btn-sm btn-del" onclick="showCancelModal('${o._id}', '${esc(oCode)}')">Hủy</button>` : ''}
        ${(role !== 'staff' && isCancelled) ? `<button class="btn-sm btn-del" onclick="delOrder('${o._id}')">Xóa</button>` : ''}
      </div>
    </td>
  </tr>`;
  }).join('');
};

let payTargetId = null;
function openPaymentModal(id) {
  const o = orders.find(x => x._id === id);
  if (!o) return;
  payTargetId = id;
  const oCode = o.order_code || o.short_id || o._id.slice(-6);
  document.getElementById('payOrderIdTxt').textContent = '#' + oCode;
  document.getElementById('payOrderTotal').textContent = fm(o.total_price || o.total || 0);
  selectPayMethod('CASH'); // default
  document.getElementById('paymentModal').classList.add('show');
}

function closePaymentModal() {
  document.getElementById('paymentModal').classList.remove('show');
  payTargetId = null;
}

function selectPayMethod(method) {
  document.getElementById('lblCash').classList.toggle('active', method === 'CASH');
  document.getElementById('lblTransfer').classList.toggle('active', method === 'BANK_TRANSFER');
  document.querySelector(`input[name="payMethod"][value="${method}"]`).checked = true;
}

async function processPayment(confirmPaid, doPrint) {
  if (!payTargetId) return;
  const method = document.querySelector('input[name="payMethod"]:checked').value;
  const id = payTargetId;
  
  // Update order's payment method locally for printing
  const i = orders.findIndex(o => o._id === id);
  if (i >= 0) {
    orders[i].payment_method = method;
  }

  if (confirmPaid) {
    // Check out the order
    try {
      await api(`/api/orders/${id}/checkout`, 'POST', { payment_method: method });
      if (i >= 0) {
        orders[i].payment_status = 'paid';
        orders[i].payment_method = method;
      }
      renderAll();
      closePaymentModal();
      if (doPrint) printThermal(id, method, true);
    } catch (e) { alert('Lỗi: ' + e.message); }
  } else {
    // Just print the bill, update payment method silently
    try {
      await api(`/api/orders/${id}`, 'PATCH', { payment_method: method }); 
    } catch (e) {}
    closePaymentModal();
    if (doPrint) printThermal(id, method, false);
  }
}



async function delOrder(id) {
  if (!confirm('Xóa đơn hàng này?')) return;
  try {
    await api(`/api/orders/${id}`, 'DELETE');
    orders = orders.filter(o => o._id !== id);
    renderAll();
  } catch (e) { alert('Lỗi: ' + e.message); }
}

let cancelTargetId = null;
function showCancelModal(id, shortIdStr) {
  cancelTargetId = id;
  document.getElementById('cancelOrderIdTxt').textContent = '#' + shortIdStr;
  document.getElementById('cancelReason').value = '';
  document.getElementById('cancelModal').classList.add('show');
}
function closeCancelModal() {
  document.getElementById('cancelModal').classList.remove('show');
  cancelTargetId = null;
}
async function submitCancelOrder() {
  const reason = document.getElementById('cancelReason').value;
  if (!reason) { alert('Vui lòng chọn lý do hủy đơn!'); return; }
  try {
    await api(`/api/orders/${cancelTargetId}/cancel`, 'POST', { reason });
    const i = orders.findIndex(o => o._id === cancelTargetId);
    if (i >= 0) {
      orders[i].payment_status = 'cancelled';
      orders[i].cancellation_reason = reason;
    }
    closeCancelModal();
    renderAll();
  } catch (e) { alert('Lỗi: ' + e.message); }
}

// ===== MENU =====
function updateCatSelect() {
  const sel = document.getElementById('nCat');
  const cats = menuCats.length ? menuCats : ['Bánh mì', 'Nước uống', 'Combo'];
  sel.innerHTML = cats.map(c => `<option>${c}</option>`).join('');
}

function renderMenu() {
  const grid = document.getElementById('menuGrid');
  if (!menuItems.length) { grid.innerHTML = '<div class="empty">Chưa có món</div>'; return; }
  grid.innerHTML = menuItems.map(item => {
    const isImg = item.image && (item.image.startsWith('/') || item.image.startsWith('http') || item.image.startsWith('data:'));
    const imgH = isImg ? `<img src="${esc(item.image)}" onerror="this.style.display='none'">` : `<span style="font-size:14px;color:var(--muted)">No image</span>`;
    return `<div class="mc"><div class="mc-top">
      <div class="mc-img">${imgH}</div>
      <div class="mc-info"><div class="mc-name">${esc(item.name)}</div><div class="mc-cat">${esc(item.category_id||'')}</div><div class="mc-price">${fm(item.price)}</div></div>
    </div><div class="mc-acts">
      <button class="btn-sm ${item.is_hidden ? 'btn-del' : 'btn-pay'}" onclick="toggleItem('${item._id}')">${item.is_hidden ? 'Đã ẩn' : 'Đang bán'}</button>
      <button class="btn-sm btn-del" onclick="delItem('${item._id}')">Xóa</button>
    </div></div>`;
  }).join('');
}

// ===== IMAGE UPLOAD =====
let pendingImageUrl = '';

// Resize image to fit a square frame using cover-fit (crop to center)
function resizeImage(file, maxSize = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext('2d');

        // Cover-fit: crop center of image to fill square
        const srcW = img.width;
        const srcH = img.height;
        const scale = Math.max(maxSize / srcW, maxSize / srcH);
        const scaledW = srcW * scale;
        const scaledH = srcH * scale;
        const offsetX = (maxSize - scaledW) / 2;
        const offsetY = (maxSize - scaledH) / 2;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, maxSize, maxSize);
        ctx.drawImage(img, offsetX, offsetY, scaledW, scaledH);

        // Compress to JPEG at 80% quality
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleImageSelect(input) {
  const file = input.files?.[0];
  if (!file) return;
  // Reset input so same file can be re-selected
  const inputId = input.id;

  try {
    const area = document.getElementById('imgUploadArea');
    const group = area.closest('.img-upload-group');
    group.classList.add('img-uploading');

    const resized = await resizeImage(file);

    // Show preview
    const preview = document.getElementById('imgPreview');
    preview.src = resized;
    area.classList.add('has-image');
    document.getElementById('imgRemoveBtn').style.display = 'inline-flex';
    group.classList.remove('img-uploading');

    // Upload to server
    const r = await api('/api/upload', 'POST', { image: resized });
    if (r.error) throw new Error(r.error);
    pendingImageUrl = r.url;
    showToast('Ảnh đã tải lên thành công');
  } catch (e) {
    console.error('Upload error:', e);
    alert('Lỗi tải ảnh: ' + e.message);
    removeImage();
    const group = document.getElementById('imgUploadArea').closest('.img-upload-group');
    group.classList.remove('img-uploading');
  }

  // Reset file input
  document.getElementById(inputId).value = '';
}

function removeImage() {
  pendingImageUrl = '';
  const preview = document.getElementById('imgPreview');
  preview.src = '';
  document.getElementById('imgUploadArea').classList.remove('has-image');
  document.getElementById('imgRemoveBtn').style.display = 'none';
  document.getElementById('imgFileInput').value = '';
  document.getElementById('imgCameraInput').value = '';
}

// Drag and drop
(function initDragDrop() {
  const area = document.getElementById('imgUploadArea');
  if (!area) return;
  ['dragenter', 'dragover'].forEach(evt => {
    area.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); area.classList.add('drag-over'); });
  });
  ['dragleave', 'drop'].forEach(evt => {
    area.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); area.classList.remove('drag-over'); });
  });
  area.addEventListener('drop', e => {
    const files = e.dataTransfer?.files;
    if (files?.length > 0 && files[0].type.startsWith('image/')) {
      // Create a synthetic input to reuse handleImageSelect
      const dt = new DataTransfer();
      dt.items.add(files[0]);
      document.getElementById('imgFileInput').files = dt.files;
      handleImageSelect(document.getElementById('imgFileInput'));
    }
  });
})();

async function addItem() {
  const name = document.getElementById('nName').value.trim();
  const price = parseInt(document.getElementById('nPrice').value);
  const cat = document.getElementById('nCat').value;
  const img = pendingImageUrl;
  if (!name || !price) { alert('Nhập tên và giá!'); return; }
  try {
    const r = await api('/api/menu', 'POST', { name, price, category: cat, image: img });
    if (r.error) throw new Error(r.error);
    document.getElementById('nName').value = '';
    document.getElementById('nPrice').value = '';
    removeImage();
    await loadMenu();
  } catch (e) { alert('Lỗi: ' + e.message); }
}

async function toggleItem(id) {
  try { await api(`/api/menu/${id}/toggle`, 'PUT'); await loadMenu(); } catch (e) { alert('Lỗi: ' + e.message); }
}

async function delItem(id) {
  if (!confirm('Xóa món này?')) return;
  try { await api(`/api/menu/${id}`, 'DELETE'); await loadMenu(); } catch (e) { alert('Lỗi: ' + e.message); }
}

// ===== QR =====
async function showQR() {
  document.getElementById('qrImg').src = '';
  document.getElementById('qrUrl').textContent = 'Đang tạo...';
  document.getElementById('qrModal').classList.add('show');
  try {
    const d = await api('/api/qr/takeaway');
    document.getElementById('qrImg').src = d.qr;
    document.getElementById('qrUrl').textContent = d.url;
  } catch { document.getElementById('qrUrl').textContent = 'Lỗi tạo QR'; }
}
function closeQR() { document.getElementById('qrModal').classList.remove('show'); }
function dlQR() {
  const img = document.getElementById('qrImg');
  if (!img.src) return;
  const a = document.createElement('a'); a.href = img.src; a.download = 'QR-Order.png';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
document.getElementById('qrModal').addEventListener('click', e => { if (e.target.id === 'qrModal') closeQR(); });

// ===== REVENUE =====
function toYMD(d) { return d.toISOString().split('T')[0]; }
function setPre(p, btn) {
  const today = new Date();
  const fi = document.getElementById('fFrom'), ti = document.getElementById('fTo');
  if (p === 'today') { fi.value = toYMD(today); ti.value = toYMD(today); }
  else { const f = new Date(); f.setDate(today.getDate() - parseInt(p) + 1); fi.value = toYMD(f); ti.value = toYMD(today); }
  document.querySelectorAll('.pre-btn').forEach(b => b.classList.remove('active'));
  const t = btn || document.querySelector(`.pre-btn[data-d="${p}"]`);
  if (t) t.classList.add('active');
  applyF();
}

async function applyF() {
  const from = document.getElementById('fFrom').value;
  const to = document.getElementById('fTo').value;
  const q = document.getElementById('fQ').value.trim();
  try {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (q) params.append('q', q);
    const r = await fetch('/api/history?' + params.toString());
    historyList = await r.json();
    renderRev();
  } catch (e) { console.error(e); }
}

function renderRev() {
  const list = historyList || [];
  const paid = list.filter(o => o.payment_status === 'paid');
  const tot = paid.reduce((s, o) => s + (o.total || 0), 0);
  const avg = paid.length ? Math.round(tot / paid.length) : 0;
  document.getElementById('rTot').textContent = fm(tot);
  document.getElementById('rCnt').textContent = paid.length;
  document.getElementById('rAvg').textContent = fm(avg);
  document.getElementById('hCnt').textContent = list.length + ' đơn';

  const body = document.getElementById('revBody');
  if (!list.length) { body.innerHTML = '<tr><td colspan="6" class="empty">Không có đơn</td></tr>'; return; }
  body.innerHTML = list.map((o, i) => `<tr>
    <td>${i + 1}</td>
    <td><strong style="color:var(--accent)">#${esc(shortId(o))}</strong></td>
    <td class="hide-sm" style="font-size:12px;max-width:200px">${(o.items||[]).map(x => esc(x.name) + '×' + x.quantity).join(', ')}</td>
    <td><strong>${fm(o.total)}</strong></td>
    <td>${badge(o.payment_status)}</td>
    <td class="hide-sm" style="color:var(--muted);font-size:12px">${fmtTime(o.created_at)}</td>
  </tr>`).join('');
}

function exportXL() {
  const from = document.getElementById('fFrom').value;
  const to = document.getElementById('fTo').value;
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);
  window.location.href = '/api/export/excel?' + params.toString();
}

// ===== TOAST / NOTIFY =====
function showToast(html) {
  const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = html;
  document.getElementById('toastC').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function notifyNew(o) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, .18].forEach((d, i) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = i ? 1175 : 880;
      g.gain.setValueAtTime(.0001, ctx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(.25, ctx.currentTime + d + .02);
      g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + d + .15);
      osc.connect(g).connect(ctx.destination);
      osc.start(ctx.currentTime + d); osc.stop(ctx.currentTime + d + .16);
    });
  } catch {}
  showToast(`<strong>Đơn mới #${shortId(o)}</strong><br>${(o.items||[]).length} món — ${fm(o.total)}`);
}

document.getElementById('fQ')?.addEventListener('keypress', e => { if (e.key === 'Enter') applyF(); });
document.getElementById('loginPass')?.addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });

// ===== DASHBOARD EXTRAS =====
async function loadTopProducts() {
  try {
    const el = document.getElementById('topList');
    if (!el) return;
    const data = await fetch('/api/stats/top-products').then(r => r.json());
    if (!data.length) { el.innerHTML = '<div class="loading-sm">Chưa có dữ liệu</div>'; return; }
    el.innerHTML = data.map((p, i) => `<div class="top-item">
      <div class="top-rank">${i + 1}</div>
      <div class="top-info"><div class="top-name">${esc(p._id)}</div><div class="top-qty">${p.total_qty} phần</div></div>
      <div class="top-rev">${fm(p.total_revenue)}</div>
    </div>`).join('');
  } catch { }
}

async function loadChart() {
  try {
    const canvas = document.getElementById('chartCanvas');
    if (!canvas) return;
    const data = await fetch('/api/stats/chart').then(r => r.json());
    const ctx = canvas.getContext('2d');
    const W = canvas.parentElement.clientWidth - 32;
    const H = 180;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);
    if (!data.length) return;
    const max = Math.max(...data.map(d => d.revenue), 1);
    const barW = Math.min(40, (W - 60) / data.length - 8);
    const startX = 50;
    // Grid lines
    ctx.strokeStyle = '#e5e5e5'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = H - 30 - (i / 4) * (H - 50);
      ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.fillStyle = '#999'; ctx.font = '10px Inter';
      ctx.fillText(((max * i / 4) / 1000).toFixed(0) + 'k', 2, y + 4);
    }
    // Bars
    data.forEach((d, i) => {
      const x = startX + i * ((W - startX) / data.length) + ((W - startX) / data.length - barW) / 2;
      const h = (d.revenue / max) * (H - 50);
      const y = H - 30 - h;
      const grad = ctx.createLinearGradient(x, y, x, H - 30);
      grad.addColorStop(0, '#006241'); grad.addColorStop(1, '#00754a');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.roundRect(x, y, barW, h, [4, 4, 0, 0]); ctx.fill();
      // Label
      ctx.fillStyle = '#666'; ctx.font = '10px Inter'; ctx.textAlign = 'center';
      ctx.fillText(d.date.slice(5), x + barW / 2, H - 14);
      if (d.revenue > 0) {
        ctx.fillStyle = '#006241'; ctx.font = 'bold 10px Inter';
        ctx.fillText((d.revenue / 1000).toFixed(0) + 'k', x + barW / 2, y - 6);
      }
    });
  } catch { }
}

function renderStatusSummary() {
  const el = document.getElementById('statusSummary');
  if (!el) return;
  const counts = { unpaid: 0, paid: 0, cancelled: 0 };
  orders.forEach(o => { const s = o.payment_status || 'unpaid'; if (counts[s] !== undefined) counts[s]++; });
  const labels = { unpaid: 'Chưa thanh toán', paid: 'Đã thanh toán', cancelled: 'Đã hủy' };
  const colors = { unpaid: '#ea580c', paid: '#00754a', cancelled: '#c82014' };
  el.innerHTML = Object.keys(counts).map(k => `<div class="status-row">
    <div class="status-row-left"><div class="status-dot" style="background:${colors[k]}"></div><span>${labels[k]}</span></div>
    <div class="status-row-count">${counts[k]}</div>
  </div>`).join('');
}

function orderStatusBadge(s) {
  const map = { pending: 'b-pending', preparing: 'b-preparing', ready: 'b-ready', completed: 'b-completed', cancelled: 'b-cancelled' };
  const labels = { pending: 'Chờ xử lý', preparing: 'Đang chuẩn bị', ready: 'Sẵn sàng', completed: 'Hoàn thành', cancelled: 'Đã hủy' };
  const cls = map[s] || 'b-pending';
  return `<span class="badge ${cls}">${labels[s] || 'Chờ xử lý'}</span>`;
}

async function updateOrderStatus(id, status) {
  try {
    await api(`/api/orders/${id}/status`, 'PATCH', { order_status: status });
    const i = orders.findIndex(o => o._id === id);
    if (i >= 0) {
      orders[i].order_status = status;
      if (status === 'completed') orders[i].payment_status = 'paid';
      if (status === 'cancelled') orders[i].payment_status = 'cancelled';
    }
    renderAll();
    showToast('Cập nhật trạng thái thành công');
  } catch (e) { alert('Lỗi: ' + e.message); }
}

// Confirm dialog
let _confirmCb = null;
function showConfirm(title, msg, cb) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  _confirmCb = cb;
  document.getElementById('confirmModal').classList.add('show');
}
function closeConfirm() { document.getElementById('confirmModal').classList.remove('show'); _confirmCb = null; }
function confirmAction() { if (_confirmCb) _confirmCb(); closeConfirm(); }

// Override loadData to also load extras
const _origLoadData = loadData;
loadData = async function() {
  await _origLoadData();
  loadTopProducts();
  loadChart();
  renderStatusSummary();
  const role = localStorage.getItem('admin_role');
  const uEl = document.getElementById('sUser');
  if (uEl) uEl.textContent = role === 'admin' ? 'Admin' : 'Staff';
};

// Override renderAll to include status summary
const _origRenderAll = renderAll;
renderAll = function() { _origRenderAll(); renderStatusSummary(); };

// ===== PRINT BILL =====
function printBill(id) {
  // Open the professional invoice page in a new tab
  window.open('/invoice?id=' + id, '_blank');
}

// Quick thermal receipt (58mm/80mm) for kitchen use
function printThermal(id, forcedMethod = null, isConfirming = false) {
  const o = orders.find(x => x._id === id);
  if (!o) { alert('Không tìm thấy đơn'); return; }

  const orderCode = o.order_code || o.short_id || o._id.slice(-6);
  const paymentMethod = forcedMethod || o.payment_method || 'CASH';
  const isCash = paymentMethod === 'CASH';
  const isBankTransfer = paymentMethod === 'BANK_TRANSFER';

  const ps = (o.payment_status === 'paid' || isConfirming) ? 'Đã TT' : o.payment_status === 'cancelled' ? 'Đã hủy' : 'Chưa TT';
  const time = o.created_at ? new Date(o.created_at).toLocaleString('vi', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric' }) : '';
  const total = o.total_price || o.total || 0;

  // Build items HTML with word-wrap for long names
  const itemsHtml = (o.items||[]).map(i => `<tr>
    <td style="text-align:left;padding:3px 0;font-size:12px;max-width:120px;word-break:break-word;vertical-align:top">${esc(i.name)}</td>
    <td style="text-align:center;padding:3px 4px;font-size:12px;white-space:nowrap">${i.quantity}</td>
    <td style="text-align:right;padding:3px 0;font-size:12px;white-space:nowrap">${fm(i.subtotal || i.price * i.quantity)}</td>
  </tr>`).join('');

  const noteHtml = o.notes ? `<div style="margin-top:8px;padding:6px 8px;background:#f5f5f5;border-radius:4px;font-size:11px;word-break:break-word"><strong>Ghi chú:</strong> ${esc(o.notes)}</div>` : '';

  // Payment method badge
  const payMethodBadge = isCash ? '<span style="background:#dcfce7;color:#16a34a;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700">TIEN MAT</span>' : '<span style="background:#e0f2fe;color:#0369a1;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700">CK NH</span>';

  // Build QR section for BANK TRANSFER only
  let qrSection = '';
  if (isBankTransfer) {
    const qrUrl = `https://img.vietqr.io/image/970415-102870682710-compact.png?amount=${total}&addInfo=${encodeURIComponent('THANH TOAN ' + orderCode)}`;
    qrSection = `
    <div style="border-top:1px dashed #000;margin:8px 0"></div>
    <div style="text-align:center"><strong style="font-size:11px">THANH TOAN CHUYEN KHOAN</strong></div>
    <div style="text-align:center;margin:6px 0"><img src="${qrUrl}" style="width:140px;height:140px;border:2px solid #000;border-radius:6px" onerror="this.style.display='none'"/></div>
    <div style="font-size:10px;text-align:center">
      <div>VietinBank: 102870682710</div>
      <div>Chu TK: BANH MI KIM PHAT</div>
      <div style="margin-top:4px;font-weight:bold">ND: THANH TOAN ${orderCode}</div>
    </div>`;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bill #${esc(orderCode)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;width:80mm;max-width:80mm;padding:6px;font-size:12px;color:#000;background:#fff}
.center{text-align:center}
table{width:100%;border-collapse:collapse}
th{font-size:10px;text-transform:uppercase;border-bottom:1px solid #000;padding:4px 0}
.dashed{border-top:1px dashed #000;margin:6px 0}
.footer{text-align:center;font-size:10px;color:#666;margin-top:4px}
@media print{@page{size:80mm auto;margin:0}}
</style>
</head>
<body>
<div class="center">
  <strong style="font-size:15px">BANH MI KIM PHAT</strong><br>
  <span style="font-size:10px">Hotline: 0123.456.789</span>
</div>
<div class="dashed"></div>
<div style="font-size:11px">
  <div><strong>Ma don:</strong> #${esc(orderCode)} ${payMethodBadge}</div>
  <div><strong>TG:</strong> ${time}</div>
  ${o.customer_name ? `<div><strong>KH:</strong> ${esc(o.customer_name)}</div>` : ''}
  ${o.customer_phone ? `<div><strong>SDT:</strong> ${esc(o.customer_phone)}</div>` : ''}
  <div><strong>TT:</strong> ${ps}</div>
</div>
<div class="dashed"></div>
<table>
  <thead><tr><th style="text-align:left">Mon</th><th style="text-align:center">SL</th><th style="text-align:right">Tien</th></tr></thead>
  <tbody>${itemsHtml}</tbody>
</table>
<div class="dashed"></div>
<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:bold">
  <span>TONG</span><span>${fm(total)}</span>
</div>
${noteHtml}
${qrSection}
<div class="dashed"></div>
<div class="footer">Cam on quy khach!<br>Hen gap lai!</div>
<script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=340,height=700');
  if (w) { w.document.write(html); w.document.close(); }
  else { alert('Vui long cho phep popup de in bill'); }
}

