"""
风险分析模块核心服务 — 基准对比、压力测试、滚动指标、尾部风险

新增功能（国际公认指标）：
- get_benchmark_comparison(): 基准对比（alpha/beta/捕获率/跟踪误差/信息比率）
- get_stress_test(): 历史压力测试（5大A股危机情景）
- get_rolling_metrics(): 滚动风险指标（30/60/90日波动率、夏普、最大回撤）
- get_tail_risk_analysis(): 尾部风险分析（VaR/CVaR/Ulcer Index/回撤区间）

从仪表盘模块迁移的功能：
- get_asset_allocation_detail(): 资产配置详情 + MPT高级分析
- get_return_trend_prediction(): 三模型集成收益趋势预测
- get_six_month_forecast(): 蒙特卡洛模拟6个月预测
- get_signal_health_scorecard(): 信号健康评分卡
- get_cash_rebalancing_advisor(): 再平衡建议
"""

import logging
import math
from datetime import datetime
from typing import List, Dict, Any

from config import RISK_ANALYSIS_TTL, DASHBOARD_FORECAST_TTL, SIGNAL_HISTORY_TTL
from cache import risk_analysis_cache, dashboard_forecast_cache, signal_history_cache
from services.fund_service import fetch_fund_estimation, fetch_fund_performance
from services.market_service import fetch_benchmark_history
from services.signal_store import get_signal_trend, record_signal
from quant.signals import calculate_signal

logger = logging.getLogger(__name__)


# ================================================================
# 工具函数
# ================================================================

def _get_portfolio_daily_returns(holdings: List[Dict[str, Any]]):
    """
    计算组合加权日收益率序列和总市值。
    返回 (daily_returns: list[float], total_value: float, dates: list)
    日收益率为小数形式（如 0.015 表示 +1.5%）
    """
    fund_data = []  # [{returns, weight, dates}]
    total_value = 0.0

    for holding in holdings:
        code = holding["code"]
        value = holding.get("value", 0)
        est = fetch_fund_estimation(code)
        if not est:
            continue

        estimated_change_pct = float(est.get("estimated_change_pct", "0"))
        current_value = value * (1 + estimated_change_pct / 100)
        total_value += current_value

        perf = fetch_fund_performance(code)
        if not perf or "trend" not in perf:
            fund_data.append({"returns": [], "weight": 0, "dates": [], "value": current_value})
            continue

        trend = perf["trend"]
        navs = []
        dates = []
        for t in trend:
            try:
                nav = float(t.get("nav", 0))
                if nav > 0:
                    navs.append(nav)
                    # 日期可能是时间戳或字符串
                    raw_date = t.get("date", "")
                    if isinstance(raw_date, (int, float)) and raw_date > 1e12:
                        dates.append(datetime.fromtimestamp(raw_date / 1000).strftime("%Y-%m-%d"))
                    elif isinstance(raw_date, (int, float)) and raw_date > 0:
                        dates.append(datetime.fromtimestamp(raw_date).strftime("%Y-%m-%d"))
                    else:
                        dates.append(str(raw_date))
            except (ValueError, TypeError):
                continue

        returns = []
        for i in range(1, len(navs)):
            if navs[i - 1] > 0:
                returns.append((navs[i] - navs[i - 1]) / navs[i - 1])

        fund_data.append({
            "returns": returns,
            "weight": 0,
            "dates": dates[1:] if len(dates) > 1 else [],
            "value": current_value,
        })

    if total_value == 0:
        return [], 0, []

    # 计算权重
    for fd in fund_data:
        fd["weight"] = fd["value"] / total_value

    # 对齐并加权
    valid = [fd for fd in fund_data if fd["returns"]]
    if not valid:
        return [], total_value, []

    # 使用最短序列长度
    min_len = min(len(fd["returns"]) for fd in valid)
    daily_returns = []
    for i in range(min_len):
        weighted_r = sum(fd["weight"] * fd["returns"][i] for fd in valid)
        daily_returns.append(weighted_r)

    # 使用最长的数据源日期
    dates = max(valid, key=lambda x: len(x["dates"]))["dates"][-min_len:] if valid else []

    return daily_returns, total_value, dates


def _mean(xs):
    """计算均值"""
    return sum(xs) / len(xs) if xs else 0.0


def _std(xs):
    """计算标准差（总体）"""
    if len(xs) < 2:
        return 0.0
    mu = _mean(xs)
    return math.sqrt(sum((x - mu) ** 2 for x in xs) / len(xs))


def _percentile(sorted_data, p):
    """从已排序列表中计算第p百分位数（线性插值法）"""
    n = len(sorted_data)
    if n == 0:
        return 0.0
    if n == 1:
        return sorted_data[0]
    k = (n - 1) * p / 100.0
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_data[int(k)]
    return sorted_data[f] * (c - k) + sorted_data[c] * (k - f)


# 风险等级分类阈值（基于年化波动率）
RISK_THRESHOLDS = {
    "低风险": 5.0,      # vol < 5%
    "中风险": 15.0,     # 5% <= vol < 15%
    "中高风险": 25.0,   # 15% <= vol < 25%
    "高风险": float('inf')  # vol >= 25%
}

# 资产类型关键词映射
ASSET_TYPE_KEYWORDS = {
    "债券型": ["债", "信用", "利率", "固收", "纯债", "短债", "可转债"],
    "货币型": ["货币", "现金"],
    "商品型": ["黄金", "白银", "贵金属", "商品", "原油"],
    "QDII/海外": ["QDII", "美国", "纳斯达克", "标普", "全球", "海外", "恒生", "中概"]
}


def classify_asset_type(fund_name: str) -> str:
    """根据基金名称关键词分类资产类型"""
    for asset_type, keywords in ASSET_TYPE_KEYWORDS.items():
        if any(kw in fund_name for kw in keywords):
            return asset_type
    return "权益型"


def classify_risk_level(volatility: float) -> str:
    """根据年化波动率分类风险等级"""
    for level, threshold in RISK_THRESHOLDS.items():
        if volatility < threshold:
            return level
    return "高风险"


def get_asset_allocation_detail(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    获取多维度资产配置详情（类型、风险等级、集中度）

    参数:
        holdings: 持仓列表

    返回:
        {
            "by_type": [{"name": "权益型", "value": 65.3, "funds": [...]}],
            "by_risk": [{"name": "低风险", "value": 20.0, "funds": [...]}],
            "concentration": {"hhi": 0.15, "top3_weight": 45.2, ...}
        }
    """
    result = {
        "by_type": [],
        "by_risk": [],
        "concentration": {}
    }

    if not holdings:
        return result

    # 获取每只基金的估值（用于计算权重和今日变化）
    fund_data = []
    total_value = 0.0

    for holding in holdings:
        code = holding["code"]
        est = fetch_fund_estimation(code)
        perf = fetch_fund_performance(code)

        # 使用持仓数据作为基础，估算数据作为补充
        base_value = holding.get("value", 0)

        if est:
            estimated_change_pct = float(est.get("estimated_change_pct", "0"))
            current_value = base_value * (1 + estimated_change_pct / 100)
            fund_name = est.get("name", holding.get("name", ""))
        else:
            # 估算失败时使用持仓原始值
            current_value = base_value
            fund_name = holding.get("name", f"基金{code}")

        if current_value <= 0:
            continue

        total_value += current_value

        # 获取历史波动率（用于风险分类）
        volatility = 15.0  # 默认中风险
        daily_returns = []
        navs = []
        if perf and "trend" in perf and len(perf["trend"]) >= 30:
            try:
                daily_returns = [float(t.get("return", 0)) for t in perf["trend"][-250:]]
                navs = [float(t.get("nav", 0)) for t in perf["trend"][-250:] if t.get("nav")]
                if len(daily_returns) >= 20:
                    mean_return = sum(daily_returns) / len(daily_returns)
                    variance = sum((r - mean_return) ** 2 for r in daily_returns) / len(daily_returns)
                    daily_vol = math.sqrt(variance)
                    volatility = daily_vol * math.sqrt(252) * 100  # 年化波动率(%)
            except Exception:
                pass

        fund_data.append({
            "code": code,
            "name": fund_name,
            "current_value": current_value,
            "volatility": volatility,
            "asset_type": classify_asset_type(fund_name),
            "risk_level": classify_risk_level(volatility),
            "daily_returns": daily_returns,
            "navs": navs,
        })

    if total_value == 0:
        return result

    # 计算权重
    for fund in fund_data:
        fund["weight"] = (fund["current_value"] / total_value) * 100

    # 按资产类型分组
    type_groups = {}
    for fund in fund_data:
        asset_type = fund["asset_type"]
        if asset_type not in type_groups:
            type_groups[asset_type] = {
                "name": asset_type,
                "value": 0.0,
                "funds": []
            }
        type_groups[asset_type]["value"] += fund["weight"]
        type_groups[asset_type]["funds"].append({
            "code": fund["code"],
            "name": fund["name"],
            "weight": round(fund["weight"], 2)
        })

    # 按权重降序排序
    result["by_type"] = sorted(type_groups.values(), key=lambda x: x["value"], reverse=True)
    for item in result["by_type"]:
        item["value"] = round(item["value"], 2)

    # 按风险等级分组
    risk_groups = {}
    for fund in fund_data:
        risk_level = fund["risk_level"]
        if risk_level not in risk_groups:
            risk_groups[risk_level] = {
                "name": risk_level,
                "value": 0.0,
                "funds": []
            }
        risk_groups[risk_level]["value"] += fund["weight"]
        risk_groups[risk_level]["funds"].append({
            "code": fund["code"],
            "name": fund["name"],
            "weight": round(fund["weight"], 2)
        })

    # 按风险等级排序（低->中->中高->高）
    risk_order = ["低风险", "中风险", "中高风险", "高风险"]
    result["by_risk"] = sorted(
        risk_groups.values(),
        key=lambda x: risk_order.index(x["name"]) if x["name"] in risk_order else 99
    )
    for item in result["by_risk"]:
        item["value"] = round(item["value"], 2)

    # 计算集中度指标
    weights = [f["weight"] / 100 for f in fund_data]
    hhi = sum(w ** 2 for w in weights)
    sorted_weights = sorted(weights, reverse=True)
    top3_weight = sum(sorted_weights[:3]) * 100
    max_single = sorted_weights[0] * 100 if sorted_weights else 0

    # 分散化评分：HHI < 0.15 -> 80分, 0.15-0.25 -> 60分, >0.25 -> 40分
    if hhi < 0.15:
        diversification_score = 80
    elif hhi < 0.25:
        diversification_score = 60
    else:
        diversification_score = 40

    result["concentration"] = {
        "hhi": round(hhi, 4),
        "effective_n": round(1 / hhi, 1) if hhi > 0 else 0,
        "top3_weight": round(top3_weight, 2),
        "max_single": round(max_single, 2),
        "diversification_score": diversification_score
    }

    # 计算高级组合分析指标（MPT标准）
    advanced = _compute_advanced_metrics(fund_data)
    result.update(advanced)

    return result


def _jacobi_eigenvalues(matrix: List[List[float]], max_iter: int = 100) -> List[float]:
    """
    Jacobi特征值分解 — 计算实对称矩阵的特征值（纯Python，无需numpy）。

    使用Givens旋转迭代消去非对角元素，适用于小矩阵(n<=10)。

    参数:
        matrix: n×n实对称矩阵（列表的列表）
        max_iter: 最大迭代次数

    返回:
        特征值列表（降序排列）
    """
    n = len(matrix)
    if n == 0:
        return []
    if n == 1:
        return [matrix[0][0]]

    # 深拷贝矩阵
    A = [row[:] for row in matrix]

    for _ in range(max_iter):
        # 找到最大的非对角元素
        max_val = 0.0
        p, q = 0, 1
        for i in range(n):
            for j in range(i + 1, n):
                if abs(A[i][j]) > max_val:
                    max_val = abs(A[i][j])
                    p, q = i, j

        if max_val < 1e-10:
            break

        # 计算Givens旋转参数
        if abs(A[p][p] - A[q][q]) < 1e-15:
            theta = math.pi / 4
        else:
            tau = (A[q][q] - A[p][p]) / (2 * A[p][q])
            t = 1.0 / (abs(tau) + math.sqrt(1 + tau * tau))
            if tau < 0:
                t = -t
            theta = math.atan(t)

        c = math.cos(theta)
        s = math.sin(theta)

        # 应用Givens旋转
        new_A = [row[:] for row in A]
        for i in range(n):
            if i != p and i != q:
                new_A[i][p] = c * A[i][p] + s * A[i][q]
                new_A[p][i] = new_A[i][p]
                new_A[i][q] = -s * A[i][p] + c * A[i][q]
                new_A[q][i] = new_A[i][q]

        new_A[p][p] = c * c * A[p][p] + 2 * s * c * A[p][q] + s * s * A[q][q]
        new_A[q][q] = s * s * A[p][p] - 2 * s * c * A[p][q] + c * c * A[q][q]
        new_A[p][q] = 0.0
        new_A[q][p] = 0.0

        A = new_A

    eigenvalues = [A[i][i] for i in range(n)]
    eigenvalues.sort(reverse=True)
    return eigenvalues


def _compute_advanced_metrics(fund_data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    计算高级组合分析指标（MPT国际标准）。

    基于Modern Portfolio Theory计算以下指标:
    1. 风险收益散点图数据 (Risk-Return Scatter)
    2. 边际风险贡献 (Marginal Contribution to Risk)
    3. 夏普比率 (Sharpe Ratio)
    4. 最大回撤 (Maximum Drawdown)
    5. 分散化比率 (Diversification Ratio)
    6. 有效独立赌注数 (Effective Number of Bets)
    7. 相关系数热力图 (Correlation Heatmap)

    参数:
        fund_data: 基金数据列表，每只包含 code, name, weight, volatility, daily_returns, navs

    返回:
        包含7个指标数据的字典
    """
    # 默认空返回值
    empty_result = {
        "risk_return": {"funds": [], "portfolio": {"volatility": 0, "return": 0}},
        "risk_contribution": {"funds": [], "portfolio_vol": 0},
        "sharpe_ratios": {"funds": []},
        "max_drawdowns": {"funds": []},
        "diversification_ratio": {"ratio": 1.0, "portfolio_vol": 0, "weighted_vol_sum": 0, "benefit_pct": 0},
        "effective_bets": {"enb": 0, "n_funds": 0, "eigenvalues": []},
        "correlation_heatmap": {"funds": [], "matrix": []},
    }

    # 筛选有充足数据的基金
    valid_funds = [f for f in fund_data if len(f.get("daily_returns", [])) >= 20]
    if not valid_funds:
        return empty_result

    n = len(valid_funds)
    weights = [f["weight"] / 100.0 for f in valid_funds]

    # ================================================================
    # Step 1: 计算每只基金的年化收益率和夏普比率
    # ================================================================
    rf_daily = 0.02 / 252  # 无风险日利率（年化2%）

    fund_metrics = []
    for f in valid_funds:
        returns = f["daily_returns"]
        # daily_returns 是百分比形式(如1.5表示1.5%)，转为小数
        returns_dec = [r / 100.0 for r in returns]
        mu_daily = sum(returns_dec) / len(returns_dec)
        sigma_daily = math.sqrt(sum((r - mu_daily) ** 2 for r in returns_dec) / len(returns_dec))

        ann_return = mu_daily * 252 * 100  # 年化收益率(%)
        ann_vol = sigma_daily * math.sqrt(252) * 100  # 年化波动率(%)
        sharpe = (mu_daily - rf_daily) / sigma_daily * math.sqrt(252) if sigma_daily > 1e-10 else 0

        # 计算索提诺比率（只惩罚下行风险）
        downside_returns = [min(r - rf_daily, 0) for r in returns_dec]
        downside_deviation = math.sqrt(sum(r ** 2 for r in downside_returns) / len(downside_returns))
        sortino = (mu_daily - rf_daily) / downside_deviation * math.sqrt(252) if downside_deviation > 1e-10 else 0

        fund_metrics.append({
            "code": f["code"],
            "name": f["name"],
            "ann_return": ann_return,
            "ann_vol": ann_vol,
            "sharpe": sharpe,
            "sortino": sortino,
            "daily_returns": returns_dec,
            "navs": f.get("navs", []),
        })

    # ================================================================
    # Step 2: 协方差矩阵和组合波动率
    # ================================================================
    # 对齐各基金的日收益率序列
    min_len = min(len(fm["daily_returns"]) for fm in fund_metrics)
    aligned_returns = [fm["daily_returns"][-min_len:] for fm in fund_metrics]
    means = [sum(ret) / len(ret) for ret in aligned_returns]

    # 计算协方差矩阵
    cov = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            cov_ij = sum(
                (aligned_returns[i][k] - means[i]) * (aligned_returns[j][k] - means[j])
                for k in range(min_len)
            ) / min_len
            cov[i][j] = cov_ij

    # 组合方差和波动率
    portfolio_var = sum(weights[i] * weights[j] * cov[i][j] for i in range(n) for j in range(n))
    portfolio_sigma_daily = math.sqrt(portfolio_var) if portfolio_var > 0 else 0
    portfolio_sigma_annual = portfolio_sigma_daily * math.sqrt(252) * 100  # 年化(%)

    # 组合加权收益率
    portfolio_return = sum(fm["ann_return"] * weights[i] for i, fm in enumerate(fund_metrics))

    # 计算组合级夏普比率
    portfolio_sharpe = (portfolio_return / 100 - 0.02) / (portfolio_sigma_annual / 100) if portfolio_sigma_annual > 0 else 0

    # 计算组合级索提诺比率
    portfolio_daily_returns = []
    for k in range(min_len):
        daily_r = sum(weights[i] * aligned_returns[i][k] for i in range(n))
        portfolio_daily_returns.append(daily_r)

    portfolio_mu_daily = sum(portfolio_daily_returns) / len(portfolio_daily_returns)
    portfolio_downside_returns = [min(r - rf_daily, 0) for r in portfolio_daily_returns]
    portfolio_downside_deviation = math.sqrt(sum(r ** 2 for r in portfolio_downside_returns) / len(portfolio_downside_returns))
    portfolio_sortino = (portfolio_mu_daily - rf_daily) / portfolio_downside_deviation * math.sqrt(252) if portfolio_downside_deviation > 1e-10 else 0

    # 计算组合级最大回撤
    cumulative_returns = [1.0]
    for r in portfolio_daily_returns:
        cumulative_returns.append(cumulative_returns[-1] * (1 + r))
    peak = max(cumulative_returns)
    # 找到peak之后的最小值
    peak_idx = cumulative_returns.index(peak)
    trough = min(cumulative_returns[peak_idx:])
    portfolio_max_dd = (trough - peak) / peak * 100 if peak > 0 else 0

    # 计算VaR和CVaR（95%置信水平）
    sorted_returns = sorted(portfolio_daily_returns)
    var_95_idx = int(len(sorted_returns) * 0.05)
    var_95 = sorted_returns[var_95_idx] * 100 if var_95_idx < len(sorted_returns) else 0
    tail_returns = [r for r in sorted_returns if r <= sorted_returns[var_95_idx]]
    cvar_95 = (sum(tail_returns) / len(tail_returns)) * 100 if tail_returns else 0

    # ================================================================
    # Step 3: 风险贡献 (Risk Contribution)
    # ================================================================
    risk_contribution_funds = []
    if portfolio_sigma_daily > 1e-10:
        for i in range(n):
            # 边际风险贡献: MCR_i = (Σw)_i / σ_p
            sigma_wi = sum(cov[i][j] * weights[j] for j in range(n))
            mcr_i = sigma_wi / portfolio_sigma_daily
            rc_i = weights[i] * mcr_i * math.sqrt(252) * 100  # 年化风险贡献(%)
            rc_pct = rc_i / portfolio_sigma_annual * 100 if portfolio_sigma_annual > 0 else 0

            risk_contribution_funds.append({
                "code": valid_funds[i]["code"],
                "name": valid_funds[i]["name"],
                "weight_pct": round(weights[i] * 100, 2),
                "rc_pct": round(rc_pct, 2),
                "rc_ann": round(rc_i, 2),
            })

    # ================================================================
    # Step 4: 最大回撤 (Maximum Drawdown)
    # ================================================================
    max_dd_funds = []
    for fm in fund_metrics:
        navs = fm["navs"]
        if len(navs) >= 10:
            peak = navs[0]
            max_dd = 0.0
            for nv in navs:
                if nv > peak:
                    peak = nv
                dd = (nv - peak) / peak * 100 if peak > 0 else 0
                if dd < max_dd:
                    max_dd = dd
            max_dd_funds.append({
                "code": fm["code"],
                "name": fm["name"],
                "max_drawdown": round(max_dd, 2),
            })
        else:
            max_dd_funds.append({
                "code": fm["code"],
                "name": fm["name"],
                "max_drawdown": 0,
            })

    # ================================================================
    # Step 5: 分散化比率 (Diversification Ratio)
    # ================================================================
    weighted_vol_sum = sum(weights[i] * fund_metrics[i]["ann_vol"] for i in range(n))
    div_ratio = portfolio_sigma_annual / weighted_vol_sum if weighted_vol_sum > 0 else 1.0
    benefit_pct = (1 - div_ratio) * 100

    # ================================================================
    # Step 6: 相关系数矩阵
    # ================================================================
    std_devs = [math.sqrt(cov[i][i]) for i in range(n)]
    corr_matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if std_devs[i] * std_devs[j] > 1e-15:
                corr_matrix[i][j] = cov[i][j] / (std_devs[i] * std_devs[j])
            else:
                corr_matrix[i][j] = 0.0 if i != j else 1.0
        corr_matrix[i][i] = 1.0  # 对角线强制为1

    # ================================================================
    # Step 7: 有效独立赌注数 (ENB)
    # ================================================================
    enb = 1.0
    eigenvalues = []
    if n >= 2:
        try:
            eigenvalues = _jacobi_eigenvalues(corr_matrix)
            total_ev = sum(ev for ev in eigenvalues if ev > 0)
            if total_ev > 0:
                p_k = [ev / total_ev for ev in eigenvalues if ev > 0]
                H = -sum(pk * math.log(pk) for pk in p_k if pk > 0)
                enb = math.exp(H) if H > 0 else 1.0
        except Exception:
            # 特征值分解失败，回退到1/HHI
            hhi_corr = sum(corr_matrix[i][j] ** 2 for i in range(n) for j in range(n)) / (n * n)
            enb = 1.0 / hhi_corr if hhi_corr > 0 else 1.0

    # 截取热力图最多显示10只基金（按权重排序）
    heatmap_n = min(n, 10)
    sorted_indices = sorted(range(n), key=lambda i: weights[i], reverse=True)[:heatmap_n]
    heatmap_fund_names = [valid_funds[i]["name"][:6] for i in sorted_indices]
    heatmap_matrix = [[round(corr_matrix[i][j], 4) for j in sorted_indices] for i in sorted_indices]

    return {
        "risk_return": {
            "funds": [{
                "code": fm["code"],
                "name": fm["name"],
                "volatility": round(fm["ann_vol"], 2),
                "return": round(fm["ann_return"], 2),
                "weight": round(weights[i] * 100, 2),
            } for i, fm in enumerate(fund_metrics)],
            "portfolio": {
                "volatility": round(portfolio_sigma_annual, 2),
                "return": round(portfolio_return, 2),
            }
        },
        "risk_contribution": {
            "funds": risk_contribution_funds,
            "portfolio_vol": round(portfolio_sigma_annual, 2),
        },
        "sharpe_ratios": {
            "funds": [{
                "code": fm["code"],
                "name": fm["name"],
                "sharpe": round(fm["sharpe"], 3),
                "sortino": round(fm["sortino"], 3),
            } for fm in fund_metrics]
        },
        "max_drawdowns": {
            "funds": max_dd_funds
        },
        "diversification_ratio": {
            "ratio": round(div_ratio, 4),
            "portfolio_vol": round(portfolio_sigma_annual, 2),
            "weighted_vol_sum": round(weighted_vol_sum, 2),
            "benefit_pct": round(benefit_pct, 2),
        },
        "effective_bets": {
            "enb": round(enb, 2),
            "n_funds": n,
            "eigenvalues": [round(ev, 4) for ev in eigenvalues],
        },
        "correlation_heatmap": {
            "funds": heatmap_fund_names,
            "matrix": heatmap_matrix,
        },
        "portfolio_summary": {
            "volatility": round(portfolio_sigma_annual, 2),
            "return": round(portfolio_return, 2),
            "sharpe": round(portfolio_sharpe, 3),
            "sortino": round(portfolio_sortino, 3),
            "max_drawdown": round(portfolio_max_dd, 2),
            "var_95": round(var_95, 2),
            "cvar_95": round(cvar_95, 2),
            "beta": None,  # 待实现：需要基准指数数据接口
            "information_ratio": None,  # 待实现：需要基准指数数据接口
        },
    }


def get_return_trend_prediction(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    三模型集成收益趋势预测（信号加权 + 波动率锥 + 均值回归）

    算法设计：
    - 模型A（权重40%）：信号加权趋势 — 组合买入评分映射为年化alpha，预测未来方向
    - 模型B（权重35%）：历史波动率锥 — 基于几何布朗运动(GBM)的统计预测区间
    - 模型C（权重25%）：均值回归评分 — 基于信号引擎的历史分位因子，捕捉估值偏离后的回归预期

    三模型各自产出预期年化收益率与年化波动率，按权重加权合成后
    投射到30/90/180天的乐观/基准/悲观三条路径。

    参数:
        holdings: 持仓列表，每项需包含 {"code": "000001", "value": 10000, "profit": 500}

    返回:
        {
            "predictions": {
                "30d": {"optimistic": 2.1, "baseline": 1.5, "pessimistic": 0.8, "volatility": 5.2},
                "90d": {...},
                "180d": {...}
            },
            "model_weights": {"signal": 0.40, "volatility": 0.35, "mean_reversion": 0.25},
            "model_details": {...},
            "portfolio_buy_score": 62,
            "current_annual_return": 12.5,
            "disclaimer": "..."
        }
    """
    # 检查缓存（计算密集型操作，TTL=300秒）
    cache_key = f"return_trend_prediction_{len(holdings)}"
    cached = dashboard_forecast_cache.get(cache_key, DASHBOARD_FORECAST_TTL)
    if cached:
        return cached

    result = {
        "predictions": {
            "30d": {"optimistic": 0, "baseline": 0, "pessimistic": 0, "volatility": 0},
            "90d": {"optimistic": 0, "baseline": 0, "pessimistic": 0, "volatility": 0},
            "180d": {"optimistic": 0, "baseline": 0, "pessimistic": 0, "volatility": 0}
        },
        "model_weights": {"signal": 0.40, "volatility": 0.35, "mean_reversion": 0.25},
        "model_details": {},
        "portfolio_buy_score": 50,
        "current_annual_return": 0,
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "disclaimer": "基于历史数据和量化信号的集成预测，仅供参考，不构成投资建议"
    }

    if not holdings:
        return result

    # ============================================================
    # 第一阶段：并行采集每只基金的信号与历史数据
    # ============================================================
    fund_data = {}         # {code: {buy_score, percentile, vol, trend_len, ...}}
    total_value = 0.0
    fund_annual_returns = {}  # 各基金年化收益率，用于均值回归模型

    for holding in holdings:
        code = holding["code"]
        value = holding.get("value", 0)

        est = fetch_fund_estimation(code)
        if not est:
            continue

        current_value = value * (1 + float(est.get("estimated_change_pct", "0")) / 100)
        total_value += current_value

        # 获取业绩走势和信号
        perf = fetch_fund_performance(code)
        if not perf:
            fund_data[code] = {"value": current_value, "sufficient": False}
            continue

        signal = calculate_signal(perf, est)
        if not signal:
            fund_data[code] = {"value": current_value, "sufficient": False}
            continue

        trend = perf.get("trend", [])
        buy_score = signal.get("buy_score", 50)
        factors = signal.get("factors", [])

        # 数据充足性判断（至少250天历史数据）
        sufficient = len(trend) >= 250 and "return" in trend[0] if trend else False

        # 从信号因子中提取历史分位（Factor 5）
        percentile = 50.0
        for factor in factors:
            if factor.get("name") == "历史分位":
                try:
                    percentile = float(factor.get("value", "50").replace("%", ""))
                except (ValueError, AttributeError):
                    percentile = 50.0
                break

        # 从业绩数据中提取年化收益率
        annual_return = 0.0
        returns_data = perf.get("returns", {})
        if "1y" in returns_data:
            annual_return = returns_data["1y"]
        elif "6m" in returns_data:
            annual_return = returns_data["6m"] * 2
        elif trend and len(trend) >= 60:
            first_nav = trend[0]["nav"]
            last_nav = trend[-1]["nav"]
            if first_nav > 0:
                years = len(trend) / 252
                if years > 0:
                    annual_return = ((last_nav / first_nav) ** (1 / years) - 1) * 100

        fund_annual_returns[code] = annual_return

        fund_data[code] = {
            "value": current_value,
            "sufficient": sufficient,
            "buy_score": buy_score,
            "percentile": percentile,
            "annual_return": annual_return,
            "trend": trend,
            "trend_len": len(trend) if trend else 0
        }

    if total_value == 0 or not fund_data:
        return result

    # 计算各基金持仓权重（基于市值，归一化）
    for code, fd in fund_data.items():
        fd["weight"] = fd["value"] / total_value

    valid_funds = {c: d for c, d in fund_data.items() if d.get("sufficient")}

    # ============================================================
    # 模型A — 信号加权趋势（权重40%）
    # ============================================================
    # 计算组合加权买入评分
    portfolio_buy_score = sum(
        fd.get("buy_score", 50) * fd["weight"]
        for fd in fund_data.values()
    )

    # 信号映射为年化alpha：买入评分>50为正向alpha，<50为负向alpha
    # 最大8%年化alpha（买入评分=0或100时）
    signal_adjustment = (portfolio_buy_score - 50) / 50   # [-1, +1]
    annualized_alpha = signal_adjustment * 0.08            # [-0.08, +0.08]
    daily_alpha = annualized_alpha / 252

    # 计算信号模型的年化波动率（基于各基金历史波动率加权）
    model_a_annual_vol = 0.0
    if valid_funds:
        for code, fd in valid_funds.items():
            trend = fd["trend"]
            returns_decimal = [t["return"] / 100 for t in trend[-250:]]
            if len(returns_decimal) >= 20:
                mean_r = sum(returns_decimal) / len(returns_decimal)
                var_r = sum((r - mean_r) ** 2 for r in returns_decimal) / len(returns_decimal)
                daily_vol = math.sqrt(var_r)
                model_a_annual_vol += daily_vol * math.sqrt(252) * fd["weight"]
    else:
        model_a_annual_vol = 0.20  # 无数据时默认20%

    model_a = {
        "annualized_alpha": round(annualized_alpha * 100, 2),
        "signal_adjustment": round(signal_adjustment, 3),
        "annual_vol": round(model_a_annual_vol * 100, 1)
    }

    # ============================================================
    # 模型B — 历史波动率锥（权重35%）
    # ============================================================
    # 收集组合加权日收益率序列（按持仓市值加权）
    portfolio_daily_returns = []
    if valid_funds:
        # 使用有效基金中最长的趋势序列作为时间轴
        max_len = max(fd["trend_len"] for fd in valid_funds.values())
        for i in range(max_len):
            weighted_return = 0.0
            weight_sum = 0.0
            for code, fd in valid_funds.items():
                trend = fd["trend"]
                if i < len(trend):
                    weighted_return += trend[i]["return"] / 100 * fd["weight"]
                    weight_sum += fd["weight"]
            if weight_sum > 0:
                portfolio_daily_returns.append(weighted_return)

    # 计算多窗口滚动波动率（年化）
    rolling_vols = {}  # {window: [annualized_vol, ...]}
    for window in [20, 60, 120]:
        if len(portfolio_daily_returns) >= window:
            vols = []
            for i in range(window, len(portfolio_daily_returns) + 1):
                segment = portfolio_daily_returns[i - window:i]
                mean_r = sum(segment) / len(segment)
                var_r = sum((r - mean_r) ** 2 for r in segment) / len(segment)
                vols.append(math.sqrt(var_r) * math.sqrt(252))
            rolling_vols[window] = vols

    # 几何布朗运动(GBM)参数估计
    if len(portfolio_daily_returns) >= 60:
        mean_daily = sum(portfolio_daily_returns) / len(portfolio_daily_returns)
        var_daily = sum((r - mean_daily) ** 2 for r in portfolio_daily_returns) / len(portfolio_daily_returns)
        sigma = math.sqrt(var_daily)                            # 日波动率
        annual_sigma = sigma * math.sqrt(252)                   # 年化波动率
        mu_arithmetic = mean_daily * 252                        # 年化算术平均收益率
        # GBM连续复利漂移率 = 算术均值 - 0.5 * 方差（伊藤引理修正）
        mu_continuous = mu_arithmetic - 0.5 * annual_sigma ** 2
    elif portfolio_daily_returns:
        # 数据不足60天但有数据时，使用简化估计
        mean_daily = sum(portfolio_daily_returns) / len(portfolio_daily_returns)
        var_daily = sum((r - mean_daily) ** 2 for r in portfolio_daily_returns) / len(portfolio_daily_returns)
        sigma = math.sqrt(var_daily) if var_daily > 0 else 0.01
        annual_sigma = sigma * math.sqrt(252)
        mu_arithmetic = mean_daily * 252
        mu_continuous = mu_arithmetic - 0.5 * annual_sigma ** 2
    else:
        mu_continuous = 0.0
        annual_sigma = 0.20  # 默认20%年化波动率

    # GBM预测路径：exp((mu - 0.5*sigma^2) * T + z * sigma * sqrt(T))
    # 其中 z=0 为基准，z=+1.65 为乐观(95%置信)，z=-1.65 为悲观(5%置信)
    horizon_days = {"30d": 30, "90d": 90, "180d": 180}
    model_b_predictions = {}
    for label, d in horizon_days.items():
        T = d / 252  # 时间（年）
        sqrt_T = math.sqrt(T)

        median_factor = mu_continuous * T
        vol_factor = annual_sigma * sqrt_T

        model_b_predictions[label] = {
            "pessimistic": (mu_continuous - 1.65 * annual_sigma) * sqrt_T,
            "baseline": median_factor,
            "optimistic": (mu_continuous + 1.65 * annual_sigma) * sqrt_T,
            "annualized_vol": annual_sigma
        }

    # 波动率锥汇总统计
    vol_cone_summary = {}
    for window, vols in rolling_vols.items():
        if vols:
            vol_cone_summary[f"{window}d"] = {
                "current": round(vols[-1] * 100, 1),
                "mean": round(sum(vols) / len(vols) * 100, 1),
                "min": round(min(vols) * 100, 1),
                "max": round(max(vols) * 100, 1),
                "percentile": round(
                    sum(1 for v in vols if v <= vols[-1]) / len(vols) * 100, 0
                )
            }

    model_b = {
        "annual_vol": round(annual_sigma * 100, 1),
        "mu_continuous": round(mu_continuous * 100, 2),
        "vol_cone": vol_cone_summary,
        "data_points": len(portfolio_daily_returns),
        "predictions": model_b_predictions
    }

    # ============================================================
    # 模型C — 均值回归评分（权重25%）
    # ============================================================
    # 基于信号引擎的 Factor 5（历史分位）进行均值回归预测
    # percentile < 30% -> 净值偏低，预期回归向上
    # percentile > 70% -> 净值偏高，预期回归向下
    # 回归强度与偏离程度成正比，上限为年化收益的30%
    model_c_annual_mr = 0.0
    if fund_annual_returns:
        for code, fd in fund_data.items():
            if code not in fund_annual_returns:
                continue
            pct = fd.get("percentile", 50)
            weight = fd["weight"]
            ann_ret = fund_annual_returns.get(code, 0)

            if pct < 30:
                # 低于30%分位：预期向上回归，(50-pct)/50 * 0.3 * 年化收益
                adjustment = (50 - pct) / 50 * 0.3 * ann_ret
            elif pct > 70:
                # 高于70%分位：预期向下回归，(50-pct)/50 * 0.3 * 年化收益
                adjustment = (50 - pct) / 50 * 0.3 * ann_ret
            else:
                # 30%-70%之间：中性区域，无均值回归信号
                adjustment = 0

            model_c_annual_mr += adjustment * weight

    model_c = {
        "annualized_mr": round(model_c_annual_mr, 2),
        "description": "基于历史分位的均值回归预期"
    }

    # ============================================================
    # 第三阶段：三模型集成输出
    # ============================================================
    W_SIGNAL = 0.40
    W_VOLATILITY = 0.35
    W_MR = 0.25

    predictions = {}
    for label, d in horizon_days.items():
        T = d / 252
        sqrt_T = math.sqrt(T)

        # 模型A预测：信号alpha投射到预测期，波动率基于历史波动率
        model_a_pred = daily_alpha * d
        model_a_vol = model_a_annual_vol * sqrt_T

        # 模型B预测：GBM统计路径（已预计算）
        model_b_pred = model_b_predictions[label]["baseline"]
        model_b_vol = annual_sigma * sqrt_T

        # 模型C预测：均值回归投射到预测期
        model_c_pred = model_c_annual_mr * T
        model_c_vol = model_a_annual_vol * sqrt_T  # 均值回归波动率参考信号模型

        # 加权集成
        baseline = (W_SIGNAL * model_a_pred
                    + W_VOLATILITY * model_b_pred
                    + W_MR * model_c_pred)

        # 保守波动率估计（取三模型最大值），确保不低于0.5%
        combined_vol = max(model_a_vol, model_b_vol, model_c_vol)
        combined_vol = max(combined_vol, 0.005)

        # 乐观/悲观路径 = 基准 +/- 1.65倍标准差（约90%置信区间）
        optimistic = baseline + 1.65 * combined_vol
        pessimistic = baseline - 1.65 * combined_vol

        # 转换为百分比
        predictions[label] = {
            "optimistic": round((math.exp(optimistic) - 1) * 100, 2),
            "baseline": round((math.exp(baseline) - 1) * 100, 2),
            "pessimistic": round((math.exp(pessimistic) - 1) * 100, 2),
            "volatility": round(combined_vol * math.sqrt(252 / d) * 100, 1)
        }

    # ============================================================
    # 组装最终结果
    # ============================================================
    # 当前年化收益率（组合加权）
    current_annual_return = sum(
        fund_annual_returns.get(c, 0) * fd["weight"]
        for c, fd in fund_data.items()
        if c in fund_annual_returns
    )

    result = {
        "predictions": predictions,
        "model_weights": {
            "signal": W_SIGNAL,
            "volatility": W_VOLATILITY,
            "mean_reversion": W_MR
        },
        "model_details": {
            "signal": model_a,
            "volatility_cone": model_b,
            "mean_reversion": model_c
        },
        "portfolio_buy_score": round(portfolio_buy_score, 1),
        "current_annual_return": round(current_annual_return, 2),
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "disclaimer": "基于历史数据和量化信号的集成预测，仅供参考，不构成投资建议"
    }

    # 写入缓存（TTL=300秒）
    dashboard_forecast_cache.set(cache_key, result)

    logger.info(
        "Return trend prediction: score=%.1f, alpha=%.2f%%, 30d baseline=%.2f%%",
        portfolio_buy_score, annualized_alpha * 100,
        predictions["30d"]["baseline"]
    )
    return result


# 健康状态排序优先级（严重程度由高到低）
_STATUS_ORDER = {"alert": 0, "caution": 1, "neutral": 2, "healthy": 3}


def get_signal_health_scorecard(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    信号健康评分卡 — 展示每只基金的信号状态、趋势变化和五因子详情

    流程：
    1. 逐只基金获取当前信号（calculate_signal）和7天信号趋势（get_signal_trend）
    2. 记录当前信号到MySQL（record_signal）
    3. 组合级别加权评分和健康统计
    4. 按状态严重程度排序返回

    参数:
        holdings: 持仓列表，每项需包含 {"code": "000001", "value": 10000, ...}

    返回:
        {
            "portfolio_health": "neutral",       # 组合健康评级
            "portfolio_buy_score": 62.5,          # 加权平均买入评分
            "healthy_count": 2,                   # 强烈买入数量
            "neutral_count": 3,                   # 持有观望数量
            "caution_count": 1,                   # 谨慎数量
            "alert_count": 0,                     # 卖出信号数量
            "funds": [...],                       # 每只基金详情
            "updated_at": "2026-05-20 15:00:00"
        }
    """
    # 检查缓存（TTL=300秒）
    cache_key = f"signal_health_scorecard_{len(holdings)}"
    cached = signal_history_cache.get(cache_key, SIGNAL_HISTORY_TTL)
    if cached:
        return cached

    result = {
        "portfolio_health": "neutral",
        "portfolio_buy_score": 50.0,
        "healthy_count": 0,
        "neutral_count": 0,
        "caution_count": 0,
        "alert_count": 0,
        "funds": [],
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    if not holdings:
        return result

    # ============================================================
    # Step 1 — 获取每只基金的当前信号和历史信号
    # ============================================================
    funds_data = []  # 临时存储，后续排序
    total_value = 0.0

    # 计算持仓总市值（用于权重）
    for holding in holdings:
        value = holding.get("value", 0)
        est = fetch_fund_estimation(holding["code"])
        if est:
            estimated_change_pct = float(est.get("estimated_change_pct", "0"))
            current_value = value * (1 + estimated_change_pct / 100)
        else:
            current_value = value
        total_value += current_value

    for holding in holdings:
        code = holding["code"]
        value = holding.get("value", 0)

        # 获取当前信号（复用 calculate_signal）
        est = fetch_fund_estimation(code)
        perf = fetch_fund_performance(code)
        if not est or not perf:
            logger.warning("Missing data for fund %s, skipping in scorecard", code)
            continue

        current_signal = calculate_signal(perf, est)
        if not current_signal:
            continue

        buy_score = current_signal.get("buy_score", 50)
        signal_text = current_signal.get("signal", "")
        signal_en = current_signal.get("signal_en", "hold")
        factors = current_signal.get("factors", [])

        # 估算当前市值（含今日估算涨跌）
        estimated_change_pct = float(est.get("estimated_change_pct", "0"))
        current_value = value * (1 + estimated_change_pct / 100)

        # 获取7天信号趋势（从MySQL）
        signal_trend = get_signal_trend(code, days=7)
        trend = signal_trend.get("trend", "→")
        trend_change = signal_trend.get("change", 0)

        # 记录当前信号到MySQL（异步，不阻塞返回）
        try:
            record_signal(code, buy_score, signal_text, factors)
        except Exception as e:
            logger.warning("Failed to record signal for %s: %s", code, e)

        # 健康状态分类
        if buy_score >= 70:
            status = "healthy"    # 绿色，强烈买入
        elif buy_score >= 55:
            status = "neutral"    # 黄色，持有观望
        elif buy_score >= 40:
            status = "caution"    # 橙色，谨慎
        else:
            status = "alert"      # 红色，卖出信号

        # 格式化因子详情（取每个因子的 name/score/detail）
        factor_details = []
        for f in factors:
            factor_details.append({
                "name": f.get("name", ""),
                "score": f.get("score", 50),
                "detail": f.get("detail", "")
            })

        funds_data.append({
            "code": code,
            "name": est.get("name", holding.get("name", "")),
            "buy_score": buy_score,
            "signal": signal_text,
            "signal_en": signal_en,
            "status": status,
            "trend": trend,
            "trend_change": trend_change,
            "weight": 0.0,           # 稍后计算
            "current_value": current_value,
            "factors": factor_details
        })

    if not funds_data:
        return result

    # ============================================================
    # Step 2 — 计算组合级别健康状态
    # ============================================================
    healthy_count = 0
    neutral_count = 0
    caution_count = 0
    alert_count = 0
    weighted_score_sum = 0.0

    for fund in funds_data:
        # 计算权重（基于持仓市值）
        if total_value > 0:
            fund["weight"] = round(fund["current_value"] / total_value * 100, 2)

        # 累加加权分数
        weighted_score_sum += fund["buy_score"] * fund["weight"] / 100

        # 统计各状态数量
        status = fund["status"]
        if status == "healthy":
            healthy_count += 1
        elif status == "neutral":
            neutral_count += 1
        elif status == "caution":
            caution_count += 1
        elif status == "alert":
            alert_count += 1

    # 组合健康评级
    portfolio_buy_score = round(weighted_score_sum, 1)
    if portfolio_buy_score >= 70:
        portfolio_health = "healthy"
    elif portfolio_buy_score >= 55:
        portfolio_health = "neutral"
    elif portfolio_buy_score >= 40:
        portfolio_health = "caution"
    else:
        portfolio_health = "alert"

    # ============================================================
    # Step 3 — 按状态严重程度排序（alert > caution > neutral > healthy）
    # ============================================================
    funds_data.sort(key=lambda x: (_STATUS_ORDER.get(x["status"], 99), -x["buy_score"]))

    # 清理临时字段，只返回API需要的字段
    fund_list = []
    for fund in funds_data:
        fund_list.append({
            "code": fund["code"],
            "name": fund["name"],
            "buy_score": fund["buy_score"],
            "signal": fund["signal"],
            "signal_en": fund["signal_en"],
            "status": fund["status"],
            "trend": fund["trend"],
            "trend_change": fund["trend_change"],
            "weight": fund["weight"],
            "factors": fund["factors"]
        })

    # 组装最终结果
    result = {
        "portfolio_health": portfolio_health,
        "portfolio_buy_score": portfolio_buy_score,
        "healthy_count": healthy_count,
        "neutral_count": neutral_count,
        "caution_count": caution_count,
        "alert_count": alert_count,
        "funds": fund_list,
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    # 写入缓存（TTL=300秒）
    signal_history_cache.set(cache_key, result)

    logger.info(
        "Signal health scorecard: portfolio_score=%.1f, health=%s, "
        "healthy=%d, neutral=%d, caution=%d, alert=%d",
        portfolio_buy_score, portfolio_health,
        healthy_count, neutral_count, caution_count, alert_count
    )
    return result


def get_six_month_forecast(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    蒙特卡洛模拟6个月预测（1000条路径 × 126个交易日）

    算法流程：
    Step 1 - 参数估计：从历史数据提取每只基金的年化期望收益(mu)和波动率(sigma)，
             计算组合级别的加权mu和协方差矩阵得到的组合sigma
    Step 2 - 信号调整：基于当前组合买入评分调整期望收益（最大±4%年化）
    Step 3 - 蒙特卡洛模拟：1000条GBM路径，每条126天，提取1m/3m/6m分位数
    Step 4 - 置信度评分：基于预测带宽度和信号强度

    参数:
        holdings: 持仓列表，每项需包含 {"code": "000001", "value": 10000}

    返回:
        {
            "current_value": 100000,
            "forecasts": {
                "1m": {"median": 2.1, "p5": -5.3, "p25": -1.2, "p75": 5.4, "p95": 9.8},
                "3m": {"median": 3.5, "p5": -12.1, "p25": -3.4, "p75": 10.2, "p95": 18.5},
                "6m": {"median": 5.8, "p5": -18.2, "p25": -5.8, "p75": 17.3, "p95": 30.1}
            },
            "parameters": {
                "portfolio_mu": 8.5,
                "portfolio_sigma": 18.2,
                "signal_score": 62,
                "confidence": 58
            },
            "simulation_paths": 1000,
            "disclaimer": "..."
        }
    """
    # 检查缓存（计算密集型，TTL=300秒）
    cache_key = f"six_month_forecast_{len(holdings)}"
    cached = dashboard_forecast_cache.get(cache_key, DASHBOARD_FORECAST_TTL)
    if cached:
        return cached

    # 默认返回结构（数据不足时使用）
    default_result = {
        "current_value": 0.0,
        "forecasts": {
            "1m": {"median": 0, "p5": 0, "p25": 0, "p75": 0, "p95": 0},
            "3m": {"median": 0, "p5": 0, "p25": 0, "p75": 0, "p95": 0},
            "6m": {"median": 0, "p5": 0, "p25": 0, "p75": 0, "p95": 0}
        },
        "parameters": {
            "portfolio_mu": 0,
            "portfolio_sigma": 0,
            "signal_score": 50,
            "confidence": 0
        },
        "simulation_paths": 1000,
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "disclaimer": "基于历史数据和量化信号的蒙特卡洛模拟，仅供参考，不构成投资建议"
    }

    if not holdings:
        return default_result

    # ============================================================
    # Step 1 — 参数估计：采集历史数据，计算每只基金的 mu / sigma
    # ============================================================
    fund_params = []   # [{code, weight, mu, sigma, daily_returns, buy_score}, ...]
    total_value = 0.0
    portfolio_buy_score = 50.0  # 默认中性信号

    for holding in holdings:
        code = holding["code"]
        value = holding.get("value", 0)

        est = fetch_fund_estimation(code)
        if not est:
            continue

        current_value = value * (1 + float(est.get("estimated_change_pct", "0")) / 100)
        total_value += current_value

        perf = fetch_fund_performance(code)
        signal = calculate_signal(perf, est) if perf else None
        buy_score = signal.get("buy_score", 50) if signal else 50

        # 提取历史净值序列
        trend = perf.get("trend", []) if perf else []

        if len(trend) < 30:
            # 数据不足30天：使用保守默认参数
            fund_params.append({
                "code": code,
                "value": current_value,
                "weight": 0.0,
                "mu": 0.08,          # 默认年化收益8%
                "sigma": 0.20,       # 默认年化波动率20%
                "daily_returns": [],
                "buy_score": buy_score,
                "sufficient": False
            })
            continue

        # 提取日收益率序列（取最近250天）
        navs = [float(t.get("nav", 0)) for t in trend[-251:] if t.get("nav")]
        daily_returns = []
        for i in range(1, len(navs)):
            if navs[i - 1] > 0:
                daily_returns.append((navs[i] - navs[i - 1]) / navs[i - 1])

        if len(daily_returns) < 20:
            fund_params.append({
                "code": code,
                "value": current_value,
                "weight": 0.0,
                "mu": 0.08,
                "sigma": 0.20,
                "daily_returns": [],
                "buy_score": buy_score,
                "sufficient": False
            })
            continue

        # 年化期望收益和波动率
        mu_daily = sum(daily_returns) / len(daily_returns)
        var_daily = sum((r - mu_daily) ** 2 for r in daily_returns) / len(daily_returns)
        sigma_daily = math.sqrt(var_daily)

        mu_annual = mu_daily * 252                    # 年化期望收益
        sigma_annual = sigma_daily * math.sqrt(252)   # 年化波动率

        fund_params.append({
            "code": code,
            "value": current_value,
            "weight": 0.0,
            "mu": mu_annual,
            "sigma": sigma_annual,
            "daily_returns": daily_returns,
            "buy_score": buy_score,
            "sufficient": True
        })

    if total_value == 0:
        default_result["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return default_result

    # 计算权重
    for fp in fund_params:
        fp["weight"] = fp["value"] / total_value

    # ============================================================
    # 计算组合级别参数：加权 mu 和协方差矩阵 → 组合 sigma
    # ============================================================
    # 组合加权 mu
    portfolio_mu = sum(fp["mu"] * fp["weight"] for fp in fund_params)

    # 组合加权信号分数
    portfolio_buy_score = sum(fp["buy_score"] * fp["weight"] for fp in fund_params)

    # 计算协方差矩阵（仅对有充足数据的基金）
    sufficient_funds = [fp for fp in fund_params if fp["sufficient"] and fp["daily_returns"]]

    portfolio_sigma = 0.0
    if len(sufficient_funds) >= 2:
        # 多基金：计算协方差矩阵
        # 对齐各基金的日收益率序列（使用共同日期）
        min_len = min(len(fp["daily_returns"]) for fp in sufficient_funds)

        # 取各基金最近 min_len 天的日收益率
        aligned_returns = [fp["daily_returns"][-min_len:] for fp in sufficient_funds]
        n_funds = len(sufficient_funds)
        weights = [fp["weight"] for fp in sufficient_funds]

        # 计算均值
        means = [sum(ret) / len(ret) for ret in aligned_returns]

        # 计算协方差矩阵 cov[i][j]
        portfolio_var = 0.0
        for i in range(n_funds):
            for j in range(n_funds):
                cov_ij = sum(
                    (aligned_returns[i][k] - means[i]) * (aligned_returns[j][k] - means[j])
                    for k in range(min_len)
                ) / min_len
                portfolio_var += weights[i] * weights[j] * cov_ij

        portfolio_sigma = math.sqrt(portfolio_var) * math.sqrt(252) if portfolio_var > 0 else 0.20

    elif len(sufficient_funds) == 1:
        # 单基金：直接使用该基金的 sigma
        portfolio_sigma = sufficient_funds[0]["sigma"]

    else:
        # 无充足数据：加权默认 sigma（各基金默认20%）
        portfolio_sigma = sum(fp["sigma"] * fp["weight"] for fp in fund_params)
        if portfolio_sigma == 0:
            portfolio_sigma = 0.20

    # ============================================================
    # Step 2 — 信号调整期望收益
    # ============================================================
    signal_shift = (portfolio_buy_score - 50) / 50 * 0.04   # 最大±4%年化调整
    adjusted_mu = portfolio_mu + signal_shift

    # ============================================================
    # Step 3 — 蒙特卡洛模拟（1000条路径 × 126交易日）
    # ============================================================
    num_paths = 1000
    num_days = 126   # 6个月约126个交易日

    # 存储每条路径在关键节点的累计收益率
    # 只保存 day 21 (1m), day 63 (3m), day 126 (6m) 以节省内存
    snapshot_days = {21: "1m", 63: "3m", 126: "6m"}
    snapshot_returns = {21: [], 63: [], 126: []}

    # GBM日参数（含Ito修正）
    daily_drift = adjusted_mu / 252 - 0.5 * (portfolio_sigma / math.sqrt(252)) ** 2
    daily_diffusion = portfolio_sigma / math.sqrt(252)

    # 使用固定种子保证可复现
    random.seed(42)

    for _path in range(num_paths):
        cumulative_return = 0.0
        for day in range(1, num_days + 1):
            # Box-Muller 变换生成标准正态随机数
            u1 = random.random()
            u2 = random.random()
            # 防止 log(0)
            while u1 == 0.0:
                u1 = random.random()
            z = math.sqrt(-2.0 * math.log(u1)) * math.cos(2.0 * math.pi * u2)

            # GBM 日收益率（含Ito修正）
            daily_return = daily_drift + daily_diffusion * z

            # 累计收益：复利更新
            cumulative_return = (1.0 + cumulative_return) * (1.0 + daily_return) - 1.0

            # 记录快照
            if day in snapshot_returns:
                snapshot_returns[day].append(cumulative_return)

    # ============================================================
    # 提取分位数
    # ============================================================
    def _percentile_mc(sorted_data: list, p: float) -> float:
        """从已排序列表中计算第p百分位数（线性插值法）"""
        n = len(sorted_data)
        if n == 0:
            return 0.0
        if n == 1:
            return sorted_data[0]
        k = (n - 1) * p / 100.0
        f = math.floor(k)
        c = math.ceil(k)
        if f == c:
            return sorted_data[int(k)]
        return sorted_data[f] * (c - k) + sorted_data[c] * (k - f)

    forecasts = {}
    for day_num, label in snapshot_days.items():
        returns_list = snapshot_returns[day_num]
        sorted_returns = sorted(returns_list)

        forecasts[label] = {
            "median": round(_percentile_mc(sorted_returns, 50) * 100, 2),
            "p5":    round(_percentile_mc(sorted_returns, 5) * 100, 2),
            "p25":   round(_percentile_mc(sorted_returns, 25) * 100, 2),
            "p75":   round(_percentile_mc(sorted_returns, 75) * 100, 2),
            "p95":   round(_percentile_mc(sorted_returns, 95) * 100, 2)
        }

    # ============================================================
    # Step 4 — 置信度评分
    # ============================================================
    # 预测带宽度（6个月的 p95 - p5）
    band_width = forecasts["6m"]["p95"] - forecasts["6m"]["p5"]
    confidence = max(0, min(100, 100 - band_width * 2))

    # 信号强度置信度加成：信号越偏离中性，预测置信度越高
    signal_confidence_boost = abs(portfolio_buy_score - 50) / 50 * 15
    final_confidence = min(100, confidence + signal_confidence_boost)

    # ============================================================
    # 组装最终结果
    # ============================================================
    result = {
        "current_value": round(total_value, 2),
        "forecasts": forecasts,
        "parameters": {
            "portfolio_mu": round(portfolio_mu * 100, 2),
            "portfolio_sigma": round(portfolio_sigma * 100, 2),
            "adjusted_mu": round(adjusted_mu * 100, 2),
            "signal_shift": round(signal_shift * 100, 2),
            "signal_score": round(portfolio_buy_score, 1),
            "confidence": round(final_confidence, 1)
        },
        "simulation_paths": num_paths,
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "disclaimer": "基于历史数据和量化信号的蒙特卡洛模拟，仅供参考，不构成投资建议"
    }

    # 写入缓存（TTL=300秒）
    dashboard_forecast_cache.set(cache_key, result)

    logger.info(
        "Monte Carlo forecast: mu=%.2f%%, sigma=%.2f%%, signal=%.1f, "
        "6m median=%.2f%%, confidence=%.1f",
        portfolio_mu * 100, portfolio_sigma * 100, portfolio_buy_score,
        forecasts["6m"]["median"], final_confidence
    )
    return result


def get_cash_rebalancing_advisor(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    再平衡建议 — 现金利用率分析、集中度风险、操作建议

    算法流程：
    1. 获取每只基金的资产类型、风险等级、权重
    2. 计算集中度指标（HHI、有效基金数量、前3大权重）
    3. 分析现金利用率（货币型占比）
    4. 检查风险等级分布均衡性
    5. 生成具体再平衡建议（每条含原因、涉及基金、建议操作）

    参数:
        holdings: 持仓列表，每项需包含 {"code": "000001", "value": 10000}

    返回:
        {
            "cash_utilization": {"cash_weight": 15.0, "effective_weight": 85.0, ...},
            "concentration": {"hhi": 0.18, "effective_n": 5.6, ...},
            "risk_distribution": {"低风险": 20.0, "中风险": 50.0, ...},
            "suggestions": [
                {
                    "type": "concentration",  // concentration|cash|risk|rebalance
                    "title": "集中度过高",
                    "reason": "HHI指数为0.25，组合有效基金数仅4只",
                    "funds": [{"code": "...", "name": "...", "weight": 30.5}],
                    "action": "建议增加2-3只不相关基金以降低集中风险",
                    "priority": "high"  // high|medium|low
                }
            ],
            "overall_score": 72,  // 再平衡健康评分 0-100
            "updated_at": "..."
        }
    """
    result = {
        "cash_utilization": {},
        "concentration": {},
        "risk_distribution": {},
        "suggestions": [],
        "overall_score": 50,
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    if not holdings:
        return result

    # ============================================================
    # Step 1 — 获取基金数据并分类
    # ============================================================
    fund_data = []
    total_value = 0.0
    risk_weights = {}  # {风险等级: 总权重}
    type_weights = {}  # {资产类型: 总权重}

    for holding in holdings:
        code = holding["code"]
        value = holding.get("value", 0)

        est = fetch_fund_estimation(code)
        if not est:
            continue

        perf = fetch_fund_performance(code)
        estimated_change_pct = float(est.get("estimated_change_pct", "0"))
        current_value = value * (1 + estimated_change_pct / 100)
        total_value += current_value

        fund_name = est.get("name", holding.get("name", ""))
        asset_type = classify_asset_type(fund_name)

        # 计算波动率用于风险分类
        volatility = 15.0  # 默认中风险
        if perf and "trend" in perf and len(perf["trend"]) >= 30:
            try:
                returns = [float(t.get("return", 0)) for t in perf["trend"][-250:]]
                if len(returns) >= 20:
                    mean_return = sum(returns) / len(returns)
                    variance = sum((r - mean_return) ** 2 for r in returns) / len(returns)
                    daily_vol = math.sqrt(variance)
                    volatility = daily_vol * math.sqrt(252) * 100
            except Exception:
                pass

        risk_level = classify_risk_level(volatility)

        fund_data.append({
            "code": code,
            "name": fund_name,
            "current_value": current_value,
            "asset_type": asset_type,
            "risk_level": risk_level,
            "volatility": volatility
        })

    if total_value == 0:
        return result

    # 计算权重
    for fund in fund_data:
        fund["weight"] = fund["current_value"] / total_value * 100

    # ============================================================
    # Step 2 — 计算集中度指标
    # ============================================================
    weights = [f["weight"] / 100 for f in fund_data]
    hhi = sum(w ** 2 for w in weights)
    sorted_weights = sorted(weights, reverse=True)
    top3_weight = sum(sorted_weights[:3]) * 100
    max_single = sorted_weights[0] * 100 if sorted_weights else 0
    effective_n = 1 / hhi if hhi > 0 else 0

    # 分散化评分
    if hhi < 0.15:
        diversification_score = 80
    elif hhi < 0.25:
        diversification_score = 60
    else:
        diversification_score = 40

    result["concentration"] = {
        "hhi": round(hhi, 4),
        "effective_n": round(effective_n, 1),
        "top3_weight": round(top3_weight, 2),
        "max_single": round(max_single, 2),
        "diversification_score": diversification_score
    }

    # ============================================================
    # Step 3 — 现金利用率分析
    # ============================================================
    cash_weight = sum(f["weight"] for f in fund_data if f["asset_type"] == "货币型")
    effective_weight = 100 - cash_weight

    result["cash_utilization"] = {
        "cash_weight": round(cash_weight, 2),
        "effective_weight": round(effective_weight, 2),
        "is_cash_heavy": cash_weight > 20,
        "description": "货币型资产占比" + f"{cash_weight:.1f}%"
    }

    # ============================================================
    # Step 4 — 风险等级分布
    # ============================================================
    for fund in fund_data:
        level = fund["risk_level"]
        risk_weights[level] = risk_weights.get(level, 0) + fund["weight"]

    for level, weight in risk_weights.items():
        result["risk_distribution"][level] = round(weight, 2)

    # ============================================================
    # Step 5 — 生成再平衡建议
    # ============================================================
    suggestions = []

    # 1. 集中度过高建议
    if hhi > 0.25:
        # 找出高权重基金
        high_weight_funds = [f for f in fund_data if f["weight"] > 20]
        suggestion = {
            "type": "concentration",
            "title": "集中度过高",
            "reason": f"HHI指数为{hhi:.3f}，组合有效基金数仅{effective_n:.1f}只，风险集中",
            "funds": [{"code": f["code"], "name": f["name"], "weight": round(f["weight"], 2)} for f in high_weight_funds],
            "action": "建议增加2-3只不相关基金（如不同行业或资产类型），将HHI降至0.15以下",
            "priority": "high"
        }
        suggestions.append(suggestion)
    elif hhi > 0.15:
        suggestion = {
            "type": "concentration",
            "title": "集中度偏高",
            "reason": f"HHI指数为{hhi:.3f}，建议适当分散",
            "funds": [{"code": f["code"], "name": f["name"], "weight": round(f["weight"], 2)} for f in fund_data if f["weight"] > 15],
            "action": "考虑添加1-2只不同风格的基金以提高分散度",
            "priority": "medium"
        }
        suggestions.append(suggestion)

    # 2. 现金利用率建议
    if cash_weight > 30:
        cash_funds = [f for f in fund_data if f["asset_type"] == "货币型"]
        suggestion = {
            "type": "cash",
            "title": "现金占比过高",
            "reason": f"货币型资产占比{cash_weight:.1f}%，超过30%，可能错失权益市场机会",
            "funds": [{"code": f["code"], "name": f["name"], "weight": round(f["weight"], 2)} for f in cash_funds],
            "action": "建议将部分货币型资产配置到债券型或权益型基金，目标占比10-15%",
            "priority": "high"
        }
        suggestions.append(suggestion)
    elif cash_weight < 5:
        suggestion = {
            "type": "cash",
            "title": "现金缓冲不足",
            "reason": f"货币型资产占比仅{cash_weight:.1f}%，缺乏流动性缓冲",
            "funds": [],
            "action": "建议保持5-10%的货币型资产作为流动性储备，应对赎回需求",
            "priority": "medium"
        }
        suggestions.append(suggestion)

    # 3. 风险等级失衡建议
    low_risk = risk_weights.get("低风险", 0)
    high_risk = risk_weights.get("高风险", 0) + risk_weights.get("中高风险", 0)

    if high_risk > 70:
        suggestion = {
            "type": "risk",
            "title": "风险暴露过高",
            "reason": f"中高风险和高风险资产合计占比{high_risk:.1f}%，超过70%",
            "funds": [{"code": f["code"], "name": f["name"], "weight": round(f["weight"], 2)} for f in fund_data if f["risk_level"] in ["高风险", "中高风险"]],
            "action": "建议增加债券型或货币型基金配置，降低整体组合波动",
            "priority": "high"
        }
        suggestions.append(suggestion)
    elif low_risk < 10:
        suggestion = {
            "type": "risk",
            "title": "缺乏低风险配置",
            "reason": f"低风险资产占比仅{low_risk:.1f}%，组合缺乏稳定性",
            "funds": [],
            "action": "建议配置10-20%的债券型基金作为组合稳定器",
            "priority": "medium"
        }
        suggestions.append(suggestion)

    # 4. 单只基金权重过高的再平衡建议
    for fund in fund_data:
        if fund["weight"] > 30:
            suggestion = {
                "type": "rebalance",
                "title": f"{fund['name']}权重过高",
                "reason": f"{fund['name']}占比{fund['weight']:.1f}%，超过30%，单只基金风险过大",
                "funds": [{"code": fund["code"], "name": fund["name"], "weight": round(fund["weight"], 2)}],
                "action": "建议逐步减持至20%以下，或通过定投其他基金摊薄权重",
                "priority": "high"
            }
            suggestions.append(suggestion)

    # 5. 资产类型过于集中的建议
    for asset_type, weight in type_weights.items():
        if weight > 60:
            suggestion = {
                "type": "rebalance",
                "title": f"{asset_type}占比过高",
                "reason": f"{asset_type}资产占比{weight:.1f}%，超过60%，类型风险集中",
                "funds": [{"code": f["code"], "name": f["name"], "weight": round(f["weight"], 2)} for f in fund_data if f["asset_type"] == asset_type],
                "action": f"建议将{asset_type}资产降至50%以下，增加其他资产类型配置",
                "priority": "medium"
            }
            suggestions.append(suggestion)

    # 按优先级排序（high > medium > low）
    priority_order = {"high": 0, "medium": 1, "low": 2}
    suggestions.sort(key=lambda x: priority_order.get(x["priority"], 99))

    result["suggestions"] = suggestions

    # ============================================================
    # 计算再平衡健康评分（0-100）
    # ============================================================
    score = 100

    # 集中度扣分
    if hhi > 0.25:
        score -= 25
    elif hhi > 0.15:
        score -= 15

    # 现金占比扣分
    if cash_weight > 30:
        score -= 15
    elif cash_weight < 5:
        score -= 10
    elif cash_weight > 20:
        score -= 5

    # 风险失衡扣分
    if high_risk > 70:
        score -= 15
    elif low_risk < 10:
        score -= 10

    # 单只基金过高扣分
    if max_single > 30:
        score -= 15
    elif max_single > 20:
        score -= 10

    # 建议数量扣分（建议越多，分数越低）
    high_count = sum(1 for s in suggestions if s["priority"] == "high")
    medium_count = sum(1 for s in suggestions if s["priority"] == "medium")
    score -= high_count * 5
    score -= medium_count * 2

    result["overall_score"] = max(0, min(100, score))

    return result


# ================================================================
# 新增功能1: 基准对比分析
# ================================================================

def get_benchmark_comparison(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    基准对比分析 — 组合 vs 沪深300

    计算指标：Jensen's alpha、beta、跟踪误差、信息比率、上行/下行捕获率、相关系数
    """
    cache_key = f"benchmark_comparison_{len(holdings)}"
    cached = risk_analysis_cache.get(cache_key, RISK_ANALYSIS_TTL)
    if cached:
        return cached

    default_result = {
        "benchmark": {"name": "沪深300", "code": "000300"},
        "alpha": 0, "beta": 0, "tracking_error": 0, "information_ratio": 0,
        "up_capture": 0, "down_capture": 0, "correlation": 0,
        "benchmark_return": 0, "portfolio_return": 0, "excess_return": 0,
        "benchmark_trend": [], "portfolio_trend": [], "excess_trend": [],
    }

    if not holdings:
        return default_result

    # 获取组合日收益率
    port_returns, total_value, port_dates = _get_portfolio_daily_returns(holdings)
    if len(port_returns) < 30:
        return default_result

    # 获取基准历史数据
    benchmark_trend = fetch_benchmark_history("000300", 500)
    if not benchmark_trend or len(benchmark_trend) < 30:
        return default_result

    # 计算基准日收益率
    bench_returns = []
    bench_dates = []
    for i in range(1, len(benchmark_trend)):
        prev_close = benchmark_trend[i - 1].get("close", 0)
        curr_close = benchmark_trend[i].get("close", 0)
        if prev_close > 0:
            bench_returns.append((curr_close - prev_close) / prev_close)
            bench_dates.append(benchmark_trend[i].get("date", ""))

    if len(bench_returns) < 30:
        return default_result

    # 对齐长度（取较短的那个）
    min_len = min(len(port_returns), len(bench_returns))
    port_r = port_returns[-min_len:]
    bench_r = bench_returns[-min_len:]
    dates = bench_dates[-min_len:]

    # 计算基本统计量
    port_mu = _mean(port_r)
    bench_mu = _mean(bench_r)
    port_sigma = _std(port_r)
    bench_sigma = _std(bench_r)

    # 年化收益率
    port_annual = port_mu * 252 * 100
    bench_annual = bench_mu * 252 * 100

    # 协方差和相关系数
    cov_pb = sum((port_r[i] - port_mu) * (bench_r[i] - bench_mu) for i in range(min_len)) / min_len
    var_b = sum((r - bench_mu) ** 2 for r in bench_r) / min_len
    correlation = cov_pb / (port_sigma * bench_sigma) if port_sigma * bench_sigma > 1e-15 else 0

    # Beta 和 Alpha (Jensen's)
    beta = cov_pb / var_b if var_b > 1e-15 else 1.0
    alpha_annual = (port_annual - beta * bench_annual) / 100  # 小数形式

    # 超额收益序列
    excess_r = [port_r[i] - bench_r[i] for i in range(min_len)]

    # 跟踪误差
    tracking_error = _std(excess_r) * math.sqrt(252) * 100

    # 信息比率
    ir = (alpha_annual * 100) / tracking_error if tracking_error > 0.01 else 0

    # 上行/下行捕获率
    up_port = [port_r[i] for i in range(min_len) if bench_r[i] > 0]
    up_bench = [bench_r[i] for i in range(min_len) if bench_r[i] > 0]
    down_port = [port_r[i] for i in range(min_len) if bench_r[i] < 0]
    down_bench = [bench_r[i] for i in range(min_len) if bench_r[i] < 0]

    up_capture = (_mean(up_port) / _mean(up_bench) * 100) if up_bench and _mean(up_bench) > 0 else 100
    down_capture = (_mean(down_port) / _mean(down_bench) * 100) if down_bench and _mean(down_bench) < 0 else 100

    # 构建趋势数组（归一化到1.0）
    port_cum = [1.0]
    bench_cum = [1.0]
    excess_cum = [0.0]
    for i in range(min_len):
        port_cum.append(port_cum[-1] * (1 + port_r[i]))
        bench_cum.append(bench_cum[-1] * (1 + bench_r[i]))
        excess_cum.append(excess_cum[-1] + excess_r[i])

    # 采样（每5天一个点，避免数据量过大）
    step = max(1, min_len // 100)
    benchmark_trend_out = [{"date": dates[i], "nav": round(bench_cum[i], 4)} for i in range(0, min_len, step)]
    portfolio_trend_out = [{"date": dates[i], "nav": round(port_cum[i], 4)} for i in range(0, min_len, step)]
    excess_trend_out = [{"date": dates[i], "cumulative_excess": round(excess_cum[i] * 100, 4)} for i in range(0, min_len, step)]

    result = {
        "benchmark": {"name": "沪深300", "code": "000300"},
        "alpha": round(alpha_annual * 100, 2),
        "beta": round(beta, 3),
        "tracking_error": round(tracking_error, 2),
        "information_ratio": round(ir, 3),
        "up_capture": round(up_capture, 1),
        "down_capture": round(down_capture, 1),
        "correlation": round(correlation, 3),
        "benchmark_return": round(bench_annual, 2),
        "portfolio_return": round(port_annual, 2),
        "excess_return": round(port_annual - bench_annual, 2),
        "benchmark_trend": benchmark_trend_out,
        "portfolio_trend": portfolio_trend_out,
        "excess_trend": excess_trend_out,
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    risk_analysis_cache.set(cache_key, result)
    logger.info("Benchmark comparison: alpha=%.2f%%, beta=%.3f, IR=%.3f", alpha_annual * 100, beta, ir)
    return result


# ================================================================
# 新增功能2: 历史压力测试
# ================================================================

STRESS_SCENARIOS = [
    {"name": "2015年股灾", "start": "2015-06-12", "end": "2015-08-26",
     "benchmark_dd": -44.95, "severity": "extreme",
     "description": "A股从5178点暴跌至2850点，千股跌停、流动性枯竭"},
    {"name": "2018年贸易战", "start": "2018-01-29", "end": "2018-12-28",
     "benchmark_dd": -25.31, "severity": "severe",
     "description": "中美贸易摩擦升级，全年单边下跌，外资持续流出"},
    {"name": "2020年新冠疫情", "start": "2020-01-14", "end": "2020-03-23",
     "benchmark_dd": -16.07, "severity": "moderate",
     "description": "全球疫情爆发，恐慌性抛售，市场流动性紧张"},
    {"name": "2022年熊市", "start": "2022-01-04", "end": "2022-10-31",
     "benchmark_dd": -21.63, "severity": "severe",
     "description": "地产危机叠加疫情封控，持续阴跌近10个月"},
    {"name": "2024年调整", "start": "2024-05-20", "end": "2024-09-23",
     "benchmark_dd": -12.80, "severity": "moderate",
     "description": "经济复苏不及预期，市场信心低迷，成交量萎缩"},
]


def get_stress_test(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    历史压力测试 — 评估组合在5大A股危机情景下的表现

    使用基金波动率与市场波动率的比值作为beta代理，估算组合在历史危机中的回撤。
    """
    cache_key = f"stress_test_{len(holdings)}"
    cached = risk_analysis_cache.get(cache_key, 600)  # 10分钟缓存
    if cached:
        return cached

    default_result = {
        "scenarios": [],
        "worst_scenario": None,
        "portfolio_resilience_score": 50,
        "portfolio_beta": 1.0,
        "vulnerability_summary": "数据不足，无法评估",
    }

    if not holdings:
        return default_result

    # 计算各基金波动率和加权beta代理
    fund_betas = []
    total_value = 0.0

    for holding in holdings:
        code = holding["code"]
        value = holding.get("value", 0)
        est = fetch_fund_estimation(code)
        if not est:
            continue

        estimated_change_pct = float(est.get("estimated_change_pct", "0"))
        current_value = value * (1 + estimated_change_pct / 100)
        total_value += current_value

        perf = fetch_fund_performance(code)
        volatility = 20.0  # 默认beta=1.0
        if perf and "trend" in perf and len(perf["trend"]) >= 30:
            try:
                returns = [float(t.get("return", 0)) for t in perf["trend"][-250:]]
                if len(returns) >= 20:
                    mu = sum(returns) / len(returns)
                    var = sum((r - mu) ** 2 for r in returns) / len(returns)
                    volatility = math.sqrt(var) * math.sqrt(252)
            except Exception:
                pass

        beta_proxy = volatility / 20.0  # 20% 为A股典型波动率
        fund_betas.append({"value": current_value, "beta": beta_proxy})

    if total_value == 0:
        return default_result

    # 组合加权beta
    portfolio_beta = sum(fb["beta"] * fb["value"] / total_value for fb in fund_betas)
    portfolio_beta = max(0.3, min(2.0, portfolio_beta))  # 限制在合理范围

    # 估算每个情景下的组合回撤
    scenarios = []
    for scenario in STRESS_SCENARIOS:
        portfolio_dd = scenario["benchmark_dd"] * portfolio_beta
        recovery_days = int(abs(portfolio_dd) * 8)  # 粗略估计：1%回撤约8天恢复

        scenarios.append({
            "name": scenario["name"],
            "period": f"{scenario['start']} ~ {scenario['end']}",
            "benchmark_drawdown": scenario["benchmark_dd"],
            "portfolio_drawdown": round(portfolio_dd, 2),
            "recovery_days": recovery_days,
            "description": scenario["description"],
            "severity": scenario["severity"],
        })

    # 找出最差情景
    worst = min(scenarios, key=lambda s: s["portfolio_drawdown"])

    # 韧性评分：平均回撤越小、beta越接近1.0，分数越高
    avg_dd = sum(abs(s["portfolio_drawdown"]) for s in scenarios) / len(scenarios)
    resilience = max(0, min(100, int(100 - avg_dd * 1.5)))

    # 脆弱性总结
    if portfolio_beta > 1.3:
        vuln = f"组合Beta为{portfolio_beta:.2f}，高于市场平均，在极端行情下波动放大明显"
    elif portfolio_beta < 0.7:
        vuln = f"组合Beta为{portfolio_beta:.2f}，防御性较强，但在牛市可能跑输市场"
    else:
        vuln = f"组合Beta为{portfolio_beta:.2f}，与市场联动适中，风险可控"

    result = {
        "scenarios": scenarios,
        "worst_scenario": worst,
        "portfolio_resilience_score": resilience,
        "portfolio_beta": round(portfolio_beta, 3),
        "vulnerability_summary": vuln,
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    risk_analysis_cache.set(cache_key, result)
    logger.info("Stress test: beta=%.3f, resilience=%d, worst=%s %.1f%%",
                portfolio_beta, resilience, worst["name"], worst["portfolio_drawdown"])
    return result


# ================================================================
# 新增功能3: 滚动风险指标
# ================================================================

def get_rolling_metrics(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    滚动窗口风险指标 — 30/60/90日波动率、夏普比率、最大回撤
    """
    cache_key = f"rolling_metrics_{len(holdings)}"
    cached = risk_analysis_cache.get(cache_key, RISK_ANALYSIS_TTL)
    if cached:
        return cached

    default_result = {
        "windows": [30, 60, 90],
        "dates": [],
        "rolling_volatility": {"30": [], "60": [], "90": []},
        "rolling_sharpe": {"30": [], "60": [], "90": []},
        "rolling_max_drawdown": {"30": [], "60": [], "90": []},
        "current": {},
        "trend_signals": {},
    }

    if not holdings:
        return default_result

    port_returns, _, dates = _get_portfolio_daily_returns(holdings)
    if len(port_returns) < 90:
        return default_result

    rf_daily = 0.02 / 252  # 无风险日利率（年化2%）
    windows = [30, 60, 90]
    result = {
        "windows": windows,
        "dates": [],
        "rolling_volatility": {},
        "rolling_sharpe": {},
        "rolling_max_drawdown": {},
        "current": {},
        "trend_signals": {},
    }

    for w in windows:
        if len(port_returns) < w:
            result["rolling_volatility"][str(w)] = []
            result["rolling_sharpe"][str(w)] = []
            result["rolling_max_drawdown"][str(w)] = []
            continue

        vols = []
        sharpes = []
        max_dds = []
        out_dates = []

        # 每5天采样一次
        for i in range(w, len(port_returns) + 1, 5):
            window_r = port_returns[i - w:i]
            mu = _mean(window_r)
            sigma = _std(window_r)

            # 年化波动率(%)
            ann_vol = sigma * math.sqrt(252) * 100
            vols.append(round(ann_vol, 2))

            # 年化夏普比率
            sharpe = (mu - rf_daily) / sigma * math.sqrt(252) if sigma > 1e-10 else 0
            sharpes.append(round(sharpe, 3))

            # 窗口内最大回撤(%)
            cum = [1.0]
            for r in window_r:
                cum.append(cum[-1] * (1 + r))
            peak = cum[0]
            max_dd = 0.0
            for v in cum:
                if v > peak:
                    peak = v
                dd = (v - peak) / peak * 100 if peak > 0 else 0
                if dd < max_dd:
                    max_dd = dd
            max_dds.append(round(max_dd, 2))

            if dates and i - 1 < len(dates):
                out_dates.append(dates[i - 1])

        result["rolling_volatility"][str(w)] = vols
        result["rolling_sharpe"][str(w)] = sharpes
        result["rolling_max_drawdown"][str(w)] = max_dds

        if w == 30:
            result["dates"] = out_dates

        # 当前值
        if vols:
            result["current"][f"volatility_{w}d"] = vols[-1]
            result["current"][f"sharpe_{w}d"] = sharpes[-1]
            result["current"][f"max_dd_{w}d"] = max_dds[-1]

    # 趋势信号（基于30日窗口最后5个点）
    v30 = result["rolling_volatility"].get("30", [])
    s30 = result["rolling_sharpe"].get("30", [])
    d30 = result["rolling_max_drawdown"].get("30", [])

    result["trend_signals"] = {
        "volatility_increasing": len(v30) >= 5 and v30[-1] > v30[-5],
        "sharpe_improving": len(s30) >= 5 and s30[-1] > s30[-5],
        "drawdown_worsening": len(d30) >= 5 and d30[-1] < d30[-5],  # 回撤为负数，更小=更差
    }

    risk_analysis_cache.set(cache_key, result)
    logger.info("Rolling metrics: 30d vol=%.1f%%, sharpe=%.3f, dd=%.1f%%",
                result["current"].get("volatility_30d", 0),
                result["current"].get("sharpe_30d", 0),
                result["current"].get("max_dd_30d", 0))
    return result


# ================================================================
# 新增功能4: 尾部风险分析
# ================================================================

def get_tail_risk_analysis(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    尾部风险分析 — VaR/CVaR、Ulcer Index、回撤区间、偏度/峰度
    """
    cache_key = f"tail_risk_{len(holdings)}"
    cached = risk_analysis_cache.get(cache_key, RISK_ANALYSIS_TTL)
    if cached:
        return cached

    default_result = {
        "var_95": 0, "var_99": 0, "cvar_95": 0, "cvar_99": 0,
        "worst_days": [], "ulcer_index": 0, "drawdown_periods": [],
        "tail_ratio": 1.0, "skewness": 0, "kurtosis": 0,
        "pain_index": 0, "return_count": 0, "annual_volatility": 0,
    }

    if not holdings:
        return default_result

    port_returns, _, dates = _get_portfolio_daily_returns(holdings)
    if len(port_returns) < 30:
        return default_result

    n = len(port_returns)
    mu = _mean(port_returns)
    sigma = _std(port_returns)
    ann_vol = sigma * math.sqrt(252) * 100

    # 排序后的收益率
    sorted_r = sorted(port_returns)

    # VaR（每日，百分比）
    var_95_idx = max(0, int(n * 0.05))
    var_99_idx = max(0, int(n * 0.01))
    var_95 = sorted_r[var_95_idx] * 100
    var_99 = sorted_r[var_99_idx] * 100

    # CVaR（Expected Shortfall）
    tail_95 = [r for r in sorted_r if r <= sorted_r[var_95_idx]]
    tail_99 = [r for r in sorted_r if r <= sorted_r[var_99_idx]]
    cvar_95 = _mean(tail_95) * 100 if tail_95 else var_95
    cvar_99 = _mean(tail_99) * 100 if tail_99 else var_99

    # 最差10天
    worst_indices = sorted(range(n), key=lambda i: port_returns[i])[:10]
    worst_days = []
    for rank, idx in enumerate(worst_indices):
        date = dates[idx] if idx < len(dates) else "N/A"
        worst_days.append({
            "date": date,
            "return": round(port_returns[idx] * 100, 2),
            "rank": rank + 1,
        })

    # 累计净值序列（用于计算回撤区间）
    cum_nav = [1.0]
    for r in port_returns:
        cum_nav.append(cum_nav[-1] * (1 + r))

    # Ulcer Index = sqrt(mean(drawdown^2))
    peak = cum_nav[0]
    drawdowns = []
    for v in cum_nav:
        if v > peak:
            peak = v
        dd = (v - peak) / peak * 100 if peak > 0 else 0
        drawdowns.append(dd)
    ulcer_index = math.sqrt(sum(d ** 2 for d in drawdowns) / len(drawdowns))

    # Pain Index = mean(|drawdown|)
    pain_index = sum(abs(d) for d in drawdowns) / len(drawdowns)

    # 回撤区间检测
    dd_periods = []
    in_drawdown = False
    dd_start = 0
    dd_trough = 0
    dd_trough_val = 0
    peak_val = cum_nav[0]

    for i, v in enumerate(cum_nav):
        if v > peak_val:
            peak_val = v
            if in_drawdown and i > dd_start:
                # 回撤结束（恢复）
                dd_periods.append({
                    "start_idx": dd_start,
                    "trough_idx": dd_trough,
                    "end_idx": i,
                    "max_drawdown": round(dd_trough_val, 2),
                    "duration_days": i - dd_start,
                    "recovery_days": i - dd_trough,
                    "underwater_days": i - dd_start,
                })
                in_drawdown = False

        dd_pct = (v - peak_val) / peak_val * 100 if peak_val > 0 else 0
        if dd_pct < -1.0 and not in_drawdown:  # 回撤超过1%视为开始
            in_drawdown = True
            dd_start = i
            dd_trough = i
            dd_trough_val = dd_pct
        elif in_drawdown and dd_pct < dd_trough_val:
            dd_trough = i
            dd_trough_val = dd_pct

    # 如果仍在回撤中
    if in_drawdown:
        dd_periods.append({
            "start_idx": dd_start,
            "trough_idx": dd_trough,
            "end_idx": len(cum_nav) - 1,
            "max_drawdown": round(dd_trough_val, 2),
            "duration_days": len(cum_nav) - 1 - dd_start,
            "recovery_days": None,
            "underwater_days": len(cum_nav) - 1 - dd_start,
        })

    # 只保留最大的5个回撤区间
    dd_periods.sort(key=lambda x: x["max_drawdown"])
    dd_periods = dd_periods[:5]

    # 转换idx为日期
    dd_out = []
    for dp in dd_periods:
        start_date = dates[dp["start_idx"]] if dp["start_idx"] < len(dates) else "N/A"
        trough_date = dates[dp["trough_idx"]] if dp["trough_idx"] < len(dates) else "N/A"
        end_date = dates[dp["end_idx"]] if dp["end_idx"] < len(dates) else None
        dd_out.append({
            "start": start_date,
            "trough": trough_date,
            "end": end_date if dp["recovery_days"] is not None else None,
            "max_drawdown": dp["max_drawdown"],
            "duration_days": dp["duration_days"],
            "recovery_days": dp["recovery_days"],
            "underwater_days": dp["underwater_days"],
        })

    # 偏度和峰度
    if sigma > 1e-15:
        skewness = sum(((r - mu) / sigma) ** 3 for r in port_returns) / n
        kurtosis = sum(((r - mu) / sigma) ** 4 for r in port_returns) / n - 3  # 超额峰度
    else:
        skewness = 0
        kurtosis = 0

    # 尾部比率
    p95 = _percentile(sorted_r, 95) * 100
    p5 = _percentile(sorted_r, 5) * 100
    tail_ratio = abs(p95 / p5) if abs(p5) > 1e-10 else 1.0

    result = {
        "var_95": round(var_95, 2),
        "var_99": round(var_99, 2),
        "cvar_95": round(cvar_95, 2),
        "cvar_99": round(cvar_99, 2),
        "worst_days": worst_days,
        "ulcer_index": round(ulcer_index, 2),
        "drawdown_periods": dd_out,
        "tail_ratio": round(tail_ratio, 3),
        "skewness": round(skewness, 3),
        "kurtosis": round(kurtosis, 3),
        "pain_index": round(pain_index, 3),
        "return_count": n,
        "annual_volatility": round(ann_vol, 2),
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    risk_analysis_cache.set(cache_key, result)
    logger.info("Tail risk: VaR95=%.2f%%, CVaR95=%.2f%%, Ulcer=%.2f, Skew=%.3f, Kurt=%.3f",
                var_95, cvar_95, ulcer_index, skewness, kurtosis)
    return result
