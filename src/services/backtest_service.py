"""
智能定投回测引擎 — 模拟不同定投策略的历史收益

支持三种定投策略：
1. 普通定投：固定金额、固定周期买入
2. 慧定投（均线偏离法）：净值低于均线时多投，高于均线时少投
3. 价值平均法：每次定投使账户总值按固定增长率增长

回测逻辑：
- 从基金净值历史数据中，按指定周期（周/双周/月）选取定投日
- 计算每次买入份额，累计后得出最终市值和收益率
- 输出每次定投详情 + 收益汇总
"""

from services.fund_service import fetch_fund_performance


def _get_nav_map(trend: list) -> list:
    """将趋势数据转换为 (日期戳, 净值) 列表，按日期排序"""
    return sorted([(t["date"], t["nav"]) for t in trend if t.get("nav")], key=lambda x: x[0])


def _sample_dates(nav_map: list, frequency: str) -> list:
    """
    按定投频率从历史日期中抽样定投日。

    frequency: "weekly" = 每周, "biweekly" = 每两周, "monthly" = 每月
    """
    if not nav_map:
        return []

    sampled = []
    last_sample = 0
    interval_days = {"weekly": 5, "biweekly": 10, "monthly": 20}.get(frequency, 20)

    for i, (date, nav) in enumerate(nav_map):
        if i == 0 or (i - last_sample) >= interval_days:
            sampled.append((date, nav, i))
            last_sample = i

    return sampled


def backtest_fixed_dca(trend: list, amount: float, frequency: str) -> dict:
    """
    普通定投回测 — 固定金额定期买入。

    Args:
        trend: 净值走势数据
        amount: 每期定投金额（元）
        frequency: 定投频率 weekly/biweekly/monthly

    Returns:
        dict: {summary, details}
    """
    nav_map = _get_nav_map(trend)
    if len(nav_map) < 10:
        return {"error": "历史数据不足，无法回测"}

    dates = _sample_dates(nav_map, frequency)
    if len(dates) < 2:
        return {"error": "定投样本不足"}

    total_shares = 0
    total_invested = 0
    details = []

    for date, nav, _ in dates:
        shares = amount / nav
        total_shares += shares
        total_invested += amount
        details.append({
            "date": str(date),
            "nav": round(nav, 4),
            "amount": round(amount, 2),
            "shares": round(shares, 4),
        })

    final_nav = nav_map[-1][1]
    final_value = total_shares * final_nav
    profit = final_value - total_invested
    profit_pct = (profit / total_invested * 100) if total_invested > 0 else 0

    return {
        "strategy": "普通定投",
        "summary": {
            "total_invested": round(total_invested, 2),
            "final_value": round(final_value, 2),
            "profit": round(profit, 2),
            "profit_pct": round(profit_pct, 2),
            "total_shares": round(total_shares, 4),
            "avg_cost": round(total_invested / total_shares, 4) if total_shares > 0 else 0,
            "periods": len(dates),
            "final_nav": round(final_nav, 4),
        },
        "details": details,
    }


def backtest_smart_dca(trend: list, amount: float, frequency: str, ma_window: int = 20) -> dict:
    """
    慧定投（均线偏离法）回测。

    规则：
    - 计算MA均线（默认20日）
    - 净值低于MA时：投入 = 基础金额 × (1 + 偏离度%)，最多投入2倍
    - 净值高于MA时：投入 = 基础金额 × max(0.3, 1 - 偏离度%)，最少投入30%
    - 偏离度 = (MA - 净值) / MA × 100

    Args:
        trend: 净值走势数据
        amount: 每期基础定投金额
        frequency: 定投频率
        ma_window: 均线周期（默认20日）
    """
    nav_map = _get_nav_map(trend)
    if len(nav_map) < ma_window + 5:
        return {"error": "历史数据不足，无法计算均线"}

    dates = _sample_dates(nav_map, frequency)
    if len(dates) < 2:
        return {"error": "定投样本不足"}

    total_shares = 0
    total_invested = 0
    details = []

    for date, nav, idx in dates:
        # 计算MA均线
        if idx >= ma_window:
            # nav_map 是 (date, nav) 二元组列表，只取净值求平均
            ma = sum(n for _, n in nav_map[max(0, idx - ma_window):idx]) / ma_window
        else:
            ma = nav  # 数据不足时按当前净值

        # 计算偏离度和调整系数
        deviation = (ma - nav) / ma if ma > 0 else 0
        if nav < ma:
            # 低于均线：多投，最多2倍
            multiplier = min(2.0, 1.0 + abs(deviation) * 5)
        else:
            # 高于均线：少投，最少0.3倍
            multiplier = max(0.3, 1.0 - abs(deviation) * 3)

        invest_amount = amount * multiplier
        shares = invest_amount / nav
        total_shares += shares
        total_invested += invest_amount

        details.append({
            "date": str(date),
            "nav": round(nav, 4),
            "ma": round(ma, 4),
            "deviation": round(deviation * 100, 2),
            "multiplier": round(multiplier, 2),
            "amount": round(invest_amount, 2),
            "shares": round(shares, 4),
        })

    final_nav = nav_map[-1][1]
    final_value = total_shares * final_nav
    profit = final_value - total_invested
    profit_pct = (profit / total_invested * 100) if total_invested > 0 else 0

    return {
        "strategy": "慧定投",
        "summary": {
            "total_invested": round(total_invested, 2),
            "final_value": round(final_value, 2),
            "profit": round(profit, 2),
            "profit_pct": round(profit_pct, 2),
            "total_shares": round(total_shares, 4),
            "avg_cost": round(total_invested / total_shares, 4) if total_shares > 0 else 0,
            "periods": len(dates),
            "final_nav": round(final_nav, 4),
        },
        "details": details,
    }


def backtest_value_averaging(trend: list, amount: float, frequency: str) -> dict:
    """
    价值平均法回测。

    规则：
    - 设定每期目标增长额（= amount）
    - 第N期目标市值 = N × amount
    - 实际投入 = 目标市值 - 当前市值
    - 如果需要投入金额 > 2倍基础金额，限制为2倍
    - 如果需要投入金额 < 0（盈利过多），不投入

    Args:
        trend: 净值走势数据
        amount: 每期目标增长额
        frequency: 定投频率
    """
    nav_map = _get_nav_map(trend)
    if len(nav_map) < 10:
        return {"error": "历史数据不足，无法回测"}

    dates = _sample_dates(nav_map, frequency)
    if len(dates) < 2:
        return {"error": "定投样本不足"}

    total_shares = 0
    total_invested = 0
    details = []

    for period, (date, nav, _) in enumerate(dates, 1):
        current_value = total_shares * nav
        target_value = period * amount
        invest_amount = target_value - current_value

        # 限制投入范围
        if invest_amount < 0:
            invest_amount = 0  # 盈利足够，本期不投
        elif invest_amount > amount * 2:
            invest_amount = amount * 2  # 最多投2倍

        bought_shares = 0
        if invest_amount > 0:
            bought_shares = invest_amount / nav
            total_shares += bought_shares
            total_invested += invest_amount

        details.append({
            "date": str(date),
            "nav": round(nav, 4),
            "target": round(target_value, 2),
            "current": round(current_value, 2),
            "amount": round(invest_amount, 2),
            "shares": round(bought_shares, 4),
        })

    final_nav = nav_map[-1][1]
    final_value = total_shares * final_nav
    profit = final_value - total_invested
    profit_pct = (profit / total_invested * 100) if total_invested > 0 else 0

    return {
        "strategy": "价值平均法",
        "summary": {
            "total_invested": round(total_invested, 2),
            "final_value": round(final_value, 2),
            "profit": round(profit, 2),
            "profit_pct": round(profit_pct, 2),
            "total_shares": round(total_shares, 4),
            "avg_cost": round(total_invested / total_shares, 4) if total_shares > 0 else 0,
            "periods": len(dates),
            "final_nav": round(final_nav, 4),
        },
        "details": details,
    }


def run_backtest(code: str, amount: float, frequency: str, strategies: list) -> dict:
    """
    定投回测主入口 — 对指定基金执行多种策略的回测对比。

    Args:
        code: 基金代码
        amount: 每期定投金额
        frequency: 定投频率 weekly/biweekly/monthly
        strategies: 策略列表 ["fixed", "smart", "value"]

    Returns:
        dict: {code, results: {fixed/smart/value: 回测结果}}
    """
    perf = fetch_fund_performance(code)
    if not perf or "trend" not in perf:
        return {"error": f"无法获取基金 {code} 的历史数据"}

    trend = perf["trend"]
    results = {}

    if "fixed" in strategies:
        results["fixed"] = backtest_fixed_dca(trend, amount, frequency)
    if "smart" in strategies:
        results["smart"] = backtest_smart_dca(trend, amount, frequency)
    if "value" in strategies:
        results["value"] = backtest_value_averaging(trend, amount, frequency)

    return {"code": code, "frequency": frequency, "amount": amount, "results": results}
