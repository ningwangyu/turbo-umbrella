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

import re
import time
import statistics
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

from config import HEADERS, CONFIG, POOL_CACHE_TTL, RECOMMEND_CACHE_TTL
from cache import pool_cache, recommend_cache
from ratelimit import limiter
from quant.signals import calculate_signal
from services.fund_service import fetch_fund_estimation, fetch_fund_performance


def _safe_float(s):
    """安全的字符串转浮点，空值返回None"""
    try:
        return float(s) if s and s.strip() != "" else None
    except (ValueError, TypeError):
        return None


def fetch_fund_pool() -> list:
    """
    从东方财富基金排行榜获取候选基金池。

    多维度爬取策略：按基金类型(全部/股票型/混合型) × 排序维度(半年收益/年收益)，
    共6个维度各取30只，去重后合并为最多200只的候选池。
    这样可以覆盖不同策略风格的基金，避免单一维度筛选的偏见。

    Returns:
        list: 候选基金列表，每项包含 code/name/type/returns_{1m,3m,6m,1y}
    """
    cached = pool_cache.get("pool", POOL_CACHE_TTL)
    if cached is not None:
        return cached

    # 多维度爬取：(基金类型ft, 排序字段sc, 每页数量pn)
    # ft: all=全部, gp=股票型, hh=混合型
    # sc: 6yzf=近半年涨幅, 1nzf=近一年涨幅
    sources = [
        ("all", "6yzf", 30),
        ("all", "1nzf", 30),
        ("gp", "6yzf", 30),
        ("gp", "1nzf", 30),
        ("hh", "6yzf", 30),
        ("hh", "1nzf", 30),
    ]
    seen = set()  # 用于基金代码去重
    pool = []

    for ft, sc, pn in sources:
        try:
            # 东方财富基金排行榜API，返回格式为JS变量赋值语句
            url = (
                f"http://fund.eastmoney.com/data/rankhandler.aspx"
                f"?op=ph&dt=kf&ft={ft}&rs=&gs=0&sc={sc}&st=desc&pi=1&pn={pn}"
            )
            limiter.acquire("eastmoney")
            resp = requests.get(url, timeout=10, headers=HEADERS)
            resp.encoding = "gbk"
            text = resp.text

            # 解析 datas:["基金1","基金2",...] 格式
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

                # fields[7]=近1月收益, fields[8]=近3月, fields[9]=近6月, fields[10]=近1年
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

    pool_cache.set("pool", pool)
    return pool


def quick_score(fund_data: dict) -> float:
    """
    快速初筛评分 — 用于从200+候选基金中快速筛选Top45。

    三维评分模型（无需额外网络请求，仅使用排行榜自带的收益率数据）：
    1. 收益加权得分(60%)：近1月/3月/6月/1年收益加权平均，权重随时间跨度递增
    2. 正收益一致性(25%)：各周期中正收益占比，越高说明收益越稳定
    3. 收益加速度(15%)：判断收益是否加速增长（近6月>近3月时加分）

    Args:
        fund_data: 从排行榜获取的基金数据，含 returns_{1m,3m,6m,1y}

    Returns:
        float: 快速评分 (5-95)，用于初步排序候选基金
    """
    returns = {
        "1m": fund_data.get("returns_1m"),
        "3m": fund_data.get("returns_3m"),
        "6m": fund_data.get("returns_6m"),
        "1y": fund_data.get("returns_1y"),
    }

    # 维度1：收益加权得分 (60%)
    # 权重设计：长期收益权重更高（1年35% > 6月35% > 3月20% > 1月10%）
    ret_weights = {"1m": 0.10, "3m": 0.20, "6m": 0.35, "1y": 0.35}
    ret_sum = 0
    ret_w_sum = 0
    for period, w in ret_weights.items():
        val = returns.get(period)
        if val is not None:
            ret_sum += val * w
            ret_w_sum += w
    avg_return = ret_sum / ret_w_sum if ret_w_sum > 0 else 0
    # 每1%收益对应1分，基线50分，范围10-95
    ret_score = max(10, min(95, 50 + avg_return * 1.0))

    # 维度2：正收益一致性 (25%)
    # 统计各周期中正收益的占比，占比越高说明收益越稳定
    positive = sum(1 for v in returns.values() if v is not None and v > 0)
    total = sum(1 for v in returns.values() if v is not None)
    consistency = (positive / total * 100) if total > 0 else 50

    # 维度3：收益加速度 (15%)
    # 判断收益趋势是否在加速：近6月 > 近3月 表示最近3个月收益比之前更快
    accel_score = 50
    r3m = returns.get("3m")
    r6m = returns.get("6m")
    r1y = returns.get("1y")
    if r6m is not None and r1y is not None:
        if r6m > 0 and r1y > 0:
            accel_score = 65
            # 近6月收益 > 近3月收益，说明最近3个月在加速上涨
            if r3m is not None and r6m > r3m:
                accel_score = 75
        elif r6m < 0 or r1y < 0:
            accel_score = 35

    # 三维加权汇总：收益60% + 一致性25% + 加速度15%
    composite = ret_score * 0.60 + consistency * 0.25 + accel_score * 0.15
    return max(5, min(95, round(composite)))


def calculate_comprehensive_score(fund_data: dict, perf: dict, est: dict) -> dict:
    """
    五因子综合评分 — 推荐引擎的核心算法，对单只基金进行深度评估。

    五因子构成：
    1. 收益能力(30%)：多周期收益率加权平均，衡量盈利能力
    2. 风险控制(20%)：年化波动率 + 最大回撤，衡量风险水平
    3. 风险调整收益(20%)：Sharpe比率，衡量每单位风险对应的超额收益
    4. 收益一致性(15%)：多周期正收益比例，衡量收益稳定性
    5. 技术面(15%)：调用量化信号引擎的买卖评分，衡量当前技术形态

    创新点：将量化信号引擎（signals.py）作为技术面因子嵌入综合评分，
    实现了"基本面+风险面+技术面"的三维评估体系。

    Args:
        fund_data: 排行榜数据（含各周期收益率）
        perf: 业绩数据（含净值走势trend和收益率returns）
        est: 实时估值数据

    Returns:
        dict: {composite_score: 综合评分, factors: 因子详情列表, returns: 收益率}
    """
    trend = perf.get("trend", [])
    # 合并排行榜和业绩数据的收益率，排行榜数据优先
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
    composite = 50  # 评分基线：50分表示中性

    # --- Factor 1: 收益能力 (权重30%) ---
    # 使用加权平均收益，长期权重更高
    ret_weights = {"1m": 0.15, "3m": 0.25, "6m": 0.30, "1y": 0.30}
    ret_sum = 0
    ret_w_sum = 0
    for period, w in ret_weights.items():
        val = rank_returns.get(period)
        if val is not None:
            ret_sum += val * w
            ret_w_sum += w
    avg_return = ret_sum / ret_w_sum if ret_w_sum > 0 else 0

    ret_score = max(10, min(95, 50 + avg_return * 1.2))
    composite += (ret_score - 50) * 0.30
    factors.append({
        "name": "收益能力",
        "value": f"{avg_return:+.1f}%",
        "detail": "优秀" if ret_score >= 70 else "良好" if ret_score >= 55 else "一般" if ret_score >= 40 else "较弱",
        "score": round(ret_score),
    })

    # --- Factor 2: 风险控制 (权重20%) ---
    # 综合评估波动率和最大回撤，两者各占一半权重
    risk_score = 50
    navs = [p["nav"] for p in trend if p.get("nav")]
    # 计算日收益率序列：(今日净值 - 昨日净值) / 昨日净值
    daily_rets = []
    for i in range(1, len(navs)):
        if navs[i-1] > 0:
            daily_rets.append((navs[i] - navs[i-1]) / navs[i-1])
    if len(trend) >= 30:
        if len(navs) >= 30:
            if daily_rets:
                # 年化波动率 = 日波动率 × sqrt(252)（252为A股年交易日数）
                vol = statistics.stdev(daily_rets) if len(daily_rets) > 1 else 0
                ann_vol = vol * (252 ** 0.5) * 100

                # 计算最大回撤：从历史最高点到最低点的跌幅百分比
                peak = navs[0]
                max_dd = 0
                for n in navs:
                    if n > peak:
                        peak = n
                    dd = (n - peak) / peak * 100
                    if dd < max_dd:
                        max_dd = dd

                # 波动率评分：波动率越低分越高，年化波动率每增加1%扣2分
                vol_score = max(15, min(90, 80 - ann_vol * 2))
                # 回撤评分：回撤越小分越高，每1%回撤加1.8分（回撤为负值所以用加法）
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

    # --- Factor 3: 风险调整收益/Sharpe比率 (权重20%) ---
    # Sharpe比率 = (年化收益率 - 无风险利率) / 年化波动率
    # 这里简化为 年化收益率 / 年化波动率（忽略无风险利率）
    sharpe_score = 50
    if len(trend) >= 30 and len(navs) >= 30 and daily_rets:
        vol = statistics.stdev(daily_rets) if len(daily_rets) > 1 else 0.001
        mean_ret = sum(daily_rets) / len(daily_rets)
        # 年化Sharpe = 日均收益/日波动率 × sqrt(252)
        sharpe = (mean_ret / vol) * (252 ** 0.5) if vol > 0 else 0
        # Sharpe评分映射：>2优秀(85分)，>1良好(65-85)，>0一般(45-65)，<0较差
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

    # --- Factor 4: 收益一致性 (权重15%) ---
    # 统计多周期中正收益的比例，越高说明基金收益越稳定
    positive_periods = 0
    total_periods = 0
    for period in ["1m", "3m", "6m", "1y"]:
        val = rank_returns.get(period)
        if val is not None:
            total_periods += 1
            if val > 0:
                positive_periods += 1
    # 一致性比例：正收益周期数 / 总周期数
    consistency_ratio = positive_periods / total_periods if total_periods > 0 else 0.5
    # 评分映射：全部正收益=80分，全部负收益=20分
    consistency_score = 20 + consistency_ratio * 60
    composite += (consistency_score - 50) * 0.15
    factors.append({
        "name": "收益一致性",
        "value": f"{positive_periods}/{total_periods}正收益",
        "detail": "稳定" if consistency_score >= 65 else "较好" if consistency_score >= 50 else "波动",
        "score": round(consistency_score),
    })

    # --- Factor 5: 技术面 (权重15%) ---
    # 创新点：复用量化信号引擎(signals.py)的买卖评分作为技术面因子
    # 信号引擎的buy_score是5因子加权评分，这里作为技术面维度纳入综合评分
    tech_score = 50
    if len(trend) >= 14:
        try:
            est_copy = {
                "nav": est.get("nav", ""),
                "estimated_change_pct": est.get("estimated_change_pct", "0"),
            }
            sig = calculate_signal(perf, est_copy)
            tech_score = sig.get("buy_score", 50)
            # 提取MA20/MA60因子详情供前端展示
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

    # 限制综合评分在5-95范围内
    final_score = max(5, min(95, round(composite)))

    # 加速奖励：6月和1年均正收益，且近6月>近3月（加速上涨），额外+5分
    r6m = rank_returns.get("6m")
    r1y = rank_returns.get("1y")
    r3m = rank_returns.get("3m")
    if r6m is not None and r1y is not None and r6m > 0 and r1y > 0:
        if r3m is not None and r6m > r3m:
            final_score = min(95, final_score + 5)

    return {
        "composite_score": final_score,
        "factors": factors,
        "returns": rank_returns,
    }


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
