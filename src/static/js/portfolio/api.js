/** 组合分析 API 模块 — 封装持仓分析请求，统一处理后端返回和错误状态。 */
import { holdings } from '../state.js';

// 组合分析 API 请求封装。
export async function fetchPortfolioAnalysis() {
    const response = await fetch("/api/portfolio/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings })
    });
    return response.json();
}
