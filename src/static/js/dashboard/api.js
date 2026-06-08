/** 仪表盘 API 模块 — 封装仪表盘后端接口的请求与错误处理。 */

/**
 * 统一 JSON 请求封装，支持超时。
 */
async function fetchJson(url, body, timeoutMs = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
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
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 获取仪表盘总览数据（汇总资产、今日收益、三大指数、成交额等）。
 */
export async function fetchDashboardOverview(holdings) {
    return fetchJson("/api/dashboard/overview", { holdings });
}

/**
 * 获取持仓明细数据（每只基金的市值、权重、收益等）。
 */
export async function fetchHoldingsDetail(holdings) {
    return fetchJson("/api/dashboard/holdings-detail", { holdings });
}

/**
 * 获取智能事件时间线数据。
 */
export async function fetchTimeline(holdings) {
    return fetchJson("/api/dashboard/timeline", { holdings });
}
