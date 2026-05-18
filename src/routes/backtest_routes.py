"""
定投回测API — 智能定投模拟器
"""

from flask import Blueprint, jsonify, request

from services.backtest_service import run_backtest

backtest_bp = Blueprint("backtest", __name__)


@backtest_bp.route("/api/backtest", methods=["POST"])
def backtest():
    """
    定投回测接口。

    参数：
    - code: 基金代码（必填）
    - amount: 每期定投金额（默认1000）
    - frequency: 定投频率 weekly/biweekly/monthly（默认monthly）
    - strategies: 策略列表 ["fixed","smart","value"]（默认全部）
    """
    data = request.get_json(force=True)
    code = str(data.get("code", "")).strip()
    if not code:
        return jsonify({"error": "请提供基金代码"}), 400

    amount = float(data.get("amount", 1000))
    frequency = data.get("frequency", "monthly")
    strategies = data.get("strategies", ["fixed", "smart", "value"])

    result = run_backtest(code, amount, frequency, strategies)
    if "error" in result:
        return jsonify(result), 400
    return jsonify(result)
