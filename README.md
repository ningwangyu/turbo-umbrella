# 基金收益预测助手 V2

基金收益预测助手 V2 是在 V1 基础上的一次结构化升级。V1 已经完成了本地基金分析闭环，V2 的重点不是简单增加页面，而是把原本偏单体的实现拆成更清晰的工程结构，并补齐组合分析、定投回测、市场情绪、数据导出、AI 晨报等更完整的投资辅助能力。

> 投资有风险。本项目输出的估值、信号、推荐、AI 分析和回测结果仅用于学习、研究和辅助分析，不构成任何投资建议。

## V1 到 V2 的主要更新

### 1. 架构从单体脚本升级为模块化工程

V1 的核心后端逻辑主要集中在根目录 `app.py` 中，前端逻辑集中在 `static/js/app.js`，样式集中在 `static/css/style.css`。这种结构适合快速展示，但功能继续增加后，路由、数据抓取、AI 调用、量化分析和页面交互会相互挤在一起。

V2 将项目重构为 `src/` 目录下的分层结构：

```text
src/
  app.py                  Flask 应用入口，只负责应用创建和 Blueprint 注册
  routes/                 API 路由层，负责请求参数和 HTTP 响应
  services/               业务服务层，负责数据源、AI、推荐、回测、晨报等逻辑
  quant/                  量化信号计算模块
  cache.py                TTL 内存缓存
  ratelimit.py            令牌桶限流器
  config.py               配置加载和默认参数
  static/js/              前端功能模块拆分
  static/css/             前端样式模块拆分
```

这一版把后端拆成多个 Blueprint，包括基金、行情、AI、提醒、组合、回测、情绪、导出和晨报；前端也从单个大 JS / CSS 文件拆成多个功能文件，便于定位问题和继续扩展。

### 2. 代码注释和可读性增强

V2 对核心模块补充了大量模块级说明、函数说明和关键流程注释，重点解释：

- 每个 Blueprint 的职责边界。
- 东方财富和新浪财经等外部数据源的调用策略。
- TTL 缓存为什么按数据类型拆分。
- 令牌桶限流器的工作方式。
- 多因子买卖信号的计算逻辑和权重。
- 推荐引擎的候选池、快速评分、并发精评和降级策略。
- AI 流式对话、图片识别导入和晨报生成流程。

相比 V1，V2 更适合作为课程项目、毕业设计或二次开发项目展示，因为代码结构和注释能直接说明设计思路，而不只是功能能运行。

### 3. 功能从“基金看板”扩展为“组合分析工具”

V1 已支持持仓录入、基金估值、净值走势、重仓股、量化信号、推荐基金、市场指数、贵金属、AI 对话和图片识别。

V2 在这些基础上新增或强化了：

| 方向 | V1 | V2 更新 |
| --- | --- | --- |
| 后端结构 | 单体 `app.py` 为主 | `routes / services / quant` 分层，9 个 Blueprint |
| 前端结构 | 单个主 JS 和样式文件 | 按 AI、行情、回测、组合、推荐、情绪等模块拆分 |
| 组合统计 | 基础总资产、收益统计 | 增加权重、成本、今日预估、单基金明细 |
| 组合深度分析 | 较弱 | 增加类型分布、重仓股重叠、波动率、最大回撤、Sharpe |
| 定投能力 | 无完整回测模块 | 新增普通定投、智能定投、价值平均策略回测 |
| 市场情绪 | 主要看指数和板块 | 新增恐惧/贪婪式情绪评分、北向资金、ETF 排行等指标 |
| AI 能力 | 对话和图片识别 | 强化流式对话、图片识别校验、每日市场晨报 |
| 数据导出 | 较基础 | 新增 CSV / JSON 持仓导出，附带实时估值快照 |
| CLI | 可查询持仓、信号、推荐 | 继续复用后端服务层，结构更清晰 |
| 安全配置 | 有配置示例 | 默认忽略真实 `config.json` 和本地持仓文件，避免密钥进入 Git |

### 4. 数据与性能处理更清晰

V2 将缓存和限流独立成基础设施模块：

- `cache.py`：按估值、历史表现、重仓、指数、板块、推荐、贵金属、信号等数据类型建立独立 TTL 缓存。
- `ratelimit.py`：使用线程安全的令牌桶控制东方财富和新浪财经请求频率。
- `config.py`：统一管理 AI、数据源、缓存、推荐并发和服务器配置。

这些改动让项目在并发请求、第三方接口不稳定和页面自动刷新场景下更稳，也更容易解释工程设计。

### 5. 安全发布方式调整

V2 上传 GitHub 时不提交真实 `src/config.json`，只提交 `src/config.example.json`。真实 AI Key、个人持仓 `src/holdings.json`、缓存文件、IDE 文件和本地 Agent/skills 目录都被 `.gitignore` 排除。

## V2 创新点

### 多因子量化信号

信号引擎位于 `src/quant/signals.py`，综合均线位置、RSI、近期动量、阶段回撤和历史分位，输出买入分、卖出分、信号标签和因子明细。它不是简单看涨跌幅，而是把趋势、估值位置和短期状态放在同一个评分框架里。

### 推荐引擎

推荐服务位于 `src/services/recommend_service.py`，流程包括候选池抓取、快速评分、Top 候选并发精评、综合分排序、推荐等级分层和失败降级。相比直接展示排行榜，V2 更强调“先筛选，再评分，再解释”。

### 组合深度分析

组合分析位于 `src/routes/portfolio_routes.py` 和相关服务调用中，支持基金类型分布、重仓股重叠分析和组合层面的风险指标。用户不只能看到赚了多少，还能看到组合暴露是否集中、风险是否偏高。

### 定投回测

回测服务位于 `src/services/backtest_service.py`，支持：

- 固定金额定投。
- 基于均线偏离的智能定投。
- 价值平均策略。

输出投入本金、最终市值、收益率、份额、平均成本和每期明细，适合对比不同定投策略。

### 市场情绪监控

市场情绪服务位于 `src/services/sentiment_service.py`，综合涨跌家数、涨跌停、成交量、北向资金和 ETF 数据形成情绪评分，为基金操作提供市场温度参考。

### AI 辅助流程

V2 保留 AI 对话和图片识别，并新增每日晨报能力。图片识别导入不只依赖模型输出，还会通过基金代码格式、基金名称反查和基金数据接口进行校验，降低错误导入概率。

## 功能概览

### 基金管理

- 单只基金实时估值查询。
- 批量基金估值查询。
- 基金名称和代码搜索。
- 基金历史净值、阶段收益和重仓股查询。
- 文本导入持仓，支持 JSON、自然语言文本和基金名称模糊匹配。
- 图片导入持仓，通过 AI 识别截图中的基金代码、名称、持仓金额和收益。

### 市场行情

- A 股主要指数行情。
- 热门行业板块行情。
- 黄金、白银等贵金属价格。
- 贵金属 K 线趋势。
- 市场情绪指数、北向资金和 ETF 排行。

### 组合与回测

- 组合总市值、总成本、累计收益、今日预估收益。
- 单只基金持仓权重。
- 基金类型分布和重仓股重叠分析。
- 波动率、最大回撤、Sharpe 等风险指标。
- 普通定投、智能定投、价值平均策略回测。

### AI 与导出

- 基金投资场景的流式 AI 对话。
- 截图识别持仓信息。
- 根据当前持仓生成每日市场晨报。
- 持仓 CSV / JSON 导出。

## 技术栈

- Python 3.10+
- Flask 3
- Flask-CORS
- Requests
- 原生 HTML / CSS / JavaScript
- 外部数据源：东方财富、新浪财经
- AI 接口：OpenAI 兼容 Chat Completions API

## 快速开始

### 1. 克隆项目

```bash
git clone git@github.com:ningwangyu/turbo-umbrella.git
cd turbo-umbrella
```

V1 版本保存在分支：

```bash
git checkout umbrella-v1
```

V2 主版本在：

```bash
git checkout main
```

### 2. 创建虚拟环境

Windows PowerShell：

```powershell
cd src
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

macOS / Linux：

```bash
cd src
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. 准备配置

复制示例配置：

```bash
cp config.example.json config.json
```

Windows PowerShell：

```powershell
Copy-Item config.example.json config.json
```

AI API 的地址和密钥分别对应 `config.json` 中的 `ai.base_url`、`ai.api_key`，可以在该文件中修改。建议不要把真实密钥写进仓库，AI 密钥优先从环境变量读取：

```bash
export AI_API_KEY="your-api-key"
```

Windows PowerShell：

```powershell
$env:AI_API_KEY="your-api-key"
```

如果不使用 AI 对话、图片识别和晨报功能，可以保持 `AI_API_KEY` 为空，基金行情、组合统计、定投回测等非 AI 功能仍可使用。

### 4. 启动 Web 应用

```bash
python app.py
```

浏览器访问：

```text
http://localhost:5000
```

Windows 用户也可以双击：

```text
src/start.bat
```

## CLI 使用

进入 `src` 目录后执行：

```bash
python cli.py --help
```

常用命令：

```bash
python cli.py list
python cli.py add 000001 10000 --profit 300
python cli.py remove 000001
python cli.py signal 000001
python cli.py recommend --count 10
python cli.py metals
python cli.py config
```

CLI 持仓数据默认保存在本地 `src/holdings.json`，该文件属于个人运行数据，不建议提交到 Git。

## 配置说明

核心配置位于 `src/config.json`，未创建时会使用 `config.py` 中的默认值。需要更换 AI API URL 或 Key 时，修改 `ai.base_url` 和 `ai.api_key`；部署环境也可以通过 `AI_BASE_URL`、`AI_API_KEY` 覆盖。

主要配置项：

- `ai.base_url`：OpenAI 兼容服务地址。
- `ai.api_key`：AI 服务密钥，也可通过 `AI_API_KEY` 环境变量提供。
- `ai.model`：模型名称。
- `api.eastmoney.rate_limit_per_second`：东方财富接口限流。
- `api.sina.rate_limit_per_second`：新浪财经接口限流。
- `cache.*`：不同数据类型的缓存 TTL。
- `recommend.max_workers`：推荐分析并发线程数。
- `server.host` / `server.port`：服务监听地址和端口。

## API 文档

接口清单见 [docs/API.md](docs/API.md)。

## 数据与安全

- `src/config.json` 已被 `.gitignore` 忽略，请不要提交真实密钥。
- `src/holdings.json` 是本地持仓数据，也已被忽略。
- 外部行情接口可能受网络、交易时段和第三方限流影响，生产部署时建议增加持久化缓存和错误监控。
- AI 功能依赖外部模型服务，图片识别和问答结果需要人工复核。

## 开发说明

添加新功能时建议遵循现有分层：

- 路由层放在 `src/routes/`，负责参数校验和 HTTP 响应。
- 业务逻辑放在 `src/services/`，负责调用外部接口、数据清洗和组合计算。
- 量化模型放在 `src/quant/`。
- 前端交互放在 `src/static/js/`，样式放在 `src/static/css/`。
- 缓存优先使用 `cache.py` 中的 `TimedCache`。
- 外部接口调用应使用 `ratelimit.py` 中的全局限流器。

## 常见问题

### 访问页面正常，但部分数据为空

可能原因：

- 非交易时间，实时估值接口没有更新。
- 第三方行情接口临时不可用。
- 网络环境无法访问东方财富或新浪财经。
- 基金代码不存在或该基金不支持当前接口。

### AI 对话或截图识别失败

检查：

- `AI_API_KEY` 是否已设置。
- `ai.base_url` 是否指向可用的 OpenAI 兼容接口。
- 模型是否支持多模态图片输入。
- 请求是否超时。

### GitHub 上没有 `config.json`

这是预期行为。`config.json` 可能包含密钥和本地参数，因此不会提交。请复制 `config.example.json` 后在本地创建。

## License

当前仓库未声明开源许可证。使用、分发或商用前请先补充 LICENSE 文件。
