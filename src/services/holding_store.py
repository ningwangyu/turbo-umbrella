"""MySQL-backed storage for the user's local fund holdings."""

from __future__ import annotations

import json
import re
from decimal import Decimal
from typing import Any

import pymysql
from pymysql.cursors import DictCursor

from config import CONFIG

_SCHEMA_READY = False


def _mysql_config() -> dict[str, Any]:
    cfg = CONFIG.get("database", {}).get("mysql", {})
    return {
        "host": cfg.get("host", "localhost"),
        "port": int(cfg.get("port", 3306)),
        "user": cfg.get("user", "root"),
        "password": cfg.get("password", ""),
        "database": cfg.get("database", "jijin"),
        "charset": cfg.get("charset", "utf8mb4"),
    }


def _quote_identifier(name: str) -> str:
    if not re.match(r"^[A-Za-z0-9_]+$", name):
        raise ValueError("MySQL database name may only contain letters, numbers and underscores")
    return f"`{name}`"


def get_connection(with_database: bool = True):
    """Create a PyMySQL connection using config.json database settings."""
    cfg = _mysql_config()
    kwargs = {
        "host": cfg["host"],
        "port": cfg["port"],
        "user": cfg["user"],
        "password": cfg["password"],
        "charset": cfg["charset"],
        "cursorclass": DictCursor,
        "autocommit": False,
    }
    if with_database:
        kwargs["database"] = cfg["database"]
    return pymysql.connect(**kwargs)


def _column_names(cursor) -> set[str]:
    cursor.execute("SHOW COLUMNS FROM fund_holdings")
    return {row["Field"] for row in cursor.fetchall()}


def _index_names(cursor) -> set[str]:
    cursor.execute("SHOW INDEX FROM fund_holdings")
    return {row["Key_name"] for row in cursor.fetchall()}


def _run_migration(cursor, sql: str) -> None:
    try:
        cursor.execute(sql)
    except pymysql.MySQLError:
        # Migrations are idempotent; ignore duplicate-column/index errors from partially upgraded local DBs.
        pass


def ensure_schema() -> None:
    """Create/upgrade the database schema on first use so local setup stays simple."""
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return

    cfg = _mysql_config()
    database = _quote_identifier(cfg["database"])
    charset = cfg["charset"]

    conn = get_connection(with_database=False)
    try:
        with conn.cursor() as cursor:
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS {database} CHARACTER SET %s", (charset,))
        conn.commit()
    finally:
        conn.close()

    conn = get_connection(with_database=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS fund_holdings (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    code VARCHAR(6) NOT NULL,
                    name VARCHAR(128) NULL,
                    fund_type VARCHAR(64) NULL,
                    value DECIMAL(18, 2) NOT NULL DEFAULT 0,
                    profit DECIMAL(18, 2) NOT NULL DEFAULT 0,
                    source VARCHAR(32) NOT NULL DEFAULT 'manual',
                    metadata JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY uk_fund_holdings_code (code),
                    KEY idx_fund_holdings_updated_at (updated_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )

            columns = _column_names(cursor)
            if "id" not in columns:
                _run_migration(cursor, "ALTER TABLE fund_holdings DROP PRIMARY KEY")
                _run_migration(cursor, "ALTER TABLE fund_holdings ADD COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST")
            if "name" not in columns:
                _run_migration(cursor, "ALTER TABLE fund_holdings ADD COLUMN name VARCHAR(128) NULL AFTER code")
            if "fund_type" not in columns:
                _run_migration(cursor, "ALTER TABLE fund_holdings ADD COLUMN fund_type VARCHAR(64) NULL AFTER name")
            if "source" not in columns:
                _run_migration(cursor, "ALTER TABLE fund_holdings ADD COLUMN source VARCHAR(32) NOT NULL DEFAULT 'manual' AFTER profit")
            if "metadata" not in columns:
                _run_migration(cursor, "ALTER TABLE fund_holdings ADD COLUMN metadata JSON NULL AFTER source")

            indexes = _index_names(cursor)
            if "uk_fund_holdings_code" not in indexes:
                _run_migration(cursor, "ALTER TABLE fund_holdings ADD UNIQUE KEY uk_fund_holdings_code (code)")
            if "idx_fund_holdings_updated_at" not in indexes:
                _run_migration(cursor, "ALTER TABLE fund_holdings ADD KEY idx_fund_holdings_updated_at (updated_at)")
        conn.commit()
        _SCHEMA_READY = True
    finally:
        conn.close()


def _to_float(value: Any) -> float:
    if isinstance(value, Decimal):
        return float(value)
    return float(value or 0)


def _metadata_to_db(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def _normalize_holding(row: dict[str, Any]) -> dict[str, Any]:
    item = {
        "code": str(row.get("code", "")),
        "value": _to_float(row.get("value", 0)),
        "profit": _to_float(row.get("profit", 0)),
    }
    if row.get("name"):
        item["name"] = str(row.get("name"))
    if row.get("fund_type"):
        item["fund_type"] = str(row.get("fund_type"))
    if row.get("source"):
        item["source"] = str(row.get("source"))
    if row.get("metadata"):
        item["metadata"] = row.get("metadata")
    return item


def list_holdings() -> list[dict[str, Any]]:
    ensure_schema()
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT code, name, fund_type, value, profit, source, metadata
                FROM fund_holdings
                ORDER BY created_at ASC, code ASC
                """
            )
            return [_normalize_holding(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def upsert_holding(code: str, value: float, profit: float, name: str | None = None,
                   fund_type: str | None = None, source: str = "manual",
                   metadata: Any = None) -> dict[str, Any]:
    ensure_schema()
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO fund_holdings (code, name, fund_type, value, profit, source, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    name = COALESCE(VALUES(name), name),
                    fund_type = COALESCE(VALUES(fund_type), fund_type),
                    value = VALUES(value),
                    profit = VALUES(profit),
                    source = VALUES(source),
                    metadata = COALESCE(VALUES(metadata), metadata)
                """,
                (code, name, fund_type, value, profit, source, _metadata_to_db(metadata)),
            )
        conn.commit()
        return _normalize_holding({
            "code": code,
            "name": name,
            "fund_type": fund_type,
            "value": value,
            "profit": profit,
            "source": source,
            "metadata": _metadata_to_db(metadata),
        })
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def replace_holdings(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ensure_schema()
    normalized = [_normalize_holding(item) for item in items]
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM fund_holdings")
            if normalized:
                rows = [
                    (
                        item["code"],
                        item.get("name"),
                        item.get("fund_type"),
                        item["value"],
                        item["profit"],
                        item.get("source", "import"),
                        _metadata_to_db(item.get("metadata")),
                    )
                    for item in normalized
                ]
                cursor.executemany(
                    """
                    INSERT INTO fund_holdings (code, name, fund_type, value, profit, source, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        name = VALUES(name),
                        fund_type = VALUES(fund_type),
                        value = VALUES(value),
                        profit = VALUES(profit),
                        source = VALUES(source),
                        metadata = VALUES(metadata)
                    """,
                    rows,
                )
        conn.commit()
        return normalized
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_holding(code: str) -> bool:
    ensure_schema()
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            affected = cursor.execute("DELETE FROM fund_holdings WHERE code = %s", (code,))
        conn.commit()
        return affected > 0
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
