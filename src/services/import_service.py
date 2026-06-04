from __future__ import annotations

import json
import re
import time

import requests

from ratelimit import limiter
from services.fund_service import fetch_fund_estimation, get_fund_list, load_fund_list


def resolve_code_or_name(code: str, name: str, fund_list: list[dict]) -> tuple[str | None, str | None]:
    if code and re.match(r"^\d{6}$", code):
        if not name:
            fund_data = fetch_fund_estimation(code)
            if fund_data and "error" not in fund_data:
                name = fund_data.get("name", "")
            else:
                for fund in fund_list:
                    if fund["code"] == code:
                        name = fund["name"]
                        break
        return code, name

    if name:
        for fund in fund_list:
            if fund["name"] == name or name in fund["name"]:
                return code or fund["code"], fund["name"]

        try:
            limiter.acquire("eastmoney")
            response = requests.get(
                "https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx",
                params={"m": 1, "key": name, "_": int(time.time() * 1000)},
                timeout=5,
            )
            data = response.json() if response.ok else {}
            for item in data.get("Datas", []):
                fund_code = item.get("CODE", "")
                fund_name = item.get("NAME", "")
                if fund_code and re.match(r"^\d{6}$", fund_code):
                    return fund_code, fund_name
        except Exception:
            pass

    return None, None


def extract_amounts(nearby: str) -> tuple[float, float]:
    value, profit = 0, 0
    amounts = re.findall(r"([\d,]+(?:\.\d{1,2})?)", nearby)
    amounts = [amount for amount in amounts if not re.match(r"^\d{6}$", amount.replace(",", ""))]
    if amounts:
        amounts_float = [float(amount.replace(",", "")) for amount in amounts]
        value = max(amounts_float)
        profit_matches = re.findall(r"([+-]?[\d,]+(?:\.\d{1,2})?)", nearby)
        profit_matches = [profit for profit in profit_matches if not re.match(r"^[+-]?\d{6}$", profit.replace(",", ""))]
        if len(profit_matches) >= 2:
            vals = [float(profit.replace(",", "")) for profit in profit_matches]
            value = max(vals)
            profit = min(vals, key=lambda x: abs(x)) if len(vals) > 1 else 0
    return value, profit


def parse_holdings_text(text: str) -> list[dict]:
    load_fund_list()
    fund_list = get_fund_list()

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
                resolved_code, resolved_name = resolve_code_or_name(code if re.match(r"^\d{6}$", code) else "", name, fund_list)
                if not resolved_code or resolved_code in seen:
                    continue
                seen.add(resolved_code)
                results.append({"code": resolved_code, "name": resolved_name or "", "value": value, "profit": profit})
            return results
    except (json.JSONDecodeError, TypeError, ValueError):
        pass

    results = []
    seen = set()
    lines = text.strip().split("\n")
    buffer = " ".join(line.strip() for line in lines)

    for line in lines:
        line = line.strip()
        if not line:
            continue

        code_match = re.search(r"\b(\d{6})\b", line)
        code = code_match.group(1) if code_match else ""
        name = ""
        if code_match:
            name_part = re.sub(r"[，,、|/\-]+", "", line[:code_match.start()].strip()).strip()
            if name_part and re.search(r"[一-鿿]", name_part):
                name = name_part
        else:
            name_match = re.search(r"([一-鿿][一-鿿A-Za-z0-9（）()]+)", line)
            if name_match:
                name = name_match.group(1)

        value, profit = extract_amounts(line)
        resolved_code, resolved_name = resolve_code_or_name(code, name, fund_list)
        if not resolved_code or resolved_code in seen:
            continue
        seen.add(resolved_code)
        results.append({"code": resolved_code, "name": resolved_name or "", "value": value, "profit": profit})

    if not results:
        codes_found = re.findall(r"\b(\d{6})\b", buffer)
        for code in codes_found:
            if code in seen:
                continue
            code_pos = buffer.find(code)
            nearby = buffer[max(0, code_pos - 50):code_pos + 200] if code_pos >= 0 else ""
            value, profit = extract_amounts(nearby)
            resolved_code, resolved_name = resolve_code_or_name(code, "", fund_list)
            if not resolved_code or resolved_code in seen:
                continue
            seen.add(resolved_code)
            results.append({"code": resolved_code, "name": resolved_name or "", "value": value, "profit": profit})

    if not results:
        for fund in fund_list:
            if fund["name"] in buffer and fund["code"] not in seen:
                seen.add(fund["code"])
                name_pos = buffer.find(fund["name"])
                nearby = buffer[name_pos:name_pos + 200] if name_pos >= 0 else ""
                value, profit = extract_amounts(nearby)
                results.append({"code": fund["code"], "name": fund["name"], "value": value, "profit": profit})

    return results
