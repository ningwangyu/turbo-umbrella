#!/usr/bin/env python3
"""CLI tool for fund tracker - headless operations."""

import sys
import json
import argparse
from pathlib import Path

# Reuse backend logic
from app import (
    _fetch_fund_estimation, _fetch_fund_performance,
    _fetch_fund_holdings, _calculate_signal, _fetch_hot_funds
)
from app import CONFIG

HOLDINGS_FILE = Path(__file__).parent / "holdings.json"


def load_holdings():
    """Load holdings from local JSON file."""
    if HOLDINGS_FILE.exists():
        return json.loads(HOLDINGS_FILE.read_text(encoding="utf-8"))
    return []


def save_holdings(holdings):
    """Save holdings to local JSON file."""
    HOLDINGS_FILE.write_text(json.dumps(holdings, ensure_ascii=False, indent=2), encoding="utf-8")


def cmd_list(args):
    """List all holdings."""
    holdings = load_holdings()
    if not holdings:
        print("No holdings found. Use 'add' to add funds.")
        return

    print(f"{'Code':<10} {'Name':<25} {'Value':>12} {'Profit':>12}")
    print("-" * 65)
    for h in holdings:
        est = _fetch_fund_estimation(h["code"])
        name = est.get("name", h["code"]) if est else h["code"]
        value = h.get("value", 0)
        profit = h.get("profit", 0)
        profit_str = f"+{profit:.2f}" if profit >= 0 else f"{profit:.2f}"
        print(f"{h['code']:<10} {name:<25} {value:>12,.2f} {profit_str:>12}")

    total_value = sum(h.get("value", 0) for h in holdings)
    total_profit = sum(h.get("profit", 0) for h in holdings)
    print("-" * 65)
    print(f"{'Total':<10} {'':<25} {total_value:>12,.2f} {total_profit:>+12,.2f}")


def cmd_add(args):
    """Add a fund to holdings."""
    holdings = load_holdings()
    code = args.code.strip()

    if any(h["code"] == code for h in holdings):
        print(f"Fund {code} already in holdings.")
        return

    est = _fetch_fund_estimation(code)
    if not est:
        print(f"Cannot fetch data for {code}. Check the code.")
        return

    entry = {
        "code": code,
        "value": args.value,
        "profit": args.profit
    }
    holdings.append(entry)
    save_holdings(holdings)
    print(f"Added: {est.get('name', code)} ({code})")
    print(f"  Holding: {args.value:,.2f}, Profit: {args.profit:+,.2f}")


def cmd_remove(args):
    """Remove a fund from holdings."""
    holdings = load_holdings()
    code = args.code.strip()
    original_len = len(holdings)
    holdings = [h for h in holdings if h["code"] != code]

    if len(holdings) == original_len:
        print(f"Fund {code} not found in holdings.")
        return

    save_holdings(holdings)
    print(f"Removed fund {code}.")


def cmd_signal(args):
    """Show buy/sell signal for a fund."""
    code = args.code.strip()
    est = _fetch_fund_estimation(code)
    if not est:
        print(f"Cannot fetch data for {code}.")
        return

    perf = _fetch_fund_performance(code)
    if not perf:
        print(f"Cannot fetch performance for {code}.")
        return

    sig = _calculate_signal(perf, est)
    print(f"\nFund: {est.get('name', code)} ({code})")
    print(f"NAV: {est.get('nav', '--')} | Estimated: {est.get('estimated_nav', '--')} ({est.get('estimated_change_pct', '0')}%)")
    print(f"\nSignal: {sig['signal']}")
    print(f"Buy Score: {sig['buy_score']} / Sell Score: {sig['sell_score']}")
    print(f"\nFactors:")
    print(f"  {'Name':<20} {'Value':<20} {'Score':>6} Detail")
    print("  " + "-" * 70)
    for f in sig.get("factors", []):
        print(f"  {f['name']:<20} {f['value']:<20} {f['score']:>6} {f.get('detail', '')}")

    bullish = sum(1 for f in sig.get("factors", []) if f.get("score", 50) >= 55)
    bearish = sum(1 for f in sig.get("factors", []) if f.get("score", 50) <= 45)
    total = len(sig.get("factors", []))
    print(f"\nSummary: {total} factors, {bullish} bullish, {bearish} bearish")
    print(sig.get("summary", ""))


def cmd_recommend(args):
    """Show recommended funds."""
    print("Fetching hot funds and analyzing signals...")
    hot = _fetch_hot_funds(20)
    if not hot:
        print("Failed to fetch hot funds.")
        return

    from concurrent.futures import ThreadPoolExecutor, as_completed

    def analyze(f):
        code = f["code"]
        est = _fetch_fund_estimation(code)
        if not est:
            return None
        perf = _fetch_fund_performance(code)
        if not perf:
            return None
        try:
            sig = _calculate_signal(perf, est)
        except Exception:
            return None
        return {
            "code": code,
            "name": est.get("name", code),
            "type": f.get("type", ""),
            "buy_score": sig.get("buy_score", 50),
            "signal": sig.get("signal", "观望"),
            "signal_en": sig.get("signal_en", "hold"),
            "nav": est.get("nav", ""),
            "change_pct": est.get("estimated_change_pct", "0"),
            "factors": sig.get("factors", []),
            "bullish": sum(1 for x in sig.get("factors", []) if x.get("score", 50) >= 55),
            "bearish": sum(1 for x in sig.get("factors", []) if x.get("score", 50) <= 45),
        }

    results = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(analyze, f): f for f in hot[:15]}
        for future in as_completed(futures, timeout=30):
            try:
                r = future.result(timeout=5)
                if r:
                    results.append(r)
            except Exception:
                pass

    results.sort(key=lambda x: x["buy_score"], reverse=True)
    results = results[:args.count]

    print(f"\n{'#':<3} {'Code':<10} {'Name':<25} {'Score':>6} {'Signal':<10} {'NAV':>10} {'Chg%':>8}")
    print("-" * 78)
    for i, r in enumerate(results, 1):
        print(f"{i:<3} {r['code']:<10} {r['name']:<25} {r['buy_score']:>6} {r['signal']:<10} {r['nav']:>10} {r['change_pct']:>+8}")

    print(f"\nUse 'python cli.py add <code> <value>' to add a fund to holdings.")


def cmd_metals(args):
    """Show gold and silver prices."""
    from app import get_metal_prices_func
    prices = get_metal_prices_func()

    if not prices or "error" in prices:
        print("Failed to fetch metal prices.")
        return

    print(f"\n{'Name':<15} {'Price':>12} {'Unit':<12} {'Change':>10} {'Change%':>10}")
    print("-" * 65)
    order = ["gold", "gold_cny", "gold_spot", "silver", "silver_cny", "silver_spot"]
    for key in order:
        item = prices.get(key)
        if not item:
            continue
        sign = "+" if item["change"] >= 0 else ""
        print(f"{item['name']:<15} {item['price']:>12,.2f} {item['unit']:<12} {sign}{item['change']:>9,.2f} {sign}{item['change_pct']:>9,.2f}%")

    usdcny = prices.get("usdcny")
    if usdcny:
        print(f"\nUSD/CNY: {usdcny}")


def cmd_config(args):
    """Show current configuration."""
    print(json.dumps(CONFIG, indent=2, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description="Fund Tracker CLI")
    sub = parser.add_subparsers(dest="command", help="Available commands")

    # list
    sub.add_parser("list", aliases=["ls"], help="List holdings")

    # add
    p_add = sub.add_parser("add", help="Add a fund to holdings")
    p_add.add_argument("code", help="Fund code (6 digits)")
    p_add.add_argument("value", type=float, default=10000, nargs="?", help="Holding value (default: 10000)")
    p_add.add_argument("--profit", "-p", type=float, default=0, help="Current profit (default: 0)")

    # remove
    p_rm = sub.add_parser("remove", aliases=["rm"], help="Remove a fund")
    p_rm.add_argument("code", help="Fund code")

    # signal
    p_sig = sub.add_parser("signal", help="Show buy/sell signal")
    p_sig.add_argument("code", help="Fund code")

    # recommend
    p_rec = sub.add_parser("recommend", aliases=["rec"], help="Show recommended funds")
    p_rec.add_argument("--count", "-n", type=int, default=10, help="Number of recommendations (default: 10)")

    # metals
    sub.add_parser("metals", help="Show gold/silver prices")

    # config
    sub.add_parser("config", help="Show configuration")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    commands = {
        "list": cmd_list, "ls": cmd_list,
        "add": cmd_add,
        "remove": cmd_remove, "rm": cmd_remove,
        "signal": cmd_signal,
        "recommend": cmd_recommend, "rec": cmd_recommend,
        "metals": cmd_metals,
        "config": cmd_config,
    }

    handler = commands.get(args.command)
    if handler:
        handler(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
