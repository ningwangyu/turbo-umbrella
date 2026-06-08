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
    """获取A股三大指数实时行情（上证/深证/创业板）
    ---
    tags:
      - 行情
    summary: 获取A股指数
    description: 获取上证综指、深证成指、创业板指三大指数的实时行情数据
    responses:
      200:
        description: 成功返回指数数据
      500:
        description: 数据获取失败
    """
    result = get_market_indices()
    return jsonify(result)


@market_bp.route("/api/market/sectors")
def hot_sectors():
    """获取行业板块行情（涨跌幅排序，含领涨股信息）
    ---
    tags:
      - 行情
    summary: 热门板块行情
    description: 获取行业板块行情，按涨跌幅排序，含领涨股信息
    responses:
      200:
        description: 成功返回板块数据
      500:
        description: 数据获取失败
    """
    result = get_hot_sectors()
    return jsonify(result)


@market_bp.route("/api/price/metals")
def metal_prices():
    """获取贵金属实时价格（黄金/白银，含国内人民币换算价）
    ---
    tags:
      - 行情
    summary: 贵金属实时价格
    description: 获取黄金/白银的实时价格，含国内人民币换算价
    responses:
      200:
        description: 成功返回贵金属价格
      500:
        description: 数据获取失败
        schema:
          $ref: '#/definitions/Error'
    """
    result = get_metal_prices()
    if "error" in result:
        return jsonify(result), 500
    return jsonify(result)


@market_bp.route("/api/price/metals/trend")
def metal_trend():
    """获取贵金属K线走势数据
    ---
    tags:
      - 行情
    summary: 贵金属K线走势
    description: 获取黄金/白银的K线走势数据，支持多种周期
    parameters:
      - name: metal
        in: query
        type: string
        default: gold
        enum: [gold, silver]
        description: "贵金属品种：gold(黄金) 或 silver(白银)"
      - name: period
        in: query
        type: string
        default: "1m"
        enum: ["7d", "15d", "1m", "3m", "6m", "1y"]
        description: "K线周期"
    responses:
      200:
        description: 成功返回K线数据
      500:
        description: 数据获取失败
        schema:
          $ref: '#/definitions/Error'
    """
    metal = request.args.get("metal", "gold")
    period = request.args.get("period", "1m")
    result = get_metal_trend(metal, period)
    if "error" in result:
        return jsonify(result), 500
    return jsonify(result)
