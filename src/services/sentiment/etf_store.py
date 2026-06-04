"""MySQL-backed storage for ETF fund-flow statistics."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from services.holding_store import ensure_schema, get_connection

_SCHEMA_READY = False


def ensure_etf_flow_schema() -> None:
    """Create ETF flow tables on first use."""
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return

    ensure_schema()
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS etf_flow_daily (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    trade_date DATE NOT NULL,
                    code VARCHAR(6) NOT NULL,
                    name VARCHAR(128) NULL,
                    market TINYINT NOT NULL DEFAULT 1,
                    net_flow DECIMAL(20, 2) NOT NULL DEFAULT 0,
                    direction ENUM('in','out','flat') NOT NULL,
                    source VARCHAR(32) NOT NULL DEFAULT 'eastmoney',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY uk_etf_flow_daily_date_code (trade_date, code),
                    KEY idx_etf_flow_daily_code_date (code, trade_date),
                    KEY idx_etf_flow_daily_direction_date (direction, trade_date)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS etf_flow_consecutive_stats (
                    code VARCHAR(6) NOT NULL,
                    name VARCHAR(128) NULL,
                    market TINYINT NOT NULL DEFAULT 1,
                    direction ENUM('in','out','flat') NOT NULL,
                    consecutive_days INT NOT NULL DEFAULT 0,
                    total_flow DECIMAL(20, 2) NOT NULL DEFAULT 0,
                    latest_trade_date DATE NULL,
                    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (code),
                    KEY idx_etf_flow_stats_rank (direction, consecutive_days, total_flow),
                    KEY idx_etf_flow_stats_latest (latest_trade_date)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
        conn.commit()
        _SCHEMA_READY = True
    finally:
        conn.close()


def _to_float(value: Any) -> float:
    if isinstance(value, Decimal):
        return float(value)
    return float(value or 0)


def _date_to_str(value: Any) -> str | None:
    return value.isoformat() if hasattr(value, "isoformat") else value


def insert_new_etf_flow_daily(rows: list[dict[str, Any]]) -> dict[str, Any]:
    ensure_etf_flow_schema()
    if not rows:
        return {"inserted_count": 0, "skipped_count": 0, "inserted_rows": []}

    normalized_rows = _dedupe_daily_rows([_normalize_daily_row(row) for row in rows])
    existing_keys = _existing_daily_keys(normalized_rows)
    values = [
        (
            row["trade_date"],
            row["code"],
            row.get("name"),
            int(row.get("market") or 1),
            float(row.get("net_flow") or 0),
            row.get("direction") or "flat",
            row.get("source") or "eastmoney",
        )
        for row in normalized_rows
    ]

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.executemany(
                """
                INSERT IGNORE INTO etf_flow_daily (trade_date, code, name, market, net_flow, direction, source)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                values,
            )
            inserted_count = cursor.rowcount
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    inserted_rows = [row for row in normalized_rows if (row["trade_date"], row["code"]) not in existing_keys]
    return {
        "inserted_count": inserted_count,
        "skipped_count": len(normalized_rows) - inserted_count,
        "inserted_rows": inserted_rows,
    }


def _normalize_daily_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "trade_date": _date_to_str(row["trade_date"]),
        "code": str(row["code"]),
        "name": row.get("name"),
        "market": int(row.get("market") or 1),
        "net_flow": float(row.get("net_flow") or 0),
        "direction": row.get("direction") or "flat",
        "source": row.get("source") or "eastmoney",
    }


def _dedupe_daily_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped = {}
    for row in rows:
        deduped.setdefault((row["trade_date"], row["code"]), row)
    return list(deduped.values())


def _existing_daily_keys(rows: list[dict[str, Any]]) -> set[tuple[str, str]]:
    if not rows:
        return set()

    keys = {(row["trade_date"], row["code"]) for row in rows}
    clauses = " OR ".join(["(trade_date = %s AND code = %s)"] * len(keys))
    params = []
    for trade_date, code in keys:
        params.extend([trade_date, code])

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT trade_date, code
                FROM etf_flow_daily
                WHERE {clauses}
                """,
                params,
            )
            return {(_date_to_str(row["trade_date"]), str(row["code"])) for row in cursor.fetchall()}
    finally:
        conn.close()


def apply_etf_flow_daily(rows: list[dict[str, Any]]) -> dict[str, Any]:
    ensure_etf_flow_schema()
    if not rows:
        return {"updated_count": 0, "ignored_old_count": 0, "latest_trade_date": None}

    normalized_rows = sorted(
        [_normalize_daily_row(row) for row in rows],
        key=lambda item: (item["trade_date"], item["code"]),
    )
    conn = get_connection()
    updated_count = 0
    ignored_old_count = 0
    latest_trade_date = None
    try:
        with conn.cursor() as cursor:
            for row in normalized_rows:
                cursor.execute(
                    """
                    SELECT code, name, market, direction, consecutive_days, total_flow, latest_trade_date
                    FROM etf_flow_consecutive_stats
                    WHERE code = %s
                    """,
                    (row["code"],),
                )
                stat = cursor.fetchone()
                if stat and stat.get("latest_trade_date") and row["trade_date"] <= _date_to_str(stat["latest_trade_date"]):
                    ignored_old_count += 1
                    continue

                next_stat = _next_stat_from_daily(row, stat)
                cursor.execute(
                    """
                    INSERT INTO etf_flow_consecutive_stats
                        (code, name, market, direction, consecutive_days, total_flow, latest_trade_date)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        name = VALUES(name),
                        market = VALUES(market),
                        direction = VALUES(direction),
                        consecutive_days = VALUES(consecutive_days),
                        total_flow = VALUES(total_flow),
                        latest_trade_date = VALUES(latest_trade_date)
                    """,
                    (
                        next_stat["code"],
                        next_stat.get("name"),
                        next_stat.get("market") or 1,
                        next_stat["direction"],
                        next_stat["consecutive_days"],
                        next_stat["total_flow"],
                        next_stat["latest_trade_date"],
                    ),
                )
                updated_count += 1
                if latest_trade_date is None or row["trade_date"] > latest_trade_date:
                    latest_trade_date = row["trade_date"]
        conn.commit()
        return {
            "updated_count": updated_count,
            "ignored_old_count": ignored_old_count,
            "latest_trade_date": latest_trade_date,
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _next_stat_from_daily(row: dict[str, Any], stat: dict[str, Any] | None) -> dict[str, Any]:
    daily_direction = row.get("direction") or "flat"
    daily_flow = _to_float(row.get("net_flow"))

    if daily_direction == "flat":
        direction = "flat"
        consecutive_days = 0
        total_flow = 0
    elif stat and stat.get("direction") == daily_direction:
        direction = daily_direction
        consecutive_days = int(stat.get("consecutive_days") or 0) + 1
        total_flow = _to_float(stat.get("total_flow")) + daily_flow
    else:
        direction = daily_direction
        consecutive_days = 1
        total_flow = daily_flow

    return {
        "code": row["code"],
        "name": row.get("name") or (stat or {}).get("name"),
        "market": row.get("market") or (stat or {}).get("market") or 1,
        "direction": direction,
        "consecutive_days": consecutive_days,
        "total_flow": total_flow,
        "latest_trade_date": row["trade_date"],
    }

def recalculate_etf_flow_stats() -> dict[str, Any]:
    ensure_etf_flow_schema()
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT code, name, market, trade_date, net_flow, direction
                FROM etf_flow_daily
                ORDER BY code ASC, trade_date DESC
                """
            )
            rows = cursor.fetchall()

            stats = []
            current_code = None
            current_rows = []
            for row in rows:
                code = row["code"]
                if current_code is not None and code != current_code:
                    stats.append(_calculate_stat(current_rows))
                    current_rows = []
                current_code = code
                current_rows.append(row)
            if current_rows:
                stats.append(_calculate_stat(current_rows))

            cursor.execute("DELETE FROM etf_flow_consecutive_stats")
            if stats:
                cursor.executemany(
                    """
                    INSERT INTO etf_flow_consecutive_stats
                        (code, name, market, direction, consecutive_days, total_flow, latest_trade_date)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        name = VALUES(name),
                        market = VALUES(market),
                        direction = VALUES(direction),
                        consecutive_days = VALUES(consecutive_days),
                        total_flow = VALUES(total_flow),
                        latest_trade_date = VALUES(latest_trade_date)
                    """,
                    [
                        (
                            item["code"],
                            item.get("name"),
                            item.get("market") or 1,
                            item["direction"],
                            item["consecutive_days"],
                            item["total_flow"],
                            item.get("latest_trade_date"),
                        )
                        for item in stats
                    ],
                )
        conn.commit()
        latest_trade_date = max((item.get("latest_trade_date") for item in stats if item.get("latest_trade_date")), default=None)
        return {
            "stats_count": len(stats),
            "latest_trade_date": _date_to_str(latest_trade_date),
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _calculate_stat(rows: list[dict[str, Any]]) -> dict[str, Any]:
    latest = rows[0]
    direction = latest.get("direction") or "flat"
    consecutive_days = 0
    total_flow = 0.0

    if direction in ("in", "out"):
        for row in rows:
            if row.get("direction") != direction:
                break
            consecutive_days += 1
            total_flow += _to_float(row.get("net_flow"))

    return {
        "code": str(latest.get("code", "")),
        "name": latest.get("name"),
        "market": int(latest.get("market") or 1),
        "direction": direction,
        "consecutive_days": consecutive_days,
        "total_flow": total_flow,
        "latest_trade_date": latest.get("trade_date"),
    }


def query_etf_consecutive_stats(days: int, limit: int | None = None) -> dict[str, Any]:
    ensure_etf_flow_schema()
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT MAX(latest_trade_date) AS latest_trade_date, MAX(calculated_at) AS calculated_at
                FROM etf_flow_consecutive_stats
                """
            )
            meta = cursor.fetchone() or {}
            inflow = _query_rank(cursor, "in", days, limit)
            outflow = _query_rank(cursor, "out", days, limit)
        return {
            "days": days,
            "inflow": inflow,
            "outflow": outflow,
            "latest_trade_date": _date_to_str(meta.get("latest_trade_date")),
            "updated_at": _date_to_str(meta.get("calculated_at")),
        }
    finally:
        conn.close()


def _query_rank(cursor, direction: str, days: int, limit: int | None) -> list[dict[str, Any]]:
    sql = """
        SELECT code, name, consecutive_days, total_flow, direction
        FROM etf_flow_consecutive_stats
        WHERE direction = %s AND consecutive_days >= %s
        ORDER BY consecutive_days DESC, ABS(total_flow) DESC
    """
    params: tuple[Any, ...] = (direction, days)
    if limit is not None:
        sql += " LIMIT %s"
        params = (*params, limit)
    cursor.execute(sql, params)
    return [
        {
            "code": str(row["code"]),
            "name": row.get("name") or "",
            "consecutive_days": int(row.get("consecutive_days") or 0),
            "total_flow": round(_to_float(row.get("total_flow")) / 100000000, 2),
            "direction": row.get("direction") or direction,
        }
        for row in cursor.fetchall()
    ]
