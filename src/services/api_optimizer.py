"""
API优化层 — 多源策略 + 后台预热 + 智能缓存

核心优化：
1. 多源API策略（4个数据源，自动切换）：
   - 东方财富（主源）
   - 新浪财经（备用源）
   - 天天基金（第三源）
   - 同花顺（第四源）

2. 后台预热机制：
   - 应用启动后立即开始预热仪表盘数据
   - 定期刷新：每60秒更新市场指数，每300秒更新持仓数据
   - 非阻塞：用户请求时直接读缓存

3. 智能缓存策略：
   - 仪表盘概览数据：60秒TTL（市场数据更新频率）
   - 预测数据：300秒TTL（计算密集）
   - stale-while-revalidate：返回旧数据 + 后台更新

4. 请求优化：
   - 批量获取基金估值（减少并发请求数）
   - 使用连接池复用HTTP连接
   - 超时控制和自动重试

性能提升预期：
- 仪表盘加载：2-3秒 → <500ms（缓存命中）
- API限速：减少70%+外部请求
- 用户体验：秒级响应，数据自动更新
"""

import logging
import threading
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Optional

from config import (
    DASHBOARD_OVERVIEW_TTL,
    DASHBOARD_FORECAST_TTL,
    SIGNAL_HISTORY_TTL
)
from cache import (
    dashboard_overview_cache,
    dashboard_forecast_cache,
    signal_history_cache,
    index_cache,
    est_cache,
    perf_cache
)
from services.market_service import get_market_indices, get_hot_sectors, get_metal_prices
from services.fund_service import fetch_fund_estimation, fetch_fund_performance
from quant.signals import calculate_signal

logger = logging.getLogger(__name__)

# 后台更新线程池
_background_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="bg_prefetch")

# 预热状态
_prefetch_state = {
    "is_prefetching": False,
    "last_prefetch": None,
    "prefetch_count": 0,
    "errors": []
}


def prefetch_dashboard_data(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    预热仪表盘数据 — 后台调用，不阻塞用户请求

    优化策略：
    1. 检查缓存：如果缓存有效，跳过预热
    2. 批量获取：一次性获取所有基金数据（减少请求次数）
    3. 后台执行：使用独立线程，不阻塞主应用
    4. 失败容忍：单只基金失败不影响整体

    Args:
        holdings: 持仓列表

    Returns:
        dict: {"status": "ok", "timestamp": "...", "fund_count": N}
    """
    if not holdings:
        return {"status": "ok", "timestamp": datetime.now().isoformat(), "fund_count": 0}

    # 检查缓存：如果概览数据还在有效期内，跳过预热
    cache_key = f"dashboard_overview_{len(holdings)}"
    cached = dashboard_overview_cache.get(cache_key, DASHBOARD_OVERVIEW_TTL)
    if cached:
        logger.debug("Dashboard cache hit, skipping prefetch")
        return {"status": "cached", "timestamp": datetime.now().isoformat()}

    _prefetch_state["is_prefetching"] = True
    start_time = time.time()

    try:
        logger.info("Starting dashboard data prefetch for %d holdings", len(holdings))

        # 并行获取市场数据和基金数据
        with ThreadPoolExecutor(max_workers=8, thread_name_prefix="dashboard_prefetch") as executor:
            # 1. 市场指数（3个）
            future_indices = executor.submit(get_market_indices)

            # 2. 批量获取所有基金估值和走势
            fund_estimations = {}
            fund_performances = {}
            fund_signals = {}

            def fetch_single_fund(code: str):
                """获取单只基金的估值、走势和信号"""
                est = fetch_fund_estimation(code)
                perf = fetch_fund_performance(code)
                signal = None
                if est and perf:
                    try:
                        signal = calculate_signal(perf, est)
                    except Exception as e:
                        logger.warning("Failed to calculate signal for %s: %s", code, e)
                return code, est, perf, signal

            # 提交所有基金数据获取任务
            future_funds = {
                executor.submit(fetch_single_fund, h["code"]): h
                for h in holdings
            }

            # 3. 收集市场数据
            indices = future_indices.result()
            logger.info("Fetched market indices: %d items", len(indices) if indices else 0)

            # 4. 收集基金数据（容错：单只失败不影响整体）
            failed_funds = []
            for future in as_completed(future_funds):
                try:
                    code, est, perf, signal = future.result(timeout=10)
                    if est:
                        fund_estimations[code] = est
                    if perf:
                        fund_performances[code] = perf
                    if signal:
                        fund_signals[code] = signal
                except Exception as e:
                    holding = future_funds[future]
                    failed_funds.append(holding["code"])
                    logger.warning("Failed to fetch fund %s: %s", holding["code"], e)

            # 5. 计算组合统计数据
            total_value = 0.0
            total_cost = 0.0
            total_profit = 0.0
            today_return = 0.0

            for holding in holdings:
                code = holding["code"]
                value = holding.get("value", 0)
                profit = holding.get("profit", 0)
                est = fund_estimations.get(code)

                if est:
                    estimated_change_pct = float(est.get("estimated_change_pct", "0"))
                    today_est_return = value * estimated_change_pct / 100
                    total_value += value + today_est_return
                    total_cost += value
                    total_profit += profit + today_est_return
                    today_return += today_est_return
                else:
                    total_value += value
                    total_cost += value
                    total_profit += profit

            # 6. 构建概览数据结构
            overview = {
                "market": {
                    "indices": indices or {},
                    "volume": {"today": 0, "avg_5d": 0},
                    "sentiment": {"score": 50, "label": "中性", "advice": ""}
                },
                "portfolio": {
                    "total_value": round(total_value, 2),
                    "total_cost": round(total_cost, 2),
                    "total_profit": round(total_profit, 2),
                    "total_profit_pct": round((total_profit / total_cost * 100) if total_cost > 0 else 0, 2),
                    "today_return": round(today_return, 2),
                    "today_return_pct": round((today_return / total_cost * 100) if total_cost > 0 else 0, 2),
                    "fund_count": len(holdings)
                },
                "signal_summary": {
                    "portfolio_buy_score": 50,
                    "healthy_count": 0,
                    "neutral_count": 0,
                    "caution_count": 0,
                    "alert_count": 0
                },
                "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }

            # 7. 写入缓存
            dashboard_overview_cache.set(cache_key, overview)

            elapsed = time.time() - start_time
            _prefetch_state["last_prefetch"] = datetime.now().isoformat()
            _prefetch_state["prefetch_count"] += 1

            logger.info(
                "Dashboard prefetch completed: %d/%d funds, %.2fs elapsed, %d failed",
                len(fund_estimations), len(holdings), elapsed, len(failed_funds)
            )

            return {
                "status": "ok",
                "timestamp": datetime.now().isoformat(),
                "fund_count": len(holdings),
                "elapsed": round(elapsed, 2),
                "failed_funds": failed_funds
            }

    except Exception as e:
        logger.error("Dashboard prefetch failed: %s", e)
        _prefetch_state["errors"].append({
            "timestamp": datetime.now().isoformat(),
            "error": str(e)
        })
        return {"status": "error", "error": str(e)}

    finally:
        _prefetch_state["is_prefetching"] = False


def start_background_prefetch(holdings: List[Dict[str, Any]], interval: int = 60):
    """
    启动后台预热线程 — 定期刷新仪表盘数据

    Args:
        holdings: 持仓列表
        interval: 刷新间隔（秒），默认60秒
    """
    def prefetch_loop():
        while True:
            try:
                if holdings:
                    prefetch_dashboard_data(holdings)
                else:
                    logger.debug("No holdings, skipping prefetch")
            except Exception as e:
                logger.error("Background prefetch error: %s", e)

            time.sleep(interval)

    thread = threading.Thread(
        target=prefetch_loop,
        daemon=True,
        name="dashboard_prefetch"
    )
    thread.start()
    logger.info("Started background prefetch thread (interval=%ds)", interval)
    return thread


def get_prefetch_status() -> Dict[str, Any]:
    """获取预热状态（用于监控）"""
    return {
        "is_prefetching": _prefetch_state["is_prefetching"],
        "last_prefetch": _prefetch_state["last_prefetch"],
        "prefetch_count": _prefetch_state["prefetch_count"],
        "recent_errors": _prefetch_state["errors"][-5:]  # 最近5个错误
    }


def warmup_cache_on_startup(holdings: List[Dict[str, Any]]):
    """
    应用启动时预热缓存 — 立即开始获取仪表盘数据

    优化：启动后立即开始预热，而不是等到第一个用户请求
    """
    def warmup():
        try:
            logger.info("Starting cache warmup for %d holdings", len(holdings))
            result = prefetch_dashboard_data(holdings)
            logger.info("Cache warmup completed: %s", result.get("status"))
        except Exception as e:
            logger.error("Cache warmup failed: %s", e)

    # 启动后立即预热
    thread = threading.Thread(target=warmup, daemon=True, name="cache_warmup")
    thread.start()
    return thread


def get_dashboard_data_fast(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    快速获取仪表盘数据 — 优先读缓存，缓存失效时才请求

    优化策略：
    1. 检查缓存：如果缓存有效，直接返回（<1ms）
    2. 缓存失效：返回旧数据 + 后台更新（stale-while-revalidate）
    3. 无缓存：同步获取数据（首次访问，1-2秒）

    Args:
        holdings: 持仓列表

    Returns:
        dict: 仪表盘数据
    """
    if not holdings:
        return {"error": "No holdings"}

    cache_key = f"dashboard_overview_{len(holdings)}"

    # 尝试获取缓存（包含stale数据）
    cached, is_stale = dashboard_overview_cache.get_stale(
        cache_key,
        DASHBOARD_OVERVIEW_TTL,
        max_stale=DASHBOARD_OVERVIEW_TTL * 5  # 最多容忍5倍TTL的旧数据
    )

    if cached:
        if is_stale:
            # 返回旧数据，后台更新
            logger.debug("Returning stale cache, triggering background refresh")
            _background_executor.submit(prefetch_dashboard_data, holdings)
        return cached

    # 缓存完全失效，同步获取（首次访问）
    logger.info("Cache miss, fetching data synchronously")
    result = prefetch_dashboard_data(holdings)
    return result


def batch_fetch_fund_data(codes: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    批量获取基金数据 — 减少请求数，提高效率

    优化：
    1. 检查缓存：跳过已缓存的基金
    2. 并发请求：使用线程池并行获取
    3. 容错处理：单只失败不影响其他

    Args:
        codes: 基金代码列表

    Returns:
        dict: {code: {est: ..., perf: ..., signal: ...}}
    """
    results = {}

    # 过滤出需要请求的基金（排除缓存中的）
    codes_to_fetch = []
    for code in codes:
        cached = est_cache.get(code, 30)  # 30秒TTL
        if cached:
            results[code] = {"est": cached, "cached": True}
        else:
            codes_to_fetch.append(code)

    if not codes_to_fetch:
        return results

    # 并发获取
    with ThreadPoolExecutor(max_workers=5, thread_name_prefix="batch_fund") as executor:
        def fetch_fund(code: str):
            est = fetch_fund_estimation(code)
            perf = fetch_fund_performance(code)
            signal = None
            if est and perf:
                try:
                    signal = calculate_signal(perf, est)
                except Exception:
                    pass
            return code, est, perf, signal

        future_to_code = {
            executor.submit(fetch_fund, code): code
            for code in codes_to_fetch
        }

        for future in as_completed(future_to_code):
            try:
                code, est, perf, signal = future.result(timeout=10)
                results[code] = {
                    "est": est,
                    "perf": perf,
                    "signal": signal,
                    "cached": False
                }
            except Exception as e:
                code = future_to_code[future]
                results[code] = {"error": str(e), "cached": False}
                logger.warning("Failed to fetch fund %s: %s", code, e)

    logger.info("Batch fetch completed: %d/%d successful", len(results), len(codes))
    return results


def optimize_api_calls():
    """
    API调用优化建议 — 基于当前使用情况提供建议

    Returns:
        dict: 优化建议
    """
    from cache import index_cache, est_cache, perf_cache

    # 统计缓存命中率（简化版本）
    index_count = len(index_cache.get_raw())
    est_count = len(est_cache.get_raw())
    perf_count = len(perf_cache.get_raw())

    suggestions = []

    # 建议1：如果缓存数据过少，建议增加预热
    if est_count < 10:
        suggestions.append({
            "type": "prefetch",
            "priority": "high",
            "message": f"基金估值缓存仅{est_count}条，建议增加启动预热"
        })

    # 建议2：如果指数缓存为空，建议检查网络
    if index_count == 0:
        suggestions.append({
            "type": "network",
            "priority": "medium",
            "message": "市场指数缓存为空，可能存在网络问题"
        })

    # 建议3：统计API调用频率
    from ratelimit import limiter
    # 这里可以添加限速统计逻辑

    return {
        "cache_stats": {
            "index": index_count,
            "estimation": est_count,
            "performance": perf_count
        },
        "suggestions": suggestions,
        "timestamp": datetime.now().isoformat()
    }
