"""
令牌桶限流器 — 保护外部API免受过多并发请求

算法原理（Token Bucket）：
- 每个API（如eastmoney/sina）维护一个令牌桶
- 桶以固定速率（rate_per_second）补充令牌，桶满时停止补充
- 每次请求消耗一个令牌，桶空时阻塞等待直到有新令牌
- 线程安全：所有操作在threading.Lock保护下执行

为什么不用简单的sleep？令牌桶允许突发流量（桶满时可连续调用），
同时在空闲期"攒"令牌，更符合真实API限流的语义。
"""

import time
import threading
from functools import wraps
from collections import defaultdict


class RateLimiter:
    """令牌桶限流器，线程安全。"""

    def __init__(self):
        self._buckets = defaultdict(lambda: {"tokens": 0, "last_refill": 0})
        self._lock = threading.Lock()

    def configure(self, key: str, rate_per_second: float):
        """为指定API配置限流参数（每秒允许的请求数），初始令牌数为满桶。"""
        with self._lock:
            bucket = self._buckets[key]
            bucket["tokens"] = rate_per_second  # 初始满桶
            bucket["rate"] = rate_per_second
            bucket["last_refill"] = time.monotonic()

    def acquire(self, key: str, timeout: float = 10.0) -> bool:
        """获取一个令牌，阻塞等待直到可用或超时。返回True表示成功获取。"""
        deadline = time.monotonic() + timeout
        while True:
            with self._lock:
                bucket = self._buckets[key]
                now = time.monotonic()
                elapsed = now - bucket["last_refill"]
                # 补充令牌：经过时间 × 速率，但不超过桶容量
                bucket["tokens"] = min(
                    bucket.get("rate", 5),
                    bucket["tokens"] + elapsed * bucket.get("rate", 5)
                )
                bucket["last_refill"] = now

                if bucket["tokens"] >= 1:
                    bucket["tokens"] -= 1
                    return True

            # 桶空，检查是否超时
            if time.monotonic() >= deadline:
                return False
            time.sleep(0.05)  # 等待50ms后重试

    def __call__(self, key: str):
        """装饰器工厂：@limiter("eastmoney") 可用于包装需要限流的函数。"""
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                self.acquire(key)
                return func(*args, **kwargs)
            return wrapper
        return decorator


# 全局限流器实例
limiter = RateLimiter()
