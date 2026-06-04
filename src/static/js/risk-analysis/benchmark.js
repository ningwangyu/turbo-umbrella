/**
 * 基准对比分析组件 — 组合 vs 沪深300 双线图 + Alpha/Beta/捕获率指标卡片。
 *
 * @exports renderBenchmark(container, data)
 * @exports destroyBenchmarkCharts()
 */

import { setChartInstance, chartInstances } from './state.js';

const BENCHMARK_COLORS = {
    portfolio: '#3b82f6',
    benchmark: '#f59e0b',
    excess: '#22c55e',
};

/**
 * 渲染基准对比分析。
 */
export function renderBenchmark(container, data) {
    if (!container) return;

    if (!data || (!data.benchmark_trend || data.benchmark_trend.length === 0)) {
        container.innerHTML = '<div class="ra-empty">暂无基准对比数据（需要30天以上持仓记录）</div>';
        return;
    }

    // 指标卡片
    let html = '<div class="ra-grid-4col" style="margin-bottom:14px">';
    html += metricCard('Alpha (Jensen\'s)', data.alpha, '%', data.alpha > 0 ? 'up' : 'down', '年化超额收益');
    html += metricCard('Beta', data.beta, '', '', '系统风险暴露');
    html += metricCard('跟踪误差', data.tracking_error, '%', '', '超额收益波动');
    html += metricCard('信息比率', data.information_ratio, '', '', '主动管理效率');
    html += '</div>';

    html += '<div class="ra-grid-4col" style="margin-bottom:14px">';
    html += metricCard('相关系数', data.correlation, '', '', '与基准联动度');
    html += metricCard('上行捕获率', data.up_capture, '%', data.up_capture > 100 ? 'up' : '', '牛市跟涨能力');
    html += metricCard('下行捕获率', data.down_capture, '%', data.down_capture < 100 ? 'down' : '', '熊市抗跌能力');
    html += metricCard('超额收益', data.excess_return, '%', data.excess_return > 0 ? 'up' : 'down', '年化累计');
    html += '</div>';

    // 双线图
    html += '<div class="ra-chart-container" style="height:320px">';
    html += '<canvas id="raBenchmarkChart"></canvas>';
    html += '</div>';

    // 收益汇总
    html += '<div class="ra-grid-2col" style="margin-top:14px">';
    html += `<div class="ra-metric-card"><div class="ra-metric-label">组合年化收益</div><div class="ra-metric-value ${data.portfolio_return >= 0 ? 'up' : 'down'}">${data.portfolio_return >= 0 ? '+' : ''}${data.portfolio_return}%</div></div>`;
    html += `<div class="ra-metric-card"><div class="ra-metric-label">基准年化收益</div><div class="ra-metric-value ${data.benchmark_return >= 0 ? 'up' : 'down'}">${data.benchmark_return >= 0 ? '+' : ''}${data.benchmark_return}%</div></div>`;
    html += '</div>';

    container.innerHTML = html;

    // 创建图表
    createBenchmarkChart(container, data);
}

function metricCard(label, value, unit, cls, desc) {
    const display = value != null ? `${value}${unit}` : '--';
    return `<div class="ra-metric-card">
        <div class="ra-metric-label">${label}</div>
        <div class="ra-metric-value ${cls || ''}">${display}</div>
        <div class="ra-metric-desc">${desc || ''}</div>
    </div>`;
}

function createBenchmarkChart(container, data) {
    const canvas = container.querySelector('#raBenchmarkChart');
    if (!canvas) return;

    const portTrend = data.portfolio_trend || [];
    const benchTrend = data.benchmark_trend || [];

    if (portTrend.length < 2) return;

    const labels = portTrend.map(t => t.date);
    const portValues = portTrend.map(t => ((t.nav - 1) * 100).toFixed(2));
    const benchValues = benchTrend.map(t => ((t.nav - 1) * 100).toFixed(2));

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '组合收益',
                    data: portValues,
                    borderColor: BENCHMARK_COLORS.portfolio,
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.3,
                    fill: false,
                },
                {
                    label: '沪深300',
                    data: benchValues,
                    borderColor: BENCHMARK_COLORS.benchmark,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [6, 3],
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.3,
                    fill: false,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: { boxWidth: 14, font: { size: 11 }, padding: 12, usePointStyle: true } },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.82)',
                    titleFont: { size: 12, weight: 'bold' },
                    bodyFont: { size: 11 },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx2) => `${ctx2.dataset.label}: ${ctx2.parsed.y > 0 ? '+' : ''}${ctx2.parsed.y}%`,
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
                    ticks: {
                        font: { size: 10 }, color: '#8fb6d8',
                        callback: v => v + '%',
                    },
                    title: { display: true, text: '累计收益 (%)', font: { size: 11 }, color: '#8fb6d8' },
                },
            },
        },
    });

    setChartInstance('benchmarkChart', chart);
}

export function destroyBenchmarkCharts() {
    if (chartInstances['benchmarkChart']) {
        try { chartInstances['benchmarkChart'].destroy(); } catch (_) {}
        delete chartInstances['benchmarkChart'];
    }
}
