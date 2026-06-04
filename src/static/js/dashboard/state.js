/** 仪表盘状态模块 — 管理仪表盘内部可变数据，供各子渲染模块共享。 */

/** 各接口返回数据的缓存。 */
export let dashboardData = {
    overview: null,
    holdingsDetail: null,
};

/** Chart.js 实例注册表，键为图表名称，销毁时遍历销毁。 */
export let chartInstances = {};

/** 最近一次成功刷新的时间戳（毫秒）。 */
export let lastUpdateTime = null;

/** 数据加载状态标志，防止重复请求。 */
export let isLoading = false;

/** 错误状态：存储最近一次失败的错误信息。 */
export let loadError = null;

// ===== 状态修改器 =====

export function setDashboardData(key, data) {
    dashboardData[key] = data;
}

export function setChartInstance(name, instance) {
    // 如果同名实例已存在，先销毁旧的
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
 * 重置仪表盘全部状态 — 用于持仓变更后重新加载或页面切换时清理。
 * 销毁所有 Chart.js 实例以避免内存泄漏。
 */
export function resetDashboardState() {
    Object.values(chartInstances).forEach(chart => {
        try { chart.destroy(); } catch (_) {}
    });
    chartInstances = {};
    dashboardData = { overview: null, holdingsDetail: null };
    lastUpdateTime = null;
    isLoading = false;
    loadError = null;
}
