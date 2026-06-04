"""
信号历史存储模块 — 记录基金量化信号到MySQL

功能说明：
- record_signal(): 记录信号快照到数据库
- get_signal_history(): 获取最近N天的信号历史
- get_latest_signal(): 获取最新一条信号

数据库表结构：
CREATE TABLE IF NOT EXISTS signal_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fund_code VARCHAR(10) NOT NULL,
    buy_score INT NOT NULL,
    signal_text VARCHAR(50),
    factors JSON,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fund_date (fund_code, recorded_at)
)
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

import pymysql
from pymysql.cursors import DictCursor

from config import CONFIG
from cache import signal_history_cache
from config import SIGNAL_HISTORY_TTL

logger = logging.getLogger(__name__)


def _get_db_connection():
    """获取MySQL数据库连接"""
    db_config = CONFIG.get("database", {}).get("mysql", {})
    return pymysql.connect(
        host=db_config.get("host", "127.0.0.1"),
        port=db_config.get("port", 3306),
        user=db_config.get("user", "root"),
        password=db_config.get("password", ""),
        database=db_config.get("database", "jijin"),
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=True
    )


def _ensure_table_exists():
    """确保signal_history表存在"""
    try:
        conn = _get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS signal_history (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    fund_code VARCHAR(10) NOT NULL,
                    buy_score INT NOT NULL,
                    signal_text VARCHAR(50),
                    factors JSON,
                    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_fund_date (fund_code, recorded_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Failed to ensure signal_history table: {e}")
        return False


def record_signal(fund_code: str, buy_score: int, signal_text: str, factors: List[Dict[str, Any]]) -> bool:
    """
    记录基金信号到MySQL

    参数:
        fund_code: 基金代码（6位）
        buy_score: 买入信号分数（0-100）
        signal_text: 信号文本（如"建议买入"）
        factors: 因子明细列表

    返回:
        bool: 是否记录成功
    """
    try:
        # 确保表存在
        if not _ensure_table_exists():
            return False

        conn = _get_db_connection()
        with conn.cursor() as cursor:
            # 将factors转为JSON字符串
            factors_json = json.dumps(factors, ensure_ascii=False)

            cursor.execute("""
                INSERT INTO signal_history (fund_code, buy_score, signal_text, factors)
                VALUES (%s, %s, %s, %s)
            """, (fund_code, buy_score, signal_text, factors_json))

        conn.close()

        # 清除该基金的缓存
        cache_key = f"signal_history_{fund_code}_7"
        if signal_history_cache.get(cache_key, SIGNAL_HISTORY_TTL):
            signal_history_cache._store.pop(cache_key, None)

        logger.info(f"Recorded signal for {fund_code}: buy_score={buy_score}")
        return True
    except Exception as e:
        logger.error(f"Failed to record signal for {fund_code}: {e}")
        return False


def get_signal_history(fund_code: str, days: int = 7) -> List[Dict[str, Any]]:
    """
    获取基金最近N天的信号历史

    参数:
        fund_code: 基金代码（6位）
        days: 查询天数（默认7天）

    返回:
        [
            {
                "buy_score": 62,
                "signal_text": "建议买入",
                "factors": [...],
                "recorded_at": "2026-05-20 14:30:00"
            }
        ]
    """
    # 检查缓存
    cache_key = f"signal_history_{fund_code}_{days}"
    cached = signal_history_cache.get(cache_key, SIGNAL_HISTORY_TTL)
    if cached:
        return cached

    result = []
    try:
        # 确保表存在
        if not _ensure_table_exists():
            return result

        conn = _get_db_connection()
        with conn.cursor() as cursor:
            # 查询最近N天的记录
            cursor.execute("""
                SELECT buy_score, signal_text, factors, recorded_at
                FROM signal_history
                WHERE fund_code = %s
                AND recorded_at >= %s
                ORDER BY recorded_at DESC
                LIMIT 100
            """, (fund_code, datetime.now() - timedelta(days=days)))

            rows = cursor.fetchall()
            for row in rows:
                factors = []
                if row["factors"]:
                    try:
                        factors = json.loads(row["factors"])
                    except json.JSONDecodeError:
                        pass

                result.append({
                    "buy_score": row["buy_score"],
                    "signal_text": row["signal_text"],
                    "factors": factors,
                    "recorded_at": row["recorded_at"].strftime("%Y-%m-%d %H:%M:%S") if row["recorded_at"] else ""
                })

        conn.close()

        # 写入缓存
        if result:
            signal_history_cache.set(cache_key, result)

        return result
    except Exception as e:
        logger.error(f"Failed to get signal history for {fund_code}: {e}")
        return result


def get_latest_signal(fund_code: str) -> Optional[Dict[str, Any]]:
    """
    获取基金最新一条信号

    参数:
        fund_code: 基金代码（6位）

    返回:
        {
            "buy_score": 62,
            "signal_text": "建议买入",
            "factors": [...],
            "recorded_at": "2026-05-20 14:30:00"
        }
        或 None（如果没有历史记录）
    """
    # 先检查缓存
    cache_key = f"signal_latest_{fund_code}"
    cached = signal_history_cache.get(cache_key, SIGNAL_HISTORY_TTL)
    if cached:
        return cached

    try:
        # 确保表存在
        if not _ensure_table_exists():
            return None

        conn = _get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT buy_score, signal_text, factors, recorded_at
                FROM signal_history
                WHERE fund_code = %s
                ORDER BY recorded_at DESC
                LIMIT 1
            """, (fund_code,))

            row = cursor.fetchone()
            if row:
                factors = []
                if row["factors"]:
                    try:
                        factors = json.loads(row["factors"])
                    except json.JSONDecodeError:
                        pass

                result = {
                    "buy_score": row["buy_score"],
                    "signal_text": row["signal_text"],
                    "factors": factors,
                    "recorded_at": row["recorded_at"].strftime("%Y-%m-%d %H:%M:%S") if row["recorded_at"] else ""
                }

                # 写入缓存
                signal_history_cache.set(cache_key, result)
                return result
            else:
                return None

        conn.close()
    except Exception as e:
        logger.error(f"Failed to get latest signal for {fund_code}: {e}")
        return None


def get_signal_trend(fund_code: str, days: int = 7) -> Dict[str, Any]:
    """
    获取基金信号趋势（对比当前 vs N天前）

    参数:
        fund_code: 基金代码（6位）
        days: 对比天数（默认7天）

    返回:
        {
            "current_score": 62,
            "previous_score": 55,
            "change": 7,
            "trend": "↑"  # ↑升级、→稳定、↓降级
        }
    """
    history = get_signal_history(fund_code, days)
    if not history or len(history) == 0:
        return {
            "current_score": 50,
            "previous_score": 50,
            "change": 0,
            "trend": "→"
        }

    current_score = history[0]["buy_score"]
    previous_score = history[-1]["buy_score"] if len(history) > 1 else current_score
    change = current_score - previous_score

    # 判断趋势
    if change > 3:
        trend = "↑"
    elif change < -3:
        trend = "↓"
    else:
        trend = "→"

    return {
        "current_score": current_score,
        "previous_score": previous_score,
        "change": change,
        "trend": trend
    }
