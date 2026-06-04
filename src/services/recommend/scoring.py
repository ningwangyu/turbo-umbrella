import statistics

from quant.signals import calculate_signal

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
    all_navs = [p["nav"] for p in trend if p.get("nav")]
    navs = all_navs[-250:]  # 近1年（约250个交易日），与组合分析保持一致
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
                    "drawdown_type": "fund_1y",
                    "drawdown_label": "基金近1年最大回撤",
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
