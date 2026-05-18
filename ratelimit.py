"""Rate limiter for external API calls."""
import time
import threading
from functools import wraps
from collections import defaultdict


class RateLimiter:
    """Token bucket rate limiter, thread-safe."""

    def __init__(self):
        self._buckets = defaultdict(lambda: {"tokens": 0, "last_refill": 0})
        self._lock = threading.Lock()

    def configure(self, key: str, rate_per_second: float):
        """Set rate limit for a key."""
        with self._lock:
            bucket = self._buckets[key]
            bucket["tokens"] = rate_per_second  # start full
            bucket["rate"] = rate_per_second
            bucket["last_refill"] = time.monotonic()

    def acquire(self, key: str, timeout: float = 10.0) -> bool:
        """Acquire a token. Blocks until available or timeout."""
        deadline = time.monotonic() + timeout
        while True:
            with self._lock:
                bucket = self._buckets[key]
                now = time.monotonic()
                elapsed = now - bucket["last_refill"]
                bucket["tokens"] = min(
                    bucket.get("rate", 5),
                    bucket["tokens"] + elapsed * bucket.get("rate", 5)
                )
                bucket["last_refill"] = now

                if bucket["tokens"] >= 1:
                    bucket["tokens"] -= 1
                    return True

            if time.monotonic() >= deadline:
                return False
            time.sleep(0.05)  # wait 50ms before retry

    def __call__(self, key: str):
        """Decorator factory for rate-limited functions."""
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                self.acquire(key)
                return func(*args, **kwargs)
            return wrapper
        return decorator


# Global instance
limiter = RateLimiter()
