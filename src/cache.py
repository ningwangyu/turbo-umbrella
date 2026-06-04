"""
TTL缓存机制 — 基于过期时间的内存缓存

每条缓存数据附带写入时间戳(ts)，读取时检查是否超过TTL（生存时间），
超过则视为过期返回None，由调用方决定是否重新获取。

不同的数据类型使用独立的缓存实例，TTL在config.py中统一配置。
"""

import time


class TimedCache:
    """基于TTL的内存缓存，key-value存储，自动过期。"""

    def __init__(self):
        self._store = {}

    def get(self, key: str, ttl: float):
        """获取缓存，超过ttl秒则返回None（视为过期）"""
        entry = self._store.get(key)
        if entry and time.time() - entry["ts"] < ttl:
            return entry["data"]
        return None

    def set(self, key: str, data):
        """写入缓存，附带当前时间戳"""
        self._store[key] = {"data": data, "ts": time.time()}

    def get_raw(self):
        return self._store

    def clear(self):
        self._store.clear()


# 预建缓存实例 — 每类数据独立缓存，避免key冲突
est_cache = TimedCache()          # 基金估值缓存（TTL=30s）
perf_cache = TimedCache()         # 基金业绩走势缓存（TTL=300s）
holdings_cache = TimedCache()     # 重仓股数据缓存（TTL=300s）
price_cache = TimedCache()        # 贵金属价格缓存（TTL=60s）
index_cache = TimedCache()        # 市场指数缓存（TTL=30s）
sectors_cache = TimedCache()      # 热门板块缓存（TTL=120s）
recommend_cache = TimedCache()    # 推荐结果缓存（TTL=600s）
pool_cache = TimedCache()         # 候选基金池缓存（TTL=300s）
metal_trend_cache = TimedCache()  # 贵金属K线走势缓存（TTL=300s）
signal_cache_inst = TimedCache()  # 量化信号缓存（TTL=300s）
stock_fund_cache = TimedCache()   # 股票→基金反查缓存（TTL=300s）

# 驾驶舱 & 风险分析模块缓存实例
dashboard_overview_cache = TimedCache()   # 驾驶舱概览缓存（TTL=60s）
dashboard_forecast_cache = TimedCache()   # 预测数据缓存（TTL=300s）
signal_history_cache = TimedCache()       # 信号历史缓存（TTL=300s）
risk_analysis_cache = TimedCache()        # 风险分析缓存（TTL=300s）
