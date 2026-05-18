"""Background refresh jobs for sentiment data."""

from __future__ import annotations

import logging
import threading
import time

from config import CONFIG, LIMIT_STOCK_REFRESH_INTERVAL
from services.sentiment.limits import refresh_limit_stocks
from services.sentiment.limit_store import mark_limit_refresh_attempt

logger = logging.getLogger(__name__)
_STARTED = False
_STOP_EVENT = threading.Event()


def limit_refresh_interval_seconds() -> int:
    cfg = CONFIG.get("sentiment", {})
    return max(60, int(cfg.get("limit_stocks_refresh_seconds", LIMIT_STOCK_REFRESH_INTERVAL) or LIMIT_STOCK_REFRESH_INTERVAL))


def start_sentiment_background_jobs() -> None:
    """Start one daemon thread that refreshes limit stocks every configured interval."""
    global _STARTED
    if _STARTED:
        return
    _STARTED = True
    thread = threading.Thread(target=_limit_refresh_loop, name="sentiment-limit-refresh", daemon=True)
    thread.start()
    logger.info("Started sentiment background jobs")


def _limit_refresh_loop() -> None:
    interval = limit_refresh_interval_seconds()
    while not _STOP_EVENT.is_set():
        started_at = time.time()
        try:
            result = refresh_limit_stocks()
            logger.info(
                "Refreshed limit stocks: up=%s down=%s trade_date=%s",
                result.get("up_count"),
                result.get("down_count"),
                result.get("trade_date"),
            )
        except Exception as exc:
            logger.warning("Refresh limit stocks failed: %s", exc)
            try:
                mark_limit_refresh_attempt(str(exc))
            except Exception:
                logger.exception("Failed to persist limit refresh error")

        elapsed = time.time() - started_at
        wait_seconds = max(1, interval - elapsed)
        _STOP_EVENT.wait(wait_seconds)
