/** 风险分析状态模块 — 管理风险分析模块内部可变数据，供各子渲染模块共享。 */

/** 各接口返回数据的缓存。 */
export let analysisData = {
    allocation: null,
    returnTrend: null,
    forecast: null,
    signalScorecard: null,
    rebalancing: null,
    benchmark: null,
    stressTest: null,
    rollingMetrics: null,
    tailRisk: null,
};

/** Chart.js 实例注册表。 */
export let chartInstances = {};

/** 最近一次成功刷新的时间戳（毫秒）。 */
export let lastUpdateTime = null;

/** 数据加载状态标志。 */
export let isLoading = false;

/** 错误状态。 */
export let loadError = null;

// ===== 状态修改器 =====

export function setAnalysisData(key, data) {
    analysisData[key] = data;
}

export function setChartInstance(name, instance) {
    if (chartInstances[name]) {
        try { chartInstances[name].destroy(); } catch (_) {}
    }
    chartInstances[name] = instance;
}

export function setLastUpdateTime(ts) {
    lastUpdateTime = ts || Date.now();
}

export function setIsLoading(val) {
    isLoading = val;
}

export function setLoadError(err) {
    loadError = err;
}

/**
 * 重置风险分析全部状态 — 销毁所有 Chart.js 实例以避免内存泄漏。
 */
export function resetAnalysisState() {
    Object.values(chartInstances).forEach(chart => {
        try { chart.destroy(); } catch (_) {}
    });
    chartInstances = {};
    analysisData = {
        allocation: null, returnTrend: null, forecast: null,
        signalScorecard: null, rebalancing: null, benchmark: null,
        stressTest: null, rollingMetrics: null, tailRisk: null,
    };
    lastUpdateTime = null;
    isLoading = false;
    loadError = null;
}
