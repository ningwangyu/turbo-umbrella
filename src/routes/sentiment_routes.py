"""
市场情绪监控API — 恐慌/贪婪指数、北向资金、ETF排行、涨跌停列表
"""

from flask import Blueprint, jsonify, request

from services.sentiment_service import (
    get_etf_consecutive_flow,
    get_limit_refresh_state,
    get_limit_stocks,
    get_market_sentiment,
    get_volume_trend,
    refresh_etf_flow_data,
    refresh_limit_stocks,
)
from services.fund_service import search_funds_by_stock

sentiment_bp = Blueprint("sentiment", __name__)


@sentiment_bp.route("/api/market/sentiment")
def market_sentiment():
    """获取市场情绪指数（恐慌/贪婪指数 + 多维指标）
    ---
    tags:
      - 情绪
    summary: 市场情绪指数
    description: 获取恐慌/贪婪指数及多维度市场情绪指标
    responses:
      200:
        description: 情绪指数数据
    """
    result = get_market_sentiment()
    return jsonify(result)


@sentiment_bp.route("/api/market/sentiment/limits")
def limit_stocks():
    """获取涨停/跌停个股列表
    ---
    tags:
      - 情绪
    summary: 涨跌停个股列表
    description: 获取涨停或跌停个股列表（读取本地数据库）
    parameters:
      - name: direction
        in: query
        type: string
        default: up
        enum: [up, down]
        description: "方向：up(涨停) 或 down(跌停)"
    responses:
      200:
        description: 涨跌停个股列表
      400:
        description: 参数错误
        schema:
          $ref: '#/definitions/Error'
    """
    direction = request.args.get("direction", "up")
    if direction not in ("up", "down"):
        return jsonify({"error": "direction 参数必须为 up 或 down"}), 400
    stocks = get_limit_stocks(direction)
    return jsonify(stocks)


@sentiment_bp.route("/api/market/sentiment/limits/state")
def limit_stocks_state():
    """获取涨跌停数据库刷新状态
    ---
    tags:
      - 情绪
    summary: 涨跌停数据刷新状态
    description: 获取涨跌停数据库的最后刷新时间和状态
    responses:
      200:
        description: 刷新状态信息
    """
    return jsonify(get_limit_refresh_state())


@sentiment_bp.route("/api/market/sentiment/limits/refresh", methods=["POST"])
def refresh_limit_stocks_route():
    """手动刷新涨跌停数据到本地数据库
    ---
    tags:
      - 情绪
    summary: 刷新涨跌停数据
    description: 手动触发刷新涨跌停数据到本地数据库
    responses:
      200:
        description: 刷新结果
      500:
        description: 刷新失败
        schema:
          $ref: '#/definitions/Error'
    """
    import traceback
    try:
        result = refresh_limit_stocks()
        return jsonify(result)
    except Exception as e:
        print(f"LIMIT STOCKS REFRESH ERROR: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@sentiment_bp.route("/api/market/sentiment/stock-funds")
def stock_funds():
    """根据股票代码查询持有该股的基金
    ---
    tags:
      - 情绪
    summary: 查询持股基金
    description: 根据6位股票代码查询哪些基金重仓持有该股票
    parameters:
      - name: stock_code
        in: query
        type: string
        required: true
        description: 6位股票代码
        example: "600519"
    responses:
      200:
        description: 持有该股票的基金列表
      400:
        description: 参数错误
        schema:
          $ref: '#/definitions/Error'
    """
    stock_code = request.args.get("stock_code", "").strip()
    if not stock_code or len(stock_code) != 6 or not stock_code.isdigit():
        return jsonify({"error": "请输入6位股票代码"}), 400
    funds = search_funds_by_stock(stock_code)
    return jsonify(funds)


@sentiment_bp.route("/api/market/sentiment/volume-trend")
def volume_trend():
    """获取近5个交易日沪深两市总成交额
    ---
    tags:
      - 情绪
    summary: 成交额趋势
    description: 获取近5个交易日沪深两市总成交额趋势数据
    responses:
      200:
        description: 成交额趋势数据
    """
    trend = get_volume_trend()
    return jsonify(trend)


@sentiment_bp.route("/api/market/sentiment/etf-consecutive")
def etf_consecutive():
    """获取ETF持续流入/流出天数排行
    ---
    tags:
      - 情绪
    summary: ETF连续流入流出排行
    description: 获取ETF持续流入/流出天数排行
    parameters:
      - name: days
        in: query
        type: integer
        default: 7
        enum: [1, 3, 7, 15, 30]
        description: 统计天数
    responses:
      200:
        description: ETF流入流出排行数据
      400:
        description: 参数错误
        schema:
          $ref: '#/definitions/Error'
      500:
        description: 数据获取失败
        schema:
          $ref: '#/definitions/Error'
    """
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


@sentiment_bp.route("/api/market/sentiment/etf-consecutive/refresh", methods=["POST"])
def refresh_etf_consecutive():
    """刷新ETF持续流入/流出统计到本地数据库
    ---
    tags:
      - 情绪
    summary: 刷新ETF流量统计
    description: 刷新ETF持续流入/流出统计到本地数据库
    parameters:
      - name: days
        in: query
        type: integer
        default: 30
        description: 统计天数
      - name: backfill
        in: query
        type: string
        default: "0"
        enum: ["0", "1", "true", "false"]
        description: 是否回填历史数据
    responses:
      200:
        description: 刷新结果
      500:
        description: 刷新失败
        schema:
          $ref: '#/definitions/Error'
    """
    import traceback
    try:
        days = request.args.get("days", 30, type=int)
        backfill = request.args.get("backfill", "0") in ("1", "true", "True", "yes")
        result = refresh_etf_flow_data(days, backfill=backfill)
        return jsonify(result)
    except Exception as e:
        print(f"ETF CONSECUTIVE REFRESH ERROR: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
