"""
市场情绪监控API — 恐慌/贪婪指数、北向资金、ETF排行、涨跌停列表
"""

from flask import Blueprint, jsonify, request

from services.sentiment_service import get_market_sentiment, get_limit_stocks, get_volume_trend, get_etf_consecutive_flow
from services.fund_service import search_funds_by_stock

sentiment_bp = Blueprint("sentiment", __name__)


@sentiment_bp.route("/api/market/sentiment")
def market_sentiment():
    """获取市场情绪指数（恐慌/贪婪指数 + 多维指标）"""
    result = get_market_sentiment()
    return jsonify(result)


@sentiment_bp.route("/api/market/sentiment/limits")
def limit_stocks():
    """获取涨停/跌停个股列表"""
    direction = request.args.get("direction", "up")
    if direction not in ("up", "down"):
        return jsonify({"error": "direction 参数必须为 up 或 down"}), 400
    stocks = get_limit_stocks(direction)
    return jsonify(stocks)


@sentiment_bp.route("/api/market/sentiment/stock-funds")
def stock_funds():
    """根据股票代码查询持有该股的基金"""
    stock_code = request.args.get("stock_code", "").strip()
    if not stock_code or len(stock_code) != 6 or not stock_code.isdigit():
        return jsonify({"error": "请输入6位股票代码"}), 400
    funds = search_funds_by_stock(stock_code)
    return jsonify(funds)


@sentiment_bp.route("/api/market/sentiment/volume-trend")
def volume_trend():
    """获取近5个交易日沪深两市总成交额"""
    trend = get_volume_trend()
    return jsonify(trend)


@sentiment_bp.route("/api/market/sentiment/etf-consecutive")
def etf_consecutive():
    """获取ETF持续流入/流出天数排行"""
    import traceback
    try:
        days = request.args.get("days", 7, type=int)
        if days not in (1, 3, 7, 15, 30):
            return jsonify({"error": "days 参数必须为 1、3、7、15、30"}), 400
        result = get_etf_consecutive_flow(days)
        return jsonify(result)
    except Exception as e:
        print(f"ETF CONSECUTIVE ERROR: {e}")
        traceback.print_exc()
        return jsonify({"inflow": [], "outflow": [], "error": str(e)}), 500
