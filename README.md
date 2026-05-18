# 基金收益预测助手 V2

基金收益预测助手 V2 是一个基于 Flask 的基金投资辅助系统，面向个人基金持仓管理、实时估值查看、市场情绪跟踪、量化信号分析、智能推荐和 AI 辅助研判等场景。

项目采用模块化后端结构，前端为单页应用，后端通过 Blueprint 拆分基金、行情、AI、提醒、组合分析、定投回测、市场情绪、数据导出和晨报等能力。

> 风险提示：本项目输出的估值、信号、推荐、AI 分析和回测结果仅用于学习与辅助分析，不构成任何投资建议。

## 版本

当前版本：V2

V2 主要增强点：

- 多 Blueprint 模块化架构，便于维护和扩展。
- 东方财富 + 新浪财经多数据源获取基金和市场行情。
- 基于 TTL 的内存缓存，降低外部接口请求频率。
- 令牌桶限流器，保护第三方行情接口。
- 多因子量化买卖信号，包括均线、RSI、动量、回撤和历史分位。
- 基金推荐引擎，支持候选池筛选、并发评分和分层推荐。
- 组合统计与深度分析，包括持仓权重、今日收益、风险指标和重仓重叠。
- 定投回测，支持普通定投、智能定投和价值平均策略。
- AI 对话、截图识别导入、每日晨报等智能辅助功能。
- CSV / JSON 持仓数据导出。
- CLI 命令行工具，可在无 Web 界面时进行基金查询和管理。

## 功能概览

### 基金管理

- 单只基金实时估值查询。
- 批量基金估值查询。
- 基金名称和代码搜索。
- 基金历史净值、阶段收益和重仓股查询。
- 文本导入持仓，支持 JSON、自然语言文本和基金名称模糊匹配。
- 图片导入持仓，通过 AI 识别截图中的基金代码、名称、持仓金额和收益。

### 量化分析

- 多因子买卖信号评分。
- 买入分、卖出分、信号标签和因子明细。
- 推荐引擎按综合评分输出强烈推荐、推荐买入、值得关注等分层结果。

### 市场行情

- A 股主要指数行情。
- 热门行业板块行情。
- 黄金、白银等贵金属价格。
- 贵金属 K 线趋势。
- 市场情绪指数，综合涨跌家数、涨跌停、成交量、北向资金和 ETF 资金流。

### 组合分析

- 组合总市值、总成本、累计收益、今日预估收益。
- 单只基金持仓权重。
- 基金类型分布。
- 重仓股重叠分析。
- 基于净值序列的波动率、最大回撤、Sharpe 等风险指标。

### 定投回测

- 固定金额定投。
- 基于均线偏离的智能定投。
- 价值平均策略。
- 输出投入本金、最终市值、收益、收益率、份额、平均成本和每期明细。

### AI 能力

- 基金投资场景的流式 AI 对话。
- 截图识别持仓信息。
- 基于当前持仓生成每日市场晨报。
- 兼容 OpenAI Chat Completions 风格接口。

### 数据导出

- 持仓 JSON 导出。
- 持仓 CSV 导出。
- 导出时可附带实时估值快照。

## 技术栈

- Python 3.10+
- Flask 3
- Flask-CORS
- Requests
- 原生 HTML / CSS / JavaScript
- 外部数据源：东方财富、新浪财经
- AI 接口：OpenAI 兼容 Chat Completions API

## 项目结构

```text
src/
  app.py                         Flask 应用入口
  config.py                      配置加载和默认配置
  config.example.json            示例配置文件
  cache.py                       TTL 内存缓存
  ratelimit.py                   令牌桶限流器
  cli.py                         命令行工具
  requirements.txt               Python 依赖
  start.bat                      Windows 快速启动脚本
  routes/                        API 路由层
  services/                      业务服务层
  quant/                         量化信号计算
  templates/                     页面模板
  static/                        前端 CSS / JS
docs/
  API.md                         API 接口说明
```

## 快速开始

### 1. 克隆项目

```bash
git clone git@github.com:ningwangyu/turbo-umbrella.git
cd turbo-umbrella
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

建议不要把真实密钥写进仓库。AI 密钥优先从环境变量读取：

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

核心配置位于 `src/config.json`，未创建时会使用 `config.py` 中的默认值。

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
