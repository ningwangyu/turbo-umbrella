/**
 * 仪表盘资产配置组件 — Doughnut 图展示资产类型分布，风险等级条形图，集中度指标。
 *
 * 使用 charts.js 提供的 createDoughnutChart() 管理 Chart.js 实例。
 */
import { ASSET_TYPE_COLORS, createDoughnutChart, createBarChart, createScatterChart, createHeatmap } from './charts.js';

/**
 * 渲染资产配置区。
 * @param {HTMLElement} container - 容器
 * @param {Object} data - allocation 接口返回数据
 */
export function renderAllocation(container, data) {
    if (!container) return;

    if (!data) {
        container.innerHTML = `<div class="dash-empty">暂无配置数据</div>`;
        return;
    }

    let html = '';

    // 1) 资产类型分布
    if (data.type_distribution && data.type_distribution.length) {
        html += renderTypeDistribution(data.type_distribution);
    }

    // 2) 风险等级分布
    if (data.risk_levels && data.risk_levels.length) {
        html += renderRiskLevels(data.risk_levels);
    }

    // 3) 组合健康指标（替换原来的集中度指标）
    if (data.concentration || data.risk_return || data.portfolio_summary) {
        html += renderIndicatorCards(data);
    }

    container.innerHTML = html;

    // 在 DOM 插入后创建图表（需要 canvas 已存在于文档中）
    if (data.type_distribution && data.type_distribution.length) {
        createTypeDoughnut(container, data.type_distribution);
    }
    if (data.risk_levels && data.risk_levels.length) {
        createRiskBars(container, data.risk_levels);
    }
}

/**
 * 渲染资产类型分布区域（Doughnut 图 + 图例）。
 * @param {Array} types - [{ name, value, fund_count? }]
 * @returns {string} HTML
 */
function renderTypeDistribution(types) {
    let html = '<div class="dash-alloc-section">';
    html += '<div class="dash-alloc-subtitle">资产类型分布</div>';
    html += '<div class="dash-doughnut-wrap">';
    html += '<div class="dash-doughnut-canvas-wrap">';
    html += '<canvas id="dashAllocDoughnut" width="160" height="160"></canvas>';
    html += '<div class="dash-doughnut-center"><div class="dash-doughnut-center-label">基金数</div>';
    const totalCount = types.reduce((sum, t) => sum + (t.fund_count || 0), 0);
    html += `<div class="dash-doughnut-center-value">${totalCount}</div>`;
    html += '</div></div>';

    // 图例
    html += '<div class="dash-legend">';
    types.forEach((t, i) => {
        const color = ASSET_TYPE_COLORS[i % ASSET_TYPE_COLORS.length];
        html += `<div class="dash-legend-item">
            <span class="dash-legend-dot" style="background:${color}"></span>
            <span class="dash-legend-name">${t.name}</span>
            <span class="dash-legend-pct">${Number(t.value).toFixed(1)}%</span>
        </div>`;
    });
    html += '</div></div></div>';

    return html;
}

/**
 * 创建资产类型 Doughnut 图。
 * @param {HTMLElement} container
 * @param {Array} types
 */
function createTypeDoughnut(container, types) {
    const canvas = container.querySelector('#dashAllocDoughnut');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    createDoughnutChart(ctx, {
        labels: types.map(t => t.name),
        values: types.map(t => Number(t.value)),
    }, {
        tooltipCallbacks: {
            label: (tooltipCtx) => {
                const item = types[tooltipCtx.dataIndex];
                const fundLabel = item.fund_count ? ` (${item.fund_count}只)` : '';
                return `${item.name}: ${Number(item.value).toFixed(1)}%${fundLabel}`;
            }
        }
    }, 'allocDoughnut');
}

/**
 * 渲染风险等级分布。
 * @param {Array} levels - [{ name, weight, level? }]
 * @returns {string} HTML
 */
function renderRiskLevels(levels) {
    let html = '<div class="dash-alloc-section">';
    html += '<div class="dash-alloc-subtitle">风险等级分布</div>';
    html += '<div class="dash-risk-list">';

    levels.forEach(level => {
        const weight = Number(level.weight) || 0;
        const riskCls = getRiskClass(level.level || level.name);
        html += `<div class="dash-risk-row">
            <span class="dash-risk-label">${level.name}</span>
            <div class="dash-risk-track">
                <div class="dash-risk-fill ${riskCls}" style="width:${Math.min(weight, 100)}%"></div>
            </div>
            <span class="dash-risk-pct">${weight.toFixed(1)}%</span>
        </div>`;
    });

    html += '</div></div>';
    return html;
}

/**
 * 创建风险等级条形图（使用水平 bar chart 作为辅助）。
 * @param {HTMLElement} container
 * @param {Array} levels
 */
function createRiskBars(container, levels) {
    // 风险等级用 CSS 原生进度条渲染更轻量，此处可选创建 bar chart
    // 如果 levels 超过 5 个用 Chart.js 渲染，否则用 CSS 进度条
    if (levels.length <= 5) return; // 已用 CSS 渲染，无需 Chart.js

    const canvas = container.querySelector('#dashRiskBarChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    createBarChart(ctx, {
        labels: levels.map(l => l.name),
        values: levels.map(l => Number(l.weight)),
        colors: levels.map(l => getRiskColor(l.level || l.name)),
    }, { horizontal: true }, 'riskBar');
}

/**
 * 根据风险等级名称返回 CSS 类。
 * @param {string} levelName
 * @returns {string}
 */
function getRiskClass(levelName) {
    const name = String(levelName).toLowerCase();
    if (name.includes('高') || name.includes('high')) return 'high';
    if (name.includes('中') || name.includes('medium')) return 'medium';
    return 'low';
}

/**
 * 根据风险等级返回颜色值。
 * @param {string} levelName
 * @returns {string}
 */
function getRiskColor(levelName) {
    const name = String(levelName).toLowerCase();
    if (name.includes('高') || name.includes('high')) return '#ef4444';
    if (name.includes('中') || name.includes('medium')) return '#f59e0b';
    return '#22c55e';
}

/**
 * 渲染集中度指标。
 * @param {Object} conc - { hhi, diversification_score, top_weight? }
 * @returns {string} HTML
 */
function renderConcentration(conc) {
    const hhi = conc.hhi != null ? Number(conc.hhi).toFixed(3) : '--';
    const divScore = conc.diversification_score != null ? Number(conc.diversification_score).toFixed(1) : '--';
    const topWeight = conc.max_single != null ? Number(conc.max_single).toFixed(1) + '%' : '--';

    // HHI 解读
    const hhiNum = Number(conc.hhi) || 0;
    let hhiDesc = '分散';
    if (hhiNum > 0.25) hhiDesc = '高度集中';
    else if (hhiNum > 0.15) hhiDesc = '适度集中';

    // 分散化评分解读
    const divNum = Number(conc.diversification_score) || 0;
    let divLevel = '优秀';
    if (divNum < 40) divLevel = '较弱';
    else if (divNum < 60) divLevel = '一般';
    else if (divNum < 80) divLevel = '良好';

    let html = '<div class="dash-alloc-section">';
    html += '<div class="dash-alloc-subtitle">集中度指标</div>';
    html += '<div class="dash-concentration-grid">';

    html += `<div class="dash-conc-card">
        <div class="dash-conc-label">HHI 指数</div>
        <div class="dash-conc-value">${hhi}</div>
        <div class="dash-conc-desc">${hhiDesc}</div>
    </div>`;

    html += `<div class="dash-conc-card">
        <div class="dash-conc-label">分散化评分</div>
        <div class="dash-conc-value">${divScore}</div>
        <div class="dash-conc-desc">${divLevel}</div>
    </div>`;

    html += `<div class="dash-conc-card">
        <div class="dash-conc-label">最大基金权重</div>
        <div class="dash-conc-value">${topWeight}</div>
        <div class="dash-conc-desc">${Number(conc.max_single) > 30 ? '偏高' : '正常'}</div>
    </div>`;

    html += '</div></div>';
    return html;
}


// ============================================================
// 高级组合分析（MPT国际标准指标）
// ============================================================

/**
 * 渲染高级组合分析区。
 * @param {HTMLElement} container - 容器 (#dashAllocAdvanced)
 * @param {Object} data - allocation 接口返回的完整数据
 */
export function renderAllocationAdvanced(container, data) {
    if (!container || !data || !data.risk_return) {
        if (container) container.innerHTML = '';
        return;
    }

    let html = '';

    // 第1行: 风险收益散点 + 风险贡献
    html += '<div class="alloc-metrics-pair">';
    html += renderRiskReturnScatter(data.risk_return);
    html += renderRiskContribution(data.risk_contribution);
    html += '</div>';

    // 第2行: 夏普比率 + 最大回撤
    html += '<div class="alloc-metrics-pair">';
    html += renderSharpeRatio(data.sharpe_ratios);
    html += renderMaxDrawdown(data.max_drawdowns);
    html += '</div>';

    // 第3行: 分散化比率 + 有效独立赌注
    html += '<div class="alloc-metrics-pair">';
    html += renderDiversificationGauge(data.diversification_ratio);
    html += renderEffectiveBets(data.effective_bets);
    html += '</div>';

    // 第4行: 相关系数热力图（全宽）
    html += renderCorrelationHeatmap(data.correlation_heatmap);

    container.innerHTML = html;

    // DOM 插入后创建图表
    createScatterIfNeeded(container, data.risk_return);
    createRCBarIfNeeded(container, data.risk_contribution);
    createSharpeBarIfNeeded(container, data.sharpe_ratios);
    createDDBarIfNeeded(container, data.max_drawdowns);
    createHeatmapIfNeeded(container, data.correlation_heatmap);
}

/**
 * 渲染风险收益散点图 HTML。
 */
function renderRiskReturnScatter(rr) {
    if (!rr || !rr.funds || !rr.funds.length) return '';
    return `<div class="alloc-advanced-card">
        <div class="alloc-advanced-card-title">风险-收益散点</div>
        <div class="alloc-advanced-card-subtitle">Markowitz MPT · 横轴波动率 纵轴收益率</div>
        <div class="alloc-scatter-wrap">
            <canvas id="allocScatter" width="380" height="240"></canvas>
        </div>
    </div>`;
}

/**
 * 创建风险收益散点图。
 */
function createScatterIfNeeded(container, rr) {
    if (!rr || !rr.funds || !rr.funds.length) return;
    const canvas = container.querySelector('#allocScatter');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const fundPoints = rr.funds.map(f => ({
        x: f.volatility,
        y: f.return,
        meta: `${f.name}: σ=${f.volatility.toFixed(1)}%, μ=${f.return.toFixed(1)}%, 权重=${f.weight.toFixed(1)}%`
    }));

    const datasets = [
        {
            label: '基金',
            data: fundPoints,
            backgroundColor: '#3b82f6cc',
            borderColor: '#3b82f6',
            pointRadius: 7,
            pointStyle: 'circle',
        }
    ];

    // 组合点（星形）
    if (rr.portfolio) {
        datasets.push({
            label: '组合',
            data: [{
                x: rr.portfolio.volatility,
                y: rr.portfolio.return,
                meta: `组合: σ=${rr.portfolio.volatility.toFixed(1)}%, μ=${rr.portfolio.return.toFixed(1)}%`
            }],
            backgroundColor: '#f59e0bcc',
            borderColor: '#f59e0b',
            pointRadius: 10,
            pointStyle: 'star',
            borderWidth: 2,
        });
    }

    createScatterChart(ctx, { datasets }, {}, 'allocScatter');
}

/**
 * 渲染风险贡献水平条形图 HTML。
 */
function renderRiskContribution(rc) {
    if (!rc || !rc.funds || !rc.funds.length) {
        return `<div class="alloc-advanced-card">
            <div class="alloc-advanced-card-title">风险贡献</div>
            <div class="alloc-advanced-card-subtitle">Euler MCR · 需2只以上基金</div>
            <div class="dash-empty">需要2只以上基金</div>
        </div>`;
    }
    return `<div class="alloc-advanced-card">
        <div class="alloc-advanced-card-title">风险贡献分解</div>
        <div class="alloc-advanced-card-subtitle">Euler MCR · 组合波动率 ${rc.portfolio_vol.toFixed(1)}%</div>
        <div class="alloc-bar-wrap">
            <canvas id="allocRC" width="380" height="${Math.max(160, rc.funds.length * 28 + 40)}"></canvas>
        </div>
    </div>`;
}

/**
 * 创建风险贡献水平分组条形图。
 */
function createRCBarIfNeeded(container, rc) {
    if (!rc || !rc.funds || !rc.funds.length) return;
    const canvas = container.querySelector('#allocRC');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const labels = rc.funds.map(f => f.name.length > 6 ? f.name.slice(0, 6) + '…' : f.name);

    createBarChart(ctx, {
        labels: labels,
        values: rc.funds.map(f => f.rc_pct),
        colors: rc.funds.map(f => {
            if (f.rc_pct > 30) return '#ef4444';
            if (f.rc_pct > 20) return '#f59e0b';
            return '#3b82f6';
        }),
    }, {
        horizontal: true,
        plugins: {
            tooltip: {
                callbacks: {
                    label: (tooltipCtx) => {
                        const f = rc.funds[tooltipCtx.dataIndex];
                        return `${f.name}: 风险贡献 ${f.rc_pct.toFixed(1)}% (权重 ${f.weight_pct.toFixed(1)}%)`;
                    }
                }
            }
        }
    }, 'allocRC');
}

/**
 * 渲染夏普比率柱状图 HTML。
 */
function renderSharpeRatio(sr) {
    if (!sr || !sr.funds || !sr.funds.length) return '';
    return `<div class="alloc-advanced-card">
        <div class="alloc-advanced-card-title">夏普比率</div>
        <div class="alloc-advanced-card-subtitle">Sharpe (1966) · 风险调整收益</div>
        <div class="alloc-bar-wrap">
            <canvas id="allocSharpe" width="380" height="200"></canvas>
        </div>
    </div>`;
}

/**
 * 创建夏普比率垂直柱状图。
 */
function createSharpeBarIfNeeded(container, sr) {
    if (!sr || !sr.funds || !sr.funds.length) return;
    const canvas = container.querySelector('#allocSharpe');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const labels = sr.funds.map(f => f.name.length > 6 ? f.name.slice(0, 6) + '…' : f.name);

    createBarChart(ctx, {
        labels: labels,
        values: sr.funds.map(f => f.sharpe),
        colors: sr.funds.map(f => getSharpeColor(f.sharpe)),
    }, {
        horizontal: false,
        plugins: {
            tooltip: {
                callbacks: {
                    label: (tooltipCtx) => {
                        const f = sr.funds[tooltipCtx.dataIndex];
                        const tier = f.sharpe > 1 ? '优秀' : f.sharpe > 0.5 ? '良好' : f.sharpe > 0 ? '一般' : '较差';
                        return `${f.name}: ${f.sharpe.toFixed(3)} (${tier})`;
                    }
                }
            }
        }
    }, 'allocSharpe');
}

/**
 * 渲染最大回撤柱状图 HTML。
 */
function renderMaxDrawdown(dd) {
    if (!dd || !dd.funds || !dd.funds.length) return '';
    return `<div class="alloc-advanced-card">
        <div class="alloc-advanced-card-title">最大回撤</div>
        <div class="alloc-advanced-card-subtitle">GIPS 标准 · 峰值到谷底最大跌幅</div>
        <div class="alloc-bar-wrap">
            <canvas id="allocDD" width="380" height="200"></canvas>
        </div>
    </div>`;
}

/**
 * 创建最大回撤垂直柱状图。
 */
function createDDBarIfNeeded(container, dd) {
    if (!dd || !dd.funds || !dd.funds.length) return;
    const canvas = container.querySelector('#allocDD');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const labels = dd.funds.map(f => f.name.length > 6 ? f.name.slice(0, 6) + '…' : f.name);

    createBarChart(ctx, {
        labels: labels,
        values: dd.funds.map(f => Math.abs(f.max_drawdown)),
        colors: dd.funds.map(f => {
            const ddAbs = Math.abs(f.max_drawdown);
            if (ddAbs > 30) return '#ef4444';
            if (ddAbs > 20) return '#f59e0b';
            if (ddAbs > 10) return '#3b82f6';
            return '#22c55e';
        }),
    }, {
        horizontal: false,
        plugins: {
            tooltip: {
                callbacks: {
                    label: (tooltipCtx) => {
                        const f = dd.funds[tooltipCtx.dataIndex];
                        return `${f.name}: ${f.max_drawdown.toFixed(2)}%`;
                    }
                }
            }
        }
    }, 'allocDD');
}

/**
 * 渲染分散化比率环形仪表。
 */
function renderDiversificationGauge(dr) {
    if (!dr) return '';
    const benefitPct = dr.benefit_pct != null ? dr.benefit_pct : 0;
    const ratio = dr.ratio != null ? dr.ratio : 1;
    const gaugePct = Math.min(100, Math.max(0, 100 - ratio * 100));

    let desc = '无分散化收益';
    if (benefitPct > 20) desc = '分散化优秀';
    else if (benefitPct > 10) desc = '分散化良好';
    else if (benefitPct > 0) desc = '分散化一般';

    return `<div class="alloc-advanced-card">
        <div class="alloc-advanced-card-title">分散化比率</div>
        <div class="alloc-advanced-card-subtitle">Choueifaty/Meucci · σ_p / Σ(w_i·σ_i)</div>
        <div class="alloc-gauge-container">
            <div class="alloc-gauge-ring" style="--pct: ${gaugePct}">
                <div class="alloc-gauge-inner">
                    <div class="alloc-gauge-value">${benefitPct.toFixed(1)}%</div>
                    <div class="alloc-gauge-label">分散化收益</div>
                </div>
            </div>
            <div class="alloc-gauge-desc">${desc}</div>
            <div class="alloc-gauge-detail">组合波动率: ${dr.portfolio_vol.toFixed(1)}% | 加权波动率和: ${dr.weighted_vol_sum.toFixed(1)}%</div>
        </div>
    </div>`;
}

/**
 * 渲染有效独立赌注数。
 */
function renderEffectiveBets(eb) {
    if (!eb) return '';
    const enb = eb.enb != null ? eb.enb : 0;
    const nFunds = eb.n_funds || 0;
    const efficiency = nFunds > 0 ? (enb / nFunds * 100) : 0;

    let desc = '独立风险因子数';
    if (nFunds >= 2) {
        if (efficiency > 70) desc += ' · 分散化程度高';
        else if (efficiency > 40) desc += ' · 分散化程度中等';
        else desc += ' · 存在高相关集中';
    }

    // 特征值迷你条形图
    let eigenBarHtml = '';
    if (eb.eigenvalues && eb.eigenvalues.length > 0) {
        const totalEv = eb.eigenvalues.reduce((s, v) => s + Math.max(0, v), 0);
        eigenBarHtml = '<div class="alloc-enb-eigen-bars">';
        eb.eigenvalues.slice(0, 6).forEach((ev, i) => {
            const pct = totalEv > 0 ? (Math.max(0, ev) / totalEv * 100) : 0;
            eigenBarHtml += `<div class="alloc-enb-eigen-bar-row">
                <span class="alloc-enb-eigen-label">λ${i + 1}</span>
                <div class="alloc-enb-eigen-track">
                    <div class="alloc-enb-eigen-fill" style="width:${pct}%"></div>
                </div>
                <span class="alloc-enb-eigen-val">${ev.toFixed(2)}</span>
            </div>`;
        });
        eigenBarHtml += '</div>';
    }

    return `<div class="alloc-advanced-card">
        <div class="alloc-advanced-card-title">有效独立赌注</div>
        <div class="alloc-advanced-card-subtitle">ENB · 特征值熵 · ${nFunds}只基金</div>
        <div class="alloc-enb-container">
            <div class="alloc-enb-card">
                <div class="alloc-enb-value">${enb.toFixed(1)}</div>
                <div class="alloc-enb-sub">${desc}</div>
            </div>
            ${eigenBarHtml}
        </div>
    </div>`;
}

/**
 * 渲染相关系数热力图 HTML。
 */
function renderCorrelationHeatmap(ch) {
    if (!ch || !ch.funds || ch.funds.length < 2) {
        return `<div class="alloc-advanced-card alloc-heatmap-full">
            <div class="alloc-advanced-card-title">相关系数矩阵</div>
            <div class="alloc-advanced-card-subtitle">Pearson ρ · 需2只以上基金</div>
            <div class="dash-empty">需要2只以上基金</div>
        </div>`;
    }
    return `<div class="alloc-advanced-card alloc-heatmap-full">
        <div class="alloc-advanced-card-title">相关系数矩阵</div>
        <div class="alloc-advanced-card-subtitle">Pearson ρ · 日收益率相关性 · 蓝=负相关 白=无相关 红=正相关</div>
        <div class="alloc-heatmap-wrap">
            <canvas id="allocHeatmap"></canvas>
        </div>
        <div class="alloc-heatmap-legend">
            <span>-1.0</span>
            <div class="alloc-heatmap-legend-bar"></div>
            <span>+1.0</span>
        </div>
    </div>`;
}

let heatmapCleanup = null;

/**
 * 创建相关系数热力图。
 */
function createHeatmapIfNeeded(container, ch) {
    if (!ch || !ch.funds || ch.funds.length < 2) return;
    const canvas = container.querySelector('#allocHeatmap');
    if (!canvas) return;
    if (heatmapCleanup) { heatmapCleanup(); heatmapCleanup = null; }
    heatmapCleanup = createHeatmap(canvas, ch.matrix, ch.funds);
}

/**
 * 根据夏普比率返回颜色。
 */
function getSharpeColor(sharpe) {
    if (sharpe > 1.0) return '#22c55e';
    if (sharpe > 0.5) return '#3b82f6';
    if (sharpe > 0) return '#f59e0b';
    return '#ef4444';
}

// ============================================================
// 分基金类型的阈值配置（国际标准）
// ============================================================

const METRIC_THRESHOLDS = {
    money: {
        hhi: { good: 0.30, moderate: 0.50 },
        effective_n: { excellent: 5, good: 3 },
        top3_weight: { balanced: 70, concentrated: 90 },
        max_single: { balanced: 40, moderate: 60 },
        volatility: { low: 1, moderate: 3 },
        sharpe: { excellent: 0.5, good: 0.2, fair: 0 },
        sortino: { excellent: 0.5, good: 0.2, fair: 0 },
        max_drawdown: { moderate: -0.5, high: -1, severe: -2 },
        div_ratio: { excellent: 0.90, good: 0.95 },
        benefit_pct: { excellent: 5, good: 2 },
        enb: { excellent: 3, good: 2 },
        divers_score: { excellent: 70, good: 50 },
        var_95: { moderate: -0.3, high: -0.5 },
        cvar_95: { moderate: -0.5, high: -1 },
        beta: { low: 0.3, moderate: 0.7 },
        info_ratio: { excellent: 0.3, good: 0.1, fair: 0 }
    },
    bond: {
        hhi: { good: 0.20, moderate: 0.35 },
        effective_n: { excellent: 6, good: 4 },
        top3_weight: { balanced: 60, concentrated: 80 },
        max_single: { balanced: 30, moderate: 50 },
        volatility: { low: 5, moderate: 10 },
        sharpe: { excellent: 1.0, good: 0.5, fair: 0 },
        sortino: { excellent: 1.0, good: 0.5, fair: 0 },
        max_drawdown: { moderate: -3, high: -5, severe: -10 },
        div_ratio: { excellent: 0.80, good: 0.90 },
        benefit_pct: { excellent: 10, good: 5 },
        enb: { excellent: 4, good: 3 },
        divers_score: { excellent: 75, good: 55 },
        var_95: { moderate: -2, high: -4 },
        cvar_95: { moderate: -3, high: -6 },
        beta: { low: 0.5, moderate: 1.0 },
        info_ratio: { excellent: 0.5, good: 0.2, fair: 0 }
    },
    equity: {
        hhi: { good: 0.15, moderate: 0.25 },
        effective_n: { excellent: 8, good: 5 },
        top3_weight: { balanced: 50, concentrated: 70 },
        max_single: { balanced: 15, moderate: 25 },
        volatility: { low: 12, moderate: 20 },
        sharpe: { excellent: 1.0, good: 0.5, fair: 0 },
        sortino: { excellent: 1.0, good: 0.5, fair: 0 },
        max_drawdown: { moderate: -10, high: -20, severe: -30 },
        div_ratio: { excellent: 0.70, good: 0.85 },
        benefit_pct: { excellent: 20, good: 10 },
        enb: { excellent: 5, good: 3 },
        divers_score: { excellent: 80, good: 60 },
        var_95: { moderate: -8, high: -15 },
        cvar_95: { moderate: -12, high: -20 },
        beta: { low: 0.8, moderate: 1.2 },
        info_ratio: { excellent: 0.5, good: 0.2, fair: 0 }
    }
};

// ============================================================
// 指标tooltip说明
// ============================================================

const METRIC_TOOLTIPS = {
    hhi: "HHI（赫芬达尔-赫希曼指数）：衡量持仓集中度。数值越低越分散，越高越集中。国际标准：低于0.15为分散。",
    effective_n: "有效基金数：根据HHI推算的等权基金数量。数值越大表示风险越分散。",
    top3_weight: "前3大权重：持仓前三的基金合计权重。权重过高意味着组合过度依赖少数基金。",
    max_single: "最大单只权重：持仓最大的单一基金权重。过高会增加特异性风险。",
    volatility: "组合波动率：年化收益波动率，衡量组合整体风险水平。数值越低越稳定。",
    sharpe: "夏普比率：每承担一单位风险获得的超额收益（相对无风险利率）。国际标准：大于1为优秀。",
    sortino: "索提诺比率：类似夏普比率但只惩罚下行风险，更适合评估避险能力。数值越高越好。",
    max_drawdown: "最大回撤：从最高点到最低点的最大跌幅。衡量组合最坏情况下的损失。",
    div_ratio: "分散化比率：组合波动率与加权波动率之比。越低表示分散化效果越好。",
    benefit_pct: "分散收益：通过分散化降低的风险百分比。数值越高表示分散效果越好。",
    enb: "有效独立赌注数（ENB）：基于相关矩阵特征值计算。数值越大表示真正的分散化程度越高。",
    divers_score: "分散化评分：综合考虑HHI、基金数量等因素的0-100分评估。",
    var_95: "VaR 95%：在95%置信水平下的最大预期日亏损。负数表示可能的损失幅度。",
    cvar_95: "CVaR 95%（条件风险价值）：VaR之外的尾部平均损失。比VaR更保守的风险度量。",
    beta: "Beta系数：组合相对于市场的系统风险。Beta=1表示与市场同步波动。（待实现：需要基准数据）",
    info_ratio: "信息比率：超额收益与跟踪误差的比值。衡量主动管理能力。（待实现：需要基准数据）"
};

// ============================================================
// 基金类型检测
// ============================================================

function detectFundType(typeDistribution) {
    if (!typeDistribution || !typeDistribution.length) return 'equity';

    const hasMoney = typeDistribution.some(t => t.name && (t.name.includes('货币') || t.name.includes('现金')));
    const hasBond = typeDistribution.some(t => t.name && (t.name.includes('债券') || t.name.includes('固收') || t.name.includes('信用')));

    if (hasMoney) return 'money';
    if (hasBond) return 'bond';
    return 'equity';
}

// ============================================================
// 指标评估逻辑
// ============================================================

function evaluateMetric(value, metricType, fundType) {
    if (value == null || value === '--' || isNaN(value)) {
        return { assessment: '--', level: 'moderate' };
    }

    const thresholds = METRIC_THRESHOLDS[fundType] || METRIC_THRESHOLDS.equity;
    const t = thresholds[metricType];

    if (!t) return { assessment: '--', level: 'moderate' };

    const numVal = Number(value);

    switch (metricType) {
        case 'hhi':
            if (numVal < t.good) return { assessment: '良好', level: 'good' };
            if (numVal < t.moderate) return { assessment: '适度集中', level: 'moderate' };
            return { assessment: '高集中', level: 'poor' };

        case 'effective_n':
            if (numVal >= t.excellent) return { assessment: '优秀', level: 'good' };
            if (numVal >= t.good) return { assessment: '良好', level: 'good' };
            return { assessment: '有限', level: 'moderate' };

        case 'top3_weight':
            if (numVal < t.balanced) return { assessment: '平衡', level: 'good' };
            if (numVal < t.concentrated) return { assessment: '集中', level: 'moderate' };
            return { assessment: '高度集中', level: 'poor' };

        case 'max_single':
            if (numVal < t.balanced) return { assessment: '平衡', level: 'good' };
            if (numVal < t.moderate) return { assessment: '中等', level: 'moderate' };
            return { assessment: '偏高', level: 'poor' };

        case 'volatility':
            if (numVal < t.low) return { assessment: '低', level: 'good' };
            if (numVal < t.moderate) return { assessment: '中等', level: 'moderate' };
            return { assessment: '高', level: 'poor' };

        case 'sharpe':
        case 'sortino':
        case 'info_ratio':
            if (numVal >= t.excellent) return { assessment: '优秀', level: 'good' };
            if (numVal >= t.good) return { assessment: '良好', level: 'good' };
            if (numVal >= t.fair) return { assessment: '一般', level: 'moderate' };
            return { assessment: '差', level: 'poor' };

        case 'max_drawdown':
            if (numVal >= t.moderate) return { assessment: '温和', level: 'good' };
            if (numVal >= t.high) return { assessment: '中等', level: 'moderate' };
            if (numVal >= t.severe) return { assessment: '严重', level: 'poor' };
            return { assessment: '极端', level: 'poor' };

        case 'div_ratio':
            if (numVal < t.excellent) return { assessment: '优秀', level: 'good' };
            if (numVal < t.good) return { assessment: '良好', level: 'good' };
            return { assessment: '有限', level: 'moderate' };

        case 'benefit_pct':
            if (numVal >= t.excellent) return { assessment: '优秀', level: 'good' };
            if (numVal >= t.good) return { assessment: '良好', level: 'good' };
            return { assessment: '有限', level: 'moderate' };

        case 'enb':
            if (numVal >= t.excellent) return { assessment: '优秀', level: 'good' };
            if (numVal >= t.good) return { assessment: '良好', level: 'good' };
            return { assessment: '有限', level: 'moderate' };

        case 'divers_score':
            if (numVal >= t.excellent) return { assessment: '优秀', level: 'good' };
            if (numVal >= t.good) return { assessment: '良好', level: 'good' };
            return { assessment: '差', level: 'poor' };

        case 'var_95':
        case 'cvar_95':
            if (numVal >= t.moderate) return { assessment: '温和', level: 'good' };
            if (numVal >= t.high) return { assessment: '中等', level: 'moderate' };
            return { assessment: '严重', level: 'poor' };

        case 'beta':
            if (numVal < t.low) return { assessment: '低风险', level: 'good' };
            if (numVal <= t.moderate) return { assessment: '中等', level: 'moderate' };
            return { assessment: '高', level: 'poor' };

        default:
            return { assessment: '--', level: 'moderate' };
    }
}

// ============================================================
// 渲染单个指标卡片
// ============================================================

function renderMetricCard(label, value, unit, assessment, level, tooltipKey) {
    const tooltip = METRIC_TOOLTIPS[tooltipKey] || '';
    const displayValue = value != null && !isNaN(value) ? `${value}${unit}` : '--';

    return `<div class="dash-indicator-card" title="${tooltip}">
        <div class="dash-indicator-label">${label}</div>
        <div class="dash-indicator-value">${displayValue}</div>
        <div class="dash-indicator-badge ${level}">${assessment}</div>
    </div>`;
}

// ============================================================
// 主渲染函数：组合健康指标卡片
// ============================================================

/**
 * 渲染组合健康指标卡片网格。
 * @param {Object} data - allocation接口返回的完整数据
 * @returns {string} HTML
 */
function renderIndicatorCards(data) {
    const fundType = detectFundType(data.type_distribution);
    const conc = data.concentration || {};
    const riskReturn = data.risk_return || {};
    const portfolio = riskReturn.portfolio || {};
    const divRatio = data.diversification_ratio || {};
    const effectiveBets = data.effective_bets || {};
    const portfolioSummary = data.portfolio_summary || {};

    let html = '<div class="dash-alloc-section">';
    html += '<div class="dash-alloc-subtitle">组合健康指标</div>';

    // 行1：集中度与分散化
    html += '<div class="dash-indicator-grid">';
    const hhiEval = evaluateMetric(conc.hhi, 'hhi', fundType);
    html += renderMetricCard('HHI指数', Number(conc.hhi).toFixed(4), '', hhiEval.assessment, hhiEval.level, 'hhi');

    const enEval = evaluateMetric(conc.effective_n, 'effective_n', fundType);
    html += renderMetricCard('有效基金数', Number(conc.effective_n).toFixed(1), '', enEval.assessment, enEval.level, 'effective_n');

    const top3Eval = evaluateMetric(conc.top3_weight, 'top3_weight', fundType);
    html += renderMetricCard('前3大权重', Number(conc.top3_weight).toFixed(1), '%', top3Eval.assessment, top3Eval.level, 'top3_weight');

    const maxEval = evaluateMetric(conc.max_single, 'max_single', fundType);
    html += renderMetricCard('最大权重', Number(conc.max_single).toFixed(1), '%', maxEval.assessment, maxEval.level, 'max_single');
    html += '</div>';

    // 行2：风险指标
    html += '<div class="dash-indicator-grid">';
    const volEval = evaluateMetric(portfolio.volatility, 'volatility', fundType);
    html += renderMetricCard('组合波动率', Number(portfolio.volatility).toFixed(1), '%', volEval.assessment, volEval.level, 'volatility');

    const sharpeEval = evaluateMetric(portfolioSummary.sharpe, 'sharpe', fundType);
    html += renderMetricCard('夏普比率', Number(portfolioSummary.sharpe).toFixed(3), '', sharpeEval.assessment, sharpeEval.level, 'sharpe');

    const mddEval = evaluateMetric(portfolioSummary.max_drawdown, 'max_drawdown', fundType);
    html += renderMetricCard('最大回撤', Number(portfolioSummary.max_drawdown).toFixed(2), '%', mddEval.assessment, mddEval.level, 'max_drawdown');

    const sortinoEval = evaluateMetric(portfolioSummary.sortino, 'sortino', fundType);
    html += renderMetricCard('索提诺', Number(portfolioSummary.sortino).toFixed(3), '', sortinoEval.assessment, sortinoEval.level, 'sortino');
    html += '</div>';

    // 行3：质量与高级指标
    html += '<div class="dash-indicator-grid">';
    const drEval = evaluateMetric(divRatio.ratio, 'div_ratio', fundType);
    html += renderMetricCard('分散化比率', Number(divRatio.ratio).toFixed(4), '', drEval.assessment, drEval.level, 'div_ratio');

    const benefitEval = evaluateMetric(divRatio.benefit_pct, 'benefit_pct', fundType);
    html += renderMetricCard('分散收益', Number(divRatio.benefit_pct).toFixed(1), '%', benefitEval.assessment, benefitEval.level, 'benefit_pct');

    const enbEval = evaluateMetric(effectiveBets.enb, 'enb', fundType);
    html += renderMetricCard('有效赌注数', Number(effectiveBets.enb).toFixed(1), '', enbEval.assessment, enbEval.level, 'enb');

    const dsEval = evaluateMetric(conc.diversification_score, 'divers_score', fundType);
    html += renderMetricCard('分散评分', Number(conc.diversification_score).toFixed(0), '', dsEval.assessment, dsEval.level, 'divers_score');
    html += '</div>';

    // 行4：基准与额外指标
    html += '<div class="dash-indicator-grid">';
    const varEval = evaluateMetric(portfolioSummary.var_95, 'var_95', fundType);
    html += renderMetricCard('VaR 95%', Number(portfolioSummary.var_95).toFixed(2), '%', varEval.assessment, varEval.level, 'var_95');

    const cvarEval = evaluateMetric(portfolioSummary.cvar_95, 'cvar_95', fundType);
    html += renderMetricCard('CVaR 95%', Number(portfolioSummary.cvar_95).toFixed(2), '%', cvarEval.assessment, cvarEval.level, 'cvar_95');

    // Beta和信息比率（待实现，显示占位符）
    html += renderMetricCard('Beta', '--', '', '待实现', 'moderate', 'beta');
    html += renderMetricCard('信息比率', '--', '', '待实现', 'moderate', 'info_ratio');
    html += '</div>';

    html += '</div>';
    return html;
}

/**
 * 销毁资产配置相关图表。
 */
export function destroyAllocationCharts() {
    if (heatmapCleanup) { heatmapCleanup(); heatmapCleanup = null; }
}
