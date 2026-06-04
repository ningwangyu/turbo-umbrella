from .common import *
from .common import _sentiment_cache
from requests import RequestException

from .limits import get_limit_stocks, get_limit_summary
from .volume import get_volume_trend

_EASTMONEY_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Connection": "close",
    "Referer": "https://quote.eastmoney.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}


def _request_eastmoney_json(url: str, timeout: int = 10) -> dict:
    last_error = None
    candidate_urls = [url]
    if url.startswith("https://push2.eastmoney.com/"):
        candidate_urls.append(url.replace("https://push2.eastmoney.com/", "http://push2.eastmoney.com/", 1))
    for candidate_url in candidate_urls:
        for attempt in range(2):
            try:
                resp = requests.get(candidate_url, timeout=timeout, headers=_EASTMONEY_HEADERS)
                resp.raise_for_status()
                resp.encoding = "utf-8"
                return resp.json()
            except (RequestException, ValueError) as exc:
                last_error = exc
                if attempt == 0:
                    time.sleep(0.5)
    raise RuntimeError(f"东方财富数据请求失败：{last_error}")


def _safe_int(value) -> int:
    try:
        if value in (None, "", "-"):
            return 0
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _first_market_counts(data: dict) -> tuple[int, int, int]:
    payload = data.get("data") if isinstance(data, dict) else None
    if not isinstance(payload, dict):
        return 0, 0, 0
    diff = payload.get("diff")
    if isinstance(diff, list) and diff:
        up = sum(_safe_int(item.get("f104")) for item in diff if isinstance(item, dict))
        down = sum(_safe_int(item.get("f105")) for item in diff if isinstance(item, dict))
        flat = sum(_safe_int(item.get("f106")) for item in diff if isinstance(item, dict))
        return up, down, flat
    return _safe_int(payload.get("f104")), _safe_int(payload.get("f105")), _safe_int(payload.get("f106"))


def _fetch_market_counts(primary_url: str) -> tuple[int, int, int]:
    fallback_url = (
        "https://push2.eastmoney.com/api/qt/ulist.np/get?"
        "secids=1.000001,0.399001,0.399006&fltt=2&invt=2&fields=f12,f14,f104,f105,f106"
    )
    try:
        counts = _first_market_counts(_request_eastmoney_json(primary_url))
        if sum(counts) > 0:
            return counts
        print("Sentiment: market adv/dec primary returned empty counts, fallback to indices")
    except Exception as exc:
        print(f"Sentiment: fetch market adv/dec primary failed, fallback to indices: {exc}")
    return _first_market_counts(_request_eastmoney_json(fallback_url))


def _latest_north_flow(lines) -> float | None:
    if not isinstance(lines, list):
        return None
    for line in reversed(lines):
        parts = str(line).split(",")
        if len(parts) < 2:
            continue
        try:
            flow = float(parts[1])
        except (TypeError, ValueError):
            continue
        if flow != 0:
            return flow
    return None


def _northbound_summary_amount(data: dict) -> tuple[float | None, float | None]:
    if not isinstance(data, dict):
        return None, None
    northbound = [item for key, item in data.items() if key in ("hk2sh", "hk2sz") and isinstance(item, dict)]
    net_values = [_to_float(item.get("netBuyAmt")) for item in northbound if _to_float(item.get("netBuyAmt")) != 0]
    turnover_values = [_to_float(item.get("buySellAmt")) for item in northbound if _to_float(item.get("buySellAmt")) != 0]
    net_amount = round(sum(net_values) / 10000, 2) if net_values else None
    turnover_amount = round(sum(turnover_values) / 10000, 2) if turnover_values else None
    return net_amount, turnover_amount


def _is_nonzero_number(value) -> bool:
    try:
        return float(value) != 0
    except (TypeError, ValueError):
        return False


def _to_float(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0


def _normalize_etf_item(item: dict) -> dict:
    return {
        "name": item.get("f14") or item.get("name") or "",
        "code": str(item.get("f12") or item.get("code") or ""),
        "price": _to_float(item.get("f2") if item.get("f2") is not None else item.get("price")),
        "change_pct": _to_float(item.get("f3") if item.get("f3") is not None else item.get("change_pct")),
        "net_inflow": round(_to_float(item.get("f62") if item.get("f62") is not None else item.get("current_flow")) / 100000000, 2),
    }


def _fetch_daily_etf_list(url_etf: str) -> list[dict]:
    try:
        etf_data = _request_eastmoney_json(url_etf)
        diff = etf_data.get("data", {}).get("diff") if etf_data.get("data") else None
        etf_list = [_normalize_etf_item(item) for item in (diff or [])[:10]]
        if etf_list:
            return etf_list
    except Exception as exc:
        print(f"Sentiment: fetch ETF daily list failed, fallback to batch: {exc}")

    from .etf import _fetch_fallback_candidates
    return [_normalize_etf_item(item) for item in _fetch_fallback_candidates()[:10]]

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
        up, down, flat = _fetch_market_counts(url)
        total = up + down + flat
        if total > 0:
            up_ratio = up / total * 100
            indicators["涨跌比"] = {
                "value": f"{up}涨/{down}跌",
                "up_count": up,
                "down_count": down,
                "flat_count": flat,
                "total_count": total,
                "ratio": round(up_ratio, 1),
                "up_ratio": round(up_ratio, 1),
                "down_ratio": round(down / total * 100, 1),
            }
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

    # --- 2. 获取涨跌停个股列表（数据库半小时刷新，接口只读库） ---
    limit_summary = get_limit_summary()
    limit_up_stocks = get_limit_stocks("up")
    limit_down_stocks = get_limit_stocks("down")
    summary_limit_up = limit_summary.get("limit_up_count")
    summary_limit_down = limit_summary.get("limit_down_count")
    limit_up = summary_limit_up if summary_limit_up is not None else len(limit_up_stocks)
    limit_down = summary_limit_down if summary_limit_down is not None else len(limit_down_stocks)
    indicators["涨跌停"] = {
        "value": f"涨停{limit_up}/跌停{limit_down}",
        "limit_up_count": limit_up,
        "limit_down_count": limit_down,
        "industry_stats": limit_summary.get("industry_stats", []),
        "down_industry_stats": limit_summary.get("down_industry_stats", []),
        "trade_date": limit_summary.get("trade_date"),
        "updated_at": limit_summary.get("updated_at"),
        "data_source": "database",
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
    indicators["北向资金"] = {"value": "暂无数据", "amount": None, "status": "empty"}
    try:
        limiter.acquire("eastmoney")
        url_north = (
            "https://push2.eastmoney.com/api/qt/kamt.rtmin/get?"
            "fields1=f1,f2,f3,f4&fields2=f51,f54,f52,f58,f53,f62,f56,f57,f60,f61"
        )
        north_data = _request_eastmoney_json(url_north)
        if north_data.get("data"):
            s2n_val = _latest_north_flow(north_data["data"].get("s2n"))
            n2s_val = _latest_north_flow(north_data["data"].get("n2s"))
            values = [v for v in (s2n_val, n2s_val) if v is not None]
            if values:
                total_val = round(sum(values) / 10000, 2)
                indicators["北向资金"] = {
                    "value": f"{total_val:+.2f}亿",
                    "amount": total_val,
                    "source": "eastmoney_rtmin",
                    "status": "ok",
                }
            else:
                limiter.acquire("eastmoney")
                url_north_summary = (
                    "https://push2.eastmoney.com/api/qt/kamt/get?"
                    "fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63"
                )
                north_summary = _request_eastmoney_json(url_north_summary)
                net_amount, turnover_amount = _northbound_summary_amount(north_summary.get("data"))
                if net_amount is not None:
                    total_val = net_amount
                    indicators["北向资金"] = {
                        "value": f"{total_val:+.2f}亿",
                        "amount": total_val,
                        "turnover": turnover_amount,
                        "source": "eastmoney_summary",
                        "status": "ok",
                    }
                elif turnover_amount is not None:
                    indicators["北向资金"] = {
                        "value": f"成交{turnover_amount:.2f}亿",
                        "amount": None,
                        "turnover": turnover_amount,
                        "source": "eastmoney_summary",
                        "status": "turnover_only",
                    }
                else:
                    indicators["北向资金"] = {
                        "value": "暂无净流入",
                        "amount": None,
                        "source": "eastmoney",
                        "status": "unavailable",
                    }
            north_amount = indicators["北向资金"].get("amount")
            if north_amount is not None:
                if north_amount > 50:
                    score += 8
                elif north_amount > 0:
                    score += 3
                elif north_amount < -50:
                    score -= 8
                elif north_amount < 0:
                    score -= 3
    except Exception as e:
        print(f"Sentiment: fetch north capital failed: {e}")
        indicators["北向资金"] = {"value": "暂无数据", "amount": None, "status": "error", "error": str(e)}

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
        etf_list = _fetch_daily_etf_list(url_etf)
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
