"""
风险分析模块路由 — Blueprint定义

功能说明：
- POST /api/risk/allocation: 资产配置分布详情（MPT高级分析）
- POST /api/risk/return-trend: 收益趋势预测（三模型集成）
- POST /api/risk/forecast: 6个月蒙特卡洛预测
- POST /api/risk/signal-scorecard: 信号健康评分卡
- POST /api/risk/rebalancing: 再平衡建议
- POST /api/risk/benchmark: 基准对比分析（vs 沪深300）
- POST /api/risk/stress-test: 历史压力测试
- POST /api/risk/rolling-metrics: 滚动风险指标
- POST /api/risk/tail-risk: 尾部风险分析
"""

import logging
from flask import Blueprint, request, jsonify

from services.risk_analysis_service import (
    get_asset_allocation_detail,
    get_return_trend_prediction,
    get_six_month_forecast,
    get_signal_health_scorecard,
    get_cash_rebalancing_advisor,
    get_benchmark_comparison,
    get_stress_test,
    get_rolling_metrics,
    get_tail_risk_analysis,
)

logger = logging.getLogger(__name__)

risk_analysis_bp = Blueprint("risk_analysis", __name__)


def _validate_holdings():
    """验证请求体中的持仓数据"""
    data = request.get_json()
    if not data or "holdings" not in data:
        return None, (jsonify({"error": "Missing holdings data"}), 400)
    holdings = data["holdings"]
    if not isinstance(holdings, list):
        return None, (jsonify({"error": "Holdings must be a list"}), 400)
    return holdings, None


# ============================================================
# 从仪表盘迁移的端点
# ============================================================

@risk_analysis_bp.route("/api/risk/allocation", methods=["POST"])
def allocation():
    """资产配置分布详情（按类型、风险等级、集中度 + MPT高级分析）"""
    try:
        holdings, err = _validate_holdings()
        if err:
            return err
        result = get_asset_allocation_detail(holdings)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Risk allocation error: {e}")
        return jsonify({"error": str(e)}), 500


@risk_analysis_bp.route("/api/risk/return-trend", methods=["POST"])
def return_trend():
    """收益趋势预测（三模型集成，含置信带）"""
    try:
        holdings, err = _validate_holdings()
        if err:
            return err
        result = get_return_trend_prediction(holdings)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Return trend prediction error: {e}")
        return jsonify({"error": str(e)}), 500


@risk_analysis_bp.route("/api/risk/forecast", methods=["POST"])
def forecast():
    """6个月蒙特卡洛收益预测"""
    try:
        holdings, err = _validate_holdings()
        if err:
            return err
        result = get_six_month_forecast(holdings)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Monte Carlo forecast error: {e}")
        return jsonify({"error": str(e)}), 500


@risk_analysis_bp.route("/api/risk/signal-scorecard", methods=["POST"])
def signal_scorecard():
    """信号健康评分卡"""
    try:
        holdings, err = _validate_holdings()
        if err:
            return err
        result = get_signal_health_scorecard(holdings)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Signal scorecard error: {e}")
        return jsonify({"error": str(e)}), 500


@risk_analysis_bp.route("/api/risk/rebalancing", methods=["POST"])
def rebalancing():
    """再平衡建议（现金利用率、集中度、风险分布、操作建议）"""
    try:
        holdings, err = _validate_holdings()
        if err:
            return err
        result = get_cash_rebalancing_advisor(holdings)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Rebalancing advisor error: {e}")
        return jsonify({"error": str(e)}), 500


# ============================================================
# 新增端点
# ============================================================

@risk_analysis_bp.route("/api/risk/benchmark", methods=["POST"])
def benchmark():
    """基准对比分析（vs 沪深300：alpha、beta、捕获率、跟踪误差）"""
    try:
        holdings, err = _validate_holdings()
        if err:
            return err
        result = get_benchmark_comparison(holdings)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Benchmark comparison error: {e}")
        return jsonify({"error": str(e)}), 500


@risk_analysis_bp.route("/api/risk/stress-test", methods=["POST"])
def stress_test():
    """历史压力测试（2015股灾/2018贸易战/2020新冠/2022熊市/2024调整）"""
    try:
        holdings, err = _validate_holdings()
        if err:
            return err
        result = get_stress_test(holdings)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Stress test error: {e}")
        return jsonify({"error": str(e)}), 500


@risk_analysis_bp.route("/api/risk/rolling-metrics", methods=["POST"])
def rolling_metrics():
    """滚动风险指标（30/60/90日波动率、夏普、最大回撤）"""
    try:
        holdings, err = _validate_holdings()
        if err:
            return err
        result = get_rolling_metrics(holdings)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Rolling metrics error: {e}")
        return jsonify({"error": str(e)}), 500


@risk_analysis_bp.route("/api/risk/tail-risk", methods=["POST"])
def tail_risk():
    """尾部风险分析（VaR/CVaR、Ulcer Index、回撤区间、偏度峰度）"""
    try:
        holdings, err = _validate_holdings()
        if err:
            return err
        result = get_tail_risk_analysis(holdings)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Tail risk analysis error: {e}")
        return jsonify({"error": str(e)}), 500
