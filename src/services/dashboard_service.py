"""
仪表盘模块核心服务 — 聚合指数、持仓概览、事件时间线

功能说明：
- get_dashboard_overview(): 聚合指数、情绪、持仓、信号数据（用于首页概览）
- get_holdings_return_detail(): 每只基金的收益详情
- get_event_timeline(): 智能事件时间线（大涨/大跌、信号变化、情绪、漂移、里程碑）

复用现有服务：
- market_service.get_market_indices() - 三大指数
- sentiment_service.get_market_sentiment() - 恐慌/贪婪指数
- fund_service.fetch_fund_estimation() - 基金实时估值
- fund_service.fetch_fund_performance() - 基金历史走势
- quant/signals.calculate_signal() - 多因子信号引擎
- signal_store.get_signal_trend() - 信号趋势查询
"""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import List, Dict, Any

from config import DASHBOARD_OVERVIEW_TTL
from cache import dashboard_overview_cache
from services.market_service import get_market_indices
from services.sentiment.market import get_market_sentiment
from services.fund_service import fetch_fund_estimation, fetch_fund_performance
from quant.signals import calculate_signal
from services.signal_store import get_signal_trend

logger = logging.getLogger(__name__)


def get_dashboard_overview(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    获取仪表盘概览数据（聚合指数、情绪、持仓、信号）

    参数:
        holdings: 持仓列表，每项需包含 {"code": "000001", "value": 10000, "profit": 500}

    返回:
        {
            "market": {"indices": {...}, "volume": {...}, "sentiment": {...}},
            "portfolio": {"total_value": ..., "total_cost": ..., "total_profit": ..., ...},
            "signal_summary": {"portfolio_buy_score": ..., "healthy_count": ..., ...},
            "updated_at": "2026-05-20 14:30:00"
        }
    """
    # 检查缓存
    cache_key = f"dashboard_overview_{len(holdings)}"
    cached = dashboard_overview_cache.get(cache_key, DASHBOARD_OVERVIEW_TTL)
    if cached:
        return cached

    result = {
        "market": {},
        "portfolio": {},
        "signal_summary": {},
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    # 并行获取市场数据和持仓数据
    with ThreadPoolExecutor(max_workers=5, thread_name_prefix="dashboard") as executor:
        # 提交任务
        future_indices = executor.submit(get_market_indices)
        future_sentiment = executor.submit(get_market_sentiment)

        # 收集持仓估值和信号
        fund_estimations = {}
        fund_signals = {}
        total_value = 0.0
        total_cost = 0.0
        total_profit = 0.0
        today_return = 0.0

        # 并行获取每只基金的估值和信号
        def fetch_fund_data(holding):
            code = holding["code"]
            est = fetch_fund_estimation(code)
            perf = fetch_fund_performance(code)
            signal = None
            if est and perf:
                signal = calculate_signal(perf, est)
            return code, est, signal

        future_funds = {executor.submit(fetch_fund_data, h): h for h in holdings}

        # 等待市场数据
        indices = future_indices.result()
        sentiment = future_sentiment.result()

        # 处理基金数据
        for future in as_completed(future_funds):
            try:
                code, est, signal = future.result()
                if est:
                    fund_estimations[code] = est
                    # 计算持仓收益
                    holding = next(h for h in holdings if h["code"] == code)
                    value = holding.get("value", 0)
                    profit = holding.get("profit", 0)

                    # 今日估算收益
                    estimated_change_pct = float(est.get("estimated_change_pct", "0"))
                    today_est_return = value * estimated_change_pct / 100

                    total_value += value + today_est_return
                    total_cost += value
                    total_profit += profit + today_est_return
                    today_return += today_est_return

                if signal:
                    fund_signals[code] = signal
            except Exception as e:
                logger.warning(f"Failed to fetch fund data: {e}")
                continue

        # 组装市场数据
        result["market"] = {
            "indices": indices,
            "volume": {
                "today": sentiment.get("indicators", {}).get("成交量", {}).get("amount", 0),
                "avg_5d": sentiment.get("indicators", {}).get("成交量", {}).get("avg_amount", 0)
            },
            "sentiment": {
                "score": sentiment.get("score", 50),
                "label": sentiment.get("label", "中性"),
                "advice": sentiment.get("advice", "")
            }
        }

        # 组装组合数据
        fund_details = []
        for holding in holdings:
            code = holding["code"]
            est = fund_estimations.get(code)
            if not est:
                continue

            value = holding.get("value", 0)
            profit = holding.get("profit", 0)
            estimated_change_pct = float(est.get("estimated_change_pct", "0"))
            today_est_return = value * estimated_change_pct / 100

            fund_details.append({
                "code": code,
                "name": est.get("name", ""),
                "current_value": value + today_est_return,
                "weight": 0.0,  # 稍后计算
                "today": today_est_return,
                "today_pct": estimated_change_pct,
                "profit": profit + today_est_return,
                "profit_pct": ((profit + today_est_return) / value * 100) if value > 0 else 0
            })

        # 计算权重
        if total_value > 0:
            for fd in fund_details:
                fd["weight"] = (fd["current_value"] / total_value) * 100

        # 按权重降序排序
        fund_details.sort(key=lambda x: x["weight"], reverse=True)

        result["portfolio"] = {
            "total_value": total_value,
            "total_cost": total_cost,
            "total_profit": total_profit,
            "total_profit_pct": (total_profit / total_cost * 100) if total_cost > 0 else 0,
            "today_return": today_return,
            "today_return_pct": (today_return / total_cost * 100) if total_cost > 0 else 0,
            "fund_count": len(fund_details),
            "fund_details": fund_details
        }

        # 组装信号摘要
        healthy_count = 0
        neutral_count = 0
        caution_count = 0
        alert_count = 0
        signal_details = []
        portfolio_buy_score = 0.0

        for fund in fund_details:
            code = fund["code"]
            signal = fund_signals.get(code)
            if not signal:
                continue

            buy_score = signal.get("buy_score", 50)
            signal_en = signal.get("signal_en", "hold")

            # 健康状态分类
            if buy_score >= 70:
                status = "healthy"
                healthy_count += 1
            elif buy_score >= 55:
                status = "neutral"
                neutral_count += 1
            elif buy_score >= 40:
                status = "caution"
                caution_count += 1
            else:
                status = "alert"
                alert_count += 1

            signal_details.append({
                "code": code,
                "name": fund["name"],
                "buy_score": buy_score,
                "signal": signal.get("signal", ""),
                "signal_en": signal_en,
                "status": status,
                "weight": fund["weight"]
            })

            # 加权平均信号分数
            portfolio_buy_score += buy_score * fund["weight"] / 100

        result["signal_summary"] = {
            "portfolio_buy_score": round(portfolio_buy_score, 1),
            "healthy_count": healthy_count,
            "neutral_count": neutral_count,
            "caution_count": caution_count,
            "alert_count": alert_count,
            "signals": signal_details
        }

        # 写入缓存
        dashboard_overview_cache.set(cache_key, result)
        return result


def get_holdings_return_detail(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    获取每只基金的收益明细（当日收益、累计收益、收益率、权重等）

    参数:
        holdings: 持仓列表，每项需包含 {"code": "000001", "value": 10000, "profit": 500}

    返回:
        {
            "holdings": [
                {
                    "code": "000001", "name": "某基金",
                    "current_value": 10500, "weight": 25.3,
                    "today_return": 150, "today_return_pct": 1.5,
                    "total_return": 500, "total_return_pct": 5.0,
                    "signal": {...}, "status": "healthy"
                }
            ],
            "updated_at": "..."
        }
    """
    result = {
        "holdings": [],
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    if not holdings:
        return result

    fund_details = []
    total_value = 0.0

    for holding in holdings:
        code = holding["code"]
        value = holding.get("value", 0)
        profit = holding.get("profit", 0)

        est = fetch_fund_estimation(code)
        perf = fetch_fund_performance(code)

        fund_name = est.get("name", holding.get("name", "")) if est else ""
        estimated_change_pct = float(est.get("estimated_change_pct", "0")) if est else 0
        today_return = value * estimated_change_pct / 100
        current_value = value + today_return
        total_value += current_value

        fund_details.append({
            "code": code,
            "name": fund_name,
            "current_value": current_value,
            "weight": 0.0,
            "today_return": today_return,
            "today_return_pct": estimated_change_pct,
            "total_return": profit + today_return,
            "total_return_pct": ((profit + today_return) / value * 100) if value > 0 else 0,
            "signal": None,
            "status": "unknown"
        })

    # 计算权重
    if total_value > 0:
        for fd in fund_details:
            fd["weight"] = round((fd["current_value"] / total_value) * 100, 1)

    # 计算信号
    for fd in fund_details:
        code = fd["code"]
        est = fetch_fund_estimation(code)
        perf = fetch_fund_performance(code)
        if est and perf:
            signal = calculate_signal(perf, est)
            if signal:
                fd["signal"] = signal
                buy_score = signal.get("buy_score", 50)
                if buy_score >= 70:
                    fd["status"] = "healthy"
                elif buy_score >= 55:
                    fd["status"] = "neutral"
                elif buy_score >= 40:
                    fd["status"] = "caution"
                else:
                    fd["status"] = "alert"

    result["holdings"] = fund_details
    return result


def get_event_timeline(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    智能事件时间线 — 检测持仓相关的重要市场事件

    事件类型：
    1. 大涨/大跌事件：基金单日收益 >±3%
    2. 信号变化事件：信号跨越阈值边界（hold -> buy 或 buy -> hold）
    3. 市场情绪变化：恐慌/贪婪指数剧烈波动
    4. 持仓漂移：基金权重偏移历史平均 >5%
    5. 收益里程碑：累计收益突破整数关口

    参数:
        holdings: 持仓列表，每项需包含 {"code": "000001", "value": 10000, "profit": 500}

    返回:
        {
            "events": [
                {
                    "type": "price_surge",  // price_surge|price_drop|signal_change|sentiment|drift|milestone
                    "date": "2026-05-19",
                    "title": "XXX基金单日大涨3.5%",
                    "description": "...",
                    "funds": [{"code": "...", "name": "...", "change": 3.5}],
                    "severity": "high",  // high|medium|low
                    "icon": "📈"
                }
            ],
            "event_count": 5,
            "summary": {...},
            "updated_at": "..."
        }
    """
    result = {
        "events": [],
        "event_count": 0,
        "summary": {
            "price_events": 0,
            "signal_events": 0,
            "sentiment_events": 0,
            "drift_events": 0,
            "milestone_events": 0
        },
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    if not holdings:
        return result

    events = []
    event_counts = {
        "price_events": 0,
        "signal_events": 0,
        "sentiment_events": 0,
        "drift_events": 0,
        "milestone_events": 0
    }

    # ============================================================
    # 事件1：大涨/大跌事件（从历史走势中检测）
    # ============================================================
    for holding in holdings:
        code = holding["code"]
        perf = fetch_fund_performance(code)
        if not perf:
            continue

        est = fetch_fund_estimation(code)
        fund_name = est.get("name", holding.get("name", "")) if est else ""

        trend = perf.get("trend", [])
        if not trend or len(trend) < 2:
            continue

        # 检测最近30天的大涨大跌事件
        recent_30d = trend[-30:]
        for day_data in recent_30d:
            daily_return = float(day_data.get("return", 0))
            raw_date = day_data.get("date", "")

            # 转换日期格式：timestamp → "YYYY-MM-DD"
            if isinstance(raw_date, (int, float)) and raw_date > 0:
                try:
                    # 毫秒级时间戳转日期
                    date = datetime.fromtimestamp(raw_date / 1000).strftime("%Y-%m-%d")
                except Exception:
                    date = str(raw_date)
            elif isinstance(raw_date, str) and raw_date:
                date = raw_date
            else:
                date = datetime.now().strftime("%Y-%m-%d")

            if abs(daily_return) >= 3.0:
                if daily_return > 0:
                    event_type = "price_surge"
                    title = f"{fund_name}单日大涨{daily_return:.1f}%"
                    icon = "📈"
                    severity = "high" if daily_return >= 5 else "medium"
                else:
                    event_type = "price_drop"
                    title = f"{fund_name}单日大跌{daily_return:.1f}%"
                    icon = "📉"
                    severity = "high" if daily_return <= -5 else "medium"

                events.append({
                    "type": event_type,
                    "date": date,
                    "title": title,
                    "description": f"基金{fund_name}（{code}）在{date}单日涨跌幅为{daily_return:.2f}%",
                    "funds": [{"code": code, "name": fund_name, "change": daily_return}],
                    "severity": severity,
                    "icon": icon
                })
                event_counts["price_events"] += 1

    # ============================================================
    # 事件2：信号变化事件（对比当前信号 vs 7天前）
    # ============================================================
    for holding in holdings:
        code = holding["code"]
        est = fetch_fund_estimation(code)
        perf = fetch_fund_performance(code)
        if not est or not perf:
            continue

        fund_name = est.get("name", holding.get("name", ""))

        # 获取当前信号
        current_signal = calculate_signal(perf, est)
        if not current_signal:
            continue

        current_score = current_signal.get("buy_score", 50)
        current_signal_en = current_signal.get("signal_en", "hold")

        # 获取7天前信号
        signal_trend = get_signal_trend(code, days=7)
        old_score = signal_trend.get("old_score")

        if old_score is not None:
            # 判断信号是否跨越阈值
            old_signal_en = "hold"
            if old_score >= 70:
                old_signal_en = "buy"
            elif old_score < 40:
                old_signal_en = "sell"

            if current_signal_en != old_signal_en:
                # 信号变化了
                change_direction = "升级" if current_score > old_score else "降级"
                change_desc = f"{old_signal_en} -> {current_signal_en}"

                events.append({
                    "type": "signal_change",
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "title": f"{fund_name}信号{change_direction}",
                    "description": f"信号从{old_signal_en}变为{current_signal_en}（分数：{old_score} -> {current_score}）",
                    "funds": [{"code": code, "name": fund_name, "old_score": old_score, "new_score": current_score}],
                    "severity": "medium",
                    "icon": "🔄" if change_direction == "升级" else "⚠️"
                })
                event_counts["signal_events"] += 1

    # ============================================================
    # 事件3：市场情绪变化
    # ============================================================
    try:
        sentiment = get_market_sentiment()
        sentiment_score = sentiment.get("score", 50)
        sentiment_label = sentiment.get("label", "中性")

        # 获取情绪历史（从缓存或数据库）
        # 简化处理：基于当前分数判断是否异常
        if sentiment_score < 25:
            events.append({
                "type": "sentiment",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "title": "市场恐慌情绪升温",
                "description": f"恐慌/贪婪指数为{sentiment_score}，处于极度恐慌区域（{sentiment_label}）",
                "funds": [],
                "severity": "high",
                "icon": "😱"
            })
            event_counts["sentiment_events"] += 1
        elif sentiment_score > 75:
            events.append({
                "type": "sentiment",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "title": "市场贪婪情绪升温",
                "description": f"恐慌/贪婪指数为{sentiment_score}，处于极度贪婪区域（{sentiment_label}）",
                "funds": [],
                "severity": "high",
                "icon": "🤩"
            })
            event_counts["sentiment_events"] += 1
        elif sentiment_score < 35 or sentiment_score > 65:
            events.append({
                "type": "sentiment",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "title": f"市场情绪{sentiment_label}",
                "description": f"恐慌/贪婪指数为{sentiment_score}，处于{sentiment_label}区间",
                "funds": [],
                "severity": "medium",
                "icon": "😐" if sentiment_score < 35 else "😊"
            })
            event_counts["sentiment_events"] += 1
    except Exception as e:
        logger.warning("Failed to fetch sentiment for timeline: %s", e)

    # ============================================================
    # 事件4：持仓漂移（基于历史权重和当前权重的差异）
    # ============================================================
    # 计算当前各基金权重
    total_value = 0.0
    fund_values = {}

    for holding in holdings:
        code = holding["code"]
        value = holding.get("value", 0)
        est = fetch_fund_estimation(code)
        if est:
            estimated_change_pct = float(est.get("estimated_change_pct", "0"))
            current_value = value * (1 + estimated_change_pct / 100)
        else:
            current_value = value
        fund_values[code] = current_value
        total_value += current_value

    if total_value > 0:
        for holding in holdings:
            code = holding["code"]
            current_weight = fund_values.get(code, 0) / total_value * 100
            est = fetch_fund_estimation(code)
            fund_name = est.get("name", holding.get("name", "")) if est else ""

            # 使用历史平均权重作为参考（简化处理：假设均等权重）
            avg_weight = 100 / len(holdings)
            weight_drift = current_weight - avg_weight

            if abs(weight_drift) > 5:
                direction = "增加" if weight_drift > 0 else "减少"
                events.append({
                    "type": "drift",
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "title": f"{fund_name}权重漂移{weight_drift:+.1f}%",
                    "description": f"当前权重{current_weight:.1f}%，较均等权重{avg_weight:.1f}%{direction}{abs(weight_drift):.1f}%",
                    "funds": [{"code": code, "name": fund_name, "current_weight": current_weight, "drift": weight_drift}],
                    "severity": "medium",
                    "icon": "⚖️"
                })
                event_counts["drift_events"] += 1

    # ============================================================
    # 事件5：收益里程碑
    # ============================================================
    total_profit = sum(h.get("profit", 0) for h in holdings)
    milestones = [1000, 5000, 10000, 20000, 50000, 100000]

    for milestone in milestones:
        # 检查是否最近突破里程碑（从负到正，或从低于到高于）
        if total_profit >= milestone and total_profit - 100 < milestone:
            events.append({
                "type": "milestone",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "title": f"累计收益突破{milestone:,}元",
                "description": f"组合累计收益达到{total_profit:,.0f}元，突破{milestone:,}元里程碑",
                "funds": [],
                "severity": "low",
                "icon": "🎯"
            })
            event_counts["milestone_events"] += 1

    # ============================================================
    # 按日期倒序排序，限制最多20个事件
    # ============================================================
    events.sort(key=lambda x: x["date"], reverse=True)
    events = events[:20]

    result["events"] = events
    result["event_count"] = len(events)
    result["summary"] = event_counts

    return result
