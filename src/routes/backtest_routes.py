"""
定投回测API — 智能定投模拟器
"""

from flask import Blueprint, jsonify, request

from services.backtest_service import run_backtest

backtest_bp = Blueprint("backtest", __name__)


@backtest_bp.route("/api/backtest", methods=["POST"])
def backtest():
    """定投回测接口
    ---
    tags:
      - 回测
    summary: 定投回测模拟
    description: 智能定投模拟器，支持多种策略（定额/智慧定投/价值平均）的回测对比
    parameters:
      - name: body
        in: body
        required: true
        schema:
          type: object
          required:
            - code
          properties:
            code:
              type: string
              description: 6位基金代码
              example: "000001"
            amount:
              type: number
              description: 每期定投金额（元）
              default: 1000
            frequency:
              type: string
              description: 定投频率
              default: monthly
              enum: [weekly, biweekly, monthly]
            strategies:
              type: array
              description: 策略列表
              items:
                type: string
                enum: [fixed, smart, value]
              default: [fixed, smart, value]
            time_range:
              type: string
              description: 回测时间范围
              default: "3m"
              enum: ["1m", "3m", "6m", "1y", "3y", "5y"]
    responses:
      200:
        description: 回测结果
      400:
        description: 参数错误
        schema:
          $ref: '#/definitions/Error'
    """
    data = request.get_json(force=True)
    code = str(data.get("code", "")).strip()
    if not code:
        return jsonify({"error": "请提供基金代码"}), 400

    amount = float(data.get("amount", 1000))
    frequency = data.get("frequency", "monthly")
    strategies = data.get("strategies", ["fixed", "smart", "value"])
    time_range = data.get("time_range", "3m")

    result = run_backtest(code, amount, frequency, strategies, time_range)
    if "error" in result:
        return jsonify(result), 400
    return jsonify(result)
