/**
 * 收益趋势预测模块 — 三模型集成可视化。
 *
 * 使用 Chart.js 折线图展示乐观/基准/悲观三条预测线，
 * 乐观-悲观之间绘制置信带填充。支持 30d/90d/180d 时间范围切换。
 *
 * 导出函数:
 *   renderReturnTrend(container, data) — 渲染收益趋势区域
 *   destroyReturnTrendCharts()         — 销毁所有图表实例
 */

import { setChartInstance, chartInstances } from './state.js';

// ===== 内部状态 =====
let _chartInstance = null;
let _activeRange = '30d';
let _apiData = null;

// ===== 配色常量 =====
const COLOR_OPTIMISTIC = '#22c55e';   // 绿色
const COLOR_BASELINE   = '#3b82f6';   // 蓝色
const COLOR_PESSIMISTIC = '#ef4444';  // 红色
const COLOR_CONFIDENCE = 'rgba(59,130,246,0.08)';

// ===== 模型权重中文映射 =====
const MODEL_LABELS = {
    signal:         '信号模型',
    volatility:     '波动率模型',
    mean_reversion: '均值回归模型',
};

// ===== 辅助函数 =====

/** 获取 CSS 变量值 */
function cssVar(name) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(name).trim() || '';
}

/** 格式化百分比 */
function fmtPct(val) {
    if (val == null) return '--';
    const sign = val >= 0 ? '+' : '';
    return `${sign}${Number(val).toFixed(1)}%`;
}

/** 解析天数范围键为数字 */
function rangeToDays(range) {
    return { '30d': 30, '90d': 90, '180d': 180 }[range] || 30;
}

/** 获取当前可用的范围键列表 */
function getAvailableRanges(data) {
    if (!data?.predictions) return ['30d'];
    return Object.keys(data.predictions).filter(k => data.predictions[k] != null);
}

// ===== HTML 结构生成 =====

/** 构建整个组件的 HTML */
function buildHTML(data) {
    const ranges = getAvailableRanges(data);

    let html = '<div class="rt-container">';
    html += buildHeader(ranges);
    html += '<div class="rt-chart-area"><canvas id="rtPredChart"></canvas></div>';
    html += buildInfoPanel(data);
    html += '</div>';

    return html;
}

/** 构建头部：标题 + 范围选择器 */
function buildHeader(ranges) {
    let html = '<div class="rt-header">';
    html += '<div class="rt-title">收益趋势预测</div>';
    html += '<div class="rt-range-tabs">';
    ranges.forEach(r => {
        const label = r.replace('d', '天');
        const active = r === _activeRange ? ' active' : '';
        html += `<button class="rt-range-tab${active}" data-range="${r}">${label}</button>`;
    });
    html += '</div></div>';
    return html;
}

/** 构建信息面板：模型权重 + 当前信号 + 年化收益率 */
function buildInfoPanel(data) {
    const weights = data?.model_weights || {};
    const buyScore = data?.portfolio_buy_score;
    const annualReturn = data?.current_annual_return;
    const disclaimer = data?.disclaimer;

    let html = '<div class="rt-info-panel">';

    // 模型权重
    html += '<div class="rt-weights-section">';
    html += '<div class="rt-info-label">模型集成权重</div>';
    html += '<div class="rt-weights-grid">';
    Object.entries(weights).forEach(([key, weight]) => {
        const label = MODEL_LABELS[key] || key;
        const pct = (Number(weight) * 100).toFixed(0);
        html += `<div class="rt-weight-item">
            <div class="rt-weight-bar"><div class="rt-weight-fill" style="width:${pct}%"></div></div>
            <div class="rt-weight-label">${label}</div>
            <div class="rt-weight-pct">${pct}%</div>
        </div>`;
    });
    html += '</div></div>';

    // 信号分数 & 年化收益率
    html += '<div class="rt-metrics-section">';
    if (buyScore != null) {
        const scoreClass = buyScore >= 60 ? 'up' : buyScore >= 40 ? '' : 'down';
        html += `<div class="rt-metric-card">
            <div class="rt-metric-label">组合买入信号</div>
            <div class="rt-metric-value ${scoreClass}">${buyScore}</div>
            <div class="rt-metric-desc">${getScoreDesc(buyScore)}</div>
        </div>`;
    }
    if (annualReturn != null) {
        const retClass = annualReturn >= 0 ? 'up' : 'down';
        html += `<div class="rt-metric-card">
            <div class="rt-metric-label">当前年化收益率</div>
            <div class="rt-metric-value ${retClass}">${fmtPct(annualReturn)}</div>
            <div class="rt-metric-desc">基于历史表现</div>
        </div>`;
    }
    html += '</div>';

    // 免责声明
    if (disclaimer) {
        html += `<div class="rt-disclaimer">${disclaimer}</div>`;
    }

    html += '</div>';
    return html;
}

/** 信号分数说明文字 */
function getScoreDesc(score) {
    if (score >= 80) return '强烈买入';
    if (score >= 60) return '建议买入';
    if (score >= 40) return '中性观望';
    if (score >= 20) return '谨慎持有';
    return '建议回避';
}

// ===== Chart.js 图表创建 =====

/**
 * 根据当前活动范围创建/更新折线图。
 * @param {HTMLElement} container - 组件根容器
 */
function createOrUpdateChart(container) {
    const canvas = container.querySelector('#rtPredChart');
    if (!canvas) return;

    const range = _activeRange;
    const pred = _apiData?.predictions?.[range];
    if (!pred) return;

    const days = rangeToDays(range);
    // X 轴标签：今天 → 对应天数
    const labels = ['今天', `${days}天`];
    // 数据点：起始值 0, 终点值 = prediction
    const optimisticData  = [0, pred.optimistic  ?? 0];
    const baselineData    = [0, pred.baseline    ?? 0];
    const pessimisticData = [0, pred.pessimistic ?? 0];

    // 销毁旧实例
    if (_chartInstance) {
        try { _chartInstance.destroy(); } catch (_) {}
        _chartInstance = null;
    }

    const ctx = canvas.getContext('2d');

    _chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '乐观预测',
                    data: optimisticData,
                    borderColor: COLOR_OPTIMISTIC,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [6, 3],
                    pointRadius: [0, 5],
                    pointHoverRadius: 7,
                    pointBackgroundColor: COLOR_OPTIMISTIC,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    fill: false,
                    tension: 0,
                    order: 3,
                },
                {
                    label: '基准预测',
                    data: baselineData,
                    borderColor: COLOR_BASELINE,
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    borderDash: [],
                    pointRadius: [0, 5],
                    pointHoverRadius: 7,
                    pointBackgroundColor: COLOR_BASELINE,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    fill: false,
                    tension: 0,
                    order: 2,
                },
                {
                    label: '悲观预测',
                    data: pessimisticData,
                    borderColor: COLOR_PESSIMISTIC,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [6, 3],
                    pointRadius: [0, 5],
                    pointHoverRadius: 7,
                    pointBackgroundColor: COLOR_PESSIMISTIC,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    fill: false,
                    tension: 0,
                    order: 4,
                },
                {
                    // 置信带：透明线，填充乐观与悲观之间
                    label: '_confidenceBand',
                    data: optimisticData,
                    borderColor: 'transparent',
                    backgroundColor: COLOR_CONFIDENCE,
                    borderWidth: 0,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    fill: {
                        target: '+2', // 向下填充到数据集索引+2（悲观线）
                        above: COLOR_CONFIDENCE,
                    },
                    tension: 0,
                    order: 10,
                    hidden: false,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 600, easing: 'easeOutQuart' },
            layout: { padding: { top: 8, right: 40, bottom: 4, left: 4 } },
            plugins: {
                legend: { display: false },
                title: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0,0,0,0.82)',
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    padding: 10,
                    cornerRadius: 8,
                    filter: (item) => !item.dataset.label.startsWith('_'),
                    callbacks: {
                        label: (item) => {
                            const val = item.parsed.y;
                            return `${item.dataset.label}: ${fmtPct(val)}`;
                        },
                        afterBody: (items) => {
                            if (items.length >= 1) {
                                const range = _activeRange;
                                const pred = _apiData?.predictions?.[range];
                                if (pred?.volatility != null) {
                                    return [`波动率: ${pred.volatility.toFixed(1)}%`];
                                }
                            }
                            return [];
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11 }, color: '#8fb6d8' },
                },
                y: {
                    ticks: {
                        maxTicksLimit: 6,
                        font: { size: 10 },
                        color: '#8fb6d8',
                        callback: (v) => v + '%',
                    },
                    grid: { color: 'rgba(125,211,252,.12)' },
                    title: {
                        display: true,
                        text: '预期收益率',
                        font: { size: 11 },
                        color: '#8fb6d8',
                    },
                },
            },
            interaction: { mode: 'nearest', axis: 'x' },
            onHover(event, _elements, chart) {
                const { x, y } = event.native
                    ? { x: event.native.offsetX, y: event.native.offsetY }
                    : { x: 0, y: 0 };
                chart._crosshair = { x, y };
                chart.draw();
            },
        },
    });

    // 注册实例（统一管理，页面切换时自动销毁）
    setChartInstance('rtPredChart', _chartInstance);

    // 鼠标离开时清除十字准线
    canvas.addEventListener('mouseleave', () => {
        if (_chartInstance) {
            _chartInstance._crosshair = null;
            _chartInstance.draw();
        }
    });
}

// ===== 事件绑定 =====

/** 绑定时间范围切换事件 */
function bindRangeTabs(container) {
    const tabs = container.querySelectorAll('.rt-range-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const range = tab.dataset.range;
            if (range === _activeRange) return;

            // 更新按钮状态
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            _activeRange = range;
            createOrUpdateChart(container);
        });
    });
}

// ===== 公共导出 =====

/**
 * 渲染收益趋势预测区域。
 * @param {HTMLElement} container - 承载组件的 DOM 容器
 * @param {Object} data - API 返回的预测数据
 */
export function renderReturnTrend(container, data) {
    if (!container) return;

    // 参数校验
    if (!data || !data.predictions) {
        container.innerHTML = `
            <div class="rt-container">
                <div class="rt-header">
                    <div class="rt-title">收益趋势预测</div>
                </div>
                <div class="dash-empty">暂无预测数据</div>
            </div>`;
        return;
    }

    _apiData = data;

    // 重置活动范围为第一个可用范围
    const ranges = getAvailableRanges(data);
    if (!ranges.includes(_activeRange)) {
        _activeRange = ranges[0];
    }

    // 注入样式（幂等）
    injectStyles();

    // 渲染 HTML
    container.innerHTML = buildHTML(data);

    // 绑定交互事件
    bindRangeTabs(container);

    // 创建图表（需要 canvas 已存在于文档中）
    createOrUpdateChart(container);
}

/**
 * 销毁收益趋势预测图表实例。
 */
export function destroyReturnTrendCharts() {
    if (_chartInstance) {
        try { _chartInstance.destroy(); } catch (_) {}
        _chartInstance = null;
    }
    _apiData = null;
    _activeRange = '30d';
}

// ===== 样式注入 =====

let _stylesInjected = false;

function injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;

    const style = document.createElement('style');
    style.textContent = RT_CSS;
    document.head.appendChild(style);
}

// ===== CSS =====

const RT_CSS = `
/* ===== 收益趋势预测组件 ===== */
.rt-container {
    display: flex; flex-direction: column; gap: 12px;
}

.rt-header {
    display: flex; align-items: center; justify-content: space-between;
    padding-bottom: 8px; border-bottom: 1px solid var(--border);
}
.rt-title {
    font-size: 14px; font-weight: 700; color: var(--text);
}

/* 时间范围切换 */
.rt-range-tabs {
    display: flex; gap: 4px;
}
.rt-range-tab {
    background: var(--bg); color: var(--text3); border: 1px solid var(--border);
    border-radius: 6px; padding: 4px 12px; font-size: 12px;
    font-weight: 500; cursor: pointer; transition: all .15s;
}
.rt-range-tab:hover {
    border-color: var(--primary); color: var(--primary);
}
.rt-range-tab.active {
    background: var(--primary); color: #fff;
    border-color: var(--primary);
}

/* 图表区域 */
.rt-chart-area {
    height: 300px; position: relative;
}
.rt-chart-area canvas {
    width: 100% !important; height: 100% !important;
}

/* 信息面板 */
.rt-info-panel {
    display: flex; flex-direction: column; gap: 10px;
}

/* 模型权重 */
.rt-weights-section {
    background: var(--bg); border-radius: 10px; padding: 10px 12px;
    border: 1px solid var(--border);
}
.rt-info-label {
    font-size: 11px; font-weight: 600; color: var(--text3);
    margin-bottom: 8px;
}
.rt-weights-grid {
    display: flex; flex-direction: column; gap: 6px;
}
.rt-weight-item {
    display: flex; align-items: center; gap: 8px;
}
.rt-weight-bar {
    flex: 1; height: 8px; background: var(--card); border-radius: 4px;
    overflow: hidden; min-width: 40px;
}
.rt-weight-fill {
    height: 100%; border-radius: 4px;
    background: linear-gradient(90deg, var(--primary), rgba(59,130,246,.75));
    transition: width .5s ease;
}
.rt-weight-label {
    font-size: 11px; color: var(--text2); min-width: 80px;
}
.rt-weight-pct {
    font-size: 11px; font-weight: 700; color: var(--text);
    font-variant-numeric: tabular-nums; min-width: 30px; text-align: right;
}

/* 信号分数 & 年化收益率 */
.rt-metrics-section {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
}
.rt-metric-card {
    background: var(--bg); border-radius: 10px; padding: 10px;
    text-align: center; border: 1px solid var(--border);
}
.rt-metric-label {
    font-size: 10px; color: var(--text3); margin-bottom: 4px;
}
.rt-metric-value {
    font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums;
    color: var(--text); line-height: 1.2;
}
.rt-metric-value.up { color: var(--up, #ff6b7a); }
.rt-metric-value.down { color: var(--down, #35e89b); }
.rt-metric-desc {
    font-size: 10px; color: var(--text3); margin-top: 2px;
}

/* 免责声明 */
.rt-disclaimer {
    font-size: 10px; color: var(--text3); line-height: 1.5;
    padding: 8px 10px; background: var(--bg); border-radius: 8px;
    border: 1px dashed var(--border);
}

/* 响应式 */
@media (max-width: 768px) {
    .rt-header { flex-direction: column; align-items: flex-start; gap: 8px; }
    .rt-chart-area { height: 250px; }
    .rt-metrics-section { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
    .rt-chart-area { height: 200px; }
    .rt-weight-label { min-width: 60px; font-size: 10px; }
    .rt-metric-value { font-size: 17px; }
}
`;
