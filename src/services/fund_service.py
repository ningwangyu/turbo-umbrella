"""
基金数据服务层 — 多数据源策略

数据源架构：
- 主数据源：东方财富（基金估值、业绩走势、重仓股）
- 备用数据源：新浪财经（LOF/ETF实时行情回退）

创新点：当主数据源请求失败时，自动回退到备用数据源，
并根据基金代码前缀智能判断市场（16=sz, 1/5/6=sh），
确保LOF/ETF等场内基金也能获取到实时数据。

缓存策略：每类数据独立TTL，避免频繁请求外部API
"""

import re
import json
import time
import traceback
from datetime import date

import requests

from config import HEADERS, CACHE_TTL, PERF_CACHE_TTL, HOLDINGS_CACHE_TTL
from cache import est_cache, perf_cache, holdings_cache
from ratelimit import limiter

_fund_list = []
_fund_list_loaded = False


def load_fund_list():
    """加载全量基金列表（约1.5万只），懒加载+全局缓存，仅首次调用时请求。"""
    global _fund_list, _fund_list_loaded
    if _fund_list_loaded:
        return
    try:
        limiter.acquire("eastmoney")
        resp = requests.get(
            "http://fund.eastmoney.com/js/fundcode_search.js",
            timeout=10, headers=HEADERS,
        )
        resp.encoding = "utf-8"
        # 解析JS文件：var r = [["000001","HXCZHHB","华夏成长混合","混合型"],...]
        match = re.search(r"var r = (\[.*?\]);", resp.text, re.DOTALL)
        if match:
            raw = json.loads(match.group(1))
            # item: [基金代码, 拼音缩写, 基金名称, 基金类型]
            _fund_list = [
                {"code": item[0], "name": item[2], "type": item[3]}
                for item in raw
            ]
            _fund_list_loaded = True
    except Exception as e:
        print(f"Failed to load fund list: {e}")


def get_fund_list():
    load_fund_list()
    return _fund_list


def _get_latest_nav_from_trend(code: str, est_nav_date: str) -> dict | None:
    """从走势数据中获取最新净值，当走势比估值API更新时覆盖nav。"""
    from datetime import datetime
    cached_perf = perf_cache.get(code, PERF_CACHE_TTL)
    if not cached_perf:
        cached_perf = fetch_fund_performance(code)
    if cached_perf and cached_perf.get("trend"):
        latest = cached_perf["trend"][-1]
        latest_date = datetime.fromtimestamp(latest["date"] / 1000).strftime("%Y-%m-%d")
        # 走势数据比估值API更新 → 用走势覆盖（补到4位小数与估值API一致）
        if latest_date > est_nav_date:
            return {"nav": f"{latest['nav']:.4f}", "nav_date": latest_date}
    return None


def fetch_fund_estimation(code: str) -> dict | None:
    """
    获取基金实时估值数据。

    数据源策略：
    1. 主源：东方财富JSONP接口（fundgz.1234567.com.cn），支持所有场外基金
    2. 备用：新浪财经行情接口（hq.sinajs.cn），用于LOF/ETF等场内基金

    东方财富返回字段映射：
        fundcode → 基金代码, name → 基金名称,
        jzrq → 净值日期, dwjz → 单位净值(前一日),
        gsz → 估算净值(盘中实时), gszzl → 估算涨跌幅%,
        gztime → 估值时间

    Args:
        code: 6位基金代码

    Returns:
        dict: 含 code/name/nav/nav_date/estimated_nav/estimated_change_pct/estimation_time
        None: 两个数据源均失败时返回None
    """
    cached = est_cache.get(code, CACHE_TTL)
    if cached is not None:
        return cached
    try:
        limiter.acquire("eastmoney")
        # 东方财富JSONP接口，返回 jsonpgz({...}) 格式
        url = f"https://fundgz.1234567.com.cn/js/{code}.js"
        resp = requests.get(url, timeout=5, headers=HEADERS)
        match = re.search(rb"jsonpgz\(({.*?})\)", resp.content)
        if match:
            data = json.loads(match.group(1))
            today_str = date.today().strftime("%Y-%m-%d")
            nav_date = data.get("jzrq", "")
            is_updated = (nav_date == today_str)
            nav = data.get("dwjz", "")
            # 走势数据比估值API更新时，用走势覆盖净值
            trend_info = _get_latest_nav_from_trend(code, nav_date)
            if trend_info:
                is_updated = (trend_info["nav_date"] == today_str)
                nav = trend_info["nav"]
                nav_date = trend_info["nav_date"]
            result = {
                "code": data.get("fundcode", ""),
                "name": data.get("name", ""),
                "nav_date": nav_date,                            # 净值日期
                "nav": nav,                                      # 单位净值
                "estimated_nav": data.get("gsz", ""),            # 估算净值
                "estimated_change_pct": data.get("gszzl", "0"),  # 估算涨跌幅%
                "estimation_time": data.get("gztime", ""),       # 估值时间
                "is_nav_updated": is_updated,                    # 当日净值是否已更新
            }
            est_cache.set(code, result)
            return result
    except Exception as e:
        print(f"Failed to fetch fund {code}: {e}")

    # 备用数据源：新浪财经行情接口（用于LOF/ETF等场内基金）
    try:
        limiter.acquire("sina")
        # 根据基金代码前缀判断交易所：16开头=深圳LOF，1/5/6开头=上海
        if code.startswith("16"):
            prefix = "sz"
        elif code.startswith(("1", "5", "6")):
            prefix = "sh"
        else:
            prefix = "sz"
        sina_url = f"https://hq.sinajs.cn/list={prefix}{code}"
        sresp = requests.get(sina_url, timeout=5, headers={
            "Referer": "https://finance.sina.com.cn/",
        })
        sresp.encoding = "gbk"
        # 新浪行情格式：var hq_str_sh510300="名称,今开,昨收,当前价,..."
        m = re.match(r'var hq_str_\w+="(.*)"', sresp.text.strip())
        if m and m.group(1):
            fields = m.group(1).split(",")
            if len(fields) >= 4:
                name = fields[0].strip()
                current = float(fields[3]) if fields[3] else 0       # 当前价
                yesterday_close = float(fields[2]) if fields[2] else 0  # 昨收价
                if yesterday_close > 0:
                    change_pct = str(round((current - yesterday_close) / yesterday_close * 100, 2))
                else:
                    change_pct = "0"
                nav_date = fields[30] if len(fields) > 30 else ""
                today_str = date.today().strftime("%Y-%m-%d")
                is_updated = (nav_date == today_str)
                actual_nav = str(yesterday_close)
                trend_info = _get_latest_nav_from_trend(code, nav_date)
                if trend_info:
                    is_updated = (trend_info["nav_date"] == today_str)
                    actual_nav = trend_info["nav"]
                    nav_date = trend_info["nav_date"]
                result = {
                    "code": code,
                    "name": name,
                    "nav_date": nav_date,
                    "nav": actual_nav,
                    "estimated_nav": str(current),
                    "estimated_change_pct": change_pct,
                    "estimation_time": fields[31] if len(fields) > 31 else "",
                    "is_nav_updated": is_updated,
                }
                est_cache.set(code, result)
                return result
    except Exception as e:
        print(f"Sina fallback for {code} failed: {e}")

    return None


def fetch_fund_performance(code: str) -> dict | None:
    """
    获取基金历史业绩走势数据。

    数据源：东方财富基金详情页JS（pingzhongdata），包含：
    - Data_netWorthTrend：净值走势数组（日期、净值、日收益率）
    - syl_1n/syl_6y/syl_3y/syl_1y：近1年/6月/3月/1月收益率

    Args:
        code: 6位基金代码

    Returns:
        dict: {trend: [{date, nav, return}], returns: {1y, 6m, 3m, 1m}}
    """
    cached = perf_cache.get(code, PERF_CACHE_TTL)
    if cached is not None:
        return cached
    try:
        limiter.acquire("eastmoney")
        url = f"https://fund.eastmoney.com/pingzhongdata/{code}.js"
        resp = requests.get(url, timeout=10, headers=HEADERS)
        resp.encoding = "utf-8"
        text = resp.text

        # 解析净值走势：var Data_netWorthTrend = [{x:时间戳ms, y:净值, equityReturn:日收益率%}, ...]
        trend = []
        match = re.search(r"var Data_netWorthTrend\s*=\s*(\[.*?\]);", text, re.DOTALL)
        if match:
            raw = json.loads(match.group(1))
            trend = [
                {"date": item["x"], "nav": item["y"], "return": item.get("equityReturn", 0)}
                for item in raw
            ]

        # 解析区间收益率：var syl_1n = "12.34" 表示近1年收益12.34%
        # syl_1n=近1年, syl_6y=近6月, syl_3y=近3月, syl_1y=近1月
        returns = {}
        for key, label in [("syl_1n", "1y"), ("syl_6y", "6m"), ("syl_3y", "3m"), ("syl_1y", "1m")]:
            m = re.search(rf"var {key}\s*=\s*\"(.*?)\"", text)
            if m:
                try:
                    returns[label] = float(m.group(1))
                except ValueError:
                    pass

        result = {"trend": trend, "returns": returns}
        perf_cache.set(code, result)
        return result
    except Exception as e:
        print(f"Failed to fetch performance for {code}: {e}")
    return None


def fetch_fund_holdings(code: str) -> dict | None:
    """
    获取基金重仓股数据及实时行情。

    两阶段数据获取：
    1. 从东方财富基金档案页解析HTML重仓股列表（股票代码、名称、持仓占比）
    2. 批量调用新浪财经接口获取重仓股实时行情（当前价、涨跌幅）

    Args:
        code: 6位基金代码

    Returns:
        dict: {holdings: [{code, name, pct, price, change_pct}]}
    """
    cached = holdings_cache.get(code, HOLDINGS_CACHE_TTL)
    if cached is not None:
        return cached
    try:
        # 东方财富重仓股接口，返回HTML片段
        url = f"https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code={code}&topline=10"
        resp = requests.get(url, timeout=10, headers=HEADERS)
        resp.encoding = "utf-8"
        text = resp.text

        # 解析HTML中的重仓股表格：<tr><td>排名</td><td>股票代码</td><td>股票名称</td>...<td>占比%</td></tr>
        holdings = []
        match = re.search(r"content:\"(.*?)\"", text, re.DOTALL)
        if match:
            html = match.group(1)
            rows = re.findall(r"<tr>(.*?)</tr>", html, re.DOTALL)
            for row in rows[1:]:  # 跳过表头行
                tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
                if len(tds) >= 7:
                    code_match = re.search(r"<a[^>]*>([^<]+)</a>", tds[1])   # 股票代码
                    name_match = re.search(r"<a[^>]*>([^<]+)</a>", tds[2])   # 股票名称
                    pct_match = re.search(r"([\d.]+)%", tds[6])              # 持仓占比
                    if code_match and name_match:
                        stock_code = code_match.group(1).strip()
                        stock_name = name_match.group(1).strip()
                        pct = float(pct_match.group(1)) if pct_match else 0
                        holdings.append({
                            "code": stock_code,
                            "name": stock_name,
                            "pct": pct,
                        })

        # 第2步：批量获取重仓股实时行情（新浪支持一次性查询多只股票）
        if holdings:
            stock_list = []
            for h in holdings:
                c = h["code"]
                # 股票代码前缀规则：6开头=上海，0/3开头=深圳，16开头=深圳LOF，01/02开头=港股
                if c.startswith("6"):
                    stock_list.append(f"sh{c}")
                elif c.startswith("16"):
                    stock_list.append(f"sz{c}")
                elif c.startswith("0") or c.startswith("3"):
                    stock_list.append(f"sz{c}")
                elif c.startswith("01") or c.startswith("02"):
                    stock_list.append(f"hk{c}")

            if stock_list:
                try:
                    # 新浪支持逗号分隔批量查询：list=sh600519,sz000858,...
                    sina_url = f"https://hq.sinajs.cn/list={','.join(stock_list)}"
                    sresp = requests.get(sina_url, timeout=5, headers={
                        "Referer": "https://finance.sina.com.cn/",
                    })
                    sresp.encoding = "gbk"
                    for line in sresp.text.strip().split("\n"):
                        m = re.match(r'var hq_str_(\w+)="(.*)"', line)
                        if m:
                            market_code = m.group(1)       # 如 sh600519
                            fields = m.group(2).split(",")
                            stock_code = market_code[2:]    # 去掉市场前缀
                            if len(fields) > 3:
                                try:
                                    name = fields[0]
                                    yesterday_close = float(fields[2]) if fields[2] else 0  # 昨收
                                    current_price = float(fields[3]) if fields[3] else 0    # 当前价
                                    if yesterday_close > 0:
                                        change_pct = ((current_price - yesterday_close) / yesterday_close) * 100
                                    else:
                                        change_pct = 0
                                    # 回填实时行情数据到重仓股列表
                                    for h in holdings:
                                        if h["code"] == stock_code:
                                            h["price"] = current_price
                                            h["change_pct"] = round(change_pct, 2)
                                            # 如果之前未获取到名称，用新浪返回的名称
                                            if not h["name"] or h["name"] == stock_code:
                                                h["name"] = name
                                            break
                                except (ValueError, IndexError):
                                    pass
                except Exception as e:
                    print(f"Sina stock API error: {e}")

        result = {"holdings": holdings}
        holdings_cache.set(code, result)
        return result
    except Exception as e:
        print(f"Failed to fetch holdings for {code}: {e}")
        traceback.print_exc()
    return None


def search_funds(query: str) -> list:
    load_fund_list()
    q_lower = query.lower()
    matches = []
    for f in _fund_list:
        if f["code"].startswith(query) or q_lower in f["name"].lower():
            matches.append(f)
            if len(matches) >= 10:
                break
    return matches


STOCK_FUND_CACHE_TTL = 300  # 5分钟缓存


def search_funds_by_stock(stock_code: str) -> list:
    """
    反查持有某只股票的基金列表（不限于重仓）。

    通过东方财富datacenter FREEHOLDERS接口获取所有持有该股票的基金，
    按持仓占比降序排序。

    Args:
        stock_code: 6位股票代码

    Returns:
        list: [{fund_code, fund_name, fund_type, holding_pct}]
    """
    from cache import stock_fund_cache

    cache_key = f"stock_fund_{stock_code}"
    cached = stock_fund_cache.get(cache_key, STOCK_FUND_CACHE_TTL)
    if cached is not None:
        return cached

    funds = []

    # --- 主方案：东方财富 datacenter FREEHOLDERS 接口（返回所有持有该股的基金） ---
    try:
        limiter.acquire("eastmoney")
        url = "https://datacenter.eastmoney.com/securities/api/data/get"
        params = {
            "type": "RPT_F10_EH_FREEHOLDERS",
            "sty": "HOLDER_CODE,HOLDER_NAME,FREE_HOLDNUM_RATIO,END_DATE",
            "filter": f'(SECURITY_CODE="{stock_code}")(HOLDER_NEWTYPE="基金")',
            "p": "1",
            "ps": "500",
            "source": "HSF10",
        }
        resp = requests.get(url, timeout=15, params=params, headers={
            "User-Agent": "Mozilla/5.0",
        })
        data = resp.json()
        if data.get("success") and data.get("result") and data["result"].get("data"):
            # 去重：每只基金只保留最新报告期
            latest = {}
            for item in data["result"]["data"]:
                code = item.get("HOLDER_CODE", "")
                end_date = item.get("END_DATE", "")
                if code and (code not in latest or end_date > latest[code]["end_date"]):
                    latest[code] = {
                        "end_date": end_date,
                        "fund_code": code,
                        "fund_name": item.get("HOLDER_NAME", ""),
                        "holding_pct": item.get("FREE_HOLDNUM_RATIO", 0) or 0,
                    }
            for entry in latest.values():
                funds.append({
                    "fund_code": entry["fund_code"],
                    "fund_name": entry["fund_name"],
                    "fund_type": "",
                    "holding_pct": round(float(entry["holding_pct"]), 2),
                })
    except Exception as e:
        print(f"FREEHOLDERS API failed for {stock_code}: {e}")

    # --- 备用方案：原有 zjcc 接口（仅重仓基金） ---
    if not funds:
        try:
            limiter.acquire("eastmoney")
            url = (
                f"https://fundf10.eastmoney.com/FundArchivesDatas.aspx"
                f"?type=zjcc&code={stock_code}&topline=20"
            )
            resp = requests.get(url, timeout=10, headers=HEADERS)
            resp.encoding = "utf-8"
            text = resp.text

            match = re.search(r'content:"(.*?)"', text, re.DOTALL)
            if match:
                html = match.group(1)
                rows = re.findall(r"<tr>(.*?)</tr>", html, re.DOTALL)
                for row in rows[1:]:
                    tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
                    if len(tds) >= 5:
                        fund_code_match = re.search(r'<a[^>]*href="[^"]*?(\d{6})\.html"[^>]*>([^<]*)</a>', tds[0] + tds[1], re.DOTALL)
                        if not fund_code_match:
                            code_m = re.search(r'(\d{6})', tds[0])
                            name_m = re.search(r'<a[^>]*>([^<]+)</a>', tds[1] if len(tds) > 1 else tds[0])
                            if code_m and name_m:
                                fund_code = code_m.group(1)
                                fund_name = name_m.group(1).strip()
                            else:
                                continue
                        else:
                            fund_code = fund_code_match.group(1)
                            fund_name = fund_code_match.group(2).strip()

                        pct = 0
                        for td in reversed(tds):
                            pct_m = re.search(r"([\d.]+)%", td)
                            if pct_m:
                                pct = float(pct_m.group(1))
                                break

                        fund_type = ""
                        type_m = re.search(r'[一-鿿]+(?:型|基金)', "".join(tds[2:4]))
                        if type_m:
                            fund_type = type_m.group(0)

                        funds.append({
                            "fund_code": fund_code,
                            "fund_name": fund_name,
                            "fund_type": fund_type,
                            "holding_pct": pct,
                        })
        except Exception as e:
            print(f"zjcc fallback failed for {stock_code}: {e}")

    # 按持仓占比降序排序
    funds.sort(key=lambda x: x.get("holding_pct", 0), reverse=True)

    stock_fund_cache.set(cache_key, funds)
    return funds
