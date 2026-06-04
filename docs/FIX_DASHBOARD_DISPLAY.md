# 仪表盘显示问题修复说明

## 问题描述

仪表盘显示全零或空数据：
- 总资产(元): 0.00
- 今日收益: +0.00
- 累计收益: +0.00
- 收益率: +0.00%
- 持仓基金: 0只
- 持仓明细: 暂无持仓数据

## 根本原因

**API返回数据结构与前端期望不匹配**

API `/api/dashboard/overview` 返回嵌套结构：
```json
{
  "market": {...},
  "portfolio": {
    "total_value": 30106.0,
    "today_return": 106.0,
    "total_profit": 1606.0,
    "total_profit_pct": 5.35,
    "fund_count": 2,
    "fund_details": [...]
  },
  "signal_summary": {...}
}
```

但前端代码期望顶层字段：
```javascript
// ❌ 错误（修复前）
const totalValue = overview.total_value ?? 0;
const todayProfit = overview.today_profit ?? 0;
const totalProfit = overview.total_profit ?? 0;
const profitRate = overview.profit_rate ?? 0;
const fundCount = overview.fund_count ?? 0;

// ✅ 正确（修复后）
const portfolio = overview.portfolio || {};
const totalValue = portfolio.total_value ?? 0;
const todayProfit = portfolio.today_return ?? 0;
const totalProfit = portfolio.total_profit ?? 0;
const profitRate = portfolio.total_profit_pct ?? 0;
const fundCount = portfolio.fund_count ?? 0;
```

## 修复内容

### 修改文件
`src/static/js/dashboard/render.js` (第86-120行)

### 修复详情
修改 `renderSummaryCards()` 函数，正确从嵌套的 `portfolio` 对象中提取数据：

```javascript
function renderSummaryCards(container, overview) {
    if (!container || !overview) return;

    // 从嵌套的 portfolio 结构中提取数据
    const portfolio = overview.portfolio || {};
    const totalValue = portfolio.total_value ?? 0;
    const todayProfit = portfolio.today_return ?? 0;
    const totalProfit = portfolio.total_profit ?? 0;
    const profitRate = portfolio.total_profit_pct ?? 0;
    const fundCount = portfolio.fund_count ?? 0;

    // ... 渲染HTML
}
```

## 验证结果

### API测试 ✓
```
Total value: 30,106.00
Today return: +106.00
Total profit: +1,606.00
Profit rate: +5.35%
Fund count: 2只
```

### 持仓明细测试 ✓
```
基金数量: 2
  - 易方达优质精选混合(QDII) (110011)
    市值: 19,888.00 | 权重: 66.06%
  - 华夏成长混合 (000001)
    市值: 10,218.00 | 权重: 33.94%
```

## 验证步骤

1. **刷新浏览器**
   访问 http://localhost:5000
   点击"仪表盘"导航按钮

2. **检查汇总卡片**
   应显示：
   - 总资产(元): 30,106.00（或其他实际值）
   - 今日收益: +106.00（或其他实际值）
   - 累计收益: +1,606.00
   - 收益率: +5.35%
   - 持仓基金: 2只

3. **检查持仓明细**
   应显示2只基金的表格，包含：
   - 基金名称
   - 当前市值
   - 权重
   - 今日收益
   - 累计收益

4. **如果仍有问题**
   - 打开浏览器开发者工具（F12）
   - 查看Console标签页的错误信息
   - 检查Network标签页的API响应
   - 确认浏览器已清除缓存（Ctrl+Shift+R）

## 性能说明

API响应可能需要2-10秒（取决于基金数量），这是正常的：
- 后端需要调用多个外部API获取实时数据
- 后台预热机制会缓存数据（每60秒刷新）
- 首次加载较慢，后续请求从缓存读取（<500ms）

## 相关文件

- **修复文件**: `src/static/js/dashboard/render.js`
- **测试脚本**: `tests/test_dashboard_display.py`
- **API端点**: `/api/dashboard/overview`
- **后端逻辑**: `src/services/dashboard_service.py`

---

**修复状态**: ✅ 已完成并验证
**修复时间**: 2026-05-20
