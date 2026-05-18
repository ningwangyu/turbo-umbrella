# 基金收益预测助手 V1

基金收益预测助手 V1 是一个基于 Flask 的个人基金分析工具，面向需要集中查看持仓、基金估值、市场行情、买卖信号和 AI 辅助分析的用户。项目提供 Web 页面和命令行两种入口，前端使用原生 HTML/CSS/JavaScript 与 Chart.js，后端通过 Flask 聚合天天基金、东方财富、新浪财经等数据源，并支持 OpenAI 兼容接口接入 AI 对话和图片识别能力。

> 投资有风险。本项目只用于学习、研究和个人辅助分析，不构成任何投资建议。

## 功能概览

- 持仓管理：添加、删除、批量导入基金持仓，查看总资产、今日估算收益、累计收益和收益率。
- 基金估值：按基金代码获取实时估值、单位净值、估算涨跌幅和更新时间。
- 历史表现：展示基金历史净值走势、近 1 月、3 月、6 月、1 年收益表现。
- 持仓股票：查询基金重仓股明细，结合股票实时涨跌辅助判断基金波动来源。
- 买卖信号：基于均线、RSI、近期动量、回撤、历史分位等因子输出买入、观望或卖出信号。
- 智能推荐：从基金池中筛选并计算综合评分，输出值得关注的基金候选。
- 市场行情：展示上证指数、深证成指、创业板指和热门板块行情。
- 贵金属价格：查看黄金、白银等价格及趋势数据。
- 价格提醒：设置基金涨跌幅阈值并检测触发情况。
- AI 助手：支持流式对话、文本导入解析和图片识别导入持仓截图。
- CLI 工具：支持在终端中查看持仓、添加基金、删除基金、查看信号和推荐基金。

## 技术栈

- 后端：Python 3.10+、Flask、Flask-CORS、Requests
- 前端：原生 JavaScript、HTML、CSS、Chart.js
- 数据源：东方财富、天天基金、新浪财经等公开接口
- AI 能力：OpenAI 兼容 Chat Completions / Vision 接口
- 存储方式：Web 端使用浏览器 localStorage，CLI 端使用本地 `holdings.json`

## 项目结构

```text
jijinv1/
├── app.py                  # Flask 后端、API 路由、数据抓取、AI 调用、量化信号
├── cli.py                  # 命令行入口，复用后端基金分析逻辑
├── ratelimit.py            # 令牌桶限流器，保护外部数据接口
├── config.json             # 本地运行配置，不应写入真实密钥
├── config.example.json     # 配置示例
├── requirements.txt        # Python 依赖
├── start.bat               # Windows 一键启动脚本
├── PRODUCT.md              # 产品说明草稿
├── templates/
│   └── index.html          # Web 单页应用模板
└── static/
    ├── css/style.css       # 页面样式
    └── js/app.js           # 前端交互、图表和接口请求逻辑
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
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

macOS / Linux：

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. 配置 AI 参数

项目可以不配置 AI Key 运行基础行情和基金分析功能。若要使用 AI 对话、图片识别和智能文本解析，请设置环境变量：

Windows PowerShell：

```powershell
$env:AI_BASE_URL="http://127.0.0.1:7361"
$env:AI_API_KEY="你的_API_Key"
$env:AI_MODEL="gpt-5.5"
```

macOS / Linux：

```bash
export AI_BASE_URL="http://127.0.0.1:7361"
export AI_API_KEY="你的_API_Key"
export AI_MODEL="gpt-5.5"
```

也可以复制 `config.example.json` 为 `config.json` 后调整配置。`config.json` 是本地配置文件，已被 Git 忽略；不要把真实 API Key 提交到 Git 仓库。

### 4. 启动 Web 服务

```bash
python app.py
```

启动后访问：

```text
http://localhost:5000
```

Windows 用户也可以双击 `start.bat` 启动。

## 命令行用法

查看帮助：

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

CLI 持仓会保存到本地 `holdings.json`。该文件包含个人持仓数据，已被 `.gitignore` 忽略。

## 主要 API

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/api/fund/<code>` | GET | 获取单只基金实时估值 |
| `/api/fund/batch` | POST | 批量获取基金实时估值 |
| `/api/fund/search?q=` | GET | 按代码或名称搜索基金 |
| `/api/fund/holdings/<code>` | GET | 获取基金重仓股 |
| `/api/fund/performance/<code>` | GET | 获取历史净值和收益表现 |
| `/api/fund/signal/<code>` | GET | 获取量化买卖信号 |
| `/api/fund/recommend` | GET | 获取智能推荐基金 |
| `/api/import/text` | POST | 从文本解析持仓 |
| `/api/import/image` | POST | 从图片识别持仓 |
| `/api/ai/chat` | POST | AI 流式对话 |
| `/api/market/index` | GET | 获取大盘指数 |
| `/api/market/sectors` | GET | 获取热门板块 |
| `/api/price/metals` | GET | 获取贵金属价格 |
| `/api/alerts` | GET/POST | 查询或创建价格提醒 |
| `/api/alerts/<id>` | DELETE | 删除价格提醒 |
| `/api/portfolio/stats` | POST | 计算组合统计数据 |

## 配置说明

`config.json` 中的关键字段：

| 字段 | 说明 |
| --- | --- |
| `ai.base_url` | OpenAI 兼容接口地址 |
| `ai.api_key` | AI 接口密钥，建议使用 `AI_API_KEY` 环境变量覆盖 |
| `ai.model` | AI 模型名称，建议使用 `AI_MODEL` 环境变量覆盖 |
| `api.eastmoney.rate_limit_per_second` | 东方财富接口限流 |
| `api.sina.rate_limit_per_second` | 新浪接口限流 |
| `cache.*_ttl_seconds` | 各类数据缓存时间 |
| `recommend.max_workers` | 推荐计算并发数 |
| `server.host` | Flask 监听地址，可被 `HOST` 环境变量覆盖 |
| `server.port` | Flask 监听端口，可被 `PORT` 环境变量覆盖 |

## V1 版本说明

V1 聚焦个人基金分析的完整闭环：持仓录入、实时估值、收益统计、基金详情、量化信号、推荐筛选、行情辅助和 AI 问答。当前版本采用轻量级单体 Flask 架构，适合本地运行、课程项目展示、个人研究和后续二次开发。

已知限制：

- 外部行情接口可能因网络、限流或数据源变更而短暂不可用。
- Web 端持仓保存在浏览器 localStorage，更换浏览器或清理缓存会丢失。
- AI 功能依赖外部 OpenAI 兼容服务，未配置密钥时不可用。
- 价格提醒当前保存在内存中，服务重启后会丢失。

## 安全注意事项

- 不要提交真实 API Key、个人持仓文件或截图。
- 首次公开上传前建议轮换已经暴露过的 API Key。
- 本项目依赖第三方公开数据接口，请合理设置访问频率。
- 所有分析结果仅供参考，不应作为直接交易依据。
