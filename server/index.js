/**
 * Inventory 库存管理 — 后端服务
 * Node + Express，REST API，数据持久化到 server/data.json
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3005;
const DATA_FILE = path.join(__dirname, 'data.json');
const CLIENT_DIR = path.join(__dirname, '..', 'client');

const app = express();
app.use(express.json());

// 允许以 file:// 方式直接打开前端页面时也能调用 API
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ---------------- 数据层：读写 data.json ---------------- */

function now() {
  return new Date().toISOString();
}

function nextId(list) {
  return list.reduce((max, x) => Math.max(max, x.id || 0), 0) + 1;
}

function saveData(d) {
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

// 15 件示例物品（其中 5 件低于阈值，便于演示提醒功能）
function seedData() {
  const rows = [
    ['无线鼠标', '电子产品', 25, 10, '个', '办公主力'],
    ['机械键盘', '电子产品', 8, 10, '把', ''],
    ['27寸显示器', '电子产品', 6, 3, '台', ''],
    ['USB-C 数据线', '电子产品', 40, 15, '根', '1 米'],
    ['A4 打印纸', '办公用品', 120, 50, '包', '70g'],
    ['中性笔', '办公用品', 18, 20, '支', '黑色 0.5mm'],
    ['订书机', '办公用品', 5, 4, '个', ''],
    ['文件夹', '办公用品', 30, 10, '个', ''],
    ['便利贴', '办公用品', 3, 10, '本', ''],
    ['瓶装水', '饮品食品', 48, 24, '瓶', '550ml'],
    ['挂耳咖啡', '饮品食品', 12, 15, '包', ''],
    ['速溶奶茶', '饮品食品', 22, 10, '盒', ''],
    ['洗手液', '清洁用品', 9, 6, '瓶', ''],
    ['抽纸', '清洁用品', 60, 20, '箱', ''],
    ['垃圾袋', '清洁用品', 4, 8, '卷', '45x50cm'],
  ];
  const base = Date.now();
  const items = rows.map(([name, category, quantity, threshold, unit, remark], i) => {
    const t = new Date(base - (rows.length - i) * 86400000).toISOString();
    return { id: i + 1, name, category, quantity, threshold, unit, remark, createdAt: t, updatedAt: t };
  });
  // 为每件物品生成一条「期初入库」，便于演示出入库记录
  const records = items.map((it, i) => ({
    id: i + 1,
    itemId: it.id,
    itemName: it.name,
    type: 'in',
    quantity: it.quantity,
    note: '期初入库',
    time: new Date(base - (items.length - i) * 3600000).toISOString(),
  }));
  return { items, records };
}

let data;
function initData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!Array.isArray(data.items)) data.items = [];
      if (!Array.isArray(data.records)) data.records = [];
      console.log(`已加载数据 server/data.json（${data.items.length} 件物品）`);
      return;
    } catch (err) {
      console.error(`data.json 解析失败（${err.message}），将重新初始化示例数据`);
    }
  }
  data = seedData();
  saveData(data);
  console.log('已生成示例数据 server/data.json（15 件物品，5 件低于阈值）');
}

/* ---------------- 工具与校验 ---------------- */

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// 校验并整理物品字段；partial=true 时只更新传入的字段（编辑场景）
function normalizeItem(body, { partial = false } = {}) {
  const src = body || {};
  const out = {};
  if (src.name !== undefined || !partial) {
    const name = String(src.name ?? '').trim();
    if (!name) return { error: '物品名称不能为空' };
    if (name.length > 50) return { error: '物品名称过长（最多 50 字）' };
    out.name = name;
  }
  if (src.category !== undefined || !partial) {
    const category = String(src.category ?? '').trim();
    if (!category) return { error: '分类不能为空' };
    out.category = category;
  }
  if (src.quantity !== undefined || !partial) {
    const qty = Number(src.quantity ?? 0);
    if (!Number.isInteger(qty) || qty < 0) return { error: '库存数量必须是不小于 0 的整数' };
    out.quantity = qty;
  }
  if (src.threshold !== undefined || !partial) {
    const th = Number(src.threshold ?? 0);
    if (!Number.isInteger(th) || th < 0) return { error: '阈值必须是不小于 0 的整数' };
    out.threshold = th;
  }
  if (src.unit !== undefined || !partial) {
    out.unit = String(src.unit ?? '').trim() || '件';
  }
  if (src.remark !== undefined || !partial) {
    out.remark = String(src.remark ?? '').trim();
  }
  return { value: out };
}

/* ---------------- REST API ---------------- */

// 物品列表，支持 ?category= 与 ?keyword= 过滤；低于阈值的排前面
app.get('/api/items', (req, res) => {
  let list = data.items;
  const { category, keyword } = req.query;
  if (category) list = list.filter((i) => i.category === category);
  if (keyword) {
    const kw = String(keyword).toLowerCase();
    list = list.filter((i) => i.name.toLowerCase().includes(kw));
  }
  list = [...list].sort((a, b) => (b.quantity <= b.threshold) - (a.quantity <= a.threshold) || a.id - b.id);
  res.json(list);
});

app.get('/api/items/:id', (req, res) => {
  const id = parseId(req.params.id);
  const item = id && data.items.find((i) => i.id === id);
  if (!item) return res.status(404).json({ error: '物品不存在' });
  res.json(item);
});

// 新增物品；若初始库存 > 0，自动记一条「期初入库」
app.post('/api/items', (req, res) => {
  const { error, value } = normalizeItem(req.body);
  if (error) return res.status(400).json({ error });
  const item = { id: nextId(data.items), ...value, createdAt: now(), updatedAt: now() };
  data.items.push(item);
  let record = null;
  if (item.quantity > 0) {
    record = {
      id: nextId(data.records),
      itemId: item.id,
      itemName: item.name,
      type: 'in',
      quantity: item.quantity,
      note: '期初入库',
      time: now(),
    };
    data.records.push(record);
  }
  saveData(data);
  res.status(201).json({ item, record });
});

// 编辑物品（只更新传入字段）；库存数量请通过出入库接口调整
app.put('/api/items/:id', (req, res) => {
  const id = parseId(req.params.id);
  const item = id && data.items.find((i) => i.id === id);
  if (!item) return res.status(404).json({ error: '物品不存在' });
  const { error, value } = normalizeItem(req.body, { partial: true });
  if (error) return res.status(400).json({ error });
  if (value.quantity !== undefined && value.quantity !== item.quantity) {
    return res.status(400).json({ error: '库存数量请通过出入库接口（POST /api/items/:id/stock）调整' });
  }
  delete value.quantity;
  Object.assign(item, value, { updatedAt: now() });
  saveData(data);
  res.json(item);
});

// 删除物品（出入库记录保留，物品名以快照形式存在记录里）
app.delete('/api/items/:id', (req, res) => {
  const idx = data.items.findIndex((i) => i.id === parseId(req.params.id));
  if (idx === -1) return res.status(404).json({ error: '物品不存在' });
  const [removed] = data.items.splice(idx, 1);
  saveData(data);
  res.json({ message: `已删除「${removed.name}」` });
});

// 出入库：{ type: 'in' | 'out', quantity, note }
app.post('/api/items/:id/stock', (req, res) => {
  const id = parseId(req.params.id);
  const item = id && data.items.find((i) => i.id === id);
  if (!item) return res.status(404).json({ error: '物品不存在' });

  const body = req.body || {};
  const { type } = body;
  const quantity = Number(body.quantity);
  const note = String(body.note ?? '').trim();

  if (type !== 'in' && type !== 'out') {
    return res.status(400).json({ error: "type 必须是 'in'（入库）或 'out'（出库）" });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: '数量必须是正整数' });
  }
  if (type === 'out' && quantity > item.quantity) {
    return res.status(400).json({ error: `出库数量超过当前库存（当前 ${item.quantity} ${item.unit}）` });
  }

  item.quantity += type === 'in' ? quantity : -quantity;
  item.updatedAt = now();

  const record = {
    id: nextId(data.records),
    itemId: item.id,
    itemName: item.name,
    type,
    quantity,
    note,
    time: now(),
  };
  data.records.push(record);
  saveData(data);
  res.json({ item, record });
});

// 出入库记录（新→旧），支持 ?limit= 与 ?itemId=
app.get('/api/records', (req, res) => {
  let list = [...data.records].sort((a, b) => b.id - a.id);
  const itemId = parseId(req.query.itemId);
  if (itemId) list = list.filter((r) => r.itemId === itemId);
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json(list.slice(0, limit));
});

// 库存汇总：种类数 / 总量 / 分类统计 / 低于阈值清单
app.get('/api/summary', (req, res) => {
  const items = data.items;
  const lowStock = items
    .filter((i) => i.quantity <= i.threshold)
    .sort((a, b) => a.quantity - a.threshold - (b.quantity - b.threshold));

  const catMap = new Map();
  for (const i of items) {
    if (!catMap.has(i.category)) catMap.set(i.category, { category: i.category, count: 0, quantity: 0 });
    const c = catMap.get(i.category);
    c.count += 1;
    c.quantity += i.quantity;
  }

  res.json({
    totalItems: items.length,
    totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
    categoryCount: catMap.size,
    lowStockCount: lowStock.length,
    lowStock,
    categoryStats: [...catMap.values()].sort((a, b) => b.quantity - a.quantity),
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));

// 前端静态资源（打开 http://localhost:3005 即前端页面）
app.use(express.static(CLIENT_DIR));

// 兜底错误处理（含 JSON 请求体解析错误）
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || '服务器内部错误' });
});

initData();
app.listen(PORT, () => {
  console.log(`Inventory 库存管理后端已启动: http://localhost:${PORT}`);
  console.log(`数据文件: ${DATA_FILE}`);
});
