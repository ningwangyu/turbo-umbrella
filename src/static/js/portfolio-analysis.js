/**
 * 组合分析模块 — 持仓分布、重叠持仓、风险指标
 */
import { holdings, $totalAssets } from './state.js';
import { fmtMoney, fmtPlain, colorCls, showToast } from './utils.js';

let analysisData = null;

/**
 * 获取组合分析数据
 */
export async function fetchPortfolioAnalysis() {
    if (!holdings.length) return null;
    try {
        const r = await fetch("/api/portfolio/analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ holdings: holdings.map(h => ({ code: h.code, value: h.value, profit: h.profit })) }),
        });
        if (!r.ok) throw new Error("获取分析数据失败");
        analysisData = await r.json();
        return analysisData;
    } catch (e) {
        console.error("Portfolio analysis:", e);
        return null;
    }
}

/**
 * 渲染组合分析页面
 */
export function renderPortfolioAnalysis(container) {
    if (!analysisData) {
        container.innerHTML = '<div class="panel-loading"><span class="spinner"></span>加载中...</div>';
        return;
    }

    let html = '<div class="portfolio-analysis">';

    // 组合风险指标卡片
    const rm = analysisData.risk_metrics;
    if (rm && rm.volatility !== null) {
        html += `<div class="risk-metrics">
            <div class="risk-card">
                <div class="risk-label">年化波动率</div>
                <div class="risk-value ${rm.volatility > 25 ? 'up' : rm.volatility > 15 ? '' : 'down'}">${rm.volatility}%</div>
            </div>
            <div class="risk-card">
                <div class="risk-label">最大回撤</div>
                <div class="risk-value up">${rm.max_drawdown}%</div>
            </div>
            <div class="risk-card">
                <div class="risk-label">Sharpe比率</div>
                <div class="risk-value ${rm.sharpe > 1 ? 'down' : rm.sharpe > 0 ? '' : 'up'}">${rm.sharpe}</div>
            </div>
            <div class="risk-card">
                <div class="risk-label">评估天数</div>
                <div class="risk-value" style="color:var(--text2)">${rm.days}天</div>
            </div>
        </div>`;
    }

    // 持仓类型分布
    if (analysisData.type_distribution && analysisData.type_distribution.length) {
        html += `<div class="analysis-section">
            <div class="section-title">资产配置分布</div>
            <div class="type-chart-area"><canvas id="typeChart" width="280" height="200"></canvas></div>
            <div class="type-legend" id="typeLegend"></div>
        </div>`;
    }

    // 重叠持仓分析
    if (analysisData.stock_overlap && analysisData.stock_overlap.length) {
        html += `<div class="analysis-section">
            <div class="section-title">重叠持仓 <span style="font-size:10px;color:var(--text3);font-weight:400">（多只基金共同持有）</span></div>
            <div class="overlap-list">`;
        analysisData.stock_overlap.forEach(s => {
            const funds = s.funds.map(f => f.name.substring(0, 6)).join("、");
            html += `<div class="overlap-item">
                <div class="overlap-left">
                    <span class="overlap-name">${s.name}</span>
                    <span class="overlap-code">${s.code}</span>
                    <span class="overlap-count">${s.count}只基金</span>
                </div>
                <div class="overlap-right">
                    <span class="overlap-pct">${s.total_pct.toFixed(2)}%</span>
                </div>
            </div>`;
        });
        html += `</div></div>`;
    }

    html += '</div>';
    container.innerHTML = html;

    // 渲染饼图
    if (analysisData.type_distribution && analysisData.type_distribution.length) {
        requestAnimationFrame(() => renderTypePieChart(analysisData.type_distribution));
    }
}

/**
 * 绘制简易饼图（纯Canvas，不依赖Chart.js）
 */
function renderTypePieChart(data) {
    const canvas = document.getElementById("typeChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const cx = 100, cy = 100, r = 80;
    const colors = ["#1a73e8", "#e74c3c", "#27ae60", "#f5a623", "#9b59b6", "#00bcd4", "#795548"];
    const total = data.reduce((s, d) => s + d.value, 0);

    let startAngle = -Math.PI / 2;
    const legendEl = document.getElementById("typeLegend");
    let legendHTML = "";

    data.forEach((item, i) => {
        const sliceAngle = (item.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();

        // 标签
        const midAngle = startAngle + sliceAngle / 2;
        const lx = cx + (r * 0.65) * Math.cos(midAngle);
        const ly = cy + (r * 0.65) * Math.sin(midAngle);
        if (sliceAngle > 0.3) {
            ctx.fillStyle = "#fff";
            ctx.font = "10px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(item.name, lx, ly);
        }

        legendHTML += `<span class="type-legend-item"><span class="type-dot" style="background:${colors[i % colors.length]}"></span>${item.name} ${item.value.toFixed(1)}%</span>`;
        startAngle += sliceAngle;
    });

    if (legendEl) legendEl.innerHTML = legendHTML;
}

/**
 * 初始化组合分析模块
 */
export function initPortfolioAnalysis() {
    // Tab切换事件在app.js中统一处理
}

/**
 * 组合分析CSS样式（注入到页面）
 */
export const PORTFOLIO_CSS = `
.portfolio-analysis { display: flex; flex-direction: column; gap: 10px; }
.risk-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.risk-card { background: var(--card); border-radius: var(--radius); padding: 10px; text-align: center; box-shadow: var(--shadow); }
.risk-label { font-size: 10px; color: var(--text3); margin-bottom: 4px; }
.risk-value { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
.analysis-section { background: var(--card); border-radius: var(--radius); padding: 10px; box-shadow: var(--shadow); }
.type-chart-area { display: flex; justify-content: center; padding: 6px 0; }
.type-legend { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.type-legend-item { font-size: 10px; display: flex; align-items: center; gap: 3px; }
.type-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.overlap-list { display: flex; flex-direction: column; gap: 4px; max-height: 300px; overflow-y: auto; }
.overlap-item { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 11px; }
.overlap-left { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.overlap-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.overlap-code { color: var(--text3); font-size: 9px; flex-shrink: 0; }
.overlap-count { background: #fef0f0; color: var(--up); font-size: 9px; padding: 1px 4px; border-radius: 4px; font-weight: 600; flex-shrink: 0; }
.overlap-pct { font-weight: 700; color: var(--primary); font-variant-numeric: tabular-nums; }
@media (max-width: 600px) { .risk-metrics { grid-template-columns: repeat(2, 1fr); } }
`;
