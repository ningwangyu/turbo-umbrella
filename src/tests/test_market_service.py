import time
import pytest

from cache import sectors_cache, price_cache, metal_trend_cache
from config import PRICE_CACHE_TTL, SECTORS_CACHE_TTL, METAL_TREND_TTL
import services.market_service as market_service
from services.market_service import get_hot_sectors, get_metal_prices, get_metal_trend


@pytest.fixture(autouse=True)
def clear_market_caches():
    sectors_cache.clear()
    price_cache.clear()
    metal_trend_cache.clear()
    yield
    sectors_cache.clear()
    price_cache.clear()
    metal_trend_cache.clear()




def make_row(name, change_pct, leader_name="领涨股"):
    return {
        "f14": name,
        "f3": change_pct,
        "f128": leader_name,
        "f140": "600000",
        "f104": 10,
        "f105": 5,
    }


def expire_cache_entry(cache, key, ttl):
    cache.get_raw()[key]["ts"] -= ttl + 1


def test_hot_sectors_uses_fallback_when_primary_empty(monkeypatch):
    fallback = [{"name": " fallback ", "change_pct": 1.2, "leader_name": "A股", "leader_code": "1", "up_count": 1, "down_count": 0}]

    monkeypatch.setattr("services.market_service.limiter.acquire", lambda key: True)
    monkeypatch.setattr("services.market_service._request_eastmoney_json", lambda url, **kwargs: {"data": {"diff": []}})
    monkeypatch.setattr("services.market_service._fetch_fallback_sectors", lambda: fallback)

    assert get_hot_sectors() == fallback


def test_hot_sectors_returns_stale_cache_when_sources_fail(monkeypatch):
    stale = [{"name": "旧缓存", "change_pct": 0.8, "leader_name": "缓存股", "leader_code": "2", "up_count": 2, "down_count": 1}]
    sectors_cache.set("sectors", stale)

    monkeypatch.setattr("services.market_service.limiter.acquire", lambda key: True)
    monkeypatch.setattr("services.market_service._request_eastmoney_json", lambda url, **kwargs: (_ for _ in ()).throw(RuntimeError("primary failed")))
    monkeypatch.setattr("services.market_service._fetch_fallback_sectors", lambda: (_ for _ in ()).throw(RuntimeError("fallback failed")))

    assert get_hot_sectors() == stale


def test_hot_sectors_returns_static_fallback_when_sources_fail_without_cache(monkeypatch):
    monkeypatch.setattr("services.market_service.limiter.acquire", lambda key: True)
    monkeypatch.setattr("services.market_service._request_eastmoney_json", lambda url, **kwargs: (_ for _ in ()).throw(RuntimeError("primary failed")))
    monkeypatch.setattr("services.market_service._fetch_fallback_sectors", lambda: (_ for _ in ()).throw(RuntimeError("fallback failed")))

    result = get_hot_sectors()

    assert result
    assert result[0] == {
        "name": "贵金属",
        "change_pct": 0,
        "leader_name": "",
        "leader_code": "",
        "up_count": 0,
        "down_count": 0,
    }
    assert sectors_cache.get_raw().get("sectors") is None


def test_hot_sectors_caches_primary_rows(monkeypatch):
    rows = [make_row("半导体", 2.34, "芯片龙头")]

    monkeypatch.setattr("services.market_service.limiter.acquire", lambda key: True)
    monkeypatch.setattr("services.market_service._request_eastmoney_json", lambda url, **kwargs: {"data": {"diff": rows}})

    result = get_hot_sectors()

    assert result == [{
        "name": "半导体",
        "change_pct": 2.34,
        "leader_name": "芯片龙头",
        "leader_code": "600000",
        "up_count": 10,
        "down_count": 5,
    }]


def test_hot_sectors_parses_string_numbers_and_skips_invalid_rows(monkeypatch):
    rows = [
        {"f14": " 半导体 ", "f3": "2.345", "f128": "芯片龙头", "f140": "600000", "f104": "12", "f105": "3"},
        {"f14": "无效板块", "f3": "-"},
        {"f14": "", "f3": "1.1"},
    ]

    monkeypatch.setattr("services.market_service.limiter.acquire", lambda key: True)
    monkeypatch.setattr("services.market_service._request_eastmoney_json", lambda url, **kwargs: {"data": {"diff": rows}})

    assert get_hot_sectors() == [{
        "name": "半导体",
        "change_pct": 2.35,
        "leader_name": "芯片龙头",
        "leader_code": "600000",
        "up_count": 12,
        "down_count": 3,
    }]


    stale = [{"name": "旧板块", "change_pct": 0.8, "leader_name": "缓存股", "leader_code": "2", "up_count": 2, "down_count": 1}]
    sectors_cache.set("sectors", stale)
    expire_cache_entry(sectors_cache, "sectors", SECTORS_CACHE_TTL)
    calls = []

    def fake_refresh(name, func, *args):
        calls.append((name, func, args))

    monkeypatch.setattr(market_service, "_run_background_refresh", fake_refresh)

    assert get_hot_sectors() == stale
    assert calls == [("sectors", market_service._fetch_hot_sectors_sync, ())]


def test_metal_prices_returns_expired_cache_and_refreshes_in_background(monkeypatch):
    stale = {"gold": {"name": "COMEX黄金", "price": 2300, "unit": "美元/盎司", "change": 1, "change_pct": 0.1}, "usdcny": 7.2}
    price_cache.set("metals", stale)
    expire_cache_entry(price_cache, "metals", PRICE_CACHE_TTL)
    calls = []

    def fake_refresh(name, func, *args):
        calls.append((name, func, args))

    monkeypatch.setattr(market_service, "_run_background_refresh", fake_refresh)

    assert get_metal_prices() == stale
    assert calls == [("metal_prices", market_service._fetch_metal_prices_sync, ())]


def test_metal_prices_returns_stale_cache_when_source_fails(monkeypatch):
    stale = {"gold": {"name": "COMEX黄金", "price": 2300, "unit": "美元/盎司", "change": 1, "change_pct": 0.1}, "usdcny": 7.2}
    price_cache.set("metals", stale)
    price_cache.clear()
    price_cache.set("metals", stale)
    monkeypatch.setattr(market_service, "_fetch_metal_prices_sync", lambda: (_ for _ in ()).throw(RuntimeError("sina failed")))
    price_cache.get_raw()["metals"]["ts"] = time.time() - 350  # expired (TTL=60) but within max_stale(600)

    assert get_metal_prices() == stale


def test_metal_trend_filters_invalid_points_and_sorts(monkeypatch):
    kline = [
        {"date": "2026-01-02", "open": 101, "close": 102, "high": 103, "low": 100},
        {"date": "2026-01-01", "open": "100", "close": "101", "high": "102", "low": "99"},
        {"date": "2026-01-03", "open": 0, "close": 104, "high": 105, "low": 103},
        {"date": "", "open": 104, "close": 105, "high": 106, "low": 103},
    ]

    monkeypatch.setattr(market_service, "_fetch_eastmoney_metal_trend", lambda secid, klt, lmt: kline)

    result = get_metal_trend("gold", "1m")

    assert result["trend"] == [
        {"date": "2026-01-01", "open": 100.0, "close": 101.0, "high": 102.0, "low": 99.0},
        {"date": "2026-01-02", "open": 101, "close": 102, "high": 103, "low": 100},
    ]


def test_metal_trend_uses_intraday_fallback_when_kline_fails(monkeypatch):
    fallback = [{"date": "2026-01-01 10:00", "open": 10, "close": 10, "high": 10, "low": 10}]

    monkeypatch.setattr(market_service, "_fetch_eastmoney_metal_trend", lambda secid, klt, lmt: (_ for _ in ()).throw(RuntimeError("kline failed")))
    monkeypatch.setattr(market_service, "_fetch_eastmoney_intraday_metal_trend", lambda secid: fallback)

    result = get_metal_trend("gold", "1m")

    assert result == {"trend": fallback, "metal": "gold", "period": "1m", "unit": "美元/盎司"}


def test_metal_trend_uses_realtime_fallback_when_all_trend_sources_fail(monkeypatch):
    prices = {"gold": {"price": 110, "prev_close": 100}}

    monkeypatch.setattr(market_service, "_fetch_eastmoney_metal_trend", lambda secid, klt, lmt: (_ for _ in ()).throw(RuntimeError("kline failed")))
    monkeypatch.setattr(market_service, "_fetch_eastmoney_intraday_metal_trend", lambda secid: (_ for _ in ()).throw(RuntimeError("intraday failed")))
    monkeypatch.setattr(market_service, "get_metal_prices", lambda: prices)

    result = get_metal_trend("gold", "1m")

    assert len(result["trend"]) == 12
    assert result["trend"][0]["close"] == 100
    assert result["trend"][-1]["close"] == 110


def test_metal_trend_returns_expired_cache_and_refreshes_in_background(monkeypatch):
    stale = {"trend": [{"date": "2026-01-01", "open": 1, "close": 2, "high": 3, "low": 1}], "metal": "gold", "period": "1m", "unit": "美元/盎司"}
    metal_trend_cache.set("gold_1m", stale)
    expire_cache_entry(metal_trend_cache, "gold_1m", METAL_TREND_TTL)
    calls = []

    def fake_refresh(name, func, *args):
        calls.append((name, func, args))

    monkeypatch.setattr(market_service, "_run_background_refresh", fake_refresh)

    assert get_metal_trend("gold", "1m") == stale
    assert calls == [("gold_1m", market_service._fetch_metal_trend_sync, ("gold", "1m"))]


def test_metal_trend_returns_stale_cache_when_source_fails(monkeypatch):
    stale = {"trend": [{"date": "2026-01-01", "open": 1, "close": 2, "high": 3, "low": 1}], "metal": "gold", "period": "1m", "unit": "美元/盎司"}
    metal_trend_cache.set("gold_1m", stale)
    monkeypatch.setattr(market_service, "_fetch_metal_trend_sync", lambda metal, period: (_ for _ in ()).throw(RuntimeError("eastmoney failed")))
    metal_trend_cache.get_raw()["gold_1m"]["ts"] = time.time() - 350  # expired (TTL=300) but within max_stale(900)

    assert get_metal_trend("gold", "1m") == stale
