"""
AI晨报API — 每日市场分析报告
"""

from flask import Blueprint, jsonify, request

from services.morning_report_service import generate_morning_report

report_bp = Blueprint("report", __name__)


@report_bp.route("/api/report/morning", methods=["POST"])
def morning_report():
    """生成AI晨报
    ---
    tags:
      - 晨报
    summary: 生成AI晨报
    description: 基于持仓数据和市场行情，调用AI生成每日投资晨报
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/HoldingsRequest'
    responses:
      200:
        description: 晨报内容
      500:
        description: 生成失败
        schema:
          $ref: '#/definitions/Error'
    """
    data = request.get_json(force=True)
    holdings = data.get("holdings", [])
    result = generate_morning_report(holdings)
    return jsonify(result)
