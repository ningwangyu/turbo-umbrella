"""
多因子量化买卖信号引擎 (Multi-factor Quantitative Signal Engine)

核心创新点：
- 五因子加权评分模型，融合趋势跟踪、动量反转、逆向投资等多种量化策略
- 每个因子独立评分(0-100)，通过权重加权汇总为最终买入/卖出评分
- 评分偏向买入方向（50为中性基线，>50看多，<50看空）

因子构成与权重：
    1. MA均线位置 (30%) — 趋势跟踪策略，价格偏离多周期均线的程度
    2. RSI相对强弱 (20%) — 超买超卖指标，识别短期过热/过冷
    3. 近期动量   (15%) — 动量反转策略，近期大幅下跌视为回调买入机会
    4. 回撤幅度   (15%) — 逆向投资策略，深度回撤后买入胜率更高
    5. 历史分位   (20%) — 估值策略，净值处于历史低位时更具安全边际
"""


def calculate_signal(perf: dict, est: dict) -> dict:
    """
    计算基金的多因子买卖信号。

    算法思路：
    从基金业绩走势(perf)和实时估值(est)中提取原始数据，
    分别计算5个因子的独立评分，按权重加权汇总得到最终买入评分(buy_score)。
    买入评分越高(接近100)表示越应该买入，越低(接近0)表示越应该卖出。

    Args:
        perf: 基金业绩数据，包含 trend(净值走势数组) 和 returns(收益率)
              trend 中每个元素: {"date": "20250101", "nav": 1.234, "return": 0.5}
        est:  实时估值数据，包含 nav(最新净值) 和 estimated_change_pct(今日涨跌幅%)

    Returns:
        dict: {
            signal: 中文信号文本 ("强烈建议买入" ~ "强烈建议卖出")
            signal_en: 英文信号标识 (strong_buy/buy/hold/sell/strong_sell)
            color: 颜色标识 (up/flat/down)
            buy_score: 买入评分 (5-95, 50为中性)
            sell_score: 卖出评分 (100 - buy_score)
            factors: 各因子详情列表 [{name, value, detail, score}]
            summary: 文字摘要
        }
    """
    # 从业绩数据中提取净值序列和日收益率序列
    trend = perf.get("trend", [])
    current_nav = float(est.get("nav", 0))
    change_pct = float(est.get("estimated_change_pct", 0))

    # 数据量不足14天时无法计算RSI等指标，返回中性信号
    if len(trend) < 14:
        return {"signal": "数据不足", "buy_score": 50, "sell_score": 50,
                "factors": [], "summary": "基金成立时间较短，数据不足，建议观望"}

    # 60天数据是计算MA60等长期指标的最低要求
    has_full_data = len(trend) >= 60

    navs = [p["nav"] for p in trend]
    daily_returns = [p["return"] for p in trend]
    # 优先使用实时估值净值，回退到最新历史净值
    latest_nav = current_nav if current_nav > 0 else navs[-1]

    factors = []
    # 买入评分基线为50(中性)，0=强烈卖出，100=强烈买入
    # 各因子通过 (factor_score - 50) * weight 的方式叠加到基线上
    buy_score = 50

    # --- Factor 1: MA position ---
    ma_scores = []
    for window in [20, 60, 120, 250]:
        if len(navs) >= window:
            ma = sum(navs[-window:]) / window
            ratio = (latest_nav - ma) / ma
            ma_score = 50 + min(max(ratio * 500, -25), 25)
            ma_scores.append(ma_score)
            factors.append({
                "name": f"MA{window}",
                "value": f"{latest_nav:.4f} vs {ma:.4f}",
                "detail": f"{'高于' if ratio > 0 else '低于'}均线 {abs(ratio)*100:.1f}%",
                "score": round(ma_score),
            })
    if ma_scores:
        buy_score += (sum(ma_scores) / len(ma_scores) - 50) * 0.3

    # --- Factor 2: RSI (14-day) ---
    if len(daily_returns) >= 14:
        recent = daily_returns[-14:]
        gains = [r for r in recent if r > 0]
        losses = [-r for r in recent if r < 0]
        avg_gain = sum(gains) / 14 if gains else 0
        avg_loss = sum(losses) / 14 if losses else 0.001
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))

        if rsi < 30:
            rsi_score = 75
            rsi_label = "超卖区"
        elif rsi < 40:
            rsi_score = 62
            rsi_label = "偏弱"
        elif rsi > 70:
            rsi_score = 25
            rsi_label = "超买区"
        elif rsi > 60:
            rsi_score = 38
            rsi_label = "偏强"
        else:
            rsi_score = 50
            rsi_label = "中性"

        buy_score += (rsi_score - 50) * 0.2
        factors.append({
            "name": "RSI(14)",
            "value": f"{rsi:.1f}",
            "detail": rsi_label,
            "score": round(rsi_score),
        })

    # --- Factor 3: Recent momentum ---
    momentum_windows = [w for w in [5, 10, 20] if len(navs) >= w]
    if not momentum_windows and len(navs) >= 3:
        momentum_windows = [3]
    for window in momentum_windows:
            ret = (latest_nav - navs[-window]) / navs[-window] * 100
            mom_score = 50 - ret * 2
            mom_score = max(20, min(80, mom_score))
            buy_score += (mom_score - 50) * 0.15
            factors.append({
                "name": f"近{window}日收益",
                "value": f"{ret:+.2f}%",
                "detail": "回调机会" if ret < -3 else "涨幅较大" if ret > 5 else "正常波动",
                "score": round(mom_score),
            })

    # --- Factor 4: Drawdown from peak ---
    if len(navs) >= 14:
        peak = max(navs[-250:]) if len(navs) >= 250 else max(navs)
        dd = (latest_nav - peak) / peak * 100
        if dd < -20:
            dd_score = 80
        elif dd < -10:
            dd_score = 65
        elif dd < -5:
            dd_score = 55
        elif dd > 0:
            dd_score = 35
        else:
            dd_score = 50
        buy_score += (dd_score - 50) * 0.15
        factors.append({
            "name": "回撤幅度",
            "value": f"{dd:+.1f}%",
            "detail": "深度回调" if dd < -15 else "适度回调" if dd < -5 else "接近高位" if dd > -2 else "高位",
            "score": round(dd_score),
        })

    # --- Factor 5: NAV percentile ---
    if len(navs) >= 20:
        sorted_navs = sorted(navs)
        rank = sum(1 for n in sorted_navs if n <= latest_nav)
        pct = rank / len(sorted_navs) * 100
        if pct < 20:
            pct_score = 75
        elif pct < 40:
            pct_score = 60
        elif pct > 80:
            pct_score = 25
        elif pct > 60:
            pct_score = 40
        else:
            pct_score = 50
        buy_score += (pct_score - 50) * 0.2
        factors.append({
            "name": "历史分位",
            "value": f"{pct:.0f}%",
            "detail": "偏低区域" if pct < 30 else "中等区域" if pct < 70 else "偏高区域",
            "score": round(pct_score),
        })

    # Clamp final score
    buy_score = max(5, min(95, round(buy_score)))
    sell_score = 100 - buy_score

    # Determine signal
    if buy_score >= 75:
        signal = "强烈建议买入"
        signal_en = "strong_buy"
        color = "up"
    elif buy_score >= 60:
        signal = "建议买入"
        signal_en = "buy"
        color = "up"
    elif buy_score >= 45:
        signal = "观望"
        signal_en = "hold"
        color = "flat"
    elif buy_score >= 30:
        signal = "建议卖出"
        signal_en = "sell"
        color = "down"
    else:
        signal = "强烈建议卖出"
        signal_en = "strong_sell"
        color = "down"

    # Summary
    bullish = sum(1 for f in factors if f["score"] >= 55)
    bearish = sum(1 for f in factors if f["score"] <= 45)
    summary = f"共{len(factors)}项指标，{bullish}项看多，{bearish}项看空。"
    if change_pct:
        summary += f"今日估值{change_pct:+.2f}%。"

    return {
        "signal": signal,
        "signal_en": signal_en,
        "color": color,
        "buy_score": buy_score,
        "sell_score": sell_score,
        "factors": factors,
        "summary": summary,
    }
