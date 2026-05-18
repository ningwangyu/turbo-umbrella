import re

import requests

from config import HEADERS, CONFIG, POOL_CACHE_TTL
from cache import pool_cache
from ratelimit import limiter

def _safe_float(s):
    """安全的字符串转浮点，空值返回None"""
    try:
        return float(s) if s and s.strip() != "" else None
    except (ValueError, TypeError):
        return None


def fetch_fund_pool() -> list:
    """
    从东方财富基金排行榜获取候选基金池。

    多维度爬取策略：按基金类型(全部/股票型/混合型) × 排序维度(半年收益/年收益)，
    共6个维度各取30只，去重后合并为最多200只的候选池。
    这样可以覆盖不同策略风格的基金，避免单一维度筛选的偏见。

    Returns:
        list: 候选基金列表，每项包含 code/name/type/returns_{1m,3m,6m,1y}
    """
    cached = pool_cache.get("pool", POOL_CACHE_TTL)
    if cached is not None:
        return cached

    # 多维度爬取：(基金类型ft, 排序字段sc, 每页数量pn)
    # ft: all=全部, gp=股票型, hh=混合型
    # sc: 6yzf=近半年涨幅, 1nzf=近一年涨幅
    sources = [
        ("all", "6yzf", 30),
        ("all", "1nzf", 30),
        ("gp", "6yzf", 30),
        ("gp", "1nzf", 30),
        ("hh", "6yzf", 30),
        ("hh", "1nzf", 30),
    ]
    seen = set()  # 用于基金代码去重
    pool = []

    for ft, sc, pn in sources:
        try:
            # 东方财富基金排行榜API，返回格式为JS变量赋值语句
            url = (
                f"http://fund.eastmoney.com/data/rankhandler.aspx"
                f"?op=ph&dt=kf&ft={ft}&rs=&gs=0&sc={sc}&st=desc&pi=1&pn={pn}"
            )
            limiter.acquire("eastmoney")
            resp = requests.get(url, timeout=10, headers=HEADERS)
            resp.encoding = "gbk"
            text = resp.text

            # 解析 datas:["基金1","基金2",...] 格式
            match = re.search(r'datas:\[(.*?)\]', text, re.DOTALL)
            if not match:
                continue

            raw = match.group(1)
            items = re.findall(r'"([^"]+)"', raw)

            for item in items:
                fields = item.split(",")
                if len(fields) < 10:
                    continue
                code = fields[0].strip()
                if not re.match(r"^\d{6}$", code) or code in seen:
                    continue
                seen.add(code)

                # fields[7]=近1月收益, fields[8]=近3月, fields[9]=近6月, fields[10]=近1年
                fund = {
                    "code": code,
                    "name": "",
                    "type": ft,
                    "returns_1m": _safe_float(fields[7]) if len(fields) > 7 else None,
                    "returns_3m": _safe_float(fields[8]) if len(fields) > 8 else None,
                    "returns_6m": _safe_float(fields[9]) if len(fields) > 9 else None,
                    "returns_1y": _safe_float(fields[10]) if len(fields) > 10 else None,
                }
                pool.append(fund)
                if len(pool) >= 200:
                    break
        except Exception as e:
            print(f"Fetch pool dimension {ft}/{sc}: {e}")
            continue
        if len(pool) >= 200:
            break

    pool_cache.set("pool", pool)
    return pool
