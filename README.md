# Inventory 库存管理

前后端完整的库存管理系统：前端为原生 HTML/CSS/JS（`client/`），后端为 Node.js + Express（`server/`），数据持久化到 `server/data.json` 文件，无需数据库。

## 功能

- **物品管理**：添加、编辑、删除物品（名称 / 分类 / 单位 / 阈值 / 备注）
- **物品列表**：展示当前库存、阈值与库存状态，支持按名称搜索
- **按分类筛选**：下拉选择分类，只看该分类的物品
- **出入库**：对任意物品入库 / 出库，出库数量不可超过当前库存
- **出入库记录**：自动记录每笔出入库（时间 / 物品 / 类型 / 数量 / 备注），新→旧排列
- **库存汇总**：物品种类数、库存总量、分类数、分类统计
- **低于阈值提醒**：库存 ≤ 阈值的物品在顶部提醒区标红列出（点击可直接入库），汇总卡片同步计数

## 目录结构

```
inventory/
├── package.json          # 启动脚本 npm start（端口 3005）
├── README.md
├── client/               # 前端（由后端静态托管，也可双击直接打开）
│   ├── index.html
│   ├── style.css
│   └── app.js
└── server/
    ├── index.js          # Express 后端：REST API + 静态托管
    └── data.json         # 数据文件（首次启动自动生成，内含 15 件示例物品）
```

## 环境要求

- Node.js ≥ 14

## 安装与启动

```bash
cd inventory
npm install
npm start
```

启动后：

- 前端页面：<http://localhost:3005>
- REST API 前缀：<http://localhost:3005/api/>

> 端口默认 **3005**，可用环境变量覆盖：`PORT=3006 npm start`

## REST API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/items` | 物品列表，支持 `?category=电子产品`、`?keyword=鼠标`；低于阈值的排前面 |
| GET | `/api/items/:id` | 物品详情 |
| POST | `/api/items` | 新增物品 `{name, category, quantity, threshold, unit, remark}`；初始库存 > 0 会自动记一条「期初入库」 |
| PUT | `/api/items/:id` | 编辑物品（只更新传入字段；库存数量请走出入库接口） |
| DELETE | `/api/items/:id` | 删除物品（出入库记录保留） |
| POST | `/api/items/:id/stock` | 出入库 `{type: 'in' \| 'out', quantity, note}`；出库数量不可超过当前库存 |
| GET | `/api/records` | 出入库记录（新→旧），支持 `?limit=50`、`?itemId=1` |
| GET | `/api/summary` | 库存汇总：种类数 / 总量 / 分类统计 / 低于阈值清单 |

### curl 示例

```bash
# 物品列表
curl http://localhost:3005/api/items

# 入库：给 2 号物品加 20 个
curl -X POST http://localhost:3005/api/items/2/stock \
  -H 'Content-Type: application/json' \
  -d '{"type":"in","quantity":20,"note":"采购到货"}'

# 出库：给 1 号物品减 5 个
curl -X POST http://localhost:3005/api/items/1/stock \
  -H 'Content-Type: application/json' \
  -d '{"type":"out","quantity":5,"note":"部门领用"}'

# 库存汇总（含低于阈值清单）
curl http://localhost:3005/api/summary

# 出入库记录
curl 'http://localhost:3005/api/records?limit=20'

# 新增 / 编辑 / 删除物品
curl -X POST http://localhost:3005/api/items -H 'Content-Type: application/json' \
  -d '{"name":"白板笔","category":"办公用品","quantity":10,"threshold":5,"unit":"支"}'
curl -X PUT http://localhost:3005/api/items/16 -H 'Content-Type: application/json' \
  -d '{"remark":"黑色"}'
curl -X DELETE http://localhost:3005/api/items/16
```

## 数据持久化

- 所有数据保存在 `server/data.json`，每次增删改和出入库后立即写盘（先写临时文件再原子重命名）。
- 首次启动自动写入 **15 件示例物品**（4 个分类，其中 5 件低于阈值，便于查看提醒效果），并各带一条「期初入库」记录。
- 删除 `server/data.json` 后重启，会重新生成示例数据。
