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
from services.sector_service import (
    calculate_sector_distribution,
    assess_sector_concentration,
    calculate_diversification_score,
)

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

    # --- 1. 资产大类分布（只用大分类，不和板块重复）---
    type_map = defaultdict(lambda: {"weight": 0, "funds": []})
    for code, info in fund_values.items():
        weight = info["value"] / total_value * 100 if total_value > 0 else 0
        name = info["name"]
        # 资产大类分类（与板块分布完全不同的维度）
        if any(k in name for k in ["债", "信用", "利率", "固收", "纯债", "短债", "可转债"]):
            ftype = "债券型"
        elif any(k in name for k in ["货币", "现金"]):
            ftype = "货币型"
        elif any(k in name for k in ["黄金", "白银", "贵金属", "商品", "原油"]):
            ftype = "商品型"
        elif any(k in name for k in ["QDII", "美国", "纳斯达克", "标普", "全球", "海外", "恒生", "中概"]):
            ftype = "QDII/海外"
        else:
            ftype = "权益型"
        entry = type_map[ftype]
        entry["weight"] += weight
        entry["funds"].append({"code": code, "name": name, "weight": round(weight, 2)})
    type_dist = []
    for k, v in type_map.items():
        v["funds"].sort(key=lambda f: f["weight"], reverse=True)
        type_dist.append({"name": k, "value": round(v["weight"], 2), "funds": v["funds"]})
    type_dist.sort(key=lambda x: x["value"], reverse=True)

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

    # --- 3. 组合风险指标（近1年）+ 每只基金的1年最大回撤 ---
    risk_metrics = {"volatility": None, "max_drawdown": None, "sharpe": None, "days": 0}
    fund_drawdowns = []
    all_trends = {}

    for code, info in fund_values.items():
        perf = fetch_fund_performance(code)
        if perf and "trend" in perf:
            all_trends[code] = perf["trend"]
            trend_1y = perf["trend"][-250:]  # 最近约1年（250个交易日）
            if len(trend_1y) >= 30:
                navs = [t["nav"] for t in trend_1y if t.get("nav")]
                if navs:
                    peak_nav = navs[0]
                    fund_max_dd = 0
                    for nv in navs:
                        if nv > peak_nav:
                            peak_nav = nv
                        dd = (nv - peak_nav) / peak_nav * 100
                        if dd < fund_max_dd:
                            fund_max_dd = dd
                    weight = info["value"] / total_value if total_value > 0 else 0
                    fund_drawdowns.append({
                        "code": code,
                        "name": info["name"],
                        "max_drawdown": round(fund_max_dd, 2),
                        "weight": round(weight * 100, 2),
                    })
    fund_drawdowns.sort(key=lambda x: x["max_drawdown"])

    portfolio_nav_trend = []
    drawdown_detail = None

    if all_trends and total_value > 0:
        # 构建组合日收益率（按权重加权），最近1年
        all_dates = set()
        for trend in all_trends.values():
            for t in trend[-250:]:  # 最近1年
                all_dates.add(t["date"])
        dates = sorted(all_dates)

        if len(dates) >= 30:
            # 逐日记录组合净值和各基金净值，用于后续回撤过程分析
            daily_returns = []
            daily_fund_rets = []  # [{code: ret}, ...]
            valid_dates = [dates[0]]  # 第一天作为基准

            for i in range(1, len(dates)):
                day_return = 0
                weight_sum = 0
                fund_day_ret = {}
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
                            fund_day_ret[code] = ret
                if weight_sum > 0:
                    daily_returns.append(day_return)
                    daily_fund_rets.append(fund_day_ret)
                    valid_dates.append(dates[i])

            if len(daily_returns) >= 14:
                vol = statistics.stdev(daily_returns) if len(daily_returns) > 1 else 0
                ann_vol = vol * (252 ** 0.5) * 100

                # 构建组合净值曲线
                cum = [1]
                for r in daily_returns:
                    cum.append(cum[-1] * (1 + r))

                # 记录组合净值走势（用于前端画图）
                for idx, nav_val in enumerate(cum):
                    portfolio_nav_trend.append({
                        "date": valid_dates[idx],
                        "nav": round(nav_val, 6),
                    })

                # 最大回撤 + 过程追踪
                peak = cum[0]
                max_dd = 0
                peak_idx = 0
                trough_idx = 0
                cur_peak_idx = 0
                for ci, v in enumerate(cum):
                    if v > peak:
                        peak = v
                        cur_peak_idx = ci
                    dd = (v - peak) / peak * 100
                    if dd < max_dd:
                        max_dd = dd
                        peak_idx = cur_peak_idx
                        trough_idx = ci

                # 回撤过程明细：各基金在回撤期间（peak→trough）的日收益率和累计贡献
                fund_contributions = []
                for code, info in fund_values.items():
                    w = info["value"] / total_value
                    # 回撤期间该基金的累计涨跌幅
                    peak_date = valid_dates[peak_idx]
                    trough_date = valid_dates[trough_idx]
                    nav_map = {t["date"]: t["nav"] for t in all_trends.get(code, [])}
                    # 找到peak和trough最近的有效净值
                    fund_peak_nav = nav_map.get(peak_date)
                    fund_trough_nav = nav_map.get(trough_date)
                    # 如果精确日期没有数据，找最近的日期
                    if fund_peak_nav is None:
                        nearby = [t["nav"] for t in all_trends.get(code, [])
                                  if t["date"] <= peak_date and t.get("nav")]
                        fund_peak_nav = nearby[-1] if nearby else None
                    if fund_trough_nav is None:
                        nearby = [t["nav"] for t in all_trends.get(code, [])
                                  if t["date"] <= trough_date and t.get("nav")]
                        fund_trough_nav = nearby[-1] if nearby else None
                    fund_dd = 0
                    if fund_peak_nav and fund_trough_nav and fund_peak_nav > 0:
                        fund_dd = round((fund_trough_nav - fund_peak_nav) / fund_peak_nav * 100, 2)
                    fund_contributions.append({
                        "code": code,
                        "name": info["name"],
                        "weight": round(w * 100, 2),
                        "drawdown": fund_dd,
                        "weighted_contribution": round(fund_dd * w, 2),
                    })
                fund_contributions.sort(key=lambda x: x["weighted_contribution"])

                drawdown_detail = {
                    "portfolio_drawdown": round(max_dd, 2),
                    "peak_date": valid_dates[peak_idx],
                    "trough_date": valid_dates[trough_idx],
                    "peak_nav": round(cum[peak_idx], 6),
                    "trough_nav": round(cum[trough_idx], 6),
                    "fund_contributions": fund_contributions,
                }

                # Sharpe（无风险利率按年化2%计算）
                mean_ret = sum(daily_returns) / len(daily_returns)
                rf_daily = 0.02 / 252
                sharpe = ((mean_ret - rf_daily) / vol) * (252 ** 0.5) if vol > 0 else 0

                risk_metrics = {
                    "volatility": round(ann_vol, 2),
                    "max_drawdown": round(max_dd, 2),
                    "sharpe": round(sharpe, 2),
                    "days": len(daily_returns),
                }

    # --- 4. 板块分布分析 ---
    fund_holdings_map = {}
    for code, info in fund_values.items():
        holdings_data = fetch_fund_holdings(code)
        if holdings_data:
            fund_holdings_map[code] = holdings_data

    sector_distribution = calculate_sector_distribution(
        fund_holdings_map, fund_values, total_value
    )
    sector_concentration = assess_sector_concentration(sector_distribution)
    diversification = calculate_diversification_score(sector_distribution)

    return jsonify({
        "total_value": round(total_value, 2),
        "type_distribution": type_dist,
        "stock_overlap": overlap_list[:20],
        "risk_metrics": risk_metrics,
        "fund_drawdowns": fund_drawdowns,
        "drawdown_detail": drawdown_detail,
        "portfolio_nav_trend": portfolio_nav_trend,
        "sector_distribution": sector_distribution,
        "sector_concentration": sector_concentration,
        "diversification": diversification,
    })
