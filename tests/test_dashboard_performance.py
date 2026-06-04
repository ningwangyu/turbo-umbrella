#!/usr/bin/env python3
"""
仪表盘性能测试脚本

测试内容：
1. 原始端点 vs 优化端点的响应时间对比
2. 缓存命中率统计
3. 后台预热效果验证
4. 并发请求性能测试

使用方法：
    python test_dashboard_performance.py [--holdings HOLDINGS_FILE] [--rounds N]

示例：
    # 使用默认持仓测试
    python test_dashboard_performance.py

    # 使用自定义持仓文件
    python test_dashboard_performance.py --holdings holdings.json

    # 测试10轮
    python test_dashboard_performance.py --rounds 10
"""

import argparse
import json
import time
import statistics
from typing import List, Dict, Any
import requests

# 默认持仓数据
DEFAULT_HOLDINGS = [
    {"code": "000001", "value": 10000, "profit": 500},
    {"code": "000002", "value": 20000, "profit": 1000},
]

BASE_URL = "http://localhost:5000"


def measure_endpoint(endpoint: str, holdings: List[Dict], rounds: int = 3) -> Dict[str, Any]:
    """
    测试单个端点的性能

    Args:
        endpoint: API端点
        holdings: 持仓数据
        rounds: 测试轮数

    Returns:
        dict: 性能统计结果
    """
    times = []
    errors = 0

    for i in range(rounds):
        try:
            start = time.time()
            response = requests.post(
                f"{BASE_URL}{endpoint}",
                json={"holdings": holdings},
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            elapsed = time.time() - start

            if response.status_code == 200:
                times.append(elapsed)
            else:
                errors += 1
                print(f"  ⚠️  请求失败: HTTP {response.status_code}")
        except Exception as e:
            errors += 1
            print(f"  ❌ 请求异常: {e}")

    if not times:
        return {"error": "所有请求失败", "errors": errors}

    return {
        "rounds": rounds,
        "success": rounds - errors,
        "errors": errors,
        "times": {
            "min": round(min(times) * 1000, 2),      # 最小值（毫秒）
            "max": round(max(times) * 1000, 2),      # 最大值（毫秒）
            "avg": round(statistics.mean(times) * 1000, 2),  # 平均值（毫秒）
            "median": round(statistics.median(times) * 1000, 2),  # 中位数（毫秒）
            "p95": round(sorted(times)[int(len(times) * 0.95)] * 1000, 2) if len(times) > 1 else None,  # P95
        },
        "first_request_ms": round(times[0] * 1000, 2) if times else None,
        "subsequent_avg_ms": round(statistics.mean(times[1:]) * 1000, 2) if len(times) > 1 else None,
    }


def measure_cache_effectiveness(holdings: List[Dict]) -> Dict[str, Any]:
    """
    测试缓存效果

    Returns:
        dict: 缓存统计信息
    """
    try:
        # 先预热缓存
        print("  📦 预热缓存中...")
        requests.post(
            f"{BASE_URL}/api/dashboard/warmup",
            json={"holdings": holdings},
            headers={"Content-Type": "application/json"},
            timeout=30
        )

        # 获取缓存统计
        response = requests.get(f"{BASE_URL}/api/dashboard/optimize", timeout=5)
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"HTTP {response.status_code}"}
    except Exception as e:
        return {"error": str(e)}


def measure_prefetch_status() -> Dict[str, Any]:
    """
    测试预热状态

    Returns:
        dict: 预热状态信息
    """
    try:
        response = requests.get(f"{BASE_URL}/api/dashboard/prefetch-status", timeout=5)
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"HTTP {response.status_code}"}
    except Exception as e:
        return {"error": str(e)}


def run_performance_tests(holdings: List[Dict], rounds: int = 3):
    """
    运行完整的性能测试套件
    """
    print("\n" + "=" * 70)
    print("🚀 仪表盘性能测试")
    print("=" * 70)
    print(f"\n📊 测试配置:")
    print(f"   - 持仓数量: {len(holdings)} 只基金")
    print(f"   - 测试轮数: {rounds} 轮")
    print(f"   - 目标服务器: {BASE_URL}")

    # 测试1: 原始概览端点
    print("\n" + "-" * 70)
    print("📈 测试1: 原始概览端点 (/api/dashboard/overview)")
    print("-" * 70)
    result1 = measure_endpoint("/api/dashboard/overview", holdings, rounds)
    if "error" not in result1:
        print(f"  ✅ 成功: {result1['success']}/{result1['rounds']}")
        print(f"  ⏱️  首次请求: {result1['first_request_ms']}ms")
        print(f"  ⏱️  后续平均: {result1['subsequent_avg_ms']}ms")
        print(f"  ⏱️  总体平均: {result1['times']['avg']}ms")
        print(f"  📊 P95: {result1['times']['p95']}ms")
    else:
        print(f"  ❌ 失败: {result1['error']}")

    # 测试2: 优化概览端点
    print("\n" + "-" * 70)
    print("⚡ 测试2: 优化概览端点 (/api/dashboard/overview-fast)")
    print("-" * 70)
    result2 = measure_endpoint("/api/dashboard/overview-fast", holdings, rounds)
    if "error" not in result2:
        print(f"  ✅ 成功: {result2['success']}/{result2['rounds']}")
        print(f"  ⏱️  首次请求: {result2['first_request_ms']}ms")
        print(f"  ⏱️  后续平均: {result2['subsequent_avg_ms']}ms")
        print(f"  ⏱️  总体平均: {result2['times']['avg']}ms")
        print(f"  📊 P95: {result2['times']['p95']}ms")
    else:
        print(f"  ❌ 失败: {result2['error']}")

    # 性能对比
    if "error" not in result1 and "error" not in result2:
        speedup = result1['times']['avg'] / result2['times']['avg']
        improvement = ((result1['times']['avg'] - result2['times']['avg']) / result1['times']['avg']) * 100
        print(f"\n  🚀 性能提升:")
        print(f"     - 加速比: {speedup:.2f}x")
        print(f"     - 响应时间减少: {improvement:.1f}%")

    # 测试3: 缓存效果
    print("\n" + "-" * 70)
    print("📦 测试3: 缓存效果")
    print("-" * 70)
    cache_stats = measure_cache_effectiveness(holdings)
    if "error" not in cache_stats:
        print(f"  ✅ 缓存统计:")
        stats = cache_stats.get("cache_stats", {})
        print(f"     - 市场指数: {stats.get('index', 0)} 条")
        print(f"     - 基金估值: {stats.get('estimation', 0)} 条")
        print(f"     - 基金走势: {stats.get('performance', 0)} 条")
        suggestions = cache_stats.get("suggestions", [])
        if suggestions:
            print(f"  💡 优化建议:")
            for s in suggestions:
                print(f"     - [{s['priority']}] {s['message']}")
        else:
            print(f"  ✅ 无需优化")
    else:
        print(f"  ❌ 失败: {cache_stats['error']}")

    # 测试4: 预热状态
    print("\n" + "-" * 70)
    print("🔥 测试4: 预热状态")
    print("-" * 70)
    prefetch_status = measure_prefetch_status()
    if "error" not in prefetch_status:
        print(f"  ✅ 预热状态:")
        print(f"     - 是否正在预热: {prefetch_status.get('is_prefetching', False)}")
        print(f"     - 预热次数: {prefetch_status.get('prefetch_count', 0)}")
        print(f"     - 最后预热: {prefetch_status.get('last_prefetch', 'N/A')}")
        errors = prefetch_status.get('recent_errors', [])
        if errors:
            print(f"  ⚠️  最近错误: {len(errors)} 个")
        else:
            print(f"  ✅ 无错误")
    else:
        print(f"  ❌ 失败: {prefetch_status['error']}")

    # 测试5: 并发请求性能
    print("\n" + "-" * 70)
    print("🔄 测试5: 并发请求性能 (模拟10个并发用户)")
    print("-" * 70)

    import concurrent.futures

    def concurrent_request():
        try:
            start = time.time()
            response = requests.post(
                f"{BASE_URL}/api/dashboard/overview-fast",
                json={"holdings": holdings},
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            elapsed = time.time() - start
            return elapsed, response.status_code
        except Exception as e:
            return None, str(e)

    times = []
    errors = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(concurrent_request) for _ in range(10)]
        for future in concurrent.futures.as_completed(futures):
            elapsed, status = future.result()
            if elapsed is not None and status == 200:
                times.append(elapsed)
            else:
                errors += 1

    if times:
        print(f"  ✅ 并发测试完成:")
        print(f"     - 成功: {len(times)}/10")
        print(f"     - 平均响应: {statistics.mean(times) * 1000:.2f}ms")
        print(f"     - 最大响应: {max(times) * 1000:.2f}ms")
        print(f"     - 最小响应: {min(times) * 1000:.2f}ms")
        if errors:
            print(f"  ⚠️  失败请求: {errors}")
    else:
        print(f"  ❌ 所有并发请求失败")

    # 总结
    print("\n" + "=" * 70)
    print("📊 性能测试总结")
    print("=" * 70)

    if "error" not in result1 and "error" not in result2:
        print(f"\n  🎯 关键指标:")
        print(f"     - 原始端点平均: {result1['times']['avg']}ms")
        print(f"     - 优化端点平均: {result2['times']['avg']}ms")
        print(f"     - 性能提升: {improvement:.1f}%")
        print(f"     - 加速比: {speedup:.2f}x")

    print(f"\n  ✅ 优化建议:")
    if "error" not in result2 and result2['times']['avg'] < 500:
        print(f"     - ✨ 响应速度优秀（<500ms）")
    elif "error" not in result2 and result2['times']['avg'] < 1000:
        print(f"     - ⚡ 响应速度良好（<1s）")
    else:
        print(f"     - ⚠️  响应速度待优化（>1s）")

    if "error" not in cache_stats:
        est_count = cache_stats.get("cache_stats", {}).get("estimation", 0)
        if est_count > 0:
            print(f"     - ✅ 缓存预热正常（{est_count}条数据）")
        else:
            print(f"     - ⚠️  缓存未预热，建议执行手动预热")

    print(f"\n  📚 完整文档: docs/DASHBOARD_PERFORMANCE.md")
    print()


def main():
    parser = argparse.ArgumentParser(description="仪表盘性能测试")
    parser.add_argument("--holdings", type=str, help="持仓JSON文件路径")
    parser.add_argument("--rounds", type=int, default=3, help="测试轮数（默认3轮）")
    args = parser.parse_args()

    # 加载持仓数据
    if args.holdings:
        try:
            with open(args.holdings, 'r', encoding='utf-8') as f:
                holdings = json.load(f)
            print(f"✅ 从文件加载持仓: {args.holdings}")
        except Exception as e:
            print(f"❌ 加载持仓文件失败: {e}")
            print("使用默认持仓数据")
            holdings = DEFAULT_HOLDINGS
    else:
        holdings = DEFAULT_HOLDINGS

    # 运行测试
    try:
        run_performance_tests(holdings, args.rounds)
    except KeyboardInterrupt:
        print("\n\n⚠️  测试被用户中断")
    except Exception as e:
        print(f"\n\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
