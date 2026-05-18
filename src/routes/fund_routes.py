"""
基金相关API路由 — 包含基金查询、信号计算、推荐、智能导入等核心接口

创新点（智能导入功能）：
1. 文本导入(import_text)：支持JSON/纯文本/模糊匹配三种解析策略
   - JSON格式：直接解析 [{"code":"xxx","value":10000},...]
   - 纯文本：正则提取基金代码→名称→金额，逐行解析
   - 模糊匹配：当逐行失败时，在整段文本中全局匹配基金名称
2. 图片导入(import_image)：调用AI多模态API识别截图中的基金持仓
   - 自动纠正AI返回的错误代码（通过基金名称反查）
   - 校验基金代码是否真实存在（排除幻觉代码）
"""

import re
import json
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from flask import Blueprint, jsonify, request

from ratelimit import limiter
from services.fund_service import (
    load_fund_list, get_fund_list, fetch_fund_estimation,
    fetch_fund_performance, fetch_fund_holdings, search_funds,
)
from quant.signals import calculate_signal
from services.recommend_service import get_recommendations
from services.ai_service import call_ai_api
from cache import signal_cache_inst
from config import SIGNAL_CACHE_TTL

fund_bp = Blueprint("fund", __name__)


@fund_bp.route("/api/fund/<code>")
def get_fund(code: str):
    """获取单只基金的实时估值数据"""
    code = code.strip()
    if not re.match(r"^\d{6}$", code):
        return jsonify({"error": "基金代码格式不正确"}), 400
    result = fetch_fund_estimation(code)
    if result is None:
        return jsonify({"error": f"无法获取基金 {code} 的数据"}), 404
    return jsonify(result)


@fund_bp.route("/api/fund/batch", methods=["POST"])
def batch_fund():
    """批量获取多只基金估值（并发获取，大幅缩短总耗时）"""
    data = request.get_json(force=True)
    codes = data.get("codes", [])
    if not codes:
        return jsonify({"error": "请提供基金代码列表"}), 400

    valid_codes = [str(c).strip() for c in codes if re.match(r"^\d{6}$", str(c).strip())]
    results_map = {}

    def _fetch(code):
        fund = fetch_fund_estimation(code)
        return code, fund

    with ThreadPoolExecutor(max_workers=min(len(valid_codes), 10)) as executor:
        futures = {executor.submit(_fetch, c): c for c in valid_codes}
        for future in as_completed(futures, timeout=15):
            try:
                code, fund = future.result(timeout=5)
                results_map[code] = fund if fund else {"code": code, "error": "获取数据失败"}
            except Exception:
                code = futures[future]
                results_map[code] = {"code": code, "error": "获取数据超时"}

    # 保持原始顺序
    results = [results_map.get(str(c).strip(), {"code": str(c).strip(), "error": "未处理"}) for c in codes]
    return jsonify(results)


@fund_bp.route("/api/fund/search")
def search_fund_route():
    """基金搜索（支持代码/名称模糊匹配）"""
    q = request.args.get("q", "").strip()
    if len(q) < 1:
        return jsonify([])
    return jsonify(search_funds(q))


@fund_bp.route("/api/fund/holdings/<code>")
def get_holdings(code: str):
    """获取基金重仓股及实时行情"""
    code = code.strip()
    if not re.match(r"^\d{6}$", code):
        return jsonify({"error": "基金代码格式不正确"}), 400
    result = fetch_fund_holdings(code)
    if result is None:
        return jsonify({"error": "获取重仓股数据失败"}), 500
    return jsonify(result)


@fund_bp.route("/api/fund/performance/<code>")
def get_performance(code: str):
    """获取基金历史业绩走势（净值曲线+区间收益率）"""
    code = code.strip()
    if not re.match(r"^\d{6}$", code):
        return jsonify({"error": "基金代码格式不正确"}), 400
    result = fetch_fund_performance(code)
    if result is None:
        return jsonify({"error": "获取业绩走势数据失败"}), 500
    return jsonify(result)


@fund_bp.route("/api/fund/signal/<code>")
def get_signal(code: str):
    """计算基金的多因子买卖信号（带缓存）"""
    code = code.strip()
    if not re.match(r"^\d{6}$", code):
        return jsonify({"error": "基金代码格式不正确"}), 400

    # 检查缓存
    cached = signal_cache_inst.get(code, SIGNAL_CACHE_TTL)
    if cached is not None:
        return jsonify(cached)

    perf = fetch_fund_performance(code)
    est = fetch_fund_estimation(code)
    if not perf or not est:
        return jsonify({"error": "获取数据失败"}), 500

    try:
        result = calculate_signal(perf, est)
        signal_cache_inst.set(code, result)
        return jsonify(result)
    except Exception as e:
        print(f"Signal calc error: {e}")
        traceback.print_exc()
        return jsonify({"error": "计算信号失败"}), 500


@fund_bp.route("/api/fund/recommend")
def recommend_funds():
    """获取基金推荐列表（触发推荐引擎计算）"""
    result = get_recommendations()
    return jsonify(result)


@fund_bp.route("/api/import/text", methods=["POST"])
def import_text():
    """
    智能文本导入 — 从用户粘贴的文本中解析基金持仓数据。

    三级解析策略（逐级降级）：
    第1级：JSON格式解析 — 用户直接粘贴JSON数组
    第2级：逐行解析 — 每行提取基金代码/名称和金额
    第3级：全局回退 — 在整段文本中查找基金代码/名称

    resolve_code_or_name 函数实现代码↔名称双向解析：
    - 有代码时：通过估值API或基金列表反查名称
    - 有名称时：先在本地列表模糊匹配，失败则调用东方财富搜索API
    """
    data = request.get_json(force=True)
    text = data.get("text", "")
    if not text.strip():
        return jsonify({"error": "请粘贴持仓数据"}), 400

    load_fund_list()
    fund_list = get_fund_list()

    def resolve_code_or_name(code, name):
        """
        基金代码↔名称双向解析：
        - 有代码：通过API或本地列表补全名称
        - 有名称：通过本地列表或远程搜索API反查代码
        """
        if code and re.match(r"^\d{6}$", code):
            # 有代码，补全名称
            if not name:
                fund_data = fetch_fund_estimation(code)
                if fund_data and "error" not in fund_data:
                    name = fund_data.get("name", "")
                else:
                    for f in fund_list:
                        if f["code"] == code:
                            name = f["name"]
                            break
            return code, name
        if name:
            # 有名称，先在本地列表模糊匹配
            for f in fund_list:
                if f["name"] == name or name in f["name"]:
                    found_code = f["code"]
                    found_name = f["name"]
                    if not code:
                        code = found_code
                    return code, found_name
            # 本地匹配失败，调用东方财富搜索API
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
        """从附近文本中提取持有金额和收益，排除6位数字（基金代码）的干扰"""
        value, profit = 0, 0
        # 提取所有数字（含逗号分隔），排除6位纯数字（基金代码）
        amounts = re.findall(r"([\d,]+(?:\.\d{1,2})?)", nearby)
        amounts = [a for a in amounts if not re.match(r"^\d{6}$", a.replace(",", ""))]
        if amounts:
            amounts_float = [float(a.replace(",", "")) for a in amounts]
            value = max(amounts_float)  # 取最大值作为持有金额
            # 提取含正负号的数字，用于区分收益
            profit_matches = re.findall(r"([+-]?[\d,]+(?:\.\d{1,2})?)", nearby)
            profit_matches = [p for p in profit_matches if not re.match(r"^[+-]?\d{6}$", p.replace(",", ""))]
            if len(profit_matches) >= 2:
                vals = [float(p.replace(",", "")) for p in profit_matches]
                value = max(vals)
                profit = min(vals, key=lambda x: abs(x)) if len(vals) > 1 else 0
        return value, profit

    # === 第1级：尝试JSON格式解析 ===
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

    # === 第2级：逐行解析纯文本 ===
    results = []
    seen = set()
    lines = text.strip().split("\n")
    # 拼接全文用于后续全局回退
    buffer = ""
    for line in lines:
        buffer += " " + line.strip()

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # 提取6位基金代码
        code_match = re.search(r"\b(\d{6})\b", line)
        code = code_match.group(1) if code_match else ""

        # 提取基金名称：代码前的中文部分，或整行中的中文+字母名称
        name = ""
        if code_match:
            name_part = line[:code_match.start()].strip()
            name_part = re.sub(r"[，,、|/\-]+", "", name_part).strip()
            if name_part and re.search(r"[一-鿿]", name_part):
                name = name_part
        else:
            name_match = re.search(r"([一-鿿][一-鿿A-Za-z0-9（）()]+)", line)
            if name_match:
                name = name_match.group(1)

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

    # === 第3级回退：在全文buffer中查找基金代码 ===
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

    # === 第3级回退：在全文中匹配基金名称 ===
    if not results:
        for f in fund_list:
            if f["name"] in buffer and f["code"] not in seen:
                seen.add(f["code"])
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


@fund_bp.route("/api/import/image", methods=["POST"])
def import_image():
    """
    AI图片识别导入 — 从截图中自动识别基金持仓信息。

    流程：
    1. 将Base64图片发送给AI多模态API，要求以JSON格式返回
    2. 解析AI返回的JSON数组（含基金名称、代码、金额）
    3. 校验每只基金的代码是否真实存在（AI可能生成幻觉代码）
       - 代码无效时通过名称反查真实代码
       - 代码有效时通过估值API确认基金存在
    4. 补全缺失的基金名称
    """
    data = request.get_json(force=True)
    img_data = data.get("image", "")
    if not img_data:
        return jsonify({"error": "请上传图片"}), 400

    try:
        # 确保图片数据有正确的data URI前缀
        if not img_data.startswith("data:"):
            img_data = "data:image/jpeg;base64," + img_data

        # AI识别提示词：强调不遗漏、严格JSON格式
        prompt = (
            "请仔细识别这张基金持仓截图中显示的【每一只】基金信息，不要遗漏任何一只。"
            "请逐一查看截图中每一行基金条目，确保数量完整。\n"
            "严格按以下JSON数组格式返回，不要添加其他文字：\n"
            '[{"name":"基金名称","code":"基金代码6位数字","value":持有金额,"profit":持仓收益}]\n'
            "如果某项无法识别，value和profit填0。只返回JSON数组，不要有其他内容。\n"
            "请特别注意：可能有5只或更多基金，每只都要列出，不可遗漏。"
        )

        # 构建多模态消息（文本+图片）
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": img_data}},
                ],
            }
        ]

        result_text = call_ai_api(messages, stream=False)

        # 从AI回复中提取JSON数组（可能夹杂其他文字）
        json_match = re.search(r'\[.*\]', result_text, re.DOTALL)
        if not json_match:
            return jsonify({"error": "AI未能识别出基金数据，请尝试更清晰的截图"}), 400

        parsed = json.loads(json_match.group(0))

        # 校验AI返回的每只基金：纠正幻觉代码、补全名称
        load_fund_list()
        fund_list = get_fund_list()
        results = []
        seen = set()
        for item in parsed:
            code = str(item.get("code", "")).strip()
            name = item.get("name", "").strip()
            value = float(item.get("value", 0) or 0)
            profit = float(item.get("profit", 0) or 0)

            # 代码无效时通过名称反查真实代码
            if not re.match(r"^\d{6}$", code) or code == "000000":
                if name:
                    for f in fund_list:
                        if f["name"] == name or name in f["name"]:
                            code = f["code"]
                            break
                if not re.match(r"^\d{6}$", code) or code == "000000":
                    continue  # 无法识别，跳过

            if code in seen:
                continue
            seen.add(code)

            entry = {
                "code": code,
                "name": name,
                "value": value,
                "profit": profit,
            }

            # 校验基金是否存在：先试估值API，再查本地列表
            fund_data = fetch_fund_estimation(code)
            if fund_data and "error" not in fund_data:
                if not entry["name"]:
                    entry["name"] = fund_data.get("name", "")
                results.append(entry)
            else:
                # 估值API可能超时，回退到本地列表验证
                found = any(f["code"] == code for f in fund_list)
                if found:
                    if not entry["name"]:
                        for f in fund_list:
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
