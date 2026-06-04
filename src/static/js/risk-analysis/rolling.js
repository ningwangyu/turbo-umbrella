/**
 * 滚动风险指标组件 — 30/60/90日窗口的波动率、夏普比率、最大回撤折线图。
 *
 * @exports renderRollingMetrics(container, data)
 * @exports destroyRollingCharts()
 */

import { setChartInstance, chartInstances } from './state.js';

const WINDOW_COLORS = {
    '30': '#3b82f6',
    '60': '#f59e0b',
    '90': '#ef4444',
};

const METRIC_CONFIG = {
    volatility: { label: '年化波动率', suffix: '%', chartId: 'raRollVol', yTitle: '波动率 (%)' },
    sharpe: { label: '夏普比率', suffix: '', chartId: 'raRollSharpe', yTitle: '夏普比率' },
    max_drawdown: { label: '最大回撤', suffix: '%', chartId: 'raRollDD', yTitle: '回撤 (%)' },
};

/**
 * 渲染滚动风险指标。
 */
export function renderRollingMetrics(container, data) {
    if (!container) return;

    if (!data || !data.dates || data.dates.length === 0) {
        container.innerHTML = '<div class="ra-empty">暂无滚动指标数据（需要90天以上持仓记录）</div>';
        return;
    }

    const { current, trend_signals } = data;

    let html = '';

    // 当前值指标卡片
    html += '<div class="ra-grid-4col" style="margin-bottom:14px">';
    html += currentCard('30日波动率', current.volatility_30d, '%');
    html += currentCard('30日夏普', current.sharpe_30d, '');
    html += currentCard('30日回撤', current.max_dd_30d, '%');
    html += trendSignalsCard(trend_signals);
    html += '</div>';

    // 图表类型选择
    html += '<div class="ra-window-tabs" id="raMetricTabs">';
    html += '<button class="ra-window-tab active" data-metric="volatility">波动率</button>';
    html += '<button class="ra-window-tab" data-metric="sharpe">夏普比率</button>';
    html += '<button class="ra-window-tab" data-metric="max_drawdown">最大回撤</button>';
    html += '</div>';

    // 图表
    html += '<div class="ra-chart-container" style="height:300px">';
    html += '<canvas id="raRollingChart"></canvas>';
    html += '</div>';

    container.innerHTML = html;

    // 创建初始图表
    let activeMetric = 'volatility';

    function updateChart() {
        const cfg = METRIC_CONFIG[activeMetric];
        const datasets = [];
        const key = activeMetric === 'max_drawdown' ? 'rolling_max_drawdown' : `rolling_${activeMetric}`;

        for (const w of (data.windows || [30, 60, 90])) {
            const values = data[key]?.[String(w)] || [];
            if (values.length === 0) continue;
            datasets.push({
                label: `${w}日窗口`,
                data: values,
                borderColor: WINDOW_COLORS[String(w)] || '#888',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.3,
            });
        }

        if (datasets.length === 0) return;

        if (chartInstances['rollingChart']) {
            try { chartInstances['rollingChart'].destroy(); } catch (_) {}
        }

        const canvas = container.querySelector('#raRollingChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const chart = new Chart(ctx, {
            type: 'line',
            data: { labels: data.dates, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'top', labels: { boxWidth: 14, font: { size: 10 }, usePointStyle: true } },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.82)',
                        titleFont: { size: 12, weight: 'bold' },
                        bodyFont: { size: 11 },
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                            label: (ctx2) => `${ctx2.dataset.label}: ${ctx2.parsed.y}${cfg.suffix}`,
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(125,211,252,.1)' },
                        ticks: { font: { size: 10 }, color: '#8fb6d8', maxTicksLimit: 8 },
                    },
                    y: {
                        grid: { color: 'rgba(125,211,252,.1)' },
                        ticks: { font: { size: 10 }, color: '#8fb6d8' },
                        title: { display: true, text: cfg.yTitle, font: { size: 11 }, color: '#8fb6d8' },
                    },
                },
            },
        });

        setChartInstance('rollingChart', chart);
    }

    updateChart();

    // 绑定切换事件
    const tabs = container.querySelectorAll('#raMetricTabs .ra-window-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeMetric = tab.dataset.metric;
            updateChart();
        });
    });
}

function currentCard(label, value, suffix) {
    const display = value != null ? `${value}${suffix}` : '--';
    return `<div class="ra-metric-card">
        <div class="ra-metric-label">${label}</div>
        <div class="ra-metric-value">${display}</div>
    </div>`;
}

function trendSignalsCard(signals) {
    if (!signals) return '<div class="ra-metric-card"><div class="ra-metric-label">趋势信号</div><div class="ra-metric-desc">暂无</div></div>';

    const items = [];
    if (signals.volatility_increasing) items.push('<span class="up">波动率上升</span>');
    if (signals.sharpe_improving) items.push('<span class="down">夏普改善</span>');
    if (signals.drawdown_worsening) items.push('<span class="up">回撤加深</span>');
    if (items.length === 0) items.push('<span class="flat">指标平稳</span>');

    return `<div class="ra-metric-card">
        <div class="ra-metric-label">趋势信号</div>
        <div class="ra-metric-desc" style="font-size:12px;margin-top:4px">${items.join(' · ')}</div>
    </div>`;
}

export function destroyRollingCharts() {
    if (chartInstances['rollingChart']) {
        try { chartInstances['rollingChart'].destroy(); } catch (_) {}
        delete chartInstances['rollingChart'];
    }
}
