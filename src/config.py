"""
全局配置模块 — 统一管理API配置、缓存TTL、请求头等

配置来源优先级：
1. AI 环境变量（AI_BASE_URL / AI_API_KEY / AI_MODEL）
2. config.json 文件（如存在）
3. config.example.json 模板（公开仓库默认配置）
4. 代码中的默认值

缓存TTL说明（秒）：
- CACHE_TTL(30s): 基金估值（盘中实时数据，需要较短TTL）
- INDEX_CACHE_TTL(30s): 市场指数（实时行情）
- PRICE_CACHE_TTL(60s): 贵金属价格（1分钟刷新足够）
- SECTORS_CACHE_TTL(120s): 热门板块（2分钟刷新）
- PERF_CACHE_TTL(300s): 基金业绩走势（每天更新一次，5分钟缓存足够）
- HOLDINGS_CACHE_TTL(300s): 重仓股数据（季度报告更新）
- POOL_CACHE_TTL(300s): 候选基金池（排行榜变动不频繁）
- METAL_TREND_TTL(300s): 贵金属K线走势
- RECOMMEND_CACHE_TTL(600s): 推荐结果（计算成本高，缓存10分钟）
"""

import os
import json
from pathlib import Path

# 加载本地配置；公开仓库只提交 config.example.json，真实 config.json 由部署环境自行创建。
_CONFIG_PATH = Path(__file__).parent / "config.json"
_EXAMPLE_CONFIG_PATH = Path(__file__).parent / "config.example.json"
if _CONFIG_PATH.exists():
    CONFIG = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
elif _EXAMPLE_CONFIG_PATH.exists():
    CONFIG = json.loads(_EXAMPLE_CONFIG_PATH.read_text(encoding="utf-8"))
else:
    CONFIG = {}

# AI服务配置 — 兼容OpenAI格式的API
_AI_CFG = CONFIG.get("ai", {})
AI_BASE_URL = os.environ.get("AI_BASE_URL") or _AI_CFG.get("base_url", "http://localhost:7361")  # API地址
AI_API_KEY = os.environ.get("AI_API_KEY") or _AI_CFG.get("api_key", "")  # 优先从环境变量读取
AI_MODEL = os.environ.get("AI_MODEL") or _AI_CFG.get("model", "gpt-5.5")                           # 模型名称
AI_TIMEOUT = _AI_CFG.get("timeout_seconds", 60)                       # 请求超时秒数

# 东方财富请求头（必需，否则会拒绝访问）
HEADERS = {"Referer": "http://fund.eastmoney.com/"}

# 各类数据的缓存TTL（秒），详见模块docstring
CACHE_TTL = 30                # 基金估值
PERF_CACHE_TTL = 300          # 业绩走势
HOLDINGS_CACHE_TTL = 300      # 重仓股
PRICE_CACHE_TTL = 60          # 贵金属价格
INDEX_CACHE_TTL = 30          # 市场指数
SECTORS_CACHE_TTL = 120       # 热门板块
RECOMMEND_CACHE_TTL = 600     # 推荐结果
POOL_CACHE_TTL = 300          # 候选基金池
METAL_TREND_TTL = 300         # 贵金属K线走势
SIGNAL_CACHE_TTL = 300        # 量化信号
LIMIT_STOCK_REFRESH_INTERVAL = int(CONFIG.get("sentiment", {}).get("limit_stocks_refresh_seconds", 1800))  # 涨跌停数据库刷新间隔
