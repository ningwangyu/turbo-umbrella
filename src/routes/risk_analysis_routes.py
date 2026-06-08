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
    """资产配置分布详情
    ---
    tags:
      - 风险分析
    summary: 资产配置分布
    description: 按类型、风险等级、集中度分析资产配置分布，含MPT高级分析
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/HoldingsRequest'
    responses:
      200:
        description: 资产配置分析结果
      400:
        description: 缺少持仓数据
        schema:
          $ref: '#/definitions/Error'
      500:
        description: 分析失败
        schema:
          $ref: '#/definitions/Error'
    """
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
    """收益趋势预测
    ---
    tags:
      - 风险分析
    summary: 收益趋势预测
    description: 三模型集成的收益趋势预测，含置信带
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/HoldingsRequest'
    responses:
      200:
        description: 收益趋势预测结果
      400:
        description: 缺少持仓数据
        schema:
          $ref: '#/definitions/Error'
      500:
        description: 预测失败
        schema:
          $ref: '#/definitions/Error'
    """
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
    """6个月蒙特卡洛收益预测
    ---
    tags:
      - 风险分析
    summary: 蒙特卡洛预测
    description: 基于蒙特卡洛模拟的6个月收益预测
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/HoldingsRequest'
    responses:
      200:
        description: 蒙特卡洛预测结果
      400:
        description: 缺少持仓数据
        schema:
          $ref: '#/definitions/Error'
      500:
        description: 预测失败
        schema:
          $ref: '#/definitions/Error'
    """
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
    """信号健康评分卡
    ---
    tags:
      - 风险分析
    summary: 信号健康评分
    description: 各基金买卖信号的健康度评分卡
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/HoldingsRequest'
    responses:
      200:
        description: 信号评分卡结果
      400:
        description: 缺少持仓数据
        schema:
          $ref: '#/definitions/Error'
      500:
        description: 评分失败
        schema:
          $ref: '#/definitions/Error'
    """
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
    """再平衡建议
    ---
    tags:
      - 风险分析
    summary: 再平衡建议
    description: 现金利用率、集中度、风险分布、操作建议等再平衡分析
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/HoldingsRequest'
    responses:
      200:
        description: 再平衡建议结果
      400:
        description: 缺少持仓数据
        schema:
          $ref: '#/definitions/Error'
      500:
        description: 分析失败
        schema:
          $ref: '#/definitions/Error'
    """
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
    """基准对比分析
    ---
    tags:
      - 风险分析
    summary: 基准对比分析
    description: 与沪深300基准对比，含alpha、beta、捕获率、跟踪误差等指标
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/HoldingsRequest'
    responses:
      200:
        description: 基准对比结果
      400:
        description: 缺少持仓数据
        schema:
          $ref: '#/definitions/Error'
      500:
        description: 对比失败
        schema:
          $ref: '#/definitions/Error'
    """
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
    """历史压力测试
    ---
    tags:
      - 风险分析
    summary: 历史压力测试
    description: 2015股灾/2018贸易战/2020新冠/2022熊市/2024调整等5个历史场景的压力测试
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/HoldingsRequest'
    responses:
      200:
        description: 压力测试结果
      400:
        description: 缺少持仓数据
        schema:
          $ref: '#/definitions/Error'
      500:
        description: 测试失败
        schema:
          $ref: '#/definitions/Error'
    """
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
    """滚动风险指标
    ---
    tags:
      - 风险分析
    summary: 滚动风险指标
    description: 计算30/60/90日的波动率、夏普比率、最大回撤等滚动风险指标
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/HoldingsRequest'
    responses:
      200:
        description: 滚动风险指标数据
      400:
        description: 缺少持仓数据
        schema:
          $ref: '#/definitions/Error'
      500:
        description: 计算失败
        schema:
          $ref: '#/definitions/Error'
    """
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
    """尾部风险分析
    ---
    tags:
      - 风险分析
    summary: 尾部风险分析
    description: VaR/CVaR、Ulcer Index、回撤区间、偏度峰度等尾部风险指标分析
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/HoldingsRequest'
    responses:
      200:
        description: 尾部风险分析结果
      400:
        description: 缺少持仓数据
        schema:
          $ref: '#/definitions/Error'
      500:
        description: 分析失败
        schema:
          $ref: '#/definitions/Error'
    """
    try:
        holdings, err = _validate_holdings()
        if err:
            return err
        result = get_tail_risk_analysis(holdings)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Tail risk analysis error: {e}")
        return jsonify({"error": str(e)}), 500
