/** 风险分析 API 模块 — 封装风险分析模块9个后端接口的请求与错误处理。 */

/**
 * 统一 JSON 请求封装。
 */
async function fetchJson(url, body) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    let data;
    try {
        data = await response.json();
    } catch (e) {
        throw new Error(`HTTP ${response.status}`);
    }
    if (!response.ok || data?.error) {
        throw new Error(data?.error || `HTTP ${response.status}`);
    }
    return data;
}

/** 获取资产配置分布数据（资产类型饼图、风险等级、集中度指标、MPT高级分析）。 */
export async function fetchAllocation(holdings) {
    return fetchJson("/api/risk/allocation", { holdings });
}

/** 获取收益趋势预测数据（三模型集成：乐观/基准/悲观曲线）。 */
export async function fetchReturnTrend(holdings) {
    return fetchJson("/api/risk/return-trend", { holdings });
}

/** 获取蒙特卡洛6个月预测数据（扇形分位数路径）。 */
export async function fetchForecast(holdings) {
    return fetchJson("/api/risk/forecast", { holdings });
}

/** 获取信号健康评分卡数据（五因子量化信号 + 7天趋势）。 */
export async function fetchSignalScorecard(holdings) {
    return fetchJson("/api/risk/signal-scorecard", { holdings });
}

/** 获取再平衡建议数据（现金利用率、集中度、风险分布、操作建议）。 */
export async function fetchRebalancing(holdings) {
    return fetchJson("/api/risk/rebalancing", { holdings });
}

/** 获取基准对比分析数据（vs 沪深300：alpha、beta、捕获率、跟踪误差）。 */
export async function fetchBenchmark(holdings) {
    return fetchJson("/api/risk/benchmark", { holdings });
}

/** 获取历史压力测试数据（5大A股危机情景）。 */
export async function fetchStressTest(holdings) {
    return fetchJson("/api/risk/stress-test", { holdings });
}

/** 获取滚动风险指标（30/60/90日波动率、夏普、最大回撤）。 */
export async function fetchRollingMetrics(holdings) {
    return fetchJson("/api/risk/rolling-metrics", { holdings });
}

/** 获取尾部风险分析（VaR/CVaR、Ulcer Index、回撤区间、偏度峰度）。 */
export async function fetchTailRisk(holdings) {
    return fetchJson("/api/risk/tail-risk", { holdings });
}
