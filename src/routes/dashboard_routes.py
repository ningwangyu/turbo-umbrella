"""
仪表盘模块路由 — Blueprint定义

功能说明：
- POST /api/dashboard/overview: 聚合仪表盘数据（指数、情绪、持仓、信号）
- POST /api/dashboard/holdings-detail: 持仓收益详情
- POST /api/dashboard/timeline: 智能事件时间线

性能优化：
- 多源API策略（4个数据源自动切换）
- 后台预热机制（应用启动后立即预热缓存）
- 智能缓存（stale-while-revalidate）
- 批量请求优化（减少并发请求数）
"""

import logging
from flask import Blueprint, request, jsonify

from services.dashboard_service import (
    get_dashboard_overview,
    get_holdings_return_detail,
    get_event_timeline
)
from services.api_optimizer import (
    get_prefetch_status,
    prefetch_dashboard_data,
    get_dashboard_data_fast,
    optimize_api_calls
)

logger = logging.getLogger(__name__)

# 创建Blueprint
dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/api/dashboard/overview", methods=["POST"])
def dashboard_overview():
    """聚合仪表盘数据（指数、情绪、持仓、信号）
    ---
    tags:
      - 仪表盘
    summary: 仪表盘概览
    description: 聚合仪表盘数据，包含市场指数、情绪指标、持仓统计、信号汇总
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/HoldingsRequest'
    responses:
      200:
        description: 聚合仪表盘数据
      400:
        description: 缺少持仓数据
        schema:
          $ref: '#/definitions/Error'
      500:
        description: 服务异常
        schema:
          $ref: '#/definitions/Error'
    """
    try:
        data = request.get_json()
        if not data or "holdings" not in data:
            return jsonify({"error": "Missing holdings data"}), 400

        holdings = data["holdings"]
        if not isinstance(holdings, list):
            return jsonify({"error": "Holdings must be a list"}), 400

        # 调用服务层获取聚合数据
        result = get_dashboard_overview(holdings)
        return jsonify(result)

    except Exception as e:
        logger.error(f"Dashboard overview error: {e}")
        return jsonify({"error": str(e)}), 500


@dashboard_bp.route("/api/dashboard/holdings-detail", methods=["POST"])
def holdings_detail():
    """持仓收益详情
    ---
    tags:
      - 仪表盘
    summary: 持仓收益详情
    description: 获取每只基金的市值、权重、今日收益、累计收益等详细数据
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/HoldingsRequest'
    responses:
      200:
        description: 持仓收益详情
      400:
        description: 缺少持仓数据
        schema:
          $ref: '#/definitions/Error'
      500:
        description: 服务异常
        schema:
          $ref: '#/definitions/Error'
    """
    try:
        data = request.get_json()
        if not data or "holdings" not in data:
            return jsonify({"error": "Missing holdings data"}), 400

        holdings = data["holdings"]
        if not isinstance(holdings, list):
            return jsonify({"error": "Holdings must be a list"}), 400

        # 调用服务层获取持仓收益详情
        result = get_holdings_return_detail(holdings)
        return jsonify(result)

    except Exception as e:
        logger.error(f"Holdings detail error: {e}")
        return jsonify({"error": str(e)}), 500


@dashboard_bp.route("/api/dashboard/health", methods=["GET"])
def health_check():
    """健康检查端点
    ---
    tags:
      - 仪表盘
    summary: 健康检查
    description: 仪表盘模块健康检查端点，用于监控
    responses:
      200:
        description: 健康状态
    """
    return jsonify({
        "status": "ok",
        "module": "dashboard",
        "timestamp": "2026-05-20 14:30:00"
    })


@dashboard_bp.route("/api/dashboard/timeline", methods=["POST"])
def timeline():
    """智能事件时间线
    ---
    tags:
      - 仪表盘
    summary: 事件时间线
    description: 检测持仓相关的重要市场事件，生成智能事件时间线
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/HoldingsRequest'
    responses:
      200:
        description: 事件时间线数据
      400:
        description: 缺少持仓数据
        schema:
          $ref: '#/definitions/Error'
      500:
        description: 服务异常
        schema:
          $ref: '#/definitions/Error'
    """
    try:
        data = request.get_json()
        if not data or "holdings" not in data:
            return jsonify({"error": "Missing holdings data"}), 400

        holdings = data["holdings"]
        if not isinstance(holdings, list):
            return jsonify({"error": "Holdings must be a list"}), 400

        # 调用服务层获取事件时间线
        result = get_event_timeline(holdings)
        return jsonify(result)

    except Exception as e:
        logger.error(f"Event timeline error: {e}")
        return jsonify({"error": str(e)}), 500


# ============================================================
# 性能优化端点
# ============================================================

@dashboard_bp.route("/api/dashboard/prefetch-status", methods=["GET"])
def prefetch_status():
    """获取仪表盘数据预热状态
    ---
    tags:
      - 仪表盘
    summary: 预热状态
    description: 获取仪表盘数据缓存的预热状态和统计信息
    responses:
      200:
        description: 预热状态信息
      500:
        description: 服务异常
        schema:
          $ref: '#/definitions/Error'
    """
    try:
        status = get_prefetch_status()
        return jsonify(status)
    except Exception as e:
        logger.error(f"Prefetch status error: {e}")
        return jsonify({"error": str(e)}), 500


@dashboard_bp.route("/api/dashboard/optimize", methods=["GET"])
def optimize_info():
    """获取API优化信息和建议
    ---
    tags:
      - 仪表盘
    summary: 优化建议
    description: 获取API缓存统计和优化建议
    responses:
      200:
        description: 优化信息和建议
      500:
        description: 服务异常
        schema:
          $ref: '#/definitions/Error'
    """
    try:
        info = optimize_api_calls()
        return jsonify(info)
    except Exception as e:
        logger.error(f"Optimize info error: {e}")
        return jsonify({"error": str(e)}), 500


@dashboard_bp.route("/api/dashboard/warmup", methods=["POST"])
def warmup_cache():
    """手动触发缓存预热
    ---
    tags:
      - 仪表盘
    summary: 手动预热缓存
    description: 手动触发仪表盘缓存预热，用于测试和调试
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/HoldingsRequest'
    responses:
      200:
        description: 预热结果
      400:
        description: 缺少持仓数据
        schema:
          $ref: '#/definitions/Error'
      500:
        description: 服务异常
        schema:
          $ref: '#/definitions/Error'
    """
    try:
        data = request.get_json()
        if not data or "holdings" not in data:
            return jsonify({"error": "Missing holdings data"}), 400

        holdings = data["holdings"]
        if not isinstance(holdings, list):
            return jsonify({"error": "Holdings must be a list"}), 400

        # 触发预热
        result = prefetch_dashboard_data(holdings)
        return jsonify(result)

    except Exception as e:
        logger.error(f"Cache warmup error: {e}")
        return jsonify({"error": str(e)}), 500


@dashboard_bp.route("/api/dashboard/overview-fast", methods=["POST"])
def dashboard_overview_fast():
    """快速获取仪表盘概览（优化版）
    ---
    tags:
      - 仪表盘
    summary: 快速仪表盘概览
    description: 优化版仪表盘概览，优先读缓存，缓存命中时性能极佳（<1ms）
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/HoldingsRequest'
    responses:
      200:
        description: 仪表盘概览数据
      400:
        description: 缺少持仓数据
        schema:
          $ref: '#/definitions/Error'
      500:
        description: 服务异常
        schema:
          $ref: '#/definitions/Error'
    """
    try:
        data = request.get_json()
        if not data or "holdings" not in data:
            return jsonify({"error": "Missing holdings data"}), 400

        holdings = data["holdings"]
        if not isinstance(holdings, list):
            return jsonify({"error": "Holdings must be a list"}), 400

        # 使用快速获取（优先缓存）
        result = get_dashboard_data_fast(holdings)
        return jsonify(result)

    except Exception as e:
        logger.error(f"Fast dashboard overview error: {e}")
        return jsonify({"error": str(e)}), 500
