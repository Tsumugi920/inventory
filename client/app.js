/* Inventory 库存管理 — 前端逻辑 */
'use strict';

// 直接双击打开 index.html（file://）时，API 指向本地后端
const API_BASE = location.protocol === 'file:' ? 'http://localhost:3005' : '';

const state = { items: [], records: [], summary: null, category: '', keyword: '' };

const $ = (sel) => document.querySelector(sel);

/* ---------------- 基础工具 ---------------- */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let body = null;
  try { body = await res.json(); } catch (_) { /* 非 JSON 响应，忽略 */ }
  if (!res.ok) throw new Error((body && body.error) || `请求失败（HTTP ${res.status}）`);
  return body;
}

let toastTimer = null;
function toast(msg, ok = true) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('ok', ok);
  el.classList.toggle('err', !ok);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------------- 数据加载与渲染 ---------------- */

async function loadAll() {
  const [items, summary, records] = await Promise.all([
    api('/api/items'),
    api('/api/summary'),
    api('/api/records?limit=200'),
  ]);
  state.items = items;
  state.summary = summary;
  state.records = records;
  renderAll();
}

function renderAll() {
  renderSummary();
  renderAlerts();
  renderCategoryFilter();
  renderItems();
  renderRecords();
}

function renderSummary() {
  const s = state.summary || { totalItems: 0, totalQuantity: 0, categoryCount: 0, lowStockCount: 0 };
  const cards = [
    { label: '物品种类', value: s.totalItems, cls: '' },
    { label: '库存总量', value: s.totalQuantity, cls: '' },
    { label: '物品分类', value: s.categoryCount, cls: '' },
    { label: '低于阈值', value: s.lowStockCount, cls: s.lowStockCount ? 'danger' : 'ok' },
  ];
  $('#summary-cards').innerHTML = cards.map((c) => `
    <div class="card ${c.cls}">
      <div class="card-value">${c.value}</div>
      <div class="card-label">${c.label}</div>
    </div>`).join('');
  $('#refresh-time').textContent = `更新于 ${fmtTime(new Date().toISOString())}`;
}

function renderAlerts() {
  const box = $('#alert-box');
  const low = (state.summary && state.summary.lowStock) || [];
  if (!low.length) {
    box.innerHTML = '<div class="alert ok">✅ 所有物品库存均高于阈值，暂无补货提醒。</div>';
    return;
  }
  box.innerHTML = `
    <div class="alert danger">
      <div class="alert-title">⚠️ 有 ${low.length} 件物品库存低于阈值，请及时补货（点击物品可直接入库）</div>
      <div class="alert-chips">
        ${low.map((it) => `<span class="chip" data-id="${it.id}">${esc(it.name)} ${it.quantity}/${it.threshold}${it.unit ? ' ' + esc(it.unit) : ''}</span>`).join('')}
      </div>
    </div>`;
}

function categories() {
  return [...new Set(state.items.map((i) => i.category))].sort((a, b) => a.localeCompare(b, 'zh'));
}

function renderCategoryFilter() {
  const sel = $('#category-filter');
  const prev = state.category;
  const cats = categories();
  sel.innerHTML = '<option value="">全部分类</option>'
    + cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if (prev && cats.includes(prev)) {
    sel.value = prev;
  } else {
    sel.value = '';
    state.category = '';
  }
  $('#category-list').innerHTML = cats.map((c) => `<option value="${esc(c)}"></option>`).join('');
}

function visibleItems() {
  const kw = state.keyword.trim().toLowerCase();
  return state.items.filter((it) => {
    if (state.category && it.category !== state.category) return false;
    if (kw && !it.name.toLowerCase().includes(kw)) return false;
    return true;
  });
}

function renderItems() {
  const list = visibleItems();
  $('#items-empty').classList.toggle('hidden', list.length > 0);
  $('#items-body').innerHTML = list.map((it) => {
    const low = it.quantity <= it.threshold;
    return `
    <tr class="${low ? 'row-low' : ''}">
      <td>
        <div class="item-name">${esc(it.name)}</div>
        ${it.remark ? `<div class="item-remark">${esc(it.remark)}</div>` : ''}
      </td>
      <td><span class="tag">${esc(it.category)}</span></td>
      <td class="mono"><b>${it.quantity}</b> <span class="unit">${esc(it.unit)}</span></td>
      <td class="mono">${it.threshold}</td>
      <td>${low ? '<span class="badge danger">低于阈值</span>' : '<span class="badge ok">正常</span>'}</td>
      <td class="actions">
        <button class="btn btn-sm in" data-action="in" data-id="${it.id}">入库</button>
        <button class="btn btn-sm out" data-action="out" data-id="${it.id}">出库</button>
        <button class="btn btn-sm" data-action="edit" data-id="${it.id}">编辑</button>
        <button class="btn btn-sm danger" data-action="delete" data-id="${it.id}">删除</button>
      </td>
    </tr>`;
  }).join('');
}

function renderRecords() {
  const list = state.records.slice(0, 50);
  $('#records-count').textContent = `共 ${state.records.length} 条`;
  $('#records-empty').classList.toggle('hidden', list.length > 0);
  $('#records-body').innerHTML = list.map((r) => `
    <tr>
      <td class="mono">${fmtTime(r.time)}</td>
      <td>${esc(r.itemName)}</td>
      <td>${r.type === 'in' ? '<span class="badge in">入库</span>' : '<span class="badge out">出库</span>'}</td>
      <td class="mono ${r.type === 'in' ? 'num-in' : 'num-out'}">${r.type === 'in' ? '+' : '−'}${r.quantity}</td>
      <td>${esc(r.note) || '—'}</td>
    </tr>`).join('');
}

/* ---------------- 弹窗 ---------------- */

function openModal(el) { el.classList.remove('hidden'); }
function closeModal(el) { el.classList.add('hidden'); }
function findItem(id) { return state.items.find((i) => i.id === Number(id)); }

function openStockModal(item, type) {
  $('#stock-form').reset();
  document.querySelector(`input[name="stock-type"][value="${type}"]`).checked = true;
  $('#stock-id').value = item.id;
  $('#stock-title').textContent = type === 'in' ? '📥 入库' : '📤 出库';
  $('#stock-info').textContent = `${item.name} · 当前库存 ${item.quantity} ${item.unit} · 阈值 ${item.threshold}`;
  $('#stock-note').placeholder = type === 'in' ? '选填，如：采购到货' : '选填，如：部门领用';
  openModal($('#stock-modal'));
  $('#stock-qty').focus();
}

function openItemModal(item) {
  $('#item-form').reset();
  const editing = !!item;
  $('#item-id').value = editing ? item.id : '';
  $('#item-title').textContent = editing ? '编辑物品' : '添加物品';
  $('#f-name').value = editing ? item.name : '';
  $('#f-category').value = editing ? item.category : '';
  $('#f-threshold').value = editing ? item.threshold : 10;
  $('#f-unit').value = editing ? item.unit : '';
  $('#f-remark').value = editing ? item.remark : '';
  $('#f-quantity-group').classList.toggle('hidden', editing);
  $('#edit-tip').classList.toggle('hidden', !editing);
  openModal($('#item-modal'));
  $('#f-name').focus();
}

/* ---------------- 提交动作 ---------------- */

async function submitStock(e) {
  e.preventDefault();
  const id = $('#stock-id').value;
  const type = document.querySelector('input[name="stock-type"]:checked').value;
  const quantity = Number($('#stock-qty').value);
  const note = $('#stock-note').value.trim();
  const btn = $('#stock-submit');
  btn.disabled = true;
  try {
    const { item, record } = await api(`/api/items/${id}/stock`, {
      method: 'POST',
      body: JSON.stringify({ type, quantity, note }),
    });
    closeModal($('#stock-modal'));
    toast(`${type === 'in' ? '入库' : '出库'}成功：${item.name} ${type === 'in' ? '+' : '−'}${record.quantity}，当前库存 ${item.quantity}`);
    await loadAll();
  } catch (err) {
    toast(err.message, false);
  } finally {
    btn.disabled = false;
  }
}

async function submitItem(e) {
  e.preventDefault();
  const id = $('#item-id').value;
  const editing = !!id;
  const payload = {
    name: $('#f-name').value.trim(),
    category: $('#f-category').value.trim() || '未分类',
    threshold: Number($('#f-threshold').value),
    unit: $('#f-unit').value.trim() || '件',
    remark: $('#f-remark').value.trim(),
  };
  if (!editing) payload.quantity = Number($('#f-quantity').value);
  const btn = $('#item-submit');
  btn.disabled = true;
  try {
    if (editing) {
      await api(`/api/items/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('物品已更新');
    } else {
      await api('/api/items', { method: 'POST', body: JSON.stringify(payload) });
      toast('物品已添加');
    }
    closeModal($('#item-modal'));
    await loadAll();
  } catch (err) {
    toast(err.message, false);
  } finally {
    btn.disabled = false;
  }
}

async function deleteItem(item) {
  if (!window.confirm(`确定删除「${item.name}」吗？其出入库记录会保留。`)) return;
  try {
    await api(`/api/items/${item.id}`, { method: 'DELETE' });
    toast(`已删除「${item.name}」`);
    await loadAll();
  } catch (err) {
    toast(err.message, false);
  }
}

/* ---------------- 事件绑定与初始化 ---------------- */

function bindEvents() {
  $('#btn-add').addEventListener('click', () => openItemModal(null));

  $('#category-filter').addEventListener('change', (e) => {
    state.category = e.target.value;
    renderItems();
  });
  $('#keyword').addEventListener('input', (e) => {
    state.keyword = e.target.value;
    renderItems();
  });

  // 物品表格操作（事件委托）
  $('#items-body').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const item = findItem(btn.dataset.id);
    if (!item) return;
    const { action } = btn.dataset;
    if (action === 'in') openStockModal(item, 'in');
    else if (action === 'out') openStockModal(item, 'out');
    else if (action === 'edit') openItemModal(item);
    else if (action === 'delete') deleteItem(item);
  });

  // 提醒条里的物品 → 一键入库
  $('#alert-box').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-id]');
    if (!chip) return;
    const item = findItem(chip.dataset.id);
    if (item) openStockModal(item, 'in');
  });

  $('#stock-form').addEventListener('submit', submitStock);
  $('#item-form').addEventListener('submit', submitItem);

  // 关闭弹窗：取消按钮 / 点击遮罩 / Esc
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
    overlay.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(overlay));
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(closeModal);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  loadAll().catch((err) => toast(err.message, false));
});
