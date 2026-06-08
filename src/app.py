"""
基金收益预测助手 V2 — Flask应用入口

架构说明：
- 5个Blueprint分别负责基金、行情、AI、提醒、组合统计
- 静态页面通过模板渲染（单页应用，所有逻辑在app.js中）
- 启动时初始化API限流器（东方财富5次/秒，新浪3次/秒）
"""

import logging
import os
from flask import Flask, render_template
from flask_cors import CORS

from config import CONFIG
from ratelimit import limiter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

# 配置API限流：东方财富5次/秒，新浪3次/秒（可在config.json中覆盖）
_em_cfg = CONFIG.get("api", {}).get("eastmoney", {})
_sina_cfg = CONFIG.get("api", {}).get("sina", {})
limiter.configure("eastmoney", _em_cfg.get("rate_limit_per_second", 5))
limiter.configure("sina", _sina_cfg.get("rate_limit_per_second", 3))

# 创建Flask应用，启用CORS跨域支持
app = Flask(__name__)
CORS(app)

# Swagger/OpenAPI文档配置
from flasgger import Swagger

swagger_template = {
    "info": {
        "title": "基金收益预测助手 API",
        "description": "基金收益预测助手 V2 后端API文档。包含基金查询、行情数据、AI对话、价格提醒、组合分析、定投回测、市场情绪、数据导出、AI晨报、持仓管理、仪表盘、风险分析等模块。",
        "version": "2.0.0",
        "contact": {
            "name": "基金助手开发团队",
        },
    },
    "basePath": "/",
    "schemes": ["http", "https"],
    "tags": [
        {"name": "基金", "description": "基金查询、信号计算、推荐、智能导入"},
        {"name": "行情", "description": "市场指数、板块行情、贵金属价格"},
        {"name": "AI", "description": "AI对话与图片识别"},
        {"name": "提醒", "description": "价格提醒管理"},
        {"name": "组合", "description": "持仓组合统计与深度分析"},
        {"name": "回测", "description": "定投回测模拟"},
        {"name": "情绪", "description": "市场情绪监控"},
        {"name": "导出", "description": "数据导出"},
        {"name": "晨报", "description": "AI晨报"},
        {"name": "持仓", "description": "MySQL持仓持久化"},
        {"name": "仪表盘", "description": "驾驶舱聚合数据"},
        {"name": "风险分析", "description": "风险分析与预测"},
    ],
    "definitions": {
        "Error": {
            "type": "object",
            "properties": {
                "error": {
                    "type": "string",
                    "description": "错误信息",
                }
            },
            "required": ["error"],
        },
        "Holding": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "6位基金代码",
                    "example": "000001",
                },
                "value": {
                    "type": "number",
                    "format": "float",
                    "description": "持有金额（元）",
                    "example": 10000,
                },
                "profit": {
                    "type": "number",
                    "format": "float",
                    "description": "持有收益（元）",
                    "example": 500,
                },
                "name": {
                    "type": "string",
                    "description": "基金名称（可选）",
                },
            },
            "required": ["code", "value"],
        },
        "HoldingsRequest": {
            "type": "object",
            "properties": {
                "holdings": {
                    "type": "array",
                    "description": "持仓列表",
                    "items": {"$ref": "#/definitions/Holding"},
                }
            },
            "required": ["holdings"],
        },
    },
}

swagger_config = {
    "headers": [],
    "specs": [
        {
            "endpoint": "apispec",
            "route": "/apispec.json",
            "rule_filter": lambda rule: True,
            "model_filter": lambda tag: True,
        }
    ],
    "static_url_path": "/flasgger_static",
    "swagger_ui": True,
    "specs_route": "/api/docs/",
}

swagger = Swagger(app, template=swagger_template, config=swagger_config)

# 注册5个功能模块的Blueprint
from routes.fund_routes import fund_bp          # 基金相关API（估值、信号、推荐、导入）
from routes.market_routes import market_bp      # 行情API（指数、板块、贵金属）
from routes.ai_routes import ai_bp              # AI对话与图片识别API
from routes.alert_routes import alert_bp        # 价格提醒API
from routes.portfolio_routes import portfolio_bp # 组合统计API
from routes.backtest_routes import backtest_bp  # 定投回测API
from routes.sentiment_routes import sentiment_bp # 市场情绪API
from routes.export_routes import export_bp      # 数据导出API
from routes.morning_report_routes import report_bp # AI晨报API
from routes.holding_routes import holding_bp    # MySQL持仓持久化API
from routes.dashboard_routes import dashboard_bp      # 驾驶舱API
from routes.risk_analysis_routes import risk_analysis_bp  # 风险分析API

app.register_blueprint(fund_bp)
app.register_blueprint(market_bp)
app.register_blueprint(ai_bp)
app.register_blueprint(alert_bp)
app.register_blueprint(portfolio_bp)
app.register_blueprint(backtest_bp)
app.register_blueprint(sentiment_bp)
app.register_blueprint(export_bp)
app.register_blueprint(report_bp)
app.register_blueprint(holding_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(risk_analysis_bp)


if __name__ != "__main__" or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
    import threading
    from services.sentiment.scheduler import start_sentiment_background_jobs
    start_sentiment_background_jobs()

    def _warmup_caches():
        from services.market_service import _fetch_hot_sectors_sync, _fetch_metal_prices_sync
        try: _fetch_hot_sectors_sync()
        except Exception: pass
        try: _fetch_metal_prices_sync()
        except Exception: pass
    threading.Thread(target=_warmup_caches, daemon=True).start()


@app.route("/")
def index():
    """首页 — 渲染单页应用HTML"""
    return render_template("index.html")


if __name__ == "__main__":
    print("=" * 50)
    print("基金收益预测助手 V2")
    print("访问 http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, host="0.0.0.0", port=5000)
