"""
基金收益预测助手 V4 — Flask 应用入口

架构说明：
- Blueprint 按基金、行情、AI、提醒、组合、回测、情绪、导出、晨报、持仓分组
- 静态页面通过模板渲染，前端按业务视图拆分模块
- 启动时初始化 API 限流器，并启动市场情绪后台刷新任务
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

# 注册 V4 功能模块的 Blueprint
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


if __name__ != "__main__" or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
    from services.sentiment.scheduler import start_sentiment_background_jobs
    start_sentiment_background_jobs()


@app.route("/")
def index():
    """首页 — 渲染单页应用HTML"""
    return render_template("index.html")


if __name__ == "__main__":
    print("=" * 50)
    print("基金收益预测助手 V4")
    print("访问 http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, host="0.0.0.0", port=5000)
