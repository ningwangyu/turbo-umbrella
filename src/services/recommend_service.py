"""
基金推荐引擎 — 三层评分筛选架构

创新点：
1. 快速初筛（quick_score）：基于多周期收益率加权 + 正收益一致性 + 收益加速度三维指标，
   从全市场200+基金中快速筛选出Top45候选，避免对全部基金执行昂贵的详细评分。
2. 综合评分（calculate_comprehensive_score）：五因子加权模型，融合收益能力(30%)、
   风险控制(20%)、风险调整收益/Sharpe(20%)、收益一致性(15%)、技术面(15%)，
   每个因子独立评分(0-100)后按权重汇总。
3. 分层推荐（get_recommendations）：按综合评分百分位分层，前18%为"强烈推荐"，
   18%-55%为"推荐买入"，55%-85%为"值得关注"，后15%为"观望"。

数据流：fetch_fund_pool() → quick_score()初筛 → calculate_comprehensive_score()精算 → 分层推荐
"""

import time
from concurrent.futures import ThreadPoolExecutor, as_completed


from config import CONFIG, RECOMMEND_CACHE_TTL
from cache import recommend_cache
from services.fund_service import fetch_fund_estimation, fetch_fund_performance
from services.recommend.pool import fetch_fund_pool
from services.recommend.scoring import quick_score, calculate_comprehensive_score


def get_recommendations():
    """
    获取基金推荐列表 — 推荐引擎的主入口函数。

    完整流程：
    1. 从排行榜获取200+候选基金池（fetch_fund_pool）
    2. 快速评分初筛，选出Top45（quick_score，无需额外网络请求）
    3. 并发获取Top45的详细数据（净值走势+实时估值）
    4. 对每只基金执行五因子综合评分（calculate_comprehensive_score）
    5. 按综合评分排序，百分位分层为：强烈推荐/推荐买入/值得关注
    6. 过滤掉"观望"级别，只返回有推荐价值的基金

    降级策略：如果并发评分失败（网络超时等），回退到快速评分结果

    Returns:
        dict: {items: 推荐列表, meta: {total_scored, strong_buy_count, buy_count, watch_count}}
    """
    cached = recommend_cache.get("recommend", RECOMMEND_CACHE_TTL)
    if cached is not None:
        return cached

    # 第1步：获取候选基金池（200只，多维度排行榜爬取）
    fund_pool = fetch_fund_pool()
    if not fund_pool:
        result = {"items": [], "meta": {"total_scored": 0, "strong_buy_count": 0, "buy_count": 0, "watch_count": 0}}
        return result

    # 第2步：快速评分初筛（仅使用排行榜自带的收益率数据）
    for f in fund_pool:
        f["quick_score"] = quick_score(f)

    # 按快速评分降序排列，取Top45进入精细评分阶段
    fund_pool.sort(key=lambda x: x["quick_score"], reverse=True)
    top_candidates = fund_pool[:45]

    def _process_fund(f):
        """对单只基金执行综合评分：获取实时数据 → 五因子评分"""
        code = f["code"]
        est = fetch_fund_estimation(code)
        if not est:
            return None
        perf = fetch_fund_performance(code)
        if not perf:
            return None
        try:
            score_result = calculate_comprehensive_score(f, perf, est)
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

    # 第3步：并发获取详细数据并执行综合评分
    # 使用线程池并发处理，大幅缩短总耗时（从串行~90s降到并发~15s）
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

    # 第4步（降级）：如果并发评分全部失败，回退到快速评分结果
    # 仅获取估值数据，使用quick_score作为评分
    if not all_scored:
        all_scored = []
        for f in fund_pool[:60]:
            code = f["code"]
            est = fetch_fund_estimation(code)
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
        result = {"items": [], "meta": {"total_scored": 0, "strong_buy_count": 0, "buy_count": 0, "watch_count": 0}}
        return result

    # 第5步：按综合评分排序，百分位分层推荐
    all_scored.sort(key=lambda x: x["composite_score"], reverse=True)

    # 百分位分层：前18%强烈推荐，18%-55%推荐买入，55%-85%值得关注，85%+观望（过滤掉）
    n = len(all_scored)
    strong_buy_end = max(1, int(n * 0.18))
    buy_end = max(strong_buy_end + 1, int(n * 0.55))
    watch_end = max(buy_end + 1, int(n * 0.85))

    # 第6步：为每只基金分配推荐级别和描述
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
        r["weighted_score"] = s
        r["buy_score"] = s
        r["bullish_count"] = sum(1 for f in r.get("factors", []) if f.get("score", 50) >= 55)
        r["bearish_count"] = sum(1 for f in r.get("factors", []) if f.get("score", 50) <= 45)
        r["factor_total"] = total_f

    results = [r for r in all_scored if r["recommend_level"] != "hold"]

    meta = {
        "total_scored": n,
        "strong_buy_count": sum(1 for r in results if r["recommend_level"] == "strong_buy"),
        "buy_count": sum(1 for r in results if r["recommend_level"] == "buy"),
        "watch_count": sum(1 for r in results if r["recommend_level"] == "watch"),
    }
    output = {"items": results, "meta": meta}

    recommend_cache.set("recommend", output)
    return output
