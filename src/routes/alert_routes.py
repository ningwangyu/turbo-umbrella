"""
价格提醒API — 当基金涨跌幅超过用户设定阈值时触发提醒

注意：当前使用内存存储(_alerts)，服务重启后提醒会丢失。
如需持久化可后续接入数据库。
"""

import time

from flask import Blueprint, jsonify, request

from services.fund_service import fetch_fund_estimation

alert_bp = Blueprint("alert", __name__)

_alerts = []  # 内存存储提醒列表，每项含 id/code/name/condition/threshold/triggered


@alert_bp.route("/api/alerts", methods=["GET"])
def list_alerts():
    """获取所有提醒列表"""
    return jsonify(_alerts)


@alert_bp.route("/api/alerts", methods=["POST"])
def add_alert():
    """
    添加价格提醒。

    参数：
    - code: 基金代码
    - name: 基金名称
    - condition: 触发条件 "above"(涨幅超阈值) 或 "below"(跌幅超阈值)
    - threshold: 阈值百分比
    """
    data = request.get_json(force=True)
    code = data.get("code", "").strip()
    name = data.get("name", "")
    condition = data.get("condition", "above")
    threshold = float(data.get("threshold", 0))
    if not code or not threshold:
        return jsonify({"error": "请提供基金代码和阈值"}), 400
    alert = {
        "id": int(time.time() * 1000),  # 毫秒时间戳作为唯一ID
        "code": code,
        "name": name,
        "condition": condition,
        "threshold": threshold,
        "triggered": False,
        "created_at": time.strftime("%Y-%m-%d %H:%M"),
    }
    _alerts.append(alert)
    return jsonify(alert)


@alert_bp.route("/api/alerts/<int:alert_id>", methods=["DELETE"])
def delete_alert(alert_id):
    """删除指定提醒"""
    global _alerts
    _alerts = [a for a in _alerts if a["id"] != alert_id]
    return jsonify({"ok": True})


@alert_bp.route("/api/alerts/check", methods=["GET"])
def check_alerts():
    """
    检查所有未触发的提醒，获取实时估值后判断是否满足触发条件。
    触发后标记为triggered，不再重复触发。
    """
    triggered = []
    for alert in _alerts:
        if alert["triggered"]:
            continue
        est = fetch_fund_estimation(alert["code"])
        if not est:
            continue
        pct = float(est.get("estimated_change_pct", 0))

        # 判断是否满足触发条件
        if alert["condition"] == "above" and pct >= alert["threshold"]:
            alert["triggered"] = True
            alert["trigger_value"] = pct
            triggered.append(alert)
        elif alert["condition"] == "below" and pct <= alert["threshold"]:
            alert["triggered"] = True
            alert["trigger_value"] = pct
            triggered.append(alert)
    return jsonify({"triggered": triggered, "total": len(_alerts)})
