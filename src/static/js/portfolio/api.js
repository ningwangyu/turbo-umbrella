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
