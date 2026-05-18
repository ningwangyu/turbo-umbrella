from datetime import date

from .common import *
from .common import _sentiment_cache
from .etf_store import apply_etf_flow_daily, ensure_etf_flow_schema, insert_new_etf_flow_daily, query_etf_consecutive_stats, recalculate_etf_flow_stats


_ALLOWED_DAYS = (1, 3, 7, 15, 30)
_HEADERS_EM = {
    "Referer": "https://quote.eastmoney.com/",
    "User-Agent": "Mozilla/5.0",
}
_FALLBACK_ETFS = (
    "1.510300", "1.510500", "1.512100", "1.510050", "1.588000",
    "0.159915", "0.159919", "0.159922", "0.159845", "1.512880",
    "1.512480", "1.515790", "1.512760", "1.512690", "1.512170",
    "1.515030", "1.512660", "0.159928",
)


def get_etf_consecutive_flow(days: int = 7) -> dict:
    """Read ETF consecutive inflow/outflow ranking from MySQL."""
    if days not in _ALLOWED_DAYS:
        days = 7
    return query_etf_consecutive_stats(days)


def refresh_etf_flow_data(days: int = 30, backfill: bool = False) -> dict:
    """Fetch ETF fund-flow data and incrementally update local consecutive stats."""
    days = max(1, min(int(days or 30), 120))
    ensure_etf_flow_schema()

    etf_list = _fetch_etf_candidates()
    if not etf_list:
        return {
            "candidate_count": 0,
            "daily_rows": 0,
            "inserted_rows": 0,
            "skipped_duplicates": 0,
            "updated_stats": 0,
            "history_failed": 0,
            "latest_trade_date": None,
        }

    daily_rows = []
    history_failed = 0
    if backfill:
        rows, history_failed = _fetch_history_daily_rows(etf_list[:80], days)
        daily_rows.extend(rows)

    if not backfill or not daily_rows:
        for etf in etf_list:
            row = _fallback_daily_row(etf)
            if row:
                daily_rows.append(row)

    insert_result = insert_new_etf_flow_daily(daily_rows)
    stat_result = apply_etf_flow_daily(insert_result["inserted_rows"])
    latest_trade_date = stat_result.get("latest_trade_date")
    return {
        "candidate_count": len(etf_list),
        "daily_rows": len(daily_rows),
        "inserted_rows": insert_result["inserted_count"],
        "skipped_duplicates": insert_result["skipped_count"],
        "updated_stats": stat_result["updated_count"],
        "ignored_old_stats": stat_result["ignored_old_count"],
        "history_failed": history_failed,
        "latest_trade_date": latest_trade_date,
    }


def _fetch_etf_candidates() -> list[dict]:
    cache_key = "etf_consecutive_candidates_v3"
    cached = _sentiment_cache.get(cache_key, 300)
    if cached is not None:
        return cached

    etf_map = {}
    list_sources = [
        {"fid": "f62", "fields": "f2,f3,f12,f13,f14,f62"},
        {"fid": "f184", "fields": "f2,f3,f12,f13,f14,f62,f184"},
    ]

    for source in list_sources:
        for po in (1, 0):
            for page in range(1, 4):
                try:
                    limiter.acquire("eastmoney", timeout=2)
                    url_etf = (
                        "https://push2.eastmoney.com/api/qt/clist/get?"
                        f"pn={page}&pz=100&po={po}&np=1&fltt=2&invt=2&"
                        "fs=b:MK0021,b:MK0022,b:MK0023,b:MK0024&"
                        f"fields={source['fields']}&fid={source['fid']}"
                    )
                    resp = requests.get(url_etf, timeout=4, headers=_HEADERS_EM)
                    etf_data = resp.json()
                    diff = etf_data.get("data", {}).get("diff") if etf_data.get("data") else None
                except Exception as e:
                    print(f"Sentiment: fetch ETF list for refresh failed: {e}")
                    continue

                if not diff:
                    break
                for item in diff:
                    code = str(item.get("f12", ""))
                    if not code:
                        continue
                    current_flow = item.get("f62", 0) or 0
                    if code not in etf_map or abs(current_flow) > abs(etf_map[code].get("current_flow") or 0):
                        etf_map[code] = {
                            "code": code,
                            "name": item.get("f14", ""),
                            "market": item.get("f13", 1),
                            "current_flow": current_flow,
                        }

    etf_list = list(etf_map.values()) or _fetch_fallback_candidates()
    etf_list = sorted(etf_list, key=lambda e: abs(e.get("current_flow") or 0), reverse=True)[:300]
    if etf_list:
        _sentiment_cache.set(cache_key, etf_list)
    return etf_list


def _fetch_fallback_candidates() -> list[dict]:
    try:
        limiter.acquire("eastmoney", timeout=2)
        resp = requests.get(
            "https://push2.eastmoney.com/api/qt/ulist.np/get",
            timeout=5,
            headers=_HEADERS_EM,
            params={
                "secids": ",".join(_FALLBACK_ETFS),
                "fields": "f2,f3,f12,f13,f14,f62,f184",
            },
        )
        batch_data = resp.json()
        diff = batch_data.get("data", {}).get("diff") if batch_data.get("data") else None
    except Exception as e:
        print(f"Sentiment: fetch ETF fallback batch failed: {e}")
        return []

    return [
        {
            "code": str(item.get("f12", "")),
            "name": item.get("f14", ""),
            "market": item.get("f13", 1),
            "current_flow": item.get("f62", 0) or 0,
        }
        for item in diff or []
        if item.get("f12")
    ]


def _fetch_history_daily_rows(etf_list: list[dict], days: int) -> tuple[list[dict], int]:
    rows = []
    failed = 0
    history_hosts = (
        "https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get",
        "http://push2his.eastmoney.com/api/qt/stock/fflow/kline/get",
    )
    deadline = time.time() + 20
    for idx, etf in enumerate(etf_list):
        if time.time() >= deadline:
            failed += len(etf_list) - idx
            break
        secid = f"{etf['market']}.{etf['code']}"
        url_flow = history_hosts[idx % len(history_hosts)]
        try:
            limiter.acquire("eastmoney", timeout=2)
            resp = requests.get(
                url_flow,
                timeout=3,
                headers=_HEADERS_EM,
                params={
                    "secid": secid,
                    "lmt": days,
                    "klt": 101,
                    "fields1": "f1,f2,f3,f4,f5",
                    "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
                },
            )
            data = resp.json()
            klines = data.get("data", {}).get("klines") if data.get("data") else None
        except Exception as e:
            failed += 1
            print(f"Sentiment: backfill ETF flow for {etf['code']} via {url_flow} failed: {e}")
            continue

        for line in klines or []:
            row = _parse_flow_line(line, etf)
            if row:
                rows.append(row)
    return rows, failed

def _parse_flow_line(line: str, etf: dict) -> dict | None:
    parts = str(line).split(",")
    if len(parts) < 2:
        return None
    trade_date = parts[0].strip()
    try:
        net_flow = float(parts[1])
    except (ValueError, TypeError):
        return None

    if net_flow > 0:
        direction = "in"
    elif net_flow < 0:
        direction = "out"
    else:
        direction = "flat"

    return {
        "trade_date": trade_date,
        "code": etf["code"],
        "name": etf.get("name"),
        "market": etf.get("market") or 1,
        "net_flow": net_flow,
        "direction": direction,
        "source": "eastmoney",
    }


def _fallback_daily_row(etf: dict) -> dict | None:
    current_flow = etf.get("current_flow") or 0
    try:
        net_flow = float(current_flow)
    except (ValueError, TypeError):
        return None
    if net_flow == 0:
        return None

    return {
        "trade_date": date.today().isoformat(),
        "code": etf["code"],
        "name": etf.get("name"),
        "market": etf.get("market") or 1,
        "net_flow": net_flow,
        "direction": "in" if net_flow > 0 else "out",
        "source": "eastmoney",
    }
