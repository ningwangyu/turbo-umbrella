"""
组合统计API — 计算用户持仓的整体统计数据

核心计算逻辑：
- 总市值 = 每只基金的(持有金额 + 今日预估收益)之和
- 总成本 = 每只基金的(持有金额 - 持有收益)之和
- 今日收益 = 每只基金的(持有金额 × 今日估值涨跌幅%)之和
- 持仓权重 = 单只基金当前市值 / 总市值
"""

import statistics
from collections import defaultdict

from flask import Blueprint, jsonify, request

from services.fund_service import fetch_fund_estimation, fetch_fund_holdings, fetch_fund_performance

portfolio_bp = Blueprint("portfolio", __name__)


@portfolio_bp.route("/api/portfolio/stats", methods=["POST"])
def portfolio_stats():
    """
    计算持仓组合统计数据。

    对每只基金实时获取估值，计算：
    - 今日预估收益 = 持有金额 × 今日估值涨跌幅%
    - 当前总市值 = 持有金额 + 今日预估收益
    - 持仓权重 = 当前市值 / 组合总市值
    """
    data = request.get_json(force=True)
    holdings = data.get("holdings", [])
    if not holdings:
        return jsonify({"error": "无持仓数据"}), 400

    total_value = 0   # 组合总市值
    total_cost = 0    # 组合总成本
    total_today = 0   # 今日总收益
    total_profit = 0  # 累计总收益
    fund_details = []

    for h in holdings:
        code = str(h.get("code", "")).strip()
        value = float(h.get("value", 0))    # 持有金额（市值）
        profit = float(h.get("profit", 0))  # 累计收益
        est = fetch_fund_estimation(code)
        pct = float(est.get("estimated_change_pct", 0)) if est else 0  # 今日涨跌幅%
        today = value * pct / 100      # 今日预估收益 = 持有金额 × 涨跌幅
        cost = value - profit           # 买入成本 = 持有金额 - 已有收益
        current_total = value + today   # 当前市值 = 原市值 + 今日收益
        current_profit = profit + today # 当前累计收益 = 原收益 + 今日收益

        total_value += current_total
        total_cost += cost
        total_today += today
        total_profit += current_profit

        fund_details.append({
            "code": code,
            "name": est.get("name", code) if est else code,
            "value": round(value, 2),
            "cost": round(cost, 2),
            "current_value": round(current_total, 2),
            "profit": round(current_profit, 2),
            "profit_pct": round((current_profit / cost * 100) if cost > 0 else 0, 2),
            "today": round(today, 2),
            "today_pct": round(pct, 2),
            "weight": 0,  # 稍后计算
        })

    # 计算每只基金的持仓权重占比
    if total_value > 0:
        for f in fund_details:
            f["weight"] = round(f["current_value"] / total_value * 100, 2)

    return jsonify({
        "total_value": round(total_value, 2),       # 组合总市值
        "total_cost": round(total_cost, 2),          # 组合总成本
        "total_profit": round(total_profit, 2),      # 累计总收益
        "total_profit_pct": round((total_profit / total_cost * 100) if total_cost > 0 else 0, 2),  # 总收益率%
        "total_today": round(total_today, 2),        # 今日总收益
        "fund_count": len(holdings),
        "funds": fund_details,
    })


@portfolio_bp.route("/api/portfolio/analysis", methods=["POST"])
def portfolio_analysis():
    """
    组合深度分析 — 持仓分布、重叠持仓、行业集中度、风险指标。

    创新点：
    1. 重叠持仓分析：扫描所有基金的重仓股，找出重复暴露的股票
    2. 行业分布热力图：统计持仓中各行业的权重占比
    3. 组合风险指标：基于各基金净值走势计算组合层面的波动率、最大回撤、Sharpe
    """
    data = request.get_json(force=True)
    holdings = data.get("holdings", [])
    if not holdings:
        return jsonify({"error": "无持仓数据"}), 400

    # 计算各基金当前市值
    fund_values = {}
    total_value = 0
    for h in holdings:
        code = str(h.get("code", "")).strip()
        value = float(h.get("value", 0))
        profit = float(h.get("profit", 0))
        est = fetch_fund_estimation(code)
        pct = float(est.get("estimated_change_pct", 0)) if est else 0
        current = value + value * pct / 100
        fund_values[code] = {"value": current, "name": est.get("name", code) if est else code}
        total_value += current

    # --- 1. 持仓类型分布（饼图数据）---
    type_distribution = defaultdict(float)
    for code, info in fund_values.items():
        weight = info["value"] / total_value * 100 if total_value > 0 else 0
        # 通过基金名称简单分类
        name = info["name"]
        if any(k in name for k in ["债", "信用", "利率"]):
            type_distribution["债券型"] += weight
        elif any(k in name for k in ["货币", "现金"]):
            type_distribution["货币型"] += weight
        elif any(k in name for k in ["黄金", "白银", "贵金属", "商品"]):
            type_distribution["商品型"] += weight
        elif any(k in name for k in ["QDII", "美国", "纳斯达克", "标普", "全球", "海外"]):
            type_distribution["QDII"] += weight
        elif any(k in name for k in ["指数", "ETF", "LOF"]):
            type_distribution["指数型"] += weight
        else:
            type_distribution["混合/股票型"] += weight
    type_dist = [{"name": k, "value": round(v, 2)} for k, v in type_distribution.items()]

    # --- 2. 重叠持仓分析 ---
    # 统计每只重仓股在多少只基金中出现，以及合计暴露权重
    stock_overlap = defaultdict(lambda: {"count": 0, "total_pct": 0, "funds": []})
    for code, info in fund_values.items():
        holdings_data = fetch_fund_holdings(code)
        if not holdings_data or "holdings" not in holdings_data:
            continue
        fund_weight = info["value"] / total_value if total_value > 0 else 0
        for stock in holdings_data["holdings"]:
            stock_code = stock.get("code", "")
            stock_name = stock.get("name", "")
            stock_pct = stock.get("pct", 0) / 100  # 转为小数
            if stock_code:
                entry = stock_overlap[stock_code]
                entry["name"] = stock_name
                entry["count"] += 1
                entry["total_pct"] += stock_pct * fund_weight * 100  # 实际权重
                entry["funds"].append({"code": code, "name": info["name"], "pct": stock.get("pct", 0)})

    # 只保留出现2次以上或权重超5%的重叠股
    overlap_list = [
        {"code": k, "name": v["name"], "count": v["count"],
         "total_pct": round(v["total_pct"], 2), "funds": v["funds"]}
        for k, v in stock_overlap.items()
        if v["count"] >= 2 or v["total_pct"] >= 5
    ]
    overlap_list.sort(key=lambda x: x["total_pct"], reverse=True)

    # --- 3. 组合风险指标 ---
    risk_metrics = {"volatility": None, "max_drawdown": None, "sharpe": None}
    # 获取各基金净值走势并计算组合走势
    all_trends = {}
    for code, info in fund_values.items():
        perf = fetch_fund_performance(code)
        if perf and "trend" in perf:
            all_trends[code] = perf["trend"]

    if all_trends and total_value > 0:
        # 构建组合日收益率（按权重加权）
        # 找到所有基金共有的日期范围
        all_dates = set()
        for trend in all_trends.values():
            for t in trend[-250:]:  # 最近一年
                all_dates.add(t["date"])
        dates = sorted(all_dates)

        if len(dates) >= 30:
            # 计算每日组合收益率
            daily_returns = []
            for i in range(1, len(dates)):
                day_return = 0
                weight_sum = 0
                for code, trend in all_trends.items():
                    nav_map = {t["date"]: t["nav"] for t in trend}
                    if dates[i] in nav_map and dates[i-1] in nav_map:
                        prev = nav_map[dates[i-1]]
                        curr = nav_map[dates[i]]
                        if prev > 0:
                            ret = (curr - prev) / prev
                            w = fund_values[code]["value"] / total_value
                            day_return += ret * w
                            weight_sum += w
                if weight_sum > 0:
                    daily_returns.append(day_return)

            if len(daily_returns) >= 14:
                vol = statistics.stdev(daily_returns) if len(daily_returns) > 1 else 0
                ann_vol = vol * (252 ** 0.5) * 100

                # 最大回撤
                cum = [1]
                for r in daily_returns:
                    cum.append(cum[-1] * (1 + r))
                peak = cum[0]
                max_dd = 0
                for v in cum:
                    if v > peak:
                        peak = v
                    dd = (v - peak) / peak * 100
                    if dd < max_dd:
                        max_dd = dd

                # Sharpe
                mean_ret = sum(daily_returns) / len(daily_returns)
                sharpe = (mean_ret / vol) * (252 ** 0.5) if vol > 0 else 0

                risk_metrics = {
                    "volatility": round(ann_vol, 2),
                    "max_drawdown": round(max_dd, 2),
                    "sharpe": round(sharpe, 2),
                    "days": len(daily_returns),
                }

    return jsonify({
        "total_value": round(total_value, 2),
        "type_distribution": type_dist,
        "stock_overlap": overlap_list[:20],
        "risk_metrics": risk_metrics,
    })
