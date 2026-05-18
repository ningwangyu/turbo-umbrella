"""
行情数据API — 市场指数、热门板块、贵金属价格、K线走势
"""

from flask import Blueprint, jsonify, request

from services.market_service import (
    get_market_indices, get_hot_sectors, get_metal_prices, get_metal_trend,
)

market_bp = Blueprint("market", __name__)


@market_bp.route("/api/market/index")
def market_index():
    """获取A股三大指数实时行情（上证/深证/创业板）"""
    result = get_market_indices()
    return jsonify(result)


@market_bp.route("/api/market/sectors")
def hot_sectors():
    """获取行业板块行情（涨跌幅排序，含领涨股信息）"""
    result = get_hot_sectors()
    return jsonify(result)


@market_bp.route("/api/price/metals")
def metal_prices():
    """获取贵金属实时价格（黄金/白银，含国内人民币换算价）"""
    result = get_metal_prices()
    if "error" in result:
        return jsonify(result), 500
    return jsonify(result)


@market_bp.route("/api/price/metals/trend")
def metal_trend():
    """
    获取贵金属K线走势数据。
    参数：metal(品种) period(周期: 7d/15d/1m/3m/6m/1y)
    """
    metal = request.args.get("metal", "gold")
    period = request.args.get("period", "1m")
    result = get_metal_trend(metal, period)
    if "error" in result:
        return jsonify(result), 500
    return jsonify(result)
