# 基金收益预测助手 V2

基金收益预测助手 V2 是一个面向个人投资者的基金分析平台，基于 Flask、原生 JavaScript 和多源金融数据 API 构建。项目提供基金持仓管理、实时估值、市场行情、量化买卖信号、智能基金推荐、AI 对话助手、数据导出和定投回测等功能。

> 说明：本项目仅用于学习、研究和辅助分析，不构成任何投资建议。基金和市场数据来自第三方接口，实际交易前请以官方渠道为准。

## 项目定位

- **版本**：V2
- **推荐分支**：`umbrella-v2`
- **后端**：Python Flask
- **前端**：原生 HTML / CSS / JavaScript
- **图表**：Chart.js
- **AI 接口**：OpenAI 兼容 Chat Completions / Vision API
- **数据源**：东方财富、天天基金、新浪财经等公开行情接口

## 核心功能

1. **基金持仓管理**
   - 添加、删除和查看基金持仓。
   - 自动补全基金名称和实时估值。
   - 本地浏览器持久化持仓数据。
   - 支持文本导入和图片识别导入持仓。

2. **实时行情看板**
   - 展示上证指数、深证成指、创业板指等主要市场指数。
   - 展示热门行业板块、涨跌幅、成交额和领涨标的。
   - 支持交易时间状态识别。

3. **基金深度分析**
   - 查询基金实时估值、历史净值、阶段收益和重仓股。
   - 使用图表展示净值走势。
   - 支持单只基金详情弹窗查看。

4. **多因子量化信号**
   - 使用 MA 均线、RSI、近期动量、回撤幅度和历史分位等因子生成买卖评分。
   - 输出强烈建议买入、建议买入、观望、建议卖出、强烈建议卖出等信号。

5. **智能基金推荐**
   - 先从基金排行榜中构建候选池。
   - 再进行收益能力、风险控制、夏普比率、收益一致性和技术面分析。
   - 使用并发任务提升推荐分析速度。

6. **AI 智能助手**
   - 支持中文基金投资问答。
   - 支持 SSE 流式输出。
   - 支持上传截图识别持仓内容。
   - 使用 OpenAI 兼容接口，便于替换不同模型服务。

7. **扩展工具**
   - 贵金属价格和走势。
   - 价格提醒。
   - 定投回测。
   - 市场情绪指标。
   - 持仓分析和数据导出。
   - CLI 命令行工具。

## 目录结构

```text
jijinv3/
├── README.md
├── .env.example
├── docs/
│   ├── PRODUCT.md
│   ├── PROJECT_DIAGRAMS.md
│   └── images/
├── src/
│   ├── app.py                  # Flask 应用入口
│   ├── cli.py                  # 命令行工具
│   ├── config.py               # 配置加载和全局常量
│   ├── config.json             # 非敏感默认配置
│   ├── cache.py                # TTL 缓存
│   ├── ratelimit.py            # API 限流器
│   ├── requirements.txt        # Python 依赖
│   ├── start.bat               # Windows 一键启动脚本
│   ├── quant/
│   │   └── signals.py          # 多因子信号引擎
│   ├── routes/                 # Flask Blueprints
│   ├── services/               # 业务服务层
│   ├── static/                 # CSS / JavaScript 静态资源
│   ├── templates/
│   │   └── index.html          # 单页应用入口
│   └── tests/                  # 测试用例
└── skills-lock.json
```

## 快速开始

### 1. 克隆项目

```bash
git clone -b umbrella-v2 git@github.com:ningwangyu/turbo-umbrella.git
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
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. 配置 AI 服务

AI 功能不是启动项目的硬性要求；如需使用 AI 对话和图片识别，请设置 OpenAI 兼容服务参数。

Windows PowerShell：

```powershell
$env:AI_BASE_URL="https://your-openai-compatible-endpoint"
$env:AI_API_KEY="your-api-key"
$env:AI_MODEL="gpt-5.5"
```

macOS / Linux：

```bash
export AI_BASE_URL="https://your-openai-compatible-endpoint"
export AI_API_KEY="your-api-key"
export AI_MODEL="gpt-5.5"
```

也可以参考 `.env.example` 管理本地环境变量。请不要把真实 API Key 提交到仓库。

### 4. 启动 Web 服务

```bash
python app.py
```

浏览器访问：

```text
http://localhost:5000
```

Windows 用户也可以双击或运行：

```bat
start.bat
```

## CLI 使用

在 `src` 目录下执行：

```bash
python cli.py list
python cli.py add 000001 10000 --profit 120
python cli.py remove 000001
python cli.py signal 000001
python cli.py recommend --count 10
python cli.py metals
python cli.py config
```

常用命令说明：

| 命令 | 用途 |
| --- | --- |
| `list` / `ls` | 查看本地持仓 |
| `add <code> [value]` | 添加基金持仓 |
| `remove <code>` / `rm <code>` | 删除基金持仓 |
| `signal <code>` | 查看单只基金买卖信号 |
| `recommend` / `rec` | 获取推荐基金列表 |
| `metals` | 查看黄金、白银等贵金属行情 |
| `config` | 查看当前配置 |

## 主要 API

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/fund/<code>` | GET | 获取基金实时估值 |
| `/api/fund/batch` | POST | 批量获取基金数据 |
| `/api/fund/search?q=` | GET | 搜索基金代码或名称 |
| `/api/fund/holdings/<code>` | GET | 获取基金重仓股 |
| `/api/fund/performance/<code>` | GET | 获取基金历史净值走势 |
| `/api/fund/signal/<code>` | GET | 获取量化买卖信号 |
| `/api/fund/recommend` | GET | 获取智能推荐基金 |
| `/api/import/text` | POST | 文本导入持仓 |
| `/api/import/image` | POST | 图片识别导入持仓 |
| `/api/ai/chat` | POST | AI 流式对话 |
| `/api/ai/recognize-image` | POST | AI 图片识别 |
| `/api/market/index` | GET | 获取主要市场指数 |
| `/api/market/sectors` | GET | 获取热门板块 |
| `/api/market/sentiment` | GET | 获取市场情绪 |
| `/api/price/metals` | GET | 获取贵金属价格 |
| `/api/price/metals/trend` | GET | 获取贵金属走势 |
| `/api/alerts` | GET / POST | 管理价格提醒 |
| `/api/alerts/<id>` | DELETE | 删除提醒 |
| `/api/alerts/check` | GET | 检查提醒触发状态 |
| `/api/backtest` | POST | 定投回测 |
| `/api/portfolio/stats` | POST | 持仓统计 |
| `/api/portfolio/analysis` | POST | 持仓分析 |
| `/api/export/json` | POST | 导出 JSON |
| `/api/export/csv` | POST | 导出 CSV |
| `/api/report/morning` | POST | 生成晨报 |

## 配置说明

`src/config.json` 保存非敏感默认配置。敏感配置请通过环境变量注入。

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| `AI_BASE_URL` | OpenAI 兼容 API 地址 | 空 |
| `AI_API_KEY` | AI 服务密钥 | 空 |
| `AI_MODEL` | 模型名称 | `gpt-5.5` |
| `ai.timeout_seconds` | AI 请求超时 | `60` |
| `api.eastmoney.rate_limit_per_second` | 东方财富接口限流 | `5` |
| `api.sina.rate_limit_per_second` | 新浪接口限流 | `3` |
| `cache.estimation_ttl_seconds` | 基金估值缓存秒数 | `30` |
| `cache.performance_ttl_seconds` | 历史走势缓存秒数 | `300` |
| `cache.holdings_ttl_seconds` | 重仓股缓存秒数 | `300` |
| `cache.metals_ttl_seconds` | 贵金属缓存秒数 | `60` |
| `cache.recommend_ttl_seconds` | 推荐结果缓存秒数 | `600` |
| `recommend.max_workers` | 推荐分析并发数 | `10` |
| `recommend.fetch_timeout_seconds` | 推荐分析超时秒数 | `45` |
| `server.port` | Flask 服务端口 | `5000` |

## 测试

项目包含基础测试用例，可在 `src` 目录下运行：

```bash
pip install pytest
pytest
```

如果测试需要访问外部行情接口，请确保当前网络可以访问东方财富、新浪财经等数据源。

## 开发建议

- 不要提交 `.env`、真实 API Key、浏览器本地持仓数据和 Python 缓存文件。
- 业务逻辑优先放在 `src/services/`，路由层只做参数校验和响应封装。
- 新增金融指标时优先放入 `src/quant/`，避免和接口请求逻辑耦合。
- 新增前端模块时放入 `src/static/js/`，并在 `src/templates/index.html` 中按需引入。

## 部署说明

这是一个轻量级 Flask 项目，适合部署到支持 Python 的云服务器、容器平台或 PaaS。生产环境建议：

- 使用 Gunicorn、uWSGI 或 Waitress 承载 Flask 应用。
- 使用 Nginx 做反向代理。
- 使用环境变量管理 AI 密钥。
- 对外部行情接口增加监控和错误降级。
- 根据实际访问量调整缓存 TTL 和接口限流参数。

## 免责声明

本项目提供的估值、排行、信号和推荐结果仅供技术演示和个人研究。金融市场存在风险，任何投资决策都应结合个人风险承受能力并以官方披露数据为准。
