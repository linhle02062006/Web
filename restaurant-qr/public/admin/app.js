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
    if (r.authenticated) showApp();
    else { token = ''; localStorage.removeItem('admin_token'); showLogin(); }
  } catch { showLogin(); }
}

function showLogin() { document.getElementById('loginWrap').style.display = 'flex'; document.getElementById('app').style.display = 'none'; }
function showApp() { document.getElementById('loginWrap').style.display = 'none'; document.getElementById('app').style.display = 'block'; loadData(); }

async function doLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const err = document.getElementById('loginErr');
  if (!u || !p) { err.textContent = 'Nhập đầy đủ thông tin'; err.style.display = 'block'; return; }
  try {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    const d = await r.json();
    if (d.success) { token = d.token; localStorage.setItem('admin_token', token); showApp(); }
    else { err.textContent = d.error || 'Sai thông tin'; err.style.display = 'block'; }
  } catch (e) { err.textContent = 'Lỗi kết nối'; err.style.display = 'block'; }
}

async function doLogout() {
  try { await api('/api/auth/logout', 'POST'); } catch {}
  token = ''; localStorage.removeItem('admin_token'); showLogin();
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
socket.on('order-updated', (u) => { const i = orders.findIndex(o => o._id === u._id); if (i >= 0) orders[i].payment_status = u.payment_status; renderAll(); });
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
    <td>${o.payment_status !== 'paid' ? `<button class="btn-sm btn-pay" onclick="checkout('${o._id}')">Thanh toán</button>` : '—'}</td>
  </tr>`).join('');
}

// ===== ORDERS =====
function renderOrders() {
  let list = orders;
  if (orderFilter !== 'all') list = orders.filter(o => o.payment_status === orderFilter);
  const body = document.getElementById('ordBody');
  if (!list.length) { body.innerHTML = '<tr><td colspan="7" class="empty">Không có đơn</td></tr>'; return; }
  body.innerHTML = list.map(o => `<tr>
    <td><strong style="color:var(--accent)">#${esc(shortId(o))}</strong></td>
    <td class="hide-sm" style="font-size:12px;max-width:180px">${(o.items||[]).map(i => esc(i.name) + '×' + i.quantity).join(', ')}</td>
    <td class="hide-sm" style="font-size:12px;color:var(--muted)">${esc(o.notes) || '—'}</td>
    <td><strong>${fm(o.total)}</strong></td>
    <td>${badge(o.payment_status)}</td>
    <td class="hide-sm" style="color:var(--muted);font-size:12px">${fmtTime(o.created_at)}</td>
    <td style="white-space:nowrap">
      ${o.payment_status !== 'paid' ? `<button class="btn-sm btn-pay" onclick="checkout('${o._id}')">Thanh toán</button> ` : ''}
      <button class="btn-sm btn-del" onclick="delOrder('${o._id}')">Xóa</button>
    </td>
  </tr>`).join('');
}

function fOrd(f, btn) {
  orderFilter = f;
  document.querySelectorAll('#p-orders .ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOrders();
}

async function checkout(id) {
  if (!confirm('Xác nhận thanh toán?')) return;
  try {
    await api(`/api/orders/${id}/checkout`, 'POST');
    const i = orders.findIndex(o => o._id === id);
    if (i >= 0) orders[i].payment_status = 'paid';
    renderAll();
  } catch (e) { alert('Lỗi: ' + e.message); }
}

async function delOrder(id) {
  if (!confirm('Xóa đơn hàng này?')) return;
  try {
    await api(`/api/orders/${id}`, 'DELETE');
    orders = orders.filter(o => o._id !== id);
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
    const isImg = item.image && (item.image.startsWith('/') || item.image.startsWith('http'));
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

async function addItem() {
  const name = document.getElementById('nName').value.trim();
  const price = parseInt(document.getElementById('nPrice').value);
  const cat = document.getElementById('nCat').value;
  const img = document.getElementById('nImg').value.trim();
  if (!name || !price) { alert('Nhập tên và giá!'); return; }
  try {
    const r = await api('/api/menu', 'POST', { name, price, category: cat, image: img });
    if (r.error) throw new Error(r.error);
    document.getElementById('nName').value = '';
    document.getElementById('nPrice').value = '';
    document.getElementById('nImg').value = '';
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
