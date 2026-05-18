"""
AI晨报API — 每日市场分析报告
"""

from flask import Blueprint, jsonify, request

from services.morning_report_service import generate_morning_report

report_bp = Blueprint("report", __name__)


@report_bp.route("/api/report/morning", methods=["POST"])
def morning_report():
    """
    生成AI晨报。

    参数（POST JSON）：
    - holdings: 持仓列表 [{code, value, profit}]
    """
    data = request.get_json(force=True)
    holdings = data.get("holdings", [])
    result = generate_morning_report(holdings)
    return jsonify(result)
