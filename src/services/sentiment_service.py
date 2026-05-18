"""
市场情绪监控服务 — 恐慌/贪婪指数、资金流向、ETF排行、涨跌停列表

创新点：
1. 恐慌/贪婪指数：基于涨跌家数、成交量、新高新低、涨跌停等多维指标计算
2. 北向资金流向：从东方财富接口获取当日北向资金净买入
3. ETF资金流入排行：获取ETF份额变化，判断资金流向
4. 涨跌停个股列表：获取当日涨停/跌停股票详情（用于点击反查基金）

数据源：
- 东方财富：涨跌家数、ETF排行、北向资金、涨跌停列表
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


def get_limit_stocks(direction: str = "up") -> list:
    """
    获取涨停/跌停个股完整列表。

    通过东方财富行情接口获取全市场个股，按涨跌幅排序后筛选涨跌停。

    Args:
        direction: "up"=涨停股, "down"=跌停股

    Returns:
        list: [{code, name, price, change_pct}]
    """
    cache_key = f"limit_stocks_{direction}"
    cached = _sentiment_cache.get(cache_key, SENTIMENT_TTL)
    if cached is not None:
        return cached

    stocks = []
    try:
        limiter.acquire("eastmoney")
        # 涨停：按涨幅降序取top50；跌停：按涨幅升序取top50
        po = 1 if direction == "up" else 0
        url = (
            f"https://push2.eastmoney.com/api/qt/clist/get?"
            f"pn=1&pz=50&po={po}&np=1&fltt=2&invt=2&"
            f"fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&"
            f"fields=f2,f3,f12,f14,f100&fid=f3"
        )
        resp = requests.get(url, timeout=10, headers={
            "Referer": "https://quote.eastmoney.com/",
            "User-Agent": "Mozilla/5.0",
        })
        data = resp.json()
        if data.get("data") and data["data"].get("diff"):
            for item in data["data"]["diff"]:
                change_pct = item.get("f3", 0) or 0
                # 涨停筛选：普通股>=9.5%，兼容ST(>=4.5%)
                if direction == "up" and change_pct < 4.5:
                    continue
                # 跌停筛选：普通股<=-9.5%，兼容ST(<=-4.5%)
                if direction == "down" and change_pct > -4.5:
                    break  # 已按升序排列，后续不可能更小
                stocks.append({
                    "code": str(item.get("f12", "")),
                    "name": item.get("f14", ""),
                    "price": item.get("f2", 0),
                    "change_pct": round(change_pct, 2),
                    "industry": item.get("f100", ""),
                })
    except Exception as e:
        print(f"Sentiment: fetch limit stocks failed: {e}")

    _sentiment_cache.set(cache_key, stocks)
    return stocks


def get_volume_trend() -> list:
    """
    获取近5个交易日沪深两市总成交额。

    数据源：东方财富上证指数日K线接口（取近5日成交额）

    Returns:
        list: [{date, amount(亿元)}]
    """
    cached = _sentiment_cache.get("volume_trend", SENTIMENT_TTL)
    if cached is not None:
        return cached

    trend = []
    try:
        limiter.acquire("eastmoney")
        url = (
            "https://push2his.eastmoney.com/api/qt/stock/kline/get?"
            "secid=1.000001&fields1=f1,f2,f3,f4,f5,f6&"
            "fields2=f51,f52,f53,f54,f55,f56,f57&"
            "klt=101&fqt=1&lmt=5&end=20500101"
        )
        resp = requests.get(url, timeout=10, headers={
            "Referer": "https://quote.eastmoney.com/",
            "User-Agent": "Mozilla/5.0",
        })
        data = resp.json()
        if data.get("data") and data["data"].get("klines"):
            for line in data["data"]["klines"]:
                parts = line.split(",")
                if len(parts) >= 7:
                    trend.append({
                        "date": parts[0],
                        "amount": round(float(parts[6]) / 100000000, 2) if parts[6] else 0,
                    })
    except Exception as e:
        print(f"Sentiment: fetch volume trend failed: {e}")

    _sentiment_cache.set("volume_trend", trend)
    return trend


def get_market_sentiment() -> dict:
    """
    计算恐慌/贪婪指数（0-100，越低越恐慌）。

    指标构成：
    1. 涨跌比（权重25%）：上涨家数/下跌家数
    2. 涨停/跌停比（权重15%）：涨停家数/跌停家数
    3. 成交量情绪（权重20%）：今日成交量 vs 5日平均
    4. 均线情绪（权重20%）：站上5日线个股比例
    5. 新高新低比（权重20%）：60日新高 vs 新低

    扩展指标：赚钱效应、板块涨跌统计、成交量情绪
    """
    cached = _sentiment_cache.get("sentiment", SENTIMENT_TTL)
    if cached is not None:
        return cached

    indicators = {}
    score = 50  # 基线50（中性）
    limit_up_stocks = []
    limit_down_stocks = []

    headers_em = {
        "Referer": "https://quote.eastmoney.com/",
        "User-Agent": "Mozilla/5.0",
    }

    # --- 1. 获取涨跌家数（个股列表接口） ---
    try:
        limiter.acquire("eastmoney")
        url = (
            "https://push2.eastmoney.com/api/qt/clist/get?"
            "pn=1&pz=1&po=1&np=1&fltt=2&invt=2&"
            "fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&"
            "fields=f104,f105,f106"
        )
        resp = requests.get(url, timeout=10, headers=headers_em)
        data = resp.json()
        if data.get("data"):
            up = data["data"].get("f104", 0) or 0
            down = data["data"].get("f105", 0) or 0
            flat = data["data"].get("f106", 0) or 0
            total = up + down + flat
            if total > 0:
                up_ratio = up / total * 100
                indicators["涨跌比"] = {"value": f"{up}涨/{down}跌", "ratio": round(up_ratio, 1)}
                score += (up_ratio - 50) * 0.25
    except Exception as e:
        print(f"Sentiment: fetch market adv/dec failed: {e}")

    # --- 1b. 获取市场总成交额（沪深指数） ---
    try:
        limiter.acquire("eastmoney")
        url_vol = (
            "https://push2.eastmoney.com/api/qt/ulist.np/get?"
            "fields=f6,f14&"
            "secids=1.000001,0.399001"
        )
        resp_vol = requests.get(url_vol, timeout=10, headers=headers_em)
        vol_data = resp_vol.json()
        amount = 0
        if vol_data.get("data") and vol_data["data"].get("diff"):
            for idx in vol_data["data"]["diff"]:
                amount += (idx.get("f6", 0) or 0)
        if amount > 0:
            amount_yi = round(amount / 100000000, 2)
            # 获取5日平均成交额
            vol_trend = get_volume_trend()
            avg_amount = 0
            if vol_trend:
                avg_amount = round(sum(d["amount"] for d in vol_trend) / len(vol_trend), 2)
            indicators["成交量"] = {
                "value": f"{amount_yi:.0f}亿",
                "amount": amount_yi,
                "avg_amount": avg_amount,
                "trend": vol_trend,
            }
    except Exception as e:
        print(f"Sentiment: fetch market volume failed: {e}")

    # --- 2. 获取涨跌停个股列表 ---
    limit_up_stocks = get_limit_stocks("up")
    limit_down_stocks = get_limit_stocks("down")
    limit_up = len(limit_up_stocks)
    limit_down = len(limit_down_stocks)
    # 涨停股行业分组统计（全部行业）
    up_industry_stats = {}
    for s in (limit_up_stocks or []):
        ind_name = s.get("industry", "")
        if ind_name:
            up_industry_stats[ind_name] = up_industry_stats.get(ind_name, 0) + 1
    up_industries = sorted(up_industry_stats.items(), key=lambda x: -x[1])

    # 跌停股行业分组统计（全部行业）
    down_industry_stats = {}
    for s in (limit_down_stocks or []):
        ind_name = s.get("industry", "")
        if ind_name:
            down_industry_stats[ind_name] = down_industry_stats.get(ind_name, 0) + 1
    down_industries = sorted(down_industry_stats.items(), key=lambda x: -x[1])

    indicators["涨跌停"] = {
        "value": f"涨停{limit_up}/跌停{limit_down}",
        "limit_up_count": limit_up,
        "limit_down_count": limit_down,
        "industry_stats": [{"name": k, "count": v} for k, v in up_industries],
        "down_industry_stats": [{"name": k, "count": v} for k, v in down_industries],
    }
    if limit_up + limit_down > 0:
        limit_ratio = limit_up / (limit_up + limit_down) * 100
        score += (limit_ratio - 50) * 0.15

    # --- 3. 赚钱效应指标 ---
    if limit_up_stocks:
        avg_up = sum(s["change_pct"] for s in limit_up_stocks) / len(limit_up_stocks)
    else:
        avg_up = 0
    if limit_down_stocks:
        avg_down = sum(s["change_pct"] for s in limit_down_stocks) / len(limit_down_stocks)
    else:
        avg_down = 0
    indicators["赚钱效应"] = {
        "value": f"涨停均涨{avg_up:.1f}%/跌停均跌{avg_down:.1f}%",
        "avg_up": round(avg_up, 2),
        "avg_down": round(avg_down, 2),
    }
    if limit_up > limit_down and avg_up > 8:
        score += 3
    elif limit_down > limit_up and avg_down < -8:
        score -= 3

    # --- 4. 北向资金 ---
    try:
        limiter.acquire("eastmoney")
        url_north = (
            "https://push2.eastmoney.com/api/qt/kamt.rtmin/get?"
            "fields1=f1,f2,f3,f4&fields2=f51,f54,f52,f58,f53,f62,f56,f57,f60,f61"
        )
        resp_north = requests.get(url_north, timeout=10, headers=headers_em)
        north_data = resp_north.json()
        if north_data.get("data"):
            s2n = north_data["data"].get("s2n", [])
            if s2n:
                latest = s2n[-1] if isinstance(s2n, list) else None
                if latest and isinstance(latest, list) and len(latest) >= 4:
                    total_north = latest[3] if latest[3] != "-" else 0
                    try:
                        total_val = float(total_north) / 10000  # 万→亿
                        indicators["北向资金"] = {"value": f"{total_val:+.2f}亿", "amount": total_val}
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

    # --- 5. 板块涨跌统计 ---
    try:
        from services.market_service import get_hot_sectors
        sectors = get_hot_sectors()
        if sectors:
            sec_up = sum(1 for s in sectors if s.get("change_pct", 0) > 0)
            sec_down = sum(1 for s in sectors if s.get("change_pct", 0) < 0)
            sec_flat = len(sectors) - sec_up - sec_down
            indicators["板块涨跌"] = {
                "value": f"{sec_up}涨/{sec_down}跌/{sec_flat}平",
                "up_count": sec_up,
                "down_count": sec_down,
                "flat_count": sec_flat,
            }
    except Exception as e:
        print(f"Sentiment: fetch sectors stat failed: {e}")

    # --- 6. ETF资金流入排行 ---
    try:
        limiter.acquire("eastmoney")
        url_etf = (
            "https://push2.eastmoney.com/api/qt/clist/get?"
            "pn=1&pz=10&po=1&np=1&fltt=2&invt=2&"
            "fs=b:MK0021,b:MK0022,b:MK0023,b:MK0024&"
            "fields=f2,f3,f12,f14,f62&fid=f62"
        )
        resp_etf = requests.get(url_etf, timeout=10, headers=headers_em)
        etf_data = resp_etf.json()
        etf_list = []
        if etf_data.get("data") and etf_data["data"].get("diff"):
            for item in etf_data["data"]["diff"][:10]:
                etf_list.append({
                    "name": item.get("f14", ""),
                    "code": item.get("f12", ""),
                    "price": item.get("f2", 0),
                    "change_pct": item.get("f3", 0),
                    "net_inflow": round((item.get("f62", 0) or 0) / 100000000, 2),
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

    if len(indicators) >= 4:
        _sentiment_cache.set("sentiment", result)
    return result


def get_etf_consecutive_flow(days: int = 7) -> dict:
    """
    获取ETF持续流入/流出天数排行。

    Args:
        days: 筛选连续流入/流出的最少天数，可选 1/3/7/15/30

    Returns:
        dict: {"days": days, "inflow": [{code, name, consecutive_days, total_flow}], "outflow": [...]}
    """
    allowed_days = (1, 3, 7, 15, 30)
    if days not in allowed_days:
        days = 7

    cache_key = f"etf_consecutive_v6_{days}"
    cached = _sentiment_cache.get(cache_key, 300)
    if cached is not None:
        return cached

    candidate_cache_key = "etf_consecutive_candidates_v1"
    cached_candidates = _sentiment_cache.get(candidate_cache_key, 300)

    headers_em = {
        "Referer": "https://quote.eastmoney.com/",
        "User-Agent": "Mozilla/5.0",
    }

    fallback_etfs = (
        ("1.510300"), ("1.510500"), ("1.512100"), ("1.510050"), ("1.588000"),
        ("0.159915"), ("0.159919"), ("0.159922"), ("0.159845"), ("1.512880"),
        ("1.512480"), ("1.515790"), ("1.512760"), ("1.512690"), ("1.512170"),
        ("1.515030"), ("1.512660"), ("0.159928"),
    )

    etf_list = cached_candidates or []
    if not etf_list:
        seen_codes = set()
        list_sources = [
            {"fid": "f62", "fields": "f2,f3,f12,f13,f14,f62"},
            {"fid": "f184", "fields": "f2,f3,f12,f13,f14,f62,f184"},
        ]

        for source in list_sources:
            for po in (1, 0):
                try:
                    limiter.acquire("eastmoney", timeout=2)
                    url_etf = (
                        f"https://push2.eastmoney.com/api/qt/clist/get?"
                        f"pn=1&pz=20&po={po}&np=1&fltt=2&invt=2&"
                        f"fs=b:MK0021,b:MK0022,b:MK0023,b:MK0024&"
                        f"fields={source['fields']}&fid={source['fid']}"
                    )
                    resp = requests.get(url_etf, timeout=5, headers=headers_em)
                    etf_data = resp.json()
                    diff = etf_data.get("data", {}).get("diff") if etf_data.get("data") else None
                    if not diff:
                        continue
                    for item in diff:
                        code = str(item.get("f12", ""))
                        if not code or code in seen_codes:
                            continue
                        current_flow = item.get("f62", 0) or 0
                        if current_flow == 0:
                            continue
                        seen_codes.add(code)
                        etf_list.append({
                            "code": code,
                            "name": item.get("f14", ""),
                            "market": item.get("f13", 1),
                            "current_flow": current_flow,
                        })
                except Exception as e:
                    print(f"Sentiment: fetch ETF list for consecutive failed: {e}")

        if etf_list:
            _sentiment_cache.set(candidate_cache_key, etf_list)
        else:
            raw_candidates = _sentiment_cache.get_raw().get(candidate_cache_key)
            if raw_candidates:
                etf_list = raw_candidates["data"]
            else:
                try:
                    limiter.acquire("eastmoney", timeout=2)
                    resp = requests.get(
                        "https://push2.eastmoney.com/api/qt/ulist.np/get",
                        timeout=5,
                        headers=headers_em,
                        params={
                            "secids": ",".join(fallback_etfs),
                            "fields": "f2,f3,f12,f13,f14,f62,f184",
                        },
                    )
                    batch_data = resp.json()
                    diff = batch_data.get("data", {}).get("diff") if batch_data.get("data") else None
                    if diff:
                        for item in diff:
                            current_flow = item.get("f62", 0) or 0
                            if current_flow == 0:
                                continue
                            etf_list.append({
                                "code": str(item.get("f12", "")),
                                "name": item.get("f14", ""),
                                "market": item.get("f13", 1),
                                "current_flow": current_flow,
                            })
                        if etf_list:
                            _sentiment_cache.set(candidate_cache_key, etf_list)
                except Exception as e:
                    print(f"Sentiment: fetch ETF fallback batch failed: {e}")

                if not etf_list:
                    return {"days": days, "inflow": [], "outflow": []}

    if not etf_list:
        return {"days": days, "inflow": [], "outflow": []}

    entries = {}
    for etf in etf_list:
        current_flow = etf.get("current_flow", 0) or 0
        if current_flow:
            direction = "in" if current_flow > 0 else "out"
            entries[etf["code"]] = {
                "code": etf["code"],
                "name": etf["name"],
                "consecutive_days": 1,
                "direction": direction,
                "total_flow": round(current_flow / 100000000, 2),
            }

    candidate_limit = 24 if days >= 15 else 18
    candidates = sorted(etf_list, key=lambda e: abs(e["current_flow"]), reverse=True)[:candidate_limit]
    if days == 1:
        history_hosts = (
            "https://push2.eastmoney.com/api/qt/stock/fflow/kline/get",
            "https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get",
        )
    else:
        history_hosts = (
            "https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get",
            "http://push2his.eastmoney.com/api/qt/stock/fflow/kline/get",
        )
    lmt = max(30, days)
    history_deadline = time.time() + (16 if days >= 15 else 12)
    history_error_count = 0

    for idx, etf in enumerate(candidates):
        if time.time() >= history_deadline:
            break
        secid = f"{etf['market']}.{etf['code']}"
        url_flow = history_hosts[idx % len(history_hosts)]
        history_data = None
        try:
            limiter.acquire("eastmoney", timeout=2)
            resp = requests.get(
                url_flow,
                timeout=2,
                headers=headers_em,
                params={
                    "secid": secid,
                    "lmt": lmt,
                    "klt": 101,
                    "fields1": "f1,f2,f3,f4,f5",
                    "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
                },
            )
            data = resp.json()
            klines = data.get("data", {}).get("klines") if data.get("data") else None
            if klines and len(klines) >= days:
                history_data = klines
        except Exception as e:
            history_error_count += 1
            print(f"Sentiment: enhance ETF flow for {etf['code']} via {url_flow} failed: {e}")

        if not history_data:
            continue

        consecutive = 0
        direction = None
        total_flow = 0
        for line in reversed(history_data):
            parts = line.split(",")
            if len(parts) < 2:
                break
            try:
                flow = float(parts[1])
            except (ValueError, TypeError):
                break
            if flow == 0:
                break
            day_dir = "in" if flow > 0 else "out"
            if direction is None:
                direction = day_dir
                consecutive = 1
                total_flow = flow
            elif day_dir == direction:
                consecutive += 1
                total_flow += flow
            else:
                break

        if consecutive >= 1 and direction:
            entries[etf["code"]] = {
                "code": etf["code"],
                "name": etf["name"],
                "consecutive_days": consecutive,
                "direction": direction,
                "total_flow": round(total_flow / 100000000, 2),
            }

    filtered = [e for e in entries.values() if e["consecutive_days"] >= days]
    inflow_list = [e for e in filtered if e["direction"] == "in"]
    outflow_list = [e for e in filtered if e["direction"] == "out"]
    inflow_list.sort(key=lambda x: (-x["consecutive_days"], -abs(x["total_flow"])))
    outflow_list.sort(key=lambda x: (-x["consecutive_days"], -abs(x["total_flow"])))

    result = {"days": days, "inflow": inflow_list[:10], "outflow": outflow_list[:10]}
    if result["inflow"] or result["outflow"] or history_error_count < len(candidates):
        _sentiment_cache.set(cache_key, result)
    return result
