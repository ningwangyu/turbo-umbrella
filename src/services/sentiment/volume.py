from .common import *
from .common import _sentiment_cache

def get_volume_trend() -> list:
    """
    获取近5个交易日沪深两市总成交额。

    数据源：东方财富上证指数日K线接口（取近5日成交额）

    Returns:
        list: [{date, amount(亿元)}]
    """
    cached = _sentiment_cache.get("volume_trend", SENTIMENT_TTL)
    if cached is not None:
        return cached

    trend = []
    try:
        limiter.acquire("eastmoney")
        url = (
            "https://push2his.eastmoney.com/api/qt/stock/kline/get?"
            "secid=1.000001&fields1=f1,f2,f3,f4,f5,f6&"
            "fields2=f51,f52,f53,f54,f55,f56,f57&"
            "klt=101&fqt=1&lmt=5&end=20500101"
        )
        resp = requests.get(url, timeout=10, headers={
            "Referer": "https://quote.eastmoney.com/",
            "User-Agent": "Mozilla/5.0",
        })
        data = resp.json()
        if data.get("data") and data["data"].get("klines"):
            for line in data["data"]["klines"]:
                parts = line.split(",")
                if len(parts) >= 7:
                    trend.append({
                        "date": parts[0],
                        "amount": round(float(parts[6]) / 100000000, 2) if parts[6] else 0,
                    })
    except Exception as e:
        print(f"Sentiment: fetch volume trend failed: {e}")

    _sentiment_cache.set("volume_trend", trend)
    return trend
