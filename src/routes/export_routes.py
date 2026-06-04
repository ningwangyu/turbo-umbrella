"""
数据导出API — 持仓导出为CSV/JSON
"""

import json
import csv
import io
import time

from flask import Blueprint, jsonify, request, Response

from services.fund_service import fetch_fund_estimation

export_bp = Blueprint("export", __name__)


@export_bp.route("/api/export/json", methods=["POST"])
def export_json():
    """导出持仓数据为JSON格式（含实时估值快照）"""
    data = request.get_json(force=True)
    holdings = data.get("holdings", [])
    if not holdings:
        return jsonify({"error": "无持仓数据"}), 400

    export_data = []
    for h in holdings:
        code = str(h.get("code", "")).strip()
        value = float(h.get("value", 0))
        profit = float(h.get("profit", 0))
        est = fetch_fund_estimation(code)
        export_data.append({
            "code": code,
            "name": est.get("name", code) if est else code,
            "holding_value": value,
            "holding_profit": profit,
            "nav": est.get("nav", "") if est else "",
            "estimated_change_pct": est.get("estimated_change_pct", "0") if est else "0",
            "export_time": time.strftime("%Y-%m-%d %H:%M:%S"),
        })

    output = {
        "version": "1.0",
        "export_time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "fund_count": len(export_data),
        "holdings": export_data,
    }

    json_str = json.dumps(output, ensure_ascii=False, indent=2)
    return Response(
        json_str,
        mimetype="application/json",
        headers={"Content-Disposition": f"attachment; filename=fund_holdings_{time.strftime('%Y%m%d')}.json"},
    )


@export_bp.route("/api/export/csv", methods=["POST"])
def export_csv():
    """导出持仓数据为CSV格式"""
    data = request.get_json(force=True)
    holdings = data.get("holdings", [])
    if not holdings:
        return jsonify({"error": "无持仓数据"}), 400

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["基金代码", "基金名称", "持有金额", "持有收益", "最新净值", "今日涨跌幅%"])

    for h in holdings:
        code = str(h.get("code", "")).strip()
        value = float(h.get("value", 0))
        profit = float(h.get("profit", 0))
        est = fetch_fund_estimation(code)
        writer.writerow([
            code,
            est.get("name", code) if est else code,
            value,
            profit,
            est.get("nav", "") if est else "",
            est.get("estimated_change_pct", "0") if est else "0",
        ])

    csv_str = output.getvalue()
    return Response(
        csv_str,
        mimetype="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": f"attachment; filename=fund_holdings_{time.strftime('%Y%m%d')}.csv"},
    )
