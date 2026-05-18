"""MySQL-backed storage for market limit-up/limit-down stocks."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from services.holding_store import ensure_schema, get_connection

_SCHEMA_READY = False
_STATE_KEY = "market_limit_stocks"


def ensure_limit_schema() -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return

    ensure_schema()
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS market_limit_stocks (
                    trade_date DATE NOT NULL,
                    code VARCHAR(6) NOT NULL,
                    name VARCHAR(128) NULL,
                    direction ENUM('up','down') NOT NULL,
                    price DECIMAL(18, 4) NULL,
                    change_pct DECIMAL(8, 2) NULL,
                    industry VARCHAR(128) NULL,
                    source VARCHAR(32) NOT NULL DEFAULT 'eastmoney',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (trade_date, code, direction),
                    KEY idx_market_limit_date_direction (trade_date, direction),
                    KEY idx_market_limit_updated_at (updated_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS market_limit_refresh_state (
                    state_key VARCHAR(64) NOT NULL,
                    latest_trade_date DATE NULL,
                    last_success_at DATETIME NULL,
                    last_attempt_at DATETIME NULL,
                    last_error TEXT NULL,
                    updated_count INT NOT NULL DEFAULT 0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (state_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
        conn.commit()
        _SCHEMA_READY = True
    finally:
        conn.close()


def replace_limit_stocks(trade_date: Any, up_stocks: list[dict[str, Any]], down_stocks: list[dict[str, Any]]) -> dict[str, Any]:
    ensure_limit_schema()
    rows = _normalize_rows(trade_date, "up", up_stocks) + _normalize_rows(trade_date, "down", down_stocks)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM market_limit_stocks WHERE trade_date = %s", (trade_date,))
            if rows:
                cursor.executemany(
                    """
                    INSERT INTO market_limit_stocks
                        (trade_date, code, name, direction, price, change_pct, industry, source)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        name = VALUES(name),
                        price = VALUES(price),
                        change_pct = VALUES(change_pct),
                        industry = VALUES(industry),
                        source = VALUES(source)
                    """,
                    rows,
                )
            cursor.execute(
                """
                INSERT INTO market_limit_refresh_state
                    (state_key, latest_trade_date, last_success_at, last_attempt_at, last_error, updated_count)
                VALUES (%s, %s, %s, %s, NULL, %s)
                ON DUPLICATE KEY UPDATE
                    latest_trade_date = VALUES(latest_trade_date),
                    last_success_at = VALUES(last_success_at),
                    last_attempt_at = VALUES(last_attempt_at),
                    last_error = NULL,
                    updated_count = VALUES(updated_count)
                """,
                (_STATE_KEY, trade_date, now, now, len(rows)),
            )
        conn.commit()
        return {
            "trade_date": _date_to_str(trade_date),
            "up_count": len(up_stocks),
            "down_count": len(down_stocks),
            "updated_count": len(rows),
            "updated_at": now,
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def mark_limit_refresh_attempt(error: str | None = None) -> None:
    ensure_limit_schema()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO market_limit_refresh_state
                    (state_key, last_attempt_at, last_error)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    last_attempt_at = VALUES(last_attempt_at),
                    last_error = VALUES(last_error)
                """,
                (_STATE_KEY, now, error),
            )
        conn.commit()
    finally:
        conn.close()


def query_limit_stocks(direction: str, trade_date: Any | None = None) -> list[dict[str, Any]]:
    ensure_limit_schema()
    target_date = trade_date or _latest_trade_date()
    if not target_date:
        return []

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT code, name, price, change_pct, industry, trade_date, updated_at
                FROM market_limit_stocks
                WHERE trade_date = %s AND direction = %s
                ORDER BY change_pct DESC, code ASC
                """,
                (target_date, direction),
            )
            rows = cursor.fetchall()
    finally:
        conn.close()

    if direction == "down":
        rows = sorted(rows, key=lambda row: (_to_float(row.get("change_pct")), str(row.get("code", ""))))
    return [_format_stock_row(row) for row in rows]


def query_limit_summary(trade_date: Any | None = None) -> dict[str, Any]:
    ensure_limit_schema()
    target_date = trade_date or _latest_trade_date()
    state = get_limit_refresh_state()
    if not target_date:
        return {
            "trade_date": None,
            "updated_at": state.get("last_success_at"),
            "limit_up_count": 0,
            "limit_down_count": 0,
            "industry_stats": [],
            "down_industry_stats": [],
            "data_source": "database",
        }

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT direction, COUNT(*) AS count
                FROM market_limit_stocks
                WHERE trade_date = %s
                GROUP BY direction
                """,
                (target_date,),
            )
            counts = {row["direction"]: int(row.get("count") or 0) for row in cursor.fetchall()}
            cursor.execute(
                """
                SELECT direction, industry, COUNT(*) AS count
                FROM market_limit_stocks
                WHERE trade_date = %s AND industry IS NOT NULL AND industry <> ''
                GROUP BY direction, industry
                ORDER BY count DESC, industry ASC
                """,
                (target_date,),
            )
            industries = cursor.fetchall()
    finally:
        conn.close()

    return {
        "trade_date": _date_to_str(target_date),
        "updated_at": state.get("last_success_at"),
        "limit_up_count": counts.get("up", 0),
        "limit_down_count": counts.get("down", 0),
        "industry_stats": _industry_stats(industries, "up"),
        "down_industry_stats": _industry_stats(industries, "down"),
        "data_source": "database",
    }


def get_limit_refresh_state() -> dict[str, Any]:
    ensure_limit_schema()
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT latest_trade_date, last_success_at, last_attempt_at, last_error, updated_count, updated_at
                FROM market_limit_refresh_state
                WHERE state_key = %s
                """,
                (_STATE_KEY,),
            )
            row = cursor.fetchone() or {}
    finally:
        conn.close()

    return {
        "latest_trade_date": _date_to_str(row.get("latest_trade_date")),
        "last_success_at": _date_to_str(row.get("last_success_at")),
        "last_attempt_at": _date_to_str(row.get("last_attempt_at")),
        "last_error": row.get("last_error"),
        "updated_count": int(row.get("updated_count") or 0),
        "updated_at": _date_to_str(row.get("updated_at")),
    }


def _normalize_rows(trade_date: Any, direction: str, stocks: list[dict[str, Any]]) -> list[tuple[Any, ...]]:
    return [
        (
            trade_date,
            str(stock.get("code", "")),
            stock.get("name") or "",
            direction,
            _nullable_float(stock.get("price")),
            _nullable_float(stock.get("change_pct")),
            stock.get("industry") or "",
            stock.get("source") or "eastmoney",
        )
        for stock in stocks
        if stock.get("code")
    ]


def _latest_trade_date() -> Any | None:
    state = get_limit_refresh_state()
    return state.get("latest_trade_date")


def _format_stock_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "code": str(row.get("code", "")),
        "name": row.get("name") or "",
        "price": _to_float(row.get("price")),
        "change_pct": round(_to_float(row.get("change_pct")), 2),
        "industry": row.get("industry") or "",
        "trade_date": _date_to_str(row.get("trade_date")),
        "updated_at": _date_to_str(row.get("updated_at")),
    }


def _industry_stats(rows: list[dict[str, Any]], direction: str) -> list[dict[str, Any]]:
    return [
        {"name": row.get("industry") or "", "count": int(row.get("count") or 0)}
        for row in rows
        if row.get("direction") == direction and row.get("industry")
    ]


def _nullable_float(value: Any) -> float | None:
    if value in (None, "", "-"):
        return None
    return float(value)


def _to_float(value: Any) -> float:
    if isinstance(value, Decimal):
        return float(value)
    return float(value or 0)


def _date_to_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(sep=" ")
    if isinstance(value, date):
        return value.isoformat()
    return value
