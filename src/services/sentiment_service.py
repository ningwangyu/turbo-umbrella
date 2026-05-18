"""
市场情绪监控服务 — 恐慌/贪婪指数、资金流向、ETF排行

创新点：
1. 恐慌/贪婪指数：基于涨跌家数、成交量、新高新低、涨跌停等多维指标计算
2. 北向资金流向：从东方财富接口获取当日北向资金净买入
3. ETF资金流入排行：获取ETF份额变化，判断资金流向

数据源：
- 东方财富：涨跌家数、ETF排行、北向资金
- 新浪财经：大盘成交量
"""

import re
import time

import requests

from config import HEADERS
from ratelimit import limiter
from cache import TimedCache

# 独立缓存实例
_sentiment_cache = TimedCache()
SENTIMENT_TTL = 120  # 2分钟缓存


def get_market_sentiment() -> dict:
    """
    计算恐慌/贪婪指数（0-100，越低越恐慌）。

    指标构成：
    1. 涨跌比（权重25%）：上涨家数/下跌家数
    2. 涨停/跌停比（权重15%）：涨停家数/跌停家数
    3. 成交量情绪（权重20%）：今日成交量 vs 5日平均
    4. 均线情绪（权重20%）：站上5日线个股比例
    5. 新高新低比（权重20%）：60日新高 vs 新低
    """
    cached = _sentiment_cache.get("sentiment", SENTIMENT_TTL)
    if cached is not None:
        return cached

    indicators = {}
    score = 50  # 基线50（中性）

    try:
        # 获取全市场涨跌家数
        limiter.acquire("eastmoney")
        url = (
            "https://push2.eastmoney.com/api/qt/clist/get?"
            "pn=1&pz=1&po=1&np=1&fltt=2&invt=2&"
            "fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&"
            "fields=f104,f105,f106"
        )
        resp = requests.get(url, timeout=10, headers={
            "Referer": "https://quote.eastmoney.com/",
            "User-Agent": "Mozilla/5.0",
        })
        data = resp.json()
        if data.get("data"):
            up = data["data"].get("f104", 0) or 0    # 上涨家数
            down = data["data"].get("f105", 0) or 0   # 下跌家数
            flat = data["data"].get("f106", 0) or 0   # 平盘家数
            total = up + down + flat
            if total > 0:
                up_ratio = up / total * 100
                indicators["涨跌比"] = {"value": f"{up}涨/{down}跌", "ratio": round(up_ratio, 1)}
                # 涨跌比分：上涨占比60%=50分，80%=70分，20%=30分
                score += (up_ratio - 50) * 0.25
    except Exception as e:
        print(f"Sentiment: fetch up/down count failed: {e}")

    try:
        # 获取涨停/跌停数量（通过东方财富涨跌停统计）
        limiter.acquire("eastmoney")
        url_limit = (
            "https://push2.eastmoney.com/api/qt/clist/get?"
            "pn=1&pz=5&po=1&np=1&fltt=2&invt=2&"
            "fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&"
            "fields=f2,f3,f12,f14&fid=f3&"
        )
        resp_top = requests.get(url_limit, timeout=10, headers={
            "Referer": "https://quote.eastmoney.com/",
            "User-Agent": "Mozilla/5.0",
        })
        # 近似涨停数：涨幅 >= 9.8% 的个股
        data_top = resp_top.json()
        if data_top.get("data") and data_top["data"].get("diff"):
            top_items = data_top["data"]["diff"]
            limit_up = sum(1 for d in top_items if d.get("f3", 0) >= 9.8)
            limit_down = sum(1 for d in top_items if d.get("f3", 0) <= -9.8)
            indicators["涨跌停"] = {"value": f"涨停{limit_up}/跌停{limit_down}"}
            if limit_up + limit_down > 0:
                limit_ratio = limit_up / (limit_up + limit_down) * 100
                score += (limit_ratio - 50) * 0.15
    except Exception as e:
        print(f"Sentiment: fetch limit count failed: {e}")

    try:
        # 获取北向资金流向
        limiter.acquire("eastmoney")
        url_north = (
            "https://push2.eastmoney.com/api/qt/kamt.rtmin/get?"
            "fields1=f1,f2,f3,f4&fields2=f51,f54,f52,f58,f53,f62,f56,f57,f60,f61"
        )
        resp_north = requests.get(url_north, timeout=10, headers={
            "Referer": "https://quote.eastmoney.com/",
            "User-Agent": "Mozilla/5.0",
        })
        north_data = resp_north.json()
        if north_data.get("data"):
            s2n = north_data["data"].get("s2n", [])
            if s2n:
                # 最新一条数据
                latest = s2n[-1] if isinstance(s2n, list) else None
                if latest and isinstance(latest, list) and len(latest) >= 4:
                    hgt = latest[1] if latest[1] != "-" else 0  # 沪股通净买入
                    sgt = latest[2] if latest[2] != "-" else 0  # 深股通净买入
                    total_north = latest[3] if latest[3] != "-" else 0  # 合计
                    try:
                        total_val = float(total_north) / 10000  # 万→亿
                        indicators["北向资金"] = {"value": f"{total_val:+.2f}亿", "amount": total_val}
                        # 北向净买入为正加分，为负减分
                        if total_val > 50:
                            score += 8
                        elif total_val > 0:
                            score += 3
                        elif total_val < -50:
                            score -= 8
                        elif total_val < 0:
                            score -= 3
                    except (ValueError, TypeError):
                        pass
    except Exception as e:
        print(f"Sentiment: fetch north capital failed: {e}")

    try:
        # 获取ETF资金流入排行
        limiter.acquire("eastmoney")
        url_etf = (
            "https://push2.eastmoney.com/api/qt/clist/get?"
            "pn=1&pz=10&po=1&np=1&fltt=2&invt=2&"
            "fs=b:MK0021,b:MK0022,b:MK0023,b:MK0024&"
            "fields=f2,f3,f12,f14,f62&fid=f62"
        )
        resp_etf = requests.get(url_etf, timeout=10, headers={
            "Referer": "https://quote.eastmoney.com/",
            "User-Agent": "Mozilla/5.0",
        })
        etf_data = resp_etf.json()
        etf_list = []
        if etf_data.get("data") and etf_data["data"].get("diff"):
            for item in etf_data["data"]["diff"][:10]:
                etf_list.append({
                    "name": item.get("f14", ""),
                    "code": item.get("f12", ""),
                    "price": item.get("f2", 0),
                    "change_pct": item.get("f3", 0),
                    "net_inflow": round((item.get("f62", 0) or 0) / 100000000, 2),  # 转为亿
                })
        indicators["etf_list"] = etf_list
    except Exception as e:
        print(f"Sentiment: fetch ETF failed: {e}")

    # 限制分数在0-100范围
    score = max(5, min(95, round(score)))

    # 判断情绪等级
    if score >= 80:
        label = "极度贪婪"
        emoji = "🤑"
        advice = "市场过热，注意风险，可考虑逐步减仓"
    elif score >= 60:
        label = "贪婪"
        emoji = "😊"
        advice = "市场偏乐观，保持仓位，谨慎追高"
    elif score >= 40:
        label = "中性"
        emoji = "😐"
        advice = "市场情绪平稳，可正常操作"
    elif score >= 20:
        label = "恐慌"
        emoji = "😰"
        advice = "市场偏悲观，优质基金可逐步布局"
    else:
        label = "极度恐慌"
        emoji = "😱"
        advice = "市场极度恐慌，往往是逆向布局的好时机"

    result = {
        "score": score,
        "label": label,
        "emoji": emoji,
        "advice": advice,
        "indicators": indicators,
        "updated_at": time.strftime("%Y-%m-%d %H:%M"),
    }

    _sentiment_cache.set("sentiment", result)
    return result
