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
    """
    聚合仪表盘数据（指数、情绪、持仓、信号）

    请求体:
        {
            "holdings": [
                {"code": "000001", "value": 10000, "profit": 500},
                {"code": "000002", "value": 20000, "profit": 1000}
            ]
        }

    返回:
        {
            "market": {"indices": {...}, "volume": {...}, "sentiment": {...}},
            "portfolio": {"total_value": ..., "total_cost": ..., ...},
            "signal_summary": {"portfolio_buy_score": ..., "healthy_count": ..., ...},
            "updated_at": "2026-05-20 14:30:00"
        }
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
    """
    持仓收益详情（每只基金的市值、权重、今日收益、累计收益）

    请求体:
        {
            "holdings": [
                {"code": "000001", "value": 10000, "profit": 500}
            ]
        }

    返回:
        {
            "total_value": 100000,
            "total_cost": 95000,
            "total_profit": 5000,
            "total_profit_pct": 5.26,
            "today_return": 320.50,
            "fund_details": [
                {
                    "code": "000001",
                    "name": "基金名称",
                    "current_value": 20000,
                    "weight": 20.0,
                    "today": 64.10,
                    "today_pct": 0.32,
                    "profit": 1000,
                    "profit_pct": 5.26,
                    "nav": "1.2345"
                }
            ]
        }
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
    """健康检查端点（用于监控）"""
    return jsonify({
        "status": "ok",
        "module": "dashboard",
        "timestamp": "2026-05-20 14:30:00"
    })


@dashboard_bp.route("/api/dashboard/timeline", methods=["POST"])
def timeline():
    """
    智能事件时间线（检测持仓相关的重要市场事件）

    请求体:
        {
            "holdings": [
                {"code": "000001", "value": 10000, "profit": 500}
            ]
        }

    返回:
        {
            "events": [
                {
                    "type": "price_surge",
                    "date": "2026-05-19",
                    "title": "XXX基金单日大涨3.5%",
                    "description": "...",
                    "funds": [...],
                    "severity": "high",
                    "icon": "📈"
                }
            ],
            "event_count": 5,
            "summary": {
                "price_events": 2,
                "signal_events": 1,
                "sentiment_events": 0,
                "drift_events": 1,
                "milestone_events": 1
            },
            "updated_at": "2026-05-20 15:00:00"
        }
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
    """
    获取仪表盘数据预热状态

    返回:
        {
            "is_prefetching": false,
            "last_prefetch": "2026-05-20T15:30:00",
            "prefetch_count": 42,
            "recent_errors": []
        }
    """
    try:
        status = get_prefetch_status()
        return jsonify(status)
    except Exception as e:
        logger.error(f"Prefetch status error: {e}")
        return jsonify({"error": str(e)}), 500


@dashboard_bp.route("/api/dashboard/optimize", methods=["GET"])
def optimize_info():
    """
    获取API优化信息和建议

    返回:
        {
            "cache_stats": {"index": 3, "estimation": 5, "performance": 5},
            "suggestions": [
                {
                    "type": "prefetch",
                    "priority": "high",
                    "message": "基金估值缓存仅5条，建议增加启动预热"
                }
            ],
            "timestamp": "2026-05-20T15:30:00"
        }
    """
    try:
        info = optimize_api_calls()
        return jsonify(info)
    except Exception as e:
        logger.error(f"Optimize info error: {e}")
        return jsonify({"error": str(e)}), 500


@dashboard_bp.route("/api/dashboard/warmup", methods=["POST"])
def warmup_cache():
    """
    手动触发缓存预热 — 用于测试和调试

    请求体:
        {
            "holdings": [
                {"code": "000001", "value": 10000, "profit": 500}
            ]
        }

    返回:
        {
            "status": "ok",
            "timestamp": "2026-05-20T15:30:00",
            "fund_count": 1,
            "elapsed": 1.5,
            "failed_funds": []
        }
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
    """
    快速获取仪表盘概览（优化版）— 优先读缓存

    请求体:
        {
            "holdings": [
                {"code": "000001", "value": 10000, "profit": 500}
            ]
        }

    返回:
        同 /api/dashboard/overview，但性能更好（缓存命中时<1ms）
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
