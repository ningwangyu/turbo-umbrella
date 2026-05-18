"""
行情数据服务 — 市场指数、热门板块、贵金属价格、K线走势

数据源架构：
- 市场指数：新浪财经行情接口（A股三大指数实时数据）
- 热门板块：东方财富板块接口（行业板块涨跌、领涨股）
- 贵金属价格：新浪财经期货行情（COMEX黄金/白银、现货金银）
- K线走势：东方财富K线接口（贵金属历史走势）

创新点：
1. 贵金属价格自动换算：美元/盎司 → 元/克（使用实时USD/CNY汇率）
2. 多品种覆盖：黄金/白银 × 期货/现货/国内，共6个品种
3. K线周期自适应：根据查询周期自动选择合适的K线级别和数据量
"""

import re
import time

import requests

from config import (
    HEADERS, PRICE_CACHE_TTL, INDEX_CACHE_TTL, SECTORS_CACHE_TTL,
    METAL_TREND_TTL,
)
from cache import price_cache, index_cache, sectors_cache, metal_trend_cache
from ratelimit import limiter


def get_market_indices():
    """
    获取A股三大指数实时行情：上证指数、深证成指、创业板指。

    数据源：新浪财经行情协议（hq.sinajs.cn）
    协议格式：var hq_str_sh000001="名称,今开,昨收,当前价,最高,最低,...,成交量,成交额,...,日期,..."
    字段索引：[0]名称 [1]今开 [2]昨收 [3]当前价 [4]最高 [5]最低 [8]成交量 [9]成交额 [30]日期

    Returns:
        dict: {指数代码: {name, price, open, prev_close, high, low, change, change_pct,
               volume(万手), amount(亿元), amplitude, trade_date}}
    """
    cached = index_cache.get("indices", INDEX_CACHE_TTL)
    if cached is not None:
        return cached
    try:
        limiter.acquire("sina")
        # 批量获取三大指数：上证指数(sh000001)、深证成指(sz399001)、创业板指(sz399006)
        url = "https://hq.sinajs.cn/list=sh000001,sz399001,sz399006"
        resp = requests.get(url, timeout=5, headers={"Referer": "https://finance.sina.com.cn/"})
        resp.encoding = "gbk"
        indices = {}
        names_map = {"sh000001": "上证指数", "sz399001": "深证成指", "sz399006": "创业板指"}
        for line in resp.text.strip().split("\n"):
            m = re.match(r'var hq_str_(\w+)="(.*)"', line)
            if not m:
                continue
            key = m.group(1)
            fields = m.group(2).split(",")
            if len(fields) >= 32:
                name = fields[0].strip()
                open_price = float(fields[1]) if fields[1] else 0
                prev_close = float(fields[2]) if fields[2] else 0    # 昨收
                current = float(fields[3]) if fields[3] else 0      # 当前价
                high = float(fields[4]) if fields[4] else 0
                low = float(fields[5]) if fields[5] else 0
                volume = float(fields[8]) if fields[8] else 0       # 成交量（股）
                amount = float(fields[9]) if fields[9] else 0       # 成交额（元）
                change = current - prev_close if prev_close else 0
                change_pct = (change / prev_close * 100) if prev_close else 0
                amplitude = ((high - low) / prev_close * 100) if prev_close and high and low else 0
                indices[key] = {
                    "name": names_map.get(key, name),
                    "price": round(current, 2),
                    "open": round(open_price, 2),
                    "prev_close": round(prev_close, 2),
                    "high": round(high, 2),
                    "low": round(low, 2),
                    "change": round(change, 2),
                    "change_pct": round(change_pct, 2),
                    "volume": round(volume / 10000, 2),           # 转换为万手
                    "amount": round(amount / 100000000, 2),       # 转换为亿元
                    "amplitude": round(amplitude, 2),             # 振幅%
                    "trade_date": fields[30] if len(fields) > 30 else "",
                }
        index_cache.set("indices", indices)
        return indices
    except Exception as e:
        print(f"Failed to fetch market index: {e}")
        return {}


def get_hot_sectors():
    """
    获取东方财富行业板块行情（前30个板块，按涨跌幅排序）。

    API参数说明：
    - fs=m:90+t:2  筛选条件：行业板块
    - fields: f2=最新价 f3=涨跌幅 f4=涨跌额 f12=代码 f14=名称
              f104=上涨家数 f105=下跌家数 f136=领涨股代码 f140=领涨股名称

    Returns:
        list: [{name, change_pct, leader_name, leader_code, up_count, down_count}]
    """
    cached = sectors_cache.get("sectors", SECTORS_CACHE_TTL)
    if cached is not None:
        return cached
    try:
        limiter.acquire("eastmoney")
        url = (
            "https://push2.eastmoney.com/api/qt/clist/get?"
            "pn=1&pz=30&po=1&np=1&fltt=2&invt=2&"
            "fs=m:90+t:2&"
            "fields=f2,f3,f4,f12,f14,f104,f105,f128,f136,f140"
        )
        resp = requests.get(url, timeout=10, headers={
            "Referer": "https://quote.eastmoney.com/",
            "User-Agent": "Mozilla/5.0",
        })
        data = resp.json()
        sectors = []
        if data.get("data") and data["data"].get("diff"):
            for item in data["data"]["diff"][:30]:
                name = item.get("f14", "")           # 板块名称
                change_pct = item.get("f3", 0)        # 涨跌幅%
                leader_name = item.get("f140", "")    # 领涨股名称
                leader_code = item.get("f136", "")    # 领涨股代码
                up_count = item.get("f104", 0)        # 上涨家数
                down_count = item.get("f105", 0)      # 下跌家数
                sectors.append({
                    "name": name,
                    "change_pct": round(change_pct, 2) if change_pct else 0,
                    "leader_name": leader_name,
                    "leader_code": str(leader_code) if leader_code else "",
                    "up_count": up_count,
                    "down_count": down_count,
                })
        sectors_cache.set("sectors", sectors)
        return sectors
    except Exception as e:
        print(f"Failed to fetch hot sectors: {e}")
        return []


def get_metal_prices():
    """
    获取贵金属实时价格，覆盖6个品种 + USD/CNY汇率。

    新浪期货代码映射：
    - hf_GC: COMEX黄金期货（美元/盎司）
    - hf_SI: COMEX白银期货（美元/盎司）
    - hf_XAU: 现货黄金（美元/盎司）
    - hf_XAG: 现货白银（美元/盎司）
    - fx_susdcny: USD/CNY汇率

    创新点：自动将美元/盎司换算为元/克
    换算公式：人民币价格 = 美元价格 × USD/CNY汇率 ÷ 31.1035(盎司→克)

    Returns:
        dict: {gold, gold_cny, silver, silver_cny, gold_spot, silver_spot, usdcny}
    """
    cached = price_cache.get("metals", PRICE_CACHE_TTL)
    if cached is not None:
        return cached
    try:
        limiter.acquire("sina")
        # 批量获取5个品种行情：2个期货 + 2个现货 + 1个汇率
        url = "https://hq.sinajs.cn/list=hf_GC,hf_SI,hf_XAU,hf_XAG,fx_susdcny"
        resp = requests.get(url, timeout=5, headers={
            "Referer": "https://finance.sina.com.cn/",
        })
        resp.encoding = "gbk"
        text = resp.text

        prices = {}
        usdcny = 7.24   # 默认汇率，会在下面被实时汇率覆盖
        OZ_TO_GRAM = 31.1035  # 1金衡盎司 = 31.1035克

        # 第1步：先解析USD/CNY汇率，用于后续人民币换算
        for line in text.strip().split("\n"):
            m = re.match(r'var hq_str_(\w+)="(.*)"', line)
            if m and m.group(1) == "fx_susdcny":
                fields = m.group(2).split(",")
                if len(fields) >= 2 and fields[1]:
                    try:
                        usdcny = float(fields[1])
                    except ValueError:
                        pass

        # 第2步：解析各品种行情并自动换算人民币价格
        # 新浪期货字段：[0]=当前价 [7]=昨收价
        for line in text.strip().split("\n"):
            m = re.match(r'var hq_str_(\w+)="(.*)"', line)
            if not m:
                continue
            key = m.group(1)
            fields = m.group(2).split(",")
            if key == "hf_GC" and len(fields) >= 9:      # COMEX黄金
                current = float(fields[0]) if fields[0] else 0
                prev_close = float(fields[7]) if fields[7] else 0
                change = current - prev_close
                change_pct = (change / prev_close * 100) if prev_close else 0
                # 创新点：美元/盎司 → 元/克 实时换算
                cny_gram = current * usdcny / OZ_TO_GRAM
                prices["gold"] = {"name": "COMEX黄金", "unit": "美元/盎司", "price": round(current, 2), "prev_close": round(prev_close, 2), "change": round(change, 2), "change_pct": round(change_pct, 2)}
                prices["gold_cny"] = {"name": "国内金价", "unit": "元/克", "price": round(cny_gram, 2), "prev_close": round(prev_close * usdcny / OZ_TO_GRAM, 2), "change": round(change * usdcny / OZ_TO_GRAM, 2), "change_pct": round(change_pct, 2)}
            elif key == "hf_SI" and len(fields) >= 9:    # COMEX白银
                current = float(fields[0]) if fields[0] else 0
                prev_close = float(fields[7]) if fields[7] else 0
                change = current - prev_close
                change_pct = (change / prev_close * 100) if prev_close else 0
                cny_gram = current * usdcny / OZ_TO_GRAM
                prices["silver"] = {"name": "COMEX白银", "unit": "美元/盎司", "price": round(current, 2), "prev_close": round(prev_close, 2), "change": round(change, 2), "change_pct": round(change_pct, 2)}
                prices["silver_cny"] = {"name": "国内银价", "unit": "元/克", "price": round(cny_gram, 2), "prev_close": round(prev_close * usdcny / OZ_TO_GRAM, 2), "change": round(change * usdcny / OZ_TO_GRAM, 2), "change_pct": round(change_pct, 2)}
            elif key == "hf_XAU" and len(fields) >= 10:  # 现货黄金
                current = float(fields[0]) if fields[0] else 0
                prev_close = float(fields[7]) if fields[7] else 0
                change = current - prev_close
                change_pct = (change / prev_close * 100) if prev_close else 0
                prices["gold_spot"] = {"name": "现货黄金", "unit": "美元/盎司", "price": round(current, 2), "prev_close": round(prev_close, 2), "change": round(change, 2), "change_pct": round(change_pct, 2)}
            elif key == "hf_XAG" and len(fields) >= 10:  # 现货白银
                current = float(fields[0]) if fields[0] else 0
                prev_close = float(fields[7]) if fields[7] else 0
                change = current - prev_close
                change_pct = (change / prev_close * 100) if prev_close else 0
                prices["silver_spot"] = {"name": "现货白银", "unit": "美元/盎司", "price": round(current, 2), "prev_close": round(prev_close, 2), "change": round(change, 2), "change_pct": round(change_pct, 2)}

        prices["usdcny"] = round(usdcny, 4)
        price_cache.set("metals", prices)
        return prices
    except Exception as e:
        print(f"Failed to fetch metal prices: {e}")
        return {"error": str(e)}


def get_metal_trend(metal: str = "gold", period: str = "1m"):
    """
    获取贵金属K线走势数据。

    创新点：
    1. 自动识别国内品种（gold_cny/silver_cny），实时换算为人民币/克
    2. 根据查询周期自适应K线级别：短期用小级别(15/30分钟)，长期用大级别(120分钟)
    3. 根据查询周期自适应数据量：7天取50条，1年取365条

    Args:
        metal: 品种标识 (gold/gold_cny/silver/silver_cny/gold_spot/silver_spot)
        period: 查询周期 (7d/15d/1m/3m/6m/1y)

    Returns:
        dict: {trend: [{date, open, close, high, low}], metal, period, unit}
    """
    cache_key = f"{metal}_{period}"
    cached = metal_trend_cache.get(cache_key, METAL_TREND_TTL)
    if cached is not None:
        return cached

    is_cny = metal in ("gold_cny", "silver_cny")

    try:
        usdcny = 7.24
        OZ_TO_GRAM = 31.1035
        # 国内品种需要实时汇率进行换算
        if is_cny:
            try:
                prices = get_metal_prices()
                if "usdcny" in prices:
                    usdcny = prices["usdcny"]
            except Exception:
                pass

        # 品种代码映射：所有品种都通过COMEX期货获取K线数据
        secid_map = {
            "gold": "101.GC00Y",        # COMEX黄金
            "gold_cny": "101.GC00Y",    # 国内金价（从COMEX换算）
            "silver": "101.SI00Y",      # COMEX白银
            "silver_cny": "101.SI00Y",  # 国内银价（从COMEX换算）
            "gold_spot": "101.GC00Y",   # 现货黄金
            "silver_spot": "101.SI00Y", # 现货白银
        }
        secid = secid_map.get(metal, "101.GC00Y")

        # K线级别映射（分钟）：短期用小级别，长期用大级别
        # klt=15表示15分钟K线，klt=120表示120分钟K线
        klt_map = {"7d": "15", "15d": "30", "1m": "60", "3m": "120", "6m": "120", "1y": "120"}
        klt = klt_map.get(period, "60")

        # 数据量映射：根据周期决定返回多少条K线
        lmt_map = {"7d": "50", "15d": "50", "1m": "60", "3m": "90", "6m": "180", "1y": "365"}
        lmt = lmt_map.get(period, "60")

        # 东方财富K线接口
        # fields2: f51=日期 f52=开盘 f53=收盘 f54=最高 f55=最低
        url = (
            f"https://push2his.eastmoney.com/api/qt/stock/kline/get?"
            f"secid={secid}&fields1=f1,f2,f3,f4,f5,f6&"
            f"fields2=f51,f52,f53,f54,f55,f56,f57&"
            f"klt={klt}&fqt=1&lmt={lmt}&end=20500101"
        )
        resp = requests.get(url, timeout=10, headers={
            "Referer": "https://quote.eastmoney.com/",
            "User-Agent": "Mozilla/5.0",
        })
        data = resp.json()

        trend = []
        if data.get("data") and data["data"].get("klines"):
            for line in data["data"]["klines"]:
                # K线格式：日期,开盘,收盘,最高,最低,成交量,成交额
                parts = line.split(",")
                if len(parts) >= 5:
                    entry = {
                        "date": parts[0],
                        "open": float(parts[1]),
                        "close": float(parts[2]),
                        "high": float(parts[3]),
                        "low": float(parts[4]),
                    }
                    # 国内品种：美元/盎司 → 元/克 换算
                    if is_cny:
                        entry["open"] = round(entry["open"] * usdcny / OZ_TO_GRAM, 2)
                        entry["close"] = round(entry["close"] * usdcny / OZ_TO_GRAM, 2)
                        entry["high"] = round(entry["high"] * usdcny / OZ_TO_GRAM, 2)
                        entry["low"] = round(entry["low"] * usdcny / OZ_TO_GRAM, 2)
                    trend.append(entry)

        result = {"trend": trend, "metal": metal, "period": period, "unit": "元/克" if is_cny else "美元/盎司"}
        metal_trend_cache.set(cache_key, result)
        return result
    except Exception as e:
        print(f"Failed to fetch metal trend: {e}")
        return {"error": str(e), "trend": []}
