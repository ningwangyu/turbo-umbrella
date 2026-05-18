# V4 README Image Prompts

本文件记录 V4 README 图片资产的生成思路，便于后续替换、重绘或使用其他图像后端复现。

## 使用的图像技能

- `imagegen`：实际生成 README 位图资产，并将最终图片复制到 `docs/images/`。
- `gpt-image-2`：用于结构化技术图提示词设计，参考了 bento 信息图、KPI 仪表盘、流程图等模板方法。
- `baoyu-cover-image`：用于封面和文档视觉风格选型，参考其类型、配色、渲染、文字、情绪五维方法，采用 `blueprint` / `editorial-infographic` 风格。

## 资产清单

### `v4-hero-cover.png`

用途：README 顶部封面。

Prompt 摘要：

```text
Create a polished 16:9 article cover image for a GitHub README.
Topic: "基金收益预测助手 V4".
Visual concept: modern fintech dashboard, fund portfolio analytics, modular architecture blocks, market sentiment indicators, AI assistant glow, charts and candlestick lines, Chinese A-share market feel.
Style: clean editorial digital illustration, professional software engineering product.
Text: "基金收益预测助手 V4" and "模块化、持仓持久化、市场情绪升级".
```

### `v4-modular-architecture.png`

用途：README 中 V4 模块化架构总览。

Prompt 摘要：

```text
Create a 16:9 technical architecture image for a GitHub README.
Title: "V4 模块化架构总览".
Show layers: Web / CLI / AI 助手; route layer; service layer; frontend modules; infrastructure; external data.
Include Flask, JavaScript, cache, rate limit, config template, tests, 东方财富, 新浪财经, OpenAI兼容接口, MySQL.
Style: clean software architecture diagram, readable Chinese labels, GitHub docs compatible.
```

### `v4-feature-overview.png`

用途：README 中 V4 功能总览。

Prompt 摘要：

```text
Create a 16:9 GitHub README infographic for "基金收益预测助手 V4".
Title: "V4 功能总览".
Use a bento-grid modular infographic layout with 10 feature blocks around a central fund analytics dashboard.
Feature labels: 持仓管理, 实时估值, 组合分析, 基金对比, 定投回测, 市场情绪, 智能推荐, AI 晨报, 数据导出, CLI 工具.
Style: editorial-infographic, cool blueprint palette, light background, clean rounded cards.
```

### `v4-data-flow.png`

用途：README 中数据流与缓存策略。

Prompt 摘要：

```text
Create a 16:9 technical data-flow diagram for "基金收益预测助手 V4".
Title: "V4 数据流与缓存策略".
Show flow from 用户操作 to Flask API to services, infrastructure, and external sources.
Include labels: TTL 缓存, 令牌桶限流, 配置模板, 持仓存储, 东方财富, 新浪财经, OpenAI 兼容接口, MySQL.
```

### `v4-portfolio-analysis.png`

用途：README 中持仓与组合分析能力说明。

Prompt 摘要：

```text
Create a 16:9 polished fintech product screenshot-style illustration for "基金收益预测助手 V4".
Title: "V4 持仓与组合分析".
Show portfolio holdings table, total assets card, profit/loss cards, sector allocation donut, risk metrics, drawdown line chart, diversification score.
```

### `v4-sentiment-ai.png`

用途：README 中市场情绪与 AI 晨报能力说明。

Prompt 摘要：

```text
Create a 16:9 polished fintech dashboard illustration for "基金收益预测助手 V4".
Title: "V4 市场情绪与 AI 晨报".
Show sentiment gauges, limit-up/limit-down cards, ETF heatmap, northbound capital flow chart, volume trend, and AI morning report panel.
```
