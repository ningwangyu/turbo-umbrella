from datetime import date, datetime
import time

from requests import RequestException

from .common import *
from .common import _sentiment_cache
from .limit_store import (
    get_limit_refresh_state,
    mark_limit_refresh_attempt,
    query_limit_stocks,
    query_limit_summary,
    replace_limit_stocks,
)


_LIMIT_PAGE_SIZE = 200
_LIMIT_MAX_PAGES = 15
_LIMIT_POOL_PAGE_SIZE = 200
_MIN_LIMIT_PCT = 4.5
_LIMIT_FETCH_RETRIES = 3
_LIMIT_FETCH_RETRY_DELAY = 0.8
_LIMIT_POOL_UT = "7eea3edcaed734bea9cbfc24409ed989"
_LIMIT_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Connection": "close",
    "Referer": "https://quote.eastmoney.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}


def get_limit_stocks(direction: str = "up") -> list:
    """
    从本地数据库读取涨停/跌停个股完整列表。

    前端与市场情绪接口不再实时请求东方财富，避免高频访问触发外部限流。
    外部数据只由 refresh_limit_stocks() 定时写入数据库。
    """
    if direction not in ("up", "down"):
        direction = "up"
    return query_limit_stocks(direction)


def get_limit_summary() -> dict:
    """从本地数据库聚合涨跌停数量、行业分布和刷新状态。"""
    return query_limit_summary()


def refresh_limit_stocks(trade_date: date | None = None) -> dict:
    """刷新涨跌停数据到本地数据库。供后台半小时任务或手动刷新接口调用。"""
    mark_limit_refresh_attempt()
    try:
        up_stocks = fetch_limit_stocks_from_eastmoney("up")
        down_stocks = fetch_limit_stocks_from_eastmoney("down")
        target_date = trade_date or _extract_limit_trade_date(up_stocks, down_stocks) or date.today()
        result = replace_limit_stocks(target_date, up_stocks, down_stocks)
        _sentiment_cache.clear()
        return result
    except Exception as exc:
        mark_limit_refresh_attempt(str(exc))
        raise


def fetch_limit_stocks_from_eastmoney(direction: str = "up") -> list:
    """
    从东方财富采集涨停/跌停个股完整列表。

    该函数只应由刷新任务调用，普通读取接口应使用 get_limit_stocks()。
    优先使用东方财富涨跌停池接口；若接口异常则回退到行情列表分页筛选。
    """
    if direction not in ("up", "down"):
        direction = "up"
    try:
        return _fetch_limit_pool_from_eastmoney(direction)
    except Exception:
        return _fetch_limit_clist_from_eastmoney(direction)


def _fetch_limit_clist_from_eastmoney(direction: str = "up") -> list:
    """从普通行情列表分页采集并按涨跌停阈值过滤。"""
    stocks = []
    po = 1 if direction == "up" else 0
    should_stop = False
    for page in range(1, _LIMIT_MAX_PAGES + 1):
        limiter.acquire("eastmoney")
        url = (
            f"https://push2.eastmoney.com/api/qt/clist/get?"
            f"pn={page}&pz={_LIMIT_PAGE_SIZE}&po={po}&np=1&fltt=2&invt=2&"
            f"fs=m:0+t:6,m:0+t:80,m:0+t:81,m:1+t:2,m:1+t:23&"
            f"fields=f2,f3,f12,f14,f100&fid=f3"
        )
        data = _request_limit_page(url)
        rows = data.get("data", {}).get("diff") if data.get("data") else []
        if not rows:
            break

        for item in rows:
            change_pct = item.get("f3", 0) or 0
            if direction == "up" and change_pct < _MIN_LIMIT_PCT:
                should_stop = True
                break
            if direction == "down" and change_pct > -_MIN_LIMIT_PCT:
                should_stop = True
                break
            if not _is_limit_stock(item, direction, change_pct):
                continue
            stocks.append({
                "code": str(item.get("f12", "")),
                "name": item.get("f14", ""),
                "price": item.get("f2", 0),
                "change_pct": round(change_pct, 2),
                "industry": item.get("f100", ""),
                "source": "eastmoney",
            })

        if should_stop or len(rows) < _LIMIT_PAGE_SIZE:
            break
    return stocks


def _fetch_limit_pool_from_eastmoney(direction: str) -> list:
    """从东方财富涨停/跌停池接口采集完整列表。"""
    pool_name = "getTopicZTPool" if direction == "up" else "getTopicDTPool"
    sort = "fbt:asc" if direction == "up" else "fund:asc"
    rows = []
    for page_index in range(_LIMIT_MAX_PAGES):
        limiter.acquire("eastmoney")
        url = (
            f"https://push2ex.eastmoney.com/{pool_name}?"
            f"ut={_LIMIT_POOL_UT}&dpt=wz.ztzt&Pageindex={page_index}&"
            f"pagesize={_LIMIT_POOL_PAGE_SIZE}&sort={sort}&date={date.today():%Y%m%d}"
        )
        data = _request_limit_page(url)
        payload = data.get("data") or {}
        pool = payload.get("pool") or []
        for item in pool:
            rows.append({
                "code": str(item.get("c", "")),
                "name": item.get("n", ""),
                "price": _eastmoney_scaled_price(item.get("p")),
                "change_pct": round(item.get("zdp", 0) or 0, 2),
                "industry": item.get("hybk", "") or "-",
                "source": "eastmoney",
                "trade_date": _parse_eastmoney_trade_date(payload.get("qdate")),
            })
        total = payload.get("tc") or len(rows)
        if not pool or len(rows) >= total or len(pool) < _LIMIT_POOL_PAGE_SIZE:
            break
    return rows


def _extract_limit_trade_date(*stock_groups: list[dict]) -> date | None:
    """从采集结果中提取东方财富返回的交易日。"""
    for stocks in stock_groups:
        for stock in stocks:
            trade_date = stock.get("trade_date")
            if isinstance(trade_date, date):
                return trade_date
    return None


def _parse_eastmoney_trade_date(value) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(str(value), "%Y%m%d").date()
    except ValueError:
        return None


def _eastmoney_scaled_price(value) -> float:
    """涨跌停池价格字段为放大1000倍的整数，统一转为元。"""
    try:
        return round(float(value or 0) / 1000, 4)
    except (TypeError, ValueError):
        return 0


def _request_limit_page(url: str) -> dict:
    """请求东方财富分页数据，连接被远端重置时做有限重试。"""
    last_error: Exception | None = None
    candidate_urls = [url]
    if url.startswith("https://push2.eastmoney.com/"):
        candidate_urls.append(url.replace("https://push2.eastmoney.com/", "http://push2.eastmoney.com/", 1))
    if url.startswith("https://push2ex.eastmoney.com/"):
        candidate_urls.append(url.replace("https://push2ex.eastmoney.com/", "http://push2ex.eastmoney.com/", 1))
    for candidate_url in candidate_urls:
        for attempt in range(1, _LIMIT_FETCH_RETRIES + 1):
            try:
                resp = requests.get(candidate_url, timeout=15, headers=_LIMIT_HEADERS)
                resp.raise_for_status()
                resp.encoding = "utf-8"
                return resp.json()
            except (RequestException, ValueError) as exc:
                last_error = exc
                if attempt >= _LIMIT_FETCH_RETRIES:
                    break
                time.sleep(_LIMIT_FETCH_RETRY_DELAY * attempt)
    raise RuntimeError(f"东方财富涨跌停数据请求失败：{last_error}")


def _is_limit_stock(item: dict, direction: str, change_pct: float) -> bool:
    threshold = _limit_threshold(str(item.get("f12", "")), item.get("f14", ""))
    if direction == "up":
        return change_pct >= threshold
    return change_pct <= -threshold


def _limit_threshold(code: str, name: str) -> float:
    if "ST" in (name or "").upper():
        return 4.5
    if code.startswith(("300", "301", "688", "689")):
        return 19.5
    if code.startswith(("83", "87", "88", "92")):
        return 29.5
    return 9.5
