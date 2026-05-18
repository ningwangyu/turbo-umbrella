"""
AI每日晨报服务 — 自动生成市场总结和持仓分析

功能：
1. 获取当日市场行情（指数、板块、贵金属）
2. 获取用户持仓表现
3. 调用AI生成分析报告
4. 缓存报告结果（当日有效）
"""

import time
import json

from services.ai_service import call_ai_api
from services.market_service import get_market_indices, get_hot_sectors, get_metal_prices
from services.fund_service import fetch_fund_estimation
from cache import TimedCache

_report_cache = TimedCache()
REPORT_TTL = 1800  # 30分钟缓存


def generate_morning_report(holdings: list) -> dict:
    """
    生成AI晨报。

    Args:
        holdings: 用户持仓列表 [{code, value, profit}]

    Returns:
        dict: {report, market_data, holdings_data, generated_at}
    """
    cached = _report_cache.get("morning_report", REPORT_TTL)
    if cached is not None:
        return cached

    # 收集市场数据
    indices = get_market_indices()
    sectors = get_hot_sectors()
    metals = get_metal_prices()

    # 收集持仓表现
    holdings_data = []
    total_value = 0
    total_today = 0
    for h in holdings:
        code = str(h.get("code", "")).strip()
        value = float(h.get("value", 0))
        est = fetch_fund_estimation(code)
        if est:
            pct = float(est.get("estimated_change_pct", 0))
            today = value * pct / 100
            holdings_data.append({
                "name": est.get("name", code),
                "code": code,
                "value": value,
                "change_pct": pct,
                "today": round(today, 2),
            })
            total_value += value + today
            total_today += today

    # 构建AI提示词
    market_summary = "【大盘指数】\n"
    for key, idx in indices.items():
        market_summary += f"- {idx['name']}: {idx['price']} ({idx['change_pct']:+.2f}%)\n"

    if sectors:
        top_sectors = sectors[:5]
        market_summary += "\n【热门板块TOP5】\n"
        for s in top_sectors:
            market_summary += f"- {s['name']}: {s['change_pct']:+.2f}% 领涨:{s.get('leader_name', '-')}\n"

    if metals and "error" not in metals:
        market_summary += "\n【贵金属】\n"
        for key in ["gold", "silver", "gold_cny"]:
            if key in metals:
                m = metals[key]
                market_summary += f"- {m['name']}: {m['price']} {m['unit']} ({m['change_pct']:+.2f}%)\n"

    holdings_summary = ""
    if holdings_data:
        holdings_summary = f"\n【持仓表现】总市值约{total_value:.0f}元，今日预估{total_today:+.2f}元\n"
        for hd in holdings_data:
            holdings_summary += f"- {hd['name']}: 今日{hd['change_pct']:+.2f}%，预估收益{hd['today']:+.2f}元\n"

    prompt = (
        "请根据以下数据，生成一份简洁的基金投资晨报。包含：\n"
        "1. 市场概览（2-3句话总结今日市场走势）\n"
        "2. 板块分析（哪些板块值得关注，原因）\n"
        "3. 持仓点评（简要评价持仓表现）\n"
        "4. 操作建议（1-2条具体建议）\n\n"
        f"{market_summary}{holdings_summary}\n"
        "请用中文回答，格式清晰，适当使用emoji，控制在300字以内。"
    )

    messages = [
        {
            "role": "system",
            "content": (
                "你是「基金助手」的晨报分析模块，专门撰写基金投资晨报。"
                "基于提供的真实数据撰写分析，不编造数据。"
                "语气专业但不刻板，适当鼓励投资者保持理性。"
            ),
        },
        {"role": "user", "content": prompt},
    ]

    try:
        report_text = call_ai_api(messages, stream=False)
    except Exception as e:
        report_text = f"晨报生成失败: {str(e)}"

    result = {
        "report": report_text,
        "market_data": {
            "indices": indices,
            "sectors_count": len(sectors),
            "top_sector": sectors[0] if sectors else None,
        },
        "holdings_data": holdings_data,
        "total_value": round(total_value, 2),
        "total_today": round(total_today, 2),
        "generated_at": time.strftime("%Y-%m-%d %H:%M"),
    }

    _report_cache.set("morning_report", result)
    return result
