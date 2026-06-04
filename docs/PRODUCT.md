# 基金收益预测助手 V4 产品说明

> 本文档是 V4 版本的产品与工程说明。项目仅用于学习、研究和个人投资辅助分析，不构成投资建议。

## 产品定位

基金收益预测助手 V4 是一个本地化基金投资分析平台，面向个人投资者提供持仓管理、实时估值、组合分析、基金对比、定投回测、市场情绪、智能推荐、AI 晨报和数据导出能力。

系统强调三个目标：

- **可运行**：本地启动即可使用，支持 Web 页面和 CLI。
- **可解释**：组合、风险、板块、情绪和信号都尽量给出可读指标。
- **可维护**：后端服务、前端模块、配置、缓存和限流按职责拆分。

## 核心功能

| 功能 | 说明 |
| --- | --- |
| 持仓管理 | 添加、删除、读取持仓，支持后端持仓 API 和本地/数据库存储配置 |
| 实时估值 | 获取基金净值、估值、涨跌幅和批量估值数据 |
| 组合分析 | 统计资产、收益、板块、重仓股、风险指标和多样化评分 |
| 基金对比 | 多基金横向对比，展示收益、估值、重仓股和信号 |
| 定投回测 | 基于历史净值模拟定投策略和收益曲线 |
| 市场情绪 | 跟踪涨跌家数、涨跌停、ETF、成交量和北向资金 |
| 智能推荐 | 基金池筛选、快速评分、综合评分和推荐排序 |
| AI 晨报 | 基于持仓和市场数据生成结构化晨报 |
| AI 助手 | 支持 OpenAI 兼容接口、聊天和图片识别 |
| 数据导出 | 导出持仓和分析结果，便于二次处理 |

## V4 模块架构

```text
src/
|-- app.py                       Flask 入口
|-- config.py                    配置加载
|-- cache.py                     TTL 缓存
|-- ratelimit.py                 令牌桶限流
|-- cli.py                       命令行入口
|-- routes/                      API 路由
|-- services/                    业务服务
|   |-- recommend/               推荐池与评分
|   |-- sentiment/               市场情绪子服务
|   |-- holding_store.py         持仓存储
|   `-- import_service.py        导入解析
|-- static/js/                   前端模块
|   |-- portfolio/
|   |-- fund-compare/
|   |-- backtest/
|   `-- sentiment/
|-- quant/                       量化信号
|-- templates/                   页面模板
`-- tests/                       自动化测试
```

## 工程设计

- 路由层只处理请求参数、响应格式和错误边界。
- 业务逻辑放在 `services/`，便于单独测试和复用。
- 推荐和市场情绪拆成子目录，避免单文件过大。
- 前端复杂视图按 API、状态、图表、事件、样式和详情拆分。
- 外部接口调用使用缓存、限流、超时和 fallback 降级。
- 公开仓库只提交 `config.example.json`，真实配置保存在本地。

## 图像资产

V4 README 使用以下专属图片：

- `docs/images/v4-hero-cover.png`
- `docs/images/v4-modular-architecture.png`
- `docs/images/v4-feature-overview.png`
- `docs/images/v4-data-flow.png`
- `docs/images/v4-portfolio-analysis.png`
- `docs/images/v4-sentiment-ai.png`

图片提示词记录见 `docs/images/V4_IMAGE_PROMPTS.md`。
