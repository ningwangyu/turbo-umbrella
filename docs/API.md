# 基金收益预测助手 V2 API 文档

默认服务地址：

```text
http://localhost:5000
```

所有接口返回 JSON，文件导出接口除外。

## 页面

### `GET /`

返回 Web 单页应用。

## 基金接口

### `GET /api/fund/<code>`

获取单只基金实时估值。

示例：

```bash
curl http://localhost:5000/api/fund/000001
```

### `POST /api/fund/batch`

批量获取基金估值。

请求体：

```json
{
  "codes": ["000001", "110022"]
}
```

### `GET /api/fund/search?q=<keyword>`

按基金名称或代码搜索基金。

示例：

```bash
curl "http://localhost:5000/api/fund/search?q=沪深300"
```

### `GET /api/fund/holdings/<code>`

获取基金重仓股信息。

### `GET /api/fund/performance/<code>`

获取基金历史净值走势和阶段收益。

### `GET /api/fund/signal/<code>`

获取多因子买卖信号。

返回内容包括：

- `signal`：中文信号。
- `signal_en`：英文信号标识。
- `buy_score`：买入评分。
- `sell_score`：卖出评分。
- `factors`：各因子评分明细。
- `summary`：分析摘要。

### `GET /api/fund/recommend`

获取基金推荐列表。

推荐结果包含综合评分、推荐级别、参考说明、估值涨跌幅和因子数量。

## 导入接口

### `POST /api/import/text`

从文本中识别持仓基金。

支持 JSON 数组、逐行文本、包含基金名称或基金代码的自然语言文本。

请求体示例：

```json
{
  "text": "000001 持有 10000 收益 300"
}
```

### `POST /api/import/image`

使用 AI 从截图中识别基金持仓信息。

请求体示例：

```json
{
  "image": "data:image/jpeg;base64,..."
}
```

## 行情接口

### `GET /api/market/index`

获取 A 股主要指数行情。

### `GET /api/market/sectors`

获取热门行业板块行情。

### `GET /api/price/metals`

获取黄金、白银等贵金属价格。

### `GET /api/price/metals/trend?metal=gold&period=1m`

获取贵金属趋势数据。

参数：

- `metal`：品种，默认 `gold`。
- `period`：周期，可用值由前端约定，例如 `7d`、`15d`、`1m`、`3m`、`6m`、`1y`。

## 市场情绪

### `GET /api/market/sentiment`

获取市场情绪指数。

返回内容包括：

- `score`：情绪分数。
- `label`：情绪标签。
- `advice`：参考提示。
- `indicators`：涨跌、资金流、ETF 等指标。
- `updated_at`：更新时间。

## 组合分析

### `POST /api/portfolio/stats`

计算持仓组合统计。

请求体：

```json
{
  "holdings": [
    {
      "code": "000001",
      "value": 10000,
      "profit": 300
    }
  ]
}
```

返回内容包括：

- `total_value`：组合当前估算市值。
- `total_cost`：组合成本。
- `total_profit`：累计收益。
- `total_profit_pct`：累计收益率。
- `total_today`：今日预估收益。
- `funds`：单只基金明细。

### `POST /api/portfolio/analysis`

获取组合深度分析。

请求体同 `/api/portfolio/stats`。

返回内容包括：

- `type_distribution`：基金类型分布。
- `stock_overlap`：重仓股重叠分析。
- `risk_metrics`：波动率、最大回撤、Sharpe 等风险指标。

## 提醒接口

### `GET /api/alerts`

获取当前价格提醒列表。

### `POST /api/alerts`

新增提醒。

请求体：

```json
{
  "code": "000001",
  "name": "基金名称",
  "condition": "above",
  "threshold": 2.0
}
```

参数说明：

- `condition=above`：涨幅大于等于阈值时触发。
- `condition=below`：跌幅小于等于阈值时触发。
- `threshold`：百分比阈值。

### `DELETE /api/alerts/<alert_id>`

删除提醒。

### `GET /api/alerts/check`

检查提醒是否触发。

提醒当前存储在内存中，服务重启后会丢失。

## 定投回测

### `POST /api/backtest`

运行定投回测。

请求体：

```json
{
  "code": "000001",
  "amount": 1000,
  "frequency": "monthly",
  "strategies": ["fixed", "smart", "value"]
}
```

参数：

- `frequency`：`weekly`、`biweekly`、`monthly`。
- `strategies`：`fixed` 普通定投，`smart` 智能定投，`value` 价值平均。

## AI 接口

### `POST /api/ai/chat`

流式 AI 对话接口，返回 `text/event-stream`。

请求体：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "帮我分析这只基金"
    }
  ]
}
```

### `POST /api/ai/recognize-image`

AI 图片识别接口。

请求体：

```json
{
  "image": "data:image/jpeg;base64,...",
  "prompt": "请识别截图中的基金持仓"
}
```

## 晨报接口

### `POST /api/report/morning`

生成 AI 市场晨报。

请求体：

```json
{
  "holdings": [
    {
      "code": "000001",
      "value": 10000,
      "profit": 300
    }
  ]
}
```

## 导出接口

### `POST /api/export/json`

导出持仓为 JSON 文件。

请求体：

```json
{
  "holdings": [
    {
      "code": "000001",
      "value": 10000,
      "profit": 300
    }
  ]
}
```

### `POST /api/export/csv`

导出持仓为 CSV 文件。

请求体同 `/api/export/json`。
