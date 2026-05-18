import re
import json
import time
import math
import base64
import statistics
import traceback
import os
from io import BytesIO
from pathlib import Path

import requests
from flask import Flask, render_template, jsonify, request
from flask_cors import CORS

# Load config
_CONFIG_PATH = Path(__file__).parent / "config.json"
CONFIG = json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.exists() else {}

# Rate limiter
from ratelimit import limiter
_em_cfg = CONFIG.get("api", {}).get("eastmoney", {})
_sina_cfg = CONFIG.get("api", {}).get("sina", {})
limiter.configure("eastmoney", _em_cfg.get("rate_limit_per_second", 5))
limiter.configure("sina", _sina_cfg.get("rate_limit_per_second", 3))

app = Flask(__name__)
CORS(app)

# Caches
_est_cache = {}  # fund estimation cache
_perf_cache = {}  # fund performance cache
_holdings_cache = {}  # fund holdings cache
CACHE_TTL = 30
PERF_CACHE_TTL = 300  # 5min for performance data
HOLDINGS_CACHE_TTL = 300

_fund_list = []
_fund_list_loaded = False

# AI config
_AI_CFG = CONFIG.get("ai", {})
_AI_BASE_URL = os.getenv("AI_BASE_URL", _AI_CFG.get("base_url", "http://120.224.38.132:7361"))
_AI_API_KEY = os.getenv("AI_API_KEY", _AI_CFG.get("api_key", ""))
_AI_MODEL = os.getenv("AI_MODEL", _AI_CFG.get("model", "gpt-5.5"))
_AI_TIMEOUT = int(os.getenv("AI_TIMEOUT_SECONDS", _AI_CFG.get("timeout_seconds", 60)))


def _call_ai_api(messages: list, stream: bool = False, retries: int = 3):
    """Call OpenAI-compatible chat completions API."""
    url = f"{_AI_BASE_URL}/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {_AI_API_KEY}",
    }
    payload = {
        "model": _AI_MODEL,
        "messages": messages,
        "stream": stream,
    }
    last_err = None
    for attempt in range(retries):
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=_AI_TIMEOUT, stream=stream)
            if resp.status_code >= 500:
                last_err = f"API返回 {resp.status_code}"
                time.sleep(2)
                continue
            resp.raise_for_status()
            if stream:
                resp.encoding = "utf-8"
                return resp
            # Use raw bytes to avoid encoding issues
            data = json.loads(resp.content)
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            last_err = str(e)
            if attempt < retries - 1:
                time.sleep(2)
                continue
    raise Exception(f"AI API调用失败({retries}次重试): {last_err}")


HEADERS = {"Referer": "http://fund.eastmoney.com/"}


def _load_fund_list():
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
        match = re.search(r"var r = (\[.*?\]);", resp.text, re.DOTALL)
        if match:
            raw = json.loads(match.group(1))
            _fund_list = [
                {"code": item[0], "name": item[2], "type": item[3]}
                for item in raw
            ]
            _fund_list_loaded = True
    except Exception as e:
        print(f"Failed to load fund list: {e}")


def _fetch_fund_estimation(code: str) -> dict | None:
    now = time.time()
    cached = _est_cache.get(code)
    if cached and now - cached["ts"] < CACHE_TTL:
        return cached["data"]
    try:
        limiter.acquire("eastmoney")
        url = f"https://fundgz.1234567.com.cn/js/{code}.js"
        resp = requests.get(url, timeout=5, headers=HEADERS)
        match = re.search(rb"jsonpgz\(({.*?})\)", resp.content)
        if match:
            data = json.loads(match.group(1))
            result = {
                "code": data.get("fundcode", ""),
                "name": data.get("name", ""),
                "nav_date": data.get("jzrq", ""),
                "nav": data.get("dwjz", ""),
                "estimated_nav": data.get("gsz", ""),
                "estimated_change_pct": data.get("gszzl", "0"),
                "estimation_time": data.get("gztime", ""),
            }
            _est_cache[code] = {"data": result, "ts": now}
            return result
    except Exception as e:
        print(f"Failed to fetch fund {code}: {e}")

    # Fallback: try Sina stock API for LOF/ETF funds that trade on exchanges
    try:
        limiter.acquire("sina")
        # Determine market prefix for exchange-traded funds
        # 16xxxx = sz (Shenzhen LOF), 5xxxxx = sh (Shanghai ETF), 6xxxxx = sh
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
        m = re.match(r'var hq_str_\w+="(.*)"', sresp.text.strip())
        if m and m.group(1):
            fields = m.group(1).split(",")
            if len(fields) >= 4:
                name = fields[0].strip()
                current = float(fields[3]) if fields[3] else 0
                yesterday_close = float(fields[2]) if fields[2] else 0
                if yesterday_close > 0:
                    change_pct = str(round((current - yesterday_close) / yesterday_close * 100, 2))
                else:
                    change_pct = "0"
                result = {
                    "code": code,
                    "name": name,
                    "nav_date": fields[30] if len(fields) > 30 else "",
                    "nav": str(yesterday_close),
                    "estimated_nav": str(current),
                    "estimated_change_pct": change_pct,
                    "estimation_time": fields[31] if len(fields) > 31 else "",
                }
                _est_cache[code] = {"data": result, "ts": now}
                return result
    except Exception as e:
        print(f"Sina fallback for {code} failed: {e}")

    return None


def _fetch_fund_performance(code: str) -> dict | None:
    now = time.time()
    cached = _perf_cache.get(code)
    if cached and now - cached["ts"] < PERF_CACHE_TTL:
        return cached["data"]
    try:
        limiter.acquire("eastmoney")
        url = f"https://fund.eastmoney.com/pingzhongdata/{code}.js"
        resp = requests.get(url, timeout=10, headers=HEADERS)
        resp.encoding = "utf-8"
        text = resp.text

        # Net worth trend
        trend = []
        match = re.search(r"var Data_netWorthTrend\s*=\s*(\[.*?\]);", text, re.DOTALL)
        if match:
            raw = json.loads(match.group(1))
            trend = [
                {"date": item["x"], "nav": item["y"], "return": item.get("equityReturn", 0)}
                for item in raw
            ]

        # Returns
        returns = {}
        for key, label in [("syl_1n", "1y"), ("syl_6y", "6m"), ("syl_3y", "3m"), ("syl_1y", "1m")]:
            m = re.search(rf"var {key}\s*=\s*\"(.*?)\"", text)
            if m:
                try:
                    returns[label] = float(m.group(1))
                except ValueError:
                    pass

        result = {"trend": trend, "returns": returns}
        _perf_cache[code] = {"data": result, "ts": now}
        return result
    except Exception as e:
        print(f"Failed to fetch performance for {code}: {e}")
    return None


def _fetch_fund_holdings(code: str) -> dict | None:
    now = time.time()
    cached = _holdings_cache.get(code)
    if cached and now - cached["ts"] < HOLDINGS_CACHE_TTL:
        return cached["data"]
    try:
        # Get holdings from FundArchivesDatas
        url = f"https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code={code}&topline=10"
        resp = requests.get(url, timeout=10, headers=HEADERS)
        resp.encoding = "utf-8"
        text = resp.text

        holdings = []
        match = re.search(r"content:\"(.*?)\"", text, re.DOTALL)
        if match:
            html = match.group(1)
            rows = re.findall(r"<tr>(.*?)</tr>", html, re.DOTALL)
            for row in rows[1:]:  # skip header
                tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
                if len(tds) >= 7:
                    code_match = re.search(r"<a[^>]*>([^<]+)</a>", tds[1])
                    name_match = re.search(r"<a[^>]*>([^<]+)</a>", tds[2])
                    pct_match = re.search(r"([\d.]+)%", tds[6])
                    if code_match and name_match:
                        stock_code = code_match.group(1).strip()
                        stock_name = name_match.group(1).strip()
                        pct = float(pct_match.group(1)) if pct_match else 0
                        holdings.append({
                            "code": stock_code,
                            "name": stock_name,
                            "pct": pct,
                        })

        # Get real-time stock prices from Sina
        if holdings:
            stock_list = []
            for h in holdings:
                c = h["code"]
                # Determine market prefix
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
                    sina_url = f"https://hq.sinajs.cn/list={','.join(stock_list)}"
                    sresp = requests.get(sina_url, timeout=5, headers={
                        "Referer": "https://finance.sina.com.cn/",
                    })
                    sresp.encoding = "gbk"
                    for line in sresp.text.strip().split("\n"):
                        m = re.match(r'var hq_str_(\w+)="(.*)"', line)
                        if m:
                            market_code = m.group(1)
                            fields = m.group(2).split(",")
                            stock_code = market_code[2:]
                            if len(fields) > 3:
                                try:
                                    name = fields[0]
                                    yesterday_close = float(fields[2]) if fields[2] else 0
                                    current_price = float(fields[3]) if fields[3] else 0
                                    if yesterday_close > 0:
                                        change_pct = ((current_price - yesterday_close) / yesterday_close) * 100
                                    else:
                                        change_pct = 0
                                    # Find matching holding
                                    for h in holdings:
                                        if h["code"] == stock_code:
                                            h["price"] = current_price
                                            h["change_pct"] = round(change_pct, 2)
                                            if not h["name"] or h["name"] == stock_code:
                                                h["name"] = name
                                            break
                                except (ValueError, IndexError):
                                    pass
                except Exception as e:
                    print(f"Sina stock API error: {e}")

        result = {"holdings": holdings}
        _holdings_cache[code] = {"data": result, "ts": now}
        return result
    except Exception as e:
        print(f"Failed to fetch holdings for {code}: {e}")
        traceback.print_exc()
    return None


# --- Routes ---

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/fund/<code>")
def get_fund(code: str):
    code = code.strip()
    if not re.match(r"^\d{6}$", code):
        return jsonify({"error": "基金代码格式不正确"}), 400
    result = _fetch_fund_estimation(code)
    if result is None:
        return jsonify({"error": f"无法获取基金 {code} 的数据"}), 404
    return jsonify(result)


@app.route("/api/fund/batch", methods=["POST"])
def batch_fund():
    data = request.get_json(force=True)
    codes = data.get("codes", [])
    if not codes:
        return jsonify({"error": "请提供基金代码列表"}), 400
    results = []
    for code in codes:
        code = str(code).strip()
        if re.match(r"^\d{6}$", code):
            fund = _fetch_fund_estimation(code)
            if fund:
                results.append(fund)
            else:
                results.append({"code": code, "error": "获取数据失败"})
    return jsonify(results)


@app.route("/api/fund/search")
def search_fund():
    _load_fund_list()
    q = request.args.get("q", "").strip()
    if len(q) < 1:
        return jsonify([])
    q_lower = q.lower()
    matches = []
    for f in _fund_list:
        if f["code"].startswith(q) or q_lower in f["name"].lower():
            matches.append(f)
            if len(matches) >= 10:
                break
    return jsonify(matches)


@app.route("/api/fund/holdings/<code>")
def get_holdings(code: str):
    code = code.strip()
    if not re.match(r"^\d{6}$", code):
        return jsonify({"error": "基金代码格式不正确"}), 400
    result = _fetch_fund_holdings(code)
    if result is None:
        return jsonify({"error": "获取重仓股数据失败"}), 500
    return jsonify(result)


@app.route("/api/fund/performance/<code>")
def get_performance(code: str):
    code = code.strip()
    if not re.match(r"^\d{6}$", code):
        return jsonify({"error": "基金代码格式不正确"}), 400
    result = _fetch_fund_performance(code)
    if result is None:
        return jsonify({"error": "获取业绩走势数据失败"}), 500
    return jsonify(result)


@app.route("/api/fund/signal/<code>")
def get_signal(code: str):
    """Buy/sell signal based on historical data analysis."""
    code = code.strip()
    if not re.match(r"^\d{6}$", code):
        return jsonify({"error": "基金代码格式不正确"}), 400

    perf = _fetch_fund_performance(code)
    est = _fetch_fund_estimation(code)
    if not perf or not est:
        return jsonify({"error": "获取数据失败"}), 500

    try:
        result = _calculate_signal(perf, est)
        return jsonify(result)
    except Exception as e:
        print(f"Signal calc error: {e}")
        traceback.print_exc()
        return jsonify({"error": "计算信号失败"}), 500


def _calculate_signal(perf: dict, est: dict) -> dict:
    """
    Multi-factor buy/sell signal:
    1. MA position: price vs moving averages (20/60/120/250 day)
    2. RSI: overbought/oversold
    3. Trend: recent momentum (5/10/20 day returns)
    4. Drawdown: current drawdown from peak
    5. Percentile: current NAV percentile in history
    """
    trend = perf.get("trend", [])
    returns = perf.get("returns", {})
    current_nav = float(est.get("nav", 0))
    change_pct = float(est.get("estimated_change_pct", 0))

    if len(trend) < 14:
        return {"signal": "数据不足", "buy_score": 50, "sell_score": 50,
                "factors": [], "summary": "基金成立时间较短，数据不足，建议观望"}

    # For funds with limited history (14-60 days), use what we have
    has_full_data = len(trend) >= 60

    navs = [p["nav"] for p in trend]
    daily_returns = [p["return"] for p in trend]
    latest_nav = current_nav if current_nav > 0 else navs[-1]

    factors = []
    buy_score = 50  # 0=strong sell, 100=strong buy

    # --- Factor 1: MA position ---
    ma_scores = []
    for window in [20, 60, 120, 250]:
        if len(navs) >= window:
            ma = sum(navs[-window:]) / window
            ratio = (latest_nav - ma) / ma
            # Above MA = bullish, below = bearish
            ma_score = 50 + min(max(ratio * 500, -25), 25)
            ma_scores.append(ma_score)
            factors.append({
                "name": f"MA{window}",
                "value": f"{latest_nav:.4f} vs {ma:.4f}",
                "detail": f"{'高于' if ratio > 0 else '低于'}均线 {abs(ratio)*100:.1f}%",
                "score": round(ma_score),
            })
    if ma_scores:
        buy_score += (sum(ma_scores) / len(ma_scores) - 50) * 0.3

    # --- Factor 2: RSI (14-day) ---
    if len(daily_returns) >= 14:
        recent = daily_returns[-14:]
        gains = [r for r in recent if r > 0]
        losses = [-r for r in recent if r < 0]
        avg_gain = sum(gains) / 14 if gains else 0
        avg_loss = sum(losses) / 14 if losses else 0.001
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))

        if rsi < 30:
            rsi_score = 75  # oversold = buy signal
            rsi_label = "超卖区"
        elif rsi < 40:
            rsi_score = 62
            rsi_label = "偏弱"
        elif rsi > 70:
            rsi_score = 25  # overbought = sell signal
            rsi_label = "超买区"
        elif rsi > 60:
            rsi_score = 38
            rsi_label = "偏强"
        else:
            rsi_score = 50
            rsi_label = "中性"

        buy_score += (rsi_score - 50) * 0.2
        factors.append({
            "name": "RSI(14)",
            "value": f"{rsi:.1f}",
            "detail": rsi_label,
            "score": round(rsi_score),
        })

    # --- Factor 3: Recent momentum (use available windows) ---
    momentum_windows = [w for w in [5, 10, 20] if len(navs) >= w]
    if not momentum_windows and len(navs) >= 3:
        momentum_windows = [3]
    for window in momentum_windows:
            ret = (latest_nav - navs[-window]) / navs[-window] * 100
            # Recent drop = opportunity, recent surge = caution
            mom_score = 50 - ret * 2  # negative ret -> higher score
            mom_score = max(20, min(80, mom_score))
            buy_score += (mom_score - 50) * 0.15
            factors.append({
                "name": f"近{window}日收益",
                "value": f"{ret:+.2f}%",
                "detail": "回调机会" if ret < -3 else "涨幅较大" if ret > 5 else "正常波动",
                "score": round(mom_score),
            })

    # --- Factor 4: Drawdown from peak ---
    if len(navs) >= 14:
        peak = max(navs[-250:]) if len(navs) >= 250 else max(navs)
        dd = (latest_nav - peak) / peak * 100
        if dd < -20:
            dd_score = 80
        elif dd < -10:
            dd_score = 65
        elif dd < -5:
            dd_score = 55
        elif dd > 0:
            dd_score = 35
        else:
            dd_score = 50
        buy_score += (dd_score - 50) * 0.15
        factors.append({
            "name": "回撤幅度",
            "value": f"{dd:+.1f}%",
            "detail": "深度回调" if dd < -15 else "适度回调" if dd < -5 else "接近高位" if dd > -2 else "高位",
            "score": round(dd_score),
        })

    # --- Factor 5: NAV percentile ---
    if len(navs) >= 20:
        sorted_navs = sorted(navs)
        rank = sum(1 for n in sorted_navs if n <= latest_nav)
        pct = rank / len(sorted_navs) * 100
        if pct < 20:
            pct_score = 75
        elif pct < 40:
            pct_score = 60
        elif pct > 80:
            pct_score = 25
        elif pct > 60:
            pct_score = 40
        else:
            pct_score = 50
        buy_score += (pct_score - 50) * 0.2
        factors.append({
            "name": "历史分位",
            "value": f"{pct:.0f}%",
            "detail": "偏低区域" if pct < 30 else "中等区域" if pct < 70 else "偏高区域",
            "score": round(pct_score),
        })

    # Clamp final score
    buy_score = max(5, min(95, round(buy_score)))
    sell_score = 100 - buy_score

    # Determine signal
    if buy_score >= 75:
        signal = "强烈建议买入"
        signal_en = "strong_buy"
        color = "up"
    elif buy_score >= 60:
        signal = "建议买入"
        signal_en = "buy"
        color = "up"
    elif buy_score >= 45:
        signal = "观望"
        signal_en = "hold"
        color = "flat"
    elif buy_score >= 30:
        signal = "建议卖出"
        signal_en = "sell"
        color = "down"
    else:
        signal = "强烈建议卖出"
        signal_en = "strong_sell"
        color = "down"

    # Summary
    bullish = sum(1 for f in factors if f["score"] >= 55)
    bearish = sum(1 for f in factors if f["score"] <= 45)
    summary = f"共{len(factors)}项指标，{bullish}项看多，{bearish}项看空。"
    if change_pct:
        summary += f"今日估值{change_pct:+.2f}%。"

    return {
        "signal": signal,
        "signal_en": signal_en,
        "color": color,
        "buy_score": buy_score,
        "sell_score": sell_score,
        "factors": factors,
        "summary": summary,
    }


@app.route("/api/import/text", methods=["POST"])
def import_text():
    data = request.get_json(force=True)
    text = data.get("text", "")
    if not text.strip():
        return jsonify({"error": "请粘贴持仓数据"}), 400

    _load_fund_list()

    def resolve_code_or_name(code, name):
        """Resolve fund code and name. Either can be empty, we'll look up the other."""
        # If we have a valid code, fetch the name
        if code and re.match(r"^\d{6}$", code):
            if not name:
                fund_data = _fetch_fund_estimation(code)
                if fund_data and "error" not in fund_data:
                    name = fund_data.get("name", "")
                else:
                    # Try fund list as fallback
                    for f in _fund_list:
                        if f["code"] == code:
                            name = f["name"]
                            break
            return code, name
        # If we only have name, look up code from fund list
        if name:
            for f in _fund_list:
                if f["name"] == name or name in f["name"]:
                    found_code = f["code"]
                    found_name = f["name"]
                    if not code:
                        code = found_code
                    return code, found_name
            # Fund list miss — try online search via eastmoney suggest API
            try:
                limiter.acquire("eastmoney")
                sresp = requests.get(
                    f"https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx",
                    params={"m": 1, "key": name, "_": int(time.time() * 1000)},
                    timeout=5,
                )
                sdata = sresp.json() if sresp.ok else {}
                datas = sdata.get("Datas", [])
                for d in datas:
                    fund_code = d.get("CODE", "")
                    fund_name = d.get("NAME", "")
                    if fund_code and re.match(r"^\d{6}$", fund_code):
                        return fund_code, fund_name
            except Exception:
                pass
        return None, None

    def extract_amounts(nearby):
        """Extract value and profit from nearby text."""
        value, profit = 0, 0
        # Match numbers with optional commas and optional decimals
        amounts = re.findall(r"([\d,]+(?:\.\d{1,2})?)", nearby)
        # Filter out pure integers that look like fund codes (6 digits) or years
        amounts = [a for a in amounts if not re.match(r"^\d{6}$", a.replace(",", ""))]
        if amounts:
            amounts_float = [float(a.replace(",", "")) for a in amounts]
            value = max(amounts_float)
            profit_matches = re.findall(r"([+-]?[\d,]+(?:\.\d{1,2})?)", nearby)
            profit_matches = [p for p in profit_matches if not re.match(r"^[+-]?\d{6}$", p.replace(",", ""))]
            if len(profit_matches) >= 2:
                vals = [float(p.replace(",", "")) for p in profit_matches]
                value = max(vals)
                profit = min(vals, key=lambda x: abs(x)) if len(vals) > 1 else 0
        return value, profit

    # Try JSON format first
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            results = []
            seen = set()
            for item in parsed:
                code = str(item.get("code", "")).strip()
                name = str(item.get("name", "")).strip()
                value = float(item.get("value", 0) or 0)
                profit = float(item.get("profit", 0) or 0)
                resolved_code, resolved_name = resolve_code_or_name(code if re.match(r"^\d{6}$", code) else "", name)
                if not resolved_code or resolved_code in seen:
                    continue
                seen.add(resolved_code)
                results.append({
                    "code": resolved_code,
                    "name": resolved_name or "",
                    "value": value,
                    "profit": profit,
                })
            return jsonify(results)
    except (json.JSONDecodeError, TypeError, ValueError):
        pass

    # Plain text parsing
    results = []
    seen = set()
    lines = text.strip().split("\n")
    buffer = ""
    for line in lines:
        buffer += " " + line.strip()

    # Try to parse line by line for better context
    for line in lines:
        line = line.strip()
        if not line:
            continue

        code_match = re.search(r"\b(\d{6})\b", line)
        code = code_match.group(1) if code_match else ""

        # Extract potential fund name (Chinese text before the code or at the start)
        name = ""
        if code_match:
            name_part = line[:code_match.start()].strip()
            # Clean up separators
            name_part = re.sub(r"[，,、|/\-]+", "", name_part).strip()
            if name_part and re.search(r"[一-鿿]", name_part):
                name = name_part
        else:
            # No code found, try to extract name from the line
            name_match = re.search(r"([一-鿿][一-鿿A-Za-z0-9（）()]+)", line)
            if name_match:
                name = name_match.group(1)

        # Extract amounts from this line
        value, profit = extract_amounts(line)

        resolved_code, resolved_name = resolve_code_or_name(code, name)
        if not resolved_code or resolved_code in seen:
            continue
        seen.add(resolved_code)
        results.append({
            "code": resolved_code,
            "name": resolved_name or "",
            "value": value,
            "profit": profit,
        })

    # If line-by-line found nothing, try buffer-level code extraction as fallback
    if not results:
        codes_found = re.findall(r"\b(\d{6})\b", buffer)
        for code in codes_found:
            if code in seen:
                continue
            code_pos = buffer.find(code)
            nearby = buffer[max(0, code_pos - 50):code_pos + 200] if code_pos >= 0 else ""
            value, profit = extract_amounts(nearby)
            resolved_code, resolved_name = resolve_code_or_name(code, "")
            if not resolved_code or resolved_code in seen:
                continue
            seen.add(resolved_code)
            results.append({
                "code": resolved_code,
                "name": resolved_name or "",
                "value": value,
                "profit": profit,
            })

    # Final fallback: if still nothing, try matching all fund names in the text
    if not results:
        for f in _fund_list:
            if f["name"] in buffer and f["code"] not in seen:
                seen.add(f["code"])
                # Try to find amounts near the name
                name_pos = buffer.find(f["name"])
                nearby = buffer[name_pos:name_pos + 200] if name_pos >= 0 else ""
                value, profit = extract_amounts(nearby)
                results.append({
                    "code": f["code"],
                    "name": f["name"],
                    "value": value,
                    "profit": profit,
                })

    return jsonify(results)


@app.route("/api/import/image", methods=["POST"])
def import_image():
    data = request.get_json(force=True)
    img_data = data.get("image", "")
    if not img_data:
        return jsonify({"error": "请上传图片"}), 400

    try:
        # Ensure image has proper data URI prefix for vision API
        if not img_data.startswith("data:"):
            img_data = "data:image/jpeg;base64," + img_data

        prompt = (
            "请仔细识别这张基金持仓截图中显示的【每一只】基金信息，不要遗漏任何一只。"
            "请逐一查看截图中每一行基金条目，确保数量完整。\n"
            "严格按以下JSON数组格式返回，不要添加其他文字：\n"
            '[{"name":"基金名称","code":"基金代码6位数字","value":持有金额,"profit":持仓收益}]\n'
            "如果某项无法识别，value和profit填0。只返回JSON数组，不要有其他内容。\n"
            "请特别注意：可能有5只或更多基金，每只都要列出，不可遗漏。"
        )

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": img_data}},
                ],
            }
        ]

        result_text = _call_ai_api(messages, stream=False)

        # Extract JSON array from response
        json_match = re.search(r'\[.*\]', result_text, re.DOTALL)
        if not json_match:
            return jsonify({"error": "AI未能识别出基金数据，请尝试更清晰的截图"}), 400

        parsed = json.loads(json_match.group(0))

        results = []
        seen = set()
        _load_fund_list()
        for item in parsed:
            code = str(item.get("code", "")).strip()
            name = item.get("name", "").strip()
            value = float(item.get("value", 0) or 0)
            profit = float(item.get("profit", 0) or 0)

            # If code is empty or placeholder, try to find by name
            if not re.match(r"^\d{6}$", code) or code == "000000":
                if name:
                    for f in _fund_list:
                        if f["name"] == name or name in f["name"]:
                            code = f["code"]
                            break
                if not re.match(r"^\d{6}$", code) or code == "000000":
                    continue

            if code in seen:
                continue
            seen.add(code)

            entry = {
                "code": code,
                "name": name,
                "value": value,
                "profit": profit,
            }

            # Validate fund code exists — try estimation first, fall back to fund list
            fund_data = _fetch_fund_estimation(code)
            if fund_data and "error" not in fund_data:
                if not entry["name"]:
                    entry["name"] = fund_data.get("name", "")
                results.append(entry)
            else:
                # Estimation API may fail for some funds (LOF, closed-end etc.)
                # Check if code exists in fund list instead
                found = any(f["code"] == code for f in _fund_list)
                if found:
                    if not entry["name"]:
                        for f in _fund_list:
                            if f["code"] == code:
                                entry["name"] = f["name"]
                                break
                    results.append(entry)

        return jsonify(results)
    except requests.exceptions.Timeout:
        return jsonify({"error": "AI服务响应超时，请稍后重试"}), 504
    except Exception as e:
        print(f"AI image recognition error: {e}")
        traceback.print_exc()
        return jsonify({"error": f"图片识别失败: {str(e)}"}), 500


@app.route("/api/ai/recognize-image", methods=["POST"])
def ai_recognize_image():
    """Standalone AI image recognition endpoint.
    Accepts an image and returns recognized fund data (name, code, value, profit).
    Also returns the raw AI text so it can be used in other contexts.
    """
    data = request.get_json(force=True)
    img_data = data.get("image", "")
    if not img_data:
        return jsonify({"error": "请上传图片"}), 400

    try:
        if not img_data.startswith("data:"):
            img_data = "data:image/jpeg;base64," + img_data

        custom_prompt = data.get("prompt", "")
        if not custom_prompt:
            custom_prompt = (
                "请识别这张图片中的内容。如果包含基金持仓信息，请按以下JSON数组格式返回：\n"
                '[{"name":"基金名称","code":"基金代码6位数字","value":持有金额,"profit":持仓收益}]\n'
                "如果图片不包含基金信息，请用中文详细描述图片中的所有内容。"
                "只返回JSON数组或文字描述，不要有其他内容。"
            )

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": custom_prompt},
                    {"type": "image_url", "image_url": {"url": img_data}},
                ],
            }
        ]

        result_text = _call_ai_api(messages, stream=False)

        # Try to extract fund data
        json_match = re.search(r'\[.*\]', result_text, re.DOTALL)
        funds = []
        if json_match:
            try:
                parsed = json.loads(json_match.group(0))
                seen = set()
                for item in parsed:
                    code = str(item.get("code", "")).strip()
                    name = item.get("name", "").strip()

                    if not re.match(r"^\d{6}$", code) or code == "000000":
                        if name:
                            _load_fund_list()
                            for f in _fund_list:
                                if f["name"] == name or name in f["name"]:
                                    code = f["code"]
                                    break
                        if not re.match(r"^\d{6}$", code) or code == "000000":
                            continue

                    if code in seen:
                        continue
                    seen.add(code)

                    entry = {
                        "code": code,
                        "name": name,
                        "value": float(item.get("value", 0) or 0),
                        "profit": float(item.get("profit", 0) or 0),
                    }
                    fund_data = _fetch_fund_estimation(code)
                    if fund_data and "error" not in fund_data:
                        if not entry["name"]:
                            entry["name"] = fund_data.get("name", "")
                        funds.append(entry)
                    else:
                        _load_fund_list()
                        found = any(f["code"] == code for f in _fund_list)
                        if found:
                            if not entry["name"]:
                                for f in _fund_list:
                                    if f["code"] == code:
                                        entry["name"] = f["name"]
                                        break
                            funds.append(entry)
            except json.JSONDecodeError:
                pass

        return jsonify({
            "funds": funds,
            "text": result_text,
        })
    except requests.exceptions.Timeout:
        return jsonify({"error": "AI服务响应超时，请稍后重试"}), 504
    except Exception as e:
        print(f"AI recognize-image error: {e}")
        traceback.print_exc()
        return jsonify({"error": f"图片识别失败: {str(e)}"}), 500


@app.route("/api/ai/chat", methods=["POST"])
def ai_chat():
    data = request.get_json(force=True)
    messages = data.get("messages", [])
    if not messages:
        return jsonify({"error": "请输入消息"}), 400

    # Prepend system message
    sys_msg = {
        "role": "system",
        "content": (
            "你是一个专业的基金投资助手。你可以帮助用户分析基金、解答投资问题、"
            "提供市场见解。回答要简洁专业，使用中文。如果用户问到具体基金，"
            "可以给出分析建议，但要提醒投资有风险。"
        ),
    }
    full_messages = [sys_msg] + messages

    try:
        resp = _call_ai_api(full_messages, stream=True)

        def generate():
            for line in resp.iter_lines(decode_unicode=True):
                if not line:
                    continue
                line = line.strip()
                if line.startswith("data: "):
                    payload = line[6:]
                    if payload == "[DONE]":
                        yield "data: [DONE]\n\n"
                        break
                    try:
                        chunk = json.loads(payload)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield f"data: {json.dumps({'content': content}, ensure_ascii=False)}\n\n"
                    except json.JSONDecodeError:
                        continue

        return app.response_class(
            generate(),
            mimetype="text/event-stream; charset=utf-8",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )
    except requests.exceptions.Timeout:
        return jsonify({"error": "AI服务响应超时"}), 504
    except Exception as e:
        print(f"AI chat error: {e}")
        traceback.print_exc()
        return jsonify({"error": f"AI服务异常: {str(e)}"}), 500


_recommend_cache = {}
RECOMMEND_CACHE_TTL = 600  # 10 minutes


_pool_cache = {}
POOL_CACHE_TTL = 300  # 5 min


def _fetch_fund_pool() -> list:
    """Multi-dimensional fund pool collection from Eastmoney ranking API.
    Fetches top funds across different fund types and time periods, deduplicates,
    and extracts return data for scoring.
    """
    global _pool_cache
    now = time.time()
    if _pool_cache and now - _pool_cache.get("ts", 0) < POOL_CACHE_TTL:
        return _pool_cache["data"]

    sources = [
        ("all", "6yzf", 30),   # All funds - 6 month returns
        ("all", "1nzf", 30),   # All funds - 1 year returns
        ("gp", "6yzf", 30),    # Stock funds - 6 month
        ("gp", "1nzf", 30),    # Stock funds - 1 year
        ("hh", "6yzf", 30),    # Mixed funds - 6 month
        ("hh", "1nzf", 30),    # Mixed funds - 1 year
    ]
    seen = set()
    pool = []

    for ft, sc, pn in sources:
        try:
            url = (
                f"http://fund.eastmoney.com/data/rankhandler.aspx"
                f"?op=ph&dt=kf&ft={ft}&rs=&gs=0&sc={sc}&st=desc&pi=1&pn={pn}"
            )
            limiter.acquire("eastmoney")
            resp = requests.get(url, timeout=10, headers=HEADERS)
            resp.encoding = "gbk"
            text = resp.text

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

                # Parse returns from ranking data
                def _safe_float(s):
                    try:
                        return float(s) if s and s.strip() != "" else None
                    except (ValueError, TypeError):
                        return None

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

    _pool_cache = {"data": pool, "ts": now}
    return pool


def _quick_score(fund_data: dict) -> float:
    """Quick score using only ranking API data (no extra API calls).
    Based on multi-period return consistency and magnitude.
    Returns a score 0-100.
    """
    returns = {
        "1m": fund_data.get("returns_1m"),
        "3m": fund_data.get("returns_3m"),
        "6m": fund_data.get("returns_6m"),
        "1y": fund_data.get("returns_1y"),
    }

    # Factor 1: Weighted return (60%)
    ret_weights = {"1m": 0.10, "3m": 0.20, "6m": 0.35, "1y": 0.35}
    ret_sum = 0
    ret_w_sum = 0
    for period, w in ret_weights.items():
        val = returns.get(period)
        if val is not None:
            ret_sum += val * w
            ret_w_sum += w
    avg_return = ret_sum / ret_w_sum if ret_w_sum > 0 else 0
    # Map: -20% -> 20, 0% -> 50, +20% -> 70, +50% -> 85
    ret_score = max(10, min(95, 50 + avg_return * 1.0))

    # Factor 2: Consistency bonus (25%)
    positive = sum(1 for v in returns.values() if v is not None and v > 0)
    total = sum(1 for v in returns.values() if v is not None)
    consistency = (positive / total * 100) if total > 0 else 50

    # Factor 3: Acceleration bonus (15%): 6m > 3m means gaining momentum
    accel_score = 50
    r3m = returns.get("3m")
    r6m = returns.get("6m")
    r1y = returns.get("1y")
    if r6m is not None and r1y is not None:
        if r6m > 0 and r1y > 0:
            accel_score = 65
            if r3m is not None and r6m > r3m:
                accel_score = 75  # accelerating
        elif r6m < 0 or r1y < 0:
            accel_score = 35

    composite = ret_score * 0.60 + consistency * 0.25 + accel_score * 0.15
    return max(5, min(95, round(composite)))


def _calculate_comprehensive_score(fund_data: dict, perf: dict, est: dict) -> dict:
    """Multi-factor comprehensive scoring based on internationally recognized methods.
    Inspired by Morningstar/Lipper rating methodology.

    Factors:
    1. Return ability (30%): weighted average of 1m/3m/6m/1y returns
    2. Risk control (20%): volatility + max drawdown (lower is better)
    3. Risk-adjusted return (20%): simplified Sharpe ratio = return / volatility
    4. Return consistency (15%): positive period ratio + stability
    5. Technical timing (15%): MA, RSI, momentum from existing signal logic
    """
    trend = perf.get("trend", [])
    rank_returns = {
        "1m": fund_data.get("returns_1m"),
        "3m": fund_data.get("returns_3m"),
        "6m": fund_data.get("returns_6m"),
        "1y": fund_data.get("returns_1y"),
    }
    perf_returns = perf.get("returns", {})
    for k, v in perf_returns.items():
        if rank_returns.get(k) is None:
            rank_returns[k] = v

    factors = []
    composite = 50  # base score

    # --- Factor 1: Return ability (weight 30%) ---
    ret_weights = {"1m": 0.15, "3m": 0.25, "6m": 0.30, "1y": 0.30}
    ret_sum = 0
    ret_w_sum = 0
    for period, w in ret_weights.items():
        val = rank_returns.get(period)
        if val is not None:
            ret_sum += val * w
            ret_w_sum += w
    avg_return = ret_sum / ret_w_sum if ret_w_sum > 0 else 0

    # Score: map returns to 0-100 scale
    # < -20% -> 15, -10% -> 30, 0% -> 50, +15% -> 65, +30% -> 80, +50% -> 90
    ret_score = max(10, min(95, 50 + avg_return * 1.2))
    composite += (ret_score - 50) * 0.30
    factors.append({
        "name": "收益能力",
        "value": f"{avg_return:+.1f}%",
        "detail": "优秀" if ret_score >= 70 else "良好" if ret_score >= 55 else "一般" if ret_score >= 40 else "较弱",
        "score": round(ret_score),
    })

    # --- Factor 2: Risk control (weight 20%) ---
    risk_score = 50
    navs = [p["nav"] for p in trend if p.get("nav")]
    daily_rets = []
    for i in range(1, len(navs)):
        if navs[i-1] > 0:
            daily_rets.append((navs[i] - navs[i-1]) / navs[i-1])
    if len(trend) >= 30:
        if len(navs) >= 30:
            # Volatility: annualized standard deviation of daily returns
            if daily_rets:
                vol = statistics.stdev(daily_rets) if len(daily_rets) > 1 else 0
                ann_vol = vol * (252 ** 0.5) * 100  # annualized %

                # Max drawdown
                peak = navs[0]
                max_dd = 0
                for n in navs:
                    if n > peak:
                        peak = n
                    dd = (n - peak) / peak * 100
                    if dd < max_dd:
                        max_dd = dd

                # Vol score: <10% vol -> 80, 15% -> 60, 25% -> 40, 35%+ -> 20
                vol_score = max(15, min(90, 80 - ann_vol * 2))
                # Drawdown score: -5% -> 75, -10% -> 60, -20% -> 40, -30%+ -> 20
                dd_score = max(15, min(90, 75 + max_dd * 1.8))
                risk_score = (vol_score + dd_score) / 2

                factors.append({
                    "name": "风险控制",
                    "value": f"波动{ann_vol:.1f}%/回撤{max_dd:.1f}%",
                    "detail": "优秀" if risk_score >= 70 else "良好" if risk_score >= 55 else "一般" if risk_score >= 40 else "偏高",
                    "score": round(risk_score),
                })
                composite += (risk_score - 50) * 0.20
            else:
                composite += 0
        else:
            composite += 0
    else:
        factors.append({"name": "风险控制", "value": "数据不足", "detail": "样本太短", "score": 50})

    # --- Factor 3: Risk-adjusted return (weight 20%) ---
    sharpe_score = 50
    if len(trend) >= 30 and len(navs) >= 30 and daily_rets:
        vol = statistics.stdev(daily_rets) if len(daily_rets) > 1 else 0.001
        mean_ret = sum(daily_rets) / len(daily_rets)
        # Simplified daily Sharpe (annualized, assuming 0 risk-free)
        sharpe = (mean_ret / vol) * (252 ** 0.5) if vol > 0 else 0
        # Sharpe > 2 -> 85, > 1 -> 70, > 0.5 -> 60, > 0 -> 50, < 0 -> 30
        if sharpe > 2:
            sharpe_score = 85
        elif sharpe > 1:
            sharpe_score = 65 + (sharpe - 1) * 20
        elif sharpe > 0:
            sharpe_score = 45 + sharpe * 20
        else:
            sharpe_score = max(15, 45 + sharpe * 15)
        sharpe_score = max(10, min(95, sharpe_score))

        factors.append({
            "name": "风险调整收益",
            "value": f"夏普{sharpe:.2f}",
            "detail": "优秀" if sharpe_score >= 70 else "良好" if sharpe_score >= 55 else "一般" if sharpe_score >= 40 else "较弱",
            "score": round(sharpe_score),
        })
        composite += (sharpe_score - 50) * 0.20
    else:
        factors.append({"name": "风险调整收益", "value": "数据不足", "detail": "样本太短", "score": 50})

    # --- Factor 4: Return consistency (weight 15%) ---
    positive_periods = 0
    total_periods = 0
    for period in ["1m", "3m", "6m", "1y"]:
        val = rank_returns.get(period)
        if val is not None:
            total_periods += 1
            if val > 0:
                positive_periods += 1
    consistency_ratio = positive_periods / total_periods if total_periods > 0 else 0.5
    # All positive -> 80, 3/4 -> 65, 2/4 -> 50, 1/4 -> 35, 0/4 -> 20
    consistency_score = 20 + consistency_ratio * 60
    composite += (consistency_score - 50) * 0.15
    factors.append({
        "name": "收益一致性",
        "value": f"{positive_periods}/{total_periods}正收益",
        "detail": "稳定" if consistency_score >= 65 else "较好" if consistency_score >= 50 else "波动",
        "score": round(consistency_score),
    })

    # --- Factor 5: Technical timing (weight 15%) ---
    tech_score = 50
    if len(trend) >= 14:
        try:
            est_copy = {
                "nav": est.get("nav", ""),
                "estimated_change_pct": est.get("estimated_change_pct", "0"),
            }
            sig = _calculate_signal(perf, est_copy)
            tech_score = sig.get("buy_score", 50)
            # Add key technical factors
            for sf in sig.get("factors", []):
                fname = sf.get("name", "")
                if "MA20" == fname or "MA60" == fname:
                    factors.append({
                        "name": fname,
                        "value": sf.get("value", ""),
                        "detail": sf.get("detail", ""),
                        "score": sf.get("score", 50),
                    })
        except Exception:
            pass
    composite += (tech_score - 50) * 0.15
    factors.append({
        "name": "技术面",
        "value": f"买{tech_score}",
        "detail": "看多" if tech_score >= 60 else "中性" if tech_score >= 45 else "看空",
        "score": round(tech_score),
    })

    # Clamp final score
    final_score = max(5, min(95, round(composite)))

    # Trend bonus: if 6m and 1y both positive and 6m > 3m, trend is accelerating
    r6m = rank_returns.get("6m")
    r1y = rank_returns.get("1y")
    r3m = rank_returns.get("3m")
    if r6m is not None and r1y is not None and r6m > 0 and r1y > 0:
        if r3m is not None and r6m > r3m:
            final_score = min(95, final_score + 5)  # trend accelerating

    return {
        "composite_score": final_score,
        "factors": factors,
        "returns": rank_returns,
    }


@app.route("/api/fund/recommend")
def recommend_funds():
    """Two-phase recommendation:
    Phase 1: Quick-score all candidates from ranking data (no extra API calls).
    Phase 2: Detailed NAV scoring for top candidates only.
    """
    global _recommend_cache
    now = time.time()

    if _recommend_cache and now - _recommend_cache.get("ts", 0) < RECOMMEND_CACHE_TTL:
        return jsonify(_recommend_cache["data"])

    # Phase 1: Fetch pool and quick-score (no extra API calls)
    fund_pool = _fetch_fund_pool()
    if not fund_pool:
        return jsonify({"items": [], "meta": {"total_scored": 0, "strong_buy_count": 0, "buy_count": 0, "watch_count": 0}})

    for f in fund_pool:
        f["quick_score"] = _quick_score(f)

    fund_pool.sort(key=lambda x: x["quick_score"], reverse=True)
    # Take top 45 for detailed analysis
    top_candidates = fund_pool[:45]

    # Phase 2: Fetch estimation + performance for top candidates, do comprehensive scoring
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def _process_fund(f):
        code = f["code"]
        est = _fetch_fund_estimation(code)
        if not est:
            return None
        perf = _fetch_fund_performance(code)
        if not perf:
            return None
        try:
            score_result = _calculate_comprehensive_score(f, perf, est)
        except Exception as e:
            print(f"Score calc error for {code}: {e}")
            return None
        return {
            "code": code,
            "name": est.get("name", ""),
            "type": f.get("type", ""),
            "composite_score": score_result["composite_score"],
            "factors": score_result["factors"],
            "nav": est.get("nav", ""),
            "estimated_change_pct": est.get("estimated_change_pct", "0"),
            "returns": score_result.get("returns", {}),
        }

    all_scored = []
    max_workers = CONFIG.get("recommend", {}).get("max_workers", 10)
    timeout = CONFIG.get("recommend", {}).get("fetch_timeout_seconds", 45)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(_process_fund, f): f for f in top_candidates}
        for future in as_completed(futures, timeout=timeout):
            try:
                result = future.result(timeout=5)
                if result:
                    all_scored.append(result)
            except Exception:
                pass

    if not all_scored:
        # Fallback: use quick scores only
        all_scored = []
        for f in fund_pool[:60]:
            code = f["code"]
            est = _fetch_fund_estimation(code)
            if not est:
                continue
            all_scored.append({
                "code": code,
                "name": est.get("name", ""),
                "type": f.get("type", ""),
                "composite_score": f["quick_score"],
                "factors": [{"name": "收益排名", "value": f"评分{f['quick_score']}", "detail": "快速评估", "score": f["quick_score"]}],
                "nav": est.get("nav", ""),
                "estimated_change_pct": est.get("estimated_change_pct", "0"),
                "returns": {
                    "1m": f.get("returns_1m"),
                    "3m": f.get("returns_3m"),
                    "6m": f.get("returns_6m"),
                    "1y": f.get("returns_1y"),
                },
            })

    if not all_scored:
        return jsonify({"items": [], "meta": {"total_scored": 0, "strong_buy_count": 0, "buy_count": 0, "watch_count": 0}})

    # Sort by composite_score descending
    all_scored.sort(key=lambda x: x["composite_score"], reverse=True)

    # Assign categories by percentile distribution
    n = len(all_scored)
    strong_buy_end = max(1, int(n * 0.18))      # top 18%
    buy_end = max(strong_buy_end + 1, int(n * 0.55))  # 18%-55%
    watch_end = max(buy_end + 1, int(n * 0.85))   # 55%-85%

    for i, r in enumerate(all_scored):
        s = r["composite_score"]
        if i < strong_buy_end:
            r["recommend_level"] = "strong_buy"
            r["recommend_label"] = "强烈推荐"
            r["reference_rule"] = f"综合评分{s}分，收益风险比优异，处于同类前列"
        elif i < buy_end:
            r["recommend_level"] = "buy"
            r["recommend_label"] = "推荐买入"
            r["reference_rule"] = f"综合评分{s}分，基本面偏多，性价比良好"
        elif i < watch_end:
            r["recommend_level"] = "watch"
            r["recommend_label"] = "值得关注"
            r["reference_rule"] = f"综合评分{s}分，指标中性偏弱，可观察等待"
        else:
            r["recommend_level"] = "hold"
            r["recommend_label"] = "观望"

        chg = float(r.get("estimated_change_pct", 0))
        total_f = len(r.get("factors", []))
        r["reference_text"] = f"综合评分{s}分，{total_f}项指标评估。今日估值{chg:+.2f}%。"
        # Compatibility fields
        r["weighted_score"] = s
        r["buy_score"] = s
        r["bullish_count"] = sum(1 for f in r.get("factors", []) if f.get("score", 50) >= 55)
        r["bearish_count"] = sum(1 for f in r.get("factors", []) if f.get("score", 50) <= 45)
        r["factor_total"] = total_f

    # Filter out "hold" level - only return strong_buy / buy / watch
    results = [r for r in all_scored if r["recommend_level"] != "hold"]

    # Add meta info
    meta = {
        "total_scored": n,
        "strong_buy_count": sum(1 for r in results if r["recommend_level"] == "strong_buy"),
        "buy_count": sum(1 for r in results if r["recommend_level"] == "buy"),
        "watch_count": sum(1 for r in results if r["recommend_level"] == "watch"),
    }
    output = {"items": results, "meta": meta}

    _recommend_cache = {"data": output, "ts": now}
    return jsonify(output)


# --- Gold & Silver Price ---
_price_cache = {}
PRICE_CACHE_TTL = 60  # 1 minute for precious metals


def get_metal_prices_func():
    """Get metal prices as dict (used by both API and CLI)."""
    global _price_cache
    now = time.time()

    if _price_cache and now - _price_cache.get("ts", 0) < PRICE_CACHE_TTL:
        return _price_cache["data"]

    try:
        limiter.acquire("sina")
        url = "https://hq.sinajs.cn/list=hf_GC,hf_SI,hf_XAU,hf_XAG,fx_susdcny"
        resp = requests.get(url, timeout=5, headers={
            "Referer": "https://finance.sina.com.cn/",
        })
        resp.encoding = "gbk"
        text = resp.text

        prices = {}
        usdcny = 7.24
        OZ_TO_GRAM = 31.1035

        for line in text.strip().split("\n"):
            m = re.match(r'var hq_str_(\w+)="(.*)"', line)
            if m and m.group(1) == "fx_susdcny":
                fields = m.group(2).split(",")
                if len(fields) >= 2 and fields[1]:
                    try:
                        usdcny = float(fields[1])
                    except ValueError:
                        pass

        for line in text.strip().split("\n"):
            m = re.match(r'var hq_str_(\w+)="(.*)"', line)
            if not m:
                continue
            key = m.group(1)
            fields = m.group(2).split(",")
            if key == "hf_GC" and len(fields) >= 9:
                current = float(fields[0]) if fields[0] else 0
                prev_close = float(fields[7]) if fields[7] else 0
                change = current - prev_close
                change_pct = (change / prev_close * 100) if prev_close else 0
                cny_gram = current * usdcny / OZ_TO_GRAM
                prices["gold"] = {"name": "COMEX黄金", "unit": "美元/盎司", "price": round(current, 2), "prev_close": round(prev_close, 2), "change": round(change, 2), "change_pct": round(change_pct, 2)}
                prices["gold_cny"] = {"name": "国内金价", "unit": "元/克", "price": round(cny_gram, 2), "prev_close": round(prev_close * usdcny / OZ_TO_GRAM, 2), "change": round(change * usdcny / OZ_TO_GRAM, 2), "change_pct": round(change_pct, 2)}
            elif key == "hf_SI" and len(fields) >= 9:
                current = float(fields[0]) if fields[0] else 0
                prev_close = float(fields[7]) if fields[7] else 0
                change = current - prev_close
                change_pct = (change / prev_close * 100) if prev_close else 0
                cny_gram = current * usdcny / OZ_TO_GRAM
                prices["silver"] = {"name": "COMEX白银", "unit": "美元/盎司", "price": round(current, 2), "prev_close": round(prev_close, 2), "change": round(change, 2), "change_pct": round(change_pct, 2)}
                prices["silver_cny"] = {"name": "国内银价", "unit": "元/克", "price": round(cny_gram, 2), "prev_close": round(prev_close * usdcny / OZ_TO_GRAM, 2), "change": round(change * usdcny / OZ_TO_GRAM, 2), "change_pct": round(change_pct, 2)}
            elif key == "hf_XAU" and len(fields) >= 10:
                current = float(fields[0]) if fields[0] else 0
                prev_close = float(fields[7]) if fields[7] else 0
                change = current - prev_close
                change_pct = (change / prev_close * 100) if prev_close else 0
                prices["gold_spot"] = {"name": "现货黄金", "unit": "美元/盎司", "price": round(current, 2), "prev_close": round(prev_close, 2), "change": round(change, 2), "change_pct": round(change_pct, 2)}
            elif key == "hf_XAG" and len(fields) >= 10:
                current = float(fields[0]) if fields[0] else 0
                prev_close = float(fields[7]) if fields[7] else 0
                change = current - prev_close
                change_pct = (change / prev_close * 100) if prev_close else 0
                prices["silver_spot"] = {"name": "现货白银", "unit": "美元/盎司", "price": round(current, 2), "prev_close": round(prev_close, 2), "change": round(change, 2), "change_pct": round(change_pct, 2)}

        prices["usdcny"] = round(usdcny, 4)
        _price_cache = {"data": prices, "ts": now}
        return prices
    except Exception as e:
        print(f"Failed to fetch metal prices: {e}")
        return {"error": str(e)}



@app.route("/api/price/metals")
def get_metal_prices():
    """Get real-time gold and silver prices from Sina Finance."""
    result = get_metal_prices_func()
    if "error" in result:
        return jsonify(result), 500
    return jsonify(result)


# --- Market Index ---
_index_cache = {}
INDEX_CACHE_TTL = 30


def _get_market_index_func():
    """Get A-share market indices (Shanghai, Shenzhen, ChiNext)."""
    global _index_cache
    now = time.time()
    if _index_cache and now - _index_cache.get("ts", 0) < INDEX_CACHE_TTL:
        return _index_cache["data"]
    try:
        limiter.acquire("sina")
        # Use full quotes for detailed data
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
                prev_close = float(fields[2]) if fields[2] else 0
                current = float(fields[3]) if fields[3] else 0
                high = float(fields[4]) if fields[4] else 0
                low = float(fields[5]) if fields[5] else 0
                volume = float(fields[8]) if fields[8] else 0  # 成交量(手)
                amount = float(fields[9]) if fields[9] else 0  # 成交额(元)
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
                    "volume": round(volume / 10000, 2),  # 万手
                    "amount": round(amount / 100000000, 2),  # 亿元
                    "amplitude": round(amplitude, 2),
                    "trade_date": fields[30] if len(fields) > 30 else "",
                }
        _index_cache = {"data": indices, "ts": now}
        return indices
    except Exception as e:
        print(f"Failed to fetch market index: {e}")
        return {}


@app.route("/api/market/index")
def get_market_index():
    result = _get_market_index_func()
    return jsonify(result)


# --- Hot Sectors ---
_sectors_cache = {}
SECTORS_CACHE_TTL = 120


def _get_hot_sectors_func():
    """Get hot sector/plate data from eastmoney."""
    global _sectors_cache
    now = time.time()
    if _sectors_cache and now - _sectors_cache.get("ts", 0) < SECTORS_CACHE_TTL:
        return _sectors_cache["data"]
    try:
        limiter.acquire("eastmoney")
        # Eastmoney sector ranking API
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
                name = item.get("f14", "")
                change_pct = item.get("f3", 0)
                leader_name = item.get("f140", "")
                leader_code = item.get("f136", "")
                up_count = item.get("f104", 0)
                down_count = item.get("f105", 0)
                sectors.append({
                    "name": name,
                    "change_pct": round(change_pct, 2) if change_pct else 0,
                    "leader_name": leader_name,
                    "leader_code": str(leader_code) if leader_code else "",
                    "up_count": up_count,
                    "down_count": down_count,
                })
        _sectors_cache = {"data": sectors, "ts": now}
        return sectors
    except Exception as e:
        print(f"Failed to fetch hot sectors: {e}")
        return []


@app.route("/api/market/sectors")
def get_hot_sectors():
    result = _get_hot_sectors_func()
    return jsonify(result)


# --- Metal Trend (for charts) ---
_metal_trend_cache = {}
METAL_TREND_TTL = 300


@app.route("/api/price/metals/trend")
def get_metal_trend():
    """Get gold/silver price trend data for charts."""
    global _metal_trend_cache
    now = time.time()
    metal = request.args.get("metal", "gold")
    period = request.args.get("period", "1m")

    cache_key = f"{metal}_{period}"
    if _metal_trend_cache and _metal_trend_cache.get("key") == cache_key and now - _metal_trend_cache.get("ts", 0) < METAL_TREND_TTL:
        return jsonify(_metal_trend_cache["data"])

    # Determine if we need CNY conversion
    is_cny = metal in ("gold_cny", "silver_cny")
    base_metal = "gold" if metal in ("gold", "gold_cny") else "silver"

    try:
        # Get current exchange rate for CNY conversion
        usdcny = 7.24
        OZ_TO_GRAM = 31.1035
        if is_cny:
            try:
                prices = get_metal_prices_func()
                if "usdcny" in prices:
                    usdcny = prices["usdcny"]
            except Exception:
                pass

        # Try fetching K-line data from eastmoney
        secid_map = {
            "gold": "101.GC00Y",
            "gold_cny": "101.GC00Y",
            "silver": "101.SI00Y",
            "silver_cny": "101.SI00Y",
            "gold_spot": "101.GC00Y",
            "silver_spot": "101.SI00Y",
        }
        secid = secid_map.get(metal, "101.GC00Y")

        klt_map = {"7d": "15", "15d": "30", "1m": "60", "3m": "120", "6m": "120", "1y": "120"}
        klt = klt_map.get(period, "60")

        lmt_map = {"7d": "50", "15d": "50", "1m": "60", "3m": "90", "6m": "180", "1y": "365"}
        lmt = lmt_map.get(period, "60")

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
                parts = line.split(",")
                if len(parts) >= 5:
                    entry = {
                        "date": parts[0],
                        "open": float(parts[1]),
                        "close": float(parts[2]),
                        "high": float(parts[3]),
                        "low": float(parts[4]),
                    }
                    # Convert to CNY/gram if needed
                    if is_cny:
                        entry["open"] = round(entry["open"] * usdcny / OZ_TO_GRAM, 2)
                        entry["close"] = round(entry["close"] * usdcny / OZ_TO_GRAM, 2)
                        entry["high"] = round(entry["high"] * usdcny / OZ_TO_GRAM, 2)
                        entry["low"] = round(entry["low"] * usdcny / OZ_TO_GRAM, 2)
                    trend.append(entry)

        result = {"trend": trend, "metal": metal, "period": period, "unit": "元/克" if is_cny else "美元/盎司"}
        _metal_trend_cache = {"key": cache_key, "data": result, "ts": now}
        return jsonify(result)
    except Exception as e:
        print(f"Failed to fetch metal trend: {e}")
        return jsonify({"error": str(e), "trend": []})


# --- Alerts ---
_alerts = []  # In-memory alerts list


@app.route("/api/alerts", methods=["GET"])
def list_alerts():
    return jsonify(_alerts)


@app.route("/api/alerts", methods=["POST"])
def add_alert():
    data = request.get_json(force=True)
    code = data.get("code", "").strip()
    name = data.get("name", "")
    condition = data.get("condition", "above")  # "above" or "below"
    threshold = float(data.get("threshold", 0))
    if not code or not threshold:
        return jsonify({"error": "请提供基金代码和阈值"}), 400
    alert = {
        "id": int(time.time() * 1000),
        "code": code,
        "name": name,
        "condition": condition,
        "threshold": threshold,
        "triggered": False,
        "created_at": time.strftime("%Y-%m-%d %H:%M"),
    }
    _alerts.append(alert)
    return jsonify(alert)


@app.route("/api/alerts/<int:alert_id>", methods=["DELETE"])
def delete_alert(alert_id):
    global _alerts
    _alerts = [a for a in _alerts if a["id"] != alert_id]
    return jsonify({"ok": True})


@app.route("/api/alerts/check", methods=["GET"])
def check_alerts():
    """Check all alerts against current fund prices."""
    triggered = []
    for alert in _alerts:
        if alert["triggered"]:
            continue
        est = _fetch_fund_estimation(alert["code"])
        if not est:
            continue
        pct = float(est.get("estimated_change_pct", 0))
        nav = float(est.get("nav", 0))
        est_nav = float(est.get("estimated_nav", 0))

        # Check condition
        if alert["condition"] == "above" and pct >= alert["threshold"]:
            alert["triggered"] = True
            alert["trigger_value"] = pct
            triggered.append(alert)
        elif alert["condition"] == "below" and pct <= alert["threshold"]:
            alert["triggered"] = True
            alert["trigger_value"] = pct
            triggered.append(alert)
    return jsonify({"triggered": triggered, "total": len(_alerts)})


# --- Portfolio Stats ---
@app.route("/api/portfolio/stats", methods=["POST"])
def portfolio_stats():
    """Calculate portfolio performance stats."""
    data = request.get_json(force=True)
    holdings = data.get("holdings", [])
    if not holdings:
        return jsonify({"error": "无持仓数据"}), 400

    total_value = 0
    total_cost = 0
    total_today = 0
    total_profit = 0
    fund_details = []

    for h in holdings:
        code = str(h.get("code", "")).strip()
        value = float(h.get("value", 0))
        profit = float(h.get("profit", 0))
        est = _fetch_fund_estimation(code)
        pct = float(est.get("estimated_change_pct", 0)) if est else 0
        today = value * pct / 100
        cost = value - profit
        current_total = value + today
        current_profit = profit + today

        total_value += current_total
        total_cost += cost
        total_today += today
        total_profit += current_profit

        fund_details.append({
            "code": code,
            "name": est.get("name", code) if est else code,
            "value": round(value, 2),
            "cost": round(cost, 2),
            "current_value": round(current_total, 2),
            "profit": round(current_profit, 2),
            "profit_pct": round((current_profit / cost * 100) if cost > 0 else 0, 2),
            "today": round(today, 2),
            "today_pct": round(pct, 2),
            "weight": 0,
        })

    # Calculate weights
    if total_value > 0:
        for f in fund_details:
            f["weight"] = round(f["current_value"] / total_value * 100, 2)

    return jsonify({
        "total_value": round(total_value, 2),
        "total_cost": round(total_cost, 2),
        "total_profit": round(total_profit, 2),
        "total_profit_pct": round((total_profit / total_cost * 100) if total_cost > 0 else 0, 2),
        "total_today": round(total_today, 2),
        "fund_count": len(holdings),
        "funds": fund_details,
    })


if __name__ == "__main__":
    print("=" * 50)
    print("基金收益预测助手 V2")
    print("访问 http://localhost:5000")
    print("=" * 50)
    server_cfg = CONFIG.get("server", {})
    app.run(
        debug=server_cfg.get("debug", True),
        host=os.getenv("HOST", server_cfg.get("host", "0.0.0.0")),
        port=int(os.getenv("PORT", server_cfg.get("port", 5000))),
    )
