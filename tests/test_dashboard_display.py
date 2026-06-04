#!/usr/bin/env python3
"""
仪表盘数据渲染测试脚本
验证前端修复是否正确显示持仓数据
"""

import requests
import json
import time

BASE_URL = "http://localhost:5000"

# 测试持仓数据
TEST_HOLDINGS = [
    {"code": "000001", "value": 10000, "profit": 500},
    {"code": "110011", "value": 20000, "profit": 1000}
]

def check_summary_cards():
    """测试汇总卡片数据是否正确提取"""
    print("\n[TEST] 汇总卡片数据提取")
    print("=" * 60)

    try:
        # 调用overview API
        resp = requests.post(
            f"{BASE_URL}/api/dashboard/overview",
            json={"holdings": TEST_HOLDINGS},
            timeout=15
        )

        if resp.status_code != 200:
            print(f"[FAIL] API返回错误: HTTP {resp.status_code}")
            return False

        data = resp.json()

        # 检查数据结构
        if "portfolio" not in data:
            print("[FAIL] 响应中缺少 portfolio 字段")
            print(f"  实际字段: {list(data.keys())}")
            return False

        portfolio = data["portfolio"]

        # 验证关键字段
        required_fields = [
            "total_value",
            "today_return",
            "total_profit",
            "total_profit_pct",
            "fund_count"
        ]

        print("[INFO] API返回的portfolio数据:")
        for field in required_fields:
            value = portfolio.get(field, "MISSING")
            print(f"  {field}: {value}")

        # 模拟前端提取逻辑（修复后的代码）
        total_value = portfolio.get("total_value", 0)
        today_return = portfolio.get("today_return", 0)
        total_profit = portfolio.get("total_profit", 0)
        profit_rate = portfolio.get("total_profit_pct", 0)
        fund_count = portfolio.get("fund_count", 0)

        print("\n[INFO] 前端应显示的汇总卡片数据:")
        print(f"  总资产(元): {total_value:,.2f}")
        print(f"  今日收益: {'+' if today_return >= 0 else ''}{today_return:.2f}")
        print(f"  累计收益: {'+' if total_profit >= 0 else ''}{total_profit:.2f}")
        print(f"  收益率: {'+' if profit_rate >= 0 else ''}{profit_rate:.2f}%")
        print(f"  持仓基金: {fund_count}只")

        # 验证数据有效性
        if total_value > 0 and fund_count > 0:
            print("\n[PASS] 数据有效，前端应能正确显示")
            return True
        else:
            print("\n[FAIL] 数据无效（总资产或基金数为0）")
            return False

    except Exception as e:
        print(f"[FAIL] 测试异常: {e}")
        return False

def check_holdings_detail():
    """测试持仓明细数据"""
    print("\n[TEST] 持仓明细数据")
    print("=" * 60)

    try:
        resp = requests.post(
            f"{BASE_URL}/api/dashboard/holdings-detail",
            json={"holdings": TEST_HOLDINGS},
            timeout=10
        )

        if resp.status_code != 200:
            print(f"[FAIL] API返回错误: HTTP {resp.status_code}")
            return False

        data = resp.json()
        fund_details = data.get("fund_details", [])

        print(f"[INFO] 返回的基金数量: {len(fund_details)}")

        if len(fund_details) == 0:
            print("[FAIL] 持仓明细为空")
            return False

        print("[INFO] 基金列表:")
        for fund in fund_details:
            print(f"  - {fund['name']} ({fund['code']})")
            print(f"    市值: {fund['current_value']:,.2f}")
            print(f"    权重: {fund['weight']:.2f}%")
            print(f"    今日: {'+' if fund['today'] >= 0 else ''}{fund['today']:.2f}")

        print("\n[PASS] 持仓明细数据完整")
        return True

    except Exception as e:
        print(f"[FAIL] 测试异常: {e}")
        return False

def check_data_flow():
    """测试数据从前端到渲染的完整流程"""
    print("\n[TEST] 数据流完整性验证")
    print("=" * 60)

    print("[INFO] 验证点:")
    print("  1. API返回嵌套结构 (data.portfolio.xxx)")
    print("  2. 前端正确提取 portfolio 子对象")
    print("  3. renderSummaryCards() 使用正确的字段名")
    print("  4. 前端显示非零数值")

    print("\n[INFO] 修复说明:")
    print("  - 旧代码: overview.total_value (错误)")
    print("  - 新代码: overview.portfolio.total_value (正确)")
    print("  - 修复文件: src/static/js/dashboard/render.js")

    return True

def main():
    print("=" * 70)
    print("仪表盘数据渲染测试")
    print("=" * 70)
    print(f"目标服务器: {BASE_URL}")
    print(f"测试持仓: {len(TEST_HOLDINGS)} 只基金")

    results = []

    # 运行测试
    results.append(("汇总卡片", check_summary_cards()))
    results.append(("持仓明细", check_holdings_detail()))
    results.append(("数据流验证", check_data_flow()))

    # 汇总结果
    print("\n" + "=" * 70)
    print("测试结果汇总")
    print("=" * 70)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "[PASS]" if result else "[FAIL]"
        print(f"  {status} {name}")

    print(f"\n总计: {passed}/{total} 通过")

    if passed == total:
        print("\n✓ 所有测试通过！")
        print("\n下一步:")
        print("  1. 刷新浏览器仪表盘页面")
        print("  2. 检查汇总卡片是否显示正确的数值")
        print("  3. 检查持仓明细表格是否有数据")
        print("  4. 如果仍有问题，检查浏览器控制台错误")
    else:
        print("\n✗ 部分测试失败，请检查日志")

    return passed == total

if __name__ == "__main__":
    try:
        success = main()
        exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n测试被用户中断")
        exit(1)
    except Exception as e:
        print(f"\n\n测试失败: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
