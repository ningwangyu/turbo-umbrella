"""持仓持久化 API — 读写 MySQL 中的本地基金持仓。"""

from __future__ import annotations

import re
from typing import Any

import pymysql
from flask import Blueprint, jsonify, request

from services.holding_store import delete_holding, list_holdings, replace_holdings, upsert_holding

holding_bp = Blueprint("holding", __name__)


def _db_error_response(exc: Exception):
    return jsonify({
        "error": "无法连接 MySQL，请确认 MySQL 服务已启动、root 密码是否为 123456，且账号有建库建表权限。",
        "detail": str(exc),
    }), 500


def _parse_holding(data: dict[str, Any]) -> dict[str, Any]:
    code = str(data.get("code", "")).strip()
    if not re.match(r"^\d{6}$", code):
        raise ValueError("基金代码格式不正确")
    value = float(data.get("value", 0) or 0)
    profit = float(data.get("profit", 0) or 0)
    if value < 0:
        raise ValueError("持有金额不能为负数")
    return {
        "code": code,
        "value": value,
        "profit": profit,
        "name": data.get("name") or None,
        "fund_type": data.get("fund_type") or data.get("type") or None,
        "source": data.get("source") or "manual",
        "metadata": data.get("metadata") or None,
    }


@holding_bp.route("/api/holdings", methods=["GET"])
def get_holdings():
    """读取 MySQL 中保存的全部持仓。"""
    try:
        return jsonify(list_holdings())
    except pymysql.MySQLError as exc:
        return _db_error_response(exc)


@holding_bp.route("/api/holdings", methods=["POST"])
def save_holding():
    """新增或更新单只持仓。"""
    data = request.get_json(force=True)
    try:
        item = _parse_holding(data)
        return jsonify(upsert_holding(**item))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except pymysql.MySQLError as exc:
        return _db_error_response(exc)


@holding_bp.route("/api/holdings", methods=["PUT"])
def replace_all_holdings():
    """用一组持仓替换数据库内容，用于导入、备份恢复和旧数据迁移。"""
    data = request.get_json(force=True)
    items = data.get("holdings", [])
    if not isinstance(items, list):
        return jsonify({"error": "holdings 必须是数组"}), 400

    try:
        parsed = []
        seen = set()
        for item in items:
            parsed_item = _parse_holding(item)
            code = parsed_item["code"]
            if code in seen:
                continue
            seen.add(code)
            parsed_item["source"] = parsed_item.get("source") or "import"
            parsed.append(parsed_item)
        return jsonify(replace_holdings(parsed))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except pymysql.MySQLError as exc:
        return _db_error_response(exc)


@holding_bp.route("/api/holdings/<code>", methods=["DELETE"])
def remove_holding(code: str):
    """删除一只持仓。"""
    code = code.strip()
    if not re.match(r"^\d{6}$", code):
        return jsonify({"error": "基金代码格式不正确"}), 400
    try:
        deleted = delete_holding(code)
        return jsonify({"deleted": deleted, "code": code})
    except pymysql.MySQLError as exc:
        return _db_error_response(exc)
